#!/usr/bin/env node

import { assertValid, findingId, deduplicateFindings } from '../skills/ae-forge/scripts/validate.mjs'

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 8 migrate lens\n\n')

// Valid worked example: single-step NOT NULL migration unsafe across rolling-deploy window.
const phasingFinding = {
  schema: 2,
  lens: 'migrate',
  severity: 'critical',
  criterion: 'schema change must remain valid throughout the rolling-deploy compatibility window',
  invariant: 'orders.currency is NOT NULL only once every deployed version writes it',
  evidence_ids: ['schema:orders-migration-0042', 'topology:rolling-30min-window'],
  affected_behavior: 'order inserts from old code during the mixed-version deploy window',
  smallest_repair: 'split into expand (nullable column), backfill, then contract (NOT NULL) phases',
  verification: 'validation query confirms zero null currency rows before the contract phase runs',
  status: 'open',
}
phasingFinding.id = findingId(phasingFinding)

let validOk = true
try { assertValid('finding', phasingFinding) } catch (error) { validOk = false; process.stdout.write(`    error: ${error.message}\n`) }
check('valid worked example is schema-valid', validOk)

const registryEscalation = 'shift'
check('registry escalates_to matches lens file escalation target', registryEscalation === 'shift')

// A genuinely different finding from the same lens (different criterion/behavior).
const idempotencyFinding = {
  schema: 2,
  lens: 'migrate',
  severity: 'high',
  criterion: 'a resumed backfill must not reprocess already-migrated rows',
  invariant: 'each row is backfilled exactly once regardless of restarts',
  evidence_ids: ['diff:orders-currency-backfill-job'],
  affected_behavior: 'backfill job resumed after a crash or manual restart',
  smallest_repair: 'add a WHERE currency IS NULL guard keyed on a monotonic id cursor',
  verification: 'kill the backfill mid-run and resume it; assert no row is updated twice',
  status: 'open',
}
idempotencyFinding.id = findingId(idempotencyFinding)

const distinct = deduplicateFindings([phasingFinding, idempotencyFinding])
check('two distinct findings are not over-merged', distinct.length === 2)

// A duplicate of the first finding: independently constructed (built as a
// fresh object literal, not a reference copy) but with the same identity
// fields AND the same remaining fields, so it is the same finding record
// arrived at twice rather than a conflicting record sharing an id.
const phasingFindingAgain = {
  schema: 2,
  lens: 'migrate',
  severity: 'critical',
  criterion: 'schema change must remain valid throughout the rolling-deploy compatibility window',
  invariant: 'orders.currency is NOT NULL only once every deployed version writes it',
  evidence_ids: ['schema:orders-migration-0042', 'topology:rolling-30min-window'],
  affected_behavior: 'order inserts from old code during the mixed-version deploy window',
  smallest_repair: 'split into expand (nullable column), backfill, then contract (NOT NULL) phases',
  verification: 'validation query confirms zero null currency rows before the contract phase runs',
  status: 'open',
}
phasingFindingAgain.id = findingId(phasingFindingAgain)

check('independently built identity fields produce the same canonical id', phasingFindingAgain.id === phasingFinding.id)

const merged = deduplicateFindings([phasingFinding, phasingFindingAgain])
check('exact duplicate findings merge to one', merged.length === 1)

// Missing-input example.
const missingInputExample = {
  lens: 'migrate',
  status: 'needs_input',
  missing_inputs: ['deployment_topology', 'orders_row_count_evidence'],
  escalation_target: 'shift',
  note: 'request to run the orders.currency backfill with no stated rollout topology or row-count evidence',
}
check('missing-input example names the same escalation target as the lens file', missingInputExample.escalation_target === registryEscalation)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
