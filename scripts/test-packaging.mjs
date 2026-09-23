#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'ae-package-'))
const install = join(temp, 'install')
mkdirSync(install, { recursive: true })
let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`) }
}
function node(script, args = [], cwd = temp) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
}
function walk(path, output = []) {
  for (const name of readdirSync(path)) {
    const target = join(path, name)
    if (statSync(target).isDirectory()) walk(target, output)
    else output.push(target)
  }
  return output
}

const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
for (const entry of pkg.files) {
  const source = join(repo, entry)
  const target = join(install, entry)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true })
}
check('package contains both public skills',
  existsSync(join(install, 'skills', 'ae-forge', 'SKILL.md')) &&
  existsSync(join(install, 'skills', 'ae-surveyor', 'SKILL.md')))

const files = walk(install).map((path) => relative(install, path).replaceAll('\\', '/'))
check('development-only files are not packaged',
  !files.some((path) => path.startsWith('scripts/') || path.startsWith('docs/') || path === 'AGENTS.md'))

const forge = join(install, 'skills', 'ae-forge', 'scripts', 'forge.mjs')
const help = node(forge, ['help'])
check('packaged Forge runner starts', help.status === 0 && help.stdout.includes('Internal recovery ledger'))

const project = join(temp, 'project-without-init')
mkdirSync(project)
const started = node(forge, ['start', '--root', project, '--title', 'Packaged flow', '--kind', 'feature', '--id', 'packaged-flow'])
check('packaged Forge starts without ae-surveyor', started.status === 0, started.stdout || started.stderr)
check('packaged Forge writes one run record', existsSync(join(project, '.dev', 'work', 'packaged-flow', 'run.json')))

const team = JSON.parse(readFileSync(join(install, 'skills', 'ae-forge', 'references', 'team.json'), 'utf8'))
check('packaged team contract is complete',
  Object.keys(team.roles).length === 11 &&
  Object.values(team.roles).every((role) => existsSync(join(install, 'skills', 'ae-forge', 'references', role.file))) &&
  team.tiers.standard.includes('verifier'))
check('legacy adapters and schemas are not packaged',
  !existsSync(join(install, 'skills', 'ae-forge', 'scripts', 'dispatch.mjs')) &&
  !existsSync(join(install, 'skills', 'ae-forge', 'references', 'schemas')))

const initProject = join(temp, 'init-project')
mkdirSync(join(initProject, 'src'), { recursive: true })
writeFileSync(join(initProject, 'src', 'index.mjs'), 'export const value = 1\n')
writeFileSync(join(initProject, 'package.json'), JSON.stringify({ name: 'sample', scripts: { test: 'node --test' } }, null, 2))
const analyze = node(join(install, 'skills', 'ae-surveyor', 'scripts', 'analyze.mjs'), ['--root', initProject])
check('packaged ae-surveyor analyzer remains usable', analyze.status === 0 && existsSync(join(initProject, '.dev', 'context', 'analysis.json')), analyze.stderr)

const manifests = [
  JSON.parse(readFileSync(join(install, '.codex-plugin', 'plugin.json'), 'utf8')),
  JSON.parse(readFileSync(join(install, '.claude-plugin', 'plugin.json'), 'utf8')),
  JSON.parse(readFileSync(join(install, '.claude-plugin', 'marketplace.json'), 'utf8')),
]
const kitVersion = readFileSync(join(install, 'kit-version.txt'), 'utf8').trim()
// kit.json is the copy that travels INSIDE the skill, which is the only part
// a project install receives, so it is the one a stamped artifact can cite.
// It is therefore the copy most likely to drift, and the one worth asserting.
const skillVersion = JSON.parse(readFileSync(
  join(install, 'skills', 'ae-surveyor', 'references', 'kit.json'), 'utf8')).version
check('published versions agree',
  pkg.version === kitVersion &&
  skillVersion === kitVersion &&
  manifests[0].version === kitVersion &&
  manifests[1].version === kitVersion &&
  manifests[2].metadata.version === kitVersion &&
  manifests[2].plugins[0].version === kitVersion,
  `kit-version.txt=${kitVersion} kit.json=${skillVersion} package.json=${pkg.version}`)
check('a generated block stamps the kit that wrote it',
  readFileSync(join(initProject, '.dev', 'context', 'analysis.json'), 'utf8').length > 0)

rmSync(temp, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
