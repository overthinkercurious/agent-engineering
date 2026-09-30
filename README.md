# Agent Engineering

Agent Engineering is a personal development workflow for taking a software
request from investigation through implementation and verification. Invoke
`ae-forge` with the outcome you want. Forge selects only the expertise needed
for the change and coordinates six internal stage skills.

## Workflow

1. **Understand.** Inspect current source and project instructions. For an
   unexplained bug, reproduce and identify the cause before designing a fix.
2. **Plan.** Architect records the chosen approach, impact map, file-level
   steps, acceptance checks, and important alternatives. Named specialists
   supply constraints where the behavior warrants them.
3. **Review.** Plan Reviewer tests the plan against evidence. Deep work also
   uses Plan Challenger. Forge requests a user decision only when the run's
   risk or authority boundary requires it.
4. **Build.** Builder implements the accepted plan and records how the change
   works, what changed, deviations, and check results.
5. **Verify.** Specialists inspect the candidate where selected. Verifier
   checks the exact diff, acceptance evidence, tests, and residual risks.
   Findings can trigger at most two bounded repair cycles. Unresolved high or
   critical findings prevent completion.
6. **Complete.** Forge writes the outcome and verification summary into the
   same readable artifact used for handoffs, then moves it to `completed/`.

The workflow runs on the host coding agent. It does not install a second agent
runtime. Where isolated dispatch is unavailable, stages run sequentially in
one session and the final report says so.

## Local artifacts and repeat requests

Forge creates one local run per normalized request key. Repeating `start` for
the same request reuses its run, including after a session restart. A separate
request with the same title needs an explicit distinct ID. Repeating a phase
command has no effect. Completion and repair limits are enforced by the run
record.

At the first run in a project, Forge adds this rule to the root `.gitignore`:

```gitignore
# agent-engineering:generated:start
/.dev/
# agent-engineering:generated:end
```

**All generated artifacts are local and Git ignored.** Forge also removes
previously tracked Agent Engineering files from the Git index at run start,
while preserving their working copies. The `.gitignore` edit and index changes
are visible in the target project for review. No survey or project setup is
required before a request.

| Path | Purpose |
|---|---|
| `.dev/work/<id>/run.json` | Recovery ledger and phase state |
| `.dev/work/<id>/brief.md` | Frozen request and acceptance scope |
| `.dev/work/<id>/results/` | Append-only expert evidence |
| `.dev/work/<id>/scratch/` | Disposable intermediate notes, removed on completion |
| `.dev/runs/<id>.md` | Active readable handoff and implementation record |
| `.dev/completed/<id>.md` | Completed record with approach, change summary, and verification |
| `.dev/context/analysis.json` | Optional fresh repository reading map |

Result files remain with the ignored run record for recovery. Scratch files
are disposable and removed at successful completion. Cancelled
runs remain in `runs/` with their status; completion is the only automatic
archive transition. Forge does not delete user data to clean up a run.

## Installation

From the target project root, install all seven skills together:

```bash
npx skills@1.7.0 add overthinkercurious/agent-engineering --agent AGENT_ID --copy -y
```

Use `codex`, `claude-code`, `antigravity`, `gemini-cli`, `cursor`, `opencode`,
or `github-copilot` as `AGENT_ID` for the corresponding host. Codex and most
other hosts use `.agents/skills/`; Claude Code uses `.claude/skills/`. The
installed copy must contain `ae-forge` and its six stage siblings. After an
update to this source repository, refresh each project's installed copy.
If an older copied installation still contains `ae-surveyor`, remove that
retired skill from the target project's skills directory after confirming it
has no local edits.
Node.js is required for the bundled scripts. The stage skills are dispatch
targets and are not standalone ways to start work.

The Codex and Claude plugin manifests are also included. Plugin hooks provide
an additional edit check only when the host loads them; the run record remains
the source of truth. Hooks are not a filesystem sandbox.

## Engineering standards

- Use current source and test output as evidence. Repository analysis is a
  reading aid and cannot certify behavior.
- Record the approach in the Plan section and explain the actual
  implementation in the Implementation section. Each stage writes a file so
  the next stage can proceed without relying on conversation memory.
- Keep tests tied to changed behavior. A passing command without a meaningful
  assertion is insufficient verification.
- Preserve pre-existing changes and report limitations honestly. Same-session
  review is labeled as such.
- Keep domain facts in dated lenses and engineering method in role workflows.
  Add a lens only when it supplies concrete checks or constraints that a
  general role cannot provide.

See [the workflow contract](docs/workflow.md),
[the toolkit comparison](docs/comparison.md),
[Forge's skill contract](skills/ae-forge/SKILL.md), and
[the repository instructions](AGENTS.md) for contributor details.
