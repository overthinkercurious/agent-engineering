#!/usr/bin/env node
/**
 * test-packaging.mjs - clean-install and package-content tests (Phase 10).
 *
 * Copies only what package.json's `files` array publishes into a temporary
 * directory, then proves the shipped runtime works there: the runner runs, the
 * validator resolves its schemas, ae-init's deterministic scripts survive the
 * copy, nothing under skills/ reaches outside its own installed directory, and
 * the packaging manifests name only paths that were actually shipped.
 *
 * Development-only paths (scripts/, docs/, node_modules/, .git/) are never
 * copied, so anything that silently depends on this checkout fails here.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SELF = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(SELF, '..')

let passed = 0
let failed = 0
let skipped = 0
function check(name, condition, detail = '') {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}\n`) }
}
function skip(name, why) { skipped++; process.stdout.write(`  SKIP  ${name} (${why})\n`) }

process.stdout.write('\nPhase 10 packaging and clean install\n\n')

// ------------------------------------------------------- clean install ------

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const declared = (pkg.files || []).map((entry) => entry.replace(/\/+$/, ''))
const TEMP = mkdtempSync(join(tmpdir(), 'ae-packaging-'))
const CLEAN = join(TEMP, 'install')
mkdirSync(CLEAN, { recursive: true })

const copied = []
for (const entry of declared) {
  const source = join(REPO, entry)
  if (!existsSync(source)) { check(`declared package entry exists: ${entry}`, false, `${source} is missing`); continue }
  const target = join(CLEAN, entry)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true })
  copied.push(entry)
}
check('every path in package.json files was copied', copied.length === declared.length, `copied ${copied.length} of ${declared.length}`)

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}
const cleanFiles = walk(CLEAN)
const cleanRelative = cleanFiles.map((path) => relative(CLEAN, path).split(sep).join('/'))

const forbidden = ['scripts/', 'docs/', 'node_modules/', '.git/', 'AGENTS.md', 'package.json', '.gitignore', '.gitattributes']
const leaked = cleanRelative.filter((path) => forbidden.some((bad) => (bad.endsWith('/') ? path.startsWith(bad) : path === bad)))
check('no development-only path reached the clean install', leaked.length === 0, leaked.join(', '))
check('the clean install contains both skills', existsSync(join(CLEAN, 'skills', 'ae-init', 'SKILL.md')) && existsSync(join(CLEAN, 'skills', 'ae-forge', 'SKILL.md')))

const CLEAN_FORGE = join(CLEAN, 'skills', 'ae-forge')
const CLEAN_INIT = join(CLEAN, 'skills', 'ae-init')

// --------------------------------------------------------- shipped runner ---

function node(args, options = {}) {
  return spawnSync(process.execPath, args, { encoding: 'utf8', cwd: options.cwd || TEMP, env: { ...process.env, ...options.env } })
}

const help = node([join(CLEAN_FORGE, 'scripts', 'forge.mjs'), '--help'])
check('the shipped runner starts from the clean install', help.status === 0, `exit ${help.status}: ${(help.stderr || '').trim().slice(0, 300)}`)
check('the shipped runner prints its usage', /ae-forge runner/.test(help.stdout) && /dispatch --id/.test(help.stdout), (help.stdout || '').slice(0, 200))

const unknown = node([join(CLEAN_FORGE, 'scripts', 'forge.mjs'), 'not-a-command'])
check('the shipped runner rejects an unknown command with structured output', unknown.status === 2 && /"error": "unknown command"/.test(unknown.stdout), (unknown.stdout || unknown.stderr || '').slice(0, 200))

// ------------------------------------------------- schemas and validation ---

const validateUrl = pathToFileURL(join(CLEAN_FORGE, 'scripts', 'validate.mjs')).href
const lifecycleUrl = pathToFileURL(join(CLEAN_FORGE, 'scripts', 'lifecycle.mjs')).href
let validate = null
let lifecycle = null
try { validate = await import(validateUrl) } catch (error) { check('validate.mjs imports from the clean install', false, error.message) }
try { lifecycle = await import(lifecycleUrl) } catch (error) { check('lifecycle.mjs imports from the clean install', false, error.message) }

if (validate) {
  check('validate.mjs imports from the clean install', true)
  const insideClean = resolve(validate.SCHEMA_DIR).startsWith(resolve(CLEAN) + sep)
  check('the validator resolves its schema directory inside the clean install', insideClean, validate.SCHEMA_DIR)

  const schemaFiles = readdirSync(validate.SCHEMA_DIR).filter((name) => name.endsWith('.schema.json')).sort()
  check('the clean install ships the schema directory', schemaFiles.length > 0, `${schemaFiles.length} schemas`)

  const schemaIssues = []
  for (const name of schemaFiles) {
    const issues = validate.validateSchemaFile(join(validate.SCHEMA_DIR, name))
    for (const issue of issues) schemaIssues.push(`${name}${issue.path}: ${issue.message}`)
  }
  check('every shipped schema resolves its $refs inside the clean install', schemaIssues.length === 0, schemaIssues.slice(0, 5).join('; '))

  // Every local file $ref must name a file that was actually packaged.
  const refViolations = []
  for (const name of schemaFiles) {
    const path = join(validate.SCHEMA_DIR, name)
    const text = readFileSync(path, 'utf8')
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      for (const match of line.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)) {
        const ref = match[1]
        if (ref.startsWith('#')) continue
        if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) { refViolations.push(`${name}:${index + 1}: remote $ref ${ref}`); continue }
        const file = ref.split('#')[0]
        const target = resolve(dirname(path), file)
        const rel = relative(validate.SCHEMA_DIR, target)
        if (rel.startsWith('..') || isAbsolute(rel)) refViolations.push(`${name}:${index + 1}: $ref escapes the schema directory: ${ref}`)
        else if (!existsSync(target)) refViolations.push(`${name}:${index + 1}: $ref target is not packaged: ${ref}`)
      }
    }
  }
  check('every local schema $ref points at a packaged file', refViolations.length === 0, refViolations.slice(0, 5).join('; '))

  const usage = {
    schema: 1, calls: 2,
    input_tokens: { value: 120, provenance: 'measured' },
    output_tokens: { value: 40, provenance: 'measured' },
    reasoning_tokens: { value: null, provenance: 'unavailable' },
    cached_tokens: { value: null, provenance: 'unavailable' },
    charge_usd: { value: 0.01, provenance: 'estimated' },
    wall_time_ms: 1500,
  }
  let accepted = false
  try { validate.assertValid('usage', usage); accepted = true } catch (error) { accepted = error.message }
  check('the shipped validator accepts a valid value from the clean install', accepted === true, String(accepted))

  let rejected = false
  try { validate.assertValid('usage', { ...usage, reasoning_tokens: { value: 5, provenance: 'unavailable' } }) }
  catch { rejected = true }
  check('the shipped validator still rejects an invalid value', rejected)

  const registryPath = join(CLEAN_FORGE, 'references', 'registry.json')
  let registry = null
  let registryValid = false
  try { registry = validate.assertValid('registry', JSON.parse(readFileSync(registryPath, 'utf8'))); registryValid = true }
  catch (error) { registryValid = error.message }
  check('the shipped registry validates against its packaged schema', registryValid === true, String(registryValid))

  if (registry) {
    const missing = []
    for (const group of ['specialists', 'lenses']) {
      for (const [id, entry] of Object.entries(registry[group] || {})) {
        if (!entry.file) continue
        const target = resolve(CLEAN_FORGE, 'references', entry.file)
        const rel = relative(CLEAN_FORGE, target)
        if (rel.startsWith('..') || isAbsolute(rel)) missing.push(`${group}.${id} escapes the skill: ${entry.file}`)
        else if (!existsSync(target)) missing.push(`${group}.${id} is not packaged: ${entry.file}`)
      }
    }
    check('every registry workflow file is packaged inside the skill', missing.length === 0, missing.join('; '))
  }
}

if (lifecycle) {
  check('lifecycle.mjs imports from the clean install', true)
  let runState = null
  let created = false
  try { runState = lifecycle.createRunState('packaging-test', '2026-09-15T00:00:00Z'); created = true }
  catch (error) { created = `${error.message}: ${(error.issues || []).map((issue) => `${issue.path} ${issue.message}`).join('; ')}` }
  check('a real run state validates across packaged budget and usage schemas', created === true && runState?.status === 'created', String(created))
}

const payloadPath = join(TEMP, 'usage.json')
writeFileSync(payloadPath, JSON.stringify({
  schema: 1, calls: 0,
  input_tokens: { value: null, provenance: 'unavailable' },
  output_tokens: { value: null, provenance: 'unavailable' },
  reasoning_tokens: { value: null, provenance: 'unavailable' },
  cached_tokens: { value: null, provenance: 'unavailable' },
  charge_usd: { value: null, provenance: 'unavailable' },
  wall_time_ms: 0,
}, null, 2))
const cli = node([join(CLEAN_FORGE, 'scripts', 'validate.mjs'), '--schema', 'usage', '--file', payloadPath])
check('the shipped validator CLI runs from the clean install', cli.status === 0 && /"ok": true/.test(cli.stdout), `exit ${cli.status}: ${(cli.stdout || cli.stderr || '').slice(0, 200)}`)

// --------------------------------------------------- ae-init on a project ---

const PROJECT = join(TEMP, 'sample-project')
mkdirSync(join(PROJECT, 'src'), { recursive: true })
writeFileSync(join(PROJECT, 'src', 'index.mjs'), 'export const add = (a, b) => a + b\n')
writeFileSync(join(PROJECT, 'src', 'index.test.mjs'), "import { add } from './index.mjs'\nif (add(1, 2) !== 3) throw new Error('bad')\n")
writeFileSync(join(PROJECT, 'package.json'), `${JSON.stringify({ name: 'sample-project', version: '1.0.0', scripts: { test: 'node src/index.test.mjs' } }, null, 2)}\n`)
writeFileSync(join(PROJECT, 'README.md'), '# sample project\n')

let gitReady = true
try {
  const git = (args) => execFileSync('git', ['-C', PROJECT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init', '--quiet'])
  git(['config', 'user.email', 'packaging-test@example.invalid'])
  git(['config', 'user.name', 'Packaging Test'])
  git(['add', '-A'])
  git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'sample project'])
} catch (error) { gitReady = false; check('a throwaway Git project is available for ae-init', false, error.message) }
if (gitReady) check('a throwaway Git project is available for ae-init', true)

function bashAvailable() {
  const probe = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' })
  return probe.status === 0
}
const hasBash = bashAvailable()

if (hasBash) {
  const scaffold = spawnSync('bash', [join(CLEAN_INIT, 'scripts', 'scaffold.sh'), '--root', PROJECT, '--dry-run'], { encoding: 'utf8', cwd: TEMP })
  check('ae-init scaffold.sh plans a run from the clean install', scaffold.status === 0, `exit ${scaffold.status}: ${(scaffold.stderr || '').trim().slice(0, 300)}`)
  const applied = spawnSync('bash', [join(CLEAN_INIT, 'scripts', 'scaffold.sh'), '--root', PROJECT], { encoding: 'utf8', cwd: TEMP })
  check('ae-init scaffold.sh applies from the clean install', applied.status === 0 && existsSync(join(PROJECT, '.dev', 'context')), `exit ${applied.status}: ${(applied.stderr || '').trim().slice(0, 300)}`)
} else {
  skip('ae-init scaffold.sh runs from the clean install', 'bash is unavailable')
  skip('ae-init scaffold.sh applies from the clean install', 'bash is unavailable')
}

const estimate = node([join(CLEAN_INIT, 'scripts', 'analyze.mjs'), '--root', PROJECT, '--estimate'])
check('ae-init analyze.mjs estimates from the clean install', estimate.status === 0, `exit ${estimate.status}: ${(estimate.stderr || '').trim().slice(0, 300)}`)

const analyze = node([join(CLEAN_INIT, 'scripts', 'analyze.mjs'), '--root', PROJECT])
check('ae-init analyze.mjs writes analysis.json from the clean install', analyze.status === 0 && existsSync(join(PROJECT, '.dev', 'context', 'analysis.json')), `exit ${analyze.status}: ${(analyze.stderr || '').trim().slice(0, 300)}`)

for (const [label, script, produced] of [
  ['knowledge.mjs', 'knowledge.mjs', join(PROJECT, '.dev', 'knowledge', '00-index.md')],
  ['rules.mjs', 'rules.mjs', join(PROJECT, '.dev', 'rules', '00-index.md')],
  ['policy.mjs', 'policy.mjs', join(PROJECT, '.dev', 'policy', 'authority.yml')],
]) {
  const run = node([join(CLEAN_INIT, 'scripts', script), '--root', PROJECT, '--quiet'])
  check(`ae-init ${label} runs from the clean install`, run.status === 0 && existsSync(produced), `exit ${run.status}: ${(run.stderr || '').trim().slice(0, 300)}`)
}

if (hasBash) {
  // doctor.sh takes the project root as its one positional argument.
  const doctor = spawnSync('bash', [join(CLEAN_INIT, 'scripts', 'doctor.sh'), PROJECT], { encoding: 'utf8', cwd: TEMP })
  check('ae-init doctor.sh verifies the initialized project from the clean install', doctor.status === 0, `exit ${doctor.status}: ${`${doctor.stdout || ''}${doctor.stderr || ''}`.trim().slice(-600)}`)
} else {
  skip('ae-init doctor.sh runs from the clean install', 'bash is unavailable')
}

// The shipped runner must also accept a project that only the shipped ae-init
// scripts prepared: proof that the two installed skills compose without the
// development checkout.
const listRuns = node([join(CLEAN_FORGE, 'scripts', 'forge.mjs'), 'list', '--root', PROJECT])
check('the shipped runner accepts a project initialized by the shipped ae-init', listRuns.status === 0 && listRuns.stdout.trim() === '[]', `exit ${listRuns.status}: ${(listRuns.stdout || listRuns.stderr || '').slice(0, 300)}`)

// ------------------------------------------------------- static escapes -----

const TEXT = new Set(['.md', '.mjs', '.js', '.json', '.sh', '.yml', '.yaml', '.fragment', '.txt'])
const BASE_VARS = { SELF: 'file', AE_SELF: 'file', __dirname: 'file', SKILL: 'skill', AE_KIT_ROOT: 'skill' }
const violations = []

function report(file, line, message) {
  violations.push(`${relative(CLEAN, file).split(sep).join('/')}:${line}: ${message}`)
}

for (const file of walk(join(CLEAN, 'skills'))) {
  const rel = relative(CLEAN, file).split(sep).join('/')
  const parts = rel.split('/')
  const skillRoot = join(CLEAN, parts[0], parts[1])
  const ext = /\.[^./]+$/.exec(rel)?.[0] || ''
  if (!TEXT.has(ext)) continue
  const text = readFileSync(file, 'utf8')
  const fileDir = dirname(file)
  const insideSkill = (target) => {
    const r = relative(skillRoot, resolve(target))
    return r === '' || (!r.startsWith('..') && !isAbsolute(r))
  }

  text.split(/\r?\n/).forEach((line, index) => {
    const number = index + 1

    // (a) absolute paths from an author's machine
    for (const match of line.matchAll(/['"`]([A-Za-z]:[\\/][^'"`\n]*)['"`]/g)) report(file, number, `hardcoded absolute path: ${match[1]}`)
    for (const match of line.matchAll(/['"`](\/(?:home|Users|mnt|root)\/[^'"`\n]*)['"`]/g)) report(file, number, `hardcoded absolute path: ${match[1]}`)

    // (b) relative literals that climb above the installed skill directory
    for (const match of line.matchAll(/['"`](\.\.?\/[^'"`\n)]*)['"`]/g)) {
      const literal = match[1]
      if (!literal.startsWith('../')) continue
      if (!insideSkill(resolve(fileDir, literal))) report(file, number, `relative path escapes the installed skill: ${literal}`)
    }

    // (b2) markdown links that climb above the installed skill directory
    if (ext === '.md') {
      for (const match of line.matchAll(/\]\(\s*([^)\s]+)\s*\)/g)) {
        const target = match[1]
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue
        if (!insideSkill(resolve(fileDir, target))) report(file, number, `markdown link escapes the installed skill: ${target}`)
      }
    }

    // (c) path joins that climb above the installed skill directory
    for (const match of line.matchAll(/\b(?:resolve|join)\s*\(\s*([A-Za-z_$][\w$]*)\s*,([^)]*)\)/g)) {
      const base = BASE_VARS[match[1]]
      if (!base) continue
      const segments = [...match[2].matchAll(/['"`]([^'"`]*)['"`]/g)].map((entry) => entry[1])
      const start = base === 'file' ? fileDir : skillRoot
      if (!insideSkill(resolve(start, ...segments.length ? segments : ['.']))) {
        report(file, number, `path join escapes the installed skill: ${match[0]}`)
      }
    }

    // (d) imports of anything that is not Node built-in or packaged beside the file
    if (ext === '.mjs' || ext === '.js') {
      const specs = [
        ...[...line.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((entry) => entry[1]),
        ...[...line.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((entry) => entry[1]),
        ...[...line.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((entry) => entry[1]),
      ]
      for (const spec of specs) {
        if (spec.startsWith('node:')) continue
        if (!spec.startsWith('.')) { report(file, number, `import of an unpackaged dependency: ${spec}`); continue }
        const target = resolve(fileDir, spec)
        if (!insideSkill(target)) report(file, number, `import escapes the installed skill: ${spec}`)
        else if (!existsSync(target)) report(file, number, `import target is not packaged: ${spec}`)
      }
    }

    // (e) documented or sourced kit paths ($AE/..., $AE_SELF/..., $AE_KIT_ROOT/...)
    for (const match of line.matchAll(/\$(?:\{)?(AE|AE_SELF|AE_KIT_ROOT)\}?\/([A-Za-z0-9_./-]+)/g)) {
      const base = match[1] === 'AE_SELF' ? join(skillRoot, 'scripts') : skillRoot
      const target = resolve(base, match[2])
      if (!insideSkill(target)) report(file, number, `kit path escapes the installed skill: ${match[0]}`)
      else if (!existsSync(target)) report(file, number, `kit path is not packaged: ${match[0]}`)
    }

    // (f) references to development-only repository directories
    for (const match of line.matchAll(/['"`(\s](?:\.\/)?(docs\/[A-Za-z0-9_./-]+|scripts\/fixtures\/[A-Za-z0-9_./-]+)/g)) {
      report(file, number, `reference to a development-only repository path: ${match[1]}`)
    }
  })
}

check('no shipped skill file reaches outside its installed skill directory', violations.length === 0, violations.join('\n          '))

// ------------------------------------------------------------ manifests -----

const manifests = ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.codex-plugin/plugin.json']
for (const name of manifests) {
  const path = join(CLEAN, name)
  if (!existsSync(path)) { check(`${name} is packaged`, false, `${path} is missing`); continue }
  check(`${name} is packaged`, true)
  let manifest = null
  try { manifest = JSON.parse(readFileSync(path, 'utf8')) } catch (error) { check(`${name} is valid JSON`, false, error.message); continue }

  // Plugin manifests address the plugin root, which is the package root.
  const bad = []
  const visit = (value, pointer) => {
    if (typeof value === 'string') {
      if (!value.startsWith('./')) return
      const target = resolve(CLEAN, value)
      const rel = relative(CLEAN, target)
      if (rel.startsWith('..') || isAbsolute(rel)) bad.push(`${pointer}: ${value} escapes the package`)
      else if (!existsSync(target)) bad.push(`${pointer}: ${value} is not packaged`)
      return
    }
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${pointer}/${index}`)); return }
    if (value && typeof value === 'object') { for (const [key, item] of Object.entries(value)) visit(item, `${pointer}/${key}`) }
  }
  visit(manifest, '#')
  check(`${name} references only packaged paths`, bad.length === 0, bad.join('; '))
}

const kitVersion = readFileSync(join(CLEAN, 'kit-version.txt'), 'utf8').trim()
const claudePlugin = JSON.parse(readFileSync(join(CLEAN, '.claude-plugin', 'plugin.json'), 'utf8'))
const marketplace = JSON.parse(readFileSync(join(CLEAN, '.claude-plugin', 'marketplace.json'), 'utf8'))
const codexPlugin = JSON.parse(readFileSync(join(CLEAN, '.codex-plugin', 'plugin.json'), 'utf8'))
const versions = {
  'package.json': pkg.version,
  'kit-version.txt': kitVersion,
  '.claude-plugin/plugin.json': claudePlugin.version,
  '.claude-plugin/marketplace.json metadata': marketplace.metadata?.version,
  '.claude-plugin/marketplace.json plugin': marketplace.plugins?.[0]?.version,
  '.codex-plugin/plugin.json': codexPlugin.version,
}
const disagreeing = Object.entries(versions).filter(([, value]) => value !== pkg.version)
check('the packaged surfaces agree on one version', disagreeing.length === 0, disagreeing.map(([key, value]) => `${key}=${value}`).join(', '))

const skillDirs = readdirSync(join(CLEAN, 'skills')).filter((name) => statSync(join(CLEAN, 'skills', name)).isDirectory())
check('the plugin skills directory holds the shipped skills', claudePlugin.skills === './skills/' && codexPlugin.skills === './skills/' && skillDirs.length === 2, `${claudePlugin.skills} / ${codexPlugin.skills} / ${skillDirs.join(',')}`)
const frontmatterNames = skillDirs.map((name) => (/^name:\s*(\S+)/m.exec(readFileSync(join(CLEAN, 'skills', name, 'SKILL.md'), 'utf8')) || [])[1])
check('each shipped SKILL.md declares the name of its directory', frontmatterNames.every((name, index) => name === skillDirs[index]), `${frontmatterNames.join(',')} vs ${skillDirs.join(',')}`)

// ----------------------------------------------------------------- done -----

try { rmSync(TEMP, { recursive: true, force: true, maxRetries: 5 }) } catch { /* the OS reclaims the temp directory */ }

process.stdout.write(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`)
if (failed) process.exitCode = 1
