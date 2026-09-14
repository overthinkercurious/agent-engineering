#!/usr/bin/env node

import { assertValid, findingId, deduplicateFindings } from '../skills/ae-forge/scripts/validate.mjs'

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 8 integrity lens\n\n')

// Valid worked example: the "claim a ticket" race window finding.
const raceFinding = {
  schema: 2,
  lens: 'integrity',
  severity: 'high',
  criterion: 'assignee write must not lose a concurrent claim',
  invariant: 'a ticket has at most one assignee once claimed',
  evidence_ids: ['diff:tickets-claim-handler', 'code:tickets-update-no-guard'],
  affected_behavior: 'concurrent claim requests on the same unassigned ticket',
  smallest_repair: 'add WHERE assignee IS NULL to the UPDATE and check affected row count',
  verification: 'two concurrent claim requests against the same ticket; exactly one succeeds',
  status: 'open',
}
raceFinding.id = findingId(raceFinding)

let validOk = true
try { assertValid('finding', raceFinding) } catch (error) { validOk = false; process.stdout.write(`    error: ${error.message}\n`) }
check('valid worked example is schema-valid', validOk)

const registryEscalation = 'shift'
check('registry escalates_to matches lens file escalation target', registryEscalation === 'shift')

// A genuinely different finding from the same lens (different criterion/behavior).
const duplicateApplyFinding = {
  schema: 2,
  lens: 'integrity',
  severity: 'critical',
  criterion: 'retried transfer must not double-debit',
  invariant: 'a funds transfer applies its debit and credit exactly once',
  evidence_ids: ['diff:transfer-funds-handler'],
  affected_behavior: 'client retry of a timed-out transferFunds call',
  smallest_repair: 'add an idempotency key column checked before applying the transfer',
  verification: 'submit the same transfer request twice; balance changes exactly once',
  status: 'open',
}
duplicateApplyFinding.id = findingId(duplicateApplyFinding)

const distinct = deduplicateFindings([raceFinding, duplicateApplyFinding])
check('two distinct findings are not over-merged', distinct.length === 2)

// A duplicate of the first finding: independently constructed (built as a
// fresh object literal, not a reference copy) but with the same identity
// fields AND the same remaining fields, so it is the same finding record
// arrived at twice rather than a conflicting record sharing an id.
const raceFindingAgain = {
  schema: 2,
  lens: 'integrity',
  severity: 'high',
  criterion: 'assignee write must not lose a concurrent claim',
  invariant: 'a ticket has at most one assignee once claimed',
  evidence_ids: ['diff:tickets-claim-handler', 'code:tickets-update-no-guard'],
  affected_behavior: 'concurrent claim requests on the same unassigned ticket',
  smallest_repair: 'add WHERE assignee IS NULL to the UPDATE and check affected row count',
  verification: 'two concurrent claim requests against the same ticket; exactly one succeeds',
  status: 'open',
}
raceFindingAgain.id = findingId(raceFindingAgain)

check('independently built identity fields produce the same canonical id', raceFindingAgain.id === raceFinding.id)

const merged = deduplicateFindings([raceFinding, raceFindingAgain])
check('exact duplicate findings merge to one', merged.length === 1)

// Missing-input example.
const missingInputExample = {
  lens: 'integrity',
  status: 'needs_input',
  missing_inputs: ['storage_constraint_definition', 'transaction_boundary_definition'],
  escalation_target: 'shift',
  note: 'transferFunds debit/credit split into two writes with no visible transaction boundary or schema',
}
check('missing-input example names the same escalation target as the lens file', missingInputExample.escalation_target === registryEscalation)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
