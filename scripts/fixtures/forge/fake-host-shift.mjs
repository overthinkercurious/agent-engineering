#!/usr/bin/env node
// Deterministic fake execution host for Shift specialist contract tests.
// Adds three Shift-domain modes (shift-positive, shift-ambiguous,
// shift-negative) on top of the same --mode/--capabilities contract used by
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
    observation_source: 'deterministic fake-host-shift capability handshake',
  })}\n`)
  process.exit(0)
}

const packet = JSON.parse(readFileSync(arg('--packet'), 'utf8'))

const SHIFT_MODES = new Set(['shift-positive', 'shift-ambiguous', 'shift-negative'])

if (!SHIFT_MODES.has(mode)) {
  process.stderr.write(`fake-host-shift.mjs only implements shift-positive, shift-ambiguous, shift-negative (got ${mode})\n`)
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

if (mode === 'shift-positive') {
  // Valid worked example: expand/backfill/contract plan for adding a
  // required `orders.currency` column during a rolling deploy, with an
  // idempotency key and a rehearsal receipt cited as measured evidence.
  result = {
    ...base,
    status: 'complete',
    outcome: 'Expand/backfill/contract plan for orders.currency is compatible across the rolling-deploy window and the backfill is idempotent on retry.',
    summary: 'Existing invariant: orders.currency is absent and callers assume USD. Desired invariant: orders.currency is NOT NULL on every row. A single-step NOT NULL DEFAULT migration is unsafe against the observed 40M-row table and 30-minute mixed-version window, so the plan expands with a nullable column, backfills in batches guarded by an idempotency condition, and contracts to NOT NULL only after a validation query confirms zero remaining nulls and the old code path is retired.',
    evidence: [
      { id: 'observed:schema-orders', class: 'OBSERVED', claim: 'orders has no currency column; 40,000,000 existing rows; rolling deploy keeps old and new code live for 30 minutes.' },
      { id: 'decided:expand-contract', class: 'DECIDED', claim: 'Use expand (nullable currency) -> backfill (batched, idempotent) -> contract (NOT NULL after validation) instead of one destructive step.' },
      { id: 'decided:idempotency-key', class: 'DECIDED', claim: 'Backfill batches are scoped by "id > :cursor AND currency IS NULL", so a retried or resumed batch skips already-migrated rows and cannot double-apply.' },
      { id: 'observed:orders-backfill-rehearsal', class: 'OBSERVED', claim: 'Rehearsal against a disposable 10,000,000-row copy completed the backfill in bounded batches of 5,000 with no lock wait above the configured threshold.' },
      { id: 'decided:recovery', class: 'DECIDED', claim: 'A halted backfill is detected by counting remaining currency IS NULL rows; resuming re-enters the same idempotent batch loop rather than reverting the column.' },
    ],
    confidence: { level: 'high', basis: 'Compatibility window, idempotency key, and rehearsal receipt are all directly observed or measured on representative scale.' },
    diagnosis: null,
    findings: [],
    needs_specialist: [],
  }
} else if (mode === 'shift-ambiguous') {
  // Missing-input example: no current schema, no deployment topology, no
  // row-count/scale evidence for the affected table.
  result = {
    ...base,
    status: 'needs_input',
    outcome: 'Shift cannot plan the orders.currency backfill without the current schema, deployment topology, and orders row-count evidence.',
    summary: 'The request asks to backfill orders.currency but supplies no schema definition, no statement of the deployment/rollout topology, and no row-count or scale evidence for orders. Compatibility, idempotency, and recovery all depend on these facts, so no migration plan, idempotency claim, or recovery procedure is produced.',
    evidence: [
      { id: 'observed:packet-request', class: 'OBSERVED', claim: 'The packet requests a backfill of orders.currency and cites no schema, topology, or scale input.' },
    ],
    confidence: { level: 'unknown', basis: 'No schema, topology, or scale evidence was supplied; any plan would be invented.' },
    diagnosis: null,
    findings: [],
    needs_specialist: [],
    unknowns: ['current_schema_definition', 'deployment_topology', 'orders_row_count_evidence'],
  }
} else {
  // shift-negative: the naive answer is "this migration is safe, it ran
  // fast in staging and the tool exited 0" — Shift must not let that pass.
  // It records a finding disposing of that claim instead of completing
  // silently as fine.
  result = {
    ...base,
    status: 'complete',
    outcome: 'The proposed orders.currency backfill is not safe to run as submitted: it has no idempotency key, so a retried run double-applies already-migrated rows.',
    summary: 'The submitted plan claims safety from a staging run (200 rows, under one second, migration-tool exit code 0) and a currency backfill re-derived from an order_items join with no completion marker or guard condition. Staging scale is not representative of the packet\'s stated 40,000,000-row production table, and the join-based backfill has no idempotency key: a retried or resumed run reprocesses every row and double-applies any currency-dependent side effect, such as a downstream charge-adjustment trigger keyed on a currency change. Shift does not accept the "safe" claim and records it as an open finding rather than completing silently.',
    evidence: [
      { id: 'observed:staging-run', class: 'OBSERVED', claim: 'The cited staging rehearsal used a 200-row fixture and a migration-tool exit code of 0, not the 40,000,000-row production table stated in scale evidence.' },
      { id: 'observed:backfill-definition', class: 'OBSERVED', claim: 'The backfill statement re-derives currency from an order_items join with no idempotency key, completion marker, or WHERE currency IS NULL guard.' },
      { id: 'inferred:double-apply', class: 'INFERRED', claim: 'A retried or resumed run of the join-based backfill reprocesses already-migrated rows and would re-trigger any currency-keyed downstream side effect.' },
    ],
    confidence: { level: 'high', basis: 'The missing idempotency guard and the non-representative rehearsal scale are both directly observed in the submitted plan.' },
    diagnosis: null,
    findings: [
      {
        schema: 2,
        id: 'finding:5c1c0f2e9a7b4d31',
        lens: 'migrate',
        severity: 'critical',
        criterion: 'Backfills must be idempotent under retry or resume.',
        invariant: 'Re-running or resuming a backfill must not reapply an already-migrated row.',
        evidence_ids: ['observed:backfill-definition', 'inferred:double-apply'],
        affected_behavior: 'orders.currency backfill via the order_items join re-processes every row on retry, with no marker distinguishing migrated from unmigrated rows.',
        smallest_repair: 'Add a completion marker or WHERE currency IS NULL guard so a retried batch only touches unmigrated rows.',
        verification: 'Re-run the backfill twice against the same rehearsal dataset and confirm the second run updates zero rows.',
        status: 'open',
      },
    ],
    needs_specialist: [],
  }
}

process.stdout.write(`${JSON.stringify(result)}\n`)
