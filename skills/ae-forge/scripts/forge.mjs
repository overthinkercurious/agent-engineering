#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const KINDS = ['idea', 'feature', 'bug', 'refactor', 'performance', 'security', 'audit']
const TIERS = ['quick', 'standard', 'deep']
const PHASES = ['understand', 'plan', 'build', 'verify', 'repair', 'blocked']
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const TEAM = JSON.parse(readFileSync(resolve(SCRIPT_DIR, '..', 'references', 'team.json'), 'utf8'))
const ROLES = Object.keys(TEAM.roles)
const SPECIALIST_ROLES = Object.keys(TEAM.signals)
const TRANSITIONS = {
  understand: ['plan', 'build', 'verify', 'blocked'],
  plan: ['build', 'verify', 'blocked'],
  build: ['verify', 'blocked'],
  verify: ['repair', 'blocked'],
  repair: ['verify', 'blocked'],
  blocked: ['understand', 'plan', 'build', 'verify', 'repair'],
}
const RISK_SIGNALS = new Set(
  ['security', 'data', 'reliability'].flatMap((role) => TEAM.signals[role]),
)
const QUICK_SIGNALS = new Set(['copy', 'style', 'docs', 'typo', 'local', 'mechanical'])
const APPROVAL_SIGNALS = new Set([
  'destructive', 'irreversible', 'production', 'deploy', 'deployment',
  'external', 'payment', 'spend', 'spending', 'access-grant', 'credential',
  'public-contract', 'breaking-change',
])

const RISK = TEAM.risk ?? {}
const RISK_FLAGS = Object.keys(RISK)

function requiresApproval(signals, risks) {
  return risks.some((flag) => RISK[flag]?.approval) || signals.some((value) => APPROVAL_SIGNALS.has(value))
}

// `--risk none` is an explicit assessment that found nothing. An ABSENT
// --risk is not: it means the behavioural questions were never answered, and
// that difference has to stay visible all the way into the delivery report -
// silently treating "unasked" as "no risk" is the failure this router exists
// to remove.
function splitRisks() {
  const provided = option('--risk')
  const values = [...new Set(String(provided ?? '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))]
  const declared = values.filter((value) => value !== 'none')
  const unknown = declared.filter((value) => !RISK_FLAGS.includes(value))
  if (unknown.length) die(`unknown risk flag(s): ${unknown.join(', ')}`, 2, { allowed: [...RISK_FLAGS, 'none'] })
  return { risks: declared, assessed: provided !== null }
}

function option(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

function die(message, code = 2, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message, ...details }, null, 2)}\n`)
  process.exit(code)
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function projectRoot() {
  const root = resolve(option('--root', process.cwd()))
  if (!existsSync(root) || !statSync(root).isDirectory()) die('project root must be an existing directory')
  return realpathSync(root)
}

function inside(root, path) {
  const rel = relative(root, resolve(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function workRoot(root) {
  const path = join(root, '.dev', 'work')
  for (const candidate of [join(root, '.dev'), path]) {
    if (existsSync(candidate) && !inside(root, realpathSync(candidate))) {
      die('work directory resolves outside project root')
    }
  }
  if (!inside(root, path)) die('work directory escapes project root')
  return path
}

function safeId(value) {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    die('id must contain 1-64 lowercase letters, numbers, or hyphens')
  }
  return value
}

function slug(title) {
  const value = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56)
  return value || `task-${Date.now().toString(36)}`
}

function splitSignals() {
  return [...new Set(String(option('--signals', ''))
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))]
}

// Risk flags are the primary router: the model answers a behavioural question
// and the mapping to a role is deterministic. Keyword signals remain only as
// additive escalation - a keyword may ADD a role, never withhold one - because
// an exact-match vocabulary silently misses near-synonyms (oauth, sso, rbac),
// and a router that fails open is worse than no router at all.
function chooseTier(kind, signals, risks) {
  const requested = option('--tier')
  if (requested && !TIERS.includes(requested)) die(`tier must be one of: ${TIERS.join(', ')}`)
  const deepFlag = risks.some((flag) => RISK[flag]?.approval || RISK[flag]?.role)
  const inferred = kind === 'security' || deepFlag || signals.some((value) => RISK_SIGNALS.has(value))
    ? 'deep'
    : signals.length && signals.every((value) => QUICK_SIGNALS.has(value))
      ? 'quick'
      : 'standard'
  if (!requested) return inferred
  return TIERS[Math.max(TIERS.indexOf(requested), TIERS.indexOf(inferred))]
}

function tierReason(kind, signals, risks, tier) {
  if (kind === 'security') return 'kind=security'
  const flag = risks.find((value) => RISK[value]?.approval || RISK[value]?.role)
  if (flag) return `risk=${flag}`
  const signal = signals.find((value) => RISK_SIGNALS.has(value))
  if (signal) return `escalated by signal "${signal}"`
  if (tier === 'quick') return 'local, reversible, and understood'
  return 'several files or a meaningful design choice'
}

// Returns both the team and why each role was selected or skipped, so the
// delivery report can show the routing decision instead of the model
// recalling it. A skipped role with no recorded reason is a routing bug.
function chooseTeam(kind, tier, signals, risks) {
  const selected = {}
  const skipped = {}
  const take = (role, reason) => { if (!selected[role]) selected[role] = reason }

  for (const role of SPECIALIST_ROLES) {
    const flag = RISK_FLAGS.find((value) => RISK[value]?.role === role && risks.includes(value))
    if (flag) { take(role, `risk=${flag}`); continue }
    const signal = TEAM.signals[role].find((value) => signals.includes(value))
    if (signal) { take(role, `signal "${signal}"`); continue }
    if (kind === 'security' && role === 'security') { take(role, 'kind=security'); continue }
    if (kind === 'performance' && role === 'reliability') { take(role, 'kind=performance'); continue }
    const declared = RISK_FLAGS.find((value) => RISK[value]?.role === role)
    skipped[role] = declared ? `no ${declared} risk declared` : 'no matching risk or signal'
  }

  if (tier !== 'quick') take('architect', 'tier is standard or deeper')
  else skipped.architect = 'quick tier: no open design choice'

  if (kind === 'bug' || kind === 'performance' || signals.includes('unknown')) {
    take('investigator', `kind=${kind === 'performance' ? 'performance' : kind === 'bug' ? 'bug' : 'feature'}, cause not demonstrated`)
  } else skipped.investigator = 'no undiagnosed defect'

  if (kind === 'idea' || signals.includes('ambiguous') || signals.includes('product')) {
    take('product', kind === 'idea' ? 'kind=idea' : 'outcome is materially ambiguous')
  } else skipped.product = 'requested outcome is already specified'

  if (kind === 'audit') {
    delete selected.builder
    skipped.builder = 'audit-only: cannot modify code'
    delete skipped.investigator
    delete skipped.product
    take('verifier', 'owns the audit verdict')
  } else {
    take('builder', 'code must change')
    take('verifier', 'independent verification of every delivery')
  }

  const order = [...ROLES.filter((role) => selected[role])]
  return { team: order, selected, skipped }
}

// The brief is the one artifact a user reviews and the audit later checks
// against. Its sections are tier-bound on purpose: a section outside the tier
// is omitted, never filled with "N/A", so a quick fix cannot grow a four-page
// plan and a deep change cannot quietly skip its rollback story.
const BRIEF_SECTIONS = [
  ['Request', 'quick', null],
  ['Assumptions', 'standard', 'What you are taking as true that the request did not state. Each one a user could correct.'],
  ['Scope and non-goals', 'standard', 'What this deliberately does not do.'],
  ['Acceptance criteria', 'quick', 'Observable behaviour, one per line, with stable IDs AC-1, AC-2. A criterion nobody can check is not a criterion.'],
  ['Evidence read', 'standard', 'Every path:line actually opened. A step touching a file absent from this list is unverified by construction.'],
  ['Options considered', 'deep', 'Only where more than one viable design exists. One line of tradeoff each, then the pick and why. An invented alternative is worse than none.'],
  ['Design decisions', 'standard', 'Each decision with VERIFIED (path:line) or INFERRED (basis). ASSUMED does not exist.'],
  ['Implementation steps', 'quick', 'Ordered, file-level. Each step: the change, why, and a runnable check.'],
  ['Risks and residual', 'standard', 'What could still go wrong after this ships.'],
  ['Rollback', 'deep', 'How this is reversed, or why reversal is not possible. A code revert is not data recovery.'],
  ['Verification plan', 'quick', 'The exact commands, and which acceptance criterion each one evidences.'],
]

// Recorded at start so the audit can tell whether the repository moved under
// the brief. Stale context is a silent correctness failure otherwise.
function baseline(root) {
  let head = null
  try {
    head = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { /* not a git repository, or no commit yet */ }
  const analysis = join(root, '.dev', 'context', 'analysis.json')
  let map = null
  if (existsSync(analysis)) {
    map = createHash('sha256').update(readFileSync(analysis, 'utf8')).digest('hex').slice(0, 16)
  }
  return { head, analysis: map, at: new Date().toISOString() }
}

const ACCEPTANCE = TEAM.acceptance ?? {}
const TEST_PATH = /(^|[\/\\])(tests?|spec|__tests__)[\/\\]|[._-](test|spec)\.[a-z]+$|(^|[\/\\])test_[^\/\\]+$/i

// A refactor is correct precisely when behaviour did not change, so rewriting
// its own tests is the one signal that contradicts the claim. This is the rare
// acceptance rule a script can settle, so a script settles it - the model is
// asked to justify, not to self-assess.
function changedTestFiles(root, from) {
  if (!from) return null
  try {
    const out = execFileSync('git', ['diff', '--name-only', from],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split('\n').map((line) => line.trim()).filter(Boolean).filter((line) => TEST_PATH.test(line))
  } catch { return null }
}

function briefPath(root, id) {
  const path = join(workRoot(root), safeId(id), 'brief.md')
  if (!inside(root, path)) die('brief path escapes project root')
  return path
}

function briefDigest(root, id) {
  const path = briefPath(root, id)
  if (!existsSync(path)) return null
  return createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex').slice(0, 16)
}

function brief() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const { run } = load(root, id)
  const path = briefPath(root, id)
  if (existsSync(path) && !args.includes('--force')) {
    die('brief already exists; edit it in place or pass --force to rescaffold', 4, { id })
  }
  const rank = TIERS.indexOf(run.tier)
  const lines = [
    `# ${run.title}`, '',
    `> ${run.tier} · ${run.kind} · risk: ${run.risks?.length ? run.risks.join(', ') : (run.routing?.risk_assessed ? 'none declared' : 'NOT ASSESSED')}`,
    `> Team: ${run.team.join(' → ')}`,
    `> Baseline: ${run.baseline?.head ?? 'UNKNOWN'} · approval ${run.approval_required ? 'required' : 'not required'}`,
    '',
    '_This brief is the approved contract. After approval it is frozen: the',
    'release audit compares the delivered change against this text, so',
    'rewriting it destroys the answer to "did we build what was approved?"_',
    '',
  ]
  for (const [heading, minTier, prompt] of BRIEF_SECTIONS) {
    if (TIERS.indexOf(minTier) > rank) continue
    lines.push(`## ${heading}`, '')
    if (heading === 'Request') lines.push(run.title, '')
    else lines.push(`<!-- ${prompt} -->`, '', 'TODO', '')
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${lines.join('\n').trimEnd()}\n`, 'utf8')
  const included = BRIEF_SECTIONS.filter(([, t]) => TIERS.indexOf(t) <= rank).map(([h]) => h)
  output({ ok: true, id, tier: run.tier, sections: included, brief: relative(root, path).replaceAll('\\', '/') })
}

function allowedPhases(role) {
  if (role === 'builder') return ['build', 'repair']
  if (role === 'verifier') return ['verify']
  if (SPECIALIST_ROLES.includes(role)) return ['understand', 'plan', 'verify']
  return ['understand', 'plan']
}

function parseBoolean(name, fallback) {
  const value = option(name)
  if (value === null) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  die(`${name} must be true or false`)
}

function runPath(root, id) {
  const path = join(workRoot(root), safeId(id), 'run.json')
  if (!inside(root, path)) die('run path escapes project root')
  return path
}

function load(root, id) {
  const path = runPath(root, id)
  if (!existsSync(path)) die('run not found', 4, { id })
  let run
  try { run = JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { die('run record is unreadable', 4, { id, detail: error.message }) }
  if (run.schema !== 1 || run.id !== id) die('run record is invalid', 4, { id })
  return { path, run }
}

function save(path, run) {
  run.updated_at = new Date().toISOString()
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

function ensureActive(run) {
  if (run.status !== 'active') die('run is not active', 4, { id: run.id, status: run.status })
}

function start() {
  const root = projectRoot()
  const title = option('--title')
  const kind = option('--kind')
  if (!title) die('--title is required')
  if (!KINDS.includes(kind)) die(`kind must be one of: ${KINDS.join(', ')}`)
  const id = safeId(option('--id', slug(title)))
  const path = runPath(root, id)
  if (existsSync(path)) die('run already exists; resume it instead', 4, { id })
  const signals = splitSignals()
  const { risks, assessed } = splitRisks()
  const domains = [...new Set(String(option('--domain', ''))
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))]
  const tier = chooseTier(kind, signals, risks)
  const routing = chooseTeam(kind, tier, signals, risks)
  const now = new Date().toISOString()
  const run = {
    schema: 1,
    id,
    title,
    kind,
    signals,
    risks,
    domains,
    tier,
    team: routing.team,
    routing: {
      risk_assessed: assessed,
      tier_reason: assessed
        ? tierReason(kind, signals, risks, tier)
        : `${tierReason(kind, signals, risks, tier)} (risk not assessed: specialists selected by keyword only)`,
      selected: routing.selected,
      skipped: routing.skipped,
    },
    approval_required: parseBoolean('--approval-required', requiresApproval(signals, risks)),
    approval: null,
    baseline: baseline(root),
    status: 'active',
    phase: 'understand',
    revision: 0,
    summary: 'Run created.',
    contributions: [],
    verification: null,
    result: null,
    created_at: now,
    updated_at: now,
  }
  save(path, run)
  output({
    ok: true, id, tier, team: run.team, routing: run.routing,
    approval_required: run.approval_required,
    record: relative(root, path).replaceAll('\\', '/'),
  })
}

function list() {
  const root = projectRoot()
  const base = workRoot(root)
  if (!existsSync(base)) return output([])
  const runs = []
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(base, entry.name, 'run.json')
    if (!existsSync(path)) continue
    try {
      const run = JSON.parse(readFileSync(path, 'utf8'))
      runs.push({ id: run.id, title: run.title, tier: run.tier, phase: run.phase, status: run.status, updated_at: run.updated_at })
    } catch { /* status reports a corrupt record when addressed directly */ }
  }
  output(runs.sort((a, b) => b.updated_at.localeCompare(a.updated_at)))
}

function status() {
  const root = projectRoot()
  output(load(root, safeId(option('--id'))).run)
}

function note() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const role = option('--role')
  const summary = option('--summary')
  if (!ROLES.includes(role)) die(`role must be one of: ${ROLES.join(', ')}`)
  if (!summary) die('--summary is required')
  const feature = load(root, id)
  ensureActive(feature.run)
  if (!feature.run.team.includes(role)) die('role is not selected for this run', 4, { role, team: feature.run.team })
  const permitted = allowedPhases(role)
  if (!permitted.includes(feature.run.phase)) {
    die('role cannot contribute in the current phase', 5, { role, phase: feature.run.phase, permitted })
  }
  if (role === 'verifier') {
    const prior = new Set(feature.run.contributions.map((item) => item.role))
    const missingPrior = feature.run.team.filter((selected) => selected !== 'verifier' && !prior.has(selected))
    const reviewedCandidate = new Set(feature.run.contributions
      .filter((item) => item.phase === 'verify' && item.revision === feature.run.revision)
      .map((item) => item.role))
    const missingCandidateReviews = feature.run.kind === 'audit' ? [] : feature.run.team
      .filter((selected) => SPECIALIST_ROLES.includes(selected) && !reviewedCandidate.has(selected))
    const missing = [...new Set([...missingPrior, ...missingCandidateReviews])]
    if (missing.length) die('Verifier must run after all selected expert work', 5, { missing })
  }
  const severity = option('--severity')
  if (severity && !['critical', 'high', 'medium', 'low', 'none'].includes(severity)) {
    die('severity must be critical, high, medium, low, or none')
  }
  feature.run.contributions.push({
    role,
    phase: feature.run.phase,
    revision: feature.run.revision,
    summary,
    severity: severity ?? null,
    result: option('--result'),
    at: new Date().toISOString(),
  })
  save(feature.path, feature.run)
  output({ ok: true, id, role })
}

function phase() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const to = option('--to')
  const summary = option('--summary')
  if (!PHASES.includes(to)) die(`phase must be one of: ${PHASES.join(', ')}`)
  if (!summary) die('--summary is required')
  const feature = load(root, id)
  ensureActive(feature.run)
  const from = feature.run.phase
  if (from !== to && !(TRANSITIONS[from] || []).includes(to)) {
    die('invalid phase transition', 4, { from, to })
  }
  const contributed = new Set(feature.run.contributions.map((item) => item.role))
  if (to === 'build' && feature.run.kind === 'audit') {
    die('audit-only runs do not enter build; start a delivery run to apply fixes', 5, { id })
  }
  if (to === 'build') {
    const required = feature.run.team.filter((role) => !['builder', 'verifier'].includes(role))
    const missing = required.filter((role) => !contributed.has(role))
    if (missing.length) die('pre-build expert contributions are required before build', 5, { missing })
  }
  if (to === 'build' && feature.run.approval_required && !feature.run.approval) {
    die('material approval is required before build', 5, { id })
  }
  if (to === 'verify' && feature.run.kind !== 'audit' && !contributed.has('builder')) {
    die('Builder contribution is required before verification', 5, { id })
  }
  if (to === 'build' || to === 'repair') {
    feature.run.revision = (feature.run.revision || 0) + 1
  }
  feature.run.phase = to
  feature.run.summary = summary
  save(feature.path, feature.run)
  output({ ok: true, id, phase: to })
}

// Lens attachment is part of routing, so it belongs in the record that the
// report renders from. Without this, a lens that never attaches - or one that
// is quietly stale - is invisible in exactly the summary meant to prove
// routing works.
function lenses() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const feature = load(root, id)
  ensureActive(feature.run)
  let parsed
  try { parsed = JSON.parse(option('--json') ?? '') } catch {
    die('--json must be the JSON object printed by lens-select.mjs')
  }
  feature.run.lenses = {
    attached: parsed.attached ?? {},
    unavailable: parsed.unavailable ?? [],
    stale: parsed.stale ?? [],
    assessed: parsed.assessed ?? false,
    derived_from_project: parsed.derived_from_project ?? [],
  }
  save(feature.path, feature.run)
  output({ ok: true, id, lenses: feature.run.lenses })
}

function approve() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const feature = load(root, id)
  ensureActive(feature.run)
  feature.run.approval = {
    by: option('--by', 'user'),
    at: new Date().toISOString(),
    basis: option('--basis', 'Explicit approval in the active conversation.'),
    // The brief is the contract from here on. Recording its digest is what
    // lets the audit answer "did we build what was approved?" rather than
    // "did we build what the brief now says?".
    brief_sha: briefDigest(root, id),
  }
  save(feature.path, feature.run)
  output({ ok: true, id, approval: feature.run.approval })
}

function finish() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const summary = option('--summary')
  const verification = option('--verification')
  const result = option('--result', 'PASS')
  if (!summary || !verification) die('--summary and --verification are required')
  if (!['PASS', 'PASS WITH RESIDUAL RISK'].includes(result)) {
    die('--result must be PASS or PASS WITH RESIDUAL RISK')
  }
  const accepted = new Set(String(option('--accept-gaps', ''))
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))
  const GAPS = ['risk', 'lenses', 'audit']
  const unknownGap = [...accepted].filter((value) => !GAPS.includes(value))
  if (unknownGap.length) die(`unknown gap(s): ${unknownGap.join(', ')}`, 2, { allowed: GAPS })

  const feature = load(root, id)
  ensureActive(feature.run)
  if (feature.run.phase !== 'verify') die('run must be in verify phase before finish', 5, { phase: feature.run.phase })
  if (feature.run.approval_required && !feature.run.approval) die('material approval is missing', 5, { id })

  // The kit's own principle, applied to its newest surface: a workflow step
  // the model was asked to perform but can silently skip is not a step, it is
  // a suggestion. Each of these is recordable, so each is checked. A run may
  // still close without one - deliberately, by naming it - and the bypass
  // lands in the delivery report rather than disappearing.
  const gaps = []
  if (feature.run.routing?.risk_assessed === false) {
    gaps.push({ gap: 'risk', why: 'risk was never assessed, so specialists were selected by keyword alone' })
  }
  if (!feature.run.lenses) {
    gaps.push({ gap: 'lenses', why: 'lens selection was never recorded, so no domain depth is evidenced' })
  }
  if (feature.run.audit?.revision !== feature.run.revision) {
    gaps.push({
      gap: 'audit',
      why: feature.run.audit
        ? `the deterministic audit inspected revision ${feature.run.audit.revision}, not the current ${feature.run.revision}`
        : 'the deterministic audit never ran',
    })
  }
  const blockingGaps = gaps.filter((item) => !accepted.has(item.gap))
  if (blockingGaps.length) {
    die('required workflow steps did not happen', 5, {
      id,
      gaps: blockingGaps,
      resolve: `perform the missing step, or re-run finish with --accept-gaps ${blockingGaps.map((g) => g.gap).join(',')} to close anyway; every accepted gap is named in the delivery report`,
    })
  }
  feature.run.accepted_gaps = gaps.length ? gaps : undefined
  const roles = new Set(feature.run.contributions.map((item) => item.role))
  const missing = feature.run.team.filter((role) => !roles.has(role))
  if (missing.length) die('every selected expert must contribute before completion', 5, { missing })
  if (feature.run.kind !== 'audit') {
    const candidateReviews = new Set(feature.run.contributions
      .filter((item) => item.phase === 'verify' && item.revision === feature.run.revision)
      .map((item) => item.role))
    const missingCandidateReviews = feature.run.team
      .filter((role) => SPECIALIST_ROLES.includes(role) && !candidateReviews.has(role))
    if (missingCandidateReviews.length) {
      die('selected named specialists must inspect the current candidate during verification', 5, { missing: missingCandidateReviews, revision: feature.run.revision })
    }
  }
  const verifierReview = feature.run.contributions.find((item) =>
    item.role === 'verifier' && item.phase === 'verify' && item.revision === feature.run.revision)
  if (!verifierReview) {
    die('Verifier must record a fresh review of the current candidate before finish', 5, { id, revision: feature.run.revision })
  }
  // Per-kind acceptance: most of it is judgment the Verifier owns, but a
  // refactor that rewrote its own tests is mechanically checkable, so check it.
  if (feature.run.kind === 'refactor' && !args.includes('--tests-changed-justified')) {
    const touched = changedTestFiles(root, feature.run.baseline?.head)
    if (touched && touched.length) {
      die('a refactor changed test files, so behaviour preservation is unproven', 5, {
        acceptance: ACCEPTANCE.refactor?.means ?? 'behaviour is unchanged',
        changed_tests: touched.slice(0, 20),
        resolve: 'restore the tests and re-run them unmodified, or pass --tests-changed-justified and explain in the report why each edit fixes a test defect rather than accommodating a behaviour change',
      })
    }
  }
  feature.run.acceptance = ACCEPTANCE[feature.run.kind] ?? null
  feature.run.tests_changed_justified = args.includes('--tests-changed-justified') || undefined
  feature.run.brief_sha_at_finish = briefDigest(root, id)
  feature.run.status = 'done'
  feature.run.phase = 'done'
  feature.run.summary = summary
  feature.run.verification = verification
  feature.run.result = result
  save(feature.path, feature.run)
  output({ ok: true, id, status: 'done', summary, verification, result: feature.run.result })
}

// Rendered from the ledger, never composed from memory. A model-written
// summary reports what it remembers; this reports what was recorded, which is
// the only version that can be used to judge whether routing worked.
function report() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const { run } = load(root, id)
  const byRole = (role) => run.contributions.filter((item) => item.role === role)
  const out = []

  const verdict = run.result ?? (run.status === 'active' ? `in progress (${run.phase})` : run.status)
  out.push(`## ${run.title} — ${verdict}`, '')

  const risk = run.routing?.risk_assessed === false
    ? '**NOT ASSESSED**'
    : (run.risks?.length ? `\`${run.risks.join(', ')}\`` : 'none declared')
  out.push(`**Routing** · tier \`${run.tier}\` · risk ${risk} · ${run.routing?.tier_reason ?? 'no reason recorded'}`, '')

  out.push('| Expert | Why selected | Contribution |', '|---|---|---|')
  for (const role of run.team) {
    const mine = byRole(role)
    const last = mine[mine.length - 1]
    const passes = mine.length > 1 ? ` _(${mine.length} passes)_` : ''
    const why = run.routing?.selected?.[role] ?? 'not recorded'
    out.push(`| **${role}** | ${why} | ${last ? last.summary + passes : '_no contribution recorded_'} |`)
  }
  out.push('')

  // The routing ROI line: a specialist that is selected and never catches
  // anything is over-triggered; a defect in a skipped role's boundary is
  // under-triggered. Both are only visible if findings are attributed.
  const caught = run.contributions.filter((item) => item.severity && item.severity !== 'none')
  if (caught.length) {
    out.push('**Caught**')
    for (const item of caught) {
      out.push(`- ${item.role} r${item.revision} — ${item.summary} _(${item.severity})_`)
    }
    out.push('')
  }

  const lens = run.lenses
  if (lens) {
    const pairs = Object.entries(lens.attached ?? {})
    if (pairs.length) {
      out.push(`**Lenses** · ${pairs.map(([role, list]) => `${list.join(' + ')} → ${role}`).join(' · ')}`)
      if (lens.derived_from_project?.length) {
        out.push(`  _derived from the project: ${lens.derived_from_project.slice(0, 8).join(', ')}_`)
      }
      out.push('')
    }
    if (lens.unavailable?.length) {
      out.push(`> **Lens unavailable.** ${lens.unavailable.join(', ')} — the domain was detected but no lens covers it. Any depth claimed there was not checked against a source.`, '')
    }
    if (lens.stale?.length) {
      out.push(`> **Lens stale.** ${lens.stale.join(', ')} — past its review date. Treat its thresholds as unverified.`, '')
    }
    if (lens.assessed === false) {
      out.push('> **Lens note.** No domain input and no survey, so no domain depth was applied. That is untested, not clean.', '')
    }
  }

  const skipped = Object.entries(run.routing?.skipped ?? {})
  if (skipped.length) {
    out.push(`**Skipped** · ${skipped.map(([role, why]) => `\`${role}\` (${why})`).join(' · ')}`, '')
  }

  if (run.audit) {
    const failed = (run.audit.checks ?? []).filter((c) => c.status !== 'OK')
    out.push(`**Audit** · revision ${run.audit.revision} · ${run.audit.verdict}`
      + (failed.length ? ` · needs review: ${failed.map((c) => c.check).join(', ')}` : ''))
  }
  if (run.verification) out.push(`**Checks** · ${run.verification}`)
  const cycles = Math.max(0, (run.revision ?? 1) - 1)
  out.push(`**Loop** · ${run.revision} revision(s) · repair cycle ${cycles} of 2`)
  out.push(`**Approval** · ${run.approval ? `recorded ${run.approval.at}` : (run.approval_required ? 'REQUIRED, not yet recorded' : 'not required')}`)

  if (run.approval?.brief_sha && run.brief_sha_at_finish && run.approval.brief_sha !== run.brief_sha_at_finish) {
    out.push('', '> **Scope note.** The brief changed after approval. Compare the delivered change against what was approved before releasing.')
  }
  for (const item of run.accepted_gaps ?? []) {
    out.push('', `> **Accepted gap: ${item.gap}.** ${item.why}. This run was closed without it, deliberately.`)
  }
  if (run.routing?.risk_assessed === false) {
    out.push('', '> **Routing note.** Risk was never assessed for this run, so specialists were selected by keyword alone. Treat any absent review as unverified rather than unnecessary.')
  }

  process.stdout.write(`${out.join('\n')}\n`)
}

// Deterministic half of the release audit. These are the questions a script
// can settle by exit code; everything else - are the tests meaningful, did
// scope creep under a plausible justification, is the residual risk acceptable
// - stays with the Verifier. This is INPUT to that judgment, never a
// replacement for it.
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'private key block'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9]{32,}\b/, 'API secret key'],
  [/\b(?:postgres|mysql|mongodb)(?:\+srv)?:\/\/[^\s:@\/]+:[^\s@\/]+@/, 'connection string with inline password'],
  [/\b(?:secret|password|passwd|token|api[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'assigned literal credential'],
]
const SCHEMA_PATH = /(^|[\/\\])(migrations?|schema)[\/\\]|\.sql$|(^|[\/\\])schema\.(prisma|rb|py)$/i
const MIGRATION_PATH = /(^|[\/\\])migrations?[\/\\]/i

function git(root, argv) {
  try {
    return execFileSync('git', argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch { return null }
}

function audit() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const { run } = load(root, id)
  const from = run.baseline?.head
  const findings = []
  const checks = []
  const add = (name, status, detail) => checks.push({ check: name, status, detail })

  if (!from) {
    add('baseline', 'UNKNOWN', 'no git baseline recorded at start; scope checks cannot run')
  }

  // `git diff` only sees tracked files, so a brand-new untracked file - the
  // most likely place for a leaked credential to sit - would be invisible to
  // every check below. Include untracked files and treat them as wholly added.
  const tracked = from
    ? (git(root, ['diff', '--name-only', from]) ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    : []
  const untracked = (git(root, ['ls-files', '--others', '--exclude-standard']) ?? '')
    .split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((name) => !name.startsWith('.dev/'))
  const names = [...new Set([...tracked, ...untracked])]
  const diff = from ? (git(root, ['diff', '--unified=0', from]) ?? '') : ''
  const added = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  for (const name of untracked) {
    try { added.push(...readFileSync(join(root, name), 'utf8').split('\n')) } catch { /* binary or unreadable */ }
  }

  // 1. Scope: every changed file should appear in the approved brief.
  const briefFile = briefPath(root, id)
  if (existsSync(briefFile) && names.length) {
    const brief = readFileSync(briefFile, 'utf8')
    const unplanned = names.filter((name) => !brief.includes(name))
    add('scope', unplanned.length ? 'REVIEW' : 'OK',
      unplanned.length ? `${unplanned.length} changed file(s) are not named in the brief` : `${names.length} changed file(s), all named in the brief`)
    for (const name of unplanned.slice(0, 20)) {
      findings.push({ check: 'scope', severity: 'medium', detail: `${name} changed but is not named in the approved brief` })
    }
  } else if (names.length) {
    add('scope', 'UNKNOWN', 'no brief to compare the changed files against')
  }

  // 2. Secrets introduced by this change, in ADDED lines only.
  let secrets = 0
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (added.some((line) => pattern.test(line))) {
      secrets++
      findings.push({ check: 'secrets', severity: 'critical', detail: `added line matches ${label}` })
    }
  }
  add('secrets', secrets ? 'FAIL' : 'OK', secrets ? `${secrets} pattern(s) matched in added lines` : 'no known credential pattern in added lines')

  // 3. A changed schema with no migration alongside it.
  const schemaTouched = names.filter((name) => SCHEMA_PATH.test(name))
  const migrationTouched = names.some((name) => MIGRATION_PATH.test(name))
  if (schemaTouched.length) {
    const ok = migrationTouched
    add('migration', ok ? 'OK' : 'REVIEW',
      ok ? 'schema change ships with a migration' : 'schema changed with no migration file in the diff')
    if (!ok) findings.push({ check: 'migration', severity: 'high', detail: `${schemaTouched[0]} changed but no migration file is present in the diff` })
  }

  // 4. Tests. A refactor must not touch them; anything else probably should.
  const testsTouched = changedTestFiles(root, from) ?? []
  if (run.kind === 'refactor') {
    add('tests', testsTouched.length ? 'FAIL' : 'OK',
      testsTouched.length ? `refactor changed ${testsTouched.length} test file(s); behaviour preservation is unproven` : 'existing tests unmodified')
    if (testsTouched.length) findings.push({ check: 'tests', severity: 'high', detail: 'a refactor changed its own tests' })
  } else if (names.length) {
    add('tests', testsTouched.length ? 'OK' : 'REVIEW',
      testsTouched.length ? `${testsTouched.length} test file(s) changed` : 'no test file changed by this work')
    if (!testsTouched.length) findings.push({ check: 'tests', severity: 'medium', detail: 'no test changed; confirm the behaviour is covered by an existing one' })
  }

  // 5. Acceptance criteria declared in the brief, versus evidenced in results.
  if (existsSync(briefFile)) {
    const brief = readFileSync(briefFile, 'utf8')
    const ids = [...new Set([...brief.matchAll(/\bAC-\d+\b/g)].map((m) => m[0]))]
    if (ids.length) {
      const dir = join(workRoot(root), id, 'results')
      const evidence = existsSync(dir)
        ? readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
        : ''
      const unevidenced = ids.filter((ac) => !evidence.includes(ac))
      add('acceptance', unevidenced.length ? 'REVIEW' : 'OK',
        unevidenced.length ? `${unevidenced.join(', ')} not referenced by any expert result` : `${ids.length} criterion/criteria referenced in results`)
      for (const ac of unevidenced) {
        findings.push({ check: 'acceptance', severity: 'high', detail: `${ac} is declared in the brief but referenced by no expert result` })
      }
    }
  }

  // 6. Did the contract move after it was approved?
  if (run.approval?.brief_sha) {
    const now = briefDigest(root, id)
    const drifted = now && now !== run.approval.brief_sha
    add('brief-drift', drifted ? 'REVIEW' : 'OK',
      drifted ? 'the brief changed after approval' : 'the brief matches what was approved')
    if (drifted) findings.push({ check: 'brief-drift', severity: 'high', detail: 'the approved contract was edited after approval' })
  }

  const blocking = findings.filter((f) => ['critical', 'high'].includes(f.severity))

  // Pin the audit to the revision it inspected, exactly as a Verifier review
  // is pinned. A repair increments the revision, so an audit of the previous
  // candidate cannot be carried forward to close the repaired one.
  const feature = load(root, id)
  if (feature.run.status === 'active') {
    feature.run.audit = {
      revision: feature.run.revision,
      at: new Date().toISOString(),
      verdict: blocking.length ? 'BLOCKING FINDINGS' : 'CLEAR',
      blocking: blocking.length,
      checks: checks.map((c) => ({ check: c.check, status: c.status })),
    }
    save(feature.path, feature.run)
  }

  output({
    ok: blocking.length === 0,
    id,
    kind: run.kind,
    changed_files: names.length,
    checks,
    findings,
    verdict: blocking.length ? 'BLOCKING FINDINGS' : 'NO BLOCKING MECHANICAL FINDINGS',
    note: 'Deterministic checks only. Whether the tests are meaningful, whether scope crept, and whether residual risk is acceptable remain the Verifier\'s judgment.',
  })
}

function cancel() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const feature = load(root, id)
  ensureActive(feature.run)
  feature.run.status = 'cancelled'
  feature.run.phase = 'cancelled'
  feature.run.summary = option('--reason', 'Cancelled by user.')
  save(feature.path, feature.run)
  output({ ok: true, id, status: 'cancelled' })
}

function help() {
  process.stdout.write(`ae-forge

Internal recovery ledger for the autonomous Forge workflow.

  start  --title TEXT --kind KIND --risk FLAGS [--domain a,b] [--signals a,b]
         [--tier quick|standard|deep]
  list
  status --id ID
  note   --id ID --role ROLE --summary TEXT [--severity S] [--result PATH]
  phase  --id ID --to PHASE --summary TEXT
  brief  --id ID [--force]
  lenses --id ID --json '<lens-select.mjs output>'
  approve --id ID [--by NAME] [--basis TEXT]
  audit  --id ID          (deterministic release checks; input to Verifier)
  report --id ID
  finish --id ID --summary TEXT --verification TEXT [--result TEXT]
         [--tests-changed-justified]   (refactor only; explain in the report)
         [--accept-gaps risk,lenses,audit]  (close without a required step;
          each accepted gap is named in the delivery report)
  cancel --id ID [--reason TEXT]

--risk is the router. Answer the behavioural questions in team.json and pass
every flag that is true, or 'none' when none are. Omitting it is recorded as
"risk not assessed" and shown in the delivery report.

  access        changes who can read, do, or reach anything
  stored-shape  changes persisted shape, or moves or deletes data
  rendered      changes a rendered surface or a user journey
  runtime       changes external calls, concurrency, retries, perf budget
  irreversible  destructive, production-affecting, spending, public contract

All commands accept --root DIR. Users do not need to run these commands.
`)
}

const handlers = { help, start, brief, lenses, list, status, note, phase, approve, audit, report, finish, cancel }
if (!handlers[command]) die('unknown command', 2, { command })
handlers[command]()
