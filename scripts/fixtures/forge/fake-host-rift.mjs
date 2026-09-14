#!/usr/bin/env node
// Deterministic fake execution host for Rift specialist contract tests.
// Copied from fake-host.mjs and extended with Rift-specific domain modes:
// rift-positive, rift-ambiguous, rift-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Rift-focused dispatch fixtures.

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

// --- Rift domain modes ---------------------------------------------------
//
// rift-positive: Rift reads the actual recommendation (in-app reminders to
// reduce churn) and names a specific, falsifiable weakness -- the pilot's
// success metric cannot distinguish the reminder's effect from the existing
// December seasonal-return spike. Classified minor: the recommendation may
// proceed, but the metric should be re-measured outside the confound.
// Mirrors the "Valid worked example" in specialists/rift.md.
//
// rift-ambiguous: Rift is dispatched with only a work-item title, missing
// the actual recommendation text and the alternatives Scout/Pulse
// considered. Returns needs_input naming both exactly, per the
// "Missing-input example" in specialists/rift.md.
//
// rift-negative: represents the case where a naive review would say "looks
// solid, just tighten the button copy" -- a surface-level nitpick standing
// in for a scope check. Rift must not rubber-stamp that. It finds the
// stated non-goal ("we will not target enterprise accounts") does not
// actually exclude the highest-risk part of the request, because enterprise
// admins share the individual-user login cohort. Classified fatal: the
// recommendation should not proceed as written. Per the "Misleading
// example" in specialists/rift.md.
if (mode === 'rift-positive' || mode === 'rift-ambiguous' || mode === 'rift-negative') {
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

  if (mode === 'rift-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_input',
      outcome: 'Rift cannot challenge a recommendation it has not been given.',
      summary: 'Only a work-item title was supplied, with no recommendation text and no record of alternatives considered.',
      evidence: [
        { id: 'observed:title-only', class: 'OBSERVED', claim: 'The dispatch packet contains a work-item title only, with no recommendation text or alternatives-considered record.' },
      ],
      assumptions: [],
      unknowns: ['recommendation_text', 'alternatives_considered'],
      confidence: { level: 'unknown', basis: 'No recommendation text or alternatives were available to challenge.' },
      diagnosis: null,
      findings: [],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'rift-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'fatal: the recommendation should not proceed as written because its exclusion boundary does not actually exclude enterprise accounts.',
      summary: 'The stated non-goal never excludes enterprise accounts because enterprise admins share the same individual-user login cohort the reminder targets.',
      evidence: [
        { id: 'observed:non-goal-text', class: 'OBSERVED', claim: 'The recommendation states "we will not target enterprise accounts" as its scope boundary.' },
        { id: 'observed:shared-login-cohort', class: 'OBSERVED', claim: 'Enterprise admins authenticate through the same individual-user login cohort the reminder is sent to, so the exclusion does not apply in practice.' },
      ],
      assumptions: [],
      unknowns: [],
      confidence: { level: 'high', basis: 'The non-goal text and the shared login cohort were both directly observed in the recommendation and its supporting evidence.' },
      diagnosis: null,
      findings: [
        {
          schema: 2,
          id: 'finding:9d2b6e1a4f0c7358',
          lens: 'scope',
          severity: 'critical',
          criterion: 'A stated non-goal must actually exclude the highest-risk part of the request it claims to bound.',
          invariant: 'Scope boundaries stated in a recommendation match the population the shipped change actually reaches.',
          evidence_ids: ['observed:non-goal-text', 'observed:shared-login-cohort'],
          affected_behavior: 'Enterprise admins receive the in-app reminder despite the recommendation stating enterprise accounts are excluded, triggering the compliance review the non-goal was meant to avoid.',
          smallest_repair: 'Exclude the shared login cohort used by enterprise admins from the reminder rollout, or narrow the non-goal to state the true reachable population.',
          verification: 'Re-check reminder delivery against an enterprise-admin account on the shared login cohort and confirm it is excluded.',
          status: 'open',
        },
      ],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // rift-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'minor: the recommendation may proceed, but its supporting metric is confounded by seasonality and should be re-measured outside the holiday window or against a holdout.',
    summary: 'The pilot success metric (seven-day reactivation rate) cannot distinguish the reminder\'s effect from the existing December seasonal-return spike.',
    evidence: [
      { id: 'observed:pilot-metric', class: 'OBSERVED', claim: 'The recommendation cites a rise in seven-day reactivation rate during a December pilot as its evidence for shipping in-app reminders.' },
      { id: 'inferred:seasonal-confound', class: 'INFERRED', claim: 'A comparable December seasonal-return spike predates the reminder feature and is not separated out by the pilot design.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'medium', basis: 'The pilot metric and the absence of a seasonal control were both directly observed; the size of the confound itself was not separately measured.' },
    diagnosis: null,
    findings: [
      {
        schema: 2,
        id: 'finding:3f8a1c2d9b7e4051',
        lens: 'exact',
        severity: 'medium',
        criterion: 'A recommendation\'s stated success metric must be able to distinguish the recommended change\'s effect from a plausible confound.',
        invariant: 'Evidence cited for a product recommendation isolates the effect of the change from known seasonal or unrelated trends.',
        evidence_ids: ['observed:pilot-metric', 'inferred:seasonal-confound'],
        affected_behavior: 'The cited reactivation-rate improvement may be attributable to the December seasonal-return spike rather than the reminder feature.',
        smallest_repair: 'Re-measure reactivation rate outside the holiday window, or add a holdout group during the same window, before treating the pilot result as confirming evidence.',
        verification: 'Confirm the reactivation-rate lift persists against a holdout or outside the seasonal window.',
        status: 'open',
      },
    ],
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
