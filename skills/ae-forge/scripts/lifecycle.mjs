#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertValid, ContractValidationError } from './validate.mjs'

const SELF = dirname(fileURLToPath(import.meta.url))
const BUDGETS_PATH = resolve(SELF, '..', 'references', 'budgets.json')

export const STATE_VERSION = 2
export const CONTRACT_VERSION = 1
export const STATES = [
  'created', 'classified', 'discovery', 'definition', 'plan_review',
  'awaiting_approval', 'approved', 'implementation', 'integration', 'audit',
  'verification', 'repair', 'awaiting_specialist', 'blocked', 'halted',
  'ready_for_pr', 'complete', 'cancelled',
]
export const PAUSED_STATES = ['awaiting_specialist', 'blocked', 'halted']
export const TERMINAL_STATES = ['complete', 'cancelled']

export const NORMAL_TRANSITIONS = Object.freeze({
  created: ['classified'],
  classified: ['discovery', 'definition'],
  discovery: ['definition'],
  definition: ['plan_review'],
  plan_review: ['awaiting_approval'],
  awaiting_approval: ['approved'],
  approved: ['implementation'],
  implementation: ['integration'],
  integration: ['audit'],
  audit: ['repair', 'verification'],
  verification: ['repair', 'ready_for_pr'],
  repair: ['implementation'],
  awaiting_specialist: [],
  blocked: [],
  halted: [],
  ready_for_pr: ['complete'],
  complete: [],
  cancelled: [],
})

export const REQUIRED_ARTIFACTS = Object.freeze({
  classified: ['intent.md'],
  discovery: ['intent.md'],
  definition: ['discovery/synthesis.md'],
  plan_review: ['design/definition.md', 'plan/implementation.md'],
  awaiting_approval: ['reviews/plan-review.md'],
  approved: ['approval.json'],
  implementation: ['approval.json'],
  integration: ['implementation/summary.md'],
  audit: ['implementation/integration.md'],
  verification: ['reviews/domain-audit.md'],
  ready_for_pr: ['verification/summary.md', 'reviews/release-audit.md'],
  complete: ['final-report.md'],
})

export function canTransition(from, to, options = {}) {
  if (!STATES.includes(from) || !STATES.includes(to) || TERMINAL_STATES.includes(from)) return false
  if (to === 'cancelled') return true
  if (PAUSED_STATES.includes(from)) return to === options.resumeTo && options.resumeTo === options.recordedPriorState
  if (PAUSED_STATES.includes(to)) return !TERMINAL_STATES.includes(from)
  if (from === 'awaiting_approval' && to === 'approved') return options.operation === 'approve'
  return (NORMAL_TRANSITIONS[from] || []).includes(to)
}

export function requiredArtifactsFor(state) { return [...(REQUIRED_ARTIFACTS[state] || [])] }

export function loadBudgetConfig() {
  let value
  try { value = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8')) }
  catch (error) { throw new ContractValidationError(`invalid budget configuration: ${error.message}`) }
  return assertValid('budget-config', value)
}

function zeroCounters() {
  return { calls: 0, input_tokens: 0, output_tokens: 0, context_tokens: 0, wall_time_seconds: 0, repair_attempts: 0, specialist_escalations: 0 }
}

export function createBudgetState(tier = 'small') {
  const config = loadBudgetConfig()
  if (!config.tiers[tier]) throw new ContractValidationError(`unknown budget tier: ${tier}`)
  return assertValid('budget', { schema: 1, tier, limits: { ...config.tiers[tier] }, reserved: zeroCounters(), consumed: zeroCounters() })
}

export function emptyUsage() {
  const unavailable = { value: null, provenance: 'unavailable' }
  return {
    schema: 1,
    calls: 0,
    input_tokens: { ...unavailable },
    output_tokens: { ...unavailable },
    reasoning_tokens: { ...unavailable },
    cached_tokens: { ...unavailable },
    charge_usd: { ...unavailable },
    wall_time_ms: 0,
  }
}

export function createRunState(featureId, now = new Date().toISOString(), tier = 'small') {
  return assertValid('run-state', {
    schema: STATE_VERSION,
    contract_version: CONTRACT_VERSION,
    feature_id: featureId,
    status: 'created',
    updated_at: now,
    completed: [],
    active: null,
    open_findings: [],
    open_decisions: [],
    budget: createBudgetState(tier),
    usage: emptyUsage(),
    candidate: null,
    pause: null,
    operation: null,
    repair_cycle: null,
  })
}

export function migrateRunState(value) {
  if (value?.schema === STATE_VERSION) return assertValid('run-state', value)
  if (value?.schema !== 1) throw new ContractValidationError(`unsupported run-state schema: ${value?.schema}`)
  const oldBudget = value.budget || {}
  if ((oldBudget.tokens_used || 0) !== 0) {
    throw new ContractValidationError('run-state v1 with nonzero aggregate tokens cannot be migrated without inventing input/output usage')
  }
  const tier = 'small'
  const migrated = {
    schema: STATE_VERSION,
    contract_version: CONTRACT_VERSION,
    feature_id: value.feature_id,
    status: value.status,
    updated_at: value.updated_at,
    completed: value.completed || [],
    active: value.active ?? null,
    open_findings: value.open_findings || [],
    open_decisions: value.open_decisions || [],
    budget: createBudgetState(tier),
    usage: emptyUsage(),
    candidate: null,
    pause: null,
    operation: null,
    repair_cycle: null,
  }
  migrated.budget.consumed.calls = oldBudget.specialist_runs || 0
  migrated.budget.consumed.wall_time_seconds = oldBudget.wall_time_seconds || 0
  migrated.usage.calls = oldBudget.specialist_runs || 0
  migrated.usage.wall_time_ms = (oldBudget.wall_time_seconds || 0) * 1000
  return assertValid('run-state', migrated)
}
