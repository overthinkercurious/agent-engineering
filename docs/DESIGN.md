# Agent Engineering design

## Product boundary

Agent Engineering is a workflow skill, not a replacement agent runtime. The
host coding tool owns models, isolated agents, permissions, repository edits,
commands, and user interaction. The kit contributes team selection, role
boundaries, autonomy rules, recovery state, and completion criteria.

## Supported workflow

    request
      -> understand
      -> risk-sized plan
      -> build
      -> independent verify
      -> repair (at most two cycles)
      -> result

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
- dozens of user-facing lifecycle commands.

These mechanisms increased maintenance and user friction without making the
default end-to-end path more capable. If a future feature is added, it must
demonstrably improve delivery quality, recovery, or user effort.

## Completion

A change is complete only when every selected expert contributed, the run
reached verification through legal phase transitions, relevant project checks
ran, blocking findings are resolved, and Forge can state what was delivered and
what remains uncertain. Audit-only work requires its selected reviewers rather
than an implementation contribution.

The recovery ledger enforces selected-role participation and workflow order.
The coding host and repository checks remain the source of truth for the actual
code and test results; Forge does not claim a stronger trust boundary than it
has.
