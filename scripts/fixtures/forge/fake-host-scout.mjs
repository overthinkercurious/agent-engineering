#!/usr/bin/env node
// Deterministic fake execution host for Scout specialist contract tests.
// Copied from fake-host.mjs and extended with Scout-specific domain modes:
// scout-positive, scout-ambiguous, scout-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Scout-focused dispatch fixtures.

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

// --- Scout domain modes --------------------------------------------------
//
// scout-positive: Scout finds a recurring support-ticket pattern with a real
// count and date range, cites the export receipt, and names a credible
// alternative already in use (a pinned help-center article) and why it was
// set aside (ticket volume kept rising after it was pinned). Mirrors the
// "Valid worked example" in specialists/scout.md.
//
// scout-ambiguous: the opportunity intersects a pending architecture
// decision Scout cannot resolve. Scout returns needs_specialist naming spine
// and the exact missing input, rather than guessing at feasibility, per the
// "Missing inputs" section in specialists/scout.md.
//
// scout-negative: represents the case where the naive read would be "users
// clearly want this" from a single sales-call comment. Scout must NOT
// launder that anecdote into a trend. It records the single comment as one
// OBSERVED data point, marks demand UNKNOWN, and explicitly rejects treating
// it as a corroborated pattern, per the "Misleading example" in
// specialists/scout.md.
if (mode === 'scout-positive' || mode === 'scout-ambiguous' || mode === 'scout-negative') {
  const base = {
    schema: 2,
    run_id: packet.run_id,
    dispatch_id: packet.dispatch_id,
    specialist: packet.specialist,
    artifact_changes: [],
    diagnosis: null,
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

  if (mode === 'scout-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_specialist',
      outcome: 'Scout cannot assess feasibility of the proposed bulk-export opportunity without a pending integration-boundary decision.',
      summary: 'Support evidence shows a real recurring export request, but whether it is feasible depends on an unresolved system-boundary decision that is outside opportunity research.',
      evidence: [
        { id: 'observed:export-tickets', class: 'OBSERVED', claim: '19 support tickets tagged bulk-export-request opened 2026-07-01 through 2026-08-30, export dated 2026-08-31.' },
      ],
      assumptions: [],
      unknowns: ['integration_boundary_feasibility'],
      confidence: { level: 'unknown', basis: 'Demand evidence is real but feasibility turns on an interface-boundary decision Scout does not own.' },
      findings: [],
      needs_specialist: [
        { specialty: 'spine', reason: 'Whether bulk export is technically feasible within current system boundaries is an interface-design decision, not an opportunity-evidence question.', missing_inputs: ['integration_boundary_feasibility'], blocking: true },
      ],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'scout-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'Demand for a one-click import feature is unsupported: the only signal is a single sales-call comment, not a corroborated pattern.',
      summary: '"Users clearly want a one-click import" is rejected. It cites one user\'s comment from one sales call as if it were a trend, with no ticket count, no date range, and no second independent signal. Scout records the comment as a single observed data point and marks demand unknown rather than laundering it into a claim.',
      evidence: [
        { id: 'observed:single-sales-comment', class: 'OBSERVED', claim: 'One prospect, in one 2026-08-20 sales call, said a one-click import "would be nice to have."' },
      ],
      assumptions: [],
      unknowns: ['one_click_import_demand'],
      confidence: { level: 'low', basis: 'A single anecdote with no count, date range, or corroborating signal cannot establish a pattern.' },
      findings: [
        {
          schema: 2,
          id: 'finding:7c1e4a9d2f6b0358',
          lens: 'exact',
          severity: 'medium',
          criterion: 'A demand claim must be supported by more than one anecdote before it is presented as a pattern.',
          invariant: 'A single anecdote is never presented as a corroborated trend.',
          evidence_ids: ['observed:single-sales-comment'],
          affected_behavior: 'The intake note asserts "users clearly want a one-click import" citing only one sales-call comment, with no ticket count, date range, or second independent signal.',
          smallest_repair: 'Restate the claim as a single unconfirmed data point and mark demand unknown until a second independent signal (support tickets, usage data, or a second customer) is found.',
          verification: 'Re-check for a second independent signal before the claim is used to justify a recommendation.',
          status: 'open',
        },
      ],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // scout-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'Recurring onboarding confusion is a real, evidenced opportunity: 34 support tickets over 76 days quote the same missing confirmation step.',
    summary: 'The ticket-export receipt shows 34 tickets tagged onboarding-confusion opened 2026-06-01 through 2026-08-15, each quoting the same missing confirmation step. The current alternative — a pinned help-center article — was considered and set aside because ticket volume kept rising after it was pinned, showing the manual workaround does not resolve the confusion.',
    evidence: [
      { id: 'observed:onboarding-tickets', class: 'OBSERVED', claim: '34 support tickets tagged onboarding-confusion, opened 2026-06-01 through 2026-08-15, export dated 2026-08-16, each quoting the same missing confirmation step.' },
      { id: 'observed:pinned-article-alternative', class: 'OBSERVED', claim: 'A help-center article describing the confirmation step was pinned on 2026-06-20; ticket volume continued rising afterward (2026-06-20 through 2026-08-15).' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'The ticket pattern and the persistence of confusion after the manual-workaround alternative was in place are both directly observed with counts and dates.' },
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
