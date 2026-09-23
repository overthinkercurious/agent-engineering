# AGENTS.md

Context for AI tools working on this repository, not on a project where the kit
is installed.

## Product

Agent Engineering ships eight skills behind **two user-facing surfaces**:

- ae-forge takes a software request through a risk-sized expert team,
  implementation, and independent verification.
- ae-surveyor optionally creates durable repository knowledge and enforceable rules
  for large or long-lived projects.

The other six — ae-investigate, ae-plan, ae-plan-review, ae-build, ae-verify,
ae-audit — are dispatch targets, not routing surfaces. Forge invokes them one
at a time; each carries only the protocol and reads its method from
ae-forge/references/. They are one distribution unit with ae-forge and are
installed together. A stage that cannot resolve its sibling contract stops
rather than improvising.

The kit is a workflow layer over the host coding agent. It must not become a
second agent runtime.

## Layout

| Path | Role |
|---|---|
| skills/ae-forge/ | Autonomous delivery workflow, the shared contract, and the recovery ledger |
| skills/ae-surveyor/ | Optional project indexing, knowledge, and rules |
| skills/ae-{investigate,plan,plan-review,build,verify,audit}/ | Stage skills: protocol only; method stays in ae-forge/references/roles/ |
| hooks/ | The enforcement tier. Loaded only on the plugin install path |
| .codex-plugin/ | Codex package manifest |
| .claude-plugin/ | Claude Code plugin and marketplace manifests |
| package.json | npm package metadata and distribution allowlist |
| README.md | User-facing installation and workflow guide |
| LICENSE | Distribution license |

Everything a skill needs at runtime must live inside its own directory.

## Product invariants

- The user describes an outcome; the kit handles workflow mechanics.
- Routing is behavioural, never lexical. `--risk` flags map deterministically
  to roles; keyword signals may only ADD a role, never withhold one. An absent
  risk assessment is recorded and reported, never treated as safety.
- Two user-facing routing surfaces only: ae-surveyor and ae-forge. The six
  stage skills are dispatch targets; they must read as unreachable outside a
  run, never as a second way to ask for work.
- Enforcement is a read tier, never an assumption, and never described as a
  sandbox. `native` means a host hook refuses an edit that the ledger says is
  not yet authorised; `none` is the honest default. Hooks load from a file the
  model can edit and a subagent may bypass them, so both limits ship with the
  claim.
- The one artifact that crosses a product boundary (.dev/context/analysis.json)
  is versioned and its version is asserted. A consumer reading it with `?? []`
  turns a rename into silent depth loss, which is the only fail-open path this
  kit is allowed to have and it must be reported when it fires.
- Initialization improves context but never blocks ordinary Forge work.
- Refresh deterministic analysis for each run when the analyzer is available;
  stale generated knowledge is a reading lead, not current evidence.
- Use the smallest team that covers the actual behavioral risk.
- Builder and Verifier are required for completion.
- Standard delivery uses Architect, Builder, and Verifier. A separate Plan
  Reviewer is reserved for deep design risk.
- Most work uses three roles. More than five requires genuinely independent
  risk boundaries and a plain-language explanation to the user.
- Where isolation is unavailable, complete stages sequentially in one session,
  recheck review evidence, and report the review context honestly.
- Prefer native host subagents and permissions over custom adapters.
- Keep one compact ignored recovery record per task, plus the frozen brief
  and one append-only result file per expert contribution.
- Ask for approval only for material choices or authority boundaries.
- Planning is not completion. Requested changes must be implemented and checked.
- Verification inspects the exact diff and relevant test results; isolated
  review is claimed only when the host actually provided it.
- Capture pre-existing dirty and untracked files at run start, then compare
  task work against that baseline without attributing user changes to Builder.
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

<!-- agent-engineering:start -->
## Project knowledge

This project was surveyed by [agent-engineering](https://github.com/overthinkercurious/agent-engineering).

**This is the Agent Engineering source repository.** `skills/` is the tracked
Root-level validation, evaluation, design, and generated survey artifacts are
not part of the kit distribution. Runtime scripts and method references live
inside their owning skill directories.
<!-- agent-engineering:end -->
