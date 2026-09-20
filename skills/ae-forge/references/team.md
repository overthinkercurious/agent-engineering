# Team routing and handoffs

This file defines shared protocol and ownership boundaries. After selecting the
team from team.json, load only each selected role's workflow file under roles/.

## Shared result

Every expert returns:

- STATUS: COMPLETE, NEEDS INPUT, BLOCKED, or INCONCLUSIVE.
- OUTCOME: the role's exclusive deliverable in no more than five bullets.
- EVIDENCE: inspected paths and lines, or exact commands with exit status.
- FINDINGS: severity, affected behavior, evidence, smallest repair, proof check.
- UNKNOWNS: unresolved facts and whether each blocks the run.
- HANDOFF: which role owns the next decision; never invoke that role directly.

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

Three tiers, duplicated here deliberately rather than read from
`ae-surveyor`'s `targets.yml`: installed skills cannot read each other's
files, and a "keep these in sync" instruction that no mechanism enforces is
how a shared contract silently rots.

- `native-parallel` — concurrent isolated dispatch, confirmed for this host.
- `native-sequential` — isolation confirmed, concurrency not.
- `none` — the default. Assume it unless this host is independently known to
  support isolated dispatch. On `none`, run explicit sequential role passes in
  this session and disclose in the report that the final review was not
  context-independent.

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
