# Forge contract

Read this for every ae-forge run. It is the shared grammar for stages,
specialists, lenses, and the runner.

## Evidence

Classify claims as `OBSERVED`, `MEASURED`, `INFERRED`, `ASSUMED`, `UNKNOWN`, or
`DECIDED`.

- `OBSERVED` names its source and repository revision when applicable.
- `MEASURED` names the invocation, inputs, exit status, and candidate revision.
- `INFERRED` identifies the observations supporting the inference.
- `ASSUMED` states the cost of being wrong and how it could be tested.
- `UNKNOWN` is visible and never filled with plausible text.
- `DECIDED` names the decision owner and binding artifact.

A path and line location proves only that the location resolves. A command
receipt proves only that the recorded command ran with the recorded result.

## Ownership

Every authoritative artifact has one owner. Other specialists submit findings
or proposed amendments. The owner accepts, rejects, or escalates them with a
recorded rationale. The orchestrator owns state and the decision ledger; it
does not take ownership of specialist judgment artifacts.

## Authority

Within approved intent and project policy, the coordinator may resolve routine
ambiguity, select repository-consistent implementation patterns, add supporting
tests and documentation, adjust task boundaries without changing user behavior,
route more expertise, and repair findings.

Escalate material outcome changes, destructive or irreversible work, sensitive
external actions, new unapproved spending or access, weaker gates, production
deployment beyond policy, or material unresolved findings after budget limits.

## Specialist protocol

A specialist receives its workflow, exact inputs, one output path, authority,
budget, and completion schema. It reads only routed context. It may return
`complete`, `needs_input`, `needs_specialist`, `blocked`, or `failed` through
`specialist-result.schema.json` version 2.

`needs_specialist` names the requested specialist, evidence-based reason,
missing inputs, and whether the request blocks its own output. The status must
be `needs_specialist` whenever the request array is non-empty. The runner owns
the dispatch. Specialists never call each other.

Results separate outcome, evidence references, assumptions, unknowns,
confidence basis, artifact changes, findings, specialist requests, and usage.
`MEASURED` evidence cites a runner-issued `receipt:*` ID. A model cannot create
a command receipt or turn unavailable usage into zero.

## Lens protocol

A lens is a constraint on method. It supplies triggers, questions, constraints,
required evidence, non-decisions, and an escalation target. It cannot own a
standalone artifact or prescribe a specific fix.

## Findings

Every actionable finding states severity, criterion, violated invariant,
validated evidence IDs, affected behavior, smallest valid repair, and
verification. Its ID is the deterministic fingerprint defined by the shipped
validator from criterion, invariant, affected behavior, and sorted evidence
IDs. Exact duplicate IDs merge mechanically; conflicting content under one ID
is invalid. A model PASS without these checks is advisory.

Severities are:

- `critical`: unsafe to deliver; irreversible loss, privilege failure, or core
  intent is not met.
- `high`: important accepted behavior fails or a serious risk is unhandled.
- `medium`: production quality is materially reduced but the core flow works.
- `low`: bounded improvement that does not block the approved outcome.

## Completion

A run is ready for a pull request only when acceptance maps to evidence on the
exact candidate revision, required gates pass, integrated behavior is checked,
critical and high findings are resolved, residual risks are explicit, and the
release auditor recommends delivery.

## Runtime contracts

`scripts/validate.mjs` implements AE Schema Subset 1 and is the validation
authority inside the installed skill. It rejects unsupported schema keywords,
remote or escaping references, malformed instances, and semantic result/state
contradictions. `scripts/policy.mjs` parses AE YAML Subset 1, rejects duplicate
keys and unsupported YAML features, validates all four policy sources, and
emits a validated effective-policy snapshot with per-leaf provenance.

Lifecycle state schema version 2 adds `awaiting_specialist`, `blocked`,
`halted`, and terminal `cancelled`. A repair returns to implementation and must
pass integration, audit, and verification again. Paused states resume only to
their recorded prior state after prerequisites are revalidated.
