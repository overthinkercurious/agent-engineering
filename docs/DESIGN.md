# Agent Engineering design

## Product boundary

Agent Engineering is a workflow skill, not a replacement agent runtime. The
host coding tool owns models, isolated agents, permissions, repository edits,
commands, and user interaction. The kit contributes team selection, role
boundaries, autonomy rules, recovery state, and completion criteria.

## Supported workflow

    request
      -> behavioural risk assessment (--risk)
      -> routing decision, printed with what was SKIPPED and why
      -> understand
      -> risk-sized brief (tier-bound sections), approved and then frozen
      -> build
      -> independent verify
      -> repair (at most two cycles; second pass focuses on the repair)
      -> report, rendered from the ledger

Quick work may omit a separate architecture pass. Standard changes use
Architect, Builder, and Verifier. Deep work adds only the relevant Security,
Data, Experience, Reliability, Product, or Investigator expert. Every expert
has a dedicated workflow and exclusive outcome. Audit-only work excludes
Builder and never edits code unless the user separately requests remediation.

## Deliberately excluded

The kit does not implement:

- a second model-host adapter system;
- token or monetary budget accounting the host cannot measure reliably;
- cryptographic evidence claims over a workspace every agent can edit;
- separate schemas for every intermediate document;
- a mandatory stage for every possible kind of work;
- globally visible specialist skills;
- dozens of user-facing lifecycle commands;
- a tenth specialist role. The capability space is covered by nine, every
  added role must carve its outcome out of an existing one, and the seam is
  where duplicate and contradictory findings appear. Depth is added through
  lenses, which cost no extra dispatch and carve out no ownership;
- a separate Release Auditor, Documentation, Accessibility, Performance or
  per-stack Builder role. Release readiness is the audit path; docs ship in
  the implementing diff; accessibility is Experience plus a lens; performance
  is Investigator's diagnosis and Reliability's design; and splitting Builder
  by stack would destroy the single-coherent-diff property that makes
  verification tractable.

These mechanisms increased maintenance and user friction without making the
default end-to-end path more capable. If a future feature is added, it must
demonstrably improve delivery quality, recovery, or user effort.

## Completion

A change is complete only when every selected expert contributed, the run
reached verification through legal phase transitions, relevant project checks
ran, blocking findings are resolved, and Forge can state what was delivered and
what remains uncertain. Audit-only work requires its selected reviewers rather
than an implementation contribution.

Acceptance is per-kind. Most of it is judgment the Verifier owns, but two are
mechanical: a refactor whose diff touches test files cannot finish, because
rewriting the tests removes the only evidence that behaviour was preserved.

The recovery ledger enforces selected-role participation and workflow order.
The coding host and repository checks remain the source of truth for the actual
code and test results; Forge does not claim a stronger trust boundary than it
has.
