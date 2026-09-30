# Forge workflow contract

`ae-forge` is the only entry point. This document explains the lifecycle;
`skills/ae-forge/scripts/forge.mjs` and `references/team.json` are the
executable sources for allowed transitions and team selection.

## Run identity and state

A run records a normalized request key and a scope signature covering the
request, routing inputs, and approval decision. An active run with that scope
is reused. A completed run is referenced only when its recorded inspected
source fingerprint still matches; changed source or scope creates a numbered
run. An explicit ID selects a run with the same scope. `--new --id
<distinct-id>` starts intentionally separate work. Existing files are reused
on retry, never reset. State the full behavior in the title, since omitted
requirements cannot be detected by the signature. Analyzer exclusions limit
what the source fingerprint can prove.

| State | Run phases | Artifact | Exit condition |
|---|---|---|---|
| Draft | `understand`, `plan` | `.dev/runs/<id>.md` | Reviewed plan and required constraints |
| Active | `approval`, `build`, `repair` | Same document | Candidate ready for independent review |
| Review | `verify` | Same document | Current candidate passes or produces a bounded finding |
| Archived | `done` | `.dev/completed/<id>.md` | Summary and verification written, blockers resolved |
| Blocked | `blocked` | Active document retained | Missing decision or evidence is supplied |
| Cancelled | `cancelled` | Active document retained | Terminal; no implied success |

`phase` is retry safe: entering the current phase again is a no-op. A new
Build or Repair candidate advances the revision once. At most two Repair
entries are allowed; after the second failed candidate, the current run
cannot enter another Build or Repair. A changed approach starts a new scoped
run. `finish` is retry safe for the same recorded outcome.

## Evidence and ownership

The brief freezes requested behavior and acceptance scope. The Plan section
holds the chosen approach, owning boundary, decisions, impact map, and checks.
Builder's Implementation section records how the actual change works, the
files changed, deviations, and test evidence. Verifier's section records the
verdict, rerun gates, acceptance evidence, and residual risk. Completion adds
the outcome and verification summary to Summary. A missing or stale current
Builder or Verifier section blocks completion.

Each stage writes a new result file under `.dev/work/<id>/results/`. Forge
records its path and digest in the ledger. Recorded results are immutable;
later passes get new names. The dispatch packet is run ID, contract, phase,
revision, role, scope, brief and artifact paths, latest relevant result paths,
attached lenses, and the exact candidate baseline. The next stage reads the
files and current source itself. A conversation summary is never the only
handoff.

Plan Reviewer checks the design against current source and specialist
constraints. Deep design risk also selects Plan Challenger. Builder is the
only role that edits application code. Candidate specialists inspect their
own boundaries before Verifier checks the exact diff and reruns relevant
project gates. Entering Verify freezes a candidate digest; a source change
during review invalidates its result. `same-session` review is reported honestly when the host did
not provide isolation. Critical or high candidate findings block completion.
Deep review adds Challenger. User approval is required only for an unresolved
material choice or authority boundary, recorded at start with
`--approval-required --approval-reason`.

## Artifact policy

At run start Forge appends a managed `/.dev/` rule to the project root
`.gitignore`. It removes previously tracked kit artifacts from the Git index
without deleting their working copies. If that removal would discard staged
content, start stops and asks for the index state to be resolved. The analyzer
also writes only under the same ignored tree.

Successful completion moves the readable document to `completed/` and
removes only `.dev/work/<id>/scratch/`. Result files and the ledger remain
local for recovery and audit. Cancellation keeps its record. Forge never
prunes user files or source code as part of artifact cleanup.

## Migration from the previous kit

Surveyor is retired. A new run needs no project survey. Old `.dev/knowledge/`
and `.dev/rules/` files are treated as generated kit output and untracked at
the next start, while their local copies remain available. Prior runs can be
read or resumed under their recorded contract; a run that predates a required
plan or repair approval returns to planning rather than inheriting authority
from a historic review.

Copied installations are outside this source repository. After upgrading
one, remove the old `ae-surveyor` skill directory if it is still present and
has no local edits, so the retired entry point does not remain visible.
