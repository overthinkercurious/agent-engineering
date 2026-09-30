# Toolkit comparison and design decisions

Here **ECC** means [Everything Claude Code](https://github.com/affaan-m/ECC),
the public toolkit maintained by `affaan-m`. It does not mean “Enterprise
Coder Context.” The comparison covers the cited project documentation, not
every implementation detail or third-party extension.

| Toolkit | State and artifacts | Repeat runs and restarts | Cleanup and transitions | Quality controls |
|---|---|---|---|---|
| [agency-agents](https://github.com/msitarzewski/agency-agents) | A catalog of installable specialist personas with role deliverables and success metrics. The main workflow examples compose them into teams. | Installation can select a division or agent. The main guide does not specify a task-key ledger or repeat-request recovery contract. | The main guide does not define a generated task-artifact archive. | Role-specific process, deliverables, success metrics, plus review and evidence personas. |
| [ECC](https://github.com/affaan-m/ECC) | Project plans plus session summaries, learned skills, aliases, and metrics under a configurable agent data root. [Memory hooks](https://github.com/affaan-m/ECC/blob/main/hooks/README.md) load and save context at session boundaries. | Hook installation uses stable ownership IDs; session memory supports restarts. The reviewed documentation does not establish deduplication of a software request into one canonical run. | Configurable session temporary-file retention and ownership-aware installation cleanup; no single feature artifact state machine was identified in the reviewed guide. | Planning artifacts, test-driven workflow, fresh-context review, and configurable hooks. |
| [Superpowers](https://github.com/obra/superpowers) | [Plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md) are Markdown files with exact paths, tasks, and checks; execution skills keep a ledger. | The [inline execution skill](https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md) uses a brief and ledger for recovery. The reviewed skills do not define automatic duplicate-request detection. | A finishing skill handles branch/PR choice; the reviewed plan skills do not prescribe automatic plan archiving or scratch cleanup. | Root-cause debugging, small plan steps, test-driven checks, review, and verification before completion. |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | Feature directories hold a spec, plan, and tasks. Its [evolving-specs guide](https://github.com/github/spec-kit/blob/main/docs/guides/evolving-specs.md) describes a living spec with derived downstream artifacts. | Updating intended behavior starts by revising the existing spec and bringing the plan and tasks into agreement. New feature directories can supersede prior ones with cross-links. | Prior feature directories remain for audit and comparison; the guide does not make automatic cleanup its default. | Explicit specify → plan → tasks → implement → converge flow, with remaining gaps turned into tasks. |
| **Forge v2** | One ignored run ledger, frozen brief, append-only role results, and one readable artifact that records approach, implementation, and verification. | Normalized request key reuses a run; explicit ID selects it; phase and finish retries are safe. | `/.dev/` is ignored and previously tracked kit artifacts are untracked without deleting local copies. Successful completion archives the readable document and removes only task scratch. | Risk-sized roles and lenses, reviewed plan, immutable evidence files, exact-diff verification, blocker gates, and two repair attempts. |

## What this kit adopts

Agency Agents demonstrates the value of deep specialist methods, but a large
persona catalog would be expensive and ambiguous for a solo developer. Forge
keeps a small team and attaches domain lenses only to roles already selected.

ECC demonstrates useful session persistence and hook ownership. Forge stores
task state in the target project because the handoff needs the exact brief,
revision, and candidate evidence; host hooks remain optional and are never
described as a sandbox.

Superpowers and Spec Kit both make the plan a real artifact. Forge keeps that
approach and adds an implementation account and final verification to the
same readable document. It also adds repeat-request identity and a defined
local archive transition, which the reviewed guides do not promise.

The main trade-off is that every generated run artifact is Git ignored, as
requested. This avoids repository noise and accidental disclosure, but the
run history does not automatically move between machines. The completed
document can be deliberately exported when a project needs a shared design
record.
