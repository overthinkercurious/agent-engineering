import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { reviewResult } from './helpers/review-fixtures.mjs'
import { validateReviewResult } from '../skills/ae-forge/scripts/review-result.mjs'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forge = join(repo, 'skills/ae-forge/scripts/forge.mjs')
const guard = join(repo, 'skills/ae-forge/scripts/guard.mjs')

function fixture(run, depth = 'standard') {
  const root = mkdtempSync(join(tmpdir(), 'ae-review-safety-'))
  const put = (name, body) => {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); return path
  }
  const call = (...args) => spawnSync(process.execPath, [forge, ...args, '--root', root], {
    cwd: root, encoding: 'utf8', env: { ...process.env, CODEX_SESSION_ID: 'safety-session', CLAUDE_CODE_SESSION_ID: '', AE_WORKFLOW_DEPTH: '' },
  })
  const check = (session = 'safety-session', patch = '*** Begin Patch\n*** Update File: src/app.js\n*** End Patch') => spawnSync(process.execPath, [guard, 'pre-tool-use'], {
    cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root, session_id: session, tool_name: 'apply_patch', tool_input: { command: patch } }),
  })
  const ok = (...args) => { const result = call(...args); assert.equal(result.status, 0, result.stdout + result.stderr); return result }
  try {
    for (const name of ['00-index', 'stack', 'architecture', 'schema', 'commands', 'decisions']) put(`.dev/knowledge/${name}.md`, '# Knowledge\nReadiness: ready for reuse\n')
    put('.dev/rules/00-index.md', '# Rules\n')
    ok('start', '--id', 'safe', '--title', 'Small change', '--kind', 'feature', '--risk', 'none', '--depth', depth,
      ...(depth === 'deep' ? ['--approval-required', '--approval-reason', 'Fixture requires user authorization'] : []))
    ok('artifact', '--id', 'safe'); ok('brief', '--id', 'safe')
    const brief = join(root, '.dev/work/safe/brief.md')
    writeFileSync(brief, readFileSync(brief, 'utf8').replaceAll('TODO', 'Specified for fixture.'))
    ok('phase', '--id', 'safe', '--to', 'plan', '--summary', 'Plan')
    const plan = put('.dev/work/safe/results/architect.md', '# Architect\n\n## OUTCOME\nSmall plan.\n')
    ok('section', '--id', 'safe', '--name', 'plan', '--from', plan)
    ok('note', '--id', 'safe', '--role', 'architect', '--summary', 'Plan', '--severity', 'none', '--result', plan)
    const approve = () => {
      const review = put('.dev/work/safe/results/reviewer.md', reviewResult('plan-reviewer'))
      ok('section', '--id', 'safe', '--name', 'plan-review', '--from', review)
      ok('note', '--id', 'safe', '--role', 'plan-reviewer', '--summary', 'Approved', '--severity', 'none', '--review-context', 'same-session', '--result', review)
      if (depth === 'deep') {
        const challenge = put('.dev/work/safe/results/challenger.md', reviewResult('plan-challenger'))
        ok('section', '--id', 'safe', '--name', 'plan-challenge', '--from', challenge)
        ok('note', '--id', 'safe', '--role', 'plan-challenger', '--summary', 'Approved', '--severity', 'none', '--review-context', 'same-session', '--result', challenge)
        ok('phase', '--id', 'safe', '--to', 'approval', '--summary', 'Approve plan')
        ok('approve', '--id', 'safe', '--by', 'user', '--basis', 'Approved fixture plan')
      }
      ok('phase', '--id', 'safe', '--to', 'build', '--summary', 'Build')
    }
    run({ root, put, call, ok, check, approve, brief, plan })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('hook refuses unreviewed routine edits, permits approved build, and detects plan or brief drift', () => {
  fixture(({ check, approve, put, ok, brief, plan }) => {
    assert.equal(check().status, 2)
    approve()
    assert.equal(check().status, 0)
    const changed = put('.dev/work/safe/changed.md', 'Different plan.\n')
    ok('section', '--id', 'safe', '--name', 'plan', '--from', changed)
    assert.equal(check().status, 2)
    ok('section', '--id', 'safe', '--name', 'plan', '--from', plan)
    assert.equal(check().status, 0)
    writeFileSync(brief, readFileSync(brief, 'utf8') + '\nAdditional scope.\n')
    assert.equal(check().status, 2)
  })
})

test('hook isolates session routing, refuses ambiguous runs, and focus explicitly rebinds a session', () => {
  fixture(({ root, approve, check, put, ok }) => {
    approve()
    const current = JSON.parse(readFileSync(join(root, '.dev/work/safe/run.json'), 'utf8'))
    put('.dev/work/other/run.json', JSON.stringify({ ...current, id: 'other', phase: 'plan', session_ids: ['other-session'], updated_at: '2099-01-01' }))
    assert.equal(check().status, 0, 'a newer unrelated run must not control this session')
    assert.equal(check('other-session').status, 2)
    assert.equal(check('unknown-session').status, 2)
    ok('focus', '--id', 'other', '--role', 'forge', '--summary', 'Explicit resume')
    assert.equal(check().status, 2, 'focus changed this session to the planning run')
    assert.ok(!JSON.parse(readFileSync(join(root, '.dev/work/safe/run.json'), 'utf8')).session_ids.includes('safety-session'))
  })
})

test('hook permits standard repair after verification but forbids verification edits and bookkeeping moves into source', () => {
  fixture(({ approve, check, put, ok }) => {
    approve()
    const built = put('.dev/work/safe/results/builder.md', 'Built fixture.\n')
    ok('note', '--id', 'safe', '--role', 'builder', '--summary', 'Built', '--severity', 'none', '--result', built)
    ok('phase', '--id', 'safe', '--to', 'verify', '--summary', 'Verify')
    assert.equal(check().status, 2)
    assert.equal(check('safety-session', '*** Begin Patch\n*** Update File: .dev/work/safe/new.md\n*** Move to: src/app.js\n*** End Patch').status, 2)
    const verified = put('.dev/work/safe/results/verifier.md', reviewResult('verifier', 'FAIL'))
    ok('note', '--id', 'safe', '--role', 'verifier', '--summary', 'Repair required', '--severity', 'high', '--review-context', 'same-session', '--result', verified)
    ok('phase', '--id', 'safe', '--to', 'repair', '--summary', 'Repair within scope')
    assert.equal(check().status, 0)
  })
})

test('Forge rejects verdict-only approvals, incomplete criteria, and missing review context', () => {
  fixture(({ put, call }) => {
    const note = (result, ...extra) => call('note', '--id', 'safe', '--role', 'plan-reviewer', '--summary', 'Review', '--severity', 'none', '--result', result, ...extra)
    const incomplete = put('.dev/work/safe/results/minimal.md', '# Reviewer\n\n## OUTCOME\n\n### Verdict\nAPPROVED\n')
    assert.equal(note(incomplete, '--review-context', 'same-session').status, 5)
    const complete = put('.dev/work/safe/results/complete.md', reviewResult('plan-reviewer'))
    assert.equal(note(complete).status, 2)
    const criteria = put('.dev/work/safe/results/missing-criterion.md', reviewResult('plan-reviewer').replace('| 6 | Scope | PASS |', ''))
    assert.equal(note(criteria, '--review-context', 'same-session').status, 5)
  })
})

test('blocking uncertainty cannot be approved; a truthful NEEDS INPUT review can record it without inventing a defect', () => {
  const base = reviewResult('plan-reviewer').replace('## UNKNOWNS\nnone', '## UNKNOWNS\n| Unknown | Blocks? | What would resolve it |\n|---|---|---|\n| tenant authorization rule | yes | owner decision |')
  assert.equal(validateReviewResult('plan-reviewer', base, 'none').ok, false)
  const blocked = base.replace('### Verdict\nAPPROVED', '### Verdict\nREVISE').replace('## STATUS\nCOMPLETE', '## STATUS\nNEEDS INPUT')
  assert.equal(validateReviewResult('plan-reviewer', blocked, 'high').ok, true)
  assert.equal(validateReviewResult('plan-reviewer', blocked, 'low').ok, false)
  const nonblocking = base.replace('tenant authorization rule | yes |', 'tenant authorization rule | no |')
  assert.equal(validateReviewResult('plan-reviewer', nonblocking, 'none').ok, true)
})

test('deep hook rechecks human authorization and permits only a newly approved repair scope', () => {
  fixture(({ root, approve, check, put, ok }) => {
    assert.equal(check().status, 2)
    approve()
    assert.equal(check().status, 0)
    const record = join(root, '.dev/work/safe/run.json')
    const current = readFileSync(record, 'utf8')
    const stale = JSON.parse(current); stale.approval.plan_sha = 'stale'
    writeFileSync(record, JSON.stringify(stale)); assert.equal(check().status, 2)
    writeFileSync(record, current)
    const built = put('.dev/work/safe/results/builder.md', 'Built fixture.\n')
    ok('note', '--id', 'safe', '--role', 'builder', '--summary', 'Built', '--severity', 'none', '--result', built)
    ok('phase', '--id', 'safe', '--to', 'verify', '--summary', 'Verify')
    const verified = put('.dev/work/safe/results/verifier.md', reviewResult('verifier', 'FAIL'))
    ok('note', '--id', 'safe', '--role', 'verifier', '--summary', 'Repair required', '--severity', 'high', '--review-context', 'same-session', '--result', verified)
    ok('phase', '--id', 'safe', '--to', 'approval', '--summary', 'Approve repair')
    ok('approve', '--id', 'safe', '--by', 'user', '--basis', 'Approved bounded repair')
    ok('phase', '--id', 'safe', '--to', 'repair', '--summary', 'Repair')
    assert.equal(check().status, 0)
    const expired = JSON.parse(readFileSync(record, 'utf8')); expired.approval.at = '2000-01-01T00:00:00Z'
    writeFileSync(record, JSON.stringify(expired)); assert.equal(check().status, 2)
  }, 'deep')
})

test('review records preserve more than five blockers and unknown remediation; the validator CLI runs independently', () => {
  const rows = Array.from({ length: 7 }, (_, index) => `| F${index + 1} | high | src/file.js:${index + 1} | proven defect | wrong result | unknown: investigate repair | unknown: identify check |`).join('\n')
  const text = reviewResult('plan-reviewer', 'REVISE').replace('| F1 | high | fixture plan | invalid invariant | wrong result | fix invariant | fixture check |', rows)
  const checked = validateReviewResult('plan-reviewer', text, 'high')
  assert.equal(checked.ok, true, JSON.stringify(checked.errors)); assert.equal(checked.findings, 7)
  fixture(({ put }) => {
    const result = put('review.md', text)
    const cli = spawnSync(process.execPath, [join(repo, 'skills/ae-forge/scripts/review-result.mjs'), '--role', 'plan-reviewer', '--result', result, '--severity', 'high'], { encoding: 'utf8' })
    assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).findings, 7)
  })
})

test('host smoke CLI checks the distribution without pretending host loading or agent isolation were observed', () => {
  fixture(({ root, put }) => {
    const source = put('src/app.js', 'export const value = 1\n')
    const before = readFileSync(source, 'utf8')
    const cli = spawnSync(process.execPath, [join(repo, 'skills/ae-forge/scripts/host-smoke.mjs'), '--root', root], {
      encoding: 'utf8', env: { ...process.env, CODEX_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '' },
    })
    assert.equal(cli.status, 0, cli.stderr)
    const result = JSON.parse(cli.stdout)
    assert.equal(result.structure, true); assert.equal(result.lens_selector, true)
    assert.match(result.host_loading, /unverified/); assert.match(result.agent_dispatch, /unverified/)
    assert.match(result.hook_session_marker, /unverified/)
    assert.equal(readFileSync(source, 'utf8'), before)
  })
})

test('Antigravity adapter uses native payload paths, conversation routing, and JSON decisions', () => {
  fixture(({ root, approve, put, call }) => {
    put('.dev/context/context.md', 'Fixture context.\n')
    const hook = (mode, input) => {
      const result = spawnSync(process.execPath, [guard, mode], { cwd: root, encoding: 'utf8', input: JSON.stringify(input) })
      assert.equal(result.status, 0, result.stderr)
      return JSON.parse(result.stdout)
    }
    const invocation = hook('antigravity-pre-invocation', { conversationId: 'safety-session', workspacePaths: [root], invocationNum: 0 })
    assert.match(invocation.injectSteps[0].ephemeralMessage, /safety-session/)
    assert.equal(JSON.parse(call('contract', '--session', 'safety-session').stdout).enforce, 'native')
    const edit = (name, path, conversationId = 'safety-session') => hook('antigravity-pre-tool-use', {
      conversationId, workspacePaths: [root], toolCall: { name, args: { TargetFile: path } },
    })
    for (const name of ['write_to_file', 'replace_file_content', 'multi_replace_file_content']) {
      assert.equal(edit(name, join(root, 'src/app.js')).decision, 'deny')
      assert.equal(edit(name, join(root, '.dev/work/safe/result.md')).decision, 'allow')
    }
    approve()
    assert.equal(edit('write_to_file', join(root, 'src/app.js')).decision, 'allow')
    assert.equal(edit('write_to_file', join(root, 'src/app.js'), 'wrong-session').decision, 'deny')
    assert.equal(edit('write_to_file', join(tmpdir(), 'outside-project.js')).decision, 'deny')
    assert.equal(edit('view_file', join(root, 'src/app.js')).decision, 'allow')
  })
})
