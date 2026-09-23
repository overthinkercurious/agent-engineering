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
| scripts/ | Repository validation and acceptance tests; not shipped inside a skill |
| evals/ | Golden routing cases and the planted-defect fixture; not packaged |
| docs/DESIGN.md | Product boundary and deliberately excluded mechanisms |

Everything a skill needs at runtime must live inside its own directory.

## Commands

    npm test
    npm run test:install
    npm run eval -- list
    node scripts/test-evals.mjs
    node scripts/test-contract.mjs
    node scripts/test-guard.mjs
    bash scripts/validate-suite.sh
    node scripts/validate-forge.mjs
    node scripts/test-forge.mjs
    node scripts/test-packaging.mjs
    node scripts/test-docs-consistency.mjs
    node scripts/test-lens-selection.mjs
    node skills/ae-surveyor/scripts/verify-citations.mjs
    bash scripts/test-scaffold.sh
    bash scripts/test-artifacts.sh

`npm run eval` (Layer B, `scripts/eval-depth.mjs`) needs a model-driven Forge
run against a prepared fixture and is not part of `npm test`; see
`evals/README.md` for `prepare`/`grade`.

The test launcher finds Git Bash explicitly on Windows so it does not
accidentally invoke the Windows Subsystem for Linux bash shim.

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

<!-- agent-engineering:start -->
## Project knowledge

This project was surveyed by [agent-engineering](https://github.com/overthinkercurious/agent-engineering).

**Start here:** `.dev/knowledge/00-index.md` routes you to the one document
that answers your question. Read that document, not all of them.

| Question | Document |
|---|---|
| What is this built with? | `.dev/knowledge/stack.md` |
| How is it shaped? What breaks if I change this? | `.dev/knowledge/architecture.md` |
| What does the persisted data look like? | `.dev/knowledge/schema.md` |
| How do I run, test and build it? | `.dev/knowledge/commands.md` |
| Why is it built this way? | `.dev/knowledge/decisions.md` |
| What is enforced, and by which command? | `.dev/rules/00-index.md` |

The knowledge and rules documents are generated but committed. Content between
the `agent-engineering` markers is rewritten on every run; anything outside
the markers is preserved, so corrections go under `## Notes`.

Every claim in a managed block is tagged. `OBSERVED` cites the exact
`path:line` a parser or a reading pass actually checked. `INFERRED` states
what it was reasoned from. `UNKNOWN` names what would resolve it. There is no
fourth tag — a claim that isn't one of these three doesn't belong in the file.

`.dev/rules/` carries two kinds of guidance, labeled apart because they carry
different authority: **enforced rules**, backed by a command in this repository
that fails when the rule is broken, and **stack conventions**, curated once
inside the kit and copied in by detected stack — never enforced here, and this
project's own code and docs always outrank them.

`.dev/context/` holds the raw analysis dump. It is regenerated on every run and
is not committed — except `.dev/context/host.json`, which is committed because
it decides whether review roles run in an isolated context, and a clone that
loses it silently downgrades to no isolation. `.dev/work/` holds ignored
per-feature working artifacts.

**The suite itself is not committed to this repository.** It is a dependency,
listed in `skills-lock.json` and gitignored. In a fresh clone, restore it with:

```bash
npx skills@1.7.0 add overthinkercurious/agent-engineering --agent AGENT_ID --copy -y
```

Replace `AGENT_ID` with the current IDE's identifier from the installation table
in the linked Agent Engineering README.

Then ask the agent to run the survey. If the knowledge base looks out of date,
re-run it: only the sections whose sources actually changed are regenerated.
<!-- agent-engineering:end -->

> **Correction to the generated block above (this repository only).** Two of
> its sentences describe a *consumer* project and are false here: this **is**
> the suite's repository, so `skills/` is the product and must stay tracked,
> and there is no `skills-lock.json` here and should not be.
>
> `scaffold.sh` and `doctor.sh` now detect self-hosting (`ae_self_hosted` in
> `lib.sh`) and omit the suite ignore rule, the untrack advice and the lock
> warning. Running the survey here is safe.
