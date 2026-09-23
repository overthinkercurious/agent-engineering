#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
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
const DEEP_RISKS = new Set(['access', 'stored-shape', 'irreversible'])

const RISK = TEAM.risk ?? {}
const RISK_FLAGS = Object.keys(RISK)

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

// The artifact lives OUTSIDE .dev/work/ deliberately. work/ is gitignored raw
// evidence - transcripts, per-role results, things that may carry sensitive
// material. The artifact is the opposite: the one document a human reads, a
// reviewer approves, and a fresh agent resumes from, so it is committed.
//
// In a split pipeline this file is also the only channel between roles. Each
// role is invoked separately and inherits nothing, so a decision that lives
// only in a previous role's context does not exist. That is the constraint
// the self-sufficiency rule encodes, not a documentation preference.
function runsRoot(root) {
  const path = join(root, '.dev', 'runs')
  for (const candidate of [join(root, '.dev'), path]) {
    if (existsSync(candidate) && !inside(root, realpathSync(candidate))) {
      die('runs directory resolves outside project root')
    }
  }
  if (!inside(root, path)) die('runs directory escapes project root')
  return path
}

function artifactPath(root, id) {
  const path = join(runsRoot(root), `${safeId(id)}.md`)
  if (!inside(root, path)) die('artifact path escapes project root')
  return path
}

// Section -> the single role permitted to write it. One owner per section is
// what stops two roles issuing competing answers to the same question, and it
// is checkable, so it is checked rather than asked for.
const SECTIONS = {
  request: { title: 'Request', owner: null },
  status: { title: 'Status', owner: null },
  'stage-log': { title: 'Stage log', owner: null },
  'open-questions': { title: 'Open questions', owner: null },
  decisions: { title: 'Decisions', owner: null },
  investigation: { title: 'Investigation', owner: 'investigator' },
  plan: { title: 'Plan', owner: 'architect' },
  'plan-review': { title: 'Plan review', owner: 'plan-reviewer' },
  approval: { title: 'Approval', owner: null },
  implementation: { title: 'Implementation', owner: 'builder' },
  verification: { title: 'Verification', owner: 'verifier' },
  audit: { title: 'Audit', owner: 'auditor' },
  summary: { title: 'Summary', owner: null },
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
function chooseTier(kind, risks) {
  const requested = option('--tier')
  if (!requested && kind !== 'audit') die('--tier is required for a delivery run: assess size, reversibility, and design risk')
  if (requested && !TIERS.includes(requested)) die(`tier must be one of: ${TIERS.join(', ')}`)
  const floor = kind === 'security' || risks.some((flag) => DEEP_RISKS.has(flag)) ? 'deep' : 'quick'
  return TIERS[Math.max(TIERS.indexOf(requested ?? 'standard'), TIERS.indexOf(floor))]
}

function tierReason(kind, risks, tier) {
  if (kind === 'security') return 'kind=security'
  const flag = risks.find((value) => DEEP_RISKS.has(value))
  if (flag) return `minimum deep tier: risk=${flag}`
  return `assessed ${tier} from scope, reversibility, and design risk`
}

// Returns both the team and why each role was selected or skipped, so the
// delivery report can show the routing decision instead of the model
// recalling it. A skipped role with no recorded reason is a routing bug.
function chooseTeam(kind, tier, signals, risks, cause) {
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

  if (tier !== 'quick') {
    take('architect', 'tier is standard or deeper')
    if (tier === 'deep') take('plan-reviewer', 'deep design risk merits a separate plan review')
    else skipped['plan-reviewer'] = 'standard tier: Verifier reviews the delivered result'
  } else {
    skipped.architect = 'quick tier: no open design choice'
    skipped['plan-reviewer'] = 'quick tier: no plan to review'
  }

  if (((kind === 'bug' || kind === 'performance') && cause !== 'known') || signals.includes('unknown')) {
    take('investigator', 'cause not demonstrated')
  } else skipped.investigator = 'cause already demonstrated or no defect to diagnose'

  if (kind === 'idea' || signals.includes('ambiguous') || signals.includes('product')) {
    take('product', kind === 'idea' ? 'kind=idea' : 'outcome is materially ambiguous')
  } else skipped.product = 'requested outcome is already specified'

  if (kind === 'audit') {
    // A cold audit has no plan and no diff, so the two roles whose whole job
    // is comparing against one are not merely unused here - they would have
    // nothing to read. Auditor replaces them: it reads the repository as it
    // stands, which is a different question from "is this change correct".
    for (const role of ['builder', 'architect', 'plan-reviewer']) delete selected[role]
    skipped.builder = 'audit-only: cannot modify code'
    skipped.architect = 'audit-only: nothing is being designed'
    skipped['plan-reviewer'] = 'audit-only: there is no plan to review'
    delete skipped.investigator
    delete skipped.product
    take('auditor', 'owns the cold assessment of the repository as it stands')
    take('verifier', 'owns the audit verdict')
  } else {
    skipped.auditor = 'not a cold audit: this run has a change to judge'
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
// The enforcement tier is read, never assumed - the same rule the dispatch
// tier already follows. The marker exists only because the SessionStart hook
// actually ran in this session, so its presence is evidence rather than a
// claim. Absent means 'none', and 'none' is the honest default.
function enforceTier(root) {
  try {
    const path = join(root, '.dev', 'context', 'enforce.json')
    if (!existsSync(path)) return 'none'
    const marker = JSON.parse(readFileSync(path, 'utf8'))
    return marker.enforce === 'native' ? 'native' : 'none'
  } catch { return 'none' }
}

const KIT_PATH = /(^|\/)skills\/ae-[^/]+\//
const SNAPSHOT_FILE_LIMIT = 1024 * 1024
const SNAPSHOT_TOTAL_LIMIT = 4 * SNAPSHOT_FILE_LIMIT

function gitNames(root, argv) {
  const selfHosted = git(root, ['ls-files', '--error-unmatch', 'skills/ae-forge/SKILL.md']) !== null
  return (git(root, [...argv, '-z']) ?? '').split('\0').filter(Boolean)
    .filter((name) => !name.startsWith('.dev/') && (selfHosted || !KIT_PATH.test(name)))
}

function fileDigest(path) {
  try { return createHash('sha256').update(readFileSync(path)).digest('hex') } catch { return null }
}

function contextStatus(root) {
  const analysisPath = join(root, '.dev', 'context', 'analysis.json')
  if (!existsSync(analysisPath)) return { analysis: 'missing', knowledge: 'unknown' }
  try {
    const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
    if (analysis.schema !== TEAM.analysis_schema) {
      return { analysis: 'schema-mismatch', expected: TEAM.analysis_schema, found: analysis.schema ?? null, knowledge: 'unknown' }
    }
    const indexPath = join(root, '.dev', 'knowledge', '00-index.md')
    if (!existsSync(indexPath)) return { analysis: 'current', knowledge: 'absent' }
    const snapshot = readFileSync(indexPath, 'utf8').match(/<!-- agent-engineering:snapshot:([a-f0-9]+) -->/)?.[1]
    return { analysis: 'current', knowledge: snapshot && snapshot === analysis.provenance?.fingerprint ? 'current' : 'stale' }
  } catch { return { analysis: 'unreadable', knowledge: 'unknown' } }
}

function baseline(root, id) {
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
  const files = {}
  let copied = 0
  if (head) {
    const dirty = gitNames(root, ['diff', '--name-only', '--no-renames', 'HEAD'])
    const untracked = gitNames(root, ['ls-files', '--others', '--exclude-standard'])
    for (const name of new Set([...dirty, ...untracked])) {
      const absolute = resolve(root, name)
      if (!inside(root, absolute)) continue
      const entry = { initial: untracked.includes(name) ? 'untracked' : 'tracked', existed: false }
      try {
        const state = lstatSync(absolute)
        if (!state.isFile()) { entry.limitation = 'not a regular file'; files[name] = entry; continue }
        entry.existed = true
        entry.sha256 = fileDigest(absolute)
        if (state.size > SNAPSHOT_FILE_LIMIT || copied + state.size > SNAPSHOT_TOTAL_LIMIT) {
          entry.limitation = 'baseline file exceeds snapshot limit'
        } else {
          const snapshot = join(workRoot(root), id, 'baseline', createHash('sha256').update(name).digest('hex'))
          mkdirSync(dirname(snapshot), { recursive: true })
          copyFileSync(absolute, snapshot)
          entry.snapshot = relative(root, snapshot).replaceAll('\\', '/')
          copied += state.size
        }
      } catch { entry.limitation = 'baseline file unreadable or deleted' }
      files[name] = entry
    }
  }
  return { head, analysis: map, files, at: new Date().toISOString() }
}

const ACCEPTANCE = TEAM.acceptance ?? {}
const TEST_PATH = /(^|[\/\\])(tests?|spec|__tests__)[\/\\]|[._-](test|spec)\.[a-z]+$|(^|[\/\\])test_[^\/\\]+$/i

// A refactor is correct precisely when behaviour did not change, so rewriting
// its own tests is the one signal that contradicts the claim. This is the rare
// acceptance rule a script can settle, so a script settles it - the model is
// asked to justify, not to self-assess.
//
// Tracked-only is deliberate here, not an oversight: a wholly new untracked
// test file is ordinary added coverage, not evidence of hiding a behaviour
// change. The risk this check exists for is *rewriting an existing test*, so
// widening it to untracked files would flag the safe case as if it were the
// dangerous one. `includeUntracked` exists for the one other caller that
// wants the opposite question answered - "was any test touched at all" - not
// this one.
function changedTestFiles(root, baseline, includeUntracked = false) {
  if (!baseline?.head) return null
  const diff = taskDiff(root, baseline)
  return diff.names.filter((name) => TEST_PATH.test(name) &&
    (includeUntracked || !diff.untracked.includes(name)))
}

function taskDiff(root, baseline) {
  const from = baseline?.head
  const tracked = from ? gitNames(root, ['diff', '--name-only', '--no-renames', from]) : []
  const untracked = gitNames(root, ['ls-files', '--others', '--exclude-standard'])
  const names = []
  const added = []
  const uncertain = []
  let preexistingUnchanged = 0
  for (const name of new Set([...tracked, ...untracked])) {
    const prior = baseline?.files?.[name]
    const absolute = resolve(root, name)
    if (!inside(root, absolute)) continue
    if (prior && (!prior.existed && !existsSync(absolute) ||
      (prior.existed && prior.sha256 && prior.sha256 === fileDigest(absolute)))) {
      preexistingUnchanged++
      continue
    }
    names.push(name)
    if (prior) {
      if (!prior.snapshot) { uncertain.push(name); continue }
      const previous = resolve(root, prior.snapshot)
      if (!inside(root, previous) || !existsSync(previous)) { uncertain.push(name); continue }
      const comparison = spawnSync('git', ['diff', '--no-index', '--unified=0', '--', previous, absolute],
        { cwd: root, encoding: 'utf8' })
      if (comparison.error || comparison.status > 1) { uncertain.push(name); continue }
      added.push(...(comparison.stdout ?? '').split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')))
    } else if (untracked.includes(name)) {
      try { added.push(...readFileSync(absolute, 'utf8').split('\n')) } catch { uncertain.push(name) }
    } else if (from) {
      const diff = git(root, ['diff', '--unified=0', from, '--', name]) ?? ''
      added.push(...diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')))
    }
  }
  return { names, added, untracked, uncertain, preexistingUnchanged }
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
    '_This brief is the implementation contract. It is frozen at approval',
    'when approval is required, or at the start of build otherwise. The audit',
    'compares the delivered change against that frozen text._',
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

// The artifact is scaffolded once and filled section by section. It is
// deliberately not composed at the end: a role that holds its result only in
// context loses it the moment the next role is invoked with a clean one.
function artifactSkeleton(run) {
  const lines = [
    `# ${run.title}`, '',
    `> Forge · contract v${run.contract ?? TEAM.version} · run \`${run.id}\``,
    `> ${run.tier} · ${run.kind} · risk: ${run.risks?.length ? run.risks.join(', ') : (run.routing?.risk_assessed ? 'none declared' : 'NOT ASSESSED')}`,
    `> Team: ${run.team.join(' → ')}`,
    '',
    '_Every section below has one owner. Isolated stages use this file as their',
    'handoff; same-session stages re-open its evidence. A reader who has seen',
    'none of this run should be able to review and implement from it alone._',
    '',
  ]
  for (const [key, meta] of Object.entries(SECTIONS)) {
    lines.push(`<!-- forge:section:${key} -->`, `## ${meta.title}`, '')
    if (key === 'request') lines.push(run.title, '')
    else if (key === 'status') lines.push(`ACTIVE · phase ${run.phase}`, '')
    else if (key === 'stage-log') lines.push('| # | Role | Phase | Revision | Result |', '|---:|---|---|---:|---|', '')
    else lines.push(`_pending — owned by ${meta.owner ?? 'Forge'}_`, '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

// One parser, used by both the writer and the completion check. Two
// implementations of "where does this section start and end" is how a section
// can be written by one and read as empty by the other.
function sectionBounds(doc, name) {
  const marker = `<!-- forge:section:${name} -->`
  const start = doc.indexOf(marker)
  if (start === -1) return null
  const after = doc.indexOf('<!-- forge:section:', start + marker.length)
  return { marker, start, end: after === -1 ? doc.length : after }
}

function sectionBody(doc, name) {
  const at = sectionBounds(doc, name)
  if (!at) return null
  return doc.slice(at.start + at.marker.length, at.end)
    .replace(/^\s*##[^\n]*\n/, '')
    .trim()
}

// A section still carrying its scaffolded placeholder was never written. The
// role recorded a ledger note and skipped the document, which is the failure
// mode this kit refuses to accept anywhere else: a step that can be silently
// skipped is a suggestion, not a step.
function unwrittenSections(root, id, run) {
  const path = artifactPath(root, id)
  const owed = Object.entries(SECTIONS)
    .filter(([, meta]) => meta.owner && run.contributions.some((item) => item.role === meta.owner))
    .map(([name, meta]) => ({ name, owner: meta.owner }))
  if (!owed.length) return []
  if (!existsSync(path)) return owed.map((s) => ({ ...s, why: 'no artifact was ever scaffolded' }))
  const doc = readFileSync(path, 'utf8')
  return owed
    .filter(({ name }) => {
      const body = sectionBody(doc, name)
      return body === null || body === '' || /^_pending\b/.test(body)
    })
    .map((s) => ({ ...s, why: 'the section is still the scaffolded placeholder' }))
}

function artifact() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const { run } = load(root, id)
  const path = artifactPath(root, id)
  if (existsSync(path) && !args.includes('--force')) {
    die('artifact already exists; write sections into it or pass --force to rescaffold', 4, { id })
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, artifactSkeleton(run), 'utf8')
  output({
    ok: true, id, artifact: relative(root, path).replaceAll('\\', '/'),
    sections: Object.keys(SECTIONS),
  })
}

function section() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const name = option('--name')
  const from = option('--from')
  if (!SECTIONS[name]) die(`--name must be one of: ${Object.keys(SECTIONS).join(', ')}`)
  if (!from) die('--from is required: the file holding this section\'s body')
  const { run } = load(root, id)
  const owner = SECTIONS[name].owner
  // One owner per section, enforced rather than requested. A role writing
  // another role's section is how a plan quietly acquires its own approval.
  if (owner && !run.team.includes(owner)) {
    die('this section\'s owner is not on the team for this run', 5, { section: name, owner, team: run.team })
  }
  const source = resolve(root, from)
  if (!inside(root, source)) die('--from escapes the project root', 2, { from })
  if (!existsSync(source)) die('--from file does not exist', 2, { from: source })
  const path = artifactPath(root, id)
  if (!existsSync(path)) die('no artifact yet; run `artifact --id <id>` first', 4, { id })

  const body = readFileSync(source, 'utf8').trim()
  if (!body) die('--from file is empty; an empty section is not a written one', 2, { from })
  const doc = readFileSync(path, 'utf8')
  const at = sectionBounds(doc, name)
  if (!at) die('artifact is missing this section marker; rescaffold it', 4, { section: name })
  const heading = `## ${SECTIONS[name].title}`
  const replaced = `${at.marker}\n${heading}\n\n${body}\n\n`
  writeFileSync(path, doc.slice(0, at.start) + replaced + doc.slice(at.end), 'utf8')
  output({ ok: true, id, section: name, owner: owner ?? 'forge', bytes: body.length })
}

function allowedPhases(role) {
  if (role === 'builder') return ['build', 'repair']
  if (role === 'verifier') return ['verify']
  // Plan Reviewer reads a plan, never a candidate. Letting it contribute
  // during verify would make it a second Verifier with none of the evidence,
  // and two roles answering "is this correct" is the seam where contradictory
  // findings appear.
  if (role === 'plan-reviewer') return ['plan']
  // Auditor is cold by construction: it reads the repository, not a diff, so
  // it works before anything is built and never re-inspects a candidate.
  if (role === 'auditor') return ['understand']
  if (SPECIALIST_ROLES.includes(role)) return ['understand', 'plan', 'verify']
  return ['understand', 'plan']
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
  if (option('--approval-required') !== null) die('--approval-required is retired; pass --approval-reason none or the material decision')
  const approvalReason = kind === 'audit' ? 'none' : option('--approval-reason')?.trim()
  if (!approvalReason) die('--approval-reason none|TEXT is required for delivery work')
  const cause = option('--cause') ?? ((kind === 'bug' || kind === 'performance') ? 'unknown' : null)
  if (cause && !['known', 'unknown'].includes(cause)) die('--cause must be known or unknown')
  const causeEvidence = option('--cause-evidence')?.trim() ?? null
  if (cause === 'known' && !causeEvidence) die('--cause-evidence is required when the cause is known')
  const domains = [...new Set(String(option('--domain', ''))
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))]
  const tier = chooseTier(kind, risks)
  const routing = chooseTeam(kind, tier, signals, risks, cause)
  const now = new Date().toISOString()
  const run = {
    schema: 1,
    id,
    title,
    kind,
    signals,
    risks,
    cause,
    cause_evidence: causeEvidence,
    domains,
    tier,
    team: routing.team,
    routing: {
      risk_assessed: assessed,
      tier_reason: assessed
        ? tierReason(kind, risks, tier)
        : `${tierReason(kind, risks, tier)} (risk not assessed: specialists selected by keyword only)`,
      selected: routing.selected,
      skipped: routing.skipped,
    },
    contract: TEAM.version,
    approval_reason: approvalReason,
    approval_required: approvalReason !== 'none',
    approval: null,
    baseline: baseline(root, id),
    context: contextStatus(root),
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
    approval_reason: run.approval_reason,
    context: run.context,
    enforce: enforceTier(root),
    // Printed verbatim as the routing block's first line. It is read from
    // team.json, so it exists only when the skill directory resolved - which
    // makes it evidence that the router ran rather than a number the model
    // recalled. See SKILL.md, "Print the routing decision".
    contract: `contract v${TEAM.version} · run ${id}`,
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
    die('role cannot contribute in the current phase', 5, {
      role,
      phase: feature.run.phase,
      permitted,
      // Without this the deadlock is silent: Plan Reviewer is on the team and
      // finish() requires every selected role to contribute, but it can only
      // contribute during `plan`, so a run that goes understand -> build can
      // never close and nothing says why.
      resolve: `move the run to a phase this role can work in first: forge.mjs phase --id ${id} --to ${permitted[0]} --summary "<current truth>"`,
    })
  }
  if (role === 'plan-reviewer' && feature.run.contract >= 3) {
    const prior = new Set(feature.run.contributions
      .filter((item) => ['understand', 'plan'].includes(item.phase))
      .map((item) => item.role))
    const missing = feature.run.team
      .filter((selected) => selected === 'architect' || SPECIALIST_ROLES.includes(selected))
      .filter((selected) => !prior.has(selected))
    if (missing.length) {
      die('Plan Reviewer must read the plan and selected specialist constraints first', 5, { missing })
    }
  }
  if (role === 'verifier') {
    const reviewContext = option('--review-context')
    if (feature.run.contract >= 3 && !['isolated', 'same-session'].includes(reviewContext)) {
      die('Verifier must record --review-context isolated|same-session', 2)
    }
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
  // A finding can be real, blocking-severity, and still not this run's to fix
  // - a defect inherited from an earlier commit, or one whose repair is a
  // product decision. Without a way to say that, the honest severity strands
  // the run and the convenient one is a lie. Accepting is allowed; accepting
  // silently is not, so the reason is required and lands in the report.
  const residual = option('--residual')
  if (residual && !severity) {
    die('--residual requires --severity: name the severity you are accepting, then why', 2)
  }
  // Same principle finish() already applies to its own gaps: a step the model
  // was asked to perform but can silently skip is not a step, it is a
  // suggestion. SKILL.md instructs every expert to write a full result file;
  // leaving --result optional is what let a run reach verification with the
  // next role having nothing to read but the previous role's summary. An
  // independent review of a one-line summary is a restatement, not a review.
  const result = option('--result')
  if (!result) {
    die('--result is required', 2, {
      expected: `.dev/work/${id}/results/${role}.md`,
      resolve: 'write this expert\'s full result to that path, then pass it as --result',
    })
  }
  const resultPath = resolve(root, result)
  if (!inside(root, resultPath)) die('--result path escapes the project root', 2, { result })
  if (!existsSync(resultPath)) die('--result file does not exist', 2, { result: resultPath })
  feature.run.contributions.push({
    role,
    phase: feature.run.phase,
    revision: feature.run.revision,
    summary,
    severity: severity ?? null,
    residual: residual ?? undefined,
    result: relative(root, resultPath).split('\\').join('/'),
    ...(role === 'verifier' && option('--review-context') ? { review_context: option('--review-context') } : {}),
    at: new Date().toISOString(),
  })
  save(feature.path, feature.run)
  // The ledger and the artifact were two writes of one event, reconciled by
  // finish()'s 'sections' gap. They are one write now: a role that records a
  // contribution has, by that act, filled the section it owns. An already
  // written section is never overwritten - an explicit `section` call is
  // still the way to place a body that is not the whole result file.
  const placed = fillOwnedSection(root, id, role, resultPath)
  output({ ok: true, id, role, ...(placed ? { section: placed } : {}) })
}

// Returns the section name if this note filled it, null otherwise.
function fillOwnedSection(root, id, role, resultPath) {
  const entry = Object.entries(SECTIONS).find(([, meta]) => meta.owner === role)
  if (!entry) return null
  const [name] = entry
  const path = artifactPath(root, id)
  if (!existsSync(path)) return null
  const doc = readFileSync(path, 'utf8')
  const at = sectionBounds(doc, name)
  if (!at) return null
  const current = sectionBody(doc, name)
  if (current && !/^_pending\b/.test(current)) return null
  const body = readFileSync(resultPath, 'utf8').trim()
  if (!body) return null
  const replaced = `${at.marker}\n## ${SECTIONS[name].title}\n\n${body}\n\n`
  writeFileSync(path, doc.slice(0, at.start) + replaced + doc.slice(at.end), 'utf8')
  return name
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
    if (feature.run.contract >= 3 && feature.run.team.includes('plan-reviewer')) {
      const roles = feature.run.contributions.map((item) => item.role)
      const reviewAt = roles.lastIndexOf('plan-reviewer')
      const inputsAt = Math.max(...['architect', ...SPECIALIST_ROLES].map((role) => roles.lastIndexOf(role)))
      if (reviewAt <= inputsAt) {
        die('Plan Reviewer must review the latest plan and specialist constraints before build', 5, { id })
      }
    }
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
  if (to === 'build' && !feature.run.approval_required && feature.run.contract >= 3) {
    feature.run.brief_sha_at_build = briefDigest(root, id)
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
    // A survey from a different generation of the surveyor degrades lens
    // depth silently. Recording it is what lets the report say so.
    ...(parsed.schema_mismatch ? { schema_mismatch: parsed.schema_mismatch } : {}),
  }
  save(feature.path, feature.run)
  output({ ok: true, id, lenses: feature.run.lenses })
}

function approve() {
  const root = projectRoot()
  const id = safeId(option('--id'))
  const feature = load(root, id)
  ensureActive(feature.run)
  if (feature.run.contract >= 3 && !feature.run.approval_required) {
    die('this run has no pending material decision to approve', 5, { id })
  }
  if (feature.run.contract >= 3 && ['build', 'verify', 'repair'].includes(feature.run.phase)) {
    die('approval must be recorded before build', 5, { id, phase: feature.run.phase })
  }
  // A reviewer verdict is not user approval, and the easiest way to blur that
  // is to record one as the other. An expert cannot authorise the work it is
  // on the team to perform, so its name is not an accepted approver.
  const by = option('--by', feature.run.contract >= 3 ? null : 'user')
  const basis = option('--basis', feature.run.contract >= 3 ? null : 'Explicit approval in the active conversation.')
  if (!by?.trim() || !basis?.trim()) die('--by and --basis are required to record the user decision')
  if (ROLES.includes(by.toLowerCase())) {
    die('a reviewer verdict is not user approval', 5, {
      by,
      resolve: 'record the person who approved. An expert PASS clears that expert\'s findings; it does not authorise the change.',
    })
  }
  feature.run.approval = {
    by,
    at: new Date().toISOString(),
    basis,
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
  const GAPS = ['risk', 'lenses', 'audit', 'sections']
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
  if (feature.run.kind !== 'audit' && feature.run.audit?.revision !== feature.run.revision) {
    gaps.push({
      gap: 'audit',
      why: feature.run.audit
        ? `the deterministic audit inspected revision ${feature.run.audit.revision}, not the current ${feature.run.revision}`
        : 'the deterministic audit never ran',
    })
  } else if (feature.run.kind !== 'audit' && feature.run.audit?.inspected_nothing) {
    // The audit ran and read an empty diff. Ran-but-read-nothing must not
    // close a run as quietly as ran-and-found-nothing.
    gaps.push({
      gap: 'audit',
      why: 'the deterministic audit read an empty diff, so it proves nothing about the work; it inspected, and found, nothing',
    })
  }
  // The ledger records that a role contributed; the artifact is what the next
  // reader actually gets. A run that closes with a role's section still
  // scaffolded has a complete record of work nobody can read, which is the
  // one failure the single-artifact design exists to remove.
  const unwritten = unwrittenSections(root, id, feature.run)
  if (unwritten.length) {
    gaps.push({
      gap: 'sections',
      why: `${unwritten.map((s) => `${s.name} (${s.owner})`).join(', ')} — ${unwritten[0].why}`,
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
  const verifierReview = feature.run.contributions.filter((item) =>
    item.role === 'verifier' && item.phase === 'verify' && item.revision === feature.run.revision).at(-1)
  if (!verifierReview) {
    die('Verifier must record a fresh review of the current candidate before finish', 5, { id, revision: feature.run.revision })
  }
  if (feature.run.contract >= 3 && !verifierReview.review_context) {
    die('Verifier review context was not recorded', 5, { id })
  }
  // Keep findings until their owner explicitly records the remaining severity.
  // A missing severity or a new revision does not silently resolve a blocker.
  //
  // Restricted to 'verify' phase contributions: severity recorded during
  // understand/plan describes the reported problem or a design-time risk,
  // not a defect in the delivered candidate - only a role reviewing the
  // actual candidate can say whether one remains. Investigator is the sharp
  // case: it is not a SPECIALIST_ROLE, so allowedPhases() never lets it
  // contribute during verify at all. Its causal account is, by design,
  // reported once and never re-inspected - so the severity of the bug it
  // diagnosed must not be read as an unresolved severity of the fix, or a
  // correctly delivered repair could never close.
  const unresolved = new Map()
  const acceptedResiduals = []
  for (const item of feature.run.contributions) {
    if (item.phase !== 'verify') continue
    if (item.residual && item.severity) {
      unresolved.delete(item.role)
      acceptedResiduals.push({ role: item.role, severity: item.severity, why: item.residual })
    } else if (['critical', 'high'].includes(item.severity)) unresolved.set(item.role, item)
    else if (item.severity) unresolved.delete(item.role)
  }
  feature.run.accepted_residuals = acceptedResiduals.length ? acceptedResiduals : undefined
  const auditJustification = option('--audit-justification')?.trim()
  const auditJustified = feature.run.audit?.blocking > 0 && auditJustification &&
    ['none', 'low', 'medium'].includes(verifierReview.severity) &&
    feature.run.audit.revision === feature.run.revision && verifierReview.at >= feature.run.audit.at
  if (unresolved.size || (feature.run.audit?.blocking > 0 && !auditJustified)) {
    die('unresolved blocking findings prevent completion', 5, {
      id,
      findings: [...unresolved.values()],
      audit_blocking: feature.run.audit?.blocking ?? 0,
      resolve: 'repair the findings and rerun the audit, or record explicit nonblocking Verifier severity after the current audit and pass --audit-justification with counter-evidence; role blockers still require resolution',
    })
  }
  // Per-kind acceptance: most of it is judgment the Verifier owns, but a
  // refactor that rewrote its own tests is mechanically checkable, so check it.
  if (feature.run.kind === 'refactor' && !args.includes('--tests-changed-justified')) {
    const touched = changedTestFiles(root, feature.run.baseline)
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
  feature.run.verification = auditJustified
    ? `${verification} · Audit adjudication: ${auditJustification}` : verification
  feature.run.review_context = verifierReview.review_context ?? 'unrecorded'
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
  if (run.context?.knowledge === 'stale') out.push('> **Project knowledge stale.** Read current source before relying on generated knowledge.', '')
  if (run.context?.analysis === 'schema-mismatch') out.push('> **Project analysis incompatible.** Automatic domain depth is unverified.', '')

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
  const reviewContext = run.review_context ?? run.contributions
    .filter((item) => item.role === 'verifier').at(-1)?.review_context ?? 'unrecorded'
  out.push(`**Review context** · ${reviewContext === 'isolated' ? 'isolated' : reviewContext === 'same-session' ? 'same session; not context independent' : 'unrecorded'}`)
  const cycles = Math.max(0, (run.revision ?? 1) - 1)
  out.push(`**Loop** · ${run.revision} revision(s) · repair cycle ${cycles} of 2`)
  // Never fall back to the CURRENT team.json version here. A run started
  // before this field existed did not run under v${TEAM.version}; we simply do
  // not know what it ran under, and printing today's number would state a fact
  // about the past that nothing recorded. Unrecorded is the honest answer.
  out.push(`**Forge** · contract ${run.contract ? `v${run.contract}` : 'UNRECORDED'} · run \`${run.id}\``)
  out.push(`**Approval** · ${run.approval ? `recorded ${run.approval.at}` : (run.approval_required ? 'REQUIRED, not yet recorded' : 'not required')}`)
  if (run.approval_reason && run.approval_reason !== 'none') out.push(`**Decision needed** · ${run.approval_reason}`)

  const frozenBrief = run.approval?.brief_sha ?? run.brief_sha_at_build
  if (frozenBrief && run.brief_sha_at_finish && frozenBrief !== run.brief_sha_at_finish) {
    out.push('', '> **Scope note.** The brief changed after it was frozen. Compare the delivered change against the agreed scope before releasing.')
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
  // A project that installed this kit but has not yet wired ae-surveyor's
  // .gitignore fragment leaves the kit's own skill files untracked, which
  // would otherwise inflate every count below with this run's own tooling
  // rather than the work it produced. Exclude by the same pattern the
  // fragment itself uses (**/skills/ae-*/), so the exclusion holds regardless
  // of whether the project's .gitignore has caught up yet.
  const task = taskDiff(root, run.baseline)
  const { names, added } = task
  if (task.uncertain.length) {
    add('baseline', 'UNKNOWN', `${task.uncertain.length} changed file(s) lack an exact initial snapshot`)
    findings.push({ check: 'baseline', severity: 'medium', detail: `directly compare baseline for: ${task.uncertain.slice(0, 10).join(', ')}` })
  }

  // An empty diff is not a clean diff. When the baseline is already the
  // current state - a run started after the work was committed, or before any
  // edit - every check below reads nothing, and reporting that as "no blocking
  // findings" is precisely the false clean this script exists to prevent. Say
  // what was inspected, and let finish() treat it as a gap to be named.
  const inspectedNothing = Boolean(from) && names.length === 0
  if (inspectedNothing) {
    add('inspected', 'UNKNOWN',
      `nothing differs from baseline ${from}; the mechanical checks read an empty diff and prove nothing about the work`)
  }

  // 1. Scope: every changed file should appear in the frozen brief.
  const briefFile = briefPath(root, id)
  if (existsSync(briefFile) && names.length) {
    const brief = readFileSync(briefFile, 'utf8')
    const unplanned = names.filter((name) => !brief.includes(name))
    add('scope', unplanned.length ? 'REVIEW' : 'OK',
      unplanned.length ? `${unplanned.length} changed file(s) are not named in the brief` : `${names.length} changed file(s), all named in the brief`)
    for (const name of unplanned.slice(0, 20)) {
      findings.push({ check: 'scope', severity: 'medium', detail: `${name} changed but is not named in the brief` })
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
  if (run.kind === 'refactor') {
    // Tracked-only, deliberately: a brand-new untracked test is ordinary
    // added coverage, not evidence a refactor quietly changed behaviour. The
    // risk this branch exists for is rewriting an existing test.
    const testsTouched = changedTestFiles(root, run.baseline) ?? []
    const justified = args.includes('--tests-changed-justified')
    add('tests', testsTouched.length ? (justified ? 'REVIEW' : 'FAIL') : 'OK',
      testsTouched.length ? (justified ? 'test edits declared justified; Verifier must inspect the rationale' : `refactor changed ${testsTouched.length} test file(s); behaviour preservation is unproven`) : 'existing tests unmodified')
    if (testsTouched.length && !justified) findings.push({ check: 'tests', severity: 'high', detail: 'a refactor changed its own tests' })
  } else if (names.length) {
    // Untracked-inclusive: a new test file for a bug fix or feature is
    // typically brand new and would never appear in `git diff` at all, so
    // asking only "was any test touched" must see it or this check reports
    // "no test changed" while a fresh test sits unrecorded on disk.
    const testsTouched = changedTestFiles(root, run.baseline, true) ?? []
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

  // 6. Did the contract move after it was frozen?
  const frozenBrief = run.approval?.brief_sha ?? run.brief_sha_at_build
  if (frozenBrief) {
    const now = briefDigest(root, id)
    const drifted = now && now !== frozenBrief
    add('brief-drift', drifted ? 'REVIEW' : 'OK',
      drifted ? 'the brief changed after it was frozen' : 'the brief matches its frozen version')
    if (drifted) findings.push({ check: 'brief-drift', severity: 'high', detail: 'the implementation contract was edited after freeze' })
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
      verdict: blocking.length ? 'BLOCKING FINDINGS' : inspectedNothing ? 'INSPECTED NOTHING' : 'CLEAR',
      blocking: blocking.length,
      inspected_nothing: inspectedNothing || undefined,
      checks: checks.map((c) => ({ check: c.check, status: c.status })),
    }
    save(feature.path, feature.run)
  }

  output({
    ok: blocking.length === 0,
    id,
    kind: run.kind,
    changed_files: names.length,
    preexisting_unchanged: task.preexistingUnchanged,
    baseline_uncertain: task.uncertain,
    checks,
    findings,
    verdict: blocking.length ? 'BLOCKING FINDINGS'
      : inspectedNothing ? 'INSPECTED NOTHING - NOT A PASS'
        : 'NO BLOCKING MECHANICAL FINDINGS',
    note: inspectedNothing
      ? `Nothing differs from baseline ${from}. These checks compare in-progress work against the baseline recorded at start; they cannot audit a change that was already committed before this run began. Read this as "not inspected", never as "clean".`
      : 'Deterministic checks only. Whether the tests are meaningful, whether scope crept, and whether residual risk is acceptable remain the Verifier\'s judgment.',
  })
  if (blocking.length) process.exitCode = 5
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
         --tier quick|standard|deep --approval-reason none|TEXT
         [--cause known|unknown --cause-evidence TEXT]
  list
  status --id ID
  note   --id ID --role ROLE --summary TEXT --result PATH [--severity S]
         [--review-context isolated|same-session] (Verifier)
         [--residual TEXT]  (accept a blocking-severity finding this run will
          not repair - an inherited defect, or one whose fix is a product
          decision; requires --severity and is named in the delivery report)
  phase  --id ID --to PHASE --summary TEXT
  brief  --id ID [--force]
  lenses --id ID --json '<lens-select.mjs output>'
  approve --id ID --by NAME --basis TEXT
  audit  --id ID [--tests-changed-justified] (release checks; exit 5 on blockers)
  report --id ID
  finish --id ID --summary TEXT --verification TEXT [--result TEXT]
         [--audit-justification TEXT] (counter-evidence for audit false positives;
          requires explicit nonblocking Verifier severity after the current audit)
         [--tests-changed-justified]   (refactor only; explain in the report)
         [--accept-gaps risk,lenses,audit]  (close without a required step;
          each accepted gap is named in the delivery report)
  cancel --id ID [--reason TEXT]
  contract                      (the ordering tables, as JSON; what validate checks)
  runs                          (fold every recorded run: routing hit rates, lens use)

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

// The ordering rules live in four places that must agree: TRANSITIONS (which
// phase may follow which), allowedPhases (which phase a role may work in),
// SECTIONS[].owner (which role writes which section) and team.json's tiers
// (who is present at all). Each was individually reasoned and nothing checked
// them as one surface. Printing them is what makes that checkable.
function contract() {
  output({
    contract: TEAM.version,
    enforce: enforceTier(projectRoot()),
    analysis_schema: TEAM.analysis_schema ?? null,
    phases: PHASES,
    transitions: TRANSITIONS,
    tiers: TEAM.tiers,
    roles: Object.fromEntries(ROLES.map((role) => [role, {
      phases: allowedPhases(role),
      section: Object.entries(SECTIONS).find(([, meta]) => meta.owner === role)?.[0] ?? null,
      specialist: SPECIALIST_ROLES.includes(role),
    }])),
    sections: Object.fromEntries(Object.entries(SECTIONS).map(([name, meta]) => [name, meta.owner])),
  })
}

// Routing is measurable per run and was never measured across runs, although
// every record needed already exists. This folds them: a role selected often
// that finds nothing is over-routing, a role skipped and then implicated is
// under-routing, and neither is visible one run at a time.
function runs() {
  const root = projectRoot()
  const base = workRoot(root)
  const stats = {
    runs: 0, by_tier: {}, by_kind: {}, risk_unassessed: 0, lenses_unrecorded: 0,
    approval_required: 0, repair_cycles: {}, roles: {}, lenses: {},
  }
  if (!existsSync(base)) return output(stats)
  const role = (name) => (stats.roles[name] ??= { selected: 0, contributed: 0, found: 0, blocking: 0, skipped: 0 })
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(base, entry.name, 'run.json')
    if (!existsSync(path)) continue
    let run
    try { run = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
    stats.runs++
    stats.by_tier[run.tier] = (stats.by_tier[run.tier] ?? 0) + 1
    stats.by_kind[run.kind] = (stats.by_kind[run.kind] ?? 0) + 1
    if (run.routing?.risk_assessed === false) stats.risk_unassessed++
    if (!run.lenses) stats.lenses_unrecorded++
    if (run.approval_required) stats.approval_required++
    const cycles = Math.max(0, (run.revision ?? 1) - 1)
    stats.repair_cycles[cycles] = (stats.repair_cycles[cycles] ?? 0) + 1
    for (const name of run.team ?? []) role(name).selected++
    for (const skip of run.routing?.skipped ?? []) {
      const name = typeof skip === 'string' ? skip : skip.role
      if (name) role(name).skipped++
    }
    const seen = new Set()
    for (const item of run.contributions ?? []) {
      if (!seen.has(item.role)) { role(item.role).contributed++; seen.add(item.role) }
      if (item.severity && item.severity !== 'none') role(item.role).found++
      if (['critical', 'high'].includes(item.severity)) role(item.role).blocking++
    }
    for (const [name, list] of Object.entries(run.lenses?.attached ?? {})) {
      for (const lens of list) stats.lenses[lens] = (stats.lenses[lens] ?? 0) + 1
      void name
    }
  }
  // A role selected repeatedly that never records a finding is the signal the
  // router cannot give you one run at a time.
  for (const [name, row] of Object.entries(stats.roles)) {
    row.find_rate = row.contributed ? Number((row.found / row.contributed).toFixed(2)) : null
  }
  output(stats)
}

const handlers = { help, start, brief, artifact, section, lenses, list, status, note, phase, approve, audit, report, finish, cancel, contract, runs }
if (!handlers[command]) die('unknown command', 2, { command })
handlers[command]()
