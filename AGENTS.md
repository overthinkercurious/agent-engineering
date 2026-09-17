# AGENTS.md

Context for AI tools working on this repository, not on a project where the kit
is installed.

## Product

Agent Engineering ships two public skills:

- ae-forge takes a software request through a risk-sized expert team,
  implementation, and independent verification.
- ae-init optionally creates durable repository knowledge and enforceable rules
  for large or long-lived projects.

The kit is a workflow layer over the host coding agent. It must not become a
second agent runtime.

## Layout

| Path | Role |
|---|---|
| skills/ae-forge/ | Autonomous delivery workflow and lightweight recovery ledger |
| skills/ae-init/ | Optional project indexing, knowledge, and rules |
| .codex-plugin/ | Codex package manifest |
| .claude-plugin/ | Claude Code plugin and marketplace manifests |
| scripts/ | Repository validation and acceptance tests; not shipped inside a skill |
| docs/DESIGN.md | Product boundary and deliberately excluded mechanisms |

Everything a skill needs at runtime must live inside its own directory.

## Commands

    npm test
    npm run test:install
    bash scripts/validate-suite.sh
    node scripts/validate-forge.mjs
    node scripts/test-forge.mjs
    node scripts/test-packaging.mjs
    node scripts/test-docs-consistency.mjs
    bash scripts/test-scaffold.sh
    bash scripts/test-artifacts.sh

The test launcher finds Git Bash explicitly on Windows so it does not
accidentally invoke the Windows Subsystem for Linux bash shim.

## Product invariants

- The user describes an outcome; the kit handles workflow mechanics.
- Two public routing surfaces only: ae-init and ae-forge.
- Initialization improves context but never blocks ordinary Forge work.
- Use the smallest team that covers the actual behavioral risk.
- Builder and Verifier are required for completion.
- Most work uses three roles. More than five requires genuinely independent
  risk boundaries and a plain-language explanation to the user.
- Prefer native host subagents and permissions over custom adapters.
- Keep one compact ignored recovery record per task.
- Ask for approval only for material choices or authority boundaries.
- Planning is not completion. Requested changes must be implemented and checked.
- Independent verification inspects the exact diff and relevant test results.
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
the installed skill directory first. CLAUDE_SKILL_DIR always needs fallbacks for
.agents/skills and .claude/skills.

## Adding expertise

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
