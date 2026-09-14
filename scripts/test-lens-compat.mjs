#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertValid, deduplicateFindings, findingId } from '../skills/ae-forge/scripts/validate.mjs'

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 8 compat lens\n\n')

const registry = JSON.parse(readFileSync(resolve('skills/ae-forge/references/registry.json'), 'utf8'))
const lensText = readFileSync(resolve('skills/ae-forge/references/lenses/compat.md'), 'utf8')

// --- valid worked example: paidAt semantic-change finding ---
const f1Base = {
  schema: 2,
  lens: 'compat',
  severity: 'high',
  criterion: 'existing callers of a changed field retain its documented meaning',
  invariant: 'paidAt reflects the invoice\'s paid timestamp, not its last-modified timestamp',
  evidence_ids: ['diff:invoices-service#paidAt', 'caller:billing-dashboard#paid-badge'],
  affected_behavior: 'billing-dashboard shows a Paid badge on invoices that were edited but never paid',
  smallest_repair: 'add a new updatedAt field for the modification timestamp and leave paidAt\'s meaning unchanged',
  verification: 'replay billing-dashboard\'s badge logic against an edited-but-unpaid invoice fixture and confirm no Paid badge is shown',
  status: 'open',
}
const f1 = { ...f1Base, id: findingId(f1Base) }

let f1Valid = true
try { assertValid('finding', f1) } catch (error) { f1Valid = false; process.stdout.write(`    ${error.message}\n`) }
check('valid worked example is schema-valid per finding.schema.json', f1Valid)

check('registry escalates_to for compat matches lens file\'s escalation target (spine)',
  registry.lenses?.compat?.escalates_to === 'spine' &&
  /Escalates to.*`spine`/.test(lensText) &&
  /Escalate to Spine/.test(lensText))

// --- second, genuinely different finding ---
const f2Base = {
  schema: 2,
  lens: 'compat',
  severity: 'medium',
  criterion: 'a required field must be honored by every enumerated existing caller',
  invariant: 'CreateOrder requests validate without a shippingRegion field',
  evidence_ids: ['diff:orders-service#CreateOrder', 'caller:checkout-web#create-order'],
  affected_behavior: 'checkout-web requests fail validation because shippingRegion is now required',
  smallest_repair: 'mark shippingRegion optional server-side or introduce a versioned v2 endpoint',
  verification: 'replay checkout-web\'s existing CreateOrder payload against the new schema and confirm it validates',
  status: 'open',
}
const f2 = { ...f2Base, id: findingId(f2Base) }

let f2Valid = true
try { assertValid('finding', f2) } catch (error) { f2Valid = false; process.stdout.write(`    ${error.message}\n`) }
check('second distinct finding is also schema-valid', f2Valid)

const distinct = deduplicateFindings([f1, f2])
check('distinct findings are not over-merged', distinct.length === 2)

// --- independently constructed duplicate of f1: same identity fields (criterion,
// invariant, affected_behavior, evidence_ids) and the same non-identity fields,
// built as a separate literal object rather than by copying f1's reference ---
const f1DupBase = {
  schema: 2,
  lens: 'compat',
  severity: 'high',
  criterion: 'existing callers of a changed field retain its documented meaning',
  invariant: 'paidAt reflects the invoice\'s paid timestamp, not its last-modified timestamp',
  evidence_ids: ['diff:invoices-service#paidAt', 'caller:billing-dashboard#paid-badge'],
  affected_behavior: 'billing-dashboard shows a Paid badge on invoices that were edited but never paid',
  smallest_repair: 'add a new updatedAt field for the modification timestamp and leave paidAt\'s meaning unchanged',
  verification: 'replay billing-dashboard\'s badge logic against an edited-but-unpaid invoice fixture and confirm no Paid badge is shown',
  status: 'open',
}
const f1Dup = { ...f1DupBase, id: findingId(f1DupBase) }

check('independently constructed duplicate computes the same canonical id', f1Dup.id === f1.id)

const merged = deduplicateFindings([f1, f1Dup])
check('exact duplicates (same identity fields) merge to one', merged.length === 1)

// --- missing-input example ---
const missingInput = {
  escalation_target: 'spine',
  missing_input: 'existing_callers',
  note: 'dependency bump payments-sdk 2.4.0 -> 3.0.0 has no record of which call sites use the changed surfaces; compat returns needs_input rather than assuming the bump is safe',
}
check('missing-input example names spine as the escalation target', missingInput.escalation_target === 'spine')

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
