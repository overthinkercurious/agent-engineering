# Pipeline gaps and smaller-model efficiency audit

Reviewed: 2026-09-12  
Scope: current repository code, workflow references, tests, implementation plan,
the attached earlier audit, and the final inline review.

This is a source-level assessment. No comparative model executions or runtime
implementation changes were made for this review. The proposed release work is
in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Assessment of the final comments

The policy-consumption regression, nonexistent Bridge role, mixed timing in
Phase 0, movable threshold rule, insufficient repetitions, and thin Alpha
verification method all warrant changes. They are addressed in the plan.

Two qualifications matter. Policy is mentioned in workflow instructions:
[intake.md](../skills/ae-forge/references/stages/intake.md) tells the model to read
authority/routing, and the contract refers to project authority. The confirmed
gap is that the deterministic runner does not load or enforce those files.
Likewise, pinned repositories do not become invalid simply by aging; delaying
the release snapshot avoids unnecessary early benchmark authoring, while
committed development fixtures remain useful from Phase 1 onward.

Bridge was a plan-authoring error. The existing
[registry](../skills/ae-forge/references/registry.json) gives interface design to
Spine and service integration implementation to Core. Forge coordinates the
combined candidate. No additional integration specialist is required.

## Verified pipeline gaps

| Gap and code evidence | Effect on cost or accuracy | Planned work |
|---|---|---|
| [forge.mjs](../skills/ae-forge/scripts/forge.mjs), requireInitialized (line 78), checks policy paths only; routing (line 108) uses kind and supplied signals | Project maturity, authority, gates, and release policy cannot mechanically change execution | Policy contract/compiler in Phase 1; effective-policy consumers first in Phase 2; ae-init-to-Forge tests in Phase 3 |
| [policy.mjs](../skills/ae-init/scripts/policy.mjs), writeManaged (line 25), replaces the managed block; generated judgment fields contain TODO | Refresh can replace completed judgment inside that block; unresolved judgments have no executable semantics | Separate generated observations and user decisions; explicit defaults/conflicts and targeted refresh in Phases 1–3 |
| Registry assigns strongest to 9 of 12 specialists, but Forge never uses the model field | There is no implemented way to test or enforce economical model selection; metadata does not prove actual expensive calls occurred | Host capabilities and task-based model profiles in Phases 0a, 4, and 5 |
| Forge appends plan and final roles at line 118 regardless of request stage | Idea-only work can select delivery review; broad triggers can add unnecessary work | Stage-aware routing and required-coverage stopping rules in Phases 4–5 |
| Forge's command list (lines 317–323) has no specialist executor or result ingestion; dispatch/context isolation exists in prose | Reliability and independent review depend on the host model following instructions | Bounded briefs, host adapter, validated ingestion, explicit isolation capabilities in Phase 4 |
| Budget fields are initialized to zero at line 216; no reservation, reconciliation, or enforcement follows | Retries and coordination have no reliable cost accounting or stop condition | Policy budgets and usage provenance in Phase 2; host telemetry in Phase 4 |
| [specialist-result.schema.json](../skills/ae-forge/references/schemas/specialist-result.schema.json), lines 11–16, disagrees with the contract on escalation status and carries only string requests/evidence | Smaller models must guess output semantics; validators cannot check escalation details or evidence origin | One result grammar, structured escalation, runner-owned receipts in Phase 1 |
| [validate-forge.mjs](../scripts/validate-forge.mjs) checks schema declaration shape and hardcodes twelve specialists | Schema-shaped files can pass without validating instances; accidental roster additions conflict with validation | Shipped validators, malformed-instance fixtures, explicit ownership decisions in Phases 0a–1 |
| approvalCheck (line 158) compares receipt and manifest bases, without independently identifying the current candidate | Two matching stale values can coexist with changed code; reusing old evidence becomes unsafe | Base/candidate distinction, policy digests, dirty/new-file coverage and invalidation in Phase 2 |
| advance (line 257) mainly checks artifact presence; approve (line 274) mutates state separately | A persuasive model or an existing filename can appear to satisfy an incomplete gate | One transition authority, content/evidence validation, complete repair lifecycle in Phases 1–2 and 6 |
| [test-forge.sh](../scripts/test-forge.sh), lines 33–36, fills policies with the word complete | Existing acceptance tests do not prove parsing or consumption of real policy | Valid/invalid policy fixtures and paired project-policy behavior assertions in Phases 1–3 |
| Build/audit references request focused contexts and delta review, but the runner has no context compiler or dependency-aware reuse | Repeated repository reading, repeated reports, or unsafe reuse are left to model judgment | Retrieval packets, typed deltas, cache invalidation, and bounded re-review in Phases 4–6 |
| Probe/Judge describe acceptance mapping and weak-assertion inspection, but no current runner receipt validator proves those happened | Independent-looking reviews may repeat the same blind spot | Minimum behavioral method before Alpha, domain cases in Phase 7, external grading in Phase 9 |

## How to reduce dependence on frontier models

The practical hypothesis is that explicit procedures, relevant context, and
mechanical feedback can close part of the quality gap for bounded tasks. They
cannot supply missing domain knowledge or guarantee equal performance on novel
architecture, ambiguous product choices, or difficult cross-system failures.

Prioritize the following mechanisms in implementation order:

1. **Move bookkeeping into code.** Parse policy, collect facts, resolve routing
   constraints, check schemas, account for budgets, and verify receipts without
   asking a model to recreate them. A smaller model then has fewer procedural
   obligations to remember.
2. **Give each task enough context to succeed.** Supply the exact objective,
   source references, accepted behavior, invariants, permitted actions, and
   relevant project example. Provide bounded retrieval for dependencies instead
   of forcing repeated whole-repository exploration or hiding omitted context.
3. **Teach a procedure with examples.** A migration specialist needs a rehearsal,
   interruption/restart case, invariant checks, and recovery evidence. Add a
   worked example and a plausible incorrect example. Long persona descriptions
   do not create that expertise.
4. **Make feedback concrete.** A failed behavioral check or missing evidence ID
   should produce a focused repair brief. Do not ask a model to repeatedly
   reconsider the entire task without new evidence.
5. **Stop or escalate based on observable failure.** Missing evidence, repeated
   failure, conflicting findings, and project risk are routing inputs. A model's
   confidence score alone is not a reliable dispatch or completion criterion.
6. **Spend on independent verification.** A fresh reviewer needs behavioral
   checks and a rubric. Using the same smaller model in two contexts does not
   remove correlated reasoning errors; external benchmark tests assess both.
7. **Remove repeat work carefully.** Combine related lenses in the same suitable
   review, return compact deltas, and reuse evidence only when all relevant
   dependencies are unchanged. Mandatory release evidence still applies.

Focused tasks and examples are consistent with official guidance on improving
smaller-model results and reducing unnecessary model calls. Their effect on
this toolkit remains an empirical question. [OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)

## Execution profiles and honest comparisons

| Profile | Behavior | What a success can establish |
|---|---|---|
| Smaller model only | All Forge model work uses the selected smaller model; unresolved work stops within its budget | Performance with no frontier assistance on the tested task |
| Mixed models | Bounded work starts with a smaller model; evidence-based escalation uses a stronger model where authorized and available | Performance and total cost of that mixture; report escalation rate |
| Frontier reference | Forge uses the pinned stronger reference model for model work | Reference quality and cost under the same workflow and test conditions |

The portable default must work on a host that supports one model only. Per-role
switching, isolated contexts, structured outputs, and usage reporting are host
capabilities to detect, not features that a Markdown registry creates.

Provider prompt caching and result reuse are different mechanisms. Prompt
caching may reduce processing cost for repeated prefixes; it does not make a
previous result correct for changed inputs. Provider support, cache charges,
and hit rates must be observed. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

Do not optimize raw token count alone. Measure total model cost and user time
per accepted outcome, including failed attempts and repair. A cheaper call that
causes several retries may produce a more expensive accepted result.

## Example: configuration-precedence defect

For the Alpha example, an explicit request option loses to a stored default in
a shared helper. The proposed flow is:

~~~text
Request + project policies + relevant source
  → Forge resolves authority, risk, checks, and budget
  → focused diagnosis establishes the precedence error
  → bounded plan and independent acceptance design
  → existing user authorization is recorded against exact artifacts
  → smaller model changes the helper and relevant callers
  → runner executes candidate-bound checks
  → independent Probe evidence and Judge verdict
  → deliver, focused repair, or bounded unresolved result
~~~

The behavioral regression checks that an explicit option wins and that the
default still applies when the option is omitted. It must fail on the seeded
defect. If a caller still fails, the repair brief contains that failure and its
affected source. It does not automatically repeat discovery or every lens.

If the changed helper affects a sensitive boundary, diff reclassification and
project policy can require additional review. In smaller-model-only mode, an
unresolved risk stops the run. In mixed mode, Forge can request stronger review
within the remaining budget. Neither path silently removes the required check.

## What the release evaluation can establish

The plan uses three held-out scenarios, four configurations, and five repeats:
sixty scored executions. Plain-agent and Queen baselines use the same smaller
model as smaller-model Forge; frontier Forge isolates the remaining model gap.
Mixed-model comparisons and ablations do not fit this allowance and are deferred.

The relative success rules are declared before the pilot. Proposed targets are
20% less user time than the matched workflow baselines, at least 14/15 accepted
smaller-model deliveries, no more than one fewer acceptance than frontier Forge,
and 40% lower execution-model cost per accepted outcome. These are targets to
ratify, not measured savings or a promise that the thresholds will be met.

Five repeats are still a small sample. Report per-scenario failures, dispersion,
and uncertainty; do not claim general equivalence from similar medians. The
plan also replays fixed evidence through Judge to measure judgment instability
separately from different implementation outputs. Task-specific evaluations,
early development checks, and human calibration follow official evaluation
guidance. [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

Fine-tuning, a learned model router, broad multi-agent voting, and an embedding
service are not prerequisites. Evaluate simpler contracts, retrieval, examples,
and bounded control first. Add further infrastructure only for a measured
failure that the simpler workflow cannot address.
