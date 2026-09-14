#!/usr/bin/env node
// Deterministic fake execution host for Flow specialist contract tests.
// Copied from fake-host.mjs and extended with three Flow-domain modes:
// flow-positive, flow-ambiguous, flow-negative. Every other mode below is
// preserved unmodified so this file remains a drop-in fake host with the
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

// --- Flow-domain modes ---------------------------------------------------
//
// flow-positive: Flow walks the checkout submission happy path, then walks it
// again with the payment request forced to fail, and confirms the user gets
// a clear, actionable error message plus a retry that keeps their entered
// details. This is the valid worked example from skills/ae-forge/references/
// specialists/flow.md, expressed as a schema-v2 result. Status complete, no
// escalation.
//
// flow-ambiguous: Flow has a candidate onboarding change but no approved
// journey/wireframe and no runnable build to exercise its error states. Per
// flow.md's Missing-inputs section this returns needs_input naming
// approved_journey_or_wireframe and exercisable_error_states — never an
// invented onboarding behavior.
//
// flow-negative: the packet's own narrative claims "the happy path was
// walked, so the flow works". Flow's procedure (steps 3-4) requires walking
// a realistic failure trigger to its terminal state, and finds the failed
// submission produces no visible message at all, so it must not let the
// happy-path-only claim pass. It records an open journey-lens finding
// instead of silently completing.

if (mode === 'flow-positive') {
  const result = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    status: 'complete',
    outcome: 'The checkout submission journey satisfies AC-checkout-submit on both the happy path and the forced payment-failure path: the failure surfaces a specific, actionable message with the retry control focused, and the shipper/card details the user already entered survive the retry.',
    summary: 'Walked checkout submission end to end twice, once succeeding and once with the payment request forced to fail, and confirmed both terminal states give the user a clear next action.',
    evidence: [
      { id: 'observed:happy-path-confirmation', class: 'OBSERVED', claim: 'On a successful submission the user is shown an order-confirmation screen naming the order number.' },
      { id: 'observed:error-state', class: 'OBSERVED', claim: 'With the payment request forced to fail, the user sees "Your payment could not be processed — try again" with the retry button focused, and the previously entered shipping and card details remain in the form.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'Both the happy path and the forced-failure path were walked directly in a working preview; no automated keyboard-trap scan was available for this dispatch.' },
    diagnosis: null,
    artifact_changes: [],
    findings: [],
    needs_specialist: [],
    usage: {
      schema: 1, calls: 1,
      input_tokens: { value: 210, provenance: 'measured' },
      output_tokens: { value: 95, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 9,
    },
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(0)
}

if (mode === 'flow-ambiguous') {
  const result = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    status: 'needs_input',
    outcome: 'Flow cannot accept the new first-run onboarding journey without an approved journey/wireframe or a runnable build to exercise its error states; neither is present in the routed packet.',
    summary: 'The candidate change introduces a first-run onboarding path but the packet carries no approved journey or wireframe and no way to walk its error states.',
    evidence: [],
    assumptions: [],
    unknowns: ['the approved journey or wireframe for the new onboarding path', 'a runnable build or recorded interaction evidence to exercise its error states'],
    confidence: { level: 'unknown', basis: 'No approved journey and no exercisable error-state evidence was routed; Flow will not invent either.' },
    diagnosis: null,
    artifact_changes: [],
    findings: [],
    needs_specialist: [],
    usage: {
      schema: 1, calls: 1,
      input_tokens: { value: 85, provenance: 'measured' },
      output_tokens: { value: 28, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 4,
    },
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(0)
}

if (mode === 'flow-negative') {
  const result = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    status: 'complete',
    outcome: 'Rejected: "the happy path was walked, so the flow works" does not establish acceptance. The flow was never tested with the network request failing, and the error case has no visible message at all — a user whose submission fails sees nothing and has no way to know whether to retry, wait, or start over.',
    summary: 'Walked the submission happy path and then forced the network request to fail; the failure path renders no error message, no focus change, and no way for the user to recover.',
    evidence: [
      { id: 'observed:silent-failure', class: 'OBSERVED', claim: 'Forcing the submission network request to fail leaves the form in its submitting state with no visible message, no focus change, and no way to retry or recover.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'The silent failure was observed directly by walking the forced-failure path in a working preview.' },
    diagnosis: null,
    artifact_changes: [],
    findings: [
      {
        schema: 2,
        id: 'finding:bbbbbbbbbbbbbbbb',
        lens: 'journey',
        severity: 'critical',
        criterion: 'Every terminal step of a journey must give the user a clear, actionable confirmation or explanation of what happened.',
        invariant: 'A failed submission surfaces a specific, visible error message and a way to retry without losing entered input.',
        evidence_ids: ['observed:silent-failure'],
        affected_behavior: 'Checkout submission when the payment network request fails.',
        smallest_repair: 'Catch the failed request and render a specific error message with a focused retry control that preserves the entered form values.',
        verification: 'Force the payment request to fail again and confirm the user sees the error message with retry focused and their input intact.',
        status: 'open',
      },
    ],
    needs_specialist: [],
    usage: {
      schema: 1, calls: 1,
      input_tokens: { value: 160, provenance: 'measured' },
      output_tokens: { value: 75, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 7,
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
