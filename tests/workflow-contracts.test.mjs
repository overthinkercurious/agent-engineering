import test from 'node:test'
import { reviewResult } from './helpers/review-fixtures.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = (name) => resolve(repo, name)
const forge = script('skills/ae-forge/scripts/forge.mjs')
const lensSelect = script('skills/ae-forge/scripts/lens-select.mjs')
const guard = script('skills/ae-forge/scripts/guard.mjs')
const analyze = script('skills/ae-forge/scripts/analyze.mjs')
const validateKit = script('skills/ae-forge/scripts/validate-kit.mjs')

test('only Forge is a standalone routing surface', () => {
  const stages = ['ae-investigate', 'ae-plan', 'ae-plan-review', 'ae-build', 'ae-verify', 'ae-audit']
  const owns = new Set()
  for (const name of [...stages, 'ae-forge']) {
    const source = readFileSync(script(`skills/${name}/SKILL.md`), 'utf8')
    assert.match(source, new RegExp(`^name: ${name}$`, 'm'))
    const ownership = source.match(/^  owns: "([^"]+)"$/m)?.[1]
    assert.ok(ownership, `${name} must declare ownership`)
    assert.ok(!owns.has(ownership), `${name} overlaps another skill's ownership`)
    owns.add(ownership)
    if (stages.includes(name)) {
      assert.match(source, /^  Dispatch target only /m, `${name} must not route standalone requests`)
      assert.match(source, /start with\s+ae-forge/i)
    }
  }
})

function withProject(name, run) {
  const root = mkdtempSync(join(tmpdir(), name))
  const put = (path, content) => {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
    return target
  }
  const invoke = (file, args, env = {}) => {
    if (args[0] === 'note' && ['plan-reviewer', 'plan-challenger'].includes(args[args.indexOf('--role') + 1]) && !args.includes('--review-context')) args = [...args, '--review-context', 'same-session']
    if (args[0] === 'start' && !['audit', 'plan', 'diagnose', 'review'].includes(args[args.indexOf('--kind') + 1])
      && !args.includes('--approval-required') && env.AE_TEST_NO_APPROVAL !== '1'
      && (args.includes('--depth') ? args[args.indexOf('--depth') + 1] : (env.AE_WORKFLOW_DEPTH ?? 'deep')) === 'deep') {
      args = [...args, '--approval-required', '--approval-reason', 'Fixture requires an explicit user decision']
    }
    return spawnSync(process.execPath, [file, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, AE_WORKFLOW_DEPTH: 'deep', ...env },
  })
  }
  try { run({ root, put, invoke }) } finally { rmSync(root, { recursive: true, force: true }) }
}

function surveyed() { /* Legacy test fixtures: Forge now starts without a survey. */ }

function approvePlan({ root, put, call }, id) {
  assert.equal(call('phase', '--id', id, '--to', 'plan', '--summary', 'Planning').status, 0)
  const plan = put(`.dev/work/${id}/results/architect.md`, '# Architect\n\n## OUTCOME\nPlan.\n')
  assert.equal(call('section', '--id', id, '--name', 'plan', '--from', plan).status, 0)
  assert.equal(call('note', '--id', id, '--role', 'architect', '--summary', 'Plan', '--severity', 'none', '--result', plan).status, 0)
  const team = JSON.parse(readFileSync(join(root, `.dev/work/${id}/run.json`), 'utf8')).team
  if (team.includes('security')) {
    const constraints = put(`.dev/work/${id}/results/security.md`, '# Security\n\n## OUTCOME\nAccess constraints.\n')
    assert.equal(call('note', '--id', id, '--role', 'security', '--summary', 'Constraints', '--severity', 'none', '--result', constraints).status, 0)
  }
  const review = put(`.dev/work/${id}/results/plan-reviewer.md`, reviewResult('plan-reviewer', 'APPROVED'))
  assert.equal(call('section', '--id', id, '--name', 'plan-review', '--from', review).status, 0)
  assert.equal(call('note', '--id', id, '--role', 'plan-reviewer', '--summary', 'Approved', '--severity', 'none', '--result', review).status, 0)
  const challenge = put(`.dev/work/${id}/results/plan-challenger.md`, reviewResult('plan-challenger', 'APPROVED'))
  assert.equal(call('section', '--id', id, '--name', 'plan-challenge', '--from', challenge).status, 0)
  assert.equal(call('note', '--id', id, '--role', 'plan-challenger', '--summary', 'Challenge approved', '--severity', 'none', '--result', challenge).status, 0)
  assert.equal(call('phase', '--id', id, '--to', 'approval', '--summary', 'Awaiting user approval').status, 0)
  assert.equal(call('approve', '--id', id, '--by', 'user', '--basis', 'Approved in test').status, 0)
}

test('Forge analyzer produces the schema used by lens selection', () => {
  withProject('ae-analysis-current-', ({ root, put, invoke }) => {
    put('src/answer.js', 'export const answer = 42\n')
    const scan = invoke(analyze, ['--root', root])
    assert.equal(scan.status, 0, scan.stderr)
    const analysis = JSON.parse(readFileSync(join(root, '.dev/context/analysis.json'), 'utf8'))
    assert.equal(analysis.schema, 2)
  })
})

test('lens selection reads the run request, ahead of project-only domain signals', () => {
  withProject('ae-lens-request-', ({ root, put, invoke }) => {
    put('.dev/work/request-lenses/run.json', JSON.stringify({
      id: 'request-lenses', team: ['builder'], signals: ['payments'], domains: [],
    }))
    put('.dev/context/analysis.json', JSON.stringify({
      schema: 2, stack: { external_imports: { react: 1 } },
      inventory: { by_language: { javascript: { files: 1 } } },
      selection: { files: [] }, schema_files: [], routes: [],
    }))
    const result = invoke(lensSelect, ['--id', 'request-lenses', '--analysis', join(root, '.dev/context/analysis.json')])
    assert.equal(result.status, 0, result.stderr)
    const selected = JSON.parse(result.stdout)
    assert.ok(selected.attached.builder.includes('payments'))
    assert.ok(selected.derived_from_project.includes('web-performance'))
    assert.ok(!selected.attached.builder.includes('web-performance'), 'unrelated project domain should not attach')
  })
})

test('lens selection retains every matching lens and domain routing adds its specialist boundaries', () => {
  withProject('ae-lens-unbounded-', ({ root, put, invoke }) => {
    const selected = invoke(lensSelect, ['--team', 'builder', '--signals', 'rendered,test'])
    assert.equal(selected.status, 0, selected.stderr)
    const lenses = JSON.parse(selected.stdout)
    assert.ok(lenses.attached.builder.includes('ui-finish'))
    assert.ok(lenses.attached.builder.includes('accessibility'))
    assert.ok(lenses.attached.builder.includes('test-automation'))

    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    const started = call('start', '--id', 'domain-routing', '--title', 'Improve payment handling',
      '--kind', 'feature', '--risk', 'none', '--domain', 'payments')
    assert.equal(started.status, 0, started.stdout)
    const run = JSON.parse(readFileSync(join(root, '.dev/work/domain-routing/run.json'), 'utf8'))
    for (const role of ['security', 'data', 'reliability']) {
      assert.ok(run.team.includes(role), `${role} should be selected by the payments domain boundary`)
      assert.ok(!Object.hasOwn(run.routing.skipped, role), `${role} must not remain recorded as skipped`)
    }
  })
})

test('native enforcement is reported only for the current host session', () => {
  withProject('ae-enforce-session-', ({ root, put, invoke }) => {
    put('.dev/context/.keep', '')
    const hook = spawnSync(process.execPath, [guard, 'session-start'], {
      cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root, session_id: 'old-session' }),
    })
    assert.equal(hook.status, 0)
    const read = (session) => JSON.parse(invoke(forge, ['contract'], { CLAUDE_CODE_SESSION_ID: session }).stdout)
    assert.equal(read('current-session').enforce, 'none')
    assert.equal(read('old-session').enforce, 'native')
  })
})

test('guard resolves relative bookkeeping paths against the project in hook input', () => {
  withProject('ae-guard-path-', ({ root, put }) => {
    put('.dev/work/guard-path/run.json', JSON.stringify({
      id: 'guard-path', status: 'active', phase: 'understand',
      approval_required: true, approval: null, updated_at: '2026-09-27T00:00:00Z',
    }))
    const check = (filePath) => spawnSync(process.execPath, [guard, 'pre-tool-use'], {
      cwd: repo, encoding: 'utf8',
      input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: filePath } }),
    })
    assert.equal(check('.dev/work/guard-path/results/builder.md').status, 0)
    assert.equal(check('src/behavior.js').status, 2)
  })
})

test('Forge cannot finish with a verdict that disagrees with Verifier evidence', () => {
  withProject('ae-verdict-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    const start = call('start', '--id', 'verdict', '--title', 'Check verdict', '--kind', 'audit', '--risk', 'none')
    assert.equal(start.status, 0, start.stdout)
    assert.equal(call('artifact', '--id', 'verdict').status, 0)
    assert.equal(call('lenses', '--id', 'verdict', '--json', JSON.stringify({ attached: {}, assessed: true })).status, 0)
    const audit = put('.dev/work/verdict/results/auditor.md', '# Auditor\n\n## OUTCOME\nAudit complete.\n')
    assert.equal(call('note', '--id', 'verdict', '--role', 'auditor', '--summary', 'Audit complete', '--result', audit).status, 0)
    assert.equal(call('phase', '--id', 'verdict', '--to', 'verify', '--summary', 'Reviewing audit').status, 0)
    const fail = put('.dev/work/verdict/results/verifier.md', reviewResult('verifier', 'FAIL'))
    assert.equal(call('note', '--id', 'verdict', '--role', 'verifier', '--summary', 'Failed', '--severity', 'none', '--review-context', 'same-session', '--result', fail).status, 0)
    const finish = (...extra) => call('finish', '--id', 'verdict', '--summary', 'Audit reviewed', '--verification', 'Review recorded', ...extra)
    assert.notEqual(finish().status, 0, 'the verdict must be explicit')
    const mismatch = finish('--result', 'PASS')
    assert.equal(mismatch.status, 5)
    assert.match(JSON.parse(mismatch.stdout).error, /verdict disagrees/)
    const pass = put('.dev/work/verdict/results/verifier-pass.md', reviewResult('verifier', 'PASS'))
    put('.dev/work/verdict/scratch/temporary.md', 'Disposable notes\n')
    assert.equal(call('section', '--id', 'verdict', '--name', 'verification', '--from', pass).status, 0)
    assert.equal(call('note', '--id', 'verdict', '--role', 'verifier', '--summary', 'Passed', '--severity', 'none', '--review-context', 'same-session', '--result', pass).status, 0)
    assert.equal(finish('--result', 'PASS').status, 0)
    assert.match(readFileSync(join(root, '.dev/completed/verdict.md'), 'utf8'), /### Verdict\nPASS/)
    assert.match(readFileSync(join(root, '.dev/completed/verdict.md'), 'utf8'), /Implementation summary:\*\* Audit reviewed/)
    assert.equal(existsSync(join(root, '.dev/work/verdict/scratch')), false)
    assert.equal(JSON.parse(finish('--result', 'PASS').stdout).reused, true)
  })
})

test('delivery requires an approved review and challenge of the current plan before build', () => {
  withProject('ae-plan-gate-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    const start = call('start', '--id', 'plan-gate', '--title', 'Change a shared contract',
      '--kind', 'feature', '--risk', 'none')
    assert.equal(start.status, 0, start.stdout)
    assert.deepEqual(JSON.parse(start.stdout).team, ['architect', 'plan-reviewer', 'plan-challenger', 'builder', 'verifier'])
    assert.equal(call('artifact', '--id', 'plan-gate').status, 0)
    assert.equal(call('brief', '--id', 'plan-gate').status, 0)
    const briefPath = join(root, '.dev/work/plan-gate/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'Specified for test.'))
    assert.equal(call('phase', '--id', 'plan-gate', '--to', 'plan', '--summary', 'Designing').status, 0)

    const firstPlan = put('.dev/work/plan-gate/results/architect.md', '# Architect\n\n## OUTCOME\nFirst plan.\n')
    assert.equal(call('note', '--id', 'plan-gate', '--role', 'architect', '--summary', 'First plan',
      '--severity', 'none', '--result', firstPlan).status, 0)
    const revise = put('.dev/work/plan-gate/results/plan-reviewer.md',
      reviewResult('plan-reviewer', 'REVISE'))
    assert.equal(call('note', '--id', 'plan-gate', '--role', 'plan-reviewer', '--summary', 'Revise plan',
      '--severity', 'high', '--result', revise).status, 0)
    const blocked = call('phase', '--id', 'plan-gate', '--to', 'approval', '--summary', 'Awaiting approval')
    assert.equal(blocked.status, 5)
    assert.match(JSON.parse(blocked.stdout).error, /Plan Reviewer has not approved/)

    const secondPlan = put('.dev/work/plan-gate/results/architect-revision.md',
      '# Architect\n\n## OUTCOME\nRevised plan.\n')
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan', '--from', secondPlan).status, 0)
    assert.equal(call('note', '--id', 'plan-gate', '--role', 'architect', '--summary', 'Revised plan',
      '--severity', 'none', '--result', secondPlan).status, 0)
    const stale = call('phase', '--id', 'plan-gate', '--to', 'approval', '--summary', 'Awaiting approval')
    assert.equal(stale.status, 5)
    assert.match(JSON.parse(stale.stdout).error, /Plan Reviewer has not approved/)

    const approved = put('.dev/work/plan-gate/results/plan-reviewer-approved.md',
      reviewResult('plan-reviewer', 'APPROVED'))
    const inconsistent = call('note', '--id', 'plan-gate', '--role', 'plan-reviewer',
      '--summary', 'Approved', '--severity', 'high', '--result', approved)
    assert.equal(inconsistent.status, 5)
    assert.match(JSON.parse(inconsistent.stdout).error, /severity disagrees/)
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan-review', '--from', approved).status, 0)
    assert.equal(call('note', '--id', 'plan-gate', '--role', 'plan-reviewer', '--summary', 'Approved',
      '--severity', 'none', '--result', approved).status, 0)
    const noChallenge = call('phase', '--id', 'plan-gate', '--to', 'approval', '--summary', 'Awaiting approval')
    assert.equal(noChallenge.status, 5)
    assert.match(JSON.parse(noChallenge.stdout).error, /Plan Challenger/)
    const challenged = put('.dev/work/plan-gate/results/plan-challenger.md',
      reviewResult('plan-challenger', 'APPROVED'))
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan-challenge', '--from', challenged).status, 0)
    assert.equal(call('note', '--id', 'plan-gate', '--role', 'plan-challenger', '--summary', 'Challenge approved',
      '--severity', 'none', '--result', challenged).status, 0)
    const changedPlan = put('.dev/work/plan-gate/results/architect-unreviewed.md',
      '# Architect\n\n## OUTCOME\nUnreviewed plan edit.\n')
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan', '--from', changedPlan).status, 0)
    const changed = call('phase', '--id', 'plan-gate', '--to', 'approval', '--summary', 'Awaiting approval')
    assert.equal(changed.status, 5)
    assert.match(JSON.parse(changed.stdout).error, /plan changed after challenge and user approval/)
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan', '--from', secondPlan).status, 0)
    const challengeAgain = put('.dev/work/plan-gate/results/plan-challenger-2.md',
      reviewResult('plan-challenger', 'APPROVED'))
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan-challenge', '--from', challengeAgain).status, 0)
    assert.equal(call('note', '--id', 'plan-gate', '--role', 'plan-challenger', '--summary', 'Challenge approved again',
      '--severity', 'none', '--result', challengeAgain).status, 0)
    assert.equal(call('phase', '--id', 'plan-gate', '--to', 'approval', '--summary', 'Awaiting approval').status, 0)
    assert.equal(call('approve', '--id', 'plan-gate', '--by', 'user', '--basis', 'Approved in test').status, 0)
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan', '--from', changedPlan).status, 0)
    const changedAfterApproval = call('phase', '--id', 'plan-gate', '--to', 'build', '--summary', 'Building')
    assert.equal(changedAfterApproval.status, 5)
    assert.match(JSON.parse(changedAfterApproval.stdout).error, /user approval/)
    assert.equal(call('section', '--id', 'plan-gate', '--name', 'plan', '--from', secondPlan).status, 0)
    assert.equal(call('phase', '--id', 'plan-gate', '--to', 'build', '--summary', 'Building').status, 0)
    assert.match(call('report', '--id', 'plan-gate').stdout, /\*\*Plan review\*\* · APPROVED · 2 passes/)
  })
})

test('repair must contribute a new Builder result before the next verification', () => {
  withProject('ae-repair-gate-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'repair-gate', '--title', 'Fix a bounded issue',
      '--kind', 'feature', '--risk', 'access').status, 0)
    assert.equal(call('brief', '--id', 'repair-gate').status, 0)
    assert.equal(call('artifact', '--id', 'repair-gate').status, 0)
    const briefPath = join(root, '.dev/work/repair-gate/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'Specified for test.'))
    approvePlan({ root, put, call }, 'repair-gate')
    assert.equal(call('phase', '--id', 'repair-gate', '--to', 'build', '--summary', 'Building').status, 0)
    const built = put('.dev/work/repair-gate/results/builder.md', '# Builder\n\n## OUTCOME\nBuilt first candidate.\n')
    assert.equal(call('note', '--id', 'repair-gate', '--role', 'builder', '--summary', 'First candidate',
      '--severity', 'none', '--result', built).status, 0)
    const reused = call('note', '--id', 'repair-gate', '--role', 'builder', '--summary', 'Second pass',
      '--severity', 'none', '--result', built)
    assert.equal(reused.status, 5)
    assert.match(JSON.parse(reused.stdout).error, /already recorded/)
    writeFileSync(built, '# Builder\n\n## OUTCOME\nOverwritten.\n')
    const overwritten = call('phase', '--id', 'repair-gate', '--to', 'verify', '--summary', 'Reviewing')
    assert.equal(overwritten.status, 5)
    assert.match(JSON.parse(overwritten.stdout).error, /result changed/)
    writeFileSync(built, '# Builder\n\n## OUTCOME\nBuilt first candidate.\n')
    assert.equal(call('phase', '--id', 'repair-gate', '--to', 'verify', '--summary', 'Reviewing').status, 0)
    const candidateReview = put('.dev/work/repair-gate/results/security-candidate.md', '# Security\n\n## OUTCOME\nCandidate checked.\n')
    assert.equal(call('note', '--id', 'repair-gate', '--role', 'security', '--summary', 'Candidate finding',
      '--severity', 'high', '--result', candidateReview).status, 0)
    const failed = put('.dev/work/repair-gate/results/verifier.md',
      reviewResult('verifier', 'FAIL'))
    assert.equal(call('note', '--id', 'repair-gate', '--role', 'verifier', '--summary', 'Failed',
      '--severity', 'high', '--review-context', 'same-session', '--result', failed).status, 0)
    const repairWithoutApproval = call('phase', '--id', 'repair-gate', '--to', 'repair', '--summary', 'Repairing')
    assert.equal(repairWithoutApproval.status, 5)
    assert.match(JSON.parse(repairWithoutApproval.stdout).error, /repair scope/)
    assert.equal(call('phase', '--id', 'repair-gate', '--to', 'approval', '--summary', 'Awaiting repair approval').status, 0)
    const packet = call('approval-packet', '--id', 'repair-gate')
    assert.equal(packet.status, 0, packet.stderr)
    assert.match(packet.stdout, /Repair approval packet/)
    assert.match(packet.stdout, /Verification finding that defines the repair scope/)
    assert.match(packet.stdout, /### Verdict\nFAIL/)
    assert.equal(call('approve', '--id', 'repair-gate', '--by', 'user', '--basis', 'Repair is within the approved plan').status, 0)
    assert.equal(call('phase', '--id', 'repair-gate', '--to', 'repair', '--summary', 'Repairing').status, 0)
    const missing = call('phase', '--id', 'repair-gate', '--to', 'verify', '--summary', 'Reviewing again')
    assert.equal(missing.status, 5)
    assert.match(JSON.parse(missing.stdout).error, /current revision/)
    const repaired = put('.dev/work/repair-gate/results/builder-repair.md',
      '# Builder\n\n## OUTCOME\nRepaired candidate.\n')
    assert.equal(call('note', '--id', 'repair-gate', '--role', 'builder', '--summary', 'Repair complete',
      '--severity', 'none', '--result', repaired).status, 0)
    assert.equal(call('phase', '--id', 'repair-gate', '--to', 'verify', '--summary', 'Reviewing again').status, 0)
    const record = join(root, '.dev/work/repair-gate/run.json')
    const current = JSON.parse(readFileSync(record, 'utf8'))
    writeFileSync(record, JSON.stringify({ ...current, repair_cycles: 2 }))
    const capped = call('phase', '--id', 'repair-gate', '--to', 'plan', '--summary', 'Try another approach')
    assert.equal(capped.status, 5)
    assert.match(JSON.parse(capped.stdout).error, /repair limit reached/)
  })
})

test('approval requires a complete brief and build refuses a changed approved brief', () => {
  withProject('ae-approval-gate-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'approval-gate', '--title', 'Make an approved change',
      '--kind', 'feature', '--risk', 'none').status, 0)
    const approve = () => call('approve', '--id', 'approval-gate', '--by', 'user', '--basis', 'Approved in chat')
    assert.equal(approve().status, 5, 'approval cannot occur before the reviewed plan')
    assert.equal(call('brief', '--id', 'approval-gate').status, 0)
    assert.equal(approve().status, 5, 'a scaffold with TODO sections cannot be approved')
    const briefPath = join(root, '.dev/work/approval-gate/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'Specified for test.'))
    assert.equal(call('artifact', '--id', 'approval-gate').status, 0)
    approvePlan({ root, put, call }, 'approval-gate')
    writeFileSync(briefPath, `${readFileSync(briefPath, 'utf8')}\nChanged after approval.\n`)
    const changed = call('phase', '--id', 'approval-gate', '--to', 'build', '--summary', 'Building')
    assert.equal(changed.status, 5)
    assert.match(JSON.parse(changed.stdout).error, /changed after approval/)
  })
})

test('finish rejects files changed after Verifier inspected the candidate', () => {
  withProject('ae-candidate-gate-', ({ root, put, invoke }) => {
    surveyed(put)
    put('src/existing.js', 'export const existing = true\n')
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    assert.equal(git('init', '-q').status, 0)
    assert.equal(git('add', '.').status, 0)
    assert.equal(git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      'commit', '-qm', 'baseline').status, 0)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'candidate-gate', '--title', 'Change behavior',
      '--kind', 'feature', '--risk', 'none').status, 0)
    assert.equal(call('artifact', '--id', 'candidate-gate').status, 0)
    assert.equal(call('brief', '--id', 'candidate-gate').status, 0)
    const briefPath = join(root, '.dev/work/candidate-gate/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'src/behavior.js'))
    assert.equal(call('lenses', '--id', 'candidate-gate', '--json',
      JSON.stringify({ attached: {}, assessed: true })).status, 0)
    approvePlan({ root, put, call }, 'candidate-gate')
    assert.equal(call('phase', '--id', 'candidate-gate', '--to', 'build', '--summary', 'Building').status, 0)
    put('src/behavior.js', 'export const value = 1\n')
    const built = put('.dev/work/candidate-gate/results/builder.md', '# Builder\n\n## OUTCOME\nBuilt.\n')
    assert.equal(call('note', '--id', 'candidate-gate', '--role', 'builder', '--summary', 'Built',
      '--severity', 'none', '--result', built).status, 0)
    assert.equal(call('phase', '--id', 'candidate-gate', '--to', 'verify', '--summary', 'Reviewing').status, 0)
    assert.equal(call('audit', '--id', 'candidate-gate').status, 0)
    const verified = put('.dev/work/candidate-gate/results/verifier.md',
      reviewResult('verifier', 'PASS'))
    put('src/behavior.js', 'export const value = 9\n')
    const movedDuringReview = call('note', '--id', 'candidate-gate', '--role', 'verifier', '--summary', 'Stale review',
      '--severity', 'none', '--review-context', 'same-session', '--result', verified)
    assert.equal(movedDuringReview.status, 5)
    assert.match(JSON.parse(movedDuringReview.stdout).error, /candidate changed during verification/)
    put('src/behavior.js', 'export const value = 1\n')
    assert.equal(call('note', '--id', 'candidate-gate', '--role', 'verifier', '--summary', 'Passed',
      '--severity', 'none', '--review-context', 'same-session', '--result', verified).status, 0)
    put('src/behavior.js', 'export const value = 2\n')
    const finish = call('finish', '--id', 'candidate-gate', '--summary', 'Done',
      '--verification', 'Checked', '--result', 'PASS', '--accept-gaps', 'audit')
    assert.equal(finish.status, 5)
    assert.match(JSON.parse(finish.stdout).error, /candidate changed after Verifier/)
  })
})

test('delivery without a Git baseline reports the unpinned candidate as a gap', () => {
  withProject('ae-no-baseline-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'no-baseline', '--title', 'Change behavior',
      '--kind', 'feature', '--risk', 'none').status, 0)
    assert.equal(call('artifact', '--id', 'no-baseline').status, 0)
    assert.equal(call('brief', '--id', 'no-baseline').status, 0)
    const briefPath = join(root, '.dev/work/no-baseline/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'Specified for test.'))
    approvePlan({ root, put, call }, 'no-baseline')
    assert.equal(call('lenses', '--id', 'no-baseline', '--json',
      JSON.stringify({ attached: {}, assessed: true })).status, 0)
    assert.equal(call('phase', '--id', 'no-baseline', '--to', 'build', '--summary', 'Building').status, 0)
    const built = put('.dev/work/no-baseline/results/builder.md', '# Builder\n\n## OUTCOME\nBuilt.\n')
    assert.equal(call('note', '--id', 'no-baseline', '--role', 'builder', '--summary', 'Built',
      '--severity', 'none', '--result', built).status, 0)
    assert.equal(call('phase', '--id', 'no-baseline', '--to', 'verify', '--summary', 'Reviewing').status, 0)
    const verified = put('.dev/work/no-baseline/results/verifier.md',
      reviewResult('verifier', 'PASS'))
    assert.equal(call('note', '--id', 'no-baseline', '--role', 'verifier', '--summary', 'Passed',
      '--severity', 'none', '--review-context', 'same-session', '--result', verified).status, 0)
    const finish = call('finish', '--id', 'no-baseline', '--summary', 'Done',
      '--verification', 'Checked', '--result', 'PASS')
    assert.equal(finish.status, 5)
    assert.match(JSON.parse(finish.stdout).gaps[0].why, /no Git baseline/)
    const residual = put('.dev/work/no-baseline/results/verifier-residual.md',
      reviewResult('verifier', 'PASS'))
    assert.equal(call('section', '--id', 'no-baseline', '--name', 'verification', '--from', residual).status, 0)
    assert.equal(call('note', '--id', 'no-baseline', '--role', 'verifier', '--summary', 'Accepted issue',
      '--severity', 'high', '--residual', 'Inherited defect outside this change',
      '--review-context', 'same-session', '--result', residual).status, 0)
    const contradictory = call('finish', '--id', 'no-baseline', '--summary', 'Done',
      '--verification', 'Checked', '--result', 'PASS', '--accept-gaps', 'audit')
    assert.equal(contradictory.status, 5)
    assert.match(JSON.parse(contradictory.stdout).error, /unresolved blocking findings/)
  })
})

test('explicit deep delivery selects plan reviewer and challenger', () => {
  withProject('ae-standard-route-', ({ root, put, invoke }) => {
    surveyed(put)
    const start = invoke(forge, ['start', '--id', 'standard-route', '--title', 'Moderate change',
      '--kind', 'feature', '--risk', 'none', '--root', root])
    assert.equal(start.status, 0, start.stdout)
    const routed = JSON.parse(start.stdout)
    assert.deepEqual(routed.team, ['architect', 'plan-reviewer', 'plan-challenger', 'builder', 'verifier'])
    assert.ok(!('plan-reviewer' in routed.routing.skipped))
  })
})

test('a pre-v5 delivery cannot bypass mandatory user plan approval on resume', () => {
  withProject('ae-legacy-approval-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'legacy-approval', '--title', 'Legacy change', '--kind', 'feature', '--risk', 'none').status, 0)
    const path = join(root, '.dev/work/legacy-approval/run.json')
    const legacy = JSON.parse(readFileSync(path, 'utf8'))
    legacy.contract = 4
    legacy.approval_required = false
    writeFileSync(path, `${JSON.stringify(legacy, null, 2)}\n`)
    assert.equal(call('phase', '--id', 'legacy-approval', '--to', 'plan', '--summary', 'Resuming plan').status, 0)
    const blocked = call('phase', '--id', 'legacy-approval', '--to', 'approval', '--summary', 'Awaiting approval')
    assert.equal(blocked.status, 5)
    assert.match(JSON.parse(blocked.stdout).error, /predates mandatory user plan approval/)
  })
})

test('audit routing keeps delivery-only roles out even when request signals match them', () => {
  withProject('ae-audit-route-', ({ root, put, invoke }) => {
    surveyed(put)
    const start = invoke(forge, ['start', '--id', 'audit-route', '--title', 'Audit uncertain behavior',
      '--kind', 'audit', '--risk', 'none', '--signals', 'unknown,ambiguous', '--root', root])
    assert.equal(start.status, 0, start.stdout)
    const routed = JSON.parse(start.stdout)
    assert.deepEqual(routed.team, ['auditor', 'verifier'])
    assert.match(routed.routing.skipped.investigator, /audit-only/)
    assert.match(routed.routing.skipped.product, /audit-only/)
  })
})

test('risk flags add their specialists within a deep review flow', () => {
  const cases = [
    ['access', 'security'],
    ['stored-shape', 'data'],
    ['rendered', 'experience'],
    ['runtime', 'reliability'],
    ['irreversible', null],
  ]
  for (const [risk, specialist] of cases) {
    withProject(`ae-risk-${risk}-`, ({ root, put, invoke }) => {
      surveyed(put)
      const start = invoke(forge, ['start', '--id', 'risk-route', '--title', 'Risk route',
        '--kind', 'feature', '--risk', risk, '--root', root])
      assert.equal(start.status, 0, `${risk}: ${start.stdout}`)
      const routed = JSON.parse(start.stdout)
      if (specialist) assert.ok(routed.team.includes(specialist), risk)
      assert.ok(routed.team.includes('plan-reviewer') && routed.team.includes('plan-challenger'), risk)
    })
  }
})

test('kit routing metadata agrees with role and lens documents', () => {
  const checked = spawnSync(process.execPath, [validateKit], { encoding: 'utf8' })
  assert.equal(checked.status, 0, checked.stdout || checked.stderr)
})

test('risk and kind are change signals for lens selection', () => {
  withProject('ae-lens-risk-', ({ invoke }) => {
    const rendered = JSON.parse(invoke(lensSelect, ['--team', 'experience,verifier', '--kind', 'feature', '--risk', 'rendered']).stdout)
    assert.ok(rendered.attached.experience.includes('accessibility'))
    assert.ok(rendered.attached.verifier.includes('ui-finish'))
    const refactor = JSON.parse(invoke(lensSelect, ['--team', 'builder', '--kind', 'refactor', '--risk', 'none']).stdout)
    assert.ok(refactor.attached.builder.includes('test-automation'))
  })
})

test('Python manifest dependencies derive AI and payments domains', () => {
  withProject('ae-python-domains-', ({ root, put, invoke }) => {
    put('requirements.txt', 'openai>=1.0\nstripe==10.0\n')
    put('app.py', 'import openai\nimport stripe\n')
    const scanned = invoke(analyze, ['--root', root])
    assert.equal(scanned.status, 0, scanned.stderr)
    const selected = invoke(lensSelect, ['--team', 'builder', '--analysis', join(root, '.dev/context/analysis.json')])
    assert.equal(selected.status, 0, selected.stderr)
    const lenses = JSON.parse(selected.stdout)
    assert.ok(lenses.derived_from_project.includes('ai-llm'))
    assert.ok(lenses.derived_from_project.includes('payments'))
  })
})

test('guard covers apply_patch for source edits and allows ledger-only patches', () => {
  withProject('ae-guard-patch-', ({ root, put }) => {
    put('.dev/work/guard-patch/run.json', JSON.stringify({
      id: 'guard-patch', status: 'active', phase: 'understand',
      approval_required: true, approval: null, updated_at: '2026-09-27T00:00:00Z',
    }))
    const check = (command) => spawnSync(process.execPath, [guard, 'pre-tool-use'], {
      cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: root, tool_name: 'apply_patch', tool_input: { command } }),
    })
    assert.equal(check('*** Begin Patch\n*** Update File: src/behavior.js\n*** End Patch').status, 2)
    assert.equal(check('*** Begin Patch\n*** Update File: .dev/work/guard-patch/result.md\n*** End Patch').status, 0)
  })
})

test('critical or high delivery findings cannot be accepted as residual risk', () => {
  withProject('ae-block-residual-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'block-residual', '--title', 'Check change', '--kind', 'feature', '--risk', 'none').status, 0)
    assert.equal(call('artifact', '--id', 'block-residual').status, 0)
    assert.equal(call('brief', '--id', 'block-residual').status, 0)
    const briefPath = join(root, '.dev/work/block-residual/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'Specified for test.'))
    approvePlan({ root, put, call }, 'block-residual')
    assert.equal(call('lenses', '--id', 'block-residual', '--json', JSON.stringify({ attached: {}, assessed: true })).status, 0)
    assert.equal(call('phase', '--id', 'block-residual', '--to', 'build', '--summary', 'Build').status, 0)
    const built = put('.dev/work/block-residual/results/builder.md', '# Builder\n\n## OUTCOME\nBuilt.\n')
    assert.equal(call('note', '--id', 'block-residual', '--role', 'builder', '--summary', 'Built', '--severity', 'none', '--result', built).status, 0)
    assert.equal(call('phase', '--id', 'block-residual', '--to', 'verify', '--summary', 'Verify').status, 0)
    const verdict = put('.dev/work/block-residual/results/verifier.md', reviewResult('verifier', 'PASS WITH RESIDUAL RISK'))
    assert.equal(call('section', '--id', 'block-residual', '--name', 'verification', '--from', verdict).status, 0)
    assert.equal(call('note', '--id', 'block-residual', '--role', 'verifier', '--summary', 'Unfixed', '--severity', 'high',
      '--residual', 'Accepted by author', '--review-context', 'same-session', '--result', verdict).status, 0)
    const finish = call('finish', '--id', 'block-residual', '--summary', 'Done', '--verification', 'Checked',
      '--result', 'PASS WITH RESIDUAL RISK', '--accept-gaps', 'audit')
    assert.equal(finish.status, 5)
    assert.match(JSON.parse(finish.stdout).error, /unresolved blocking findings/)
  })
})

test('audit can complete while reporting a high-severity repository finding', () => {
  withProject('ae-audit-high-', ({ root, put, invoke }) => {
    surveyed(put)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'audit-high', '--title', 'Audit code', '--kind', 'audit', '--risk', 'none').status, 0)
    assert.equal(call('artifact', '--id', 'audit-high').status, 0)
    assert.equal(call('lenses', '--id', 'audit-high', '--json', JSON.stringify({ attached: {}, assessed: true })).status, 0)
    const audited = put('.dev/work/audit-high/results/auditor.md', '# Auditor\n\n## OUTCOME\nHigh-risk finding.\n')
    assert.equal(call('note', '--id', 'audit-high', '--role', 'auditor', '--summary', 'Found issue', '--severity', 'high', '--result', audited).status, 0)
    assert.equal(call('phase', '--id', 'audit-high', '--to', 'verify', '--summary', 'Review').status, 0)
    const verified = put('.dev/work/audit-high/results/verifier.md', reviewResult('verifier', 'PASS'))
    assert.equal(call('section', '--id', 'audit-high', '--name', 'verification', '--from', verified).status, 0)
    assert.equal(call('note', '--id', 'audit-high', '--role', 'verifier', '--summary', 'Audit sound', '--severity', 'high',
      '--review-context', 'same-session', '--result', verified).status, 0)
    const finish = call('finish', '--id', 'audit-high', '--summary', 'Reported finding', '--verification', 'Evidence checked', '--result', 'PASS')
    assert.equal(finish.status, 0, finish.stdout)
  })
})

test('routine delivery requires an approved current Plan Reviewer pass without Challenger or user approval', () => {
  withProject('ae-standard-depth-', ({ root, put, invoke }) => {
    surveyed(put)
    const defaultStart = spawnSync(process.execPath, [forge, 'start', '--id', 'default-depth',
      '--title', 'Default small change', '--kind', 'feature', '--risk', 'none', '--root', root], {
      cwd: root, encoding: 'utf8', env: { ...process.env, AE_WORKFLOW_DEPTH: '' },
    })
    assert.equal(defaultStart.status, 0, defaultStart.stdout)
    assert.deepEqual(JSON.parse(defaultStart.stdout).team, ['architect', 'plan-reviewer', 'builder', 'verifier'])
    const call = (...args) => invoke(forge, [...args, '--root', root])
    const started = call('start', '--id', 'standard-depth', '--title', 'Small behavior change',
      '--kind', 'feature', '--risk', 'none', '--depth', 'standard')
    assert.equal(started.status, 0, started.stdout)
    const routed = JSON.parse(started.stdout)
    assert.deepEqual(routed.team, ['architect', 'plan-reviewer', 'builder', 'verifier'])
    assert.equal(routed.approval_required, false)
    assert.equal(call('brief', '--id', 'standard-depth').status, 0)
    assert.equal(call('artifact', '--id', 'standard-depth').status, 0)
    const briefPath = join(root, '.dev/work/standard-depth/brief.md')
    writeFileSync(briefPath, readFileSync(briefPath, 'utf8').replaceAll('TODO', 'Specified for test.'))
    assert.equal(call('phase', '--id', 'standard-depth', '--to', 'plan', '--summary', 'Plan').status, 0)
    const plan = put('.dev/work/standard-depth/results/architect.md', '# Architect\n\n## OUTCOME\nSmall plan.\n')
    assert.equal(call('section', '--id', 'standard-depth', '--name', 'plan', '--from', plan).status, 0)
    assert.equal(call('note', '--id', 'standard-depth', '--role', 'architect', '--summary', 'Planned',
      '--severity', 'none', '--result', plan).status, 0)
    const runPath = join(root, '.dev/work/standard-depth/run.json')
    const currentRun = readFileSync(runPath, 'utf8')
    const legacyRun = JSON.parse(currentRun)
    legacyRun.contract = 7
    legacyRun.team = legacyRun.team.filter((role) => role !== 'plan-reviewer')
    writeFileSync(runPath, JSON.stringify(legacyRun))
    const legacy = call('phase', '--id', 'standard-depth', '--to', 'build', '--summary', 'Build')
    assert.equal(legacy.status, 5)
    assert.match(JSON.parse(legacy.stdout).error, /missing mandatory Plan Reviewer/)
    writeFileSync(runPath, currentRun)
    const unreviewed = call('phase', '--id', 'standard-depth', '--to', 'build', '--summary', 'Build')
    assert.equal(unreviewed.status, 5)
    assert.match(JSON.parse(unreviewed.stdout).error, /Plan Reviewer/)
    const revise = put('.dev/work/standard-depth/results/reviewer-revise.md',
      reviewResult('plan-reviewer', 'REVISE'))
    assert.equal(call('section', '--id', 'standard-depth', '--name', 'plan-review', '--from', revise).status, 0)
    assert.equal(call('note', '--id', 'standard-depth', '--role', 'plan-reviewer', '--summary', 'Revise',
      '--severity', 'high', '--result', revise).status, 0)
    const rejected = call('phase', '--id', 'standard-depth', '--to', 'build', '--summary', 'Build')
    assert.equal(rejected.status, 5)
    assert.match(JSON.parse(rejected.stdout).error, /Plan Reviewer has not approved/)
    const approved = put('.dev/work/standard-depth/results/reviewer-approved.md',
      reviewResult('plan-reviewer', 'APPROVED'))
    assert.equal(call('section', '--id', 'standard-depth', '--name', 'plan-review', '--from', approved).status, 0)
    assert.equal(call('note', '--id', 'standard-depth', '--role', 'plan-reviewer', '--summary', 'Approved',
      '--severity', 'none', '--result', approved).status, 0)
    const changed = put('.dev/work/standard-depth/results/changed-plan.md', '# Architect\n\n## OUTCOME\nChanged plan.\n')
    assert.equal(call('section', '--id', 'standard-depth', '--name', 'plan', '--from', changed).status, 0)
    const stale = call('phase', '--id', 'standard-depth', '--to', 'build', '--summary', 'Build')
    assert.equal(stale.status, 5)
    assert.match(JSON.parse(stale.stdout).error, /plan changed after Plan Reviewer/)
    assert.equal(call('section', '--id', 'standard-depth', '--name', 'plan', '--from', plan).status, 0)
    const build = call('phase', '--id', 'standard-depth', '--to', 'build', '--summary', 'Build')
    assert.equal(build.status, 0, build.stdout)
  })
})

test('access and irreversible changes cannot downgrade to standard review', () => {
  withProject('ae-deep-required-', ({ root, put, invoke }) => {
    surveyed(put)
    const result = invoke(forge, ['start', '--id', 'deep-required', '--title', 'Change auth', '--kind', 'feature',
      '--risk', 'access', '--depth', 'standard', '--root', root])
    assert.equal(result.status, 2)
    assert.match(JSON.parse(result.stdout).error, /requires deep review/)
  })
})

test('planning, diagnosis, and candidate review have read-only completion paths', () => {
  for (const [kind, role, section] of [
    ['plan', 'architect', 'plan'], ['diagnose', 'investigator', 'investigation'], ['review', null, null],
  ]) {
    withProject(`ae-${kind}-only-`, ({ root, put, invoke }) => {
      surveyed(put)
      const call = (...args) => invoke(forge, [...args, '--root', root])
      const id = `${kind}-only`
      const started = call('start', '--id', id, '--title', `${kind} only`, '--kind', kind, '--risk', 'none')
      assert.equal(started.status, 0, started.stdout)
      const run = JSON.parse(started.stdout)
      assert.equal(run.approval_required, false)
      const guarded = spawnSync(process.execPath, [guard, 'pre-tool-use'], {
        cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root, tool_name: 'apply_patch',
          tool_input: { command: '*** Begin Patch\n*** Update File: src/app.js\n*** End Patch' } }),
      })
      assert.equal(guarded.status, 2)
      assert.equal(call('artifact', '--id', id).status, 0)
      assert.equal(call('lenses', '--id', id, '--json', JSON.stringify({ attached: {}, assessed: true })).status, 0)
      assert.equal(call('phase', '--id', id, '--to', 'build', '--summary', 'Should fail').status, 5)
      if (kind === 'plan') assert.equal(call('phase', '--id', id, '--to', 'plan', '--summary', 'Design').status, 0)
      if (role) {
        const written = put(`.dev/work/${id}/results/${role}.md`, `# ${role}\n\n## OUTCOME\nEvidence-based result.\n`)
        assert.equal(call('section', '--id', id, '--name', section, '--from', written).status, 0)
        assert.equal(call('note', '--id', id, '--role', role, '--summary', 'Assessment', '--severity', 'none', '--result', written).status, 0)
      }
      assert.equal(call('phase', '--id', id, '--to', 'verify', '--summary', 'Check assessment').status, 0)
      const verdict = put(`.dev/work/${id}/results/verifier.md`, reviewResult('verifier', 'PASS'))
      assert.equal(call('section', '--id', id, '--name', 'verification', '--from', verdict).status, 0)
      assert.equal(call('note', '--id', id, '--role', 'verifier', '--summary', 'Sound assessment', '--severity', 'none',
        '--review-context', 'same-session', '--result', verdict).status, 0)
      const finished = call('finish', '--id', id, '--summary', 'Assessment delivered', '--verification', 'Evidence checked',
        '--result', 'PASS', '--accept-gaps', 'baseline')
      assert.equal(finished.status, 0, finished.stdout)
    })
  }
})

test('read-only review refuses completion if source changed after start', () => {
  withProject('ae-review-source-', ({ root, put, invoke }) => {
    surveyed(put)
    put('src/app.js', 'export const value = 1\n')
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    assert.equal(git('init', '-q').status, 0)
    assert.equal(git('add', '.').status, 0)
    assert.equal(git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline').status, 0)
    const call = (...args) => invoke(forge, [...args, '--root', root])
    assert.equal(call('start', '--id', 'source-review', '--title', 'Review candidate', '--kind', 'review', '--risk', 'none').status, 0)
    assert.equal(call('artifact', '--id', 'source-review').status, 0)
    assert.equal(call('lenses', '--id', 'source-review', '--json', JSON.stringify({ attached: {}, assessed: true })).status, 0)
    assert.equal(call('phase', '--id', 'source-review', '--to', 'verify', '--summary', 'Review').status, 0)
    const verdict = put('.dev/work/source-review/results/verifier.md', reviewResult('verifier', 'PASS'))
    assert.equal(call('section', '--id', 'source-review', '--name', 'verification', '--from', verdict).status, 0)
    assert.equal(call('note', '--id', 'source-review', '--role', 'verifier', '--summary', 'Reviewed', '--severity', 'none',
      '--review-context', 'same-session', '--result', verdict).status, 0)
    put('src/app.js', 'export const value = 2\n')
    const finish = call('finish', '--id', 'source-review', '--summary', 'Reviewed', '--verification', 'Checked', '--result', 'PASS')
    assert.equal(finish.status, 5)
    assert.match(JSON.parse(finish.stdout).error, /source changed during a read-only run/)
  })
})
