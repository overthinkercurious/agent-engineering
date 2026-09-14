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

process.stdout.write('\nObserve lens contract\n\n')

// --- valid worked example ---
const selfBlinding = {
  schema: 2,
  lens: 'observe',
  severity: 'critical',
  criterion: 'an existing failure signal must not be silently removed or weakened by an unrelated change',
  invariant: 'charge_attempt metric is emitted on every charge outcome so the paired alert can evaluate',
  evidence_ids: ['observed:charge-metric-removed', 'observed:charge-attempt-alert'],
  affected_behavior: 'payment charge attempt metric emission',
  smallest_repair: 'restore charge_attempt{result} emission on every charge code path',
  verification: 'confirm the metric increments on both success and failure charge outcomes and the alert evaluates non-empty data',
  status: 'open',
}
selfBlinding.id = findingId(selfBlinding)

let validErr = null
try { assertValid('finding', selfBlinding) } catch (error) { validErr = error }
check('valid worked example passes finding schema', validErr === null)

const registry = JSON.parse(readFileSync(resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json'), 'utf8'))
check('registry escalates_to matches lens file (signal)', registry.lenses.observe.escalates_to === 'signal')

// --- second, genuinely different finding from the same lens ---
const unactionableAlert = {
  schema: 2,
  lens: 'observe',
  severity: 'medium',
  criterion: 'an alert must have a named actionable owner and fire before a customer notices',
  invariant: 'sync-queue-depth alert routes to an on-call rotation, not an unmonitored channel',
  evidence_ids: ['observed:sync-queue-alert-routing'],
  affected_behavior: 'background sync queue backlog alert',
  smallest_repair: 'route the sync-queue-depth alert to the on-call rotation with a defined response runbook',
  verification: 'trigger a test alert and confirm on-call receives and can acknowledge it',
  status: 'open',
}
unactionableAlert.id = findingId(unactionableAlert)

const distinct = deduplicateFindings([selfBlinding, unactionableAlert])
check('two distinct observe findings are not over-merged', distinct.length === 2)

// --- duplicate of the first finding, independently constructed ---
const selfBlindingDup = {
  schema: 2,
  lens: 'observe',
  severity: 'critical',
  criterion: 'an existing failure signal must not be silently removed or weakened by an unrelated change',
  invariant: 'charge_attempt metric is emitted on every charge outcome so the paired alert can evaluate',
  evidence_ids: ['observed:charge-metric-removed', 'observed:charge-attempt-alert'],
  affected_behavior: 'payment charge attempt metric emission',
  smallest_repair: 'restore charge_attempt{result} emission on every charge code path',
  verification: 'confirm the metric increments on both success and failure charge outcomes and the alert evaluates non-empty data',
  status: 'open',
}
selfBlindingDup.id = findingId(selfBlindingDup)
check('duplicate finding recomputes the same canonical id', selfBlindingDup.id === selfBlinding.id)

const merged = deduplicateFindings([selfBlinding, selfBlindingDup])
check('exact duplicate findings merge to one', merged.length === 1)

// --- missing-input example ---
const missingInput = {
  status: 'needs_input',
  lens: 'observe',
  missing_input: 'existing_observability_coverage',
  escalates_to: 'signal',
  note: 'no metric/log/alert inventory documented and no fault-injection fixture available for the new critical-path integration',
}
check('missing-input example names the signal escalation target', missingInput.escalates_to === 'signal')

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
