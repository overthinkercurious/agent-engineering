#!/usr/bin/env node

import { assertValid, findingId, deduplicateFindings } from '../skills/ae-forge/scripts/validate.mjs'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json')

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 8 journey lens\n\n')

// --- Valid worked example: zero-result search leaves stale spinner, no empty state ---
const base = {
  schema: 2,
  lens: 'journey',
  severity: 'high',
  criterion: 'AC-search-empty-state',
  invariant: 'every reachable journey state renders coherent, terminal content for the user',
  evidence_ids: ['observed:walked-path-search-zero-results'],
  affected_behavior: 'a zero-result search leaves the stale loading spinner on screen with no empty-state message or next action',
  smallest_repair: 'render an explicit empty-state message and clear the loading indicator when the result count is zero',
  verification: 'repeat the walked path with a zero-result query and confirm the spinner clears and an empty-state message appears',
  status: 'open',
}
const f1 = { ...base, id: findingId(base) }

let f1Valid = true
try { assertValid('finding', f1) } catch (error) { f1Valid = false; process.stdout.write(`    error: ${error.message} ${JSON.stringify(error.issues)}\n`) }
check('valid worked example passes finding schema', f1Valid)

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
check('registry escalates_to matches lens file escalation target (flow)', registry.lenses.journey.escalates_to === 'flow')

// --- A genuinely different finding from the same lens ---
const differentBase = {
  schema: 2,
  lens: 'journey',
  severity: 'high',
  criterion: 'AC-payment-retry-preserves-input',
  invariant: 'input the user already provided survives a failure and retry',
  evidence_ids: ['observed:walked-path-payment-retry-failure'],
  affected_behavior: 'after a failed payment submission, the retry form clears the previously entered shipping and card details',
  smallest_repair: 'preserve form field state across the failed-submission retry instead of resetting the form',
  verification: 'repeat the walked path, force the payment request to fail, and confirm entered fields remain populated on retry',
  status: 'open',
}
const f2 = { ...differentBase, id: findingId(differentBase) }

let f2Valid = true
try { assertValid('finding', f2) } catch (error) { f2Valid = false }
check('second distinct finding passes finding schema', f2Valid)

const distinctDeduped = deduplicateFindings([f1, f2])
check('distinct findings are not over-merged', distinctDeduped.length === 2)

// --- A duplicate of f1, independently constructed ---
const duplicateBase = {
  schema: 2,
  lens: 'journey',
  severity: 'high',
  criterion: 'AC-search-empty-state',
  invariant: 'every reachable journey state renders coherent, terminal content for the user',
  evidence_ids: ['observed:walked-path-search-zero-results'],
  affected_behavior: 'a zero-result search leaves the stale loading spinner on screen with no empty-state message or next action',
  smallest_repair: 'render an explicit empty-state message and clear the loading indicator when the result count is zero',
  verification: 'repeat the walked path with a zero-result query and confirm the spinner clears and an empty-state message appears',
  status: 'open',
}
const f1Duplicate = { ...duplicateBase, id: findingId(duplicateBase) }
check('duplicate finding computes the same canonical id', f1Duplicate.id === f1.id)

const duplicateDeduped = deduplicateFindings([f1, f1Duplicate])
check('exact duplicates merge to one finding', duplicateDeduped.length === 1)

// --- Missing-input example ---
const missingInput = {
  status: 'needs_input',
  missing_input: 'exercisable_error_or_empty_state',
  escalation_target: 'flow',
  reason: 'no runnable build or recorded interaction to force the payment-retry flow into its failure state',
}
check('missing-input example names the same escalation target as the lens file (flow)', missingInput.escalation_target === registry.lenses.journey.escalates_to)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
