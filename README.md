# Agent Engineering

Describe a software outcome to `ae-forge`. Forge inspects the project,
clarifies intended behavior, researches uncertainty and presents an approach
with meaningful alternatives before application edits. After your decision,
it implements and checks small working slices, then verifies the result.

The kit is a portable workflow over your coding agent, not another runtime.
One entry point coordinates six internal methods: investigate, plan, review
the plan, build, verify and audit. Domain lenses add focused checks without
an extra persona for every subject.

## What you see

Each run has **one readable ticket** showing:

- Status, recorded current owner and last update.
- What is happening now, concrete progress, blockers and next action.
- The chosen approach, alternatives and your decision.
- Small work items, completion criteria and links to original evidence.
- The verified outcome and remaining limits when complete.

The ticket is generated from accepted records; detailed worker reports stay
behind evidence links. A recorded assignment is not a live worker heartbeat.

## Workflow

1. **Discover.** Inspect source and relevant instructions before asking focused
   requirement questions. Reconcile consequential document claims with current
   source and the identified running build.
2. **Research and plan.** Resolve actual uncertainty, choose the simplest
   adequate approach and explain real alternatives. Plan small vertical slices
   with behavior and checks; use risk-appropriate technical review.
3. **Review the approach.** By default, Forge waits for your approval before
   application edits. You can question or revise it. Explicit authorization to
   proceed autonomously, or earlier approval of the same approach, is reused.
4. **Build and check.** Implement one complete behavior at a time. Exercise
   rendered UI early when relevant. Material changes return to planning.
5. **Verify.** Inspect the exact integrated candidate, tests and relevant
   runtime evidence. At most two bounded repair cycles reuse the accepted
   approach; unresolved high/critical candidate findings block completion.
6. **Complete.** Move the same ticket to completed with verification and limits.

Audit, plan, diagnosis and candidate-review requests have read-only paths.
An emulator audit verifies actual tool access and accounts for requested
screens and states. A supported audit may finish while reporting serious
application defects; it cannot silently start fixing them.

Native host delegation and permissions are preferred. When separate review
contexts are unavailable, methods run sequentially and report same-session
review honestly. Hooks are optional configured edit checks, not a sandbox.

## Installation

Install all seven skills together from the target project root:

```bash
npx skills@1.7.0 add overthinkercurious/agent-engineering --agent AGENT_ID --copy -y
```

Use your host's agent ID, such as `codex`, `claude-code`, `antigravity`,
`gemini-cli`, `cursor`, `opencode` or `github-copilot`.
Node.js is required. Keep `ae-forge` alongside its six stage siblings.
Stage skills are internal dispatch targets; start requests with Forge.
Refresh installed project copies after updating this source repository.

To try an unpublished local checkout, use its absolute path as the source
from the target project root ([supported source formats](https://github.com/vercel-labs/skills#source-formats)):

```bash
npx skills@1.7.0 add "<absolute-path-to-this-checkout>" --agent AGENT_ID --copy -y
```

Codex and Claude plugin manifests are included. Hooks load only where the host
supports and loads them; shell writes and subagent tools may bypass them.

## Local records and recovery

All generated artifacts stay inside the target project's ignored `.dev/`.
Forge adds `/.dev/` to the root `.gitignore` and untracks previously tracked
kit artifacts while preserving their working copies.

| Path | Purpose |
|---|---|
| `.dev/runs/<id>.md` | Generated active ticket |
| `.dev/completed/<id>.md` | Same ticket with completed outcome |
| `.dev/work/<id>/run.json` | Compact recovery state, work checklist and accepted evidence pointers |
| `.dev/work/<id>/brief.md` | Current request and acceptance scope |
| `.dev/work/<id>/brief-approved-*.md` | Preserved accepted scope when user approval is recorded |
| `.dev/work/<id>/brief-final-*.md` | Completed scope when no earlier approval snapshot exists |
| `.dev/work/<id>/results/` | Immutable contributions and necessary evidence |
| `.dev/work/<id>/scratch/` | Disposable exploration, cleaned only on successful completion |
| `.dev/context/analysis.json` | Versioned repository reading aid |

Matching active requests resume across sessions. Completed work is reused only
while its inspected source fingerprint matches. Phase retries do not advance
revisions. Preserve existing user changes and reopen original evidence on
handoff; the short ticket alone is not sufficient agent context.

Contract v12 uses generated tickets and default approach review. Existing runs
retain their historic contract and artifact layout. To adopt the new workflow
for old active work, explicitly cancel and create a current run rather than
rewriting its recorded permissions.

## Development

Run `npm test` for CLI and workflow regression checks and `npm run validate`
for the distribution contract. Tests isolate their fixtures inside ignored
`.dev/test-tmp/`. Structural checks do not prove model behavior or host loading;
trial real changes and report measured outcomes.

See [the workflow](docs/workflow.md), [Forge](skills/ae-forge/SKILL.md) and
[contributor instructions](AGENTS.md).
