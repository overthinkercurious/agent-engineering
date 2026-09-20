#!/usr/bin/env node

// Layer B - depth. Layer A proves the right specialist was CALLED; this
// proves it was deep enough to FIND something. The two failures look
// identical from outside and are fixed in completely different places.
//
// This script does not run a model. The host coding tool owns models and
// isolated agents (docs/DESIGN.md's product boundary), so adding an adapter
// here would be a second model-host system the kit deliberately excludes.
// What the kit owns is the instrument: a clean fixture, the ground truth, the
// mechanical scoring, and the evidence a grader needs for the rest.
//
//   prepare --case <id>                 materialise a scrubbed fixture
//   grade   --case <id> --project DIR   score a completed run
//   list                                cases and which carry planted defects
//
// Why prepare scrubs: the fixture labels every defect in-file
// ("// PLANTED DEFECT: idor") so a maintainer can see what a case is for.
// Those labels sit in the same files the model under test reads. Grading a
// model against files that announce their own answers measures reading
// comprehension, not depth - so the copy handed to a run has them removed
// while the repository keeps them.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CASES = JSON.parse(readFileSync(join(ROOT, 'evals', 'cases.json'), 'utf8'))
const FIXTURE = join(ROOT, 'evals', 'fixture')
const SEVERITY = ['none', 'low', 'medium', 'high', 'critical']

const args = process.argv.slice(2)
const command = args[0] || 'help'
const option = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const die = (message, code = 2) => { process.stderr.write(`${message}\n`); process.exit(code) }
const findCase = (id) => CASES.cases.find((c) => c.id === id)

// Remove the maintainer-facing defect labels. Both comment styles the fixture
// uses, and only the block that starts with the marker - an unrelated comment
// next to a defect stays, because deleting surrounding context would change
// what the model is reading in ways the case never intended.
export function scrub(text) {
  const withoutBlocks = text.replace(/\/\*\s*PLANTED DEFECT[\s\S]*?\*\/\n?/g, '')
  const lines = withoutBlocks.split('\n')
  const out = []
  let dropping = false
  for (const line of lines) {
    if (/^\s*(\/\/|#)\s*PLANTED DEFECT/.test(line)) { dropping = true; continue }
    if (dropping && /^\s*(\/\/|#)/.test(line)) continue
    dropping = false
    out.push(line)
  }
  return out.join('\n')
}

function prepare() {
  const id = option('--case')
  const testCase = findCase(id)
  if (!testCase) die(`unknown case: ${id}. Run 'list' to see them.`)

  const out = option('--out') ? resolve(option('--out')) : mkdtempSync(join(tmpdir(), `ae-eval-${id}-`))
  mkdirSync(out, { recursive: true })
  cpSync(FIXTURE, out, { recursive: true })

  // Scrub every text file the copy contains, not a hardcoded list: a case
  // added later must not silently leak because someone forgot this step.
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])
  let scrubbed = 0
  for (const file of walk(out)) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    const clean = scrub(text)
    if (clean !== text) { writeFileSync(file, clean); scrubbed++ }
  }

  const git = (argv) => execFileSync('git', argv, { cwd: out, stdio: 'ignore' })
  try {
    git(['init', '-q'])
    git(['config', 'user.email', 'eval@local'])
    git(['config', 'user.name', 'eval'])
    git(['add', '-A'])
    git(['commit', '-qm', 'fixture baseline'])
  } catch { process.stderr.write('warning: git init failed; forge baseline checks will be limited\n') }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    case: id,
    project: out,
    files_scrubbed: scrubbed,
    request: testCase.request,
    kind: testCase.kind,
    next: [
      `Run a full Forge delivery against ${out} using this request, with no other hint:`,
      `  "${testCase.request}"`,
      'Let Forge choose the risk flags, the team and the lenses itself - that judgment is what is being graded.',
      `Then: node scripts/eval-depth.mjs grade --case ${id} --project "${out}"`,
    ],
  }, null, 2)}\n`)
}

function loadRun(project) {
  const workRoot = join(project, '.dev', 'work')
  if (!existsSync(workRoot)) die(`no .dev/work in ${project}; has a Forge run happened there?`, 3)
  const ids = option('--id')
    ? [option('--id')]
    : readdirSync(workRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  const runs = ids
    .map((id) => join(workRoot, id, 'run.json'))
    .filter((p) => existsSync(p))
    .map((p) => ({ path: p, run: JSON.parse(readFileSync(p, 'utf8')) }))
  if (!runs.length) die(`no run.json under ${workRoot}`, 3)
  if (runs.length > 1) die(`several runs found; pass --id. Found: ${ids.join(', ')}`, 3)
  return runs[0]
}

// Distinctive words from the prose ground truth, used only as a hint. A
// keyword hit is not proof the specialist understood the defect, and a miss
// is not proof it did not - which is why this never decides the verdict.
function overlapHint(mustCatch, evidence) {
  const stop = new Set(['with', 'that', 'this', 'from', 'have', 'into', 'when', 'what', 'then', 'they', 'than', 'been', 'over', 'your', 'them', 'were', 'will', 'more', 'some', 'only', 'also', 'here', 'does', 'made', 'even', 'much', 'most', 'both', 'each'])
  const words = [...new Set(String(mustCatch).toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])]
    .filter((w) => !stop.has(w))
  if (!words.length) return { score: 0, matched: [], of: 0 }
  const hay = evidence.toLowerCase()
  const matched = words.filter((w) => hay.includes(w))
  return { score: Number((matched.length / words.length).toFixed(2)), matched, of: words.length }
}

function grade() {
  const id = option('--case')
  const testCase = findCase(id)
  if (!testCase) die(`unknown case: ${id}`)
  const project = option('--project') ? resolve(option('--project')) : die('--project is required')
  const { run } = loadRun(project)

  // Explicit human/model judgments, e.g. --verdict idor=caught
  const verdicts = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--verdict') continue
    const [defect, value] = String(args[i + 1] ?? '').split('=')
    if (!defect || !['caught', 'missed'].includes(value)) die(`--verdict expects <defect>=caught|missed, got: ${args[i + 1]}`)
    verdicts[defect] = value
  }

  const rows = []
  const check = (name, ok, detail) => { rows.push({ check: name, status: ok ? 'PASS' : 'FAIL', detail }); return ok }

  // 1. Did the model assess risk itself, and pick the same flags?
  const expectRisk = [...(testCase.expect_risk ?? [])].sort()
  const actualRisk = [...(run.risks ?? [])].sort()
  check('risk assessed', run.routing?.risk_assessed === true,
    run.routing?.risk_assessed === true ? 'risk was assessed' : 'risk was never assessed; specialists were selected by keyword alone')
  check('risk flags match', JSON.stringify(expectRisk) === JSON.stringify(actualRisk),
    `expected [${expectRisk}] got [${actualRisk}]`)

  // 2. Routing. A failure here is Layer A's job; seeing it here means Layer A
  //    has a gap of its own.
  const expect = testCase.expect ?? {}
  if (expect.tier) check('tier', run.tier === expect.tier, `expected ${expect.tier} got ${run.tier}`)
  const team = run.team ?? []
  for (const role of expect.team_includes ?? []) {
    check(`team includes ${role}`, team.includes(role), team.join(','))
  }
  for (const role of expect.team_excludes ?? []) {
    check(`team excludes ${role}`, !team.includes(role), team.join(','))
  }

  // 3. Depth. Did the owning specialist actually find the planted defect?
  const contributions = run.contributions ?? []
  const readResult = (rel) => {
    if (!rel) return ''
    try { return readFileSync(join(project, rel), 'utf8') } catch { return '' }
  }
  const planted = []
  for (const defect of testCase.planted ?? []) {
    const owner = defect.owner
    const byOwner = contributions.filter((c) => c.role === owner)
    const evidence = byOwner.map((c) => `${c.summary ?? ''}\n${readResult(c.result)}`).join('\n')
    const best = byOwner
      .map((c) => SEVERITY.indexOf(c.severity ?? 'none'))
      .reduce((a, b) => Math.max(a, b), 0)
    const need = SEVERITY.indexOf(defect.min_severity)
    const hint = overlapHint(defect.must_catch, evidence)
    const verdict = verdicts[defect.defect]
      ?? (byOwner.length === 0 ? 'missed' : 'NEEDS JUDGMENT')
    planted.push({
      defect: defect.defect,
      owner,
      owner_contributed: byOwner.length > 0,
      must_catch: defect.must_catch,
      min_severity: defect.min_severity,
      recorded_severity: SEVERITY[best],
      severity_sufficient: best >= need,
      keyword_hint: hint,
      verdict,
      evidence_excerpt: evidence.trim().slice(0, 600) || '(the owning role recorded nothing)',
    })
    if (verdict !== 'NEEDS JUDGMENT') {
      check(`caught ${defect.defect}`, verdict === 'caught', `owner=${owner} severity=${SEVERITY[best]} (needs ${defect.min_severity})`)
      if (verdict === 'caught') {
        check(`${defect.defect} at min severity`, best >= need, `recorded ${SEVERITY[best]}, needs ${defect.min_severity}`)
      }
    }
  }

  // 4. Findings nobody planted. Either a real find worth keeping or a false
  //    positive worth fixing - the grader decides, the script only surfaces.
  const plantedOwners = new Set((testCase.planted ?? []).map((d) => d.owner))
  const unplanned = contributions
    .filter((c) => c.severity && c.severity !== 'none' && !plantedOwners.has(c.role))
    .map((c) => ({ role: c.role, severity: c.severity, summary: c.summary }))

  const pending = planted.filter((p) => p.verdict === 'NEEDS JUDGMENT')
  const failed = rows.filter((r) => r.status === 'FAIL')
  const scorecard = {
    case: id,
    project,
    mechanical: rows,
    planted: planted,
    unplanned_findings: unplanned,
    summary: {
      mechanical_passed: rows.filter((r) => r.status === 'PASS').length,
      mechanical_failed: failed.length,
      defects_caught: planted.filter((p) => p.verdict === 'caught').length,
      defects_missed: planted.filter((p) => p.verdict === 'missed').length,
      defects_pending_judgment: pending.length,
    },
    note: pending.length
      ? `Whether a specialist understood a defect is judgment, not string matching. Read each evidence_excerpt against its must_catch and re-run with --verdict <defect>=caught|missed to finalise.`
      : 'Fully scored.',
  }
  process.stdout.write(`${JSON.stringify(scorecard, null, 2)}\n`)
  if (failed.length) process.exitCode = 5
}

function list() {
  process.stdout.write(`${JSON.stringify(CASES.cases.map((c) => ({
    id: c.id,
    kind: c.kind,
    planted: (c.planted ?? []).map((d) => `${d.defect} (${d.owner}, ${d.min_severity})`),
  })), null, 2)}\n`)
}

function help() {
  process.stdout.write(`ae eval - Layer B (depth)

  list
  prepare --case <id> [--out DIR]
  grade   --case <id> --project DIR [--id RUNID] [--verdict <defect>=caught|missed ...]

Layer A (scripts/test-evals.mjs) proves the right specialist was called.
This proves it was deep enough to find something. It does not run a model:
the host owns that. It prepares a fixture whose defect labels are stripped,
then scores what a completed run recorded against the ground truth in
evals/cases.json.
`)
}

const handlers = { help, list, prepare, grade }
if (!handlers[command]) die(`unknown command: ${command}`)
handlers[command]()
