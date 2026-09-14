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

process.stdout.write('\nRecover lens contract\n\n')

// --- valid worked example ---
const columnRatchet = {
  schema: 2,
  lens: 'recover',
  severity: 'critical',
  criterion: 'reverting a release must not crash on data the new version wrote',
  invariant: 'prior code version can insert successfully against the post-migration schema',
  evidence_ids: ['observed:add-column-migration', 'observed:prior-insert-path'],
  affected_behavior: 'order table insert path across a version rollback',
  smallest_repair: 'make the new column nullable or backfill-defaulted until the old version is fully retired',
  verification: 'run the prior code version insert path against the migrated schema and confirm no constraint violation',
  status: 'open',
}
columnRatchet.id = findingId(columnRatchet)

let validErr = null
try { assertValid('finding', columnRatchet) } catch (error) { validErr = error }
check('valid worked example passes finding schema', validErr === null)

const registry = JSON.parse(readFileSync(resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json'), 'utf8'))
check('registry escalates_to matches lens file (signal)', registry.lenses.recover.escalates_to === 'signal')

// --- second, genuinely different finding from the same lens ---
const unownedTrigger = {
  schema: 2,
  lens: 'recover',
  severity: 'high',
  criterion: 'a rollback trigger must have a named accountable operator',
  invariant: 'checkout-redesign flag rollback has a stated observable trigger and an on-call owner',
  evidence_ids: ['observed:checkout-redesign-flag-plan'],
  affected_behavior: 'checkout redesign feature-flag rollout',
  smallest_repair: 'name the on-call owner and the error-rate threshold that ends the rollout in the release plan',
  verification: 'confirm the release plan document lists a trigger condition and an accountable owner before rollout',
  status: 'open',
}
unownedTrigger.id = findingId(unownedTrigger)

const distinct = deduplicateFindings([columnRatchet, unownedTrigger])
check('two distinct recover findings are not over-merged', distinct.length === 2)

// --- duplicate of the first finding, independently constructed ---
const columnRatchetDup = {
  schema: 2,
  lens: 'recover',
  severity: 'critical',
  criterion: 'reverting a release must not crash on data the new version wrote',
  invariant: 'prior code version can insert successfully against the post-migration schema',
  evidence_ids: ['observed:add-column-migration', 'observed:prior-insert-path'],
  affected_behavior: 'order table insert path across a version rollback',
  smallest_repair: 'make the new column nullable or backfill-defaulted until the old version is fully retired',
  verification: 'run the prior code version insert path against the migrated schema and confirm no constraint violation',
  status: 'open',
}
columnRatchetDup.id = findingId(columnRatchetDup)
check('duplicate finding recomputes the same canonical id', columnRatchetDup.id === columnRatchet.id)

const merged = deduplicateFindings([columnRatchet, columnRatchetDup])
check('exact duplicate findings merge to one', merged.length === 1)

// --- missing-input example ---
const missingInput = {
  status: 'needs_input',
  lens: 'recover',
  missing_input: 'release_mechanism',
  escalates_to: 'signal',
  note: 'unclear whether the change ships behind a feature flag or as a plain deploy; no flag assumed',
}
check('missing-input example names the signal escalation target', missingInput.escalates_to === 'signal')

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
