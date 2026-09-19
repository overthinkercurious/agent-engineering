#!/usr/bin/env node

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
  feature.run.contributions.push({ role, phase: feature.run.phase, revision: feature.run.revision, summary, at: new Date().toISOString() })
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

function approve() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const feature = load(root, id)
  ensureActive(feature.run)
  feature.run.approval = {
    by: option('--by', 'user'),
    at: new Date().toISOString(),
    basis: option('--basis', 'Explicit approval in the active conversation.'),
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
  const feature = load(root, id)
  ensureActive(feature.run)
  if (feature.run.phase !== 'verify') die('run must be in verify phase before finish', 5, { phase: feature.run.phase })
  if (feature.run.approval_required && !feature.run.approval) die('material approval is missing', 5, { id })
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
  feature.run.status = 'done'
  feature.run.phase = 'done'
  feature.run.summary = summary
  feature.run.verification = verification
  feature.run.result = result
  save(feature.path, feature.run)
  output({ ok: true, id, status: 'done', summary, verification, result: feature.run.result })
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
  note   --id ID --role ROLE --summary TEXT
  phase  --id ID --to PHASE --summary TEXT
  approve --id ID [--by NAME] [--basis TEXT]
  finish --id ID --summary TEXT --verification TEXT [--result TEXT]
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

const handlers = { help, start, list, status, note, phase, approve, finish, cancel }
if (!handlers[command]) die('unknown command', 2, { command })
handlers[command]()
