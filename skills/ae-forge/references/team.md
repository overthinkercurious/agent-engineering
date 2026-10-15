# Shared contract

Forge owns continuity. Role names identify exclusive decisions and evidence,
not personalities or a fixed number of agent processes. Load only methods
selected by the recorded behavioral risk and relevant domain lenses.

## Worker result

Write one new file under `.dev/work/<id>/results/` for each meaningful pass.
The result is immutable after recording. Use this shared form; the selected
method supplies the shape inside OUTCOME.

```markdown
# <Role> · <run id> · revision <n>

## STATUS
COMPLETE | NEEDS INPUT | BLOCKED | INCONCLUSIVE

## OUTCOME
<exclusive deliverable>

## EVIDENCE
| What | Where | How checked |
|---|---|---|
| current behavior | path:line or primary source URL | read or ran, exit N |

## FINDINGS
| ID | Severity | Location | Issue | Consequence | Smallest repair | Proof check |
|---|---|---|---|---|---|---|

## UNKNOWNS
| Unknown | Blocks? | What would resolve it |
|---|---|---|

## HANDOFF
<next owner and the decision or action required>
```

Write `none` in an applicable empty section. Lead with the most important
findings and preserve every evidenced blocker, including those beyond a
short presentation summary. Missing remediation never removes a defect:
record what would resolve it. Suspicions belong in UNKNOWNS.

EVIDENCE names what this pass actually opened, executed or observed.
Use explicit backticked file paths (including line numbers where useful) or
Markdown links for local citations; paths resolve from the project root.
Use primary-source URLs for external evidence. Write `UNAVAILABLE: <reason>`
for unavailable evidence; never supply a missing file as if it were checked.
Contract v13 checks the shared form and highest finding severity for every
expert, and checks explicit local references for existence inside the project.
It cannot establish that an existing file supports a claim.
Check consequential external claims against current primary sources;
unavailable research stays unverified. Discovery and source/runtime
reconciliation follow [discovery.md](discovery.md).

Critical/high candidate findings block delivery. A blocking unknown prevents
approval or unqualified PASS. Audit severity describes existing defects and
does not make a supported assessment itself fail.

## Handoff and recording

Forge supplies: run ID, contract, phase, revision, assignment and scope,
brief, latest accepted relevant result paths, attached lens paths and source
reading pointers. Candidate review includes the baseline and exact candidate.
Workers reopen the original evidence and current ledger; summaries alone
cannot establish correctness. A stale phase/revision returns to Forge.

Resolve the installed Forge sibling from the stage's installed directory,
using AE_SKILL_DIR, CLAUDE_SKILL_DIR or project skill folders. Missing sibling
contract stops dispatch. Read this file, the selected method and attached
lenses only. The six stage skills are model-dispatchable internal methods;
standalone requests start with ae-forge.

After writing the result, use `note` as described in
[commands.md](commands.md). Recording updates accepted pointers and renders
the human ticket for contract v12 and later. Stages do not rewrite the whole ticket.
Forge updates its checklist, next action and unresolved decisions.

## Ordering and ownership

Forge clarifies behavior. Investigator establishes an unexplained cause before
design. Architect defines the coherent approach, real alternatives and slices;
selected domain methods add constraints. Plan Reviewer checks current design;
deep design risk adds Challenger. Four delivery responsibilities remain:
Architect, Plan Reviewer, Builder and Verifier. Forge can perform planning
itself; separate dispatch depends on actual risk and host capabilities.

The user reviews the approach by default before application edits. Earlier
approval of this same current plan is valid; explicit autonomy is recorded,
never inferred from silence or an expert verdict. Material revisions repeat
affected technical reviews and the user checkpoint.

Builder implements and checks one vertical slice at a time. Selected technical
domain methods inspect the integrated candidate; Product defines scope rather
than reviewing code. Verifier judges the exact current candidate last.
Dependent stages stay sequential. An in-scope repair reuses the approved
approach, requires fresh Builder evidence and verification, and is capped at
two cycles. Older runs keep their historic gates.

Audit: relevant domain inspection, cold Auditor assessment, then Verifier.
The Auditor reads source/runtime against declared scope without reading earlier
conclusions. No implementation is authorized. Plan/diagnose/review are also
read-only. Completion means the requested assessment is supported, not that
the application has no defects.

Before assigning Auditor, fill the brief with the supplied request, scope,
exclusions and assessment checks. Preserve the full request when available;
do not substitute a short run title or reconstruct missing user instructions.
Accepted Auditor and read-only Verifier contributions bind the brief hash and
preserve its snapshot. Changing that scope requires fresh assessment/review;
completion cannot silently attach new requirements to old evidence.
Keep findings in the canonical FINDINGS section, not a second hazards table
inside OUTCOME. Record honest severity even for assessment-only hazards.
Verifier reopens each critical/high upstream finding, identifies it as
`<role>/<finding ID>` in Claim re-verification, and records `confirmed`,
`corrected` or `unverified` with the source or artifact actually checked.
Audit completion with existing high hazards is allowed; unsupported claims
and unresolved assessment questions are a different matter.

Contract v13 completion requires a filled brief and a nonempty evidenced
checklist. The generated ticket projects scope, coverage, findings, limits
and selected evidence from accepted originals. Audit PASS describes assessment
quality, not application health. Unassessed/unavailable domain depth and other
accepted evidence gaps require explicit Verifier limitations and PASS WITH
RESIDUAL RISK; required core evidence still cannot be waived by presentation.

## Context and enforcement

Prefer independent native review contexts when available and authorized;
otherwise reopen evidence sequentially and label same-session review.
Record actual review context. Installed capability metadata cannot prove
isolation. Reviewer/Challenger/Verifier results must pass their structural
validator; a valid form still requires factual verification.

Hooks are optional configured edit checks. `native` requires a matching current
host-session marker; `none` is the default. Hooks are editable, may be bypassed
by subagents or shell writes, and are not a sandbox. See
[evaluation.md](evaluation.md) for host smoke checks and limitations.

## Lenses

Run `lens-select.mjs --id <id>` and record its output with `lenses`.
It reads recorded request/domain/risk and fresh schema-checked analysis.
Request-matching domains take priority over unrelated project-only matches;
otherwise project detection supplies depth. Read only attached lenses.

Report unavailable lenses, stale dates and unassessed domain input. Verify
stale material facts against current primary sources before relying on them.
Lenses supply constraints without extra dispatch or ownership. Keep durable
facts dated in lenses, and stable method in the selected role workflow.
