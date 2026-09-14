#!/usr/bin/env node
// Deterministic fake execution host for Pulse specialist contract tests.
// Copied from fake-host.mjs and extended with Pulse-specific domain modes:
// pulse-positive, pulse-ambiguous, pulse-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Pulse-focused dispatch fixtures.

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

// --- Pulse domain modes ---------------------------------------------------
//
// pulse-positive: the request "add bulk export to the reports page" is
// turned into a concrete outcome (fewer manual weekly re-exports for the
// analyst workflow), an explicit scope (CSV export of the current filtered
// view), explicit non-goals (scheduling, other formats, query changes), and
// a measurable success signal (the existing report_export event). Mirrors
// the "Valid worked example" in specialists/pulse.md.
//
// pulse-ambiguous: Pulse cannot tell who a vague request ("make the
// dashboard better") serves or what data would show success. It returns
// needs_input naming beneficiary and success_signal, inventing no scope.
// Mirrors the "Missing-input example" in specialists/pulse.md.
//
// pulse-negative: represents the case where the naive read would accept
// "the goal is to ship the new settings page" as a stated outcome. Pulse
// must reject that framing by name (it names an output, not an observable
// change) instead of completing as if the claim were a valid success
// measure. Mirrors the "Misleading example" in specialists/pulse.md.
if (mode === 'pulse-positive' || mode === 'pulse-ambiguous' || mode === 'pulse-negative') {
  const base = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    artifact_changes: [],
    findings: [],
    usage: {
      schema: 1,
      calls: 1,
      input_tokens: { value: 160, provenance: 'measured' },
      output_tokens: { value: 80, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 6,
    },
  }

  if (mode === 'pulse-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_input',
      outcome: 'Pulse cannot state a product outcome for "make the dashboard better" without a named beneficiary and an observable success signal.',
      summary: 'The request names no audience for the dashboard change and no data the project could check to see whether the change worked.',
      evidence: [
        { id: 'observed:request-text', class: 'OBSERVED', claim: 'The request "make the dashboard better" names no user, workflow, or metric.' },
      ],
      assumptions: [],
      unknowns: ['beneficiary', 'success_signal'],
      confidence: { level: 'unknown', basis: 'No beneficiary or success signal is stated or derivable from the request.' },
      diagnosis: null,
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'pulse-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'The claim "the goal is to ship the new settings page" is rejected as a stated outcome: that names an output, not an outcome — it names no observable change the fix is supposed to cause.',
      summary: 'Pulse does not accept the settings-page claim as a success measure. It asks what situation having the page is meant to change (for example, fewer support tickets asking how to change a setting that today requires a support request) before treating any scope as final.',
      evidence: [
        { id: 'observed:request-text', class: 'OBSERVED', claim: 'The request states "the goal is to ship the new settings page" and names no user-observable change the page is meant to cause.' },
        { id: 'assumed:candidate-outcome', class: 'ASSUMED', claim: 'A reduction in settings-change support tickets is a plausible outcome candidate, not yet confirmed by evidence.' },
      ],
      assumptions: ['The support-ticket reduction hypothesis has not been confirmed against actual ticket data.'],
      unknowns: ['confirmed_outcome'],
      confidence: { level: 'low', basis: 'The output claim is rejected with high confidence; the replacement outcome is an unconfirmed hypothesis.' },
      diagnosis: null,
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // pulse-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'Reduce the rate of manual weekly report re-exports for the analyst reporting workflow.',
    summary: 'Scope is CSV export of the currently filtered report view for signed-in analysts; non-goals are scheduled/recurring exports, non-CSV formats, and any change to the underlying report query. Success is a measurable fall in the existing report_export event count for that view within four weeks of release.',
    evidence: [
      { id: 'observed:manual-reexport', class: 'OBSERVED', claim: 'Analysts re-run and manually re-export the same filtered report weekly because no batch export path exists today.' },
      { id: 'decided:scope', class: 'DECIDED', claim: 'Scope is CSV export of the currently filtered view; scheduling, other formats, and query changes are explicit non-goals.' },
      { id: 'observed:report-export-event', class: 'OBSERVED', claim: 'The project already logs a report_export event for this view, so its weekly count is an available success signal.' },
    ],
    assumptions: ['A falling report_export count is treated as a proxy for time saved, not a direct measurement of time saved.'],
    unknowns: [],
    confidence: { level: 'high', basis: 'The beneficiary, costly situation, scope, non-goals, and success signal are all directly observable or already instrumented.' },
    diagnosis: null,
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
