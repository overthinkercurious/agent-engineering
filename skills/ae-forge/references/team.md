# Team routing and handoffs

This file defines shared protocol and ownership boundaries. After selecting the
team from team.json, load only each selected role's workflow file under roles/.

## Shared result

Every expert writes its first pass to `.dev/work/<id>/results/<role>.md` and
each later pass to a new file. A recorded result is never overwritten. It is a
form, not a description of one: copy the skeleton and fill it. Filling a form
and composing a document from a list of required topics are different tasks,
and only the first produces the same shape twice.

```markdown
# <Role> · <run id> · revision <n>

## STATUS
COMPLETE | NEEDS INPUT | BLOCKED | INCONCLUSIVE

## OUTCOME
<the role's exclusive deliverable, in the shape its own `## Output` specifies>

## EVIDENCE
| What | Where | How checked |
|---|---|---|
| balance fold reads cleared rows only | `src/ledger.ts:88-140` | read |
| unit suite | `npm test -- --run` | ran, exit 0 |

## FINDINGS
| ID | Severity | Location | Issue | Consequence | Smallest repair | Proof check |
|---|---|---|---|---|---|---|
| F1 | high | `src/auth.ts:51` | tenant id read from body | cross-tenant read | take it from the verified claim | `npm test -- auth` |

## UNKNOWNS
| Unknown | Blocks? | What would resolve it |
|---|---|---|
| retention window for superseded rows | no | product decision, or `docs/retention.md` |

## HANDOFF
<role that owns the next decision, and the one question it must answer>
```

Rules that make the form mean something:

- **Preserve established defects.** Location, issue, and concrete consequence
  require evidence. Use `unknown: <what would resolve it>` for an unresolved
  repair or proof check; missing remediation detail never removes a blocker.
  Unsupported suspicions belong in `UNKNOWNS`, with `Blocks?` set to yes or no.
- **Lead with at most five findings**, ranked by severity then blast radius.
  Keep any additional evidenced blockers in the result file; a presentation
  limit never suppresses a safety finding.
- **`EVIDENCE` rows are things you opened or ran in this pass**, not things
  you already believed. `How checked` is `read`, `ran, exit <n>`, or
  `grep <pattern> → <n> hits`.
- **Research material external claims.** Use a focused search and primary
  source when the decision depends on a time-sensitive platform, dependency,
  standard, policy, security, or API fact. Local code is the evidence for
  repository behaviour. Record the source and conclusion in `EVIDENCE`.
  If research is unavailable, mark that external claim unverified in
  `UNKNOWNS`. Repository-local judgments need no ceremonial web search.
- **An empty section is written as `none`**, never deleted. A missing section
  and a section with nothing in it say different things, and only one of them
  is a result.
- **`UNKNOWNS` is the escalation valve.** An unresolved fact belongs here, not
  inline in `OUTCOME` as a hedge. A role that records a blocking unknown has
  done its job correctly.
  A `Blocks? yes` prevents approval and PASS until resolved; naming an unknown
  does not make implementation safe. Nonblocking questions do not force REVISE.

Critical and high findings block delivery. Medium and low findings are visible
but do not expand the approved scope automatically. Experts do not edit another
role's result or claim its decision.

## Dispatch packet

Forge gives each stage the same small, explicit packet: run ID, contract
version, current phase and revision, assigned role, exact repository scope,
brief path, artifact path, paths to the latest relevant result files, and
attached lens paths. Candidate reviewers also receive the baseline and exact
diff target. The stage reads those files itself and checks that its assigned
phase and revision still match `run.json` before recording a result. If they
do not match, it returns to Forge without writing a stale review. Never pass
only a conversation summary or a prior agent's opinion as the handoff.

## Exclusive ownership

Each role's exclusive outcome, and what it explicitly does not own, is stated
once at the top of its own file under `## Exclusive outcome`. Read it there.
Repeating the table here would be a third copy of the same nine facts, loaded
on every run, free to drift from the two that matter.

## Boundary rules

- Product says what outcome is valuable; Experience says whether a person can
  complete the accepted journey.
- Investigator proves why existing behavior fails; Architect chooses how the
  supported cause or accepted feature should be changed.
- Architect owns the cross-component design; selected named specialists add
  constraints and findings within their risk boundary.
- Security owns who may do or see what. Data owns whether stored state remains
  correct while its shape or values change.
- Data owns transactional and persistent-state invariants. Reliability owns
  retry, load, degradation, and recovery of the running system.
- Builder may question a plan with evidence but cannot silently redesign it.
- Verifier judges the integrated result and never repairs what it reviews.

If a question crosses a border, split it into two explicit decisions. Do not
let both roles issue competing answers to the same question.

## Order

1. Product only when the requested outcome is materially ambiguous.
2. Investigator before architecture for unexplained bugs or performance issues.
3. Architect drafts the design, then selected named specialists record their
   pre-build constraints against the written plan.
4. On every delivery, Plan Reviewer reads the plan and selected specialist
   results. On deep runs, Plan Challenger then challenges each material decision
   in the reviewed plan. A REVISE from either returns the plan to Architect
   for a focused revision, followed by a new Reviewer pass and, when selected,
   a Challenger pass. Do not dispatch an identical review on an unchanged
   plan and evidence; record a blocked unknown or seek the missing decision.
   Blocking unknowns also force REVISE or NEEDS INPUT.
5. When an unresolved material choice or authority boundary requires it,
   Forge presents the current reviewed plan to the user and records approval.
   A reviewer verdict is never user authorization. A changed plan repeats the
   selected reviews and, when required, user approval.
6. Builder alone performs implementation and reads all selected constraints.
7. Selected technical specialists (Security, Data, Experience, Reliability)
   inspect the candidate in their own boundary. Product defines the outcome
   before design and does not perform a candidate review.
8. Verifier evaluates the integrated result last and records review context.

Delivery runs may omit Product, Investigator, and named specialists. Every
delivery retains Architect, Plan Reviewer, Builder, and Verifier. Deep runs add
Challenger; user approval depends on the decision boundary.
Audit-only work omits Builder and cannot modify application code. Selected
specialists examine their scoped boundaries, Auditor makes the cold assessment,
and Verifier assesses the combined findings. Auditor does not read the earlier
specialist results, preserving its independent read.

## Dispatch capability

Use isolated stage dispatch only when the current host exposes it and the
session permits delegation. Otherwise run stages sequentially and record
`same-session` for review contributions. A same-session Verifier must reopen
claims and run checks directly; the report states its context. Never infer
isolation from installed files or a saved project profile.

The six stage skills (`ae-plan`, `ae-plan-review`, `ae-build`, `ae-verify`,
`ae-investigate`, `ae-audit`) read `ae-forge/references/` as siblings. They
ship together under one contract. A stage that cannot resolve this directory
stops instead of inventing its method.

## Enforcement modes

Two modes, and like `dispatch` the mode is **read, never assumed**:

- `native` — a host-level hook refuses configured source edits outside Build
  or Repair, on stale plan/brief authorization, during read-only work, and when
  active run ownership is ambiguous. Available only where the host loads it.
- `none` — the default everywhere else. The same authorization rules hold; they
  are enforced by `forge.mjs` when it is called, and by nothing when it is not.

The guard uses session-bound runs instead of whichever run was updated last.
`start` and `focus` bind the current host session to that run. If the host does
not export its session ID, Forge may use `focus --session <id>` from the hook
event. Multiple unbound active runs block source edits; use separate checkouts
or bind explicitly. Bookkeeping under `.dev/work` and `.dev/runs` remains writable.

Reviewer, Challenger, and Verifier records require complete shared sections
and checked evidence. Plan Reviewer covers all six criteria (reasoned N/A is
allowed); Challenger records tested decisions. Approval/PASS requires COMPLETE
status and no blocking unknown. This validates the record, not its factual truth.
See `evaluation.md` for behavioral checks and host validation.

`start` reports `native` only when the `SessionStart` marker matches this host's
current session ID. A marker left by an earlier session reports `none`.
Antigravity uses the supplied conversation ID as `--session`; its adapter and
workspace hook entry are described in `evaluation.md`.

Never describe `native` as a sandbox. Hooks load from a file this model can
edit, a subagent's tool calls may not reach them, and the configured hook
intercepts named edit tools but not shell writes. It is defence in depth for
those tools, not a general filesystem boundary.

## Lens selection

A lens adds platform/protocol-specific depth to a role; it never overrides a role's
exclusive ownership as stated in that role's own file. Selection is mechanical, not a
judgment call — run it rather than eyeballing `team.json`:

```bash
node "$AE/scripts/lens-select.mjs" --id <run-id>
```

1. Pass the run ID. The script reads the recorded team, request signals, and
   domain hints from the run, so the lens decision cannot omit request context.
   It also reads `.dev/context/analysis.json` and derives domain tags from what is
   actually in the repository, so a React dependency attaches the
   web-performance and accessibility lenses whether or not anyone asked.
   `--domain` adds a platform or standard the project cannot reveal.
2. The script attaches **every** matching lens per role, ranked by
   signal-match count (`lenses[*].signals` scored against the combined request
   + stack signals; ties keep `team.json`'s declared order). A role with no
   matching lens proceeds on its own file alone — that is the normal case, not
   a gap.
3. Read only the attached lens files, the same way only selected role files
   are read — never the full catalog in `references/lenses/_index.md` beyond
   its own listing.
4. Read the three other fields, and act on each:
   - `unavailable` — a domain fired but no lens exists. Record
     `LENS UNAVAILABLE` for the relevant role once and continue without it.
     Never improvise the missing depth from general knowledge presented as
     if it were checked.
   - `stale` — an attached lens is past its `review_after`. Record
     `LENS STALE` and treat its thresholds as a starting point to verify,
     not as current fact. A confidently quoted superseded threshold is worse
     than an admitted gap.
   - `assessed: false` — no domain input existed at all. That is not "no
     lens applies"; it means the question was never asked. Say so in the
     report, exactly as an unassessed `--risk` is reported.
