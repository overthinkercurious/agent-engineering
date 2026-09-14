#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatIssues, validateSchemaFile, validateValue } from '../skills/ae-forge/scripts/validate.mjs'
import { NORMAL_TRANSITIONS, STATES } from '../skills/ae-forge/scripts/lifecycle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FORGE = join(ROOT, 'skills', 'ae-forge')
let failures = 0

function pass(message) { process.stdout.write(`  ok   ${message}\n`) }
function fail(message) { failures++; process.stdout.write(`  FAIL ${message}\n`) }
function check(condition, message) { condition ? pass(message) : fail(message) }
function load(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { fail(`${path} is invalid JSON: ${error.message}`); return null }
}

function structuredOutputIssues(schema, path = '#') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return []
  const issues = []
  if (schema.type === 'object') {
    const properties = Object.keys(schema.properties || {}).sort()
    const required = [...(schema.required || [])].sort()
    if (schema.additionalProperties !== false) issues.push(`${path} must set additionalProperties false`)
    if (JSON.stringify(properties) !== JSON.stringify(required)) issues.push(`${path} must require every property`)
  }
  for (const keyword of ['const', 'uniqueItems', 'minLength', 'maxLength', 'allOf', 'not', 'dependentRequired', 'dependentSchemas', 'if', 'then', 'else']) {
    if (Object.hasOwn(schema, keyword)) issues.push(`${path} uses unsupported keyword ${keyword}`)
  }
  if (schema.enum && !schema.type) issues.push(`${path} enum must declare an explicit type`)
  for (const [name, child] of Object.entries(schema.properties || {})) issues.push(...structuredOutputIssues(child, `${path}/properties/${name}`))
  if (schema.items) issues.push(...structuredOutputIssues(schema.items, `${path}/items`))
  for (const [index, child] of (schema.anyOf || []).entries()) issues.push(...structuredOutputIssues(child, `${path}/anyOf/${index}`))
  for (const [name, child] of Object.entries(schema.$defs || {})) issues.push(...structuredOutputIssues(child, `${path}/$defs/${name}`))
  return issues
}

process.stdout.write('\nvalidating ae-forge\n')

const registry = load(join(FORGE, 'references', 'registry.json'))
if (registry) {
  const registryIssues = validateValue('registry', registry)
  check(registryIssues.length === 0, `registry satisfies shipped runtime contract${registryIssues.length ? `: ${formatIssues(registryIssues)}` : ''}`)
  const specialists = Object.entries(registry.specialists || {})
  const lenses = Object.entries(registry.lenses || {})
  check(specialists.length === 12, 'registry has 12 non-overlapping specialists')
  check(lenses.length === 12, 'registry has 12 focused lenses')

  const owners = specialists.map(([, value]) => value.owns)
  check(owners.every(Boolean) && new Set(owners).size === owners.length, 'specialist ownership is present and unique')

  for (const [id, item] of specialists) {
    const workflowPath = join(FORGE, 'references', item.file || '')
    check(existsSync(workflowPath), `specialist ${id} has a workflow file`)
    check(Array.isArray(item.triggers) && item.triggers.length > 0, `specialist ${id} has routing triggers`)
    if (existsSync(workflowPath)) check(readFileSync(workflowPath, 'utf8').toLowerCase().includes(item.owns.toLowerCase()), `specialist ${id} workflow matches registry ownership`)
  }
  for (const [id, item] of lenses) {
    const workflowPath = join(FORGE, 'references', item.file || '')
    check(existsSync(workflowPath), `lens ${id} has a workflow file`)
    check(Boolean(registry.specialists?.[item.escalates_to]), `lens ${id} escalates to a registered specialist`)
    if (existsSync(workflowPath)) {
      const workflow = readFileSync(workflowPath, 'utf8').toLowerCase().replaceAll('-', ' ')
      check(item.covers.every((coverage) => workflow.includes(coverage.toLowerCase().replaceAll('-', ' '))), `lens ${id} workflow matches registry coverage`)
      check(workflow.includes(item.escalates_to.toLowerCase()), `lens ${id} workflow names its escalation target`)
    }
  }
  for (const id of [...(registry.always?.plan || []), ...(registry.always?.final || [])]) {
    check(Boolean(registry.specialists?.[id]), `always-on specialist ${id} is registered`)
  }
}

for (const name of ['intake', 'discover', 'define', 'plan', 'approve', 'build', 'audit', 'finish']) {
  check(existsSync(join(FORGE, 'references', 'stages', `${name}.md`)), `stage ${name} exists`)
}
const schemaDir = join(FORGE, 'references', 'schemas')
for (const entry of readdirSync(schemaDir, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith('.schema.json'))) {
  const path = join(schemaDir, entry.name)
  const schema = load(path)
  const issues = validateSchemaFile(path)
  if (schema) check(schema.$schema?.includes('2020-12') && (schema.type === 'object' || schema.oneOf), `schema ${entry.name} declares an object contract`)
  check(issues.length === 0, `schema ${entry.name} uses AE Schema Subset 1${issues.length ? `: ${formatIssues(issues)}` : ''}`)
}
const codexOutputSchema = load(join(schemaDir, 'codex-specialist-output.schema.json'))
if (codexOutputSchema) {
  const issues = structuredOutputIssues(codexOutputSchema)
  check(issues.length === 0, `Codex response schema uses the stricter Structured Outputs subset${issues.length ? `: ${issues.join('; ')}` : ''}`)
}

const budgets = load(join(FORGE, 'references', 'budgets.json'))
if (budgets) check(validateValue('budget-config', budgets).length === 0, 'budget defaults satisfy the shipped runtime contract')

const runStateSchema = load(join(schemaDir, 'run-state.schema.json'))
if (runStateSchema) {
  const schemaStates = runStateSchema.properties?.status?.enum || []
  check(JSON.stringify([...schemaStates].sort()) === JSON.stringify([...STATES].sort()), 'run-state schema and lifecycle export the same states')
  check(STATES.every((state) => Object.hasOwn(NORMAL_TRANSITIONS, state)), 'transition matrix enumerates every state')
  check(Object.values(NORMAL_TRANSITIONS).flat().every((state) => STATES.includes(state)), 'transition matrix contains only declared states')
  check(JSON.stringify(NORMAL_TRANSITIONS.repair) === JSON.stringify(['implementation']), 'repair must return through implementation')
}

const requiredSpecialistHeadings = ['## Contract metadata', '## Activation and refusal', '## Inputs', '## Missing inputs', '## Authority and boundaries', '## Procedure', '## Evidence and failure modes', '## Result envelope', '## Quality rubric and stop conditions', '## Examples', '### Valid worked example', '### Misleading example', '### Missing-input example']
const requiredLensHeadings = ['## Contract metadata', '## Activation and non-triggers', '## Inputs and missing inputs', '## Questions and procedure', '## Evidence and finding taxonomy', '## Non-decisions and escalation', '## Stop conditions', '## Examples', '### Valid worked example', '### Misleading example', '### Missing-input example']
for (const [kind, headings] of [['specialist', requiredSpecialistHeadings], ['lens', requiredLensHeadings]]) {
  const path = join(FORGE, 'references', 'templates', `${kind}.md`)
  const template = existsSync(path) ? readFileSync(path, 'utf8') : ''
  check(headings.every((heading) => template.includes(heading)), `${kind} template contains every Phase 0a contract section`)
}
for (const [label, path, headings] of [
  ['probe specialist', join(FORGE, 'references', 'specialists', 'probe.md'), requiredSpecialistHeadings],
  ['exact lens', join(FORGE, 'references', 'lenses', 'exact.md'), requiredLensHeadings],
]) {
  const workflow = existsSync(path) ? readFileSync(path, 'utf8') : ''
  check(headings.every((heading) => workflow.includes(heading)), `${label} is authored against its Phase 1 template`)
}

const decisionRecord = join(ROOT, 'docs', 'decisions', 'implementation-contract.md')
if (existsSync(decisionRecord)) {
  const decisions = readFileSync(decisionRecord, 'utf8')
  check(Array.from({ length: 12 }, (_, index) => `## P0A-${String(index + 1).padStart(2, '0')}`).every((id) => decisions.includes(id)), 'Phase 0a decision record contains all twelve frozen decisions')
} else fail('Phase 0a decision record is missing')

const skillDirs = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'skills', entry.name, 'SKILL.md')))
  .map((entry) => entry.name).sort()
check(JSON.stringify(skillDirs) === JSON.stringify(['ae-forge', 'ae-init']), 'only ae-init and ae-forge are public routing surfaces')

const pkg = load(join(ROOT, 'package.json'))
const codex = load(join(ROOT, '.codex-plugin', 'plugin.json'))
const claude = load(join(ROOT, '.claude-plugin', 'plugin.json'))
const market = load(join(ROOT, '.claude-plugin', 'marketplace.json'))
const version = readFileSync(join(ROOT, 'kit-version.txt'), 'utf8').trim()
if (pkg && codex && claude && market) {
  check([pkg.version, codex.version, claude.version, market.metadata?.version, version].every((v) => v === version), 'package and plugin versions agree')
  check(codex.skills === './skills/' && claude.skills === './skills/', 'native plugin manifests expose the skills directory')
  check(market.plugins?.some((plugin) => plugin.name === 'agent-engineering' && plugin.source === './'), 'Claude marketplace exposes the local plugin')
}

if (failures) {
  process.stdout.write(`\n${failures} validation failure(s)\n`)
  process.exit(1)
}
process.stdout.write('\nae-forge contract valid\n')
