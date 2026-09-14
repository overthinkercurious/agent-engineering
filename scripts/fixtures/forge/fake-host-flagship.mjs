#!/usr/bin/env node
// Deterministic fake execution host for the Beta payment duplicate-charge
// flagship. Each --mode below corresponds to one specialist dispatch in the
// flagship lifecycle exercised by scripts/test-flagship-payment.sh. Unlike
// scripts/fixtures/forge/fake-host.mjs (the generic contract-test fixture),
// every mode here returns evidence that is specific to the duplicate-charge
// payment scenario rather than generic filler, so the seven Phase 7 evidence
// dimensions (idempotency, concurrency, data repair, observability, rollout,
// rollback, customer-impact) can each be grepped for in a real specialist
// result.

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (name, fallback = '') => { const index = argv.indexOf(name); return index === -1 ? fallback : (argv[index + 1] ?? fallback) }
const mode = arg('--mode', 'flagship-probe-diagnosis')

if (argv.includes('--capabilities')) {
  const isolation = arg('--isolation', 'fresh_process')
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    adapter_id: arg('--adapter-id', `fake-${mode}`),
    model_id: 'fake-flagship-v1',
    model_class: arg('--model-class', 'smaller'),
    isolation,
    fresh_context: isolation === 'shared_context' ? 'unavailable' : 'available',
    per_dispatch_model_selection: 'available',
    usage_telemetry: 'available',
    tool_write_enforcement: arg('--permission-status', 'available'),
    cancellation_acknowledgement: 'available',
    observation_source: 'deterministic fake-host-flagship capability handshake',
  })}\n`)
  process.exit(0)
}

const packet = JSON.parse(readFileSync(arg('--packet'), 'utf8'))

const usage = {
  schema: 1,
  calls: 1,
  input_tokens: { value: 250, provenance: 'measured' },
  output_tokens: { value: 120, provenance: 'measured' },
  reasoning_tokens: { value: null, provenance: 'unavailable' },
  cached_tokens: { value: 0, provenance: 'measured' },
  charge_usd: { value: null, provenance: 'unavailable' },
  wall_time_ms: 8,
}

const base = (overrides) => ({
  schema: 2,
  run_id: packet.run_id,
  dispatch_id: packet.dispatch_id,
  specialist: packet.specialist,
  status: 'complete',
  outcome: 'Bounded specialist task completed.',
  summary: 'Used only the packet and bounded brief.',
  evidence: [],
  assumptions: [],
  unknowns: [],
  confidence: { level: 'high', basis: 'Deterministic fake-host-flagship fixture.' },
  diagnosis: null,
  artifact_changes: [],
  findings: [],
  needs_specialist: [],
  usage,
  ...overrides,
})

let result

switch (mode) {
  // Probe / diagnosis stage: establish the missing-idempotency-key cause of
  // the double charge before corrective definition can open.
  case 'flagship-probe-diagnosis': {
    result = base({
      outcome: 'The double-charge symptom is caused by chargeCustomer appending a ledger entry unconditionally.',
      summary: 'Traced two reported duplicate charges to the absence of an idempotency-key lookup before ledger append.',
      evidence: [
        { id: 'observed:duplicate-ledger-rows', class: 'OBSERVED', claim: 'Two ledger rows share the same idempotencyKey (idem-abc) and customerId (cust_1) for one logical charge request.' },
        { id: 'observed:no-idempotency-check', class: 'OBSERVED', claim: 'chargeCustomer in src/charge.mjs pushes a new charge unconditionally; no lookup against ledger by idempotencyKey exists before the push.' },
        { id: 'inferred:retry-and-concurrency-both-trigger', class: 'INFERRED', claim: 'Both a client/proxy retry of the same request and two concurrent requests for the same logical charge reach the unconditional push and each append a row.' },
      ],
      confidence: { level: 'high', basis: 'Direct code inspection plus a reproducing hidden-test failure on the seed.' },
      diagnosis: {
        symptom: 'A customer is charged twice for what should be one logical payment request.',
        observation_ids: ['observed:duplicate-ledger-rows', 'observed:no-idempotency-check'],
        hypotheses: [
          {
            id: 'H1',
            statement: 'chargeCustomer has no idempotency-key guard, so a retried or concurrent request appends a duplicate ledger row.',
            discriminating_test: 'Call chargeCustomer twice with the same idempotencyKey and assert the ledger length.',
            result: 'The ledger grows to 2 rows for one idempotencyKey; the seed hidden test fails exactly this way.',
            evidence_ids: ['observed:duplicate-ledger-rows', 'observed:no-idempotency-check'],
            disposition: 'supported',
          },
          {
            id: 'H2',
            statement: 'The duplicate is caused by the caller sending two different idempotency keys for the same logical request.',
            discriminating_test: 'Inspect the duplicate ledger rows for their idempotencyKey values.',
            result: 'Both duplicate rows carry the identical idempotencyKey value; the caller behavior is not the cause.',
            evidence_ids: ['observed:duplicate-ledger-rows'],
            disposition: 'disproved',
          },
        ],
        established_cause: 'chargeCustomer appends a new ledger row on every call with no check for a prior charge sharing the same idempotencyKey.',
        contributing_factors: ['Both retried requests and concurrent requests reach the same unconditional append path.'],
        remaining_uncertainty: [],
      },
    })
    break
  }

  // Vault (plan stage): the authorization/abuse angle on a payment-mutating
  // endpoint, per the vault.md worked example on idempotency-key reuse.
  case 'flagship-vault': {
    result = base({
      outcome: 'The charge endpoint requires a durable, caller-intent-scoped idempotency ledger; the current in-memory key comparison is an abuse surface, not just a correctness bug.',
      summary: 'Mapped the payment-mutating boundary and found the idempotency key is checked only in-process with no consumption ledger, so a replayed or forged key is not rejected.',
      evidence: [
        { id: 'observed:no-consumption-ledger', class: 'OBSERVED', claim: 'chargeCustomer treats idempotencyKey as a plain equality comparison with no durable consumption record scoped to the original caller/intent.' },
        { id: 'inferred:idempotency-key-abuse-surface', class: 'INFERRED', claim: 'Without a durable ledger, a captured idempotencyKey could be replayed by a different caller to attach to (or suppress) another customer\'s charge once persistence is added.' },
      ],
      confidence: { level: 'medium', basis: 'Static inspection of the charge handler; no live adversarial replay test executed in this fixture.' },
      findings: [
        {
          schema: 2,
          id: 'finding:1a2b3c4d5e6f7089',
          lens: 'threat',
          severity: 'medium',
          criterion: 'Idempotency keys must be scoped to the original caller/intent and consumed durably, not just compared in memory.',
          invariant: 'Two requests with the same idempotencyKey but different caller identity must not be treated as the same authorized charge.',
          evidence_ids: ['observed:no-consumption-ledger', 'inferred:idempotency-key-abuse-surface'],
          affected_behavior: 'chargeCustomer accepts any caller-supplied idempotencyKey as authoritative with no ownership check.',
          smallest_repair: 'Scope the idempotency lookup to (customerId, idempotencyKey) and require the durable ledger persistence Shift owns.',
          verification: 'Adversarial test: replay a known idempotencyKey under a different customerId and assert the charge is rejected or independently created, never merged.',
          status: 'open',
        },
      ],
    })
    break
  }

  // Shift (implementation/audit): data-repair of already-double-charged
  // ledger rows plus the durable idempotency ledger backing the fix.
  case 'flagship-shift': {
    result = base({
      outcome: 'The fix requires a durable idempotency ledger keyed on idempotencyKey, plus a bounded, idempotent backfill to repair rows already double-charged before the fix ships.',
      summary: 'Designed the compatibility-safe rollout of the idempotency check and a data-repair backfill for existing duplicate ledger rows.',
      evidence: [
        { id: 'observed:existing-duplicate-rows', class: 'OBSERVED', claim: 'The ledger already contains rows with duplicate (customerId, idempotencyKey) pairs recorded before the fix ships.' },
        { id: 'decided:expand-migrate-contract', class: 'DECIDED', claim: 'Add a unique index on (customerId, idempotencyKey) only after a backfill merges existing duplicate rows (expand: add index as non-unique observability; migrate: backfill merges/refunds duplicates; contract: enforce unique index) to avoid breaking in-flight rolling-deploy traffic.' },
        { id: 'inferred:repair-backfill-rehearsal-required', class: 'INFERRED', claim: 'A rehearsal run against representative disposable duplicate rows is required to confirm the backfill merges each duplicate pair into one charge and reverses the extra charge exactly once per pair; this rehearsal receipt is not yet runner-issued for this candidate.' },
      ],
      confidence: { level: 'high', basis: 'Backfill idempotency key is the ledger charge id itself (WHERE merged_at IS NULL guard), so a retried repair run cannot double-merge.' },
      findings: [
        {
          schema: 2,
          id: 'finding:2b3c4d5e6f708192',
          lens: 'integrity',
          severity: 'high',
          criterion: 'Every already-double-charged customer must be identified and repaired (refunded the extra charge) with a bounded, idempotent backfill.',
          invariant: 'A repair run, retried or resumed, must not re-refund or re-merge a row it already repaired.',
          evidence_ids: ['observed:existing-duplicate-rows', 'measured:repair-backfill-rehearsal'],
          affected_behavior: 'Customers double-charged before the idempotency fix ships remain double-charged unless a data repair runs.',
          smallest_repair: 'Batched backfill keyed on merged_at IS NULL that groups ledger rows by (customerId, idempotencyKey), keeps the earliest charge, marks extras merged_at, and issues one compensating refund per extra charge.',
          verification: 'receipt:duplicate-charge-repair-rehearsal plus a post-repair validation query asserting zero remaining duplicate (customerId, idempotencyKey) pairs.',
          status: 'open',
        },
      ],
    })
    break
  }

  // Signal (implementation/audit): concurrency, observability, rollout, and
  // rollback all owned here per signal.md's payment-retry worked example.
  case 'flagship-signal': {
    result = base({
      outcome: 'The charge path needs a request-scoped idempotency key (Shift/Core-implemented) plus a duplicate_charge_rate metric and alert, a staged rollout, and a defined rollback trigger; today none of the four exist.',
      summary: 'Modeled concurrent-retry failure behavior, required observability, and the rollout/rollback plan for the idempotency fix.',
      evidence: [
        { id: 'observed:concurrent-retry-path', class: 'OBSERVED', claim: 'chargeCustomer has no request-scoped idempotency key, so a client retry and a concurrent duplicate request both reach the unconditional ledger push.' },
        { id: 'inferred:duplicate-commit-under-concurrency', class: 'INFERRED', claim: 'Two callers invoking chargeCustomer concurrently with the same idempotencyKey each commit a charge before either observes the other\'s write, producing two committed charges for one logical request.' },
        { id: 'observed:no-duplicate-charge-metric', class: 'OBSERVED', claim: 'No existing metric, log line, or alert distinguishes a healthy single-charge outcome from a duplicate-charge outcome for this path.' },
      ],
      confidence: { level: 'high', basis: 'Concurrency hazard reasoned directly from the observed unguarded push; no load test executed in this fixture, so the concurrent-commit claim stays INFERRED, not MEASURED.' },
      findings: [
        {
          schema: 2,
          id: 'finding:3c4d5e6f70819293',
          lens: 'observe',
          severity: 'high',
          criterion: 'A duplicate-charge outcome must be observable to an operator before a customer reports it.',
          invariant: 'Every charge attempt increments a metric distinguishing new-charge, deduplicated-charge, and rejected outcomes.',
          evidence_ids: ['observed:no-duplicate-charge-metric'],
          affected_behavior: 'No duplicate_charge_rate metric or alert exists, so a regression in the idempotency guard fails silently.',
          smallest_repair: 'Emit a duplicate_charge_rate counter incremented whenever chargeCustomer returns an existing charge instead of creating one, with an alert at any sustained nonzero rate.',
          verification: 'Inspect the metric emission point and confirm an alert rule references duplicate_charge_rate.',
          status: 'open',
        },
        {
          schema: 2,
          id: 'finding:4d5e6f7081929394',
          lens: 'recover',
          severity: 'medium',
          criterion: 'A change to a payment-mutating path must have a staged rollout and a rollback trigger with an accountable operator.',
          invariant: 'If duplicate_charge_rate or refund volume rises after rollout, the change can be reverted before broad customer impact.',
          evidence_ids: ['observed:no-duplicate-charge-metric'],
          affected_behavior: 'No rollout stage or rollback trigger is currently defined for the idempotency-guard change.',
          smallest_repair: 'Roll out behind a percentage gate on the charge path; define the rollback trigger as duplicate_charge_rate or refund volume exceeding baseline, owned by the on-call payments engineer, reverting the gate to 0%.',
          verification: 'Confirm the rollout gate and rollback trigger are documented in implementation/integration.md and exercised in a staged rollout.',
          status: 'open',
        },
      ],
    })
    break
  }

  // Spine (plan/audit): the idempotency-key contract itself — what
  // guarantee the integration point needs and who is bound by it.
  case 'flagship-spine': {
    result = base({
      outcome: 'chargeCustomer is the sole integration point between callers and the ledger; it must guarantee that two invocations sharing an idempotencyKey resolve to exactly one committed charge, returned identically to both callers.',
      summary: 'Defined the idempotency and ordering guarantee chargeCustomer must provide as a stable contract for its callers.',
      evidence: [
        { id: 'observed:single-integration-point', class: 'OBSERVED', claim: 'chargeCustomer(ledger, request) is the only exported entry point callers use to record a charge; no other path writes to the ledger.' },
        { id: 'decided:idempotency-contract', class: 'DECIDED', claim: 'chargeCustomer must be idempotent on (customerId, idempotencyKey): repeated or concurrent calls with the same pair return the same charge object and never grow the ledger by more than one row per pair. This is an additive contract clarification, not a breaking signature change, so no version bump is required.' },
      ],
      confidence: { level: 'high', basis: 'chargeCustomer has one caller-facing signature and no external consumers beyond this fixture, so the contract change carries no cross-caller breaking risk.' },
    })
    break
  }

  // Core (implementation): implements the approved idempotency-key guard
  // exactly as Spine's contract and Shift's rollout sequencing specify.
  case 'flagship-core': {
    result = base({
      outcome: 'Implemented the idempotency-key guard in chargeCustomer exactly as Spine\'s contract requires: a lookup by (customerId, idempotencyKey) precedes every ledger append, returning the existing charge on a match.',
      summary: 'Added a ledger lookup before the append in src/charge.mjs; no caller was changed and the charge shape is unchanged.',
      evidence: [
        { id: 'observed:contract-clause-implemented', class: 'OBSERVED', claim: 'chargeCustomer now calls ledger.find matching both customerId and idempotencyKey before constructing a new charge, satisfying Spine\'s idempotency contract clause.' },
        { id: 'inferred:hidden-suite-should-pass', class: 'INFERRED', claim: 'The guard is written to satisfy all three hidden tests (retried key, concurrent key, distinct keys); the runner-executed regression at verification stage is the actual measured confirmation.' },
      ],
      confidence: { level: 'high', basis: 'The guard is written against the exact contract clause; verification stage will independently confirm it against the hidden suite.' },
      artifact_changes: [],
    })
    break
  }

  // Probe (verification, second/independent dispatch): confirms the
  // real runner-executed regression genuinely fails on seed / passes on fix.
  case 'flagship-probe-verify': {
    result = base({
      outcome: 'The runner-executed hidden regression genuinely fails on the seeded candidate and genuinely passes on the repaired candidate; the idempotency guard is independently verified.',
      summary: 'Confirmed candidate binding and receipt ownership before interpreting the regression result; did not accept the implementer\'s narrative claim.',
      evidence: [
        { id: 'observed:seed-fails-independently', class: 'OBSERVED', claim: 'Running hidden/duplicate-charge.test.mjs against the pre-fix candidate independently reproduces 2 failing tests (retry and concurrency cases).' },
        { id: 'receipt:duplicate-charge-regression', class: 'MEASURED', claim: 'The runner-executed command receipt confirms all three hidden tests pass on the current (repaired) candidate.' },
      ],
      confidence: { level: 'high', basis: 'Verification is bound to the current candidate identity and a runner-owned receipt, not a self-report.' },
    })
    break
  }

  // Judge (verification, final): integrated release verdict citing the
  // real receipt and every acceptance ID.
  case 'flagship-judge': {
    const receipt = arg('--cite-receipt')
    result = base({
      outcome: 'Ready for release: the idempotency guard is implemented and independently verified, the data-repair backfill and its rehearsal are recorded, and duplicate-charge observability plus a rollout/rollback trigger are defined. No unresolved critical or high finding blocks release.',
      summary: 'Traced every implemented acceptance ID to measured evidence or an independent Probe result on the current candidate before rendering the verdict.',
      evidence: [
        { id: 'observed:packet', class: 'OBSERVED', claim: 'The packet passed the host boundary with the current candidate identity.' },
        ...(receipt ? [{ id: `receipt:${receipt}`, class: 'MEASURED', claim: 'The runner-executed regression receipt confirms the hidden duplicate-charge suite passes on the current candidate.' }] : []),
      ],
      confidence: { level: 'high', basis: 'Every cited acceptance ID resolves to either the runner-owned receipt or the independent Probe verification result on this candidate.' },
    })
    break
  }

  default: {
    result = base({})
  }
}

process.stdout.write(`${JSON.stringify(result)}\n`)
