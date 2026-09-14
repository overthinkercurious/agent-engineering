#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compilePolicy, parsePolicyYaml } from '../skills/ae-forge/scripts/policy.mjs'
import { assertValid, deduplicateFindings, findingId, validateSchemaFile, validateValue } from '../skills/ae-forge/scripts/validate.mjs'
import { NORMAL_TRANSITIONS, STATES, canTransition, createBudgetState, createRunState, migrateRunState } from '../skills/ae-forge/scripts/lifecycle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(ROOT, 'scripts', 'fixtures', 'forge')
const SCHEMAS = join(ROOT, 'skills', 'ae-forge', 'references', 'schemas')
const WORK = join(tmpdir(), `ae-contracts-${process.pid}`)
let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed++
    process.stdout.write(`  PASS  ${name}\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL  ${name}${detail ? `: ${detail}` : ''}\n`)
  }
}

function throws(name, fn, pattern) {
  try { fn(); check(name, false, 'did not throw') }
  catch (error) { check(name, pattern.test(error.message), error.message) }
}

function load(path) { return JSON.parse(readFileSync(path, 'utf8')) }

function policyRoot(variant) {
  const root = join(WORK, variant)
  const destination = join(root, '.dev', 'policy')
  mkdirSync(destination, { recursive: true })
  mkdirSync(join(root, '.dev', 'knowledge'), { recursive: true })
  mkdirSync(join(root, '.dev', 'rules'), { recursive: true })
  cpSync(join(FIXTURES, 'policy', variant), destination, { recursive: true })
  writeFileSync(join(root, '.dev', 'knowledge', '00-index.md'), '# Knowledge\n', 'utf8')
  writeFileSync(join(root, '.dev', 'rules', '00-index.md'), '# Rules\n', 'utf8')
  return root
}

function replace(path, before, after) {
  const current = readFileSync(path, 'utf8')
  if (!current.includes(before)) throw new Error(`fixture replacement did not match ${before}`)
  writeFileSync(path, current.replace(before, after), 'utf8')
}

try {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(WORK, { recursive: true })
  process.stdout.write('\nPhase 1 contract acceptance\n\n')

  const schemaFiles = readdirSync(SCHEMAS).filter((name) => name.endsWith('.schema.json'))
  check('all shipped schemas use AE Schema Subset 1', schemaFiles.every((name) => validateSchemaFile(join(SCHEMAS, name)).length === 0))

  const contractFixtures = join(FIXTURES, 'contracts')
  const validFinding = load(join(contractFixtures, 'finding.valid.json'))
  const invalidFinding = load(join(contractFixtures, 'finding.invalid.json'))
  const validResult = load(join(contractFixtures, 'specialist-result.valid.json'))
  const invalidResult = load(join(contractFixtures, 'specialist-result.invalid.json'))
  check('canonical finding validates', validateValue('finding', validFinding).length === 0)
  check('finding identity is deterministic', findingId(validFinding) === validFinding.id)
  check('malformed finding is rejected', validateValue('finding', invalidFinding).length >= 2)
  check('specialist envelope validates', validateValue('specialist-result', validResult).length === 0)
  check('hidden specialist request is rejected', validateValue('specialist-result', invalidResult).some((issue) => issue.message.includes('status needs_specialist')))

  const duplicate = { ...validFinding }
  check('exact duplicate findings deduplicate mechanically', deduplicateFindings([validFinding, duplicate]).length === 1)
  throws('conflicting findings with one id are rejected', () => deduplicateFindings([validFinding, { ...validFinding, severity: 'high' }]), /conflicting findings/)

  const unsupportedPath = join(contractFixtures, 'schema.unsupported.json')
  const escapePath = join(contractFixtures, 'schema.escape.json')
  check('unsupported schema keywords are rejected', validateSchemaFile(unsupportedPath, { schemaDir: contractFixtures }).some((issue) => issue.message.includes('unsupported schema keyword')))
  check('schema references cannot escape the schema directory', validateSchemaFile(escapePath, { schemaDir: contractFixtures }).some((issue) => issue.message.includes('escapes schema directory')))

  const prototypeRoot = policyRoot('prototype')
  const criticalRoot = policyRoot('critical')
  const prototype = compilePolicy(prototypeRoot)
  const critical = compilePolicy(criticalRoot, { budgetTier: 'medium', executionTier: 'deep' })
  check('prototype policies compile and are ready', prototype.ready && validateValue('effective-policy', prototype).length === 0)
  check('critical policy changes gates and tier', critical.ready && critical.defaults.budget_tier === 'medium' && critical.policies.quality.required_commands.length === 2)
  check('managed markers and user comment content are ignored', prototype.policies.authority.schema === 1 && !('agent-engineering:start' in prototype.policies.authority))

  for (const name of ['duplicate.yml', 'malformed.yml', 'unsupported.yml']) {
    const path = join(FIXTURES, 'policy', 'invalid', name)
    throws(`${name} fails strict YAML parsing`, () => parsePolicyYaml(readFileSync(path, 'utf8'), path), /duplicate key|indentation|indicator syntax/)
  }

  const incompleteRoot = policyRoot('prototype')
  replace(join(incompleteRoot, '.dev', 'policy', 'authority.yml'), 'additional_authority: none', 'additional_authority: "TODO (judgment)"')
  const incomplete = compilePolicy(incompleteRoot)
  check('incomplete material judgment stays visible and blocks readiness', !incomplete.ready && incomplete.unresolved_material.includes('authority.judgment.additional_authority'))

  const staleRoot = policyRoot('prototype')
  replace(join(staleRoot, '.dev', 'policy', 'release.yml'), '1111111111111111111111111111111111111111', '3333333333333333333333333333333333333333')
  throws('inconsistent source revisions are rejected', () => compilePolicy(staleRoot), /source revisions disagree/)

  const unknownRoot = policyRoot('prototype')
  const authorityPath = join(unknownRoot, '.dev', 'policy', 'authority.yml')
  replace(authorityPath, 'agent_may:', 'unknown_field: true\nagent_may:')
  throws('unknown policy fields are rejected', () => compilePolicy(unknownRoot), /additional property is not allowed/)

  const counters = createBudgetState('small').limits
  const contextPacket = {
    schema: 1,
    packet_id: 'packet-alpha-1',
    run_id: 'alpha-config',
    dispatch_id: 'core-build-1',
    stage: 'implementation',
    specialist: 'core',
    request: 'Repair configuration precedence in the shared helper',
    acceptance_ids: ['AC-config-explicit-wins'],
    inputs: [{ id: 'approved-plan', path: 'plan/implementation.md', sha256: 'a'.repeat(64) }],
    allowed_tools: ['read', 'apply_patch', 'node_test'],
    allowed_writes: ['src/config.mjs'],
    budget: counters,
    output_schema: 'specialist-result.schema.json',
    policy_digest: 'b'.repeat(64),
    candidate_identity: null,
    brief_id: 'brief-alpha-1',
    workflow_path: 'skills/ae-forge/references/specialists/core.md',
    workflow_sha256: 'c'.repeat(64),
    contract_path: 'skills/ae-forge/references/contract.md',
    contract_sha256: 'd'.repeat(64),
    dependency_key: 'e'.repeat(64),
    host_config_path: '.dev/context/host.json',
    routing_chain: ['core'],
    max_result_bytes: 262144,
    host_execution: {
      adapter: 'contract-fixture',
      model_id: 'fixture-model',
      isolation: 'fresh_process',
      fresh_context: 'available',
      per_dispatch_model_selection: 'available',
      usage_telemetry: 'available',
      tool_write_enforcement: 'available',
      cancellation_acknowledgement: 'unknown',
      model_selection_reason: 'smallest selected fixture model for implementation',
    },
  }
  const taskBrief = {
    schema: 1,
    brief_id: 'brief-alpha-1',
    packet_id: 'packet-alpha-1',
    objective: 'Make explicit request options override stored defaults',
    acceptance_ids: ['AC-config-explicit-wins'],
    source_refs: ['src/config.mjs'],
    invariants: ['Omitted request values retain stored defaults'],
    allowed_tools: ['read', 'apply_patch', 'node_test'],
    allowed_writes: ['src/config.mjs'],
    procedure: ['Reproduce the defect', 'Repair the shared merge', 'Run the focused regression'],
    next_check: 'node --test hidden/precedence.test.mjs',
    missing_input_behavior: 'needs_input',
  }
  const commandReceipt = {
    schema: 1,
    receipt_id: 'receipt:config-regression',
    run_id: 'alpha-config',
    invocation: 'node',
    args: ['--test', 'hidden/precedence.test.mjs'],
    cwd: '.',
    started_at: '2026-09-13T00:00:00.000Z',
    finished_at: '2026-09-13T00:00:01.000Z',
    exit_code: 0,
    output_sha256: 'c'.repeat(64),
    output_bytes: 256,
    candidate_identity: 'd'.repeat(64),
    evidence_class: 'MEASURED',
    issuer: 'forge',
  }
  check('context packet contract accepts a bounded packet', validateValue('context-packet', contextPacket).length === 0)
  check('bounded task brief contract accepts an executable brief', validateValue('bounded-task-brief', taskBrief).length === 0)
  check('runner command receipt contract accepts measured evidence', validateValue('command-receipt', commandReceipt).length === 0)
  check('unknown command receipt fields are rejected', validateValue('command-receipt', { ...commandReceipt, model_claim: true }).length > 0)

  check('transition matrix enumerates every state', STATES.every((state) => Object.hasOwn(NORMAL_TRANSITIONS, state)))
  check('normal declared transitions are accepted', Object.entries(NORMAL_TRANSITIONS).every(([from, targets]) => targets.every((to) => from === 'awaiting_approval' ? canTransition(from, to, { operation: 'approve' }) : canTransition(from, to))))
  const transitionFixture = load(join(contractFixtures, 'transitions.json'))
  const fixtureEdges = new Set(transitionFixture.normal_edges)
  let everyTransition = JSON.stringify([...transitionFixture.states].sort()) === JSON.stringify([...STATES].sort())
  for (const from of STATES) {
    for (const to of STATES) {
      const edge = `${from}>${to}`
      const options = edge === 'awaiting_approval>approved' ? { operation: 'approve' } : {}
      let expected = fixtureEdges.has(edge)
      if (!transitionFixture.terminal_states.includes(from) && transitionFixture.pause_states.includes(to)) expected = true
      if (!transitionFixture.terminal_states.includes(from) && to === 'cancelled') expected = true
      if (transitionFixture.pause_states.includes(from) && to !== 'cancelled') expected = false
      if (canTransition(from, to, options) !== expected) everyTransition = false
    }
  }
  check('every allowed and forbidden state pair matches the independent fixture', everyTransition)
  check('approval cannot bypass the approval operation', !canTransition('awaiting_approval', 'approved'))
  check('repair must return to implementation', canTransition('repair', 'implementation') && !canTransition('repair', 'verification') && !canTransition('repair', 'audit'))
  check('pause resumes only to its recorded prior state', canTransition('blocked', 'implementation', { resumeTo: 'implementation', recordedPriorState: 'implementation' }) && !canTransition('blocked', 'audit', { resumeTo: 'audit', recordedPriorState: 'implementation' }))
  check('terminal states have no recovery edge', STATES.every((to) => !canTransition('complete', to) && !canTransition('cancelled', to)))

  const state = createRunState('alpha-config', '2026-09-13T00:00:00.000Z')
  check('new run state validates at schema v2', state.schema === 2 && validateValue('run-state', state).length === 0)
  const migrated = migrateRunState({ schema: 1, feature_id: 'alpha-config', status: 'created', updated_at: '2026-09-13T00:00:00.000Z', completed: [], active: null, open_findings: [], open_decisions: [], budget: { tokens_used: 0, wall_time_seconds: 0, specialist_runs: 0 } })
  check('zero-usage v1 state migrates deterministically', migrated.schema === 2 && migrated.budget.tier === 'small')
  throws('ambiguous nonzero v1 token usage is not invented during migration', () => migrateRunState({ schema: 1, feature_id: 'alpha-config', status: 'created', updated_at: '2026-09-13T00:00:00.000Z', completed: [], active: null, open_findings: [], open_decisions: [], budget: { tokens_used: 10, wall_time_seconds: 0, specialist_runs: 0 } }), /cannot be migrated/)

  const alphaSeed = join(FIXTURES, 'config-precedence')
  const seedDirect = await import(pathToFileURL(join(alphaSeed, 'src', 'direct.mjs')).href)
  const seedWrapper = await import(pathToFileURL(join(alphaSeed, 'src', 'wrapper.mjs')).href)
  const seedFails = seedDirect.directConfig({ mode: 'safe' }, { mode: 'fast' }).mode !== 'fast'
    && seedWrapper.wrapperConfig({ configuration: { mode: 'safe' } }, { options: { mode: 'fast' } }).mode !== 'fast'
    && seedDirect.directConfig({ enabled: true }, { enabled: false }).enabled !== false
  check('Alpha regression fails on the seeded defect', seedFails)
  const repaired = join(WORK, 'config-repaired')
  cpSync(alphaSeed, repaired, { recursive: true })
  replace(join(repaired, 'src', 'config.mjs'), 'return { ...requestOptions, ...storedDefaults }', 'return { ...storedDefaults, ...requestOptions }')
  const repairedDirect = await import(pathToFileURL(join(repaired, 'src', 'direct.mjs')).href)
  const repairedWrapper = await import(pathToFileURL(join(repaired, 'src', 'wrapper.mjs')).href)
  const repairedPasses = repairedDirect.directConfig({ mode: 'safe' }, { mode: 'fast' }).mode === 'fast'
    && repairedWrapper.wrapperConfig({ configuration: { mode: 'safe' } }, { options: { mode: 'fast' } }).mode === 'fast'
    && repairedDirect.directConfig({ enabled: true }, { enabled: false }).enabled === false
    && repairedDirect.directConfig({ mode: 'safe', retries: 2 }, {}).retries === 2
  check('Alpha regression passes on the intended shared-helper repair', repairedPasses)
} finally {
  rmSync(WORK, { recursive: true, force: true })
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
