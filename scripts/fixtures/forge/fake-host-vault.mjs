#!/usr/bin/env node
// Deterministic fake execution host for Vault specialist contract tests.
// Copied from fake-host.mjs and extended with Vault-specific domain modes:
// vault-positive, vault-ambiguous, vault-negative. All other modes behave
// identically to the shared fake-host.mjs so this fixture can stand in for
// it in Vault-focused dispatch fixtures.

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

// --- Vault domain modes -----------------------------------------------
//
// vault-positive: Vault correctly finds and requires a test for a real
// cross-tenant authorization bypass on an internal admin route. Mirrors the
// "Valid worked example" in specialists/vault.md.
//
// vault-ambiguous: Vault lacks the authorization model needed to reason
// about ownership boundaries and returns needs_input naming that exact
// missing input, per the "Missing-input example" in specialists/vault.md.
//
// vault-negative: represents the case where a naive read would say "looks
// fine" (a session check exists) but Vault must NOT let that pass. Vault
// records an open critical finding for the missing tenant/owner comparison,
// per the "Misleading example" in specialists/vault.md. It still returns
// complete (the review itself finished), but the finding is open and no
// release verdict is implied.
if (mode === 'vault-positive' || mode === 'vault-ambiguous' || mode === 'vault-negative') {
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

  if (mode === 'vault-ambiguous') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'needs_input',
      outcome: 'Vault cannot map ownership boundaries without an authorization model.',
      summary: 'No roles, tenant boundaries, or ownership rules were supplied for the new refunds route.',
      evidence: [
        { id: 'observed:route-list', class: 'OBSERVED', claim: 'Only a route list (GET /internal/accounts/:id/refunds) was supplied, with no authorization model.' },
      ],
      assumptions: [],
      unknowns: ['authorization_model'],
      confidence: { level: 'unknown', basis: 'No authorization model was available to reason about ownership.' },
      diagnosis: null,
      findings: [],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  if (mode === 'vault-negative') {
    process.stdout.write(`${JSON.stringify({
      ...base,
      status: 'complete',
      outcome: 'The internal refunds route is not authorized; a valid session was mistaken for an ownership check.',
      summary: 'requireSession() confirms identity but never compares session.tenant_id to the fetched account tenant_id.',
      evidence: [
        { id: 'observed:refunds-route', class: 'OBSERVED', claim: 'GET /internal/accounts/:id/refunds is guarded only by requireSession(), with no comparison to the resource owner.' },
        { id: 'observed:refunds-idor-check', class: 'OBSERVED', claim: 'A request authenticated as tenant A for tenant B\'s known account id returns 200 with tenant B\'s refund data.' },
      ],
      assumptions: [],
      unknowns: [],
      confidence: { level: 'high', basis: 'The missing ownership comparison and the reproducing request were both directly observed.' },
      diagnosis: null,
      findings: [
        {
          schema: 2,
          id: 'finding:7c1e9a2b4d6f0813',
          lens: 'tenancy',
          severity: 'critical',
          criterion: 'Every resource-scoped action re-derives and compares the caller\'s tenant to the resource owner server-side.',
          invariant: 'A caller can only read or act on resources owned by their own tenant.',
          evidence_ids: ['observed:refunds-route', 'observed:refunds-idor-check'],
          affected_behavior: 'GET /internal/accounts/:id/refunds returns another tenant\'s refund data to an authenticated caller from a different tenant.',
          smallest_repair: 'Compare session.tenant_id to the fetched account.tenant_id before returning refund data; fail closed with 404.',
          verification: 'Re-run the cross-tenant refunds request after the repair and assert 404.',
          status: 'open',
        },
      ],
      needs_specialist: [],
    })}\n`)
    process.exit(0)
  }

  // vault-positive
  process.stdout.write(`${JSON.stringify({
    ...base,
    status: 'complete',
    outcome: 'The internal refunds route is authorized correctly and the cross-tenant abuse case is proven closed.',
    summary: 'requireSession() plus an explicit session.tenant_id === account.tenant_id comparison blocks cross-tenant access; the adversarial test confirms it.',
    evidence: [
      { id: 'observed:refunds-route-fixed', class: 'OBSERVED', claim: 'GET /internal/accounts/:id/refunds compares session.tenant_id to the fetched account.tenant_id and returns 404 on mismatch.' },
      { id: 'observed:refunds-idor-check-fixed', class: 'OBSERVED', claim: 'A request authenticated as tenant A for tenant B\'s known account id returns 404.' },
    ],
    assumptions: [],
    unknowns: [],
    confidence: { level: 'high', basis: 'The ownership comparison and its reproducing adversarial test were both directly observed.' },
    diagnosis: null,
    findings: [
      {
        schema: 2,
        id: 'finding:7c1e9a2b4d6f0813',
        lens: 'tenancy',
        severity: 'critical',
        criterion: 'Every resource-scoped action re-derives and compares the caller\'s tenant to the resource owner server-side.',
        invariant: 'A caller can only read or act on resources owned by their own tenant.',
        evidence_ids: ['observed:refunds-route-fixed', 'observed:refunds-idor-check-fixed'],
        affected_behavior: 'GET /internal/accounts/:id/refunds previously returned another tenant\'s refund data to an authenticated caller from a different tenant.',
        smallest_repair: 'Compare session.tenant_id to the fetched account.tenant_id before returning refund data; fail closed with 404.',
        verification: 'The cross-tenant refunds request now returns 404.',
        status: 'fixed',
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
