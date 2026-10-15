import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { reviewResult } from './helpers/review-fixtures.mjs'
import { retainV12 } from './helpers/legacy-contract.mjs'
import { renderTicket, findingState } from '../skills/ae-forge/scripts/ticket.mjs'
const forge = resolve(dirname(fileURLToPath(import.meta.url)), '../skills/ae-forge/scripts/forge.mjs')

function project(body) {
  const root = mkdtempSync(join(tmpdir(), 'ae-ticket-'))
  const put = (name, content) => {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    return path
  }
  const call = (...args) => retainV12(root, args, spawnSync(process.execPath, [forge, ...args, '--root', root], { cwd: root, encoding: 'utf8', env: { ...process.env, AE_WORKFLOW_DEPTH: '' } }))
  const ok = (...args) => { const result = call(...args); assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout }
  const note = (role, file, text, severity = 'none') => {
    const path = put(`.dev/work/task/results/${file}.md`, text)
    ok('note', '--id', 'task', '--role', role, '--summary', file, '--severity', severity, '--result', path,
      ...(['plan-reviewer', 'verifier'].includes(role) ? ['--review-context', 'same-session'] : []))
    return `.dev/work/task/results/${file}.md`
  }
  const update = (change) => ok('update', '--id', 'task', '--from', put('.dev/work/task/scratch/update.json', JSON.stringify(change)))
  const ticket = () => readFileSync(join(root, '.dev/runs/task.md'), 'utf8')
  try { body({ root, put, call, ok, note, update, ticket }) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('a reviewed approach waits for the user, records once and regenerates a compact ticket', () => project(({ root, put, call, ok, note, update, ticket }) => {
  const started = JSON.parse(ok('start', '--id', 'task', '--title', 'Reuse existing styling', '--kind', 'feature', '--risk', 'none'))
  assert.equal(started.approval_required, true)
  assert.doesNotMatch(ticket(), /forge:section|_pending —|## Plan challenge/)
  ok('brief', '--id', 'task')
  const brief = join(root, '.dev/work/task/brief.md')
  writeFileSync(brief, readFileSync(brief, 'utf8').replaceAll('TODO', 'AC-1: First screen follows the theme.\nAC-2: Second screen follows the theme.'))
  ok('phase', '--id', 'task', '--to', 'plan', '--summary', 'Choosing the approach')
  note('architect', 'plan-1', '# Plan\n\n## OUTCOME\n### Chosen approach\nReuse the existing theme.\n### Decisions\nLocal overrides were rejected because they preserve repeated styling.\n')
  note('plan-reviewer', 'review-1', reviewResult('plan-reviewer'))
  assert.equal(call('phase', '--id', 'task', '--to', 'build', '--summary', 'Attempt early build').status, 5)
  ok('phase', '--id', 'task', '--to', 'approval', '--summary', 'Approach ready for review')
  const packet = ok('approval-packet', '--id', 'task')
  assert.match(packet, /Waiting for you/)
  assert.match(packet, /Reuse the existing theme/)
  assert.match(packet, /Local overrides were rejected/)
  assert.doesNotMatch(packet, /Plan challenge|## FINDINGS|forge:section/)
  assert.equal(call('approve', '--id', 'task', '--by', 'plan-reviewer', '--basis', 'Expert approves').status, 5)
  ok('approve', '--id', 'task', '--by', 'user', '--basis', 'Use the reviewed theme approach')
  const approved = JSON.parse(ok('status', '--id', 'task')).approval
  assert.equal(readFileSync(join(root, approved.brief_snapshot), 'utf8'), readFileSync(brief, 'utf8'))
  ok('phase', '--id', 'task', '--to', 'build', '--summary', 'Implement approved first slice')
  ok('focus', '--id', 'task', '--role', 'builder', '--summary', 'Checking the first screen')
  assert.match(ticket(), /Current owner \(recorded\):\*\* builder/)
  const first = note('builder', 'slice-1', '# Built\nAC-1: First screen checked.\n')
  update({ progress: 'One screen checked; final verification pending.', tasks: [{ id: 'screen', title: 'Reuse theme on first screen', status: 'done', evidence: first }] })
  assert.match(ticket(), /1 of|One screen checked/)
  const original = readFileSync(join(root, first), 'utf8')
  note('builder', 'slice-2', '# Built\nAC-2: Second screen checked.\n')
  assert.equal(readFileSync(join(root, first), 'utf8'), original)
  assert.match(ticket(), /slice-2/)
  const audit = JSON.parse(call('audit', '--id', 'task').stdout)
  assert.equal(audit.findings.some(item => item.check === 'acceptance'), false, 'all accepted slices in this revision remain available')
  assert.equal(call('note', '--id', 'task', '--role', 'builder', '--summary', 'Overwrite', '--result', first).status, 5)
  put('.dev/runs/task.md', 'Pretend approved and complete.\n')
  ok('status', '--id', 'task')
  assert.match(ticket(), /In progress/)
  assert.doesNotMatch(ticket(), /Pretend approved/)
  assert.equal(call('update', '--id', 'task', '--from', put('.dev/work/task/scratch/bad.json', JSON.stringify({ tasks: [{ id: 'fake', title: 'Unproved task', status: 'done' }] }))).status, 5)
  ok('phase', '--id', 'task', '--to', 'verify', '--summary', 'Verify current candidate')
  ok('phase', '--id', 'task', '--to', 'plan', '--summary', 'Material approach revision')
  assert.equal(JSON.parse(ok('status', '--id', 'task')).approval, null)
  assert.equal(existsSync(join(root, approved.brief_snapshot)), true)
}))

test('audit blockers are explicit, completion archives the same ticket and report agrees', () => project(({ root, put, call, ok, note, update, ticket }) => {
  put('src/theme.js', 'export const size = 14\n')
  ok('start', '--id', 'task', '--title', 'Audit typography', '--kind', 'audit', '--risk', 'none')
  put('.dev/work/task/brief.md', '## Acceptance criteria\n\nTypography coverage and evidence are checked.\n')
  ok('lenses', '--id', 'task', '--json', JSON.stringify({ attached: {}, assessed: true }))
  note('auditor', 'audit', '# Audit\nExisting typography inspected.\n')
  const decision = put('.dev/work/task/scratch/decision.md', 'The accepted baseline is the existing theme.\n')
  ok('section', '--id', 'task', '--name', 'decisions', '--from', decision)
  update({ waiting_for: 'user', blockers: ['User: confirm intended body typography before classification.'], next_action: 'User: choose the intended baseline.' })
  ok('phase', '--id', 'task', '--to', 'blocked', '--summary', 'Waiting on intended design')
  assert.match(ticket(), /Waiting for you/)
  assert.match(ticket(), /confirm intended body typography/)
  assert.equal(call('phase', '--id', 'task', '--to', 'build', '--summary', 'Start fixes').status, 5)
  ok('phase', '--id', 'task', '--to', 'verify', '--summary', 'Verify the scoped assessment')
  const verified = note('verifier', 'verified', reviewResult('verifier', 'PASS'))
  assert.equal(call('finish', '--id', 'task', '--summary', 'Audit complete', '--verification', 'Evidence rechecked', '--result', 'PASS').status, 5)
  update({ blockers: [], waiting_for: null, tasks: [{ id: 'audit', title: 'Inspect and verify typography', status: 'done', evidence: verified }] })
  ok('finish', '--id', 'task', '--summary', 'Audit complete', '--verification', 'Evidence rechecked', '--result', 'PASS')
  const complete = readFileSync(join(root, '.dev/completed/task.md'), 'utf8')
  assert.equal(existsSync(join(root, '.dev/runs/task.md')), false)
  assert.match(complete, /\*\*Status:\*\* Done/)
  assert.match(complete, /Evidence rechecked/)
  assert.match(complete, /accepted baseline is the existing theme/)
  assert.equal(existsSync(decision), false, 'disposable source is removed but its durable recorded decision remains')
  put('.dev/work/task/brief.md', '## Acceptance criteria\n\nAn unapproved retrospective requirement.\n')
  assert.equal(ok('report', '--id', 'task'), complete, 'completed scope is rendered from its preserved snapshot')
  assert.equal(JSON.parse(ok('runs')).by_kind.audit, 1)
  assert.equal(readFileSync(join(root, 'src/theme.js'), 'utf8'), 'export const size = 14\n')
}))

test('completed delivery retains approved scope when the working brief is missing', () => project(({ root, put, call, ok, note }) => {
  put('src/theme.js', 'export const size = 14\n')
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Test fixture', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture baseline']]) {
    execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  }
  ok('start', '--id', 'task', '--title', 'Reuse approved styling', '--kind', 'feature', '--risk', 'none')
  ok('brief', '--id', 'task')
  const brief = join(root, '.dev/work/task/brief.md')
  writeFileSync(brief, readFileSync(brief, 'utf8').replaceAll('TODO', 'The original approved styling is preserved.'))
  ok('lenses', '--id', 'task', '--json', JSON.stringify({ attached: {}, assessed: true }))
  ok('phase', '--id', 'task', '--to', 'plan', '--summary', 'Review the styling approach')
  note('architect', 'plan', '# Plan\n## OUTCOME\n### Chosen approach\nAdjust the existing theme size.\n')
  note('plan-reviewer', 'review', reviewResult('plan-reviewer'))
  ok('phase', '--id', 'task', '--to', 'approval', '--summary', 'Approach ready')
  ok('approve', '--id', 'task', '--by', 'user', '--basis', 'Synthetic fixture approves this exact theme approach')
  const approved = JSON.parse(ok('status', '--id', 'task')).approval
  ok('phase', '--id', 'task', '--to', 'build', '--summary', 'Implement approved styling')
  put('src/theme.js', 'export const size = 16\n')
  note('builder', 'built', '# Builder\nTheme size export inspected as 16.\n')
  ok('phase', '--id', 'task', '--to', 'verify', '--summary', 'Verify the integrated styling')
  ok('audit', '--id', 'task')
  note('verifier', 'verified', reviewResult('verifier', 'PASS'))
  const finish = ['finish', '--id', 'task', '--summary', 'Styling complete', '--verification', 'Synthetic CLI contract checks only', '--result', 'PASS']
  put('.dev/work/task/brief.md', '## Acceptance criteria\n\nAn unapproved replacement scope.\n')
  const drifted = call(...finish)
  assert.equal(drifted.status, 5)
  assert.match(drifted.stdout + drifted.stderr, /brief changed/)
  unlinkSync(brief)
  ok(...finish)
  assert.equal(JSON.parse(ok('status', '--id', 'task')).brief_snapshot_at_finish, approved.brief_snapshot)
  const report = ok('report', '--id', 'task')
  assert.match(report, /original approved styling/)
  put('.dev/work/task/brief.md', '## Acceptance criteria\n\nA later retrospective requirement.\n')
  assert.equal(ok('report', '--id', 'task'), report)
}))

test('the ticket uses the completion gate blocker rules and preserves evidence limitations', () => {
  const run = { id: 'blockers', title: 'Verify a feature', contract: 12, kind: 'feature', status: 'active', phase: 'verify',
    routing: { risk_assessed: false }, context: { analysis: 'failed' },
    lenses: { assessed: false, unavailable: ['android'], stale: ['ui-finish'] },
    contributions: [
      { role: 'security', phase: 'verify', severity: 'high', summary: 'Access defect', result: 'security-1.md', absolute_result: 'D:/app/security-1.md' },
      { role: 'security', phase: 'verify', severity: null, summary: 'More inspection', result: 'security-2.md', absolute_result: 'D:/app/security-2.md' }
    ] }
  const text = renderTicket(run, { path: 'D:/app/.dev/runs/blockers.md' })
  assert.equal(findingState(run).unresolved.size, 1)
  assert.match(text, /Access defect/)
  assert.match(text, /NOT ASSESSED/)
  assert.match(text, /Project analysis failed/)
  assert.match(text, /Lens unavailable/)
  assert.match(text, /Lens stale/)
  run.contributions.push({ role: 'security', phase: 'verify', severity: 'none', summary: 'Resolved', absolute_result: 'D:/app/security-3.md' })
  assert.equal(findingState(run).unresolved.size, 0)
})
