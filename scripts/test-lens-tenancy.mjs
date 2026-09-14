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

process.stdout.write('\nPhase 8 tenancy lens\n\n')

// Escalation target named in skills/ae-forge/references/lenses/tenancy.md's
// "Non-decisions and escalation" section, and in registry.json's lenses.tenancy.escalates_to.
const ESCALATION_TARGET = 'vault'

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
check('registry.json tenancy lens escalates_to matches lens file', registry.lenses.tenancy.escalates_to === ESCALATION_TARGET)

// Valid worked example: cross-tenant report export IDOR finding.
const validBase = {
  schema: 2,
  lens: 'tenancy',
  severity: 'high',
  criterion: 'report export is scoped to the requesting tenant',
  invariant: 'a caller can only export a report owned by their own tenant',
  evidence_ids: ['receipt:report-export-idor'],
  affected_behavior: 'GET /reports/:reportId/export',
  smallest_repair: "compare the fetched report's tenant_id to session.tenant_id and return 404 on mismatch",
  verification: "authenticate as tenant A, request tenant B's known reportId, assert 403/404",
  status: 'open',
}
const finding1 = { ...validBase, id: findingId(validBase) }

let validOk = true
try { assertValid('finding', finding1) } catch (error) { validOk = false; process.stdout.write(`    error: ${error.message}\n`) }
check('valid worked example passes finding schema', validOk)

// Second, genuinely different finding from the same lens (different criterion/behavior).
const distinctBase = {
  schema: 2,
  lens: 'tenancy',
  severity: 'critical',
  criterion: 'the shared report cache key is scoped to the owning tenant',
  invariant: 'a cache read for a report cannot return a different tenant\'s cached copy',
  evidence_ids: ['receipt:report-cache-cross-tenant-read'],
  affected_behavior: 'internal report cache read path',
  smallest_repair: 'include tenant_id in the cache key and reject reads whose derived tenant does not match the session',
  verification: 'warm the cache as tenant B, then read as tenant A and assert a cache miss rather than tenant B data',
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
  lens: 'tenancy',
  severity: 'high',
  criterion: 'report export is scoped to the requesting tenant',
  invariant: 'a caller can only export a report owned by their own tenant',
  evidence_ids: ['receipt:report-export-idor'],
  affected_behavior: 'GET /reports/:reportId/export',
  smallest_repair: "compare the fetched report's tenant_id to session.tenant_id and return 404 on mismatch",
  verification: "authenticate as tenant A, request tenant B's known reportId, assert 403/404",
  status: 'open',
}
const duplicateOfFinding1 = { ...duplicateBase, id: findingId(duplicateBase) }

check('duplicate has the same canonical id as the original', duplicateOfFinding1.id === finding1.id)
const dedupedSame = deduplicateFindings([finding1, duplicateOfFinding1])
check('exact duplicates merge to one finding', dedupedSame.length === 1)

// Missing-input example: named escalation target and missing input.
const missingInputExample = {
  lens: 'tenancy',
  result: 'needs_input',
  missing_input: 'authorization_model',
  escalates_to: 'vault',
  note: 'shared-cache tenant-ownership rule requires the trust-boundary model Vault owns',
}
check('missing-input example names the same escalation target as the lens file', missingInputExample.escalates_to === ESCALATION_TARGET)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
