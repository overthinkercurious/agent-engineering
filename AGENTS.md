# AGENTS.md

Context for AI tools working on this repository, not on a project where the kit
is installed.

## Product

Agent Engineering ships two public skills:

- ae-forge takes a software request through a risk-sized expert team,
  implementation, and independent verification.
- ae-surveyor optionally creates durable repository knowledge and enforceable rules
  for large or long-lived projects.

The kit is a workflow layer over the host coding agent. It must not become a
second agent runtime.

## Layout

| Path | Role |
|---|---|
| skills/ae-forge/ | Autonomous delivery workflow and lightweight recovery ledger |
| skills/ae-surveyor/ | Optional project indexing, knowledge, and rules |
| .codex-plugin/ | Codex package manifest |
| .claude-plugin/ | Claude Code plugin and marketplace manifests |
| scripts/ | Repository validation and acceptance tests; not shipped inside a skill |
| evals/ | Golden routing cases and the planted-defect fixture; not packaged |
| docs/DESIGN.md | Product boundary and deliberately excluded mechanisms |

Everything a skill needs at runtime must live inside its own directory.

## Commands

    npm test
    npm run test:install
    node scripts/test-evals.mjs
    bash scripts/validate-suite.sh
    node scripts/validate-forge.mjs
    node scripts/test-forge.mjs
    node scripts/test-packaging.mjs
    node scripts/test-docs-consistency.mjs
    node scripts/test-lens-selection.mjs
    bash scripts/test-scaffold.sh
    bash scripts/test-artifacts.sh

The test launcher finds Git Bash explicitly on Windows so it does not
accidentally invoke the Windows Subsystem for Linux bash shim.

## Product invariants

- The user describes an outcome; the kit handles workflow mechanics.
- Routing is behavioural, never lexical. `--risk` flags map deterministically
  to roles; keyword signals may only ADD a role, never withhold one. An absent
  risk assessment is recorded and reported, never treated as safety.
- Two public routing surfaces only: ae-surveyor and ae-forge.
- Initialization improves context but never blocks ordinary Forge work.
- Use the smallest team that covers the actual behavioral risk.
- Builder and Verifier are required for completion.
- Most work uses three roles. More than five requires genuinely independent
  risk boundaries and a plain-language explanation to the user.
- Prefer native host subagents and permissions over custom adapters.
- Keep one compact ignored recovery record per task, plus the approved brief
  and one append-only result file per expert contribution.
- Ask for approval only for material choices or authority boundaries.
- Planning is not completion. Requested changes must be implemented and checked.
- Independent verification inspects the exact diff and relevant test results.
- The delivery report is rendered from the ledger, never recalled. A summary
  and the record it describes cannot be allowed to disagree.
- Durable domain facts carry a `verified:` date and go in a lens, never in a
  role file. Role files hold method, which does not rot.
- Critical and high findings block completion.
- Preserve user changes and avoid unrelated cleanup.
- Never claim a trust boundary the kit does not actually possess.
- Never write outside the target project root.

## Simplicity test

Do not add a stage, role, schema, artifact, command, or policy field unless it
changes a user-visible outcome, prevents a demonstrated failure, or materially
improves recovery. Prefer deleting an abstraction when the host agent already
provides the capability.

## Authoring a public skill

Frontmatter needs a directory-matching ae- name, a routing-rich description,
and a unique metadata.owns phrase. Keep the body under 500 lines and put only
selected detail in references.

Never call a bundled script relative to the caller's working directory. Resolve
the installed skill directory first: prefer AE_SKILL_DIR, fall back to
CLAUDE_SKILL_DIR, then to .agents/skills and .claude/skills. A vendor variable
name is acceptable as a fallback, never as the only path.

A script's CLI entry point needs its own test that actually invokes it.
Comparing import.meta.url against a hand-built `file://` + argv[1] silently
fails on Windows and on any relative invocation, and a unit test that imports
the function cannot see a dead entry point.

## Adding expertise

Prefer a lens over a role. A lens rides a role that is already running, costs
no extra dispatch, carves out no ownership, and can declare its own staleness.
Add a new role only when its exclusive outcome cannot fit Product,
Investigator, Architect, Security, Data, Experience, Reliability, Builder, or
Verifier. First refine the nearest dedicated workflow. Any new role needs a
unique ownership phrase, a dedicated workflow file, routing signals, and
validation proving it does not overlap another role. Do not add a sibling
public skill or globally visible persona.

## Portability

Runtime scripts use Node without package dependencies. Portable shell stays
Bash 3.2 compatible: no associative arrays, mapfile, sed -i, or non-POSIX awk.
Pin shell, Node, Markdown, YAML, and JSON files to LF.
