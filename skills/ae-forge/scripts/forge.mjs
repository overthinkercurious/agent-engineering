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

function chooseTier(kind, signals) {
  const requested = option('--tier')
  if (requested && !TIERS.includes(requested)) die(`tier must be one of: ${TIERS.join(', ')}`)
  const inferred = kind === 'security' || signals.some((value) => RISK_SIGNALS.has(value))
    ? 'deep'
    : signals.length && signals.every((value) => QUICK_SIGNALS.has(value))
      ? 'quick'
      : 'standard'
  if (!requested) return inferred
  return TIERS[Math.max(TIERS.indexOf(requested), TIERS.indexOf(inferred))]
}

function chooseTeam(kind, tier, signals) {
  const specialists = SPECIALIST_ROLES.filter((role) =>
    TEAM.signals[role].some((signal) => signals.includes(signal)) ||
    (kind === 'security' && role === 'security') ||
    (kind === 'performance' && role === 'reliability'))
  if (kind === 'audit') {
    const auditTeam = []
    if (tier !== 'quick') auditTeam.push('architect')
    return [...new Set([...auditTeam, ...specialists, 'verifier'])]
  }
  const optional = []
  if (tier !== 'quick') optional.push('architect')
  if (kind === 'bug' || kind === 'performance' || signals.includes('unknown')) optional.push('investigator')
  else if (kind === 'idea' || signals.includes('ambiguous') || signals.includes('product')) optional.push('product')
  return [...new Set([...optional, ...specialists, 'builder', 'verifier'])]
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
  const tier = chooseTier(kind, signals)
  const now = new Date().toISOString()
  const run = {
    schema: 1,
    id,
    title,
    kind,
    signals,
    tier,
    team: chooseTeam(kind, tier, signals),
    approval_required: parseBoolean('--approval-required', tier === 'deep' && kind !== 'audit'),
    approval: null,
    status: 'active',
    phase: 'understand',
    summary: 'Run created.',
    contributions: [],
    verification: null,
    result: null,
    created_at: now,
    updated_at: now,
  }
  save(path, run)
  output({ ok: true, id, tier, team: run.team, approval_required: run.approval_required, record: relative(root, path).replaceAll('\\', '/') })
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
      .filter((item) => item.phase === 'verify')
      .map((item) => item.role))
    const missingCandidateReviews = feature.run.kind === 'audit' ? [] : feature.run.team
      .filter((selected) => SPECIALIST_ROLES.includes(selected) && !reviewedCandidate.has(selected))
    const missing = [...new Set([...missingPrior, ...missingCandidateReviews])]
    if (missing.length) die('Verifier must run after all selected expert work', 5, { missing })
  }
  feature.run.contributions.push({ role, phase: feature.run.phase, summary, at: new Date().toISOString() })
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
      .filter((item) => item.phase === 'verify')
      .map((item) => item.role))
    const missingCandidateReviews = feature.run.team
      .filter((role) => SPECIALIST_ROLES.includes(role) && !candidateReviews.has(role))
    if (missingCandidateReviews.length) {
      die('selected named specialists must inspect the candidate during verification', 5, { missing: missingCandidateReviews })
    }
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

  start  --title TEXT --kind KIND [--signals a,b] [--tier quick|standard|deep]
  list
  status --id ID
  note   --id ID --role ROLE --summary TEXT
  phase  --id ID --to PHASE --summary TEXT
  approve --id ID [--by NAME] [--basis TEXT]
  finish --id ID --summary TEXT --verification TEXT [--result TEXT]
  cancel --id ID [--reason TEXT]

All commands accept --root DIR. Users do not need to run these commands.
`)
}

const handlers = { help, start, list, status, note, phase, approve, finish, cancel }
if (!handlers[command]) die('unknown command', 2, { command })
handlers[command]()
