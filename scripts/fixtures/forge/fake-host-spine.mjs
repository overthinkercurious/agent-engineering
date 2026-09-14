#!/usr/bin/env node
// Deterministic fake execution host for Spine specialist contract tests.
// Adds three Spine-domain modes (spine-positive, spine-ambiguous,
// spine-negative) on top of the same --mode/--capabilities contract used by
// scripts/fixtures/forge/fake-host.mjs, without modifying that shared file.

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (name, fallback = '') => { const index = argv.indexOf(name); return index === -1 ? fallback : (argv[index + 1] ?? fallback) }
const mode = arg('--mode', 'complete')

if (argv.includes('--capabilities')) {
  const isolation = arg('--isolation', 'fresh_process')
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    adapter_id: arg('--adapter-id', `fake-${mode}`),
    model_id: 'fake-strongest-v1',
    model_class: arg('--model-class', 'strongest'),
    isolation,
    fresh_context: isolation === 'shared_context' ? 'unavailable' : 'available',
    per_dispatch_model_selection: 'available',
    usage_telemetry: arg('--telemetry-status', 'measured') === 'unavailable' ? 'unavailable' : 'available',
    tool_write_enforcement: arg('--permission-status', 'available'),
    cancellation_acknowledgement: 'available',
    observation_source: 'deterministic fake-host-spine capability handshake',
  })}\n`)
  process.exit(0)
}

const packet = JSON.parse(readFileSync(arg('--packet'), 'utf8'))

const SPINE_MODES = new Set(['spine-positive', 'spine-ambiguous', 'spine-negative'])

if (!SPINE_MODES.has(mode)) {
  process.stderr.write(`fake-host-spine.mjs only implements spine-positive, spine-ambiguous, spine-negative (got ${mode})\n`)
  process.exit(2)
}

const base = {
  schema: 2,
  run_id: packet.run_id,
  dispatch_id: packet.dispatch_id,
  specialist: packet.specialist,
  assumptions: [],
  unknowns: [],
  artifact_changes: [],
  diagnosis: null,
  usage: {
    schema: 1,
    calls: 1,
    input_tokens: { value: 900, provenance: 'measured' },
    output_tokens: { value: 420, provenance: 'measured' },
    reasoning_tokens: { value: null, provenance: 'unavailable' },
    cached_tokens: { value: 0, provenance: 'measured' },
    charge_usd: { value: null, provenance: 'unavailable' },
    wall_time_ms: 8,
  },
}

let result

if (mode === 'spine-positive') {
  // Valid worked example: adding a required `shippingRegion` field to the
  // orders CreateOrder request schema is classified as breaking (not
  // additive) because three enumerated callers across two other teams and
  // one partner integration currently omit it. Spine requires a versioned
  // v2 endpoint (or an optional field with a server-side default) instead
  // of letting implementation proceed on the naive "just one field" claim.
  result = {
    ...base,
    status: 'complete',
    outcome: 'Adding shippingRegion as a required field to CreateOrder is a breaking change; Spine requires a versioned v2 endpoint (or an optional field with a server-resolved default) before implementation proceeds, and Core owns building the accepted v2 endpoint.',
    summary: 'Existing callers of orders CreateOrder are checkout-web, checkout-mobile, and an externally-owned partner integration; none currently send shippingRegion. The proposed diff marks shippingRegion as required, which is non-additive: every enumerated caller would fail request validation unmodified. Spine records the caller/owner map, classifies the change as breaking, and decides the compatibility path as a versioned v2 endpoint that requires the field while v1 continues to accept the existing shape until every enumerated caller has migrated.',
    evidence: [
      { id: 'observed:callers-createorder', class: 'OBSERVED', claim: 'CreateOrder has three existing callers: checkout-web, checkout-mobile, and a partner integration owned outside the org; none send shippingRegion today.' },
      { id: 'observed:schema-diff-required', class: 'OBSERVED', claim: 'The proposed CreateOrder request schema marks shippingRegion as required, not optional.' },
      { id: 'decided:breaking-classification', class: 'DECIDED', claim: 'A required field added to an existing request schema is a breaking, non-additive change against every caller that omits it.' },
      { id: 'decided:v2-compat-path', class: 'DECIDED', claim: 'Serve a versioned v2 endpoint requiring shippingRegion while v1 continues accepting the existing shape until checkout-web, checkout-mobile, and the partner integration have migrated.' },
    ],
    confidence: { level: 'high', basis: 'The caller list and the required-field marking are both directly observed in the current contract and the proposed diff.' },
    findings: [],
    needs_specialist: [],
  }
} else if (mode === 'spine-ambiguous') {
  // Missing-input example: no current interface contract and no existing
  // caller list for the interface being replaced.
  result = {
    ...base,
    status: 'needs_input',
    outcome: 'Spine cannot design the orders-to-warehouse-sync boundary without the current interface contract and the list of existing callers/consumers of the interface being replaced.',
    summary: 'The request asks Spine to design the interface between the orders service and the new warehouse-sync service, but supplies no current interface contract for either side and no enumeration of existing callers/consumers of the interface being replaced. Compatibility classification, sync/async decision, and idempotency design all depend on these facts, so no boundary decision, contract diff, or technical-decision record is produced.',
    evidence: [
      { id: 'observed:packet-request', class: 'OBSERVED', claim: 'The packet requests a boundary design between orders and warehouse-sync and cites no current interface contract or caller list.' },
    ],
    confidence: { level: 'unknown', basis: 'No current interface contract or caller list was supplied; any boundary design would be invented.' },
    findings: [],
    needs_specialist: [],
    unknowns: ['current_interface_contract', 'existing_callers'],
  }
} else {
  // spine-negative: the naive answer is "this is backward compatible, we
  // only added one optional-looking field" — Spine must not let that pass.
  // It records a finding disposing of that claim instead of completing
  // silently as fine.
  result = {
    ...base,
    status: 'complete',
    outcome: 'The proposed CreateOrder change is not backward compatible as submitted: shippingRegion is marked required, so existing callers that omit it now fail validation.',
    summary: 'The submitted diff is described as "backward compatible, we only added one field," but the actual schema diff marks shippingRegion as required, not optional. Existing callers checkout-web, checkout-mobile, and the externally-owned partner integration all omit shippingRegion today and would fail request validation unmodified. Spine does not accept the "backward compatible" claim and records it as an open finding rather than completing silently.',
    evidence: [
      { id: 'observed:schema-diff-required', class: 'OBSERVED', claim: 'The submitted CreateOrder schema diff marks shippingRegion as required, not optional, contradicting the "backward compatible" claim.' },
      { id: 'observed:callers-createorder', class: 'OBSERVED', claim: 'checkout-web, checkout-mobile, and the partner integration are existing callers that currently omit shippingRegion.' },
      { id: 'inferred:validation-failure', class: 'INFERRED', claim: 'Any enumerated caller invoking CreateOrder unmodified after this change fails request validation because it omits a now-required field.' },
    ],
    confidence: { level: 'high', basis: 'The required-field marking and the existing caller list are both directly observed in the submitted diff and current contract.' },
    findings: [
      {
        schema: 2,
        id: 'finding:7a4e91d2c8b6503f',
        lens: 'compat',
        severity: 'critical',
        criterion: 'A change to a shared interface must not break an existing caller that has not migrated.',
        invariant: 'Every enumerated existing caller of CreateOrder must continue to succeed without modification.',
        evidence_ids: ['observed:schema-diff-required', 'inferred:validation-failure'],
        affected_behavior: 'checkout-web, checkout-mobile, and the partner integration all call CreateOrder without shippingRegion and would fail validation once the field becomes required.',
        smallest_repair: 'Make shippingRegion optional with a server-resolved default, or serve it only on a versioned v2 endpoint while v1 keeps accepting the existing shape.',
        verification: 'Replay each enumerated caller\'s existing request shape against the candidate endpoint and confirm it still succeeds.',
        status: 'open',
      },
    ],
    needs_specialist: [],
  }
}

process.stdout.write(`${JSON.stringify(result)}\n`)
