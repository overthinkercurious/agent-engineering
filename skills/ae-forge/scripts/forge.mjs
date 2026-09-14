#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { candidateIdentity, isAncestor, requireGitProject } from './identity.mjs'
import { dispatchSpecialist } from './dispatch.mjs'
import { secretFindings } from './security.mjs'
import { STATES, PAUSED_STATES, canTransition, createRunState, migrateRunState, requiredArtifactsFor } from './lifecycle.mjs'
import { compilePolicy, effectivePolicyDigest, loadHostConstraints } from './policy.mjs'
import { assessRisk } from './risk.mjs'
import { assertValid, canonicalJson, ContractValidationError, formatIssues } from './validate.mjs'

const SELF = dirname(fileURLToPath(import.meta.url))
const SKILL = resolve(SELF, '..')
const REGISTRY_PATH = join(SKILL, 'references', 'registry.json')
const argv = process.argv.slice(2)
const command = argv[0] || 'help'
const AFTER_APPROVAL = new Set(['implementation', 'integration', 'audit', 'verification', 'repair', 'ready_for_pr', 'complete'])
const COUNTERS = ['calls', 'input_tokens', 'output_tokens', 'context_tokens', 'wall_time_seconds', 'repair_attempts', 'specialist_escalations']
const MAX_RECEIPT_OUTPUT_BYTES = 64 * 1024
const VERIFY_STATES = ['audit', 'verification', 'repair']

class ForgeError extends Error {
  constructor(message, code = 1, detail = {}) { super(message); this.code = code; this.detail = detail }
}

function fail(message, code = 1, detail = {}) { throw new ForgeError(message, code, detail) }
function arg(name, fallback = '') { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? fallback) : fallback }
function flag(name) { return argv.includes(name) }
function now() { return new Date().toISOString() }
function unique(values) { return [...new Set((values || []).filter(Boolean))].sort() }

function requestedRoot() {
  const path = resolve(arg('--root', process.cwd()))
  if (!existsSync(path) || !statSync(path).isDirectory()) fail('--root is not a directory', 2, { path })
  return path
}

function projectRoot({ initialized = true } = {}) {
  const requested = requestedRoot()
  let project
  try { project = requireGitProject(requested) }
  catch (error) { fail('unsupported_project_scope', 3, { requirement: 'a Git project with a valid HEAD commit', detail: error.message }) }
  if (resolve(project.root).toLowerCase() !== resolve(requested).toLowerCase()) fail('--root must identify the Git project root', 3, { requested, git_root: project.root })
  if (initialized) requireInitialized(project.root)
  return project.root
}

function json(path, schema = '') {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return schema ? assertValid(schema, value) : value
  } catch (error) {
    const detail = error instanceof ContractValidationError ? formatIssues(error.issues) : error.message
    fail('invalid or unreadable JSON', 2, { path, schema: schema || undefined, detail })
  }
}

function atomicText(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`)
  try { writeFileSync(temporary, text, 'utf8'); renameSync(temporary, path) }
  finally { if (existsSync(temporary)) unlinkSync(temporary) }
}

function writeJson(path, value, schema = '') {
  if (schema) {
    try { assertValid(schema, value) }
    catch (error) { fail('refusing to write invalid JSON', 2, { path, schema, detail: formatIssues(error.issues || []) }) }
  }
  atomicText(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sha(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }
function safeId(value) { if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(value)) fail('feature id must be 2-63 lowercase letters, digits, or hyphens', 2); return value }
function safeOperationId(value) { if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) fail('operation id contains unsupported characters', 2); return value }
function slug(value) { const s = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54); return s.length >= 2 ? s : 'work' }
function workRoot(root) { return join(root, '.dev', 'work') }

function featureDir(root, id) {
  const base = resolve(workRoot(root)); const target = resolve(base, safeId(id)); const rel = relative(base, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail('feature path escaped work root', 2)
  return target
}

function requireInitialized(root) {
  const missing = ['.dev/knowledge/00-index.md', '.dev/rules/00-index.md', '.dev/policy/authority.yml', '.dev/policy/quality-gates.yml', '.dev/policy/routing.yml', '.dev/policy/release.yml']
    .filter((path) => !existsSync(join(root, path)))
  if (missing.length) fail('project_not_initialized', 3, { prerequisite: 'ae-init', missing, action: 'Run ae-init before ae-forge.' })
}

function withLock(root, id, action) {
  const lockDir = join(workRoot(root), '.locks'); mkdirSync(lockDir, { recursive: true })
  const lockPath = join(lockDir, `${safeId(id)}.lock`); let handle
  try { handle = openSync(lockPath, 'wx'); writeFileSync(handle, `${JSON.stringify({ pid: process.pid, command, created_at: now() })}\n`, 'utf8') }
  catch { fail('conflicting_active_writer', 7, { id, lock: lockPath, action: 'Wait for the active writer or remove a confirmed stale lock.' }) }
  try { return action() }
  finally { closeSync(handle); if (existsSync(lockPath)) unlinkSync(lockPath) }
}

function loadFeature(root, id) {
  const dir = featureDir(root, id)
  if (!existsSync(dir)) fail('feature workspace not found', 2, { id })
  const manifestPath = join(dir, 'manifest.json'); const statePath = join(dir, 'state.json'); const rawManifest = json(manifestPath)
  if (rawManifest.schema !== 2) fail('legacy feature manifest requires an explicit migration', 3, { schema: rawManifest.schema })
  return { dir, manifestPath, statePath, manifest: assertValid('feature-manifest', rawManifest), state: migrateRunState(json(statePath)) }
}

function readOverrides() {
  return {
    budget_tier: arg('--budget-tier') || null, execution_tier: arg('--execution-tier') || null, model_profile: arg('--model-profile') || null,
    additional_specialists: unique(arg('--additional-specialists').split(',').map((item) => item.trim())),
    additional_lenses: unique(arg('--additional-lenses').split(',').map((item) => item.trim())),
    additional_required_commands: unique(arg('--additional-required-command') ? [arg('--additional-required-command')] : []), release_output: arg('--release-output') || null,
  }
}

function compileCurrent(root, hostConstraints, runOverrides) {
  let effective
  try { effective = compilePolicy(root, { hostConstraints, runOverrides }) }
  catch (error) { fail('policy_resolution_failed', 3, { detail: error.message }) }
  if (!effective.ready) fail('policy_unresolved', 3, { unresolved_material: effective.unresolved_material })
  return { effective, digest: effectivePolicyDigest(effective) }
}

function routeSelection(registry, kind, signals, effective, risk = null) {
  const tokens = new Set([kind, ...signals]); const specialists = []; const lenses = []
  for (const [id, spec] of Object.entries(registry.specialists)) if (spec.triggers.some((trigger) => tokens.has(trigger))) specialists.push(id)
  for (const [id, lens] of Object.entries(registry.lenses)) if (lens.triggers.some((trigger) => tokens.has(trigger))) lenses.push(id)
  specialists.push(...registry.always.plan, ...registry.always.final, ...effective.resolved.routing.required_specialists)
  lenses.push(...effective.resolved.routing.required_lenses)
  if (risk) { specialists.push(...risk.added_specialists); lenses.push(...risk.added_lenses) }
  const selected = { specialists: unique(specialists), lenses: unique(lenses) }
  for (const id of selected.specialists) if (!registry.specialists[id]) fail('policy selected an unknown specialist', 3, { id })
  for (const id of selected.lenses) if (!registry.lenses[id]) fail('policy selected an unknown lens', 3, { id })
  return selected
}

function csv(name) { return unique(arg(name).split(',').map((item) => item.trim())) }

function explicitRisk() {
  return {
    blast_radius: arg('--blast-radius') || null,
    irreversibility: arg('--irreversibility') || null,
    sensitivity: arg('--sensitivity') || null,
    uncertainty: arg('--uncertainty') || null,
    cross_system: flag('--cross-system'),
  }
}

function riskPath(feature) { return join(feature.dir, feature.manifest.risk_assessment_path) }

function loadRisk(feature) {
  const path = riskPath(feature)
  if (!existsSync(path)) fail('risk assessment is missing', 5, { path: feature.manifest.risk_assessment_path })
  if (sha(path) !== feature.manifest.risk_assessment_sha256) fail('risk assessment is stale', 5)
  return json(path, 'risk-assessment')
}

function riskEvent(options) {
  try { return assessRisk(options) }
  catch (error) { fail('risk_classification_failed', 3, { detail: error.message }) }
}

function persistRisk(feature, assessment) {
  const valid = assertValid('risk-assessment', assessment)
  const text = `${JSON.stringify(valid, null, 2)}\n`
  feature.manifest.risk_assessment_sha256 = createHash('sha256').update(text).digest('hex')
  feature.manifest.context_digests.risk_assessment = feature.manifest.risk_assessment_sha256
  assertValid('feature-manifest', feature.manifest)
  atomicText(riskPath(feature), text)
}

function testedDiagnosis(feature) {
  const dispatchRoot = join(feature.dir, 'runs', 'dispatches')
  if (!existsSync(dispatchRoot)) return null
  for (const name of readdirSync(dispatchRoot).sort().reverse()) {
    const recordPath = join(dispatchRoot, name, 'record.json'); const resultPath = join(dispatchRoot, name, 'result.json')
    if (!existsSync(recordPath) || !existsSync(resultPath)) continue
    try {
      const record = json(recordPath, 'dispatch-record'); const result = json(resultPath, 'specialist-result')
      if (record.stage === 'diagnosis' && record.specialist === 'probe' && record.validation === 'passed' && record.status === 'acknowledged'
        && record.host.fresh_context === 'available' && record.result_sha256 === sha(resultPath)
        && record.candidate_identity === candidateIdentity(feature.manifest.project_root).worktree_sha256
        && result.status === 'complete' && result.diagnosis?.established_cause) return { record, result }
    } catch { /* doctor reports malformed evidence */ }
  }
  return null
}

function authorizeDispatch(effective) {
  const tool = arg('--tool'); if (!tool) fail('--tool is required for a reserved dispatch', 2)
  const authority = effective.resolved.authority
  if (!authority.allowed_tools.includes(tool)) fail('dispatch tool is outside effective authority', 5, { tool, allowed_tools: authority.allowed_tools })
  const writePaths = unique(arg('--write').split(',').map((item) => item.trim().replaceAll('\\', '/').replace(/^\.\//, '')))
  for (const path of writePaths) {
    if (!path || path === '..' || path.startsWith('../') || isAbsolute(path)) fail('dispatch write path escapes the project root', 5, { path })
    const allowed = authority.allowed_write_roots.some((root) => root === '.' || path === root || path.startsWith(`${root}/`))
    if (!allowed) fail('dispatch write path is outside effective authority', 5, { path, allowed_write_roots: authority.allowed_write_roots })
  }
  const network = flag('--network')
  if (network && !authority.network) fail('network dispatch is outside effective authority', 5)
  return { tool, write_paths: writePaths, network }
}

function requireDispatchable(root, feature) {
  if (PAUSED_STATES.includes(feature.state.status) || ['complete', 'cancelled'].includes(feature.state.status)) fail('run state does not permit a new dispatch', 4, { status: feature.state.status })
  if (AFTER_APPROVAL.has(feature.state.status) || feature.state.status === 'approved') { const approval = approvalCheck(root, feature); if (!approval.valid) fail('approval is invalid', 5, approval) }
}

function policyFresh(root, feature) {
  const current = compileCurrent(root, feature.manifest.host_constraints, feature.manifest.run_overrides)
  if (current.digest !== feature.manifest.policy_digest) fail('stale_effective_policy', 5, { approved_digest: feature.manifest.policy_digest, current_digest: current.digest, action: 'Start a new run or refresh before approval.' })
  return current
}

function approvalCheck(root, feature) {
  const path = join(feature.dir, 'approval.json')
  if (!existsSync(path)) return { valid: false, reason: 'approval.json is missing' }
  let receipt
  try { receipt = assertValid('approval-receipt', JSON.parse(readFileSync(path, 'utf8'))) }
  catch (error) { return { valid: false, reason: `approval receipt is invalid: ${formatIssues(error.issues || [])}` } }
  if (receipt.run_id !== feature.manifest.run_id || receipt.feature_id !== feature.manifest.feature_id) return { valid: false, reason: 'approval belongs to another run' }
  if (receipt.base_commit !== feature.manifest.base_commit) return { valid: false, reason: 'base commit changed' }
  if (!isAncestor(root, receipt.base_commit, 'HEAD')) return { valid: false, reason: 'approved base is not an ancestor of current HEAD' }
  if (receipt.policy_digest !== feature.manifest.policy_digest) return { valid: false, reason: 'approval policy digest differs from manifest' }
  try { policyFresh(root, feature) } catch (error) { return { valid: false, reason: error.message, detail: error.detail } }
  for (const item of receipt.artifacts) {
    const path = join(feature.dir, item.path)
    if (!existsSync(path)) return { valid: false, reason: `${item.path} is missing` }
    if (sha(path) !== item.sha256) return { valid: false, reason: `${item.path} changed after approval` }
  }
  return { valid: true, receipt }
}

function requireArtifacts(dir, state) {
  const missing = requiredArtifactsFor(state).filter((path) => !existsSync(join(dir, path)))
  if (missing.length) fail('required artifacts are missing', 4, { state, missing })
}

function receiptFiles(dir) {
  const root = join(dir, 'evidence'); if (!existsSync(root)) return []
  const result = []; const visit = (path) => { for (const entry of readdirSync(path, { withFileTypes: true })) { const child = join(path, entry.name); if (entry.isDirectory()) visit(child); else if (entry.name.endsWith('.json')) result.push(child) } }
  visit(root); return result
}

function requireCandidateEvidence(root, feature, candidate) {
  const receipts = []
  for (const path of receiptFiles(feature.dir)) { try { receipts.push(assertValid('command-receipt', JSON.parse(readFileSync(path, 'utf8')))) } catch { /* non-command evidence */ } }
  const missing = feature.manifest.required_commands.filter((required) => !receipts.some((item) => [item.invocation, ...item.args].join(' ').trim() === required && item.exit_code === 0 && item.candidate_identity === candidate.worktree_sha256))
  if (missing.length) fail('candidate evidence is missing or stale', 5, { candidate, missing_commands: missing })
}

function collectDispatches(feature) {
  const dispatchRoot = join(feature.dir, 'runs', 'dispatches'); if (!existsSync(dispatchRoot)) return []
  const out = []
  for (const name of readdirSync(dispatchRoot)) {
    const dir = join(dispatchRoot, name); if (!statSync(dir).isDirectory()) continue
    const recordPath = join(dir, 'record.json'); if (!existsSync(recordPath)) continue
    try {
      const record = assertValid('dispatch-record', JSON.parse(readFileSync(recordPath, 'utf8')))
      const packetPath = join(dir, 'packet.json'); const resultPath = join(dir, 'result.json')
      const packet = existsSync(packetPath) ? assertValid('context-packet', JSON.parse(readFileSync(packetPath, 'utf8'))) : null
      const result = existsSync(resultPath) ? assertValid('specialist-result', JSON.parse(readFileSync(resultPath, 'utf8'))) : null
      out.push({ record, packet, result })
    } catch { /* doctor reports malformed dispatch evidence separately */ }
  }
  return out
}

function requireReleaseGate(feature, candidate) {
  const requires = feature.manifest.release_requires
  const dispatches = collectDispatches(feature)
  const onCandidate = (d) => d.record.candidate_identity === candidate.worktree_sha256 && d.record.validation === 'passed'
  if (requires.includes('independent_release_audit')) {
    const judge = dispatches.find((d) => d.record.specialist === 'judge' && d.record.stage === 'verification' && onCandidate(d) && d.result?.status === 'complete' && d.record.host?.isolation !== 'shared_context')
    if (!judge) fail('ready_for_pr requires an independent Judge verification dispatch on the current candidate', 5)
  }
  if (requires.includes('acceptance_evidence')) {
    const implementationAcceptance = unique(dispatches.filter((d) => onCandidate(d) && d.record.stage === 'implementation' && d.packet).flatMap((d) => d.packet.acceptance_ids))
    const judge = dispatches.find((d) => d.record.specialist === 'judge' && d.record.stage === 'verification' && onCandidate(d) && d.packet)
    const judgeAcceptance = new Set(judge ? judge.packet.acceptance_ids : [])
    const uncovered = implementationAcceptance.filter((acceptanceId) => !judgeAcceptance.has(acceptanceId))
    if (!judge || uncovered.length) fail('ready_for_pr requires Judge verification to cover every implemented acceptance id', 5, { uncovered })
  }
  if (requires.includes('residual_risks_recorded') && feature.state.open_findings.length) {
    const auditPath = join(feature.dir, 'reviews', 'release-audit.md')
    const text = existsSync(auditPath) ? readFileSync(auditPath, 'utf8') : ''
    const missing = feature.state.open_findings.filter((findingId) => !text.includes(findingId))
    if (missing.length) fail('ready_for_pr requires every open finding to be recorded in the release audit', 5, { missing })
  }
}

function persistState(feature) { feature.state.updated_at = now(); writeJson(feature.statePath, feature.state, 'run-state') }

function transition(root, feature, to, options = {}) {
  const from = feature.state.status
  if (!STATES.includes(to)) fail('unknown state', 2, { to })
  const transitionOptions = options.operation === 'approve' ? { operation: 'approve' } : options.resume ? { resumeTo: to, recordedPriorState: feature.state.pause?.prior_state } : {}
  if (!canTransition(from, to, transitionOptions)) fail('illegal state transition', 4, { from, to })
  if (!PAUSED_STATES.includes(to) && to !== 'cancelled') requireArtifacts(feature.dir, to)
  if (to === 'definition' && feature.manifest.diagnosis_required && !testedDiagnosis(feature)) fail('tested diagnosis is required before corrective definition', 5, { required_specialist: 'probe', required_stage: 'diagnosis' })
  if (AFTER_APPROVAL.has(to) && to !== 'approved') { const approval = approvalCheck(root, feature); if (!approval.valid) fail('approval is invalid', 5, approval) }
  let candidate = null
  if (AFTER_APPROVAL.has(to)) candidate = candidateIdentity(root)
  if (to === 'repair') {
    const findings = unique(options.findings || [])
    if (!findings.length || findings.some((id) => !/^finding:[a-f0-9]{16}$/.test(id))) fail('repair requires canonical finding ids', 4)
    const next = feature.state.budget.consumed.repair_attempts + 1
    if (next > feature.state.budget.limits.repair_attempts) fail('repair budget exhausted', 6, { limit: feature.state.budget.limits.repair_attempts })
    feature.state.budget.consumed.repair_attempts = next
    feature.state.repair_cycle = { attempt: next, finding_ids: findings, implementation_complete: false, reaudit_complete: false, retest_complete: false }
  }
  if (from === 'repair' && to === 'implementation') {
    const repairPath = `implementation/repair-${feature.state.repair_cycle?.attempt}.md`
    if (!feature.state.repair_cycle || !existsSync(join(feature.dir, repairPath))) fail('repair artifact is missing', 4, { missing: [repairPath] })
  }
  if (feature.state.repair_cycle) {
    if (from === 'implementation' && to === 'integration') feature.state.repair_cycle.implementation_complete = true
    if (from === 'audit' && to === 'verification') feature.state.repair_cycle.reaudit_complete = true
    if (from === 'verification' && to === 'ready_for_pr') feature.state.repair_cycle.retest_complete = true
  }
  if (to === 'ready_for_pr') {
    requireCandidateEvidence(root, feature, candidate)
    requireReleaseGate(feature, candidate)
    const cycle = feature.state.repair_cycle
    if (cycle && !(cycle.implementation_complete && cycle.reaudit_complete && cycle.retest_complete)) fail('repair cycle has not completed implementation, re-audit, and re-test', 5, { repair_cycle: cycle })
  }
  if (PAUSED_STATES.includes(to)) {
    feature.state.pause = { prior_state: from, reason_code: options.reason || 'unspecified', resume_action: options.resumeAction || 'resume after resolving the recorded cause', attempt: (feature.state.pause?.attempt || 0) + 1, policy_digest: feature.manifest.policy_digest, candidate_digest: feature.state.candidate?.worktree_sha256 || null }
  } else if (options.resume) feature.state.pause = null
  else if (to !== 'cancelled') feature.state.pause = null
  if (to === 'cancelled' && !feature.state.pause) feature.state.pause = { prior_state: from, reason_code: options.reason || 'cancelled_by_user', resume_action: 'Start a new run; cancellation is terminal.', attempt: 1, policy_digest: feature.manifest.policy_digest, candidate_digest: feature.state.candidate?.worktree_sha256 || null }
  feature.state.completed = unique([...feature.state.completed, from]); feature.state.status = to
  if (candidate) feature.state.candidate = candidate
  persistState(feature); return { from, to, candidate }
}

function help() {
  process.stdout.write(`ae-forge runner\n\n  start --title TEXT --kind KIND [--signals a,b] [--id ID] [risk and policy overrides] [--root DIR]\n  list | status --id ID | route --id ID --signals a,b\n  reclassify --id ID [--signals a,b] [risk inputs]\n  advance --id ID --to STATE [--findings finding:...]\n  approve --id ID [--approved-by NAME] | check --id ID | doctor --id ID\n  dispatch --id ID --dispatch-id ID --specialist ID --stage STAGE --host-config PATH [bounded brief fields]\n  verify --id ID --receipt-id ID --command "declared quality command"\n  reserve --id ID --operation-id ID --operation-kind KIND [budget estimates]\n  reconcile --id ID --operation-id ID [actual usage]\n  pause --id ID --to blocked|halted|awaiting_specialist --reason CODE --resume-action TEXT\n  resume --id ID | cancel --id ID [--reason CODE]\n`)
}

function start() {
  const root = projectRoot(); const title = arg('--title').trim(); const kind = arg('--kind').trim(); const kinds = ['idea', 'feature', 'bug', 'refactor', 'performance', 'security', 'audit']
  if (!title) fail('--title is required', 2); if (!kinds.includes(kind)) fail(`--kind must be one of: ${kinds.join(', ')}`, 2)
  const signals = unique(arg('--signals').split(',').map((item) => item.trim())); const registry = json(REGISTRY_PATH, 'registry')
  const host = loadHostConstraints(arg('--host-constraints') || undefined); const overrides = readOverrides(); const { effective, digest } = compileCurrent(root, host, overrides)
  let id = arg('--id') ? safeId(arg('--id')) : slug(title); let dir = featureDir(root, id)
  if (existsSync(dir) && !arg('--id')) { let n = 2; while (existsSync(featureDir(root, `${id}-${n}`))) n++; id = `${id}-${n}`; dir = featureDir(root, id) }
  return withLock(root, id, () => {
    if (existsSync(dir)) fail('feature workspace already exists', 2, { id })
    const risk = riskEvent({ kind, signals, affectedBehaviors: csv('--affected-behaviors'), interfaces: csv('--interfaces'), explicit: explicitRisk(), policyFloor: effective.resolved.routing.execution_tier, source: 'intake' })
    risk.sequence = 1
    const selected = routeSelection(registry, kind, signals, effective, risk); const createdAt = now(); const { commit } = requireGitProject(root)
    for (const name of ['context', 'evidence', 'discovery', 'design', 'plan', 'implementation', 'reviews', 'verification', 'runs/operations']) mkdirSync(join(dir, name), { recursive: true })
    const assessment = { schema: 1, run_id: id, current: risk, history: [risk] }
    writeJson(join(dir, 'context', 'risk-assessment.json'), assessment, 'risk-assessment')
    const riskSha = sha(join(dir, 'context', 'risk-assessment.json'))
    const manifest = {
      schema: 2, contract_version: 1, run_id: id, feature_id: id, supersedes_run_id: arg('--supersedes') || null, title, kind, signals, created_at: createdAt, project_root: root, base_commit: commit,
      host_constraints: host, run_overrides: overrides, policy_digest: digest, policy_source_digests: effective.source_digests, context_digests: { ...effective.context_digests, risk_assessment: riskSha }, policy_reasons: effective.reasons,
      execution_tier: risk.effective_tier, budget_tier: effective.resolved.routing.budget_tier, model_profile: effective.resolved.routing.model_profile,
      diagnosis_required: risk.diagnosis_required, risk_assessment_path: 'context/risk-assessment.json', risk_assessment_sha256: riskSha,
      release_output: effective.resolved.release.output, required_commands: effective.resolved.quality.required_commands,
      required_evidence: effective.resolved.quality.required_evidence, release_requires: effective.resolved.release.requires,
      selected_specialists: selected.specialists, selected_lenses: selected.lenses,
    }
    if (manifest.supersedes_run_id) { const prior = loadFeature(root, manifest.supersedes_run_id); if (prior.state.status !== 'cancelled') fail('a superseded run must be cancelled', 4, { supersedes_run_id: manifest.supersedes_run_id, status: prior.state.status }) }
    writeJson(join(dir, 'manifest.json'), manifest, 'feature-manifest'); writeJson(join(dir, 'state.json'), createRunState(id, createdAt, manifest.budget_tier), 'run-state')
    writeJson(join(dir, 'context', 'effective-policy.json'), effective, 'effective-policy')
    atomicText(join(dir, 'intent.md'), `# Intent: ${title}\n\n## Actor and situation\n\nTODO\n\n## Desired outcome\n\nTODO\n\n## Observable success\n\nTODO\n\n## Constraints and non-goals\n\nTODO\n\n## Evidence, assumptions, and unknowns\n\nTODO\n`)
    atomicText(join(dir, 'decisions.md'), `# Decisions: ${title}\n\n`)
    process.stdout.write(`${JSON.stringify({ ok: true, id, workspace: dir, routing: selected, risk, policy: { digest, reasons: effective.reasons, resolved: effective.resolved } }, null, 2)}\n`)
  })
}

function listRuns() {
  const root = projectRoot(); const wr = workRoot(root); if (!existsSync(wr)) return process.stdout.write('[]\n'); const items = []
  for (const name of readdirSync(wr).sort()) {
    if (name === '.locks') continue
    const statePath = join(wr, name, 'state.json'); const manifestPath = join(wr, name, 'manifest.json'); if (!existsSync(statePath) || !existsSync(manifestPath)) continue
    try { const state = migrateRunState(json(statePath)); const manifest = json(manifestPath, 'feature-manifest'); items.push({ id: name, title: manifest.title, kind: manifest.kind, status: state.status, updated_at: state.updated_at }) } catch { /* check reports malformed runs */ }
  }
  process.stdout.write(`${JSON.stringify(items, null, 2)}\n`)
}

function status() { const root = projectRoot(); const feature = loadFeature(root, arg('--id')); process.stdout.write(`${JSON.stringify({ manifest: feature.manifest, state: feature.state, approval: approvalCheck(root, feature) }, null, 2)}\n`) }

function route() {
  const root = projectRoot(); const id = arg('--id'); return withLock(root, id, () => {
    const feature = loadFeature(root, id); if (AFTER_APPROVAL.has(feature.state.status) || feature.state.status === 'approved') fail('routing cannot change after approval; start a new run', 5)
    const { effective } = policyFresh(root, feature); const assessment = loadRisk(feature)
    feature.manifest.signals = unique([...feature.manifest.signals, ...csv('--signals')])
    const next = riskEvent({ kind: feature.manifest.kind, signals: feature.manifest.signals, affectedBehaviors: csv('--affected-behaviors'), interfaces: csv('--interfaces'), explicit: explicitRisk(), policyFloor: effective.resolved.routing.execution_tier, previousTier: assessment.current.effective_tier, source: 'signal_update' })
    next.sequence = assessment.history.length + 1; assessment.current = next; assessment.history.push(next)
    const selected = routeSelection(json(REGISTRY_PATH, 'registry'), feature.manifest.kind, feature.manifest.signals, effective, next)
    feature.manifest.execution_tier = next.effective_tier; feature.manifest.diagnosis_required ||= next.diagnosis_required
    feature.manifest.selected_specialists = unique([...feature.manifest.selected_specialists, ...selected.specialists]); feature.manifest.selected_lenses = unique([...feature.manifest.selected_lenses, ...selected.lenses])
    persistRisk(feature, assessment); writeJson(feature.manifestPath, feature.manifest, 'feature-manifest')
    process.stdout.write(`${JSON.stringify({ ok: true, id, routing: { specialists: feature.manifest.selected_specialists, lenses: feature.manifest.selected_lenses }, risk: next }, null, 2)}\n`)
  })
}

function reclassify() {
  const root = projectRoot(); const id = arg('--id'); return withLock(root, id, () => {
    const feature = loadFeature(root, id); const allowed = ['implementation', 'integration', 'audit', 'verification', 'repair', 'ready_for_pr']
    if (!allowed.includes(feature.state.status)) fail('completed-diff reclassification is not available in the current state', 4, { status: feature.state.status })
    const { effective } = policyFresh(root, feature); const assessment = loadRisk(feature); const candidate = candidateIdentity(root)
    let diffText; let diffPaths
    try {
      diffText = execFileSync('git', ['diff', '--no-ext-diff', '--unified=0', feature.manifest.base_commit, '--'], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
      diffPaths = execFileSync('git', ['diff', '--no-ext-diff', '--name-only', feature.manifest.base_commit, '--'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 }).split(/\r?\n/).filter(Boolean)
    } catch (error) { fail('completed diff could not be inspected', 5, { detail: error.message }) }
    feature.manifest.signals = unique([...feature.manifest.signals, ...csv('--signals')])
    const next = riskEvent({ kind: feature.manifest.kind, signals: feature.manifest.signals, affectedBehaviors: csv('--affected-behaviors'), interfaces: csv('--interfaces'), explicit: explicitRisk(), policyFloor: effective.resolved.routing.execution_tier, previousTier: assessment.current.effective_tier, source: 'completed_diff', candidateIdentity: candidate.worktree_sha256, diffText, diffPaths, diffSha256: createHash('sha256').update(diffText).digest('hex') })
    next.sequence = assessment.history.length + 1; assessment.current = next; assessment.history.push(next)
    const selected = routeSelection(json(REGISTRY_PATH, 'registry'), feature.manifest.kind, feature.manifest.signals, effective, next)
    feature.manifest.execution_tier = next.effective_tier; feature.manifest.diagnosis_required ||= next.diagnosis_required
    feature.manifest.selected_specialists = unique([...feature.manifest.selected_specialists, ...selected.specialists]); feature.manifest.selected_lenses = unique([...feature.manifest.selected_lenses, ...selected.lenses])
    persistRisk(feature, assessment); writeJson(feature.manifestPath, feature.manifest, 'feature-manifest'); feature.state.candidate = candidate; persistState(feature)
    process.stdout.write(`${JSON.stringify({ ok: true, id, risk: next, routing: { specialists: feature.manifest.selected_specialists, lenses: feature.manifest.selected_lenses } }, null, 2)}\n`)
  })
}

function advance() {
  const root = projectRoot(); const id = arg('--id'); return withLock(root, id, () => {
    const feature = loadFeature(root, id); policyFresh(root, feature); const findings = unique(arg('--findings').split(',').map((item) => item.trim()))
    const result = transition(root, feature, arg('--to'), { findings }); process.stdout.write(`${JSON.stringify({ ok: true, id, status: result.to, candidate: result.candidate }, null, 2)}\n`)
  })
}

function approve() {
  const root = projectRoot(); const id = arg('--id'); return withLock(root, id, () => {
    const feature = loadFeature(root, id); policyFresh(root, feature); if (feature.state.status !== 'awaiting_approval') fail('feature is not awaiting approval', 4, { status: feature.state.status })
    const files = ['intent.md', 'design/definition.md', 'plan/implementation.md', 'reviews/plan-review.md']; const missing = files.filter((path) => !existsSync(join(feature.dir, path)))
    if (missing.length) fail('cannot approve without authoritative artifacts', 4, { missing }); const unfinished = files.filter((path) => /\bTODO\b/.test(readFileSync(join(feature.dir, path), 'utf8')))
    if (unfinished.length) fail('cannot approve unfinished authoritative artifacts', 4, { unfinished }); const approvedAt = now()
    const receipt = { schema: 2, contract_version: 1, run_id: feature.manifest.run_id, feature_id: id, approved_at: approvedAt, approved_by: arg('--approved-by', 'user'), authority_event: 'explicit_user_approval', base_commit: feature.manifest.base_commit, policy_digest: feature.manifest.policy_digest, artifacts: files.map((path) => ({ path, sha256: sha(join(feature.dir, path)) })) }
    assertValid('approval-receipt', receipt); writeJson(join(feature.dir, 'approval.json'), receipt, 'approval-receipt'); transition(root, feature, 'approved', { operation: 'approve' })
    process.stdout.write(`${JSON.stringify({ ok: true, id, status: 'approved', receipt }, null, 2)}\n`)
  })
}

function counterArgs({ actual = false } = {}) {
  const values = {}
  for (const key of COUNTERS) { const cli = `--${key.replaceAll('_', '-')}`; const raw = arg(cli); values[key] = actual && (key === 'input_tokens' || key === 'output_tokens') && raw === '' ? null : Number(raw || (key === 'calls' ? 1 : 0)); if (values[key] !== null && (!Number.isSafeInteger(values[key]) || values[key] < 0)) fail(`${cli} must be a non-negative integer`, 2) }
  return values
}

function operationPath(feature, operationId) { return join(feature.dir, 'runs', 'operations', `${safeOperationId(operationId)}.json`) }
function totalsFit(budget, addition) { return COUNTERS.every((key) => budget.consumed[key] + budget.reserved[key] + addition[key] <= budget.limits[key]) }

function reserve() {
  const root = projectRoot(); const id = arg('--id'); const operationId = safeOperationId(arg('--operation-id')); const kind = arg('--operation-kind'); if (!operationId || !kind) fail('--operation-id and --operation-kind are required', 2)
  return withLock(root, id, () => {
    const feature = loadFeature(root, id); const { effective } = policyFresh(root, feature); requireDispatchable(root, feature); const authority = authorizeDispatch(effective); const path = operationPath(feature, operationId); const reservation = counterArgs()
    if (existsSync(path)) { const existing = json(path, 'operation-receipt'); if (existing.kind !== kind || canonicalJson(existing.reservation) !== canonicalJson(reservation) || canonicalJson(existing.authority) !== canonicalJson(authority)) fail('operation id was already used with different inputs', 7, { operation_id: operationId }); return process.stdout.write(`${JSON.stringify({ ok: true, idempotent: true, operation: existing }, null, 2)}\n`) }
    if (!totalsFit(feature.state.budget, reservation)) { transition(root, feature, 'halted', { reason: 'budget_exhausted', resumeAction: 'Start a new run with explicitly approved scope or budget.' }); fail('budget reservation exceeds run limits', 6, { limits: feature.state.budget.limits, requested: reservation }) }
    for (const key of COUNTERS) feature.state.budget.reserved[key] += reservation[key]; feature.state.operation = { id: operationId, kind, attempt: 1, status: 'reserved' }
    const createdAt = now(); const receipt = { schema: 1, operation_id: operationId, kind, feature_id: id, status: 'reserved', created_at: createdAt, updated_at: createdAt, authority, reservation, actual: null, telemetry: 'unavailable' }
    writeJson(path, receipt, 'operation-receipt'); persistState(feature); process.stdout.write(`${JSON.stringify({ ok: true, operation: receipt, budget: feature.state.budget }, null, 2)}\n`)
  })
}

function reconcile() {
  const root = projectRoot(); const id = arg('--id'); const operationId = safeOperationId(arg('--operation-id')); if (!operationId) fail('--operation-id is required', 2)
  return withLock(root, id, () => {
    const feature = loadFeature(root, id); const path = operationPath(feature, operationId); if (!existsSync(path)) fail('operation reservation not found', 4, { operation_id: operationId })
    const receipt = json(path, 'operation-receipt'); if (receipt.status === 'acknowledged') return process.stdout.write(`${JSON.stringify({ ok: true, idempotent: true, operation: receipt }, null, 2)}\n`); if (receipt.status !== 'reserved') fail('operation cannot be reconciled from its current status', 4, { status: receipt.status })
    const actual = counterArgs({ actual: true }); const missingTokens = actual.input_tokens === null || actual.output_tokens === null; const enforced = { ...actual, input_tokens: actual.input_tokens ?? receipt.reservation.input_tokens, output_tokens: actual.output_tokens ?? receipt.reservation.output_tokens }
    for (const key of COUNTERS) { feature.state.budget.reserved[key] -= receipt.reservation[key]; feature.state.budget.consumed[key] += enforced[key] }
    feature.state.usage.calls += enforced.calls; feature.state.usage.wall_time_ms += enforced.wall_time_seconds * 1000
    for (const counter of ['input_tokens', 'output_tokens']) { const prior = feature.state.usage[counter].value || 0; feature.state.usage[counter] = { value: prior + enforced[counter], provenance: actual[counter] === null ? 'estimated' : 'measured' } }
    feature.state.operation = { id: operationId, kind: receipt.kind, attempt: 1, status: 'acknowledged' }; receipt.status = 'acknowledged'; receipt.updated_at = now(); receipt.actual = actual; receipt.telemetry = missingTokens ? 'unavailable' : 'measured'
    writeJson(path, receipt, 'operation-receipt')
    const over = COUNTERS.filter((key) => feature.state.budget.consumed[key] > feature.state.budget.limits[key])
    if (over.length) {
      if (!PAUSED_STATES.includes(feature.state.status) && !['complete', 'cancelled'].includes(feature.state.status)) transition(root, feature, 'halted', { reason: 'actual_usage_exceeded_budget', resumeAction: 'Start a new run with explicitly approved scope or budget.' })
      else persistState(feature)
      fail('actual usage exceeded run limits', 6, { exceeded: over, budget: feature.state.budget })
    }
    persistState(feature); process.stdout.write(`${JSON.stringify({ ok: true, operation: receipt, budget: feature.state.budget, usage: feature.state.usage }, null, 2)}\n`)
  })
}

function verify() {
  const root = projectRoot(); const id = arg('--id'); const receiptId = arg('--receipt-id'); const commandText = arg('--command')
  if (!/^[a-z0-9-]{1,120}$/.test(receiptId)) fail('--receipt-id must be lowercase letters, digits, or hyphens', 2)
  if (!commandText) fail('--command is required', 2)
  return withLock(root, id, () => {
    const feature = loadFeature(root, id); const { effective } = policyFresh(root, feature)
    if (!effective.resolved.authority.allowed_tools.includes('command')) fail('effective authority does not permit host execution', 5)
    if (!feature.manifest.required_commands.includes(commandText)) fail('command is not declared in effective quality policy', 5, { command: commandText, required_commands: feature.manifest.required_commands })
    if (!VERIFY_STATES.includes(feature.state.status)) fail('verification commands run only during audit, verification, or repair', 4, { status: feature.state.status })
    const receiptPath = join(feature.dir, 'evidence', 'receipts', `${receiptId}.json`)
    if (existsSync(receiptPath)) {
      const existing = json(receiptPath, 'command-receipt')
      if ([existing.invocation, ...existing.args].join(' ').trim() !== commandText) fail('receipt id was already used for a different command', 7, { receipt_id: receiptId })
      return process.stdout.write(`${JSON.stringify({ ok: true, id, idempotent: true, receipt: existing }, null, 2)}\n`)
    }
    const parts = commandText.trim().split(/\s+/); const invocation = parts[0]; const args = parts.slice(1)
    const candidate = candidateIdentity(root)
    const startedAt = now(); const started = Date.now(); let exitCode = 0; let output = ''
    try {
      output = execFileSync(invocation, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_RECEIPT_OUTPUT_BYTES + 1, timeout: Number(arg('--timeout-ms', '120000')), killSignal: 'SIGTERM' })
    } catch (error) {
      exitCode = typeof error.status === 'number' ? error.status : 1
      output = `${error.stdout || ''}${error.stderr || ''}`
    }
    const finishedAt = now()
    if (Buffer.byteLength(output) > MAX_RECEIPT_OUTPUT_BYTES) fail('verification output exceeds the evidence limit', 6, { max_bytes: MAX_RECEIPT_OUTPUT_BYTES })
    // Only the digest and length are persisted; the receipt never stores raw command output.
    const receipt = {
      schema: 1, receipt_id: `receipt:${receiptId}`, run_id: feature.manifest.run_id, invocation, args, cwd: '.',
      started_at: startedAt, finished_at: finishedAt, exit_code: exitCode,
      output_sha256: createHash('sha256').update(output).digest('hex'), output_bytes: Buffer.byteLength(output),
      candidate_identity: candidate.worktree_sha256, evidence_class: 'MEASURED', issuer: 'forge',
    }
    writeJson(receiptPath, receipt, 'command-receipt')
    process.stdout.write(`${JSON.stringify({ ok: true, id, idempotent: false, receipt }, null, 2)}\n`)
  })
}

function dispatch() {
  const root = projectRoot(); const id = arg('--id'); const dispatchId = safeOperationId(arg('--dispatch-id')); const specialist = arg('--specialist'); const stage = arg('--stage')
  if (!dispatchId || !specialist || !stage || !arg('--host-config')) fail('--dispatch-id, --specialist, --stage, and --host-config are required', 2)
  return withLock(root, id, () => {
    const feature = loadFeature(root, id); const { effective } = policyFresh(root, feature)
    const repeated = existsSync(join(feature.dir, 'runs', 'dispatches', dispatchId, 'record.json'))
    if (!repeated) requireDispatchable(root, feature)
    const list = (name) => unique(arg(name).split(',').map((item) => item.trim()))
    const params = {
      specialist, stage, dispatchId, parentDispatchId: arg('--parent-dispatch'), hostPath: arg('--host-config'), reason: arg('--reason', `stage:${stage}`), request: arg('--request'),
      retryOf: arg('--retry-of'), modelEscalationReason: arg('--model-escalation-reason'),
      acceptanceIds: list('--acceptance'), inputs: list('--inputs'), allowedTools: list('--tools'), allowedWrites: list('--write'),
      invariants: list('--invariants'), procedure: list('--procedure'), nextCheck: arg('--next-check'), independent: flag('--independent'),
      reservation: counterArgs(), skillRoot: SKILL,
    }
    if (!params.request || !params.acceptanceIds.length || !params.inputs.length || !params.invariants.length || !params.procedure.length || !params.nextCheck) fail('dispatch requires a request, acceptance ids, inputs, invariants, procedure, and next check', 2)
    const result = dispatchSpecialist({
      root, feature, effective, registry: json(REGISTRY_PATH, 'registry'), params, writeJson, persistState,
      transition: (to, options) => transition(root, feature, to, options),
    })
    process.stdout.write(`${JSON.stringify({ ok: true, id, ...result }, null, 2)}\n`)
  })
}

function pause() {
  const root = projectRoot(); const id = arg('--id'); const to = arg('--to'); if (!PAUSED_STATES.includes(to)) fail('--to must be awaiting_specialist, blocked, or halted', 2)
  return withLock(root, id, () => { const feature = loadFeature(root, id); policyFresh(root, feature); transition(root, feature, to, { reason: arg('--reason'), resumeAction: arg('--resume-action') }); process.stdout.write(`${JSON.stringify({ ok: true, id, status: to, pause: feature.state.pause }, null, 2)}\n`) })
}

function resume() {
  const root = projectRoot(); const id = arg('--id'); return withLock(root, id, () => {
    const feature = loadFeature(root, id); policyFresh(root, feature); if (!PAUSED_STATES.includes(feature.state.status) || !feature.state.pause) fail('run is not resumable', 4, { status: feature.state.status })
    const target = feature.state.pause.prior_state; requireArtifacts(feature.dir, target); if (AFTER_APPROVAL.has(target) || target === 'approved') { const approval = approvalCheck(root, feature); if (!approval.valid) fail('approval is invalid', 5, approval) }
    const pending = feature.state.operation?.status === 'reserved' ? feature.state.operation : null; transition(root, feature, target, { resume: true }); process.stdout.write(`${JSON.stringify({ ok: true, id, status: target, pending_operation: pending, repeated_external_side_effect: false }, null, 2)}\n`)
  })
}

function cancel() { const root = projectRoot(); const id = arg('--id'); return withLock(root, id, () => { const feature = loadFeature(root, id); transition(root, feature, 'cancelled', { reason: arg('--reason', 'cancelled_by_user') }); process.stdout.write(`${JSON.stringify({ ok: true, id, status: 'cancelled', reason: feature.state.pause?.reason_code }, null, 2)}\n`) }) }

function checkRun() {
  const root = projectRoot(); const feature = loadFeature(root, arg('--id')); const registry = json(REGISTRY_PATH, 'registry'); const errors = []
  if (feature.manifest.feature_id !== feature.state.feature_id) errors.push('manifest/state feature id mismatch'); for (const id of feature.manifest.selected_specialists) if (!registry.specialists[id]) errors.push(`unknown specialist: ${id}`); for (const id of feature.manifest.selected_lenses) if (!registry.lenses[id]) errors.push(`unknown lens: ${id}`)
  try { const risk = loadRisk(feature); if (risk.current.effective_tier !== feature.manifest.execution_tier || risk.current.diagnosis_required !== feature.manifest.diagnosis_required) errors.push('manifest risk resolution differs from the recorded assessment') } catch (error) { errors.push(error.message) }
  try { policyFresh(root, feature) } catch (error) { errors.push(error.message) }; if (AFTER_APPROVAL.has(feature.state.status) || feature.state.status === 'approved') { const approval = approvalCheck(root, feature); if (!approval.valid) errors.push(approval.reason) }
  if (feature.state.candidate && canonicalJson(feature.state.candidate) !== canonicalJson(candidateIdentity(root))) errors.push('recorded candidate is stale')
  const result = { ok: !errors.length, id: feature.manifest.feature_id, status: feature.state.status, errors }; process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (errors.length) process.exitCode = 1
}

function doctorRun() {
  const root = projectRoot(); const feature = loadFeature(root, arg('--id')); const registry = json(REGISTRY_PATH, 'registry'); const errors = []; const warnings = []; let dispatches = 0
  const currentCandidate = candidateIdentity(root)
  if (feature.manifest.feature_id !== feature.state.feature_id) errors.push('manifest/state feature id mismatch')
  for (const id of feature.manifest.selected_specialists) if (!registry.specialists[id]) errors.push(`unknown specialist: ${id}`)
  for (const id of feature.manifest.selected_lenses) if (!registry.lenses[id]) errors.push(`unknown lens: ${id}`)
  try { const risk = loadRisk(feature); if (risk.current.effective_tier !== feature.manifest.execution_tier || risk.current.diagnosis_required !== feature.manifest.diagnosis_required) errors.push('manifest risk resolution differs from the recorded assessment') } catch (error) { errors.push(error.message) }
  if (AFTER_APPROVAL.has(feature.state.status) || feature.state.status === 'approved') { const approval = approvalCheck(root, feature); if (!approval.valid) errors.push(approval.reason) }
  if (feature.state.candidate && canonicalJson(feature.state.candidate) !== canonicalJson(currentCandidate)) errors.push('recorded candidate is stale')
  const dispatchRoot = join(feature.dir, 'runs', 'dispatches')
  if (existsSync(dispatchRoot)) {
    for (const name of readdirSync(dispatchRoot).sort()) {
      const dir = join(dispatchRoot, name); if (!statSync(dir).isDirectory()) continue
      const recordPath = join(dir, 'record.json'); if (!existsSync(recordPath)) { errors.push(`dispatch ${name} has no record.json`); continue }
      dispatches++
      try {
        const record = json(recordPath, 'dispatch-record'); const packetPath = join(dir, 'packet.json'); const briefPath = join(dir, 'brief.json')
        if (!existsSync(packetPath) || !existsSync(briefPath)) errors.push(`dispatch ${name} is missing its packet or brief`)
        else {
          const packet = json(packetPath, 'context-packet'); const brief = json(briefPath, 'bounded-task-brief')
          if (sha(packetPath) !== record.packet_sha256) errors.push(`dispatch ${name} packet digest mismatch`)
          if (sha(briefPath) !== record.brief_sha256) errors.push(`dispatch ${name} brief digest mismatch`)
          if (packet.dependency_key !== record.dependency_key) errors.push(`dispatch ${name} dependency key mismatch`)
          if (packet.dispatch_id !== record.dispatch_id || packet.run_id !== record.run_id || packet.specialist !== record.specialist || packet.stage !== record.stage) errors.push(`dispatch ${name} packet binding mismatch`)
          if (brief.packet_id !== packet.packet_id || brief.brief_id !== packet.brief_id) errors.push(`dispatch ${name} brief binding mismatch`)
          if (canonicalJson(packet.routing_chain || [packet.specialist]) !== canonicalJson(record.routing_chain)) errors.push(`dispatch ${name} routing chain mismatch`)
          if (record.routing_chain.at(-1) !== record.specialist) errors.push(`dispatch ${name} routing chain has the wrong terminal specialist`)
          if (canonicalJson(packet.budget) !== canonicalJson(record.budget_impact.reservation)) errors.push(`dispatch ${name} budget reservation mismatch`)
          if (record.candidate_identity !== currentCandidate.worktree_sha256) errors.push(`dispatch ${name} candidate evidence is stale`)
          for (const [label, sourcePath, expected] of [['workflow', packet.workflow_path, packet.workflow_sha256], ['contract', packet.contract_path, packet.contract_sha256]]) {
            const source = resolve(sourcePath); const sourceRel = relative(SKILL, source)
            if (sourceRel.startsWith('..') || isAbsolute(sourceRel) || !existsSync(source)) errors.push(`dispatch ${name} ${label} is missing or escapes the installed skill`)
            else if (sha(source) !== expected) errors.push(`dispatch ${name} ${label} digest mismatch`)
          }
          if (packet.host_config_path) {
            const hostConfigPath = resolve(root, packet.host_config_path); const hostConfigRel = relative(root, hostConfigPath)
            if (hostConfigRel.startsWith('..') || isAbsolute(hostConfigRel) || !existsSync(hostConfigPath)) errors.push(`dispatch ${name} host configuration is missing or escapes the project`)
            else if (sha(hostConfigPath) !== record.host_config_sha256) errors.push(`dispatch ${name} host configuration digest mismatch`)
          }
          if (record.parent_dispatch_id && !existsSync(join(dispatchRoot, record.parent_dispatch_id, 'record.json'))) errors.push(`dispatch ${name} parent dispatch is missing`)
          const secrets = secretFindings({ packet, brief, record }); for (const item of secrets) errors.push(`dispatch ${name} contains ${item.type} at ${item.path}`)
        }
        const resultPath = join(dir, 'result.json')
        if (record.result_sha256 && (!existsSync(resultPath) || sha(resultPath) !== record.result_sha256)) errors.push(`dispatch ${name} result digest mismatch`)
        if (record.validation === 'passed' && !existsSync(resultPath)) errors.push(`dispatch ${name} passed validation without a result`)
        if (record.validation === 'failed' && !record.failure) errors.push(`dispatch ${name} failed validation without a failure reason`)
        if (existsSync(resultPath)) {
          const result = json(resultPath, 'specialist-result')
          if (result.run_id !== record.run_id || result.dispatch_id !== record.dispatch_id || result.specialist !== record.specialist) errors.push(`dispatch ${name} result binding mismatch`)
          for (const item of secretFindings(result)) errors.push(`dispatch ${name} result contains ${item.type} at ${item.path}`)
        }
      } catch (error) { errors.push(`dispatch ${name} is unreadable: ${error.message}`) }
    }
  }
  if (feature.state.operation?.status === 'reserved') warnings.push(`operation ${feature.state.operation.id} is reserved and should be resumed, not repeated`)
  try { policyFresh(root, feature) } catch (error) { errors.push(error.message) }
  const result = {
    ok: !errors.length, id: feature.manifest.feature_id, status: feature.state.status, dispatches, errors, warnings,
    durability: `Durable run state is under ${relative(root, feature.dir).replaceAll('\\', '/')}; host memory and unavailable telemetry are not evidence.`,
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (errors.length) process.exitCode = 1
}

try {
  if (flag('--help') || command === 'help') help(); else if (command === 'start') start(); else if (command === 'list') listRuns(); else if (command === 'status') status(); else if (command === 'route') route(); else if (command === 'reclassify') reclassify(); else if (command === 'advance') advance(); else if (command === 'approve') approve(); else if (command === 'check') checkRun(); else if (command === 'doctor') doctorRun(); else if (command === 'dispatch') dispatch(); else if (command === 'verify') verify(); else if (command === 'reserve') reserve(); else if (command === 'reconcile') reconcile(); else if (command === 'pause') pause(); else if (command === 'resume') resume(); else if (command === 'cancel') cancel(); else fail('unknown command', 2, { command })
} catch (error) {
  const code = Number.isInteger(error.code) ? error.code : 1; const detail = error.detail || { detail: error.message }
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, ...detail }, null, 2)}\n`); process.exitCode = code
}
