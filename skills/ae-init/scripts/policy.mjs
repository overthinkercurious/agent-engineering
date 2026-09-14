#!/usr/bin/env node
// policy.mjs - derive project policy while preserving project-owned decisions.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback) => { const index = argv.indexOf(name); return index === -1 ? fallback : argv[index + 1] }
const has = (name) => argv.includes(name)
const ROOT = resolve(arg('--root', process.cwd()))
const IN = resolve(arg('--in', join(ROOT, '.dev', 'context', 'analysis.json')))
const OUT = resolve(arg('--out', join(ROOT, '.dev', 'policy')))
const QUIET = has('--quiet')
const CONFIRM = has('--confirm-conservative')
const START = '# agent-engineering:start'
const END = '# agent-engineering:end'

function die(message, code = 1) { process.stderr.write(`${message}\n`); process.exit(code) }
function assertInside(path, label) {
  const rel = relative(ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) die(`${label} escapes the project root: ${path}`, 2)
}
assertInside(IN, '--in'); assertInside(OUT, '--out')

if (!existsSync(IN)) die(`no analysis at ${IN}\nRun analyze.mjs before policy.mjs.`, 2)
let analysisText; let a
try { analysisText = readFileSync(IN, 'utf8'); a = JSON.parse(analysisText) }
catch (error) { die(`analysis.json is not valid JSON: ${error.message}`, 2) }

const inputDigest = createHash('sha256').update(analysisText).digest('hex')
const quote = (value) => JSON.stringify(String(value ?? ''))
const unresolved = (value) => /TODO\s*\(judgment\)|\bUNKNOWN\b/i.test(String(value || ''))

function markerCount(text, marker) { return text.split(marker).length - 1 }
function existingText(file) { return existsSync(file) ? readFileSync(file, 'utf8') : '' }

function extractSection(text, name) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); const start = lines.findIndex((line) => line === `${name}:`)
  if (start === -1) return ''
  let end = start + 1
  while (end < lines.length && (lines[end].startsWith('  ') || !lines[end].trim())) end++
  return lines.slice(start, end).join('\n').trimEnd()
}

function parseJudgment(section) {
  const values = {}
  for (const line of section.split('\n').slice(1)) {
    const match = /^  ([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2]
    try { value = JSON.parse(value) } catch { /* AE YAML plain string */ }
    values[match[1]] = String(value)
  }
  return values
}

function decisions(file, defaults, runtime) {
  const current = existingText(file)
  const old = parseJudgment(extractSection(current, 'judgment'))
  const oldProvenance = parseJudgment(extractSection(current, 'judgment_provenance'))
  const values = {}; const provenance = {}
  for (const [key, fallback] of Object.entries(defaults)) {
    if (old[key] && !unresolved(old[key])) {
      values[key] = old[key]
      provenance[key] = oldProvenance[key] === 'user_confirmed_conservative_default' ? oldProvenance[key] : 'preserved_user_decision'
    }
    else if (CONFIRM) { values[key] = fallback; provenance[key] = 'user_confirmed_conservative_default' }
    else { values[key] = 'TODO (judgment)'; provenance[key] = 'unresolved' }
  }
  const priorRuntime = extractSection(current, 'runtime')
  const runtimeText = priorRuntime || runtime.trimEnd()
  const judgment = ['judgment:', ...Object.entries(values).map(([key, value]) => `  ${key}: ${quote(value)}`)].join('\n')
  const provenanceText = ['judgment_provenance:', ...Object.entries(provenance).map(([key, value]) => `  ${key}: ${value}`)].join('\n')
  return `${runtimeText}\n${judgment}\n${provenanceText}\n`
}

function atomicWrite(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = join(dirname(file), `.${process.pid}-${Date.now()}.tmp`)
  try { writeFileSync(temporary, text, 'utf8'); renameSync(temporary, file) }
  finally { if (existsSync(temporary)) { try { unlinkSync(temporary) } catch {} } }
}

function writeManaged(file, generated, decisionText) {
  const block = `${START}\n${generated.trimEnd()}\n${decisionText.trimEnd()}\n${END}`
  if (!existsSync(file)) { atomicWrite(file, `${block}\n\n# Notes below this line survive regeneration.\n`); return 'created' }
  const current = readFileSync(file, 'utf8'); const starts = markerCount(current, START); const ends = markerCount(current, END)
  if (starts > 1 || ends > 1 || starts !== ends) die(`${file} has conflicting managed markers. Fix it by hand before regeneration.`)
  if (starts === 0) { atomicWrite(file, `${block}\n\n${current}`); return 'updated' }
  const start = current.indexOf(START); const end = current.indexOf(END, start)
  const next = current.slice(0, start) + block + current.slice(end + END.length)
  if (next === current) return 'unchanged'
  atomicWrite(file, next); return 'updated'
}

const pm = (a.stack?.package_managers ?? [])[0] ?? 'npm'
const runner = pm === 'npm' ? 'npm run' : `${pm} run`
const patterns = [
  ['test', /^(test|tests|spec|jest|vitest|pytest)(:|$)/], ['typecheck', /^(typecheck|tsc|types|check-types)(:|$)/],
  ['lint', /^(lint|eslint|ruff|flake8|clippy)(:|$)/], ['build', /^(build|compile|bundle)(:|$)/],
]
const gates = []
for (const name of Object.keys(a.commands?.scripts ?? {})) { const kind = patterns.find(([, pattern]) => pattern.test(name))?.[0]; if (kind) gates.push({ kind, command: `${runner} ${name}` }) }
const riskCounts = {}
for (const file of a.risk_files ?? []) for (const tag of file.tags ?? []) riskCounts[tag] = (riskCounts[tag] ?? 0) + 1
const stamp = `schema: 1\ngenerated_at: ${quote(a.generated_at)}\nsource_revision: ${quote(a.git?.head ?? 'UNKNOWN')}\ninput_digest: ${quote(inputDigest)}`

const authorityGenerated = `${stamp}
agent_may:
  - choose_internal_implementation_details
  - add_or_improve_tests
  - add_supporting_documentation
  - refactor_directly_affected_code_when_justified
agent_must_escalate:
  - materially_change_approved_user_behavior
  - weaken_a_quality_or_security_gate
  - access_unapproved_credentials_or_services
  - add_unapproved_spending
  - alter_data_retention_or_privacy_behavior
  - perform_destructive_or_irreversible_work
  - deploy_to_production`
const authorityRuntime = `runtime:
  allowed_tools:
    - read
    - apply_patch
    - command
  allowed_write_roots:
    - .
  network: false
  max_budget_tier: small
  requires_user_approval_for:
    - public_contract_change
    - scope_change`

const gateRows = gates.length ? gates.map((gate) => `  - kind: ${quote(gate.kind)}\n    command: ${quote(gate.command)}`).join('\n') : '  []'
const qualityGenerated = `${stamp}
required_commands:
${gateRows}
required_evidence:
  - candidate_bound_command_receipts
  - independent_probe
evidence_rules:
  bind_to_candidate_revision: true
  model_pass_is_advisory: true
  heuristics_must_be_labeled: true`

const riskRows = Object.keys(riskCounts).length ? Object.entries(riskCounts).sort().map(([tag, count]) => `  ${tag}: ${count}`).join('\n') : '  none_detected: 0'
const routingGenerated = `${stamp}
observed_filename_risk_signals:
${riskRows}
defaults:
  plan_specialist: probe
  final_specialist: judge
  completed_diff_must_be_reclassified: true`
const routingRuntime = `runtime:
  execution_tier: standard
  budget_tier: small
  model_profile: smaller-model-only
  required_specialists:
    - probe
    - judge
  required_lenses:
    - exact`

const releaseGenerated = `${stamp}
target: pr_ready_branch
production_deployment_authorized: false
requires:
  - approval_digest_valid
  - acceptance_evidence
  - project_gates_pass
  - independent_release_audit
  - residual_risks_recorded`

const definitions = [
  ['authority.yml', authorityGenerated, { project_maturity: 'unclassified', change_tolerance: 'conservative', additional_authority: 'none' }, authorityRuntime],
  ['quality-gates.yml', qualityGenerated, { required_user_journeys: 'acceptance_paths_named_in_approved_intent', non_functional_budgets: 'no_additional_budget_without_explicit_project_evidence' }, ''],
  ['routing.yml', routingGenerated, { always_route: 'probe_and_judge', specialist_escalations: 'evidence_driven_registry_routing' }, routingRuntime],
  ['release.yml', releaseGenerated, { preview_command: 'unavailable_until_project_defines_one', rollback_or_recovery: 'revert_or_follow_project_recovery_runbook' }, ''],
]

const results = definitions.map(([name, generated, defaults, runtime]) => {
  const file = join(OUT, name); return [name, writeManaged(file, generated, decisions(file, defaults, runtime))]
})
if (!QUIET) {
  process.stdout.write('\nproject policy\n')
  for (const [name, status] of results) process.stdout.write(`  ${status.padEnd(10)} .dev/policy/${name}\n`)
  if (CONFIRM) process.stdout.write('\nConservative project decisions were explicitly confirmed; existing completed decisions were preserved.\n')
  else process.stdout.write(`\n${gates.length} executable gate(s) recorded. Review the visible TODO decisions, or explicitly run with --confirm-conservative.\n`)
  process.stdout.write(`Analysis input digest: ${inputDigest}\n\n`)
}
