#!/usr/bin/env node
// test-guard.mjs - the enforcement tier.
//
// Two properties, and the second matters more than the first. The guard must
// refuse the two things the kit already claims in writing; and it must fail
// OPEN on every malformed input, because a guard that blocks work when it is
// confused gets deleted, and a deleted guard enforces nothing.

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const guard = join(repo, 'skills', 'ae-forge', 'scripts', 'guard.mjs')
let passed = 0
let failed = 0
const check = (name, condition, detail = '') => {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) } else {
    failed++; process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`)
  }
}

const temp = mkdtempSync(join(tmpdir(), 'ae-guard-'))
try {
  mkdirSync(join(temp, '.dev', 'work', 'r1'), { recursive: true })
  mkdirSync(join(temp, '.dev', 'context'), { recursive: true })
  const record = (run) => writeFileSync(join(temp, '.dev', 'work', 'r1', 'run.json'),
    typeof run === 'string' ? run : JSON.stringify(run))
  const call = (mode, input) => spawnSync(process.execPath, [guard, mode],
    { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' })
  const editing = (file) => ({ cwd: temp, tool_name: 'Edit', tool_input: { file_path: join(temp, file) } })
  const base = { id: 'r1', status: 'active', tier: 'standard', updated_at: '2026-01-01T00:00:00Z' }

  // ------------------------------------------------ the two refusals -------
  record({ ...base, phase: 'plan', approval_required: true, approval: null })
  let r = call('pre-tool-use', editing('src/a.js'))
  check('an edit is refused while the run still needs approval', r.status === 2)
  check('the refusal names the approve command', /approve --id r1/.test(r.stderr))
  check('the refusal repeats that a reviewer verdict is not approval',
    /reviewer verdict is not user approval/i.test(r.stderr))

  record({ ...base, phase: 'verify', approval_required: true, approval: { by: 'user' } })
  r = call('pre-tool-use', editing('src/a.js'))
  check('an edit is refused during verify', r.status === 2)
  check('the refusal names the way out', /--to repair/.test(r.stderr))

  // ------------------------------------------------ what it must allow -----
  record({ ...base, phase: 'build', approval_required: true, approval: { by: 'user' } })
  check('an approved build may edit', call('pre-tool-use', editing('src/a.js')).status === 0)

  record({ ...base, phase: 'build', approval_required: false, approval: null })
  check('quick work with no approval requirement may edit',
    call('pre-tool-use', editing('src/a.js')).status === 0)

  // The kit's own records are written DURING the phases that are gated. A
  // guard that blocks them stops the ledger the gates read.
  record({ ...base, phase: 'verify', approval_required: true, approval: { by: 'user' } })
  check('the run ledger may still be written during verify',
    call('pre-tool-use', editing('.dev/work/r1/results/verifier.md')).status === 0)
  record({ ...base, phase: 'plan', approval_required: true, approval: null })
  check('the run artifact may still be written before approval',
    call('pre-tool-use', editing('.dev/runs/r1.md')).status === 0)

  check('a non-editing tool is never inspected',
    call('pre-tool-use', { cwd: temp, tool_name: 'Read', tool_input: { file_path: join(temp, 'src/a.js') } }).status === 0)

  // ------------------------------------------------ fail open --------------
  record('{ not json at all')
  check('a corrupt run record fails open', call('pre-tool-use', editing('src/a.js')).status === 0)
  record({ ...base, phase: 'plan', approval_required: true, approval: null, status: 'complete' })
  check('a closed run does not gate anything', call('pre-tool-use', editing('src/a.js')).status === 0)
  rmSync(join(temp, '.dev', 'work'), { recursive: true, force: true })
  check('no run at all fails open', call('pre-tool-use', editing('src/a.js')).status === 0)
  check('garbage on stdin fails open', call('pre-tool-use', 'not json').status === 0)
  check('empty stdin fails open', call('pre-tool-use', '').status === 0)
  check('an unknown mode fails open', call('nonsense', editing('src/a.js')).status === 0)

  // ------------------------------------------------ the marker -------------
  const markerPath = join(temp, '.dev', 'context', 'enforce.json')
  check('session-start exits 0', call('session-start', { cwd: temp }).status === 0)
  check('session-start writes the enforcement marker', existsSync(markerPath))
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  check('the marker declares the native tier', marker.enforce === 'native')
  // The kit must never report a trust boundary it does not have, and this is
  // the file that could be mistaken for one.
  check('the marker states its own limits', Array.isArray(marker.limits) && marker.limits.length >= 3)
  check('the marker admits a subagent may bypass it',
    marker.limits.some((l) => /subagent/i.test(l)))
  check('the marker admits the model can edit the hook',
    marker.limits.some((l) => /editable by the model/i.test(l)))

  // An unsurveyed project has no .dev/context to write into, and inventing one
  // would be this kit writing outside what the survey established.
  const bare = mkdtempSync(join(tmpdir(), 'ae-guard-bare-'))
  check('session-start does not create .dev in an unsurveyed project',
    call('session-start', { cwd: bare }).status === 0 && !existsSync(join(bare, '.dev')))
  rmSync(bare, { recursive: true, force: true })

  // ------------------------------------------------ the wiring -------------
  const hooks = JSON.parse(readFileSync(join(repo, 'hooks', 'hooks.json'), 'utf8'))
  check('hooks.json declares PreToolUse on the editing tools',
    /Edit/.test(hooks.hooks?.PreToolUse?.[0]?.matcher ?? ''))
  check('hooks.json declares SessionStart', Array.isArray(hooks.hooks?.SessionStart))
  const commands = JSON.stringify(hooks)
  check('hooks resolve through CLAUDE_PLUGIN_ROOT', commands.includes('${CLAUDE_PLUGIN_ROOT}'))
  check('hooks point at guard.mjs', commands.includes('guard.mjs'))
  const plugin = JSON.parse(readFileSync(join(repo, '.claude-plugin', 'plugin.json'), 'utf8'))
  check('the plugin manifest registers the hooks file', plugin.hooks === './hooks/hooks.json')
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  check('hooks/ is packaged', pkg.files.includes('hooks/'))
} catch (error) {
  failed++
  process.stdout.write(`  FAIL  guard suite aborted: ${error.message}\n`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
