# Product Requirements Document: Agent Engineering Development Kit

**Status:** Proposed for final review  
**Version:** 1.0  
**Date:** 12 September 2026  
**Initial delivery target:** Working preview and reviewed pull request

## 1. Executive summary

The Agent Engineering Development Kit is a project-scoped system for turning a rough product idea or software change into a researched, designed, implemented, audited, and verified result.

The kit is installed into a project and initialized once. Initialization builds a durable model of the product and repository: its purpose, users, maturity, architecture, commands, conventions, risks, quality expectations, and the authority delegated to agents. Every subsequent development run uses this model to assemble a task-specific team of specialists and apply the appropriate engineering lenses.

The user interacts with one development entry point. Its orchestrator creates a feature workspace, routes work to focused specialists, validates their outputs, synthesizes their conclusions, and presents one material approval package. After approval, it coordinates implementation, integration, specialist audits, repair, and verification without routine supervision.

The differentiator is the combination of:

1. A project-specific operating model generated from evidence.
2. Deep specialist workflows with exclusive ownership.
3. Lightweight lenses that constrain work without duplicating specialists.
4. Deterministic orchestration, validation, and recovery.
5. Structured artifacts that preserve intent and evidence.
6. Adaptive model and context allocation that spends tokens where judgment matters.

The MVP ends at a working preview and reviewed pull request. Deployment is a separate policy-controlled capability added after the core delivery loop demonstrates reliable behavior.

## 2. Problem

AI coding tools can implement isolated requests, but the user still carries much of the difficult work:

- Framing an idea into a valuable product direction.
- Researching alternatives and challenging assumptions.
- Choosing and coordinating specialists.
- Preserving context across sessions.
- Turning decisions into executable tasks.
- Evaluating whether passing tests represent production readiness.
- Recovering long-running work after interruption.

Existing kits commonly provide either a catalog of specialist prompts or a generic delivery workflow. Catalogs leave selection and coordination to the user. Generic workflows lack deep domain ownership and project-specific behavior. Large suites also create overlapping routing, contradictory instructions, unnecessary context cost, and reviews that leave little verifiable evidence.

The product must remove this coordination and reasoning burden while retaining the depth of a capable product and engineering team.

## 3. Product vision

After installing and initializing the kit, a user can submit a rough idea or change. The kit will:

1. Understand the project and its constraints.
2. Research and refine the opportunity when needed.
3. Generate and challenge alternatives.
4. Recommend a bounded product outcome.
5. Define the experience and technical direction.
6. Present material decisions for approval.
7. Assemble the appropriate implementation team.
8. Implement and integrate the change in isolation.
9. Audit it through applicable specialists.
10. Return a working preview, evidence, and reviewed pull request.

The user spends attention on product intent, material tradeoffs, and external authority. The kit owns routine coordination and reversible engineering decisions.

## 4. Target user

The initial user is a technically capable solo product builder or small-team lead who builds real applications, values deep specialist judgment, is willing to pay for useful independent reasoning, and expects work to be inspectable, recoverable, and reversible.

The MVP is optimized for one authorized operator and one repository. Team governance, enterprise administration, and unattended production releases are later concerns.

## 5. Goals

- Reduce user involvement from idea formation through reviewed delivery.
- Adapt development behavior to the actual product and repository.
- Preserve deep specialist work rather than generic role-play.
- Give every specialist exclusive ownership, a bounded workflow, and a defined artifact.
- Route specialists and lenses from project and task evidence.
- Make claims traceable to evidence and a repository revision.
- Make long-running work resumable without conversation memory.
- Use executable checks whenever an assertion can be settled mechanically.
- Remain cost-effective through focused contexts and adaptive model allocation.
- Produce production-ready features with explicit residual risks.

## 6. MVP non-goals

- Autonomous production deployment.
- Replacing real user evidence with model opinion.
- Proving product-market fit through desk research.
- Installing dozens of globally routed skills.
- Running every specialist on every task.
- Treating green commands or a model PASS as proof of overall correctness.
- Automatically rewriting global behavior from one run.
- Supporting every agent host before one end-to-end path is reliable.
- Building a general-purpose agent platform or management dashboard.

## 7. Product principles

### 7.1 Project scope is the differentiator

Project maturity, users, architecture, risk, release policy, and existing enforcement determine the workflow. A prototype and a critical production service must not receive the same team or gates.

### 7.2 One public owner per intent

Public skills have non-overlapping ownership. Development work enters through one orchestrator after project initialization.

### 7.3 Specialists own; lenses constrain

A specialist performs substantial work and owns an artifact. A lens adds cross-cutting constraints to another workflow. A lens cannot create a competing plan or silently take ownership.

### 7.4 Depth must leave evidence

Depth is demonstrated through research, measurements, working behavior, adversarial checks, and cited findings. Prompt length, agent count, and repeated reviews are not evidence of depth.

### 7.5 Deterministic checks have bounded meaning

An exit code proves that a recorded command succeeded under recorded conditions. It does not prove complete coverage, product value, or general correctness. Heuristics must remain labeled as heuristics.

### 7.6 Agents receive delegated authority

Agents may make reversible choices within approved intent and project policy. Material product changes, sensitive external effects, and actions beyond delegated authority require escalation.

### 7.7 Context is routed, not accumulated

The feature workspace is shared storage, but each specialist receives only the minimum complete context required for its work.

### 7.8 Improvement follows evaluation

Recurring failures may produce a better check, context route, specialist workflow, or project rule. A single result cannot silently become a global rule.

## 8. Product surface and ownership

The suite initially exposes two public skills:

| Skill | Exclusive ownership | Responsibility |
|---|---|---|
| ae-init | Indexing and configuring a project | Generate and refresh project knowledge, rules, and policies |
| ae-forge | Delivering a product or engineering outcome | Coordinate discovery, planning, implementation, audits, and verification |

Debugging, profiling, product research, security review, and release audit are modes or internal specialist workflows of ae-forge. They do not compete for global automatic routing.

Specialists live inside the ae-forge package and are dispatched by its runner. They remain full workflows, but their metadata is not loaded into every unrelated conversation.

One specialist never invokes another directly. If additional expertise is needed, it returns a structured request naming the specialty, reason, required inputs, and whether work is blocked. The runner validates the request, checks budget and routing policy, dispatches the specialist, and records the result. This prevents cycles, hidden context growth, and missing audit trails.

## 9. Four-layer architecture

### 9.1 Installed kit

The installed kit contains the entry points, orchestrator, specialist and lens definitions, artifact schemas, deterministic checks, registries, and templates. Every runtime dependency of a public skill lives inside that skill directory because the installer copies skill directories independently.

### 9.2 Project model

ae-init creates durable project context:

```text
.dev/
├── knowledge/
│   ├── 00-index.md
│   ├── 05-product.md
│   ├── 10-stack.md
│   ├── 20-commands.md
│   ├── 30-architecture.md
│   ├── 40-risks.md
│   └── 50-conventions.md
├── rules/
│   └── *.md
└── policy/
    ├── authority.yml
    ├── quality-gates.yml
    ├── routing.yml
    └── release.yml
```

Knowledge, rules, and policy are committed. Regenerable analysis is ignored.

### 9.3 Feature workspace

Each idea or change receives one stable workspace:

```text
.dev/work/<feature-id>/
├── manifest.yml
├── state.yml
├── intent.md
├── decisions.md
├── context/
├── evidence/
├── discovery/
├── design/
├── plan/
├── implementation/
├── reviews/
├── verification/
├── runs/
└── final-report.md
```

The feature is the unit of ownership; individual model sessions are execution attempts under runs. The workspace is ignored by Git and must contain no secrets.

### 9.4 Durable product output

Implementation, tests, and necessary product documentation are committed normally. The finishing stage promotes decisions needed by future work from the ignored workspace into project knowledge, enforceable rules, architecture records, or ordinary product documentation.

## 10. Project initialization requirements

In addition to current repository analysis, ae-init must capture:

- Product purpose, known users, and maturity.
- Build, test, lint, type-check, preview, and release commands.
- Architecture, boundaries, conventions, and enforcement.
- Known risk surfaces with detection confidence.
- Quality expectations and release target.
- Agent authority and prohibited external effects.
- Specialist routing defaults.

Every statement uses one evidence class:

| Class | Meaning |
|---|---|
| OBSERVED | Extracted from a named source at a named revision |
| MEASURED | Produced by a recorded command or experiment |
| INFERRED | Interpretation of observed evidence |
| ASSUMED | Working premise without sufficient evidence |
| UNKNOWN | Insufficient evidence |
| DECIDED | Explicit project or user decision |

Filename patterns, regular expressions, and coverage proxies remain observations with documented limitations. They must not be presented as incapable of error.

An authority policy can state that agents may choose internal implementation details, add tests, and refactor directly affected code, while requiring escalation for product behavior changes, paid services, weaker gates, data-retention changes, sensitive access, or production deployment.

## 11. End-to-end workflow

### 11.1 Intake

The orchestrator classifies the request as idea exploration, product definition, new feature, existing feature change, bug repair, refactoring, performance investigation, security review, release audit, or resume.

A clear bounded change can skip market discovery. A vague product idea cannot move directly to implementation.

### 11.2 Discovery

For an idea, the system performs problem framing, evidence gathering, alternative generation, experience exploration, feasibility investigation, independent challenge, and synthesis.

Valid recommendations include build, reduce scope, run an experiment, use an existing solution, defer, or stop.

### 11.3 Definition and planning

The selected direction becomes a product brief, experience specification, architecture spine when required, scope and non-goals, acceptance criteria, risk-to-evidence matrix, delegated authority, and implementation plan.

### 11.4 Independent plan review

A reviewer in a fresh context checks that the recommendation follows from evidence, requirements are coherent, acceptance criteria are observable, tasks have usable interfaces, risks have owners, and unresolved questions are handled explicitly.

### 11.5 Material approval

The user receives one compact package containing the recommended outcome, user and problem, key experience, evidence and assumptions, strongest alternative, product and technical direction, scope, risks, specialist coverage, budget, delegated authority, validation, and release target.

Approval is bound to content digests of the authoritative artifacts and repository base revision.

### 11.6 Implementation

The planner creates a dependency graph of bounded tasks. The runner dispatches tasks sequentially or in parallel when interfaces and file ownership permit it. Each implementer receives the approved intent, relevant knowledge, exact task, prior interfaces, selected lenses, delegated authority, checks, and output schema.

Implementation occurs in an isolated branch or worktree. An integration owner combines results and verifies interactions between independently completed tasks.

### 11.7 Audit, repair, and verification

Applicable specialists independently inspect the integrated candidate. Findings contain evidence, severity, affected acceptance criteria, and a proposed repair. Repair agents receive the focused finding and relevant diff rather than the full run history.

The runner executes project gates against the exact candidate revision. The release auditor evaluates intent alignment, user journeys, integrated behavior, specialist findings, commands, preview evidence, configuration, dependencies, operations, recovery, and residual risk.

The MVP completes with a working preview, reviewed diff, verification report, and pull request ready for the user to merge.

## 12. Specialist system

Each specialist declares:

- A unique ownership statement.
- Activation and exclusion signals.
- Required and optional inputs.
- A staged workflow.
- One authoritative output or a clearly advisory result.
- Decisions it may and may not make.
- Required evidence and blocker conditions.
- Context size, model class, and turn budget.
- Discovery, design, implementation, or audit modes where applicable.

The initial target roster is:

| Specialist | Exclusive ownership | Primary artifact |
|---|---|---|
| Opportunity researcher | Evidence about the opportunity and alternatives | Evidence report |
| Product strategist | Target outcome, value, scope, and success | Product brief |
| Product critic | Adversarial challenge of the recommendation | Challenge report |
| UX specialist | User journeys and experience acceptance | Experience specification |
| Software architect | Boundaries, interfaces, and material technical decisions | Architecture spine |
| Frontend specialist | Client architecture and implemented user experience | Frontend task report |
| Backend specialist | Service behavior, APIs, and server implementation | Backend task report |
| Data specialist | Schemas, integrity, migrations, and recovery | Migration report |
| Security specialist | Threats, authorization, privacy, and adversarial checks | Security report |
| Reliability specialist | Failure behavior, performance, observability, and recovery | Reliability report |
| Test architect | Independent acceptance and risk-based test design | Verification strategy |
| Release auditor | Integrated readiness judgment | Final audit |

This is a catalog, not a mandatory team. An MVP begins with fewer fully implemented specialists and expands based on evaluated needs.

A specialty may operate at discovery, design, implementation, and audit stages. The final audit runs in a fresh context and does not inherit the implementation conversation, even when it uses the same specialist definition.

## 13. Lens system

A lens declares its triggers, covered concerns, method constraints, required evidence, decisions it will not make, and the specialist to request when deeper work is needed.

Initial families are:

- Correctness: minimal change, contracts, testing, compatibility.
- Security: threats, secrets, authorization, tenancy, privacy.
- Data: integrity, migration safety, retention, concurrency.
- Interface: accessibility, user flow, responsiveness, visual proof.
- Reliability: failure modes, observability, rollback, performance.
- Craft: API boundaries, naming, dependency cost, documentation accuracy.

The runner selects three possible depths:

| Level | Treatment | Use |
|---|---|---|
| 1 | Inline lens | Familiar moderate concern |
| 2 | Independent specialist review | Significant concern needing separate judgment |
| 3 | Specialist-owned workflow | Central, high-risk, or unfamiliar concern |

There is no universal two-lens cap. A small default is selected for each stage, then escalated through risk, novelty, project policy, findings, and evaluation data. A feature needing too many simultaneous full workflows should be decomposed into smaller milestones.

Coverage is recorded as a risk-to-evidence matrix. For example, tenant isolation may require cross-tenant denial tests, keyboard operation may require a recorded journey and accessibility check, migration recovery may require rehearsal on representative data, and latency may require measurement under stated load. Recording that a lens ran is not sufficient evidence.

## 14. Routing and artifact ownership

Routing combines the request, project policy, repository signals, proposed behavior, completed diff, and specialist findings. The runner records why each specialist was selected. The completed diff is reclassified before final audit because implementation may introduce new risks.

Every authoritative artifact includes its schema version, feature and run identifiers, owner, input digests, repository revision, evidence classes, decisions, assumptions, unknowns, residual risks, and completion state.

Artifact ownership is exclusive:

| Artifact | Owner |
|---|---|
| Project model | ae-init |
| Feature state and manifest | Orchestrator |
| Evidence report | Opportunity researcher |
| Product brief | Product strategist |
| Challenge report | Product critic |
| Experience specification | UX specialist |
| Architecture spine | Software architect |
| Verification strategy | Test architect |
| Domain audit | Relevant specialist |
| Implementation task report | Assigned implementer |
| Final audit | Release auditor |
| Decision ledger | Orchestrator |

Other specialists submit findings or amendments. Only the owner changes the authoritative artifact, accepting, rejecting, or escalating proposed amendments with a recorded rationale.

An artifact is created only when a downstream stage consumes it or recovery requires it. Small changes use compact forms of the same schemas. Agents consume selected sections through the manifest instead of reading entire directories.

## 15. Orchestration, recovery, and authority

The runner is a deterministic state machine. Models perform judgment inside bounded stages; they do not control unvalidated stage transitions.

Primary states are:

```text
created → classified → discovery → definition → plan_review
→ awaiting_approval → approved → implementation → integration
→ audit → verification → ready_for_pr → complete
```

Additional states include repair, awaiting specialist, halted, blocked, and cancelled.

State records the feature identity, base and candidate commits, approved artifact digest, completed stages, current task and attempt, open findings and decisions, and token and time usage.

On resume, the runner checks schemas, artifact digests, commits, working-tree state, command receipts, unresolved findings, and changes to relevant project knowledge. It resumes the first incomplete valid state and never uses conversation memory as the sole completion record.

Within approved intent, the coordinator may resolve routine ambiguity, select patterns consistent with the repository, add supporting tests and documentation, adjust task boundaries without changing the product outcome, select models within budget, request specialists, and repair findings.

Escalation is required for material changes to the user outcome, destructive or irreversible work, sensitive external actions, unapproved spending or access, weaker gates, production deployment beyond policy, or a material unresolved finding after budget exhaustion.

Mechanical circuit breakers cover invalid artifacts, unauthorized paths or tools, approval-digest mismatch, revision mismatch, exhausted budgets, repeated repair fingerprints, failed required commands, and missing required specialist evidence. Diff size and file-list growth are review triggers because migrations, generated files, and lockfiles require interpretation.

## 16. Engineering quality model

Production readiness combines:

- Observable accepted user journeys, including relevant loading, empty, error, and recovery states.
- Passing project tests, types, lint, and builds.
- Architecture and convention alignment.
- Reviewed dependencies and public interfaces.
- Authorization, migration, failure, performance, and accessibility evidence where relevant.
- Evidence bound to the exact candidate revision.
- Explicit configuration, observability, recovery, residual risk, and unknowns.

The implementer may create tests, but completion cannot rely only on tests derived from its interpretation. Acceptance remains owned by the approved intent and independent verification strategy. Changes that weaken a gate receive independent review.

## 17. Cost and context strategy

The kit optimizes for value per accepted outcome rather than minimum token usage.

Use strongest models for product synthesis and criticism, architecture, sensitive specialist work, difficult debugging, and integrated final review. Use standard models for planning and integration. Use economical or standard models for clearly bounded implementation and focused repair. Use scripts for extraction, schema checks, state transitions, and executable gates.

Cost controls include:

- Cache deterministic analysis by repository revision.
- Reuse project knowledge rather than rereading the repository.
- Route only relevant documents and source files.
- Give implementers one task brief at a time.
- Review focused repair diffs.
- Use fresh contexts only where independence matters.
- Set specialist-specific token, turn, time, and retry budgets.
- Parallelize only independent work with stable interfaces.
- Record cost by stage and specialist.
- Measure unnecessary specialist activation.

The premium is spent on distinct judgment and owned evidence rather than duplicated general reviews.

## 18. Target package layout

```text
agent-engineering/
├── skills/
│   ├── ae-init/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   ├── references/
│   │   └── assets/
│   └── ae-forge/
│       ├── SKILL.md
│       ├── scripts/
│       │   ├── runner.mjs
│       │   ├── artifact-check.mjs
│       │   ├── scope-check.mjs
│       │   ├── gate-runner.mjs
│       │   └── doctor.sh
│       ├── references/
│       │   ├── contract.md
│       │   ├── registry.yml
│       │   ├── stages/
│       │   ├── specialists/
│       │   ├── lenses/
│       │   └── schemas/
│       └── assets/
├── docs/
└── scripts/
```

ae-forge requires a valid initialized project but does not invoke ae-init. A missing or stale prerequisite produces a structured result that directs the user or host to initialization. The first implementation targets one agent host. Other hosts are added after workflow contracts stabilize; tool-specific facts remain in data registries.

## 19. MVP scope and delivery plan

### Phase 1: Contracts and project policy

- Correct certainty language in ae-init.
- Add product context and evidence classes.
- Define authority, routing, quality, and release policies.
- Define specialist, lens, artifact, and result schemas.
- Extend validation for ownership and schema integrity.

Exit: initialization produces a valid, reviewable project operating model.

### Phase 2: Discovery and approval

- Add feature workspaces and the state machine.
- Implement intake and adaptive discovery.
- Add product strategy, criticism/research, UX, architecture, and plan review.
- Produce a digest-bound approval package.

Exit: a rough idea becomes a challenged and approved direction with recoverable state.

### Phase 3: Implementation and review

- Add task graphs, dispatch, and integration.
- Add frontend and backend implementation modes.
- Add test architecture, specialist audits, repair loops, and release audit.
- Produce a working preview and reviewed pull request.

Exit: one real vertical feature is delivered end to end after one material approval.

### Phase 4: Evaluation and specialist expansion

- Compare against a single-agent baseline, ae-init context alone, and one established workflow.
- Measure attention, quality, cost, and recovery.
- Expand data, security, reliability, and other specialist workflows from observed needs.

Exit: the adapted workflow improves accepted outcomes or user attention at an acceptable cost across repeated tasks.

### Phase 5: Release automation

- Add staging policy, environment checks, smoke tests, observability, and recovery verification.
- Exercise failed and interrupted releases.
- Consider production deployment only with explicit project authorization.

## 20. MVP acceptance criteria

The MVP is complete when:

1. Initialization creates valid knowledge, rules, authority, routing, quality, and release policy.
2. A rough idea produces evidence, alternatives, an adversarial challenge, a bounded recommendation, and an approval package.
3. Specialist selection is explained and follows policy.
4. No two specialists own the same authoritative output.
5. Specialists request additional expertise only through the runner.
6. Material changes invalidate digest-bound approval.
7. Implementation is isolated from the main branch and respects tool permissions.
8. Audit contexts do not inherit implementation reasoning.
9. Evidence is recorded against the exact candidate revision.
10. Repair loops halt or escalate at configured limits.
11. Interrupted runs resume without duplicating completed work.
12. The final report traces acceptance criteria to behavior and checks.
13. Durable discoveries can be promoted through reviewed updates.
14. The user receives a working preview and reviewed pull request.
15. The complete repository test suite passes.

## 21. Evaluation

The test set should cover a vague product idea, bounded existing feature, new UI journey, authorization change, migration, external integration, performance issue, resolvable ambiguity, proposal that should be rejected or reduced, and interrupted run.

The north-star metric is:

> User minutes of involvement per accepted, independently verified outcome.

Supporting measures include material interruptions, questions the coordinator could have resolved, accepted-feature rate, escaped defects, rework, repair cycles, unsupported claims, specialist findings that changed the outcome, recovery success, total model cost, wall time, context per specialist, and unnecessary specialist activation.

An appropriate halt is successful behavior when proceeding would exceed authority or conceal a material unknown. Needless halts on routine reversible decisions are usability failures.

## 22. Principal risks

| Risk | Mitigation |
|---|---|
| Specialist overlap | Exclusive ownership registry and validation |
| Excessive specialist activation | Adaptive routing, budgets, and activation evaluation |
| Shallow role-play | Owned workflows, evidence, and specialist-specific evaluations |
| Reviewer anchoring | Neutral briefs and fresh audit contexts |
| Artifact sprawl | Stable manifest, schemas, ownership, and consumption checks |
| Stale project knowledge | Revision binding and targeted refresh |
| Heuristic certainty | Evidence classes, caveats, diff reclassification, and review |
| Monolithic orchestrator | Runner owns control; specialists own judgment artifacts |
| Endless review loops | Finding fingerprints, focused repairs, budgets, and adjudication |
| Agents weaken checks | Approval ownership and independent gate-change review |
| Worktree treated as sandbox | Tool, path, credential, network, and spending policy |
| Useful decisions disappear | Durable knowledge promotion at completion |
| Premature compatibility work | Prove one host end to end before adapting others |

## 23. Decisions established by this PRD

1. Project-scoped adaptation is the primary differentiator.
2. ae-init and ae-forge are the initial public routing skills.
3. Specialists are full internal workflows dispatched by the runner.
4. Specialists never invoke one another directly.
5. Specialist ownership is exclusive and mechanically validated.
6. Lenses constrain workflows and may request specialist escalation.
7. Lens depth is adaptive; there is no fixed two-lens cap.
8. One feature workspace holds authoritative run state.
9. Operational artifacts are ignored; durable project knowledge is committed.
10. One material approval binds intent, approach, authority, and validation.
11. Agents make reversible decisions within delegated authority.
12. Independent audits are retained despite their token premium.
13. Engineering depth is measured through evidence and outcomes.
14. The MVP ships a verified pull request, not an unattended deployment.
15. Specialist expansion follows evaluation rather than roster size.

## 24. Final review decisions still required

These choices should be resolved before their implementation phase:

1. The first fully supported agent host.
2. Whether opportunity research and product criticism begin as one specialist with two modes or two separate specialists.
3. Whether ae-init creates authority policy interactively or generates conservative defaults for review.
4. Whether a successful MVP run automatically creates a draft pull request or stops with a PR-ready branch.
5. Default token and wall-clock budgets for small, medium, and large runs.

## 25. Success statement

The product succeeds when a user can initialize a repository, give one orchestrator a rough idea, review one clear recommendation, and later receive a working, independently audited, production-ready feature without coordinating the specialist team.

It must achieve this while preserving evidence, limiting authority, recovering from interruption, and spending additional model capacity only where specialist judgment improves the result.
