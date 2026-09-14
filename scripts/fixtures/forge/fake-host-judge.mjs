#!/usr/bin/env node
// Deterministic fake execution host for Judge specialist contract tests.
// Copied from fake-host.mjs and extended with Judge-specific domain modes:
// judge-positive, judge-ambiguous, judge-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Judge-focused dispatch fixtures. Reuses the existing --cite-receipt
// mechanism to add a MEASURED evidence entry citing receipt:<id>.

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

// --- Judge domain modes -------------------------------------------------
//
// judge-positive: Judge traces every acceptance ID to a cited MEASURED
// receipt (via the existing --cite-receipt mechanism) and an independent
// Probe result, finds full coverage, and returns complete. Mirrors the
// "Valid worked example" in specialists/judge.md.
//
// judge-ambiguous: one acceptance ID (AC-3) has no cited evidence at all —
// no receipt and no independent Probe result reaching it. Judge returns
// needs_input naming AC-3 as the missing input, per the "Misleading example"
// / Missing-inputs section in specialists/judge.md. It does not accept the
// narrative "tested and working" claim as coverage.
//
// judge-negative: Judge is asked to render a verdict with no real evidence
// behind the claim at all (no --cite-receipt, no candidate identity match).
// Consistent with Judge's Authority-and-boundaries section, it refuses to
// rubber-stamp the claim: it records an open finding for the unbacked
// acceptance claim rather than returning a clean "complete"/ready verdict.
if (mode === 'judge-positive' || mode === 'judge-ambiguous' || mode === 'judge-negative') {
  const base = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    artifact_changes: [],
    usage: {
      schema: 1,
      calls: 1,
      input_tokens: { value: 220, provenance: 'measured' },
      output_tokens: { value: 110, provenance: 'measured' },
      reasoning_tokens: { ...unavailable },
      cached_tokens: { value: 0, provenance: 'measured' },
      charge_usd: { ...unavailable },
      wall_time_ms: 9,
    },
  }

  if (mode === 'judge-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_input',
      outcome: 'Acceptance coverage cannot be certified; one acceptance id has no evidence at all.',
      summary: 'AC-1 and AC-2 trace to real receipts and an independent Probe result; AC-3 has no cited evidence at all — the implementation summary just asserts it was handled.',
      evidence: [
        { id: 'observed:implementation-summary', class: 'OBSERVED', claim: 'The implementation summary asserts AC-1 through AC-3 are tested and working, with no receipt or Probe citation for AC-3.' },
        ...(arg('--cite-receipt') ? [{ id: `receipt:${arg('--cite-receipt')}`, class: 'MEASURED', claim: 'The runner-executed command receipt confirms AC-1 on this candidate.' }] : []),
      ],
      assumptions: [],
      unknowns: ['AC-3'],
      confidence: { level: 'unknown', basis: 'AC-3 has no matching receipt or independent Probe result to trace against.' },
      diagnosis: null,
      findings: [],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'judge-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'The claimed acceptance coverage is not backed by real evidence; Judge refuses to certify it as ready.',
      summary: 'The implementation summary claims AC-1 is tested and works, but no MEASURED receipt resolves for it and no independent Probe result reaches it.',
      evidence: [
        { id: 'observed:implementation-summary', class: 'OBSERVED', claim: 'The implementation summary asserts AC-1 is tested and working with no cited receipt or Probe result.' },
      ],
      assumptions: [],
      unknowns: [],
      confidence: { level: 'low', basis: 'The only support for AC-1 is a narrative claim, not a runner-owned receipt or independent verification.' },
      diagnosis: null,
      findings: [
        {
          schema: 2,
          id: 'finding:3f8b6d2a19e4c507',
          lens: 'release-readiness',
          severity: 'high',
          criterion: 'Every claimed acceptance id traces to a runner-owned receipt or an independent verification result on the current candidate.',
          invariant: 'A release verdict never rests on an unbacked narrative claim of coverage.',
          evidence_ids: ['observed:implementation-summary'],
          affected_behavior: 'AC-1 is claimed complete with no measured evidence or independent verification behind it.',
          smallest_repair: 'Run the declared quality command through forge.mjs verify on this candidate, or dispatch an independent Probe verification, before re-requesting the release verdict.',
          verification: 'Re-check that a receipt or independent Probe result resolves for AC-1 on this candidate.',
          status: 'open',
        },
      ],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // judge-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'Every acceptance id traces to real evidence on the current candidate; the candidate is ready.',
    summary: 'AC-1 and AC-2 both trace to a runner-owned receipt and/or an independent Probe verification result on this candidate; no open finding is unrecorded.',
    evidence: [
      { id: 'observed:probe-verification', class: 'OBSERVED', claim: 'An independent Probe verification result on this candidate reaches AC-2.' },
      ...(arg('--cite-receipt') ? [{ id: `receipt:${arg('--cite-receipt')}`, class: 'MEASURED', claim: 'The runner-executed command receipt confirms AC-1 on this candidate.' }] : []),
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'Both acceptance ids trace to a real runner-owned receipt or independent verification on this exact candidate.' },
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
