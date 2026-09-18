---
name: ae-surveyor
description: >
  Establishes durable, evidence-backed project knowledge and enforceable rules
  before any specialist team works on this repository. Use when the user asks
  to initialize, index, analyze, onboard, document, survey, or refresh a
  project for AI-assisted development. Optional: other skills work directly
  from the repository when no survey exists, at the cost of re-reading it
  every session.
metadata:
  owns: "surveying a project once and producing the pointer-based knowledge, rules, and index other skills consult instead of re-reading the repository"
---

# Survey a project

Give every other skill in this kit a place to point instead of a reason to
re-read the repository. A survey is a cache of a real reading pass, not a
document someone maintains by hand — it is regenerated, never hand-edited
inside its generated sections, and every claim it makes is checkable.

Resolve the installed skill directory and this host's dispatch capability
once, at the top of every run:

```bash
SV="${CLAUDE_SKILL_DIR:-}"
[ -n "$SV" ] || for d in .claude/skills/ae-surveyor .agents/skills/ae-surveyor; do
  [ -f "$d/SKILL.md" ] && SV="$d" && break
done
```

Read `references/targets.yml` for this host's paths **and its dispatch
tier**. A host is `native-parallel` (concurrent isolated dispatch confirmed
by name and citation in targets.yml), `native-sequential` (isolation
confirmed, concurrency not), or `none` (default — assume this unless a row
says otherwise). Never assume a tier a targets.yml row has not verified.

## Stages

| Stage | What runs | Output |
|---|---|---|
| 1. Scaffold | `bash "$SV/scripts/scaffold.sh"` | `.dev/` directories, instruction pointers, ignores |
| 2. Analyze | `node "$SV/scripts/analyze.mjs"` | `.dev/context/analysis.json` — the sensor dump |
| 3. Knowledge | model pass, guided by `references/stages/knowledge.md` | `.dev/knowledge/{stack,architecture,schema,commands,decisions}.md` |
| 4. Rules | model pass, guided by `references/stages/rules.md`, plus `node "$SV/scripts/rules.mjs"` for the enforced half | `.dev/rules/` and the host's rules directory |
| 5. Verify | model pass (isolated per dispatch tier) plus `bash "$SV/scripts/doctor.sh"` | readiness verdict |
| 6. Index | model pass | `.dev/knowledge/00-index.md` |

### 1. Scaffold

```bash
bash "$SV/scripts/scaffold.sh" --dry-run
bash "$SV/scripts/scaffold.sh"
```

Preserves user content; writes only inside the project.

### 2. Analyze

```bash
node "$SV/scripts/analyze.mjs" --estimate
node "$SV/scripts/analyze.mjs"
```

Deterministic. No model judgment happens here — this stage reports what a
parser observed (components, manifests, CI steps, routes, languages), never
what it concluded. Every later stage reads this file as shared ground truth
rather than re-deriving its own view of the repository, which is what keeps
four independent passes in stage 3 from drifting apart.

This output also decides stage 3's shape. Fan out to isolated passes when
the sensor dump shows more than one detected stack, more than one
component, or a file count past a size where one continuous pass would
plausibly conflate unrelated subsystems. Otherwise run stage 3 as a single
combined pass. Pick the smaller shape when the signal is ambiguous — the
isolation is bought for accuracy on a genuinely large or mixed repository,
not for speed, and a single pass is simpler when nothing forces the split.

### 3. Knowledge

Read `references/stages/knowledge.md` for the full method and the required
content of each of the five files. In outline:

- **Fan-out shape** (`native-parallel` or `native-sequential`, multi-stack
  or large): dispatch four isolated passes — stack, architecture, schema,
  commands — each given only the stage-2 sensor dump and its own question,
  never the other three passes' output. Then run **decisions** as a fifth,
  sequential pass that reads all four results; it is synthesis of the
  others, not a narrow domain read, so it cannot run isolated from them.
- **Combined shape** (small, single-stack, or dispatch tier `none`): one
  pass produces all five files in sequence, in the same session. If the
  dispatch tier is `none` on a repository large enough that the fan-out
  shape would otherwise apply, run the four passes and decisions
  sequentially in this same session anyway, and say in the index that
  verification of independence does not apply this run.

Every claim in every file carries `OBSERVED` (with `path:line`),
`INFERRED` (with its basis), or `UNKNOWN` (with what would resolve it).
There is no fourth tag. A claim that cannot be pinned to one of these three
does not go in the file.

### 4. Rules

Read `references/stages/rules.md`. Two outputs, never merged, never given
equal authority:

- **Enforced rules** — `node "$SV/scripts/rules.mjs"`. A rule enters only
  if a command fails when it is broken. This is mechanical and repo-specific;
  nothing here is copied from outside the project.
- **Stack idioms** — curated once per stack, shipped inside this kit, never
  freshly generated per project. Detect the project's stack from the stage-2
  sensor dump and copy the matching curated file(s) into the host's rules
  directory (from `references/targets.yml`) so the IDE loads them
  unconditionally, the same way it loads this project's own enforced rules.
  Label them distinctly in the file itself — `STACK CONVENTION, not enforced
  by a gate in this repository` — so nothing downstream mistakes a general
  convention for something this repository actually checks.
  **Not yet populated in this kit**: no curated idiom source exists yet to
  copy from. Until one does, skip this half and say so in the readiness
  report rather than inventing idiom text at survey time.

Regenerate both through the existing generated-block markers so a rerun
updates the block and preserves anything written below it. Stage 3 and this
stage's enforced-rules half share one marker/snapshot convention — reuse
`scripts/artifact-support.mjs` (`stamp`, `writeManaged`) rather than
reimplementing it; it is the one file in `scripts/` not yet wired into a
stage, reserved for exactly this.

### 5. Verify

```bash
bash "$SV/scripts/doctor.sh"
```

`doctor.sh` checks structure and detectable consistency; it cannot prove a
model's claims. Beyond it, an independent pass — isolated when the dispatch
tier allows it, sequential and disclosed as non-independent when it does
not — re-checks:

- every `path:line` citation in the five knowledge files actually resolves
  (mechanical: file exists, line is in range)
- the five files do not contradict each other on the same fact
- component coverage, claimed enforcement, and usefulness for a realistic
  request

Repair unsupported claims. Leave what remains unresolved as `UNKNOWN` —
never renew a claim's confidence just because a rerun touched its file.

### 6. Index

One file, `00-index.md`: which of the five knowledge files answers which
question, and which role in this kit consumes each. This is the actual
payoff of the whole survey — the thing every other skill reads first,
instead of the repository.

## Refresh

Hash each knowledge file's cited sources. On rerun, reprocess only the
files whose sources changed; leave the rest untouched. A changed sensor
dump invalidates the synthesis that read it — compare retained judgments
against fresh evidence before keeping them, never renew trust through a
timestamp alone.

## Boundaries

- Never modify application code.
- Never write outside the project root, except the host's rules directory
  named in `references/targets.yml`.
- Never edit a generated block by hand; edit outside the markers or rerun
  the stage that owns it.
- Never present `INFERRED` or `UNKNOWN` as `OBSERVED`.
- Never let a stack-idiom file carry the same authority as this project's
  own enforced rules or its own docs — the project always outranks the kit.
