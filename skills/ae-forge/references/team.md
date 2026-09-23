# Team routing and handoffs

This file defines shared protocol and ownership boundaries. After selecting the
team from team.json, load only each selected role's workflow file under roles/.

## Shared result

Every expert writes this file to `.dev/work/<id>/results/<role>.md`. It is a
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

- **Every column is required.** A finding missing any cell is dropped rather
  than reported — an unfillable column is the evidence that the finding was
  not actually established. In particular `Consequence` is the concrete
  failure produced; "could be cleaner" is not a consequence.
- **At most five findings**, ranked by severity then blast radius. More than
  five means the pass drifted from safety into style.
- **`EVIDENCE` rows are things you opened or ran in this pass**, not things
  you already believed. `How checked` is `read`, `ran, exit <n>`, or
  `grep <pattern> → <n> hits`.
- **An empty section is written as `none`**, never deleted. A missing section
  and a section with nothing in it say different things, and only one of them
  is a result.
- **`UNKNOWNS` is the escalation valve.** An unresolved fact belongs here, not
  inline in `OUTCOME` as a hedge. A role that records a blocking unknown has
  done its job correctly.

Critical and high findings block delivery. Medium and low findings are visible
but do not expand the approved scope automatically. Experts do not edit another
role's result or claim its decision.

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
3. Architect and selected named specialists before build.
4. Builder alone performs implementation.
5. Selected named specialists inspect the candidate in their own boundary.
6. Verifier independently evaluates the integrated result last.

Quick changes may omit Product, Investigator, Architect, and named specialists.
Audit-only work omits Builder and cannot modify application code.

## Dispatch tiers

Three tiers. The vocabulary is stated here; **which tier applies is read from
the project**, never assumed:

- `native-parallel` — concurrent isolated dispatch, confirmed for this host.
- `native-sequential` — isolation confirmed, concurrency not.
- `none` — no confirmed isolation. Run explicit sequential role passes in this
  session and disclose in the report that the final review was not
  context-independent.

`ae-surveyor` resolves every known host's tier from its own `targets.yml` at
scaffold time and publishes the table to `.dev/context/host.json`. Read that
file and look up the tool you are running as.

**Two coupling styles, and the difference is deliberate.** Across a *product*
boundary — `ae-forge` and `ae-surveyor` — this kit never reads another
skill's files. The channel is an artifact inside the project, versioned by
`analysis.json`'s `schema` field and checked against `team.json`'s
`analysis_schema`, so it cannot silently rot the way a "keep these in sync"
instruction would. Within the *delivery pipeline*, the six stage skills
(`ae-plan`, `ae-plan-review`, `ae-build`, `ae-verify`, `ae-investigate`,
`ae-audit`) do read `ae-forge/references/` directly, by resolving it as a
sibling. That is not an exception to the rule, it is the rule applied to a
different thing: they are one distribution unit with `ae-forge`, installed
together and versioned together by `contract`. A stage skill that cannot
resolve that sibling stops rather than improvising, which is what keeps the
coupling honest.

Assume `none` only when that file is missing or your own row is not in it, and
say which of the two it was. Assuming `none` on a host that supports isolation
is not the safe choice it looks like: it collapses Builder and Verifier into
one context, and the independent review this team depends on stops existing
while still being reported as though it happened.

## Enforcement tiers

Two tiers, and like `dispatch` the tier is **read, never assumed**:

- `native` — a host-level hook refuses an edit while a run still needs
  approval, and while a run is in `verify`. Available where this kit is
  installed as a plugin whose hooks the host loads.
- `none` — the default everywhere else. The same two rules still hold; they
  are enforced by `forge.mjs` when it is called, and by nothing when it is not.

Read `.dev/context/enforce.json`. That marker is written only by this kit's
`SessionStart` hook, so its presence is evidence the tier is live rather than
a claim that it should be; `start` reads it for you and prints it.

Never describe `native` as a sandbox. Hooks load from a file this model can
edit, and a subagent's tool calls may not reach them. It is defence in depth:
it closes the gap where an edit happens without `forge.mjs` being called at
all, and it closes nothing else.

## Lens selection

A lens adds platform/protocol-specific depth to a role; it never overrides a role's
exclusive ownership as stated in that role's own file. Selection is mechanical, not a
judgment call — run it rather than eyeballing `team.json`:

```bash
node "$AE/scripts/lens-select.mjs" --team <selected-roles> [--domain <words>]
```

1. Pass the exact team chosen above. The script reads
   `.dev/context/analysis.json` itself and derives domain tags from what is
   actually in the repository, so a React dependency attaches the
   web-performance and accessibility lenses whether or not anyone asked.
   `--domain` adds anything the project cannot reveal — never a substitute
   for the survey.
2. The script attaches at most **2** matching lenses per role, ranked by
   signal-match count (`lenses[*].signals` scored against the combined
   request + stack signals; ties keep `team.json`'s declared order). A role
   with no matching lens proceeds on its own file alone — that is the normal
   case, not a gap.
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
