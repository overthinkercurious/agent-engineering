# Implementation contract v1

Status: Ratified for implementation  
Decision date: 2026-09-12  
Applies to: Phases 1–8 of `docs/IMPLEMENTATION-PLAN.md`  
Authority: repository-owner instruction to implement the plan phase by phase

This record closes Phase 0a. It freezes the inputs needed to implement the
first working slice without selecting Phase 9 evaluation identities early.
Changing a decision marked `P0A-*` requires a new contract version and a review
of every downstream schema, fixture, and receipt that cites this version.

## Owners

Owners here identify the repository component with decision authority. The
maintainers approve contract changes; deterministic runtime components enforce
them.

| Owner | Responsibility |
|---|---|
| Maintainers | Contract versions, hard caps, supported hosts, and release claims |
| Forge | Routing, lifecycle, approval, budgets, repair, and completion |
| ae-init | Generated project knowledge, rules, editable policy drafts, and confirmation state |
| Host adapter | Context isolation, model invocation, permissions, cancellation, and telemetry claims |
| Specialist owner | Judgment and authoritative artifacts inside the specialist's exclusive boundary |
| Probe | Diagnosis mode and independent verification design/execution in separate contexts |
| Judge | Final integrated delivery-readiness verdict |

## P0A-01 — Alpha host capabilities

**Owner:** Maintainers for support; the Codex host adapter for enforcement.

The first Alpha host is local Codex on a Git checkout. Codex subagent contexts
are the isolation mechanism, and the host's sandbox, permission profile, and
approval system remain the upper bound on tools and writes. Project policy can
only narrow that authority.

The adapter must report each capability as `available`, `unavailable`, or
`unknown`; configured intent is not proof that the host enforced it.

| Capability | Alpha behavior | Behavior when unavailable or unknown |
|---|---|---|
| Fresh context | Required for plan review, Probe verification, and Judge | Pause as `blocked`; an independence-required verdict is forbidden |
| Per-dispatch model selection | May select only a model the host exposes; omission inherits the run model | A single-model run remains valid; a mixed profile that requires switching halts |
| Usage telemetry | Record tokens and charges only when the host returns them | Mark each missing value `unavailable`; enforce call, elapsed-time, and context-size caps and make no cost claim |
| Tool/write enforcement | Host restrictions intersect the bounded brief's allowlists | Halt before the write or tool call if the intersection cannot be enforced |
| Cancellation acknowledgement | Required before a dispatch is recorded as cancelled | Keep the dispatch nonterminal and block resume rather than assuming cancellation |

The Alpha adapter targets one local process at a time. Parallel execution is an
optional optimization and is not required for correctness. Official Codex
documentation records subagent context separation and configurable per-agent
models, and separately documents sandbox and approval controls:

- <https://learn.chatgpt.com/docs/agent-configuration/subagents>
- <https://learn.chatgpt.com/docs/config-file/config-reference>

## P0A-02 — Runtime validation dialect

**Owner:** Forge for its artifacts; ae-init for its emitted policy sources.

Use a shipped, dependency-free runtime interpreter for **AE Schema Subset 1**.
Schemas retain the JSON Schema 2020-12 identifier for editor compatibility, but
the runtime deliberately supports only this vocabulary:

- annotations: `$schema`, `$id`, `title`, `description`, and `default`;
- references: `$ref` and `$defs`;
- composition: `allOf`, `anyOf`, `oneOf`, and `not`;
- object and array: `type`, `required`, `properties`,
  `additionalProperties`, `items`, `minItems`, `maxItems`, and `uniqueItems`;
- scalar: `const`, `enum`, `minLength`, `maxLength`, `pattern`, `minimum`,
  `maximum`, and `multipleOf`;
- formats: `date-time` only.

`type` may be one string or an array of unique type strings. A `$ref` may be an
internal JSON Pointer or a relative schema filename with an optional pointer.
The resolved path must remain inside the consuming skill's schema directory.
Remote references, references outside that directory, invalid pointer escapes,
reference cycles, unsupported formats, and every unsupported schema keyword
are errors. `$ref` has no validation siblings; annotation siblings are allowed.
Reference targets are loaded once by content digest, not by mutable global ID.

The same runtime module validates schema vocabulary at startup and instances at
every read boundary. Repository validation may add more diagnostics, but it
must invoke the shipped runtime rather than implement a competing contract.

## P0A-03 — Strict policy representation

**Owner:** ae-init for emitted syntax; Forge for parsing and compilation.

The four editable YAML policy files compile into one schema-validated
`effective-policy.json`. The parser is shipped inside `ae-forge` and has no
package dependencies. It implements **AE YAML Subset 1**:

- UTF-8 text, spaces for indentation, mappings, block sequences, and comments;
- plain mapping keys matching `[A-Za-z_][A-Za-z0-9_-]*`;
- JSON-style double-quoted strings, single-quoted strings with doubled quote
  escaping, restricted plain strings, booleans, null, and base-10 integers;
- empty flow collections `[]` and `{}` only;
- two-space indentation at every nesting level.

It rejects tabs, duplicate keys, implicit timestamps, floats, non-empty flow
collections, anchors, aliases, tags, directives, merge keys, block scalars,
multi-document input, and unknown escapes. A plain scalar containing YAML
indicator syntax must be quoted. Managed-marker and comment lines do not enter
the data model. Unsupported input fails with file, line, and column; it is never
parsed with regular expressions or silently coerced.

Each source policy is validated before compilation. The effective object is
then validated again and records the source path and SHA-256 digest for every
leaf, plus the reason for each default.

## P0A-04 — Policy precedence, defaults, and freshness

**Owner:** Forge.

Policy resolution is a bounded merge, not a last-writer-wins merge:

1. host and current user constraints set the non-expandable authority envelope;
2. allowlisted run overrides may narrow authority, lower budgets, add coverage,
   strengthen gates, or choose among release outputs already permitted;
3. project policy supplies project-specific choices inside that envelope;
4. kit defaults fill omitted nonmaterial fields.

The only run-override fields are `execution_tier`, `model_profile`,
`budget_tier`, `additional_specialists`, `additional_lenses`,
`additional_required_commands`, and `release_output`. Overrides cannot remove a
specialist, lens, command, approval, evidence rule, or release restriction.
Effective numeric limits are the minimum of all applicable limits. Conflicting
material fields fail closed.

Every effective leaf records `value`, `source`, `source_digest`, and
`default_reason`. Unresolved material authority, required journeys, required
gates, release behavior, or spending judgments block the run. Other unresolved
fields receive these conservative defaults with explicit provenance:

- no extra authority, credentials, network, spending, or deployment;
- no optional specialist exemption and no weakening of independent review;
- required evidence is fresh and bound to the candidate;
- release output is a PR-ready branch;
- unavailable telemetry remains unavailable rather than zero.

Forge recompiles policy on start, resume, before approval, before any
consequential tool/write action, before each dispatch, and before verdict or
completion. Any changed source digest invalidates the effective snapshot,
routing decision, context packet, and verdict. Renewed material approval is
required when the effective outcome, scope, authority, required coverage,
quality gate, release output, spending ceiling, base revision, or any approved
artifact changes. A knowledge change forces recompilation and rerouting; it
requires renewed approval only when it changes one of those approval-bound
values. Budget reductions pause over-budget work immediately. Increases never
take effect without current user authorization and cannot exceed hard caps.

## P0A-05 — Project identity and lifecycle

**Owner:** Forge.

Alpha and Beta accept only a Git worktree whose repository has a resolvable
root and valid `HEAD`. `base_commit` is the approved starting commit.
`candidate_identity` is the current commit plus a digest of relevant modified,
staged, and untracked files, tests, configuration, and dependencies. A missing
or unborn `HEAD` is a supported-scope error, not a null revision.

The lifecycle vocabulary is frozen at state schema version 2:

`created`, `classified`, `discovery`, `definition`, `plan_review`,
`awaiting_approval`, `approved`, `implementation`, `integration`, `audit`,
`verification`, `repair`, `awaiting_specialist`, `blocked`, `halted`,
`ready_for_pr`, `complete`, and `cancelled`.

Normal transitions are:

```text
created -> classified -> discovery? -> definition -> plan_review
-> awaiting_approval -> approved -> implementation -> integration
-> audit -> verification -> ready_for_pr -> complete

audit|verification -> repair -> implementation
```

After a repair, state flags require a fresh integration record, domain audit,
Probe verification, and Judge verdict before `ready_for_pr`. No transition can
skip those flags.

`awaiting_specialist`, `blocked`, and `halted` are pauses. Their record contains
the prior state, reason code, required resume action, attempt, and policy and
candidate digests. `awaiting_specialist` resumes after a requested validated
result is ingested; `blocked` resumes after named user or external input;
`halted` resumes only after the circuit-breaker condition is corrected and any
required user authority is recorded. Resume returns to the recorded prior
state and revalidates all prerequisites. `cancelled` and `complete` are
terminal. A new run may reference a cancelled run but never revives it.

State schema v1 migrates deterministically to v2 by adding empty pause,
operation, usage, and candidate fields. Unknown states or newer versions are
not guessed and block the run.

## P0A-06 — Specialist and lens contracts

**Owner:** Forge for the common protocol; each registry owner for its workflow.

Every specialist template must contain, in order:

1. identity, version, exclusive outcome, stages, triggers, and refusal signals;
2. required and optional typed inputs with digest references;
3. missing-input behavior and bounded retrieval rules;
4. allowed decisions, tools, writes, and explicit non-decisions;
5. an observable procedure with intermediate deliverables;
6. evidence requirements using `OBSERVED`, `MEASURED`, `INFERRED`, `ASSUMED`,
   `UNKNOWN`, and `DECIDED`;
7. domain failure modes, adversarial checks, and stop conditions;
8. one result envelope, quality rubric, and escalation rules;
9. one valid worked example, one misleading example, and one missing-input
   example, each versioned separately from held-out evaluation cases.

Every lens template contains identity/version, one narrow coverage set,
triggers and non-triggers, required inputs/evidence, question procedure,
finding taxonomy and severity, non-decisions, stop conditions, and exactly one
registered escalation target, plus the same three example classes.

Structured inputs are references by validated ID and digest; raw paths alone do
not establish identity. Missing required input produces `needs_input` or a
structured blocking specialist request, never invented content.

The common specialist result contains schema/version, run/dispatch/specialist
identity, outcome, summary, evidence references, assumptions, unknowns,
confidence basis, artifact changes, findings, usage, and
`needs_specialist`. Its status is `complete`, `needs_input`,
`needs_specialist`, `blocked`, or `failed`. Each specialist request contains
`specialty`, `reason`, `missing_inputs`, and `blocking`. Models may cite only
runner-issued evidence and command-receipt IDs for measured claims.

## P0A-07 — Ownership boundaries and diagnosis

**Owner:** Maintainers for registry ownership; Forge for dispatch separation.

- Scout owns sourced opportunity evidence and the description of alternatives.
  Scout does not recommend product scope.
- Rift owns adversarial challenge of Pulse's recommendation. Rift does not
  gather the authoritative evidence report or replace Pulse's decision.
- Spine owns integration design, boundaries, interfaces, and material technical
  decisions. Core owns service and integration implementation. Forge
  coordinates their handoff; Judge assesses the integrated result.
- Probe gains a bounded `diagnosis` mode that owns the tested causal account for
  an observed defect. Domain specialists may propose hypotheses and tests but
  do not declare the cross-domain root cause. A diagnosis dispatch and a later
  verification dispatch use fresh contexts, distinct dispatch IDs, and
  separate results so diagnosis cannot self-certify the repair.

No specialist is added, the roster remains twelve, and no specialist may invoke
another specialist. Requests return through `needs_specialist` to Forge.

## P0A-08 — Budgets and model profiles

**Owner:** Maintainers for hard caps; Forge for reservation and reconciliation;
project policy for selecting lower limits.

All counts include routing, retries, repair, verification, and failed calls.
Input/output limits count model tokens when telemetry exists. Packet limits are
estimated locally before dispatch. Wall time begins before policy load. Run
ceilings and stage ceilings are independent; reaching either stops dispatch.

### Default run ceilings

| Tier | Calls | Input tokens | Output tokens | Packet tokens per dispatch | Wall time | Repair attempts | Specialist escalations |
|---|---:|---:|---:|---:|---:|---:|---:|
| small | 12 | 240,000 | 48,000 | 40,000 | 60 min | 1 | 2 |
| medium | 24 | 600,000 | 120,000 | 80,000 | 180 min | 2 | 6 |
| large | 40 | 1,400,000 | 280,000 | 120,000 | 360 min | 3 | 10 |
| hard maximum | 48 | 1,800,000 | 360,000 | 160,000 | 480 min | 3 | 12 |

The default tier is `small` for a bounded bug/refactor and `medium` for other
delivery work. `large` requires project policy or current user authorization.

### Per-stage ceilings

Cells are `calls / input tokens / output tokens / max packet tokens / minutes`.
A repair row applies to each attempt but remains bounded by the run total.

| Stage group | Small | Medium | Large |
|---|---|---|---|
| Policy, intake, routing | 1 / 12k / 2k / 12k / 5 | 2 / 30k / 6k / 20k / 10 | 3 / 60k / 12k / 32k / 15 |
| Discovery | 2 / 36k / 8k / 20k / 10 | 5 / 120k / 24k / 48k / 35 | 8 / 280k / 56k / 96k / 75 |
| Definition, plan, review, approval | 3 / 60k / 12k / 32k / 15 | 5 / 140k / 28k / 64k / 40 | 8 / 320k / 64k / 120k / 80 |
| Implementation and integration | 2 / 60k / 12k / 40k / 20 | 5 / 160k / 32k / 80k / 55 | 9 / 380k / 76k / 120k / 120 |
| Audit, verification, and Judge | 4 / 72k / 14k / 40k / 20 | 7 / 180k / 36k / 80k / 50 | 12 / 360k / 72k / 120k / 100 |
| Each repair | 2 / 36k / 8k / 32k / 15 | 3 / 80k / 16k / 64k / 30 | 5 / 180k / 36k / 96k / 45 |

Two model profiles are supported:

- `smaller-model-only`: all model work uses the one selected smaller model.
  Capability shortfalls produce an unresolved result or halt; frontier calls
  are forbidden.
- `mixed`: starts on the selected smaller model and permits a stronger model
  only for a recorded capability failure, conflicting evidence, material
  unresolved risk, or contract failure after one local retry. Host capability,
  user/project authority, stage and run budgets, and the escalation count must
  all permit the call.

Registry model labels become hints only after Phase 5; they never override the
resolved profile. Actual model IDs remain a host observation and are pinned for
evaluation in Phase 0b.

The Phase 1–8 development ceiling is USD 250 in incremental metered model
charges, with at most USD 25 per model-backed development fixture run. Calls
covered only by a subscription or lacking price/usage telemetry are recorded
as `unavailable` and cannot support a cost claim. No paid development run may
start unless the adapter can reserve against the remaining metered ceiling.

## P0A-09 — Alpha configuration-precedence fixture

**Owner:** Probe for behavioral acceptance; Forge for lifecycle fixtures.

Phase 1 builds a committed synthetic Git repository at
`scripts/fixtures/forge/config-precedence/`. It contains a shared configuration
helper used by a direct caller and a wrapper caller. The seed defect merges a
stored default after an explicit request option, so the default incorrectly
wins. The representative bad expression is:

```js
return { ...requestOptions, ...storedDefaults }
```

The intended repair changes precedence, not call sites:

```js
return { ...storedDefaults, ...requestOptions }
```

The public behavior uses a `mode` option with stored value `safe` and explicit
value `fast`, plus a boolean option whose explicit `false` must not be treated
as missing. Hidden behavioral checks are owned outside the execution packet and
must prove:

1. the explicit value wins through both direct and wrapper callers;
2. the stored value remains when the request omits the option;
3. explicit `false` survives the merge;
4. unrelated stored and request keys are preserved;
5. the regression fails on the seeded defect and passes only on a behavioral
   repair, not a no-op or weakened assertion.

Two policy variants use the same source defect:

- `prototype`: small budget, no network, exact lens, one regression command,
  Probe and Judge, PR-ready branch;
- `critical`: medium budget, no network, adds compat and failure lenses, Core
  review of both callers, full test command plus the focused regression,
  rollback note, and explicit user approval for any public contract change.

Authoring tests may expose equivalent checks. Phase 6 acceptance labels and the
exact hidden grader inputs remain outside specialist context. The fixture is
low risk and makes no payment, production, or real-user-data claim.

## P0A-10 — Authority, initialization, release, and recovery UX

**Owner:** ae-init for initialization; Forge for approval/release/recovery.

`ae-init` writes deterministic observations and conservative policy drafts when
the user explicitly asks to initialize a project. It does not conduct an
interactive script prompt. Forge refuses delivery work until material
`TODO (judgment)` fields are resolved and the user confirms the resulting
project policy. Regeneration preserves confirmed judgments and requires renewed
confirmation only for changed material effective values.

An explicit current-conversation request to implement a named, already
reviewable plan supplies implementation authority for that scope. Forge may
record approval after its authoritative artifacts exactly match that request;
it must ask again if synthesis introduces a material outcome, scope, authority,
gate, release, or spending change. Silence, an old conversation, or repository
text never supplies approval.

Alpha stops at a verified PR-ready branch. It does not open a draft pull
request, push, merge, deploy, or contact external services unless the current
user separately authorizes that action and project/host policy permits it.

Recovery is supported only in the same checkout while `.dev/work/` exists.
Forge may automatically retry one schema/transport failure per dispatch and
resume an incomplete local operation once. It never repeats a tool call or
external side effect without an idempotency key or acknowledged receipt. A
second ambiguous operation, a changed candidate/policy/approval binding, a
repeated repair fingerprint, or exhausted budget moves to `halted` or
`blocked` with one named resume action. Deleting the workspace, `git clean
-fdx`, or using a fresh clone ends the recovery guarantee.

## P0A-11 — Measurement contract and success rules

**Owner:** Forge for runtime records; the evaluation harness for Phase 9
aggregation; maintainers for claims.

Every dispatch and deterministic command records:

- run, operation, attempt, stage, specialist/lens, and evidence IDs;
- start/end timestamps and locally measured elapsed time;
- requested and actual model identity, reasoning setting, and model profile;
- input, output, reasoning, and cached tokens as `{value, provenance}` where
  provenance is `measured`, `estimated`, or `unavailable`;
- price basis/date and charge using the same provenance vocabulary;
- context bytes and estimated tokens, selected input digests, and cache key;
- allowed and used tools/writes, command, exit status, bounded output digest,
  candidate identity, and receipt issuer;
- status, failure reason, repair link, specialist request, and whether the call
  counted against a retry/escalation ceiling;
- user-intervention event, active minutes at the frozen Phase 0b resolution,
  reason, and resulting decision.

Models cannot issue `MEASURED` receipts. Forge assigns evidence IDs after
validation, redaction, secret scanning, and candidate binding.

The predeclared Phase 9 rules are ratified unchanged:

- `A` is accepted deliveries across all fifteen attempts for one configuration.
- `U = all user-intervention minutes across the fifteen attempts / A`.
- `C = all execution-model charges across the fifteen attempts / A`.
- If `A = 0`, both `U` and `C` are infinite for gate decisions.
- Forge smaller-model-only must use at least 20% less `U` than each matched
  smaller-model baseline, subject only to the Phase 0b near-zero rule.
- It must accept at least 14/15 overall and at least 4/5 in each scenario, and
  be no more than one accepted run behind frontier Forge.
- It must use at least 40% less `C` than frontier Forge, including routing,
  review, failed attempts, retries, and repair.
- Any observed critical escape or authority bypass fails the relevant safety
  gate. Safe abstention is separate and is not an accepted delivery.
- Missing cost or inconclusive quality evidence cannot pass a cost or quality
  claim. The small sample supports only a provisional tested-scenario claim.

Phase 0b must freeze evaluation identities, pricing basis, human-time
resolution, the absolute near-zero tolerance, execution order, grader access,
and monetary cap before any scored pilot result is observed. Those values are
intentionally not selected here.

## P0A-12 — Minimum working slice

**Owner:** Forge end to end; Probe and Judge for independent evidence and
verdict.

The first working slice is exactly:

```text
validated policy load
-> bounded configuration-precedence task
-> digest- and base-bound approval
-> isolated implementation dispatch
-> runner-owned behavioral command receipt on the candidate
-> fresh-context Probe evidence
-> fresh-context Judge verdict
-> PR-ready or a guarded non-success state
```

No step may be replaced by prose claiming that it occurred. Phase 1 supplies
the contracts, validator, templates, transition tests, policy compiler, and
fixture. Phases 2–6 make each edge executable and close Alpha.

## Phase 0a gate record

Record ID: `phase-0a-contract-v1`  
Disposition: **PASS**

| Gate item | Evidence in this record |
|---|---|
| Twelve decisions have concrete answers and owners | `P0A-01` through `P0A-12` and the Owners table |
| Numeric run and per-stage budgets | `P0A-08` |
| Precise Alpha fixture and policy variants | `P0A-09` |
| Versioned success formulas and margins | `P0A-11` |
| Phase 1 dependencies resolved | Schema dialect, YAML subset, state v2, contracts, ownership, and profiles above |
| Evaluation identities deferred | `P0A-08` and `P0A-11` assign actual models and evaluation inputs to Phase 0b |

This is the documented manual acceptance record required by the repository
verification policy for the decision-only phase. Phase 1 must add automated
checks that the schemas, templates, states, policy fixtures, and validator stay
consistent with this contract.
