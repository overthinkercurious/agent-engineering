#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { candidateIdentity } from './identity.mjs'
import { redactText, secretFindings } from './security.mjs'
import { assertValid, canonicalJson, deduplicateFindings } from './validate.mjs'

const COUNTERS = ['calls', 'input_tokens', 'output_tokens', 'context_tokens', 'wall_time_seconds', 'repair_attempts', 'specialist_escalations']
const MAX_RESULT_BYTES = 256 * 1024
const STAGE_STATES = {
  discovery: ['created', 'classified', 'discovery'],
  diagnosis: ['created', 'classified', 'discovery'],
  plan: ['definition', 'plan_review', 'awaiting_approval'],
  implementation: ['approved', 'implementation', 'integration', 'repair'],
  audit: ['audit', 'repair'],
  verification: ['verification', 'ready_for_pr'],
}
const SPECIALIST_STAGES = {
  scout: ['discovery'], pulse: ['discovery', 'plan'], rift: ['discovery', 'plan'], flow: ['plan', 'audit'],
  spine: ['plan', 'audit'], pixel: ['implementation', 'audit'], core: ['implementation', 'audit'],
  shift: ['implementation', 'audit'], vault: ['plan', 'implementation', 'audit'], signal: ['plan', 'implementation', 'audit'],
  probe: ['discovery', 'diagnosis', 'plan', 'audit', 'verification'], judge: ['verification'],
}

export class DispatchError extends Error {
  constructor(message, code = 4, detail = {}) { super(message); this.code = code; this.detail = detail }
}
function deny(message, code = 4, detail = {}) { throw new DispatchError(message, code, detail) }
function digest(value) { return createHash('sha256').update(value).digest('hex') }
function unique(values) { return [...new Set((values || []).filter(Boolean))].sort() }

function boundedPath(root, path, label) {
  const target = resolve(root, path); const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) deny(`${label} escapes the project root`, 5, { path })
  return { target, relative: rel.replaceAll('\\', '/') }
}

function selectedInput(root, feature, requested) {
  const featureCandidate = resolve(feature.dir, requested); const featureRel = relative(feature.dir, featureCandidate)
  let selected
  if (!featureRel.startsWith('..') && !isAbsolute(featureRel) && existsSync(featureCandidate)) selected = { target: featureCandidate, relative: relative(root, featureCandidate).replaceAll('\\', '/') }
  else selected = boundedPath(root, requested, 'input path')
  if (!existsSync(selected.target) || !statSync(selected.target).isFile()) deny('dispatch input is not a file', 4, { path: requested })
  return { id: `input:${digest(selected.relative).slice(0, 16)}`, path: selected.relative, sha256: digest(readFileSync(selected.target)) }
}

function localHostFiles(root, host, skillRoot) {
  const files = []
  for (const value of host.args) {
    const target = resolve(root, value); const projectRel = relative(root, target); const skillRel = relative(skillRoot, target)
    if (!projectRel.startsWith('..') && !isAbsolute(projectRel) && existsSync(target) && statSync(target).isFile()) files.push({ path: projectRel.replaceAll('\\', '/'), sha256: digest(readFileSync(target)) })
    else if (!skillRel.startsWith('..') && !isAbsolute(skillRel) && existsSync(target) && statSync(target).isFile()) files.push({ path: `skill:${skillRel.replaceAll('\\', '/')}`, sha256: digest(readFileSync(target)) })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function allowedWrite(path, roots) {
  const normalized = String(path).replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized === '..' || normalized.startsWith('../') || isAbsolute(normalized)) return false
  return roots.some((root) => root === '.' || normalized === root || normalized.startsWith(`${root}/`))
}

function stageEligible(feature, specialist, stage) {
  if (!STAGE_STATES[stage]?.includes(feature.state.status)) return false
  return (SPECIALIST_STAGES[specialist] || []).includes(stage)
}

function validateArtifactChanges(root, result, allowedWrites) {
  for (const artifact of result.artifact_changes) {
    if (artifact.action === 'none') continue
    if (!allowedWrite(artifact.path, allowedWrites)) deny('specialist reported an artifact outside its packet write scope', 5, { path: artifact.path })
    const { target } = boundedPath(root, artifact.path, 'artifact path')
    if (artifact.action === 'deleted') { if (existsSync(target)) deny('specialist reported a deletion but the artifact still exists', 5, { path: artifact.path }); continue }
    if (!existsSync(target) || !statSync(target).isFile()) deny('specialist reported a missing artifact', 5, { path: artifact.path })
    const content = readFileSync(target)
    if (digest(content) !== artifact.sha256) deny('specialist artifact digest does not match current content', 5, { path: artifact.path })
    const findings = secretFindings(content.toString('utf8'))
    if (findings.length) deny('secret-like content blocked in specialist artifact', 5, { path: artifact.path, findings })
  }
}

function validateDiagnosisResult(result, stage) {
  if (stage !== 'diagnosis') {
    if (result.diagnosis) deny('a diagnosis account is only valid in a diagnosis dispatch', 5)
    return
  }
  if (result.status !== 'complete') return
  const diagnosis = result.diagnosis
  if (!diagnosis?.established_cause) deny('completed diagnosis omitted an established cause', 5)
  const evidenceIds = new Set(result.evidence.map((item) => item.id))
  if (diagnosis.observation_ids.some((id) => !evidenceIds.has(id))) deny('diagnosis cites an unknown observation', 5)
  if (diagnosis.hypotheses.some((item) => item.evidence_ids.some((id) => !evidenceIds.has(id)))) deny('diagnosis hypothesis cites unknown evidence', 5)
  if (!diagnosis.hypotheses.some((item) => item.disposition === 'supported')) deny('completed diagnosis has no supported hypothesis', 5)
}

function collectReceipts(featureDir) {
  const evidenceRoot = join(featureDir, 'evidence'); if (!existsSync(evidenceRoot)) return []
  const out = []
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.name.endsWith('.json')) { try { out.push(assertValid('command-receipt', JSON.parse(readFileSync(child, 'utf8')))) } catch { /* not a runner-owned receipt */ } }
    }
  }
  visit(evidenceRoot); return out
}

function validateMeasuredEvidence(feature, result, candidate) {
  const measured = result.evidence.filter((item) => item.class === 'MEASURED')
  if (!measured.length) return
  const receipts = collectReceipts(feature.dir)
  for (const item of measured) {
    const receiptId = item.id.startsWith('receipt:') ? item.id : `receipt:${item.id}`
    const match = receipts.find((receipt) => receipt.receipt_id === receiptId)
    if (!match || match.issuer !== 'forge' || match.candidate_identity !== candidate.worktree_sha256) deny('specialist result cites measured evidence without a matching runner-owned receipt on the current candidate', 5, { evidence_id: item.id })
  }
}

function mergeMetric(current, incoming) {
  if (!incoming || incoming.value === null) return current
  return { value: (current.value || 0) + incoming.value, provenance: incoming.provenance }
}

function reconcileBudget(state, reservation, usage, elapsedMs, packetBytes) {
  const actual = {
    calls: 1,
    input_tokens: usage.input_tokens.value ?? reservation.input_tokens,
    output_tokens: usage.output_tokens.value ?? reservation.output_tokens,
    context_tokens: Math.max(reservation.context_tokens, Math.ceil(packetBytes / 4)),
    wall_time_seconds: Math.max(reservation.wall_time_seconds, Math.ceil(elapsedMs / 1000)),
    repair_attempts: reservation.repair_attempts,
    specialist_escalations: reservation.specialist_escalations,
  }
  for (const key of COUNTERS) { state.budget.reserved[key] -= reservation[key]; state.budget.consumed[key] += actual[key] }
  state.usage.calls += 1; state.usage.wall_time_ms += elapsedMs
  for (const key of ['input_tokens', 'output_tokens']) {
    const incoming = usage[key].value === null ? { value: actual[key], provenance: 'estimated' } : usage[key]
    state.usage[key] = mergeMetric(state.usage[key], incoming)
  }
  for (const key of ['reasoning_tokens', 'cached_tokens', 'charge_usd']) state.usage[key] = mergeMetric(state.usage[key], usage[key])
  return { actual, exceeded: COUNTERS.filter((key) => state.budget.consumed[key] > state.budget.limits[key]) }
}

function reserveBudget(state, reservation, operation) {
  if (state.operation?.id === operation.id && state.operation.status === 'reserved') return false
  if (state.operation?.status === 'reserved') deny('another dispatch is already reserved', 7, { operation: state.operation })
  const exceeded = COUNTERS.filter((key) => state.budget.consumed[key] + state.budget.reserved[key] + reservation[key] > state.budget.limits[key])
  if (exceeded.length) deny('dispatch budget reservation exceeds run limits', 6, { exceeded })
  for (const key of COUNTERS) state.budget.reserved[key] += reservation[key]
  state.operation = { id: operation.id, kind: `specialist:${operation.specialist}`, attempt: 1, status: 'reserved' }
  return true
}

function validateRequests(result, registry, state, routingChain) {
  if (result.status !== 'needs_specialist') return []
  const requested = []
  for (const item of result.needs_specialist) {
    const specialty = item.specialty.toLowerCase()
    if (!registry.specialists[specialty]) deny('specialist result requested an unknown specialty', 5, { specialty })
    if (routingChain.includes(specialty)) deny('specialist result created a routing cycle', 5, { specialty, routing_chain: routingChain })
    requested.push({ ...item, specialty })
  }
  const next = state.budget.consumed.specialist_escalations + requested.length
  if (next > state.budget.limits.specialist_escalations) deny('specialist escalation budget exhausted', 6, { requested: requested.length })
  return requested
}

function resolveRoutingChain(feature, specialist, parentDispatchId) {
  if (!parentDispatchId) return [specialist]
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(parentDispatchId)) deny('parent dispatch id contains unsupported characters', 2)
  const parentDir = join(feature.dir, 'runs', 'dispatches', parentDispatchId)
  const parentRecordPath = join(parentDir, 'record.json'); const parentPacketPath = join(parentDir, 'packet.json'); const parentResultPath = join(parentDir, 'result.json')
  if (!existsSync(parentRecordPath) || !existsSync(parentPacketPath) || !existsSync(parentResultPath)) deny('parent dispatch evidence is incomplete', 5, { parent_dispatch_id: parentDispatchId })
  const parentRecord = assertValid('dispatch-record', JSON.parse(readFileSync(parentRecordPath, 'utf8')))
  const parentPacket = assertValid('context-packet', JSON.parse(readFileSync(parentPacketPath, 'utf8')))
  const parentResult = assertValid('specialist-result', JSON.parse(readFileSync(parentResultPath, 'utf8')))
  if (digest(readFileSync(parentPacketPath)) !== parentRecord.packet_sha256 || digest(readFileSync(parentResultPath)) !== parentRecord.result_sha256) deny('parent dispatch evidence is stale', 5, { parent_dispatch_id: parentDispatchId })
  if (parentResult.status !== 'needs_specialist' || !parentResult.needs_specialist.some((item) => item.specialty.toLowerCase() === specialist)) deny('parent dispatch did not request this specialist', 5, { parent_dispatch_id: parentDispatchId, specialist })
  const chain = parentPacket.routing_chain || [parentPacket.specialist]
  if (chain.includes(specialist)) deny('specialist dispatch would create a routing cycle', 5, { specialist, routing_chain: chain })
  return [...chain, specialist]
}

function validateRetry(feature, params, packet) {
  if (!params.retryOf) return { attempt: 1, retry_of: null }
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(params.retryOf) || params.retryOf === params.dispatchId) deny('retry source id is invalid', 2)
  const dispatchRoot = join(feature.dir, 'runs', 'dispatches')
  const priorRecordPath = join(dispatchRoot, params.retryOf, 'record.json'); const priorPacketPath = join(dispatchRoot, params.retryOf, 'packet.json')
  if (!existsSync(priorRecordPath) || !existsSync(priorPacketPath)) deny('retry source evidence is missing', 5, { retry_of: params.retryOf })
  const priorRecord = assertValid('dispatch-record', JSON.parse(readFileSync(priorRecordPath, 'utf8')))
  const priorPacket = assertValid('context-packet', JSON.parse(readFileSync(priorPacketPath, 'utf8')))
  if (priorRecord.attempt >= 2 || priorRecord.retry_of) deny('local retry limit is exhausted', 6, { retry_of: params.retryOf })
  for (const name of existsSync(dispatchRoot) ? readdirSync(dispatchRoot) : []) {
    const path = join(dispatchRoot, name, 'record.json'); if (!existsSync(path)) continue
    try { if (JSON.parse(readFileSync(path, 'utf8')).retry_of === params.retryOf) deny('local retry limit is exhausted', 6, { retry_of: params.retryOf }) } catch (error) { if (error instanceof DispatchError) throw error }
  }
  if (priorRecord.validation !== 'failed' || !priorRecord.failure || !/(json|schema|contract|binding|result|additional property|required property|unexpected token)/i.test(priorRecord.failure)) deny('only a repairable output or contract failure may be retried locally', 5, { retry_of: params.retryOf })
  if (priorPacket.specialist !== packet.specialist || priorPacket.stage !== packet.stage || priorPacket.request !== packet.request || canonicalJson(priorPacket.acceptance_ids) !== canonicalJson(packet.acceptance_ids) || canonicalJson(priorPacket.inputs) !== canonicalJson(packet.inputs) || priorPacket.candidate_identity !== packet.candidate_identity || priorPacket.workflow_sha256 !== packet.workflow_sha256 || priorPacket.contract_sha256 !== packet.contract_sha256) deny('retry does not match the failed bounded task', 5, { retry_of: params.retryOf })
  return { attempt: 2, retry_of: params.retryOf }
}

function rejectSatisfiedDuplicate(feature, packet, retryOf) {
  if (retryOf) return
  const dispatchRoot = join(feature.dir, 'runs', 'dispatches')
  if (!existsSync(dispatchRoot)) return
  for (const name of readdirSync(dispatchRoot)) {
    if (name === packet.dispatch_id) continue
    const recordPath = join(dispatchRoot, name, 'record.json'); const packetPath = join(dispatchRoot, name, 'packet.json'); const resultPath = join(dispatchRoot, name, 'result.json')
    if (!existsSync(recordPath) || !existsSync(packetPath) || !existsSync(resultPath)) continue
    try {
      const record = assertValid('dispatch-record', JSON.parse(readFileSync(recordPath, 'utf8')))
      const prior = assertValid('context-packet', JSON.parse(readFileSync(packetPath, 'utf8')))
      const result = assertValid('specialist-result', JSON.parse(readFileSync(resultPath, 'utf8')))
      const sameTask = prior.specialist === packet.specialist && prior.stage === packet.stage && prior.request === packet.request
        && prior.candidate_identity === packet.candidate_identity && prior.workflow_sha256 === packet.workflow_sha256
        && prior.contract_sha256 === packet.contract_sha256 && canonicalJson(prior.acceptance_ids) === canonicalJson(packet.acceptance_ids)
        && canonicalJson(prior.inputs) === canonicalJson(packet.inputs) && canonicalJson(prior.allowed_tools) === canonicalJson(packet.allowed_tools)
        && canonicalJson(prior.allowed_writes) === canonicalJson(packet.allowed_writes)
      if (sameTask && record.validation === 'passed' && record.status === 'acknowledged' && result.status === 'complete') deny('current evidence already satisfies this bounded specialist task', 4, { satisfied_by: name })
    } catch (error) { if (error instanceof DispatchError) throw error }
  }
}

function finalizeState({ feature, dispatchId, specialist, result, requested, failure, exceeded, persistState, transition }) {
  const failed = Boolean(failure || exceeded.length || result?.status === 'failed')
  feature.state.operation = { id: dispatchId, kind: `specialist:${specialist}`, attempt: 1, status: failed ? 'failed' : 'acknowledged' }
  if (result) {
    feature.state.open_findings = unique([...feature.state.open_findings, ...result.findings.filter((item) => item.status === 'open').map((item) => item.id)])
    feature.state.budget.consumed.specialist_escalations += requested.length
  }
  if (failed) transition('halted', { reason: failure ? 'host_execution_failed' : exceeded.length ? 'dispatch_budget_exceeded' : 'specialist_failed', resumeAction: 'Inspect the dispatch record and resume after correcting the cause.' })
  else if (result.status === 'needs_specialist') transition('awaiting_specialist', { reason: 'validated_specialist_request', resumeAction: `Forge must decide whether to dispatch: ${requested.map((item) => item.specialty).join(', ')}` })
  else if (['blocked', 'needs_input'].includes(result.status)) transition('blocked', { reason: result.status, resumeAction: 'Provide the missing input recorded in the validated result.' })
  else persistState(feature)
}

export function dispatchSpecialist(options) {
  const { root, feature, effective, registry, params, writeJson, persistState, transition } = options
  const { specialist, stage, dispatchId, hostPath } = params
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(dispatchId)) deny('dispatch id contains unsupported characters', 2)
  const dir = join(feature.dir, 'runs', 'dispatches', dispatchId); const packetPath = join(dir, 'packet.json'); const briefPath = join(dir, 'brief.json')
  const resultPath = join(dir, 'result.json'); const recordPath = join(dir, 'record.json'); const isRetry = existsSync(recordPath)
  if (!registry.specialists[specialist]) deny('unknown specialist', 2, { specialist })
  if (!feature.manifest.selected_specialists.includes(specialist)) deny('specialist was not selected for this run', 5, { specialist })
  const routingChain = resolveRoutingChain(feature, specialist, params.parentDispatchId)
  if (!isRetry && !stageEligible(feature, specialist, stage)) deny('specialist is not eligible in the current stage', 5, { specialist, stage, status: feature.state.status })
  const hostLocation = boundedPath(root, hostPath, 'host adapter'); const hostFile = hostLocation.target
  const hostConfigText = readFileSync(hostFile, 'utf8'); const hostConfigSha = digest(hostConfigText)
  const hostConfig = assertValid('host-config', JSON.parse(hostConfigText))
  const configSecrets = secretFindings(hostConfig)
  if (configSecrets.length) deny('host adapter configuration contains embedded credentials', 5, { findings: configSecrets })
  let host
  try {
    const observed = execFileSync(hostConfig.command, [...hostConfig.args, '--capabilities'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024, timeout: hostConfig.timeout_ms, killSignal: 'SIGTERM' })
    host = assertValid('host-adapter', JSON.parse(observed))
  } catch (error) {
    deny(`host capability observation failed: ${redactText(String(error.stderr || error.message || error)).slice(0, 2048)}`, 5)
  }
  const hostSecrets = secretFindings(host)
  if (hostSecrets.length) deny('host capability observation contains embedded credentials', 5, { findings: hostSecrets })
  if (host.adapter_id !== hostConfig.id) deny('host capability observation does not match its launch configuration', 5, { configured: hostConfig.id, observed: host.adapter_id })
  if (stage === 'diagnosis' && !params.independent) deny('diagnosis requires a fresh independent context', 5)
  if (params.independent && (host.isolation === 'shared_context' || host.fresh_context !== 'available')) deny('independent review requires observed host isolation', 5)
  if (host.tool_write_enforcement !== 'available') deny('host cannot enforce the packet permission boundary', 5, { adapter: host.adapter_id, capability: host.tool_write_enforcement })
  if (feature.manifest.model_profile === 'smaller-model-only' && host.model_class === 'strongest') deny('host model exceeds the effective smaller-model-only profile', 5)
  if (host.model_class === 'strongest' && feature.manifest.model_profile === 'mixed' && !params.modelEscalationReason) deny('stronger-model use requires a recorded escalation reason', 5)
  if (!effective.resolved.authority.allowed_tools.includes('command')) deny('effective authority does not permit host execution', 5)

  const allowedTools = unique(params.allowedTools)
  for (const tool of allowedTools) if (!effective.resolved.authority.allowed_tools.includes(tool)) deny('packet requests a tool outside effective authority', 5, { tool })
  const allowedWrites = unique(params.allowedWrites.map((path) => path.replaceAll('\\', '/').replace(/^\.\//, '')))
  for (const path of allowedWrites) if (!allowedWrite(path, effective.resolved.authority.allowed_write_roots)) deny('packet requests a write outside effective authority', 5, { path })

  // Registry files are relative to references/, never to the target project.
  const workflowPath = resolve(params.skillRoot, 'references', registry.specialists[specialist].file)
  if (!existsSync(workflowPath)) deny('specialist workflow is missing', 2, { specialist })
  const workflowSha = digest(readFileSync(workflowPath))
  const contractPath = resolve(params.skillRoot, 'references', 'contract.md')
  if (!existsSync(contractPath)) deny('shared Forge contract is missing', 2)
  const contractSha = digest(readFileSync(contractPath))
  const inputs = unique(params.inputs).map((path) => selectedInput(root, feature, path))
  const candidate = candidateIdentity(root)
  const brief = {
    schema: 1, brief_id: `brief:${dispatchId}`, packet_id: `packet:${dispatchId}`, objective: params.request,
    acceptance_ids: unique(params.acceptanceIds), source_refs: inputs.map((item) => item.path), invariants: unique(params.invariants),
    allowed_tools: allowedTools, allowed_writes: allowedWrites, procedure: params.procedure, next_check: params.nextCheck,
    missing_input_behavior: 'needs_input',
  }
  assertValid('bounded-task-brief', brief)
  const task = { objective: brief.objective, acceptance_ids: brief.acceptance_ids, source_refs: brief.source_refs, invariants: brief.invariants, allowed_tools: brief.allowed_tools, allowed_writes: brief.allowed_writes, procedure: brief.procedure, next_check: brief.next_check, missing_input_behavior: brief.missing_input_behavior }
  const dependencyKey = digest(canonicalJson({ candidate, policy: feature.manifest.policy_digest, workflow: workflowSha, contract: contractSha, inputs, task, routing_chain: routingChain, host_config: hostConfig, host_config_sha256: hostConfigSha, host, host_files: localHostFiles(root, hostConfig, params.skillRoot), runtime: { node: process.version, platform: process.platform, arch: process.arch } }))
  const modelSelectionReason = host.model_class === 'strongest'
    ? `mixed-profile stronger-model escalation: ${params.modelEscalationReason}`
    : `smallest selected host model for ${stage} under ${feature.manifest.model_profile}`
  const packet = {
    schema: 1, packet_id: `packet:${dispatchId}`, run_id: feature.manifest.run_id, dispatch_id: dispatchId, stage, specialist,
    request: params.request, acceptance_ids: brief.acceptance_ids, inputs, allowed_tools: allowedTools, allowed_writes: allowedWrites,
    budget: params.reservation, output_schema: 'specialist-result.schema.json', policy_digest: feature.manifest.policy_digest,
    candidate_identity: candidate.worktree_sha256, brief_id: brief.brief_id,
    workflow_path: workflowPath.replaceAll('\\', '/'), workflow_sha256: workflowSha, contract_path: contractPath.replaceAll('\\', '/'), contract_sha256: contractSha, dependency_key: dependencyKey, routing_chain: routingChain, host_config_path: hostLocation.relative,
    max_result_bytes: MAX_RESULT_BYTES, host_execution: {
      adapter: host.adapter_id, model_id: host.model_id, isolation: host.isolation, fresh_context: host.fresh_context,
      per_dispatch_model_selection: host.per_dispatch_model_selection, usage_telemetry: host.usage_telemetry,
      tool_write_enforcement: host.tool_write_enforcement, cancellation_acknowledgement: host.cancellation_acknowledgement,
      model_selection_reason: modelSelectionReason,
    },
  }
  const retry = validateRetry(feature, params, packet)
  rejectSatisfiedDuplicate(feature, packet, params.retryOf)
  const secrets = secretFindings({ packet, brief })
  if (secrets.length) deny('secret-like content blocked before packet persistence', 5, { findings: secrets })
  const packetText = `${JSON.stringify(assertValid('context-packet', packet), null, 2)}\n`
  const contextLimitBytes = feature.state.budget.limits.context_tokens * 4
  if (Buffer.byteLength(packetText) > contextLimitBytes) deny('context packet exceeds the run context budget', 6, { bytes: Buffer.byteLength(packetText), limit_bytes: contextLimitBytes })

  const briefText = `${JSON.stringify(brief, null, 2)}\n`
  if (isRetry) {
    const record = assertValid('dispatch-record', JSON.parse(readFileSync(recordPath, 'utf8')))
    const mismatches = []
    if (!existsSync(packetPath) || digest(readFileSync(packetPath)) !== record.packet_sha256 || record.packet_sha256 !== digest(packetText)) mismatches.push('packet')
    if (!existsSync(briefPath) || digest(readFileSync(briefPath)) !== record.brief_sha256 || record.brief_sha256 !== digest(briefText)) mismatches.push('brief')
    if (record.dependency_key !== dependencyKey) mismatches.push('dependency_key')
    if (record.workflow_sha256 !== workflowSha) mismatches.push('workflow')
    if (record.candidate_identity !== candidate.worktree_sha256) mismatches.push('candidate')
    if (record.host_config_sha256 !== hostConfigSha) mismatches.push('host_config')
    if (canonicalJson(record.host) !== canonicalJson(host)) mismatches.push('host')
    let existingResult = null
    if (record.result_sha256) {
      if (!existsSync(resultPath) || digest(readFileSync(resultPath)) !== record.result_sha256) mismatches.push('result')
      else existingResult = assertValid('specialist-result', JSON.parse(readFileSync(resultPath, 'utf8')))
    } else if (existsSync(resultPath)) mismatches.push('unexpected_result')
    if (mismatches.length) deny('dispatch id was already used with different or stale evidence', 7, { mismatches })
    let recovered = false; let requested = []
    if (feature.state.operation?.id === dispatchId && feature.state.operation.status === 'reserved') {
      for (const key of COUNTERS) if (feature.state.budget.reserved[key] < packet.budget[key]) deny('reserved dispatch budget is inconsistent with its packet', 7, { counter: key })
      if (existingResult) {
        validateArtifactChanges(root, existingResult, allowedWrites)
        requested = validateRequests(existingResult, registry, feature.state, routingChain)
      }
      const usage = existingResult ? existingResult.usage : { input_tokens: { value: null }, output_tokens: { value: null }, reasoning_tokens: { value: null }, cached_tokens: { value: null }, charge_usd: { value: null } }
      const impact = reconcileBudget(feature.state, packet.budget, usage, record.elapsed_ms, Buffer.byteLength(packetText))
      if (canonicalJson(impact.actual) !== canonicalJson(record.budget_impact.actual) || canonicalJson(impact.exceeded) !== canonicalJson(record.budget_impact.exceeded)) deny('recorded dispatch budget impact is inconsistent', 7)
      finalizeState({ feature, dispatchId, specialist, result: existingResult, requested, failure: record.failure, exceeded: impact.exceeded, persistState, transition })
      recovered = true
    }
    return { idempotent: true, recovered, record, result: existingResult, requested_specialists: requested }
  }
  writeJson(packetPath, packet, 'context-packet'); writeJson(briefPath, brief, 'bounded-task-brief')
  const addedReservation = reserveBudget(feature.state, params.reservation, { id: dispatchId, specialist })
  if (addedReservation) persistState(feature)

  const startedAt = new Date().toISOString(); const started = Date.now(); let result; let requested = []; let failure = null
  if (existsSync(resultPath)) result = assertValid('specialist-result', JSON.parse(readFileSync(resultPath, 'utf8')))
  else {
    try {
      const output = execFileSync(hostConfig.command, [...hostConfig.args, '--packet', packetPath, '--brief', briefPath, '--workflow', workflowPath, '--contract', contractPath], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_RESULT_BYTES + 1, timeout: hostConfig.timeout_ms, killSignal: 'SIGTERM' })
      if (Buffer.byteLength(output) > MAX_RESULT_BYTES) deny('specialist result exceeds the evidence limit', 6, { max_bytes: MAX_RESULT_BYTES })
      result = JSON.parse(output)
    } catch (error) {
      const reason = error.code === 'ENOBUFS' ? 'specialist result exceeds the evidence limit' : error.code === 'ETIMEDOUT' ? 'host execution exceeded its cancellation timeout' : String(error.stderr || error.message || 'host execution failed')
      failure = redactText(reason).slice(0, 4096)
    }
  }
  const elapsedMs = Date.now() - started; const finishedAt = new Date().toISOString()
  if (!failure) {
    try {
      const foundSecrets = secretFindings(result)
      if (foundSecrets.length) throw new DispatchError('secret-like content blocked from specialist result persistence', 5, { findings: foundSecrets })
      result = assertValid('specialist-result', result)
      if (result.run_id !== feature.manifest.run_id || result.dispatch_id !== dispatchId || result.specialist !== specialist) throw new DispatchError('specialist result binding does not match its packet', 5)
      validateDiagnosisResult(result, stage)
      validateMeasuredEvidence(feature, result, candidate)
      result.findings = deduplicateFindings(result.findings)
      validateArtifactChanges(root, result, allowedWrites)
      requested = validateRequests(result, registry, feature.state, routingChain)
      writeJson(resultPath, result, 'specialist-result')
    } catch (error) {
      failure = redactText(error.message).slice(0, 4096)
    }
  }

  const usage = failure ? { input_tokens: { value: null }, output_tokens: { value: null }, reasoning_tokens: { value: null }, cached_tokens: { value: null }, charge_usd: { value: null } } : result.usage
  const impact = reconcileBudget(feature.state, params.reservation, usage, elapsedMs, Buffer.byteLength(packetText))
  const recordStatus = failure || result.status === 'failed' ? 'failed' : result.status === 'needs_specialist' ? 'needs_specialist' : ['blocked', 'needs_input'].includes(result.status) ? 'blocked' : 'acknowledged'
  const record = {
    schema: 1, dispatch_id: dispatchId, run_id: feature.manifest.run_id, specialist, stage, status: recordStatus, validation: failure ? 'failed' : 'passed', reason: params.reason,
    attempt: retry.attempt, retry_of: retry.retry_of,
    parent_dispatch_id: params.parentDispatchId || null, routing_chain: routingChain,
    packet_sha256: digest(packetText), brief_sha256: digest(briefText), dependency_key: dependencyKey,
    workflow_sha256: workflowSha, candidate_identity: candidate.worktree_sha256, host_config_sha256: hostConfigSha, host, started_at: startedAt, finished_at: finishedAt,
    elapsed_ms: elapsedMs, budget_impact: { reservation: params.reservation, actual: impact.actual, exceeded: impact.exceeded }, result_sha256: failure ? null : digest(`${JSON.stringify(result, null, 2)}\n`), failure,
  }
  writeJson(recordPath, record, 'dispatch-record')
  finalizeState({ feature, dispatchId, specialist, result: failure ? null : result, requested, failure, exceeded: impact.exceeded, persistState, transition })
  return { idempotent: false, packet, brief, record, result: failure ? null : result, requested_specialists: requested }
}
