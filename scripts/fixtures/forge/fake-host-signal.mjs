#!/usr/bin/env node
// Deterministic fake execution host for Signal specialist contract tests.
// Copied from fake-host.mjs and extended with three Signal-domain modes:
// signal-positive, signal-ambiguous, signal-negative. Every other mode below
// is preserved unmodified so this file remains a drop-in fake host with the
// same --mode/--capabilities contract as the shared fixture.

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

// --- Signal-domain modes -----------------------------------------------
//
// signal-positive: a concurrent-retry payment path is correctly required to
// carry an idempotency key plus a paired duplicate-charge metric/alert. This
// is the valid worked example from skills/ae-forge/references/specialists/
// signal.md, expressed as a schema-v2 result. Status complete, no escalation.
//
// signal-ambiguous: Signal has a candidate diff on a shared path but no
// current concurrent-traffic assumption and no existing observability
// inventory for it. Per signal.md's Missing-inputs section this returns
// needs_input naming concurrency_traffic_assumptions and
// existing_observability_coverage — never a guessed traffic figure.
//
// signal-negative: the packet's own narrative claims the retry "degrades
// gracefully". Signal's procedure (step 3) traces the retry loop and finds no
// backoff, jitter, or circuit breaker, so it must not let the naive "looks
// fine" framing pass. It records a critical failure-lens finding instead of
// silently completing.

if (mode === 'signal-positive') {
  const result = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    status: 'complete',
    outcome: 'The charge handler requires a request-scoped idempotency key on the charge-attempt table plus a duplicate_charge_rate metric with a paired nonzero-rate alert before this change can ship; the client retry and the queue redelivery both reach the same handler with no existing key.',
    summary: 'Traced client-retry and queue-redelivery paths into one charge handler and found no idempotency mechanism guarding against a duplicate commit under concurrency.',
    evidence: [
      { id: 'observed:concurrent-retry-path', class: 'OBSERVED', claim: 'The payment charge handler is invoked by both the client automatic retry and the queue redelivery path with no request-scoped idempotency key.' },
      { id: 'inferred:duplicate-commit-risk', class: 'INFERRED', claim: 'Two callers reaching the same handler for the same logical request with no idempotency key or unique constraint will each commit a charge, producing a duplicate charge under ordinary concurrent retry.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'The absent idempotency mechanism was observed directly in the routed handler; no runner-executed load test was available for this dispatch.' },
    diagnosis: null,
    artifact_changes: [],
    findings: [],
    needs_specialist: [],
    usage: {
      schema: 1, calls: 1,
      input_tokens: { value: 180, provenance: 'measured' },
      output_tokens: { value: 90, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 8,
    },
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(0)
}

if (mode === 'signal-ambiguous') {
  const result = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    status: 'needs_input',
    outcome: 'Signal cannot bound the retry/duplication risk on this shared checkout path without the current concurrent-traffic assumption or an inventory of existing metric/alert coverage; neither is present in the routed packet.',
    summary: 'The candidate diff touches a shared checkout path but the packet carries no concurrency assumption and no existing observability inventory to substitute for one.',
    evidence: [],
    assumptions: [],
    unknowns: ['current concurrent-request rate for the shared checkout path', 'existing metric/alert coverage for duplicate or failed charges on this path'],
    confidence: { level: 'unknown', basis: 'No traffic or observability input was routed; Signal will not estimate either.' },
    diagnosis: null,
    artifact_changes: [],
    findings: [],
    needs_specialist: [],
    usage: {
      schema: 1, calls: 1,
      input_tokens: { value: 90, provenance: 'measured' },
      output_tokens: { value: 30, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 4,
    },
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(0)
}

if (mode === 'signal-negative') {
  const result = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    status: 'complete',
    outcome: 'Rejected: "the retry degrades gracefully" does not hold. The retry has no backoff or circuit breaker, so a slow dependency turns into a thundering-herd outage instead of a graceful degradation.',
    summary: 'Traced the retry loop wrapping the payment-gateway call and found a fixed-interval retry with no backoff, jitter, or circuit breaker, fired independently by every concurrent caller.',
    evidence: [
      { id: 'observed:retry-loop', class: 'OBSERVED', claim: 'The retry wraps the dependency call in a fixed-interval loop with no backoff, jitter, or circuit breaker, and fires on every one of N concurrent callers simultaneously.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'Static inspection of the routed retry implementation directly shows the absent backoff and circuit breaker.' },
    diagnosis: null,
    artifact_changes: [],
    findings: [
      {
        schema: 2,
        id: 'finding:aaaaaaaaaaaaaaaa',
        lens: 'failure',
        severity: 'critical',
        criterion: 'A retry against a slow or degraded dependency must not amplify load into a thundering-herd outage.',
        invariant: 'Every retry against an external dependency has bounded backoff and a circuit breaker so concurrent callers shed load instead of amplifying it during degradation.',
        evidence_ids: ['observed:retry-loop'],
        affected_behavior: 'Checkout retry path against the payment gateway under a slow-dependency condition.',
        smallest_repair: 'Add exponential backoff with jitter and a circuit breaker that opens after a bounded number of consecutive timeouts.',
        verification: 'Re-run the concurrent slow-dependency load test and confirm request volume to the dependency stays bounded during a sustained timeout window.',
        status: 'open',
      },
    ],
    needs_specialist: [],
    usage: {
      schema: 1, calls: 1,
      input_tokens: { value: 150, provenance: 'measured' },
      output_tokens: { value: 70, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 6,
    },
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(0)
}

// --- Shared generic modes, unchanged from fake-host.mjs -----------------

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
