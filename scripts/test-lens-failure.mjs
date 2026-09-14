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

process.stdout.write('\nFailure lens contract\n\n')

// --- valid worked example ---
const notifyRetry = {
  schema: 2,
  lens: 'failure',
  severity: 'high',
  criterion: 'dependency failure must not amplify load during degradation',
  invariant: 'retries against a degraded dependency use backoff and jitter, not a fixed fast interval',
  evidence_ids: ['observed:notify-retry-loop', 'receipt:notify-503-fault'],
  affected_behavior: 'notification send retry loop',
  smallest_repair: 'add exponential backoff with jitter and a max-attempt cap to the notify retry helper',
  verification: 're-run the 503 fault injection and confirm retry spacing grows and total attempts stay bounded',
  status: 'open',
}
notifyRetry.id = findingId(notifyRetry)

let validErr = null
try { assertValid('finding', notifyRetry) } catch (error) { validErr = error }
check('valid worked example passes finding schema', validErr === null)

const registry = JSON.parse(readFileSync(resolve(SELF, '..', 'skills', 'ae-forge', 'references', 'registry.json'), 'utf8'))
check('registry escalates_to matches lens file (signal)', registry.lenses.failure.escalates_to === 'signal')

// --- second, genuinely different finding from the same lens ---
const dbFailover = {
  schema: 2,
  lens: 'failure',
  severity: 'critical',
  criterion: 'a non-critical dependency failure must not take down unrelated behavior',
  invariant: 'search-suggestions dependency outage does not block checkout submission',
  evidence_ids: ['observed:checkout-search-coupling', 'receipt:search-timeout-fault'],
  affected_behavior: 'checkout submission when search-suggestions service is down',
  smallest_repair: 'isolate the search-suggestions call behind a timeout and treat failure as non-blocking',
  verification: 're-run the search-timeout fault injection and confirm checkout still completes',
  status: 'open',
}
dbFailover.id = findingId(dbFailover)

const distinct = deduplicateFindings([notifyRetry, dbFailover])
check('two distinct failure findings are not over-merged', distinct.length === 2)

// --- duplicate of the first finding, independently constructed ---
const notifyRetryDup = {
  schema: 2,
  lens: 'failure',
  severity: 'high',
  criterion: 'dependency failure must not amplify load during degradation',
  invariant: 'retries against a degraded dependency use backoff and jitter, not a fixed fast interval',
  evidence_ids: ['observed:notify-retry-loop', 'receipt:notify-503-fault'],
  affected_behavior: 'notification send retry loop',
  smallest_repair: 'add exponential backoff with jitter and a max-attempt cap to the notify retry helper',
  verification: 're-run the 503 fault injection and confirm retry spacing grows and total attempts stay bounded',
  status: 'open',
}
notifyRetryDup.id = findingId(notifyRetryDup)
check('duplicate finding recomputes the same canonical id', notifyRetryDup.id === notifyRetry.id)

const merged = deduplicateFindings([notifyRetry, notifyRetryDup])
check('exact duplicate findings merge to one', merged.length === 1)

// --- missing-input example ---
const missingInput = {
  status: 'needs_input',
  lens: 'failure',
  missing_input: 'retry_configuration',
  escalates_to: 'signal',
  note: 'no timeout/retry settings supplied for the new internal service call; no default assumed',
}
check('missing-input example names the signal escalation target', missingInput.escalates_to === 'signal')

// --- cross-lens check: failure finding vs speed finding are never wrongly collapsed ---
const speedFinding = {
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
speedFinding.id = findingId(speedFinding)

let speedValidErr = null
try { assertValid('finding', speedFinding) } catch (error) { speedValidErr = error }
check('cross-lens speed example also passes finding schema', speedValidErr === null)

const crossLens = deduplicateFindings([notifyRetry, speedFinding])
check('failure and speed findings about the same change are never collapsed', crossLens.length === 2)

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exitCode = 1
