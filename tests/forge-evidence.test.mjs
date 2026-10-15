import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateResult } from '../skills/ae-forge/scripts/review-result.mjs'
import { renderTicket } from '../skills/ae-forge/scripts/ticket.mjs'
import { reviewResult } from './helpers/review-fixtures.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(repo, 'skills/ae-forge/scripts/forge.mjs')
const validator = join(repo, 'skills/ae-forge/scripts/review-result.mjs')
const hazard = '| ID | Severity | Location | Issue | Consequence | Smallest repair | Proof check |\n|---|---|---|---|---|---|---|\n| H1 | high | `src/app.js:1` | null is dereferenced | null input crashes | preserve null fallback | run null input |'
const worker = (role, findings = 'none') => `# ${role} fixture

## STATUS
COMPLETE

## OUTCOME
Inspected the fixture source within the declared scope.

## EVIDENCE
| What | Where | How checked |
|---|---|---|
| null handling | ${'`src/app.js:1`'} | reopened source |

## FINDINGS
${findings}

## UNKNOWNS
none

## HANDOFF
Forge reconciles this evidence before the next step.
`

const brief = (kind = 'audit') => `# Fixture request

## Request
Inspect the formatter's null handling and report evidenced findings. For delivery, preserve the fallback and trim non-null input.

## Confirmed behavior and answers
Null input must produce Anonymous.

## Assumptions and open questions
No unresolved scope questions.

## Scope and non-goals
Inspect src/app.js; exclude unrelated modules. Rendered fixture coverage is recorded separately where selected.

## ${kind === 'audit' ? 'Assessment checks' : 'Acceptance criteria'}
AC-1: Establish null handling from the exact source and identify any unverified evidence.
`

function verified({ verdict = 'PASS', material = false, rendered = false, residual = 'none', gate } = {}) {
  return `# Verifier fixture

## STATUS
COMPLETE

## OUTCOME
### Verdict
${verdict}

### Gates re-run by me in this pass
${gate ?? 'N/A: this scoped source assessment needs no runtime gate to establish the direct null dereference.'}

### Finding → reverified evidence
| Finding or clean path | Evidence | Result |
|---|---|---|
| ${material ? 'auditor/H1' : 'clean formatter path'} | ${'`src/app.js:1`'} | ${material ? 'null is dereferenced' : 'null fallback is preserved'} |

### Claim re-verification
| Upstream claim | Reopened | Result |
|---|---|---|
| ${material ? 'auditor/H1' : 'auditor/clean path'} | ${'`src/app.js:1`'} | confirmed: reopened the actual expression |

### Scope conformance
| Area/state | Coverage | Evidence/reason |
|---|---|---|
| formatter null input | source-only | ${'`src/app.js:1`'} |
| unrelated modules | excluded | outside the declared request |

${rendered ? '### Visual evidence\n| Screen/state | Device/app/build | Artifact | Observation method |\n|---|---|---|---|\n| synthetic fixture screen | fixture device / fixture app / fixture build 1 | `.dev/work/task/evidence/capture.png` | synthetic record for artifact-existence checks only |\n' : ''}
### Residual risk
${residual}

## EVIDENCE
| What | Where | How checked |
|---|---|---|
| exact source | ${'`src/app.js:1`'} | reopened in verification |

## FINDINGS
none

## UNKNOWNS
none

## HANDOFF
Forge completes only if the current scope and limitations agree.
`
}

function project(run) {
  const root = mkdtempSync(join(tmpdir(), 'ae-v13-evidence-'))
  let pass = 0
  const put = (name, text) => {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path
  }
  const call = (...args) => spawnSync(process.execPath, [forge, ...args, '--root', root], {
    cwd: root, encoding: 'utf8', env: { ...process.env, AE_WORKFLOW_DEPTH: '', CODEX_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '' },
  })
  const ok = (...args) => { const result = call(...args); assert.equal(result.status, 0, result.stdout + result.stderr); return result }
  const reject = (pattern, ...args) => { const result = call(...args); assert.equal(result.status, 5, result.stdout + result.stderr); assert.match(result.stdout, pattern); return result }
  const note = (role, text, severity = 'none', pattern) => {
    const path = put(`.dev/work/task/results/${role}-${++pass}.md`, text)
    const args = ['note', '--id', 'task', '--role', role, '--summary', `${role} fixture pass`, '--severity', severity, '--result', path,
      ...(['plan-reviewer', 'verifier'].includes(role) ? ['--review-context', 'same-session'] : [])]
    if (pattern) reject(pattern, ...args); else ok(...args)
    return { path, relative: path.slice(root.length + 1).replaceAll('\\', '/') }
  }
  const update = value => ok('update', '--id', 'task', '--from', put('.dev/work/task/scratch/update.json', JSON.stringify(value)))
  const finish = (verdict = 'PASS', ...extra) => ['finish', '--id', 'task', '--summary', 'Fixture assessment complete', '--verification', 'Synthetic contract fixture; evidence record checks only', '--result', verdict, ...extra]
  const start = (...extra) => {
    put('src/app.js', 'export const displayName = value => value.trim()\n')
    const result = ok('start', '--id', 'task', '--title', 'Inspect formatter', '--kind', 'audit', '--risk', 'rendered', ...extra)
    assert.match(result.stdout, /contract v13/)
    ok('brief', '--id', 'task')
    return result
  }
  try { run({ root, put, call, ok, reject, note, update, finish, start }) }
  finally { rmSync(root, { recursive: true, force: true }) }
}

test('v13 rejects the reference omissions and shows supported audit hazards separately from blockers', () => project(({ root, put, ok, reject, note, update, finish, start }) => {
  start()
  const generated = readFileSync(join(root, '.dev/work/task/brief.md'), 'utf8')
  assert.match(generated, /Assessment checks/)
  assert.doesNotMatch(generated, /implementation contract|frozen at approval/)
  reject(/unfilled sections|brief must record/, 'focus', '--id', 'task', '--role', 'auditor', '--summary', 'Inspect source')
  note('auditor', worker('auditor'), 'none', /unfilled sections|brief must record/)
  put('.dev/work/task/brief.md', brief())
  note('auditor', '# An attractive report without the shared record', 'none', /must be filled/)
  note('experience', '# A journey matrix without the shared record', 'none', /must be filled/)
  note('auditor', worker('auditor', hazard), 'none', /highest established finding/)
  note('auditor', worker('auditor').replace('`src/app.js:1`', '`missing.png`'), 'none', /reference is missing/)
  note('auditor', worker('auditor', hazard), 'high')
  ok('lenses', '--id', 'task', '--json', JSON.stringify({ attached: {}, assessed: true }))
  ok('phase', '--id', 'task', '--to', 'verify', '--summary', 'Reopen source')
  note('experience', worker('experience'))
  const capture = put('.dev/work/task/evidence/capture.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64'))
  note('verifier', verified({ material: true, rendered: true }).replace('### Claim re-verification', '### Unrelated summary'), 'none', /Claim re-verification/)
  note('verifier', verified({ rendered: true }), 'none', /material finding requires re-verification/)
  note('verifier', verified({ material: true, rendered: true }).replace('fixture build 1', 'unknown build'), 'none', /unidentified build/)
  note('verifier', verified({ material: true, rendered: true }).replace('capture.png', 'missing.png'), 'none', /reference is missing/)
  const review = note('verifier', verified({ material: true, rendered: true }))
  reject(/at least one meaningful/, ...finish())
  update({ tasks: [{ id: 'check', title: 'Reopen the source and evidence for the assessment', status: 'done', evidence: review.relative }] })
  put('.dev/work/task/brief.md', generated)
  reject(/brief must record/, ...finish())
  put('.dev/work/task/brief.md', brief())
  unlinkSync(capture)
  put('.dev/work/task/brief.md', brief() + '\nA retrospective expansion of scope.\n')
  reject(/brief changed after expert review/, ...finish())
  put('.dev/work/task/brief.md', brief())
  reject(/reference is missing/, ...finish())
  put('.dev/work/task/evidence/capture.png', Buffer.from('fixture artifact restored'))
  note('experience', worker('experience'))
  reject(/Verifier must review after the latest/, ...finish())
  note('verifier', verified({ material: true, rendered: true }))
  ok(...finish())
  const ticket = readFileSync(join(root, '.dev/completed/task.md'), 'utf8')
  assert.match(ticket, /Assessment quality:\*\* PASS/)
  assert.match(ticket, /auditor\/H1.*high.*null input crashes/)
  assert.match(ticket, /Application hazards are separate/)
  assert.match(ticket, /source-only/)
  assert.match(ticket, /\[evidence\]\(</)
  assert.match(ticket, /fixture build 1/)
  assert.doesNotMatch(ticket, /TODO|<!--/)
  assert.equal(existsSync(join(root, '.dev/runs/task.md')), false)
}))

test('v13 zero-finding audit can complete; unassessed domains require explicit qualified verification', () => project(({ root, put, ok, reject, note, update, finish }) => {
  put('src/app.js', 'export const displayName = value => value == null ? "Anonymous" : value.trim()\n')
  ok('start', '--id', 'task', '--title', 'Inspect null fallback', '--kind', 'audit', '--risk', 'none')
  put('.dev/work/task/brief.md', brief())
  note('auditor', worker('auditor'))
  ok('lenses', '--id', 'task', '--json', JSON.stringify({ attached: {}, assessed: false }))
  ok('phase', '--id', 'task', '--to', 'verify', '--summary', 'Reopen the null fallback')
  const review = note('verifier', verified())
  update({ tasks: [{ id: 'check', title: 'Check the fallback path', status: 'done', evidence: review.relative }] })
  reject(/accepted evidence gaps require/, ...finish('PASS', '--accept-gaps', 'lenses'))
  const qualified = note('verifier', verified({ verdict: 'PASS WITH RESIDUAL RISK', residual: 'Source checks support the assessment; platform domain depth was not assessed.' }))
  update({ tasks: [{ id: 'check', title: 'Check the fallback path and domain limitation', status: 'done', evidence: qualified.relative }] })
  ok(...finish('PASS WITH RESIDUAL RISK', '--accept-gaps', 'lenses'))
  const ticket = readFileSync(join(root, '.dev/completed/task.md'), 'utf8')
  assert.match(ticket, /No established findings/)
  assert.match(ticket, /platform domain depth was not assessed/)
  assert.match(ticket, /domain coverage is unassessed/)
}))

test('strict validator preserves unknowns, rejects failed gates, and its CLI validates non-review roles', () => project(({ root, put }) => {
  put('src/app.js', 'export const value = 1\n')
  const options = { contract: 13, kind: 'audit', root }
  const base = verified()
  const failedGate = '| Command | Source | Exit | Status |\n|---|---|---|---|\n| node check.mjs | fixture | 1 | fail |'
  assert.equal(validateResult('verifier', verified({ gate: failedGate }), 'none', options).ok, false)
  assert.equal(validateResult('verifier', base.replace('confirmed:', 'unverified:'), 'none', options).ok, false)
  assert.equal(validateResult('verifier', base.replace('| `src/app.js:1` | null fallback is preserved', '| UNAVAILABLE: source cannot be opened | null fallback is preserved'), 'none', options).ok, false)
  assert.equal(validateResult('auditor', worker('auditor') + '\n## FINDINGS\nnone\n', 'none', options).ok, false)
  const unknown = worker('auditor').replace('## STATUS\nCOMPLETE', '## STATUS\nNEEDS INPUT')
    .replace('## UNKNOWNS\nnone', '## UNKNOWNS\n| Unknown | Blocks? | What would resolve it |\n|---|---|---|\n| intended theme baseline | yes | user identifies baseline |')
  assert.equal(validateResult('auditor', unknown, 'none', options).ok, true, 'honest incomplete work is recordable')
  const file = put('.dev/work/task/results/experience.md', worker('experience'))
  const cli = spawnSync(process.execPath, [validator, '--role', 'experience', '--result', file, '--severity', 'none', '--root', root], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stdout + cli.stderr)
  assert.equal(JSON.parse(cli.stdout).ok, true)
  put('docs/with spaces.md', '# Actual evidence\n')
  assert.equal(validateResult('auditor', worker('auditor').replace('`src/app.js:1`', '`docs/with spaces.md`'), 'none', options).ok, true)
  assert.equal(validateResult('auditor', worker('auditor').replace('`src/app.js:1`', '`../outside.md`'), 'none', options).ok, false)
  put('.dev/work/task/evidence/capture.png', Buffer.from('synthetic fixture artifact'))
  assert.equal(validateResult('verifier', verified({ rendered: true }).replace('synthetic fixture screen', 'unknown-amount state'), 'none', { ...options, rendered: true }).ok, true, 'an observed unknown-amount state is not unknown build identity')
}))

test('ticket keeps incomplete checks and absent finding records honest', () => {
  const ticket = renderTicket({ id: 'pending', title: 'Pending assessment', contract: 13, kind: 'audit', status: 'active', phase: 'understand', contributions: [] }, {
    path: join(repo, '.dev/runs/pending.md'), brief: '## Assessment checks\n\n<!-- observable checks -->\nTODO\n',
  })
  assert.doesNotMatch(ticket, /TODO|<!--|No established findings|## Done when/)
  assert.match(ticket, /Findings not recorded/)
  assert.match(ticket, /Observable completion checks not recorded/)
  const damaged = renderTicket({ id: 'damaged', title: 'Damaged evidence', contract: 13, kind: 'audit', status: 'active', phase: 'verify',
    contributions: [{ role: 'auditor', absolute_result: join(repo, '.dev/work/damaged/results/auditor.md'), result_text: '## FINDINGS\nUnparseable evidence.' }] }, {
    path: join(repo, '.dev/runs/damaged.md'),
  })
  assert.doesNotMatch(damaged, /No established findings/)
  assert.match(damaged, /Finding records unavailable/)
})

test('v13 delivery still builds and verifies an exact candidate through the existing lifecycle', () => project(({ root, put, ok, note, update }) => {
  put('src/app.js', 'export const displayName = value => value == null ? "Anonymous" : String(value)\n')
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture baseline']]) execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  ok('start', '--id', 'task', '--title', 'Trim formatter input', '--kind', 'feature', '--risk', 'none', '--autonomous', 'Synthetic fixture authorizes this exact delivery without a checkpoint')
  put('.dev/work/task/brief.md', brief('feature'))
  ok('lenses', '--id', 'task', '--json', JSON.stringify({ attached: {}, assessed: true }))
  ok('phase', '--id', 'task', '--to', 'plan', '--summary', 'Preserve fallback and trim input')
  note('architect', worker('architect').replace('Inspected the fixture source within the declared scope.', '### Chosen approach\nPreserve the null branch and trim the string conversion.\n### Alternatives considered\nTrimming before the branch would dereference null.'))
  note('plan-reviewer', reviewResult('plan-reviewer').replace('fixture artifact', '`src/app.js:1`'))
  ok('phase', '--id', 'task', '--to', 'build', '--summary', 'Implement the approved formatter change')
  put('src/app.js', 'export const displayName = value => value == null ? "Anonymous" : String(value).trim()\n')
  put('test/name.test.mjs', 'import assert from "node:assert/strict"; import { displayName } from "../src/app.js"; assert.equal(displayName(null), "Anonymous"); assert.equal(displayName(undefined), "Anonymous"); assert.equal(displayName(" padded "), "padded"); assert.equal(displayName(""), ""); assert.equal(displayName(42), "42");\n')
  const checked = spawnSync(process.execPath, ['--test', 'test/name.test.mjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(checked.status, 0, checked.stdout + checked.stderr)
  put('.dev/work/task/evidence/test.log', checked.stdout + checked.stderr)
  const built = note('builder', worker('builder').replace('Inspected the fixture source within the declared scope.', 'AC-1: Null fallback preserved; non-null string conversion trimmed. Executed node --test test/name.test.mjs, exit 0.'))
  update({ tasks: [{ id: 'trim', title: 'Preserve fallback and trim input', status: 'done', evidence: built.relative }] })
  ok('phase', '--id', 'task', '--to', 'verify', '--summary', 'Check exact formatter diff')
  ok('audit', '--id', 'task')
  const rechecked = spawnSync(process.execPath, ['--test', 'test/name.test.mjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(rechecked.status, 0, rechecked.stdout + rechecked.stderr)
  put('.dev/work/task/evidence/verify.log', rechecked.stdout + rechecked.stderr)
  const gates = '| Command | Source | Exit | Status |\n|---|---|---|---|\n| node --test test/name.test.mjs | fixture test | 0 | pass |'
  const review = verified({ gate: gates }).replace('### Finding → reverified evidence', '### Acceptance → evidence')
    .replace('clean formatter path', 'AC-1').replace('auditor/clean path', 'builder/AC-1')
    .replace('`src/app.js:1` | reopened in verification', '`.dev/work/task/evidence/verify.log` | reran formatter checks')
  note('verifier', review)
  ok('finish', '--id', 'task', '--summary', 'Formatter trimmed with null fallback preserved', '--verification', 'Formatter behavior checks passed twice; exact candidate inspected in synthetic fixture', '--result', 'PASS')
  assert.match(readFileSync(join(root, '.dev/completed/task.md'), 'utf8'), /Formatter trimmed with null fallback preserved/)
}))
