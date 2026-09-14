#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertValid, findingId, deduplicateFindings } from '../skills/ae-forge/scripts/validate.mjs'

const SELF = dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json')

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
  else { failed++; process.stdout.write(`  FAIL  ${name}\n`) }
}

process.stdout.write('\nPhase 8 threat lens\n\n')

// Escalation target named in skills/ae-forge/references/lenses/threat.md's
// "Non-decisions and escalation" section, and in registry.json's lenses.threat.escalates_to.
const ESCALATION_TARGET = 'vault'

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
check('registry.json threat lens escalates_to matches lens file', registry.lenses.threat.escalates_to === ESCALATION_TARGET)

// Valid worked example: resend-verification flood finding.
const validBase = {
  schema: 2,
  lens: 'threat',
  severity: 'medium',
  criterion: 'resend-verification is bounded to one send per request per cooldown window',
  invariant: 'an unauthenticated caller cannot cause unbounded email volume to an address they do not control',
  evidence_ids: ['receipt:resend-verification-flood'],
  affected_behavior: 'POST /account/resend-verification',
  smallest_repair: 'add a per-address cooldown before enqueueing the send',
  verification: 'resend ten times in five seconds and assert only one send is enqueued',
  status: 'open',
}
const finding1 = { ...validBase, id: findingId(validBase) }

let validOk = true
try { assertValid('finding', finding1) } catch (error) { validOk = false; process.stdout.write(`    error: ${error.message}\n`) }
check('valid worked example passes finding schema', validOk)

// Second, genuinely different finding from the same lens (different criterion/behavior).
const distinctBase = {
  schema: 2,
  lens: 'threat',
  severity: 'high',
  criterion: 'password reset tokens are single-use',
  invariant: 'a captured password-reset token cannot be replayed to reset the password a second time',
  evidence_ids: ['receipt:reset-token-replay'],
  affected_behavior: 'POST /account/reset-password',
  smallest_repair: 'mark the reset token consumed on first successful use and reject reuse',
  verification: 'use a reset token once successfully, then replay it and assert rejection',
  status: 'open',
}
const finding2 = { ...distinctBase, id: findingId(distinctBase) }

let distinctOk = true
try { assertValid('finding', finding2) } catch (error) { distinctOk = false; process.stdout.write(`    error: ${error.message}\n`) }
check('distinct finding passes finding schema', distinctOk)

const distinctDeduped = deduplicateFindings([finding1, finding2])
check('distinct findings are not over-merged', distinctDeduped.length === 2)

// Duplicate of finding1: independently constructed, semantically identical fields.
const duplicateBase = {
  schema: 2,
  lens: 'threat',
  severity: 'medium',
  criterion: 'resend-verification is bounded to one send per request per cooldown window',
  invariant: 'an unauthenticated caller cannot cause unbounded email volume to an address they do not control',
  evidence_ids: ['receipt:resend-verification-flood'],
  affected_behavior: 'POST /account/resend-verification',
  smallest_repair: 'add a per-address cooldown before enqueueing the send',
  verification: 'resend ten times in five seconds and assert only one send is enqueued',
  status: 'open',
}
const duplicateOfFinding1 = { ...duplicateBase, id: findingId(duplicateBase) }

check('duplicate has the same canonical id as the original', duplicateOfFinding1.id === finding1.id)
const dedupedSame = deduplicateFindings([finding1, duplicateOfFinding1])
check('exact duplicates merge to one finding', dedupedSame.length === 1)

// Missing-input example: named escalation target and missing input.
const missingInputExample = {
  lens: 'threat',
  result: 'needs_input',
  missing_input: 'intended_function',
  escalates_to: 'vault',
  note: 'webhook receiver replay/idempotency semantics require the durable consumption-ledger design Vault owns',
}
check('missing-input example names the same escalation target as the lens file', missingInputExample.escalates_to === ESCALATION_TARGET)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
