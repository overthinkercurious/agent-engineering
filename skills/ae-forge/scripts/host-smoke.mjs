#!/usr/bin/env node
// Read-only installed-distribution checks. Host loading is reported separately.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const index = args.indexOf('--root')
const project = resolve(index >= 0 ? args[index + 1] : process.cwd())
const scriptDir = dirname(fileURLToPath(import.meta.url))
const skills = resolve(scriptDir, '../..')
const errors = []
for (const name of ['ae-forge', 'ae-plan', 'ae-plan-review', 'ae-build', 'ae-verify', 'ae-investigate', 'ae-audit']) {
  if (!existsSync(join(skills, name, 'SKILL.md'))) errors.push(`missing stage: ${name}`)
}
const run = (name, extra = []) => {
  const result = spawnSync(process.execPath, [join(scriptDir, name), ...extra], { cwd: project, encoding: 'utf8' })
  if (result.error || result.status !== 0) { errors.push(`${name}: ${result.stderr || result.stdout || result.error?.message}`); return null }
  try { return JSON.parse(result.stdout) } catch { errors.push(`${name}: invalid output`); return null }
}
try {
  const contract = run('forge.mjs', ['contract', '--root', project])
  const validation = run('validate-kit.mjs')
  const lenses = run('lens-select.mjs', ['--team', 'plan-reviewer,verifier', '--domain', 'react', '--root', project])
  const marker = join(project, '.dev/context/enforce.json')
  const sessionIndex = args.indexOf('--session')
  const sessions = [process.env.CODEX_SESSION_ID, process.env.CLAUDE_CODE_SESSION_ID, sessionIndex >= 0 ? args[sessionIndex + 1] : null].filter(Boolean)
  const record = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : null
  const hookObserved = Boolean(record?.enforce === 'native' && sessions.includes(record.session_id))
  process.stdout.write(`${JSON.stringify({
    ok: errors.length === 0, skill_directory: realpathSync(resolve(scriptDir, '..')),
    contract: contract?.contract, structure: validation?.ok ?? false, lens_selector: Boolean(lenses),
    host_loading: 'unverified: invoke ae-forge in the target host and inspect the run artifact',
    hook_session_marker: hookObserved ? 'current session marker observed; configured tools only' : 'unverified: no matching session marker',
    workspace_hook_configured: existsSync(join(project, '.agents/hooks.json'))
      ? Boolean(JSON.parse(readFileSync(join(project, '.agents/hooks.json'), 'utf8'))['agent-engineering']?.enabled !== false
        && JSON.parse(readFileSync(join(project, '.agents/hooks.json'), 'utf8'))['agent-engineering']?.PreToolUse?.length)
      : false,
    agent_dispatch: 'unverified: record actual role context; capability metadata alone is insufficient',
    errors,
  }, null, 2)}\n`)
  process.exitCode = errors.length ? 1 : 0
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2 }
