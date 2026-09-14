#!/usr/bin/env node
// Deterministic fake execution host for Pixel specialist contract tests.
// Copied from fake-host.mjs and extended with Pixel-specific domain modes:
// pixel-positive, pixel-ambiguous, pixel-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Pixel-focused dispatch fixtures.

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

// --- Pixel domain modes -------------------------------------------------
//
// pixel-positive: Pixel implements the checkout form exactly per the
// approved design, mapping all four approved states (idle, submitting,
// success, failure) to code paths and citing the local state-transition
// test. Mirrors the "Valid worked example" in specialists/pixel.md.
//
// pixel-ambiguous: the approved design is silent on an offline/interrupted-
// submission state. Pixel escalates to flow naming the exact missing input
// rather than inventing offline UI, per the "Missing-input example" in
// specialists/pixel.md.
//
// pixel-negative: represents the case where a "matches the design" claim is
// false. The design specifies an inline error message on failed submit; the
// implementation only logs to the console and shows nothing to the user.
// Pixel must not accept that claim — it records an open finding for the
// missing inline error instead, per the "Misleading example" in
// specialists/pixel.md.
if (mode === 'pixel-positive' || mode === 'pixel-ambiguous' || mode === 'pixel-negative') {
  const base = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    artifact_changes: [],
    usage: {
      schema: 1,
      calls: 1,
      input_tokens: { value: 160, provenance: 'measured' },
      output_tokens: { value: 80, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 7,
    },
  }

  if (mode === 'pixel-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_specialist',
      outcome: 'The approved checkout design does not specify an offline/interrupted-submission state.',
      summary: 'idle, submitting, success, and failure are specified; behavior when the network drops mid-submission is not.',
      evidence: [
        { id: 'observed:checkout-design-states', class: 'OBSERVED', claim: 'The approved design specifies idle, submitting, success, and failure states only.' },
      ],
      assumptions: [],
      unknowns: ['offline_submission_state'],
      confidence: { level: 'unknown', basis: 'No approved offline/interrupted-submission state was available to implement against.' },
      diagnosis: null,
      findings: [],
      needs_specialist: [
        { specialty: 'flow', reason: 'The approved design does not specify an offline/interrupted-submission state.', missing_inputs: ['offline_submission_state'], blocking: true },
      ],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'pixel-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'The checkout form does not match the approved design: the specified inline failure message is not rendered to the user.',
      summary: 'The failure branch only calls console.error(err); no inline error message is rendered above the submit button as the approved design specifies.',
      evidence: [
        { id: 'observed:checkout-design-failure-state', class: 'OBSERVED', claim: 'The approved design specifies an inline error message above the submit button on failed submit.' },
        { id: 'observed:checkout-failure-branch', class: 'OBSERVED', claim: 'The implemented failure branch calls console.error(err) and renders no visible element to the user.' },
      ],
      assumptions: [],
      unknowns: [],
      confidence: { level: 'high', basis: 'The approved design state and the implemented failure branch were both directly inspected.' },
      diagnosis: null,
      findings: [
        {
          schema: 2,
          id: 'finding:9f2b7e1a6c3d5804',
          lens: 'exact',
          severity: 'high',
          criterion: 'Every approved design state is realized by a visible, testable code path.',
          invariant: 'A user action that the approved design says produces visible feedback must produce visible feedback.',
          evidence_ids: ['observed:checkout-design-failure-state', 'observed:checkout-failure-branch'],
          affected_behavior: 'A failed checkout submission shows nothing to the user; the error is only logged to the console.',
          smallest_repair: 'Render the approved inline error message above the submit button in the failure branch instead of only logging it.',
          verification: 'Force a failed submit and assert the inline error element is present and visible.',
          status: 'open',
        },
      ],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // pixel-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'The checkout form implements every approved design state and matches the approved design exactly.',
    summary: 'idle, submitting, success, and failure each map to a distinct, tested branch of one status state variable.',
    evidence: [
      { id: 'observed:checkout-state-map', class: 'OBSERVED', claim: 'idle maps to the initial form render, submitting to the disabled-inputs/spinner branch, success to the confirmation panel, and failure to the inline error branch.' },
      { id: 'observed:checkout-state-test', class: 'OBSERVED', claim: 'A local state-transition test drives all four approved states and passes.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'Each approved design state was mapped to a code path and confirmed by a runner-executed test.' },
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
