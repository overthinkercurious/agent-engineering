#!/usr/bin/env node
// Deterministic fake execution host for Core specialist contract tests.
// Copied from fake-host.mjs and extended with Core-specific domain modes:
// core-positive, core-ambiguous, core-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Core-focused dispatch fixtures.

import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback = '') => { const index = argv.indexOf(name); return index === -1 ? fallback : (argv[index + 1] ?? fallback) }
const mode = arg('--mode', 'complete')

if (argv.includes('--capabilities')) {
  const isolation = arg('--isolation', 'fresh_process')
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    adapter_id: arg('--adapter-id', `fake-${mode}`),
    model_id: 'fake-small-v1',
    model_class: arg('--model-class', 'smaller'),
    isolation,
    fresh_context: isolation === 'shared_context' ? 'unavailable' : 'available',
    per_dispatch_model_selection: 'available',
    usage_telemetry: arg('--telemetry-status', 'measured') === 'unavailable' ? 'unavailable' : 'available',
    tool_write_enforcement: arg('--permission-status', 'available'),
    cancellation_acknowledgement: 'available',
    observation_source: 'deterministic fake-host capability handshake',
  })}\n`)
  process.exit(0)
}

const packet = JSON.parse(readFileSync(arg('--packet'), 'utf8'))

if (mode === 'counted') appendFileSync(join(dirname(arg('--packet')), 'host-calls.log'), 'called\n')

if (mode === 'host-fail') {
  process.stderr.write('api_key=synthetic-secret-value-1234567890')
  process.exit(9)
}

if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 2000))

if (mode === 'malformed') {
  process.stdout.write('{"schema":2,"status":"complete"}\n')
  process.exit(0)
}

const unavailable = { value: null, provenance: 'unavailable' }

// --- Core domain modes --------------------------------------------------
//
// core-positive: Core implements the approved refund endpoint contract
// exactly, including its documented 202/409/422 responses, and cites the
// specific contract clauses it followed against a real contract-check
// receipt. Mirrors the "Valid worked example" in specialists/core.md.
//
// core-ambiguous: the approved contract never states whether a client retry
// after a network timeout should be treated as a new refund attempt or
// deduplicated against the original request. Core returns needs_specialist
// targeting spine naming that exact missing clause, per the "Missing-input
// example" in specialists/core.md. Core never guesses the retry semantics.
//
// core-negative: represents the case where the naive read would be "the
// implementation matches the plan, tests pass" but Core must NOT let that
// pass. The approved contract requires 409 on a duplicate idempotency_key;
// the candidate instead returns 200 and silently overwrites the prior
// refund record. Core records this exact failed condition as an open
// finding instead of completing clean, per the "Misleading example" in
// specialists/core.md.
if (mode === 'core-positive' || mode === 'core-ambiguous' || mode === 'core-negative') {
  const base = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    artifact_changes: [],
    usage: {
      schema: 1,
      calls: 1,
      input_tokens: { value: 180, provenance: 'measured' },
      output_tokens: { value: 90, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 8,
    },
  }

  if (mode === 'core-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_specialist',
      outcome: 'Core cannot implement retry behavior the approved contract never specifies.',
      summary: 'The approved contract defines 202/409/422 response shapes but is silent on whether a post-timeout client retry is a new attempt or must be deduplicated against the original request.',
      evidence: [
        { id: 'observed:refund-contract', class: 'OBSERVED', claim: 'The approved interface contract for POST /accounts/:id/refunds defines 202/409/422 responses but states no retry-after-timeout semantics.' },
      ],
      assumptions: [],
      unknowns: ['retry_idempotency_semantics'],
      confidence: { level: 'unknown', basis: 'The approved contract does not resolve retry-after-timeout idempotency, and Core does not own interface design.' },
      diagnosis: null,
      findings: [],
      needs_specialist: [
        { specialty: 'spine', reason: 'Retry-after-timeout idempotency semantics are an interface-contract decision Core cannot make unilaterally.', missing_inputs: ['retry_idempotency_semantics'], blocking: true },
      ],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'core-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'The refund handler diverges from the approved contract: a duplicate idempotency_key silently overwrites the prior refund instead of returning 409.',
      summary: 'The candidate returns 200 and overwrites the existing refund record on a replayed idempotency_key; the approved contract requires 409 with {error: "duplicate_request"} and the passing test suite never submitted a duplicate request.',
      evidence: [
        { id: 'observed:refund-contract-409-clause', class: 'OBSERVED', claim: 'The approved contract for POST /accounts/:id/refunds requires 409 {error: "duplicate_request"} when idempotency_key is replayed.' },
        { id: 'observed:refund-duplicate-overwrite', class: 'OBSERVED', claim: 'Submitting the same idempotency_key twice returns 200 both times and the second response overwrites the first refund record.' },
      ],
      assumptions: [],
      unknowns: [],
      confidence: { level: 'high', basis: 'The contract clause and the overwriting duplicate request were both directly observed against the candidate.' },
      diagnosis: null,
      findings: [
        {
          schema: 2,
          id: 'finding:9a3f7c2e5b1d0864',
          lens: 'compat',
          severity: 'high',
          criterion: 'A duplicate request carrying the same idempotency_key must return the contract-specified 409 rather than perform the mutating effect again.',
          invariant: 'Replaying an idempotency_key never creates or overwrites a second effect.',
          evidence_ids: ['observed:refund-contract-409-clause', 'observed:refund-duplicate-overwrite'],
          affected_behavior: 'POST /accounts/:id/refunds returns 200 and silently overwrites the prior refund record when idempotency_key is replayed, instead of the contract-specified 409.',
          smallest_repair: 'Look up idempotency_key before creating a refund record and return 409 {error: "duplicate_request"} on a match instead of proceeding.',
          verification: 'Re-run the duplicate-idempotency-key request after the repair and assert 409 with no new or overwritten refund record.',
          status: 'open',
        },
      ],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // core-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'The refund handler implements the approved contract exactly: 202 on acceptance, 409 on a replayed idempotency_key, and 422 on insufficient balance.',
    summary: 'requireIdempotencyKey() plus a pre-insert lookup on idempotency_key satisfies the 409 clause; a balance check before refund creation satisfies the 422 clause; both are exercised by the contract-check receipt.',
    evidence: [
      { id: 'observed:refund-contract-clauses', class: 'OBSERVED', claim: 'POST /accounts/:id/refunds handler implements 202 {refund_id}, 409 {error: "duplicate_request"}, and 422 {error: "insufficient_balance"} exactly as the approved contract states.' },
      { id: 'receipt:refund-contract-check', class: 'MEASURED', claim: 'The runner-executed contract-check receipt exercises all three documented response cases (accept, duplicate, insufficient balance) and each returns the contract-specified status and body.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'All three contract clauses were traced to the implementation and exercised by a runner-owned receipt.' },
    diagnosis: null,
    findings: [],
    needs_specialist: [],
  })}\n`)
  process.exit(0)
}

// --- Shared generic modes (parity with fake-host.mjs) ------------------
const result = {
  schema: 2,
  run_id: packet.run_id,
  dispatch_id: packet.dispatch_id,
  specialist: packet.specialist,
  status: mode.startsWith('needs-') ? 'needs_specialist' : mode === 'diagnosis-blocked' ? 'blocked' : 'complete',
  outcome: mode.startsWith('needs-') ? 'A specialist boundary requires Forge routing.' : mode === 'diagnosis-blocked' ? 'The available evidence cannot establish a cause.' : 'Bounded specialist task completed.',
  summary: mode === 'secret' ? 'Accidentally emitted sk-abcdefghijklmnopqrstuvwxyz123456' : mode === 'huge' ? 'x'.repeat(300000) : 'Used only the packet and bounded brief.',
  evidence: mode.startsWith('diagnosis')
    ? [
        { id: 'observed:symptom', class: 'OBSERVED', claim: 'The explicit request value is replaced by the stored value.' },
        { id: 'inferred:merge-order', class: 'INFERRED', claim: 'The later stored-default spread wins a colliding key.' },
      ]
    : [
        { id: 'observed:packet', class: 'OBSERVED', claim: 'The packet passed the host boundary.' },
        ...(arg('--cite-receipt') ? [{ id: `receipt:${arg('--cite-receipt')}`, class: 'MEASURED', claim: 'The runner-executed command receipt confirms the declared quality command passed on this candidate.' }] : []),
      ],
  assumptions: [],
  unknowns: [],
  confidence: { level: 'high', basis: 'Deterministic fake-host fixture.' },
  diagnosis: mode.startsWith('diagnosis')
    ? {
        symptom: 'An explicit request option does not override the stored default.',
        observation_ids: ['observed:symptom'],
        hypotheses: [
          { id: 'H1', statement: 'Stored defaults are spread after request options.', discriminating_test: 'Trace a colliding key through the shared resolver.', result: mode === 'diagnosis-blocked' ? 'The required input was unavailable.' : 'The later stored spread supplies the returned value.', evidence_ids: ['observed:symptom', 'inferred:merge-order'], disposition: mode === 'diagnosis-blocked' ? 'unresolved' : 'supported' },
          { id: 'H2', statement: 'The wrapper discards false values.', discriminating_test: 'Compare the direct and wrapper call paths.', result: 'Both paths reach the same shared merge unchanged.', evidence_ids: ['inferred:merge-order'], disposition: 'disproved' },
        ],
        established_cause: mode === 'diagnosis-blocked' ? null : 'The shared resolver spreads stored defaults after explicit request options.',
        contributing_factors: ['Both public callers delegate to the shared resolver.'],
        remaining_uncertainty: mode === 'diagnosis-blocked' ? ['The discriminating runtime input is missing.'] : [],
      }
    : null,
  artifact_changes: mode === 'bad-artifact' ? [{ path: 'src/unauthorized.txt', action: 'created', sha256: 'a'.repeat(64) }] : [],
  findings: [],
  needs_specialist: mode.startsWith('needs-')
    ? [{ specialty: mode === 'needs-self' ? packet.specialist : mode === 'needs-scout' ? 'scout' : mode === 'needs-probe' ? 'probe' : 'shift', reason: 'Schema ownership is required.', missing_inputs: ['migration contract'], blocking: true }]
    : [],
  usage: {
    schema: 1,
    calls: 1,
    input_tokens: mode === 'unavailable' ? { ...unavailable } : { value: 120, provenance: 'measured' },
    output_tokens: mode === 'unavailable' ? { ...unavailable } : { value: 40, provenance: 'measured' },
    reasoning_tokens: { ...unavailable },
    cached_tokens: { value: 0, provenance: 'measured' },
    charge_usd: { ...unavailable },
    wall_time_ms: 5,
  },
}
process.stdout.write(`${JSON.stringify(result)}\n`)
