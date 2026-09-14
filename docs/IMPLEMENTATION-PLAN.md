# Agent Engineering Workflow Kit Implementation Plan

Status: Implementation in progress; Phases 0a–8 complete, Phase 0b active (2026-09-14)  
Release target: Alpha after Phase 6; Beta after Phase 9; Stable after Phase 10 and external validation

Phase 0a is closed by
[`docs/decisions/implementation-contract.md`](decisions/implementation-contract.md),
Phase 1 by
[`docs/decisions/phase-1-acceptance.md`](decisions/phase-1-acceptance.md), and
Phase 2 by
[`docs/decisions/phase-2-acceptance.md`](decisions/phase-2-acceptance.md).
Phase 3 is closed by
[`docs/decisions/phase-3-acceptance.md`](decisions/phase-3-acceptance.md).
Phase 4 is closed by
[`docs/decisions/phase-4-verification.md`](decisions/phase-4-verification.md),
with its real smaller-model/reference authoring comparison retained in
[`docs/development-traces/phase-4-model-trace-v3.json`](development-traces/phase-4-model-trace-v3.json).
Phase 5 is closed by
[`docs/decisions/phase-5-acceptance.md`](decisions/phase-5-acceptance.md).
Phase 6 is closed by
[`docs/decisions/phase-6-acceptance.md`](decisions/phase-6-acceptance.md) —
the Alpha configuration-precedence fixture now completes its full lifecycle
through the runner, marking the Alpha release gate reached.
Phase 7 is closed by
[`docs/decisions/phase-7-acceptance.md`](decisions/phase-7-acceptance.md) —
all twelve specialists are authored against the common template, and the
payment duplicate-charge Beta flagship passes with evidence across every
required dimension.
Phase 8 is closed by
[`docs/decisions/phase-8-acceptance.md`](decisions/phase-8-acceptance.md) —
all twelve lenses are authored against the common template with
non-overlapping coverage; capability packs remain deliberately deferred.
Phase 0b is next in the critical path; Phase 9 remains gated on it and later
gates remain unopened.

## Purpose

Close the gap between the kit's strong orchestration design and the depth,
reliability, and evidence discipline expected from a specialist workflow.

The supporting [pipeline audit](PIPELINE-GAPS-AND-MODEL-EFFICIENCY.md) records
verified code gaps, the smaller-model strategy, and its limits. This document
plans future implementation; it does not assert those mechanisms already work.

The phases are sequential release gates. Work may happen in parallel inside a
phase only when its dependencies are already satisfied. A later phase must not
be used to compensate for an incomplete earlier gate.

## Planning model

Relative sizes communicate risk and coordination, not calendar commitments:

- **S**: bounded change with one primary owner and limited integration.
- **M**: several related changes with contract or test updates.
- **L**: cross-cutting behavior requiring fixtures and integration tests.
- **XL**: release-level work spanning runtime, workflows, and evaluation.

Every phase includes dependencies, a smallest credible slice, an explicit test
home, and a falsifiable exit gate.

Phase 0a freezes implementation inputs. Phase 0b is a later checkpoint, after
Phase 8 and immediately before Phase 9, that freezes evaluation identities and
execution details. Phase 0a sets the success rules before pilot outcomes exist.
Templates are authored in Phase 1; Phase 0a decides their required contract.

## Governing decisions

- Keep ae-init and ae-forge as the only public routing surfaces.
- Keep specialists and lenses internal to Forge.
- Make Forge the sole authority for routing, state, approval, budgets, repair,
  revision binding, and completion.
- Deepen the existing specialist roster before adding broad new roles.
- Add explicit diagnosis ownership because no current specialist owns
  root-cause establishment. Prefer a uniquely owned mode within the existing
  roster; a new specialist requires an explicit ownership and validator change.
- Spine owns integration design and interfaces; Core owns service integration
  implementation. Forge coordinates integration and Judge assesses readiness.
  There is no Bridge specialist and none is added by this plan.
- Project policy must change runtime behavior. Load and resolve authority,
  routing, quality, release, and selected knowledge inputs before routing or
  reserving a budget, then revalidate them at consequential boundaries.
- Smaller-model reliability is a measured objective. Reduce ambiguity and
  unnecessary calls, preserve independent verification, and report performance
  using only smaller models separately from mixed-model escalation.
- Validate all machine-readable contracts at runtime, not only their source
  schema files during repository validation.
- Keep generated evidence and model judgment separate.
- Keep .dev/work/ ignored. Its durability promise is limited to process or
  session interruption in the same checkout; it does not survive deletion,
  git clean -fdx, or a fresh clone.
- Support Git repositories only for Alpha and Beta. Non-Git revision identity
  is a separate milestone and must not be simulated with null revisions.
- Use a low-risk configuration-precedence defect for Alpha acceptance.
- Use the payment duplicate-charge workflow as the Beta flagship after the
  relevant specialists have been deepened.
- Compare against a pinned, copied, and digested baseline rather than a mutable
  global Gemini skills directory.
- Do not copy hardcoded stacks, persona boilerplate, forced-finding behavior,
  or version-sensitive commands from the comparison workflow.

## Critical path

~~~text
Phase 0a: implementation decisions and predeclared success rules
  |
  v
Phase 1: contracts, validator, templates, and state vocabulary
  |
  v
Phase 2: policy consumption, authoritative runner, complete lifecycle
  |
  v
Phase 3: reliable project initialization
  |
  v
Phase 4: secure specialist execution
  |
  v
Phase 5: adaptive routing and diagnosis
  |
  v
Phase 6: independent verification and Alpha
  |
  v
Phase 7: specialist depth and Beta flagship
  |
  v
Phase 8: lenses and capability packs
  |
  v
Phase 0b: pin evaluation identities and execution protocol
  |
  v
Phase 9: bounded comparative evaluation and Beta
  |
  v
Phase 10: packaging, documentation, and Stable candidate
~~~

## Phase overview

| Phase | Size | Outcome | Release significance |
|---|---:|---|---|
| 0a | M | Implementation decisions, Alpha fixture, and success rules are frozen | Gates Phase 1 |
| 1 | L | Contracts, validation, templates, and states agree | Establishes a stable protocol |
| 2 | XL | Runner consumes policy and enforces the lifecycle | Makes project adaptation operational |
| 3 | M | Project knowledge and policy are reliable | Makes later routing project-specific |
| 4 | XL | Specialists run safely with bounded context | Makes orchestration real |
| 5 | L | Routing adapts to risk and diagnosis | Prevents shallow or excessive work |
| 6 | L | Probe and Judge independently verify delivery | Alpha gate |
| 7 | XL | Specialists demonstrate domain depth | Enables the flagship Beta case |
| 8 | L | Lenses and capability packs add focused scrutiny | Improves coverage without role sprawl |
| 0b | M | Evaluation repositories, baselines, models, and spending cap are pinned | Gates Phase 9 |
| 9 | XL | A bounded comparison proves value and cost | Beta gate |
| 10 | L | Packaging and release documentation are complete | Stable candidate |

## Phase 0a — Freeze implementation inputs and success rules

**Dependencies:** none  
**Size:** M

### Objective

Resolve the choices needed to build the first working slice. Separate these
from the evaluation snapshot and execution details that Phase 0b will freeze.

### Required decisions

1. **Host capabilities:** choose the Alpha host and document whether it can
   isolate contexts, select models per dispatch, report usage, and enforce
   tool/write permissions. Unsupported capabilities need explicit behavior.
2. **Validation:** select development-time generation of standalone validators,
   or a documented constrained schema dialect; freeze supported vocabulary and
   local reference resolution. Generated modules ship within each consuming
   skill; generation tooling stays development-only.
3. **Policy representation:** specify how the four editable YAML policies become
   a schema-validated effective-policy object without runtime package
   dependencies. Choose a shipped parser or a documented strict YAML subset;
   reject unsupported syntax and duplicate keys. No silent regex parsing.
4. **Policy precedence and freshness:** define explicit override fields,
   provenance, unresolved-judgment defaults, digest invalidation, and which
   changes require renewed approval. A project file cannot grant permissions
   beyond the host or user; budget overrides cannot silently exceed hard caps.
5. **Project identity and lifecycle:** Git repositories with a valid HEAD are
   required. Freeze current states plus missing pause/termination states and
   their resumption semantics; preserve existing state names or plan migration.
6. **Specialist/lens contract requirements:** agree the required sections,
   evidence vocabulary, structured inputs, missing-input handling, ownership,
   examples, and result schema. Author the actual templates in Phase 1.
7. **Ownership boundaries:** settle Scout/Rift, Spine/Core, and diagnosis
   ownership together. Retain Spine/Core for integration. Prefer a bounded
   diagnosis mode; if an additional role is justified, update the fixed-count
   validator intentionally and retain unique ownership.
8. **Budget and model profiles:** set initial run and per-stage ceilings for
   calls, input/output, context, time, repairs, and escalation. Define a smaller-
   model-only profile and an optional mixed-model profile; profiles are project
   policy inputs, not unconditional registry labels. Actual model IDs are
   selected from host availability and pinned for evaluation in Phase 0b.
9. **Alpha fixture:** define a committed synthetic shared-configuration defect,
   its intended fix, hidden behavioral checks, and prototype/critical project
   policy variants. Building the fixture is Phase 1 work.
10. **Authority and release UX:** settle initialization confirmation, existing
    user authorization, draft PR versus PR-ready branch, and recovery limits.
11. **Measurement contract:** record calls and evidence from the first slice;
    predeclare the rules below and instrument their fields before comparison.
12. **Minimum slice:** policy load → bounded task → approval → isolated execution
    → independent behavioral evidence → guarded verdict on one Alpha fixture.

### Predeclared success rules

These are proposed release targets, to ratify at Phase 0a closure before any
pilot outcomes. They are design choices, not predictions or measured results.

- Workflow value: at least 20% fewer user minutes per accepted outcome than
  each matched smaller-model baseline, with no observed critical-defect or
  authority regression.
- Smaller-model target: at least 14 of 15 delivery runs accepted, at least four
  of five in each scenario, and at most one fewer accepted result than the
  frontier-model Forge reference across the same fifteen cases.
- Cost target: at least 40% lower total measured model cost per accepted
  outcome than frontier-model Forge, including routing, review, repair, and
  failed attempts.
- Any observed critical escape or authority bypass fails the relevant safety
  gate. Safe abstention is recorded separately and earns no delivery success.
- If a comparator has effectively zero user time, use a predeclared absolute
  non-regression tolerance instead of a percentage; Phase 0b fixes that
  tolerance and measurement resolution before the pilot.
- Missing cost data or inconclusive quality evidence cannot count as a passed
  economy/performance claim. Small-sample thresholds support a provisional
  tested-scenario claim, not proof of statistical equivalence.

### Test home

- Planned decision record: docs/decisions/implementation-contract.md.
- Phase 1 adds decision/contract checks to scripts/validate-forge.mjs.
- Planned Alpha fixture: scripts/fixtures/forge/config-precedence/.
- Planned policy fixtures: scripts/fixtures/forge/policy/.
- These are test destinations, not claims that the files already exist.

### Smallest credible slice

Ratified choices with owners and numeric budget defaults, a precise Alpha
fixture specification, and the success rules above. No full templates or Beta
benchmark snapshots are required to close this checkpoint.

### Exit gate

All twelve decisions have concrete answers and owners; no Phase 1 dependency is
unresolved. Success formulas and margins are versioned before the pilot.
Evaluation identities remain explicitly assigned to Phase 0b.

## Phase 1 — Align contracts, validation, templates, and states

**Dependencies:** Phase 0a  
**Size:** L

### Objective

Create one coherent protocol shared by registry entries, specialist workflows,
lenses, generated evidence, the runner, and tests.

### Work

- Implement or generate the selected dependency-free runtime validator.
- Validate specialist results, findings, approval receipts, run state, budgets,
  and registry data at the boundary where each is read.
- Define schemas for project policies, effective policy, context packets,
  bounded task briefs, command receipts, and measured/estimated/unknown usage.
  Introduce the minimal policy compiler and synthetic Alpha fixture now, so
  Phase 2 can consume valid inputs before Phase 3 hardens ae-init broadly.
- Resolve local references and reject unsupported schema keywords explicitly.
- Define one result envelope with outcome, evidence, assumptions, unknowns,
  confidence, artifact changes, findings, and needs_specialist.
- Resolve the existing mismatch between the contract's needs_specialist status
  and the schema's string-array requests. Escalation entries carry specialty,
  reason, missing inputs, and blocking status. Cite evidence by validated IDs;
  the model cannot manufacture command receipts or measured usage.
- Define a canonical finding identity and deterministic deduplication rule.
- Preserve the current state vocabulary: created, classified, discovery,
  definition, plan_review, awaiting_approval, approved, implementation,
  integration, audit, verification, repair, ready_for_pr, and complete. Add
  awaiting_specialist, blocked, halted, and cancelled with explicit recovery
  edges. Define state-version migration if any name changes.
- Define allowed transitions and the artifacts required before each transition.
- Move the specialist and lens templates into this phase so later workflows
  cannot be authored against an implicit convention.
- Author compact procedures with observable intermediate deliverables, a valid
  worked example, a misleading example, and a missing-input example. Keep
  deeper reference material separate and route only what the task requires.
- Update validators so ownership, coverage, escalation targets, schemas, and
  templates cannot drift apart.

### Test home

- Schema/validator unit fixtures for valid and invalid payloads.
- Reference-resolution and unsupported-keyword tests.
- Registry-template consistency checks in repository validation.
- Transition-matrix fixtures covering every state and forbidden edge.
- Policy parser fixtures for duplicate keys, malformed/unknown fields, managed
  and user-owned content, incomplete judgments, and stale source evidence.
- Add the new assertions to scripts/validate-forge.mjs and scripts/test-forge.sh
  or focused Node tests invoked by npm test; keep fixtures inside scripts/fixtures.

### Smallest credible slice

One specialist and one lens validate successfully through the shipped runtime
validator; malformed results and illegal state transitions fail with actionable
errors.

### Exit gate

Every machine-readable artifact is accepted or rejected by the same shipped
contract used by Forge. All states and transitions are test-enumerated.

## Phase 2 — Consume project policy and make the runner authoritative

**Dependencies:** Phase 1  
**Size:** XL

### Objective

Ensure Forge's control claims are enforced by code instead of model convention.
Policy consumption is the first work item: budgeting and routing must depend on
the resolved project policy before subsequent controls are built around them.

### Work

- Load authority.yml, routing.yml, quality-gates.yml, release.yml, and the
  selected knowledge/rule artifacts using Phase 1 contracts. Produce a resolved
  effective-policy snapshot with source digests and reasons for defaults.
- Use authority policy for action boundaries, routing policy for required
  coverage and model/budget profiles, quality policy for executable gates and
  evidence, and release policy for allowed output and completion requirements.
  Selected knowledge supplies documented context and risk evidence; it does not
  independently grant authority.
- Apply documented precedence: host/user constraints bound project policy;
  permitted run overrides refine it; kit defaults fill omissions. Reject
  conflicts or unresolved material authority instead of treating TODO as policy.
- Revalidate policy and relevant knowledge on resume and before consequential
  actions. Changed effective policy invalidates dependent packets and verdicts;
  material authority, scope, or gate changes invalidate approval.
- Route every status mutation, including approval, repair, halt, cancellation,
  and completion, through one transition function.
- Correct transition prerequisites so artifacts are required before entering
  the state that consumes them.
- Reject non-Git projects with an explicit supported-scope message.
- Bind discovery, definition, approval, implementation, and verification to a
  concrete base commit and tracked artifact hashes.
- Distinguish the approved base from the implemented candidate. Identify the
  tested candidate by commit plus a digest of relevant uncommitted and new
  files, tests, configuration, and dependencies. Base/manifest agreement alone
  cannot establish that current evidence describes the current code.
- Invalidate approval after authoritative artifact or base-revision changes.
- Resolve initial budgets from effective policy before the first dispatch;
  Phase 0a defaults only fill omitted values.
- Persist dispatch counts, cycle depth, elapsed time, repair attempts, and
  evidence/context size.
- Reserve budget before dispatch and reconcile actual usage afterward. Count
  retries, verification, routing, and failed calls. When host telemetry is
  unavailable, expose estimates and enforce available call/time/size caps;
  never report unavailable tokens or money as zero.
- Define the repair lifecycle: finding selection, repair artifact, attempt
  increment, implementation change, mandatory re-audit, mandatory re-test, and
  return to Judge.
- Prevent a repair from moving directly to completion.
- Add idempotent resume behavior and re-check the working revision, approval
  receipt, required artifacts, budgets, and in-flight specialist status.
- Record why a run is awaiting_specialist, blocked, halted, or cancelled and
  what action can resume a nonterminal pause. Cancellation is terminal; a new
  run may explicitly reference it without reviving cancelled dispatches.
- Persist lifecycle updates atomically, reject conflicting active writers, and
  make retries idempotent. Resume the first incomplete valid operation without
  repeating an already acknowledged external side effect.

### Test home

- Runner state-machine unit tests.
- Approval mutation and stale-receipt tests.
- Budget and circuit-breaker tests.
- Repair/re-audit integration tests.
- Interrupted-run and resume fixtures.
- Non-Git rejection test.
- Policy-consumption tests in scripts/test-forge.sh: the same request under two
  policy variants produces different required coverage, authority decisions,
  budgets, commands, and release boundaries for the documented reasons.
- Independently mutate each of the four policies and a selected knowledge file;
  assert stale-state handling and deny a CLI override that weakens a hard gate.
- Candidate-change, missing-telemetry, concurrent-writer, and crash fixtures.

### Smallest credible slice

A Git-backed fixture reads project policy, demonstrates different required gates
under two policy variants, completes one repair loop, and resumes without
skipping a gate or treating stale evidence as current.

### Exit gate

No public command or internal function can bypass state, approval, budget,
revision, or re-audit enforcement. Each project policy has a tested runtime
consumer; existence-only checks cannot satisfy this gate.

## Phase 3 — Harden project initialization

**Dependencies:** Phase 2  
**Size:** M

### Objective

Give Forge dependable project knowledge, rules, and policy without overwriting
user-owned content.

### Work

- Complete staged detection, confidence reporting, and provenance.
- Make unknowns visible instead of filling them with plausible guesses.
- Verify target-specific instruction and skill locations from targets.yml.
- Preserve content outside managed markers and reject project-root escapes.
- Add conflict-aware policy generation and the Phase 0a confirmation UX.
- Connect ae-init output to the Phase 2 consumer end to end: authority, routing,
  quality, release, and selected knowledge must demonstrably affect a run.
- Preserve completed user judgments across regeneration. Separate generated
  observations from user decisions; field provenance and input digests allow
  targeted refresh without rewriting unrelated knowledge or running a model.
- Make repeated initialization idempotent and diagnose stale generated content.

### Test home

- Scaffold and artifact acceptance suites.
- Idempotence, path-escape, managed-marker, and target fixture tests.
- Unknown/conflict behavior fixtures.
- Full ae-init → Forge policy-consumption tests and regeneration tests that
  preserve custom judgments and expose changed source facts.

### Smallest credible slice

One supported host can initialize a fixture twice with identical managed output,
preserved user content, and visible unknowns.

### Exit gate

ae-init produces repeatable, attributable inputs that Forge demonstrably
consumes. Project adaptation survives initialization refresh without lost
judgments or stale effective policy.

## Phase 4 — Execute specialists safely

**Dependencies:** Phase 3  
**Size:** XL

### Objective

Turn registry selection into bounded, auditable specialist work.

### Work

- Dispatch specialists through Forge; specialists never dispatch one another.
- Make routing stage-scoped. Judge is eligible only for delivery verification,
  not idea or planning runs.
- Construct minimal context packets containing the request, stage, relevant
  project knowledge, authoritative artifacts, allowed tools, budget, and output
  contract.
- Implement a host execution adapter for dispatch, actual model identity,
  context isolation, cancellation, and telemetry. A native host with only one
  selectable model uses that model; it cannot claim hidden per-role switching.
  Missing isolation blocks an independence-required delivery verdict.
- Compile one bounded brief with acceptance IDs, exact source references,
  invariants, allowed writes/tools, a concrete procedure, and the next check.
  Select relevant source and project precedents mechanically where possible.
  Offer bounded retrieval for omitted dependencies; flag missing context instead
  of silently truncating away acceptance criteria or failure paths.
- Give models only the tools relevant to the current step. Enforce permissions
  through supported host/runner boundaries and report any unenforceable scope;
  prompt text alone is not a sandbox.
- Separate the stable workflow prefix from task-specific context to enable
  provider prompt caching where supported. Record real hits and charges;
  the workflow must remain correct when caching is unavailable.
- Reuse generated evidence only with a complete dependency key: source/test and
  configuration digests, tool versions, relevant environment, policy, workflow,
  and candidate identity. Default to rerunning external, nondeterministic, or
  incompletely described checks. Reuse never silently becomes fresh evidence.
- Use structured deltas and evidence references instead of repeated narrative
  reports. Batch independent extraction/checks; only split model work when
  bounded scope, ownership, or measured quality benefit justifies another call.
- Validate and ingest every result envelope before changing state.
- Convert needs_specialist into a Forge routing decision with cycle checks.
- Persist dispatch reason, inputs by digest, result, validation status, timing,
  and budget impact.
- Bound captured command output and evidence size.
- Redact common credential forms before persistence.
- Scan proposed artifacts and evidence for secrets; block persistence when a
  likely secret is present and report only location/type, never the value.
- Add a local workspace doctor explaining the durability boundary and detecting
  missing or inconsistent run state.
- Run an early bounded development fixture on the intended smaller model.
  Compare contract validity, evidence fidelity, context retrieval failures, and
  repeat attempts against a stronger reference before expanding specialist prose.
  Keep these authoring cases separate from Phase 9 held-out evaluation.

### Test home

- Routing-by-stage tests, including no Judge dispatch for idea-only work.
- Context minimization snapshots.
- Result-ingestion and needs_specialist cycle tests.
- Secret redaction/blocking fixtures using synthetic credentials.
- Evidence-size and local durability tests.
- Fake-host execution tests for model choice, isolation, permission boundaries,
  telemetry availability, and failure/resume handling.
- Context omission, tool filtering, cache-hit/miss/invalidation, and stale-result
  fixtures. Each optimization must preserve the same required evidence.
- A versioned smaller-model development trace under the Phase 0a development
  budget, with synthetic model/tool failures for deterministic regression tests.

### Smallest credible slice

One implementation specialist receives a minimal packet, returns a validated
result, and records bounded, secret-scanned evidence in a resumable local run.

### Exit gate

Every specialist invocation is attributable, schema-valid, budgeted,
stage-appropriate, and safe to persist. Required context remains accessible,
cached evidence cannot survive relevant changes, and host capabilities are
observed rather than assumed from registry labels.

## Phase 5 — Add adaptive rigor and diagnosis

**Dependencies:** Phase 4  
**Size:** L

### Objective

Spend specialist effort in proportion to risk while establishing causes before
prescribing fixes.

### Work

- Implement explicit light, standard, and deep execution tiers.
- Resolve tiers, required specialist coverage, and model profiles from effective
  project policy. Light work still retains approval and independent release
  verification when those are required by the user's requested outcome.
- Define deterministic tier inputs such as blast radius, irreversibility,
  security/data sensitivity, uncertainty, cross-system scope, and user override.
- Add the Phase 0a diagnosis owner using the specialist template.
- Require diagnosis to distinguish observations, hypotheses, tests,
  established cause, contributing factors, and remaining uncertainty.
- Allow safe escalation in rigor; record why the tier changed.
- Derive risk from actual affected behavior, interfaces, and completed diffs as
  well as explicit user signals. Filename matches are leads, not proof of risk
  or its absence. Reclassification can add coverage after implementation.
- Select the smallest evaluated model adequate for the task and host. Tie
  capability to tasks and evidence, not permanently to specialist names.
- Allow at most one local retry for a repairable output/contract failure by
  default. Repeated failure of the same check, missing essential evidence,
  conflicting independent findings, and material unresolved risk trigger a
  recorded escalation or halt within policy. Self-reported confidence alone
  cannot decide escalation or declare success.
- A smaller-model-only profile cannot invoke a frontier model. When it cannot
  establish correctness, it returns a bounded unresolved result. A mixed-model
  profile may escalate if host capability, authority, and budget permit; record
  and charge every escalation so mixed success is never labeled small-only.
- Stop dispatching when required coverage and evidence are satisfied. Avoid
  mandatory product debates for bounded fixes and repetitive lens review whose
  question has already been answered on the current candidate.
- Prevent word count or persona intensity from being used as a proxy for depth.

### Test home

- Tier-classification fixtures and override tests.
- Diagnosis fixtures with ambiguous symptoms and disproven hypotheses.
- Budget-escalation and cycle tests.
- Policy/profile routing table tests, actual-diff risk escalation, no-escalation
  small-only tests, repeated-failure stopping, and unnecessary-activation checks.

### Smallest credible slice

The same defect routes light when isolated and deep when it crosses a
security-sensitive boundary, with an evidence-backed explanation for both.

### Exit gate

Routing depth is predictable from recorded risk signals, and corrective work
cannot begin on a diagnosis-required request without a tested causal account.
An uncertainty-preserving halt is permitted when no cause can be established.
No profile weakens required evidence or hides a stronger-model escalation.

## Phase 6 — Complete independent verification and ship Alpha

**Dependencies:** Phase 5  
**Size:** L

### Objective

Prove a complete delivery workflow in which implementation cannot self-certify.

### Alpha fixture

Use a low-risk defect where an explicit request option is ignored because
configuration precedence is reversed in a shared helper used by multiple
callers. This exercises discovery, diagnosis, definition, approval, code
changes, integration, regression testing, repair, and final judgment without
depending on payment-domain specialist depth.

### Work

- Make Probe own independent test design and execution.
- Make Judge own the final verdict based on authoritative artifacts, Probe
  evidence, unresolved findings, revision identity, and acceptance criteria.
- Prevent the implementer from authoring the only completion evidence.
- Require acceptance-to-evidence mapping, runner-owned command receipts,
  candidate identity, missing/weak-assertion checks, and a regression that fails
  on the seeded defect and passes on the repair. Green exit codes alone cannot
  satisfy behavioral acceptance.
- Establish both procedural independence (separate owner/context) and this
  minimum verification method for Alpha. Broad domain adversarial techniques
  and calibrated review rubrics are deepened in Phase 7.
- Bound repair review to changed behavior plus affected dependencies, with
  fresh required candidate checks. Unknown impact requires broader re-review;
  an old PASS cannot be copied onto a changed candidate.
- Run the Alpha fixture in three modes: normal completion; approval-bound
  artifact mutation; and interruption followed by resume.
- Record the trace and convert every escaped defect into a regression test.
- Exercise the same request under the Alpha fixture's prototype and critical
  policy variants; assert that required gates and authority differ correctly.

### Test home

- Committed Alpha fixture and golden lifecycle assertions.
- Probe independence and Judge eligibility tests.
- Approval invalidation and resume acceptance tests.
- Weak/no-op assertion, fabricated receipt, stale candidate, and uncovered
  acceptance tests. Compare repeated Judge outcomes to an independently labeled
  fixture, not to an implementer's self-evaluation.

### Smallest credible slice

The Alpha fixture completes once with independent evidence and fails safely
when its approved artifact is changed.

### Exit gate

All three Alpha modes pass, no gate is bypassed, and a Judge verdict is
impossible without fresh independent evidence.

## Phase 7 — Deepen the specialists

**Dependencies:** Phase 6  
**Size:** XL

### Objective

Make specialists behave like bounded experts rather than role-flavored prompt
wrappers.

### Work

Refactor each specialist with the Phase 1 template:

- exclusive outcome and non-overlapping boundary;
- trigger and refusal conditions;
- required inputs and missing-input behavior;
- concrete inspection and reasoning procedure;
- deterministic tools or checks to prefer;
- evidence standards and traceability;
- domain-specific failure modes and adversarial questions;
- uncertainty and confidence calibration;
- deliverable structure and quality rubric;
- escalation criteria through needs_specialist;
- at least one positive, ambiguous, and negative fixture;
- short, tested examples that teach a procedure and its failure conditions to
  smaller models; version examples separately from held-out release cases;
- source provenance and freshness for technical references and a bounded path
  for requesting missing information rather than inventing an answer.

Deepen the highest-risk delivery roles first:

1. Vault for security and trust boundaries;
2. Shift for data change and migration safety;
3. Signal for observability and incident evidence;
4. Spine for integration contracts and Core for their implementation;
5. Probe and Judge for verification quality;
6. remaining discovery, planning, implementation, and documentation roles.

### Beta flagship

After Vault, Shift, Signal, Spine, Core, Probe, and Judge pass their fixtures, run
the duplicate-charge payment example. Require evidence across idempotency,
concurrency, data repair, observability, rollout, rollback, and customer-impact
boundaries.

### Test home

- Per-specialist contract fixtures.
- Cross-specialist handoff and deduplication tests.
- Payment flagship fixture and failure-injection assertions.
- Bounded smaller-model development checks per specialist: behavioral success,
  unsupported claims, correct escalation, and cost including repair. Deeper
  prose must earn its context cost through observable improvement.

### Smallest credible slice

Vault and Shift each demonstrate one correct refusal, one uncertainty-preserving
analysis, and one deliverable that satisfies independently labeled domain checks.
Comparative superiority is assessed in Phase 9 rather than assumed as an
authoring prerequisite.

### Exit gate

Every specialist meets the common contract, and the high-risk group completes
the payment flagship without invented evidence or ownership overlap.

## Phase 8 — Deepen lenses and add capability packs

**Dependencies:** Phase 7  
**Size:** L

### Objective

Add focused review depth without turning every concern into another broad
specialist.

### Work

- Refactor each lens with the Phase 1 lens template.
- Give every lens a narrow question set, evidence needs, finding taxonomy,
  severity guidance, stop conditions, and escalation target.
- Deduplicate equivalent findings deterministically.
- Apply related lenses within one appropriately isolated specialist review
  where coverage remains explicit. A lens is a method constraint and does not
  automatically require an additional model call or duplicate report.
- Distinguish matching finding IDs from semantic similarity. Merge only exact
  duplicates mechanically; keep conflicting evidence for adjudication.
- Add stack- or domain-specific capability packs only after core workflows
  remain portable without them.
- Keep capability facts out of global routing descriptions.

### Test home

- Lens coverage and escalation fixtures.
- Finding identity/deduplication tests.
- Capability-pack portability tests.
- Coverage-preservation checks for combined lenses and unchanged-input reuse;
  smaller-model fixtures with misleading but plausible answers.

### Smallest credible slice

One security lens and one data lens identify distinct, reproducible findings,
deduplicate repeats, and escalate to the correct specialist.

### Exit gate

Every lens has unique coverage, produces actionable evidence-backed findings,
and cannot silently expand into specialist ownership.

## Phase 0b — Freeze evaluation identities and execution details

**Dependencies:** Phase 8; success rules already ratified in Phase 0a  
**Size:** M

### Objective

Create a reproducible release comparison after the implementation exists,
without selecting success criteria to fit observed pilot results.

### Work

- Name the actual evaluation repositories or synthetic repositories, confirm
  permitted use, and pin starting commits. Keep held-out bug instances distinct
  from the Alpha and specialist authoring fixtures.
- Freeze three scenario families: configuration precedence; cross-service
  integration/authorization; and payment idempotency/data recovery. Cover
  migration, security, concurrency, and observability as labeled risks within
  these cases. A synthetic payment case cannot establish real-production safety.
- Snapshot Gemini Queen Core Contract v1 and its nine compared roles from the
  reviewed workflow, with provenance, file digests, and any necessary baseline
  adapter changes. Verify permission before redistributing the snapshot; a
  private local snapshot and distributable digest manifest are sufficient.
- Pin four configurations: plain agent on the smaller model; Queen on the same
  smaller model; Forge on that smaller model only; Forge on the frontier
  reference. Fix host/tool capabilities and total resource ceilings consistently
  for the matched comparisons, and record actual settings used.
- Freeze hidden acceptance tests, critical-failure labels, blinded scoring,
  counterbalanced execution order, environment reset, and failure accounting.
- Freeze the monetary ceiling, max-four-run unscored pilot, model-call/output/
  wall-time caps per run, and allowance for at most nine repeated Judge calls.
  The shared spending ceiling covers pilots, graders, failed calls, and scored
  runs. Development spending has its own Phase 0a cap and is reported separately.
- Freeze human-time measurement resolution and the absolute tolerance used for
  near-zero comparators. Preserve Phase 0a formulas and relative margins.
- The pilot may diagnose harness faults, estimate duration/scale, and check
  affordability. It cannot lower success margins, cherry-pick scenarios, or
  remove failures. A material harness change requires a versioned reset before
  scoring; do not silently add runs after seeing results.
- Do not require published repositories merely to satisfy the benchmark count:
  committed synthetic repositories are acceptable with their limits disclosed.

### Test home

- Planned manifest: docs/evaluation/release-manifest.json.
- Planned case data: scripts/fixtures/forge/evaluation/.
- Planned harness validation: scripts/test-evaluation.mjs, wired into npm test.
- Automated checks verify identities, cardinality, caps, frozen rules, and the
  separation of authoring examples from held-out cases.

### Smallest credible slice

A manifest with real repository/model identities, three held-out cases, four
runnable configurations, a monetary ceiling, and predeclared scoring rules.

### Exit gate

Every evaluation input is pinned and the harness can account for all planned
calls. Phase 9 cannot begin with unnamed repositories, unsupported model
switching, an unresolved cost ceiling, or success rules chosen from pilot scores.

## Phase 9 — Evaluate workflow value and smaller-model performance

**Dependencies:** Phase 0b, after Phase 8  
**Size:** XL

### Objective

Test two separate hypotheses: Forge improves a smaller model's delivery
workflow, and smaller-model Forge approaches the tested quality of frontier-
model Forge at materially lower total cost.

### Bounded comparison

| Configuration | Purpose | Scored executions |
|---|---|---:|
| Plain agent, smaller model | Matched workflow baseline | 15 |
| Pinned Queen, same smaller model | Established workflow baseline | 15 |
| Forge, same smaller model only | Workflow benefit and small-only quality | 15 |
| Forge, frontier reference | Remaining model-capability gap | 15 |
| Total | Three scenarios × four configurations × five repetitions | 60 |

This replaces the earlier 45-run comparison plus 15 ablations. The additional
model comparison uses the whole 60-run allowance; ablations and full mixed-model
comparisons require a separate predeclared budget. No frontier assistance is
permitted in the smaller-model execution arm. Independent benchmark grading is
separate from the executing workflow and is charged to evaluation overhead.

A scored execution means one end-to-end attempt, including its internal
specialist calls, repair, and allowed retries. Those calls still consume the
per-run and global caps; sixty executions is not a ceiling of sixty API calls.

### Procedure

- Run the full deterministic policy/lifecycle/receipt suite against Forge
  without spending comparative model executions on script-verifiable cases.
- Run the bounded pilot on separate authoring cases, then freeze the harness.
- Reset the environment to the pinned starting state before each attempt;
  counterbalance configuration order and disclose provider cache conditions.
- Preserve prompt, tool access, policy, model/settings, actual model identities,
  commit/candidate digests, outputs, measured usage, and evaluator decisions.
- Keep held-out tests and labels in a grader-controlled checkout outside the
  executing agent's permitted roots, including repository history. Omitting
  them from a context packet alone does not prevent benchmark leakage.
- Score behavior using hidden checks and independent human adjudication for
  unresolved judgment. Blind evaluators to the system name where practical.
  The production Judge's PASS is not the benchmark's ground truth.
- Include failed attempts, timeouts, repairs, needless halts, and escalations.
  Classify appropriate abstentions separately; they do not count as delivery.
- Stop at the execution, call/time, or monetary cap. Missing planned observations
  make the relevant comparison incomplete, not a successful release gate.

### Metrics and formulas

For each configuration, let A be the number of accepted deliveries:

- Primary: U = all user intervention minutes across all fifteen attempts / A.
  Include clarification, supervision, and user rework on failed attempts.
- Model economy: C = all execution-model charges across all fifteen attempts / A.
  Include orchestration, implementation, verification, retry, and repair.
- If A = 0, U and C are treated as infinite for acceptance decisions. Do not
  discard failures and average only easy successes.
- Track accepted count overall and per scenario, critical escapes, authority
  violations, unsupported claims, fresh-evidence coverage, and appropriate
  versus unnecessary abstentions.
- Report total and per-stage calls, input/output/reasoning tokens when available,
  cached usage and charges, wall time, repair attempts, context sizes, and
  unnecessary specialist activation. Label estimates and unavailable data.
- Separate benchmark grading/pilot spend from runtime C while including both in
  the full evaluation spending cap. Record the pricing basis and date; host
  subscription quotas cannot be silently converted into per-token dollars.

Report repeated-run variability: scenario-level success counts, median and
range/IQR of time and cost, repair variation, and finding/verdict disagreement.
Replay three fixed synthetic evidence packets through Judge three times each
(at most nine additional grader calls) to distinguish judgment instability from
differences in produced code. Compare to independently labeled outcomes;
consistent but wrong judgment is still failure.

Apply the Phase 0a targets unchanged: 20% lower U versus each matched smaller-
model baseline (or the predeclared near-zero rule), at least 14/15 accepted with
at least 4/5 per scenario, no more than one fewer acceptance than frontier Forge,
40% lower C than frontier Forge, and no observed critical/authority regression.

### Interpretation and claims

Five repeats provide a better view of variability than three, but fifteen
observations per configuration cannot demonstrate broad model equivalence.
Report raw results and uncertainty, including intervals where appropriate; do
not turn an insignificant difference into proof of equal capability.

A passing run supports only a provisional result for these models, host,
settings, and scenario families. Broader near-frontier claims require an
independently budgeted, powered study on more held-out repositories. A model
upgrade, prompt change, or major policy change invalidates the matching claim.

### Test home

- scripts/test-evaluation.mjs validates the versioned release manifest and
  bounded harness; scripts/fixtures/forge/evaluation/ holds hidden case data
  separated from packets supplied to agents.
- Scoring fixtures test failed-run accounting, A = 0, missing telemetry,
  mislabeled model escalation, and stopping rules.
- docs/evaluation/ records blinded scoring, adjudication, full budget use,
  dispersion, raw denominators, and claim limitations.

### Smallest credible slice

The bounded pilot and one complete scenario for all four configurations,
without changing the success rules or dropping failed attempts.

### Exit gate

All sixty scored executions complete within their caps and all four arms are
traceable. Frozen quality, workflow-value, and cost targets pass before the
smaller-model release claim is made. Otherwise record failed or inconclusive
criteria and the remaining gap; do not lower thresholds or relabel a mixed-
model run as smaller-model-only.

## Phase 10 — Package, document, and prepare Stable

**Dependencies:** Phase 9  
**Size:** L

### Objective

Ship a coherent kit whose installation, behavior, limitations, and recovery
model match the evaluated system.

### Work

- Align README, skill instructions, manifests, examples, and runtime behavior.
- Document supported hosts and Git-only scope prominently.
- Document local workspace durability and safe backup/export guidance without
  encouraging sensitive run-state commits.
- Document budgets, execution tiers, approval invalidation, repair, resume,
  cancellation, and secret handling.
- Publish a tested host/model capability matrix, including isolation, per-role
  model selection, measured usage, and caching support. Document the smaller-
  model-only and mixed-model profiles, observed escalation rates, and the tasks
  where evidence was insufficient to support a near-frontier claim.
- Align PRD cost guidance and registry model labels with evaluated task-based
  selection. The PRD's fixed strongest-model recommendations cannot remain a
  second, contradictory routing authority after the profile change.
- Verify that everything needed at runtime lives inside the installed skill
  directories.
- Run clean-install tests for each supported packaging surface.
- Publish evaluation method, limitations, and known failure modes.
- Keep non-Git support out of Stable unless a separate revision-identity design
  and acceptance suite are completed.

### Test home

- Clean-install and package-content tests.
- Documentation/runtime consistency checks.
- Full repository acceptance suite.
- External validation checklist on a repository not used for authoring.

### Smallest credible slice

A clean install on the first supported host completes the Alpha workflow using
only shipped files and the documented commands.

### Exit gate

Fresh-install acceptance passes, documentation matches observed behavior, and
one external repository completes the release checklist without unpublished
setup knowledge.

## Repository verification policy

Every exit-gate statement must map to a named automated test or a documented
manual acceptance record. A phase cannot close on prose review alone.

scripts/validate-forge.mjs owns registry/schema/template checks;
scripts/test-forge.sh and focused Node tests called by it own runtime and
fake-host fixtures. scripts/test-scaffold.sh and scripts/test-artifacts.sh own
initialization and generated-artifact behavior. Planned scripts/test-evaluation.mjs
owns benchmark-manifest, scoring, and spending-cap assertions. New checks must
be wired into npm test; a proposed test home does not imply an existing test.

npm test is the canonical repository gate. Individual commands may be used for
diagnosis, but they do not replace the complete suite before a commit that
touches skills or scripts.

On Git Bash for Windows, set TMPDIR to a native Windows path before running the
shell suites, as documented in AGENTS.md.

## Independent review disposition

| Finding | Disposition in this revision |
|---|---|
| Runtime schema validation was unspecified | Decided in Phase 0a; implemented and tested in Phase 1 |
| Non-Git revision identity was unsafe | Git-only Alpha/Beta scope; non-Git deferred |
| Specialist template arrived too late | Requirements in Phase 0a; actual authoring in Phase 1 |
| Payment example depended on later depth | Replaced for Alpha; retained as Beta flagship |
| Evaluation repositories were unnamed | Alpha specified in Phase 0a; held-out Beta identities pinned in Phase 0b |
| Approval bypassed the transition table | All mutation centralized in Phase 2 |
| Lifecycle lacked waiting and terminal states | Added in Phase 1 and enforced in Phase 2 |
| Repair could skip re-audit | Explicit repair lifecycle and attempt counter in Phase 2 |
| Budgets had no initial values | Phase 0a defaults; project-effective policy applied before dispatch |
| Evaluation was unbounded | 60 scored executions, bounded pilot/graders, per-call limits, shared spending ceiling |
| Comparison target was mutable | Pinned baseline snapshot with digests |
| Exit gates had no test ownership | Test home added to every phase |
| Secret-bearing evidence could be persisted | Bounded capture, redaction, scanning, and blocking in Phase 4 |
| Workspace durability was overstated | Same-checkout recovery boundary documented |
| Judge was routed into non-delivery work | Stage-scoped routing in Phase 4 |
| Strict sequencing hid parallel opportunities | Sequential gates retained; safe internal overlap stated |
| Phase effort was hard to estimate | Relative sizes and smallest credible slices added |
| Policy-consumption requirement regressed | Contracts in Phase 1; first Phase 2 work; Phase 3 end-to-end consumption gate |
| Bridge was not a registered specialist | Removed; Spine/Core retain their existing integration responsibilities |
| Phase 0 mixed early design with late evaluation setup | Split into Phase 0a before Phase 1 and Phase 0b before Phase 9 |
| Thresholds could be chosen to fit the pilot | Relative margins/formulas fixed in Phase 0a; execution details fixed before pilot |
| Three repeats and missing judgment variance weakened evaluation | Five repeats; fixed-evidence Judge replay; uncertainty and limited claims explicit |
| Alpha verification method was underspecified | Acceptance mapping, behavioral regression, weak-assertion and receipt checks in Phase 6 |
| Smaller-model quality and total cost were untested | Task/context/host mechanisms in Phases 1–5; matched four-arm comparison in Phase 9 |

## Overall definition of done

The workflow kit is ready for Stable consideration only when:

- deterministic controls enforce every claim made by the workflow prose;
- project policy changes routing, budgets, authority, required evidence, and
  release behavior through tested runtime consumers;
- schema-invalid, stale, secret-bearing, over-budget, and out-of-order work
  fails safely;
- approval binds content and revision identity;
- repair always returns through independent testing and judgment;
- specialists and lenses demonstrate depth on committed positive, ambiguous,
  and negative fixtures;
- the bounded comparison meets its frozen quality and cost thresholds;
- smaller-model claims identify actual models, tasks, repeated-run variability,
  measured end-to-end cost, and any frontier assistance;
- fresh installation uses only shipped runtime files; and
- documentation states supported scope and durability limits without ambiguity.
