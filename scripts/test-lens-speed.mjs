#!/usr/bin/env node

import { assertValid, deduplicateFindings, findingId } from '../skills/ae-forge/scripts/validate.mjs'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nSpeed lens contract\n\n')

// --- valid worked example ---
const orderLineNPlus1 = {
  schema: 2,
  lens: 'speed',
  severity: 'high',
  criterion: 'per-request operation count must not scale with input size on a critical path',
  invariant: 'order-line lookup issues one query regardless of line count',
  evidence_ids: ['receipt:orders-query-baseline', 'receipt:orders-query-candidate'],
  affected_behavior: 'order detail line-item name lookup',
  smallest_repair: 'batch line-item name lookup into the original join or a single IN-list query',
  verification: 're-run the 50-line-order measurement and confirm query count stays at 1',
  status: 'open',
}
orderLineNPlus1.id = findingId(orderLineNPlus1)

let validErr = null
try { assertValid('finding', orderLineNPlus1) } catch (error) { validErr = error }
check('valid worked example passes finding schema', validErr === null)

const registry = JSON.parse(readFileSync(resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json'), 'utf8'))
check('registry escalates_to matches lens file (signal)', registry.lenses.speed.escalates_to === 'signal')

// --- second, genuinely different finding from the same lens ---
const unboundedFanout = {
  schema: 2,
  lens: 'speed',
  severity: 'critical',
  criterion: 'a result set or fan-out must be bounded regardless of data growth',
  invariant: 'dashboard export caps the number of rows fetched per request',
  evidence_ids: ['observed:dashboard-export-query', 'receipt:dashboard-export-10k-rows'],
  affected_behavior: 'dashboard export request handler',
  smallest_repair: 'add a page limit and cursor to the dashboard export query',
  verification: 're-run the export against a 10k-row tenant and confirm bounded memory and latency',
  status: 'open',
}
unboundedFanout.id = findingId(unboundedFanout)

const distinct = deduplicateFindings([orderLineNPlus1, unboundedFanout])
check('two distinct speed findings are not over-merged', distinct.length === 2)

// --- duplicate of the first finding, independently constructed ---
const orderLineNPlus1Dup = {
  schema: 2,
  lens: 'speed',
  severity: 'high',
  criterion: 'per-request operation count must not scale with input size on a critical path',
  invariant: 'order-line lookup issues one query regardless of line count',
  evidence_ids: ['receipt:orders-query-baseline', 'receipt:orders-query-candidate'],
  affected_behavior: 'order detail line-item name lookup',
  smallest_repair: 'batch line-item name lookup into the original join or a single IN-list query',
  verification: 're-run the 50-line-order measurement and confirm query count stays at 1',
  status: 'open',
}
orderLineNPlus1Dup.id = findingId(orderLineNPlus1Dup)
check('duplicate finding recomputes the same canonical id', orderLineNPlus1Dup.id === orderLineNPlus1.id)

const merged = deduplicateFindings([orderLineNPlus1, orderLineNPlus1Dup])
check('exact duplicate findings merge to one', merged.length === 1)

// --- missing-input example ---
const missingInput = {
  status: 'needs_input',
  lens: 'speed',
  missing_input: 'latency_budget',
  escalates_to: 'signal',
  note: 'no accepted latency budget and no derivable SLO for the report-generation endpoint; none assumed',
}
check('missing-input example names the signal escalation target', missingInput.escalates_to === 'signal')

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
