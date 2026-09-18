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

| Role | Exclusively owns | Explicitly does not own |
|---|---|---|
| Product | User/system outcome, scope, non-goals, acceptance behavior | Technical design, implementation, release verdict |
| Investigator | Reproduced symptom and supported causal account | Product scope, solution design, implementation, fix verdict |
| Architect | Technical design, boundaries, impact map, implementation plan | Product outcome, causal proof, code, final verification |
| Security | Trust, authorization, privacy, abuse, security constraints/findings | General architecture, data migration mechanics, implementation |
| Data | Persistent-data invariants, schema transition, migration and recovery constraints | Authorization policy, general reliability, application implementation |
| Experience | User journey, interaction states, accessibility acceptance | Product priority, visual implementation, backend design |
| Reliability | Runtime failure, performance, concurrency, observability and operational recovery | Stored-data transition, product scope, release verdict |
| Builder | Application and test changes implementing the accepted plan | Scope, architecture, independent verification |
| Verifier | Integrated evidence and final PASS/FAIL verdict | Product decisions, implementation, repair |

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

## Lens selection

A lens adds platform/protocol-specific depth to a role; it never overrides
exclusive ownership from the table above. Selection is mechanical, not a
judgment call — run it rather than eyeballing `team.json`:

```bash
node "$AE/scripts/lens-select.mjs" --team <selected-roles> --signals <request-signals> [--stack <survey-detected-signals>]
```

1. Pass the exact team chosen above and the exact signals given to
   `forge.mjs start`. When `.dev/knowledge/stack.md` exists, also pass its
   detected stack as `--stack`.
2. The script attaches at most **2** matching lenses per role, ranked by
   signal-match count (`lenses[*].signals` scored against the combined
   request + stack signals; ties keep `team.json`'s declared order). A role
   with no matching lens proceeds on its own file alone — that is the normal
   case, not a gap.
3. Read only the attached lens files, the same way only selected role files
   are read — never the full catalog in `references/lenses/_index.md` beyond
   its own listing.
4. The script's `unavailable` list names any request/stack signal that
   matches `team.json`'s `lenses_backlog` (a lens named but not yet
   written): record `LENS UNAVAILABLE` for the relevant role once and
   continue without it. Never improvise the missing domain depth from
   general knowledge presented as if it were checked.
