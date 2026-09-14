# Build

Verify the approval receipt, then implement the plan in an isolated branch or
worktree.

## Dispatch

Create one task brief per plan node. Give the implementer only the approved
intent, relevant definition sections, task, interfaces, project context,
lenses, authority, checks, and output contract.

Parallelize tasks only when their dependencies, interfaces, and write areas do
not overlap. Each implementer owns its bounded diff and task report. It runs
focused checks, self-reviews against the brief, and records unexpected choices.

Dispatch only through the runner. The host adapter must identify its actual
model class, fresh-context capability, enforced permission boundary, telemetry
quality, determinism/cache support, and cancellation timeout. Reserve calls,
tokens, context, wall time, repairs, and specialist escalations before launch.
Use `--inputs` for exact source or authoritative artifact references,
`--acceptance` for criteria, `--tools` and `--write` for the smallest effective
authority, and `--independent` when the result must be procedurally independent.
Do not omit an input merely to fit context; return `needs_input` when the
bounded packet cannot carry a required dependency.

On `needs_specialist`, Forge decides whether another call is justified. The
follow-up must name the parent dispatch so the runner can validate that the
specialty was requested and reject self or multi-hop cycles. Never copy an old
result to a new candidate. Exact retries are content-bound and recovery may
reconcile an already persisted result without repeating the host call.

The shipped Codex adapter is deliberately read-only. Use it for bounded
discovery, review, audit, or verification packets whose only tool is `read` and
whose write list is empty. It creates an ephemeral isolated workspace containing
only routed inputs and control artifacts, embeds the verified UTF-8 context in
the model request, disables the model's shell, requests schema-constrained
output, pins non-interactive approvals without widening the read-only sandbox,
and replaces model-authored usage with host JSONL telemetry. It rejects an
implementation packet that requests writes; adding a write-capable adapter
requires a host boundary that can enforce each allowed write root.

## Integrate

The coordinator or a dedicated integration context owns the combined candidate.
Reconcile interfaces, run interaction checks, and update the candidate revision.
Independently passing task reports do not establish integrated success.

Routine reversible decisions are recorded as rulings and continue. A material
change to intent, authority, risk, or accepted behavior returns to the relevant
authoritative artifact and may invalidate approval.
