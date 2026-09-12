# Stage 3 — Knowledge

Owner of `.dev/knowledge/`. Runs after `analyze.mjs`, before `rules.mjs`.

`knowledge.mjs` has already written every fact it could extract. Your job is
only the `TODO (judgment)` slots. Do not restate the tables; a reader who wants
the dependency list will read the dependency list.

## 1. Read exactly the selected files

`selection.files` in `.dev/context/analysis.json` is the list, already ranked.
Read those and nothing else. Reading more blows the budget the user approved;
reading fewer makes the synthesis guesswork.

`ranking` says why each file was chosen — `fan_in`, `churn`, `loc`, `risk`,
`has_test`, `must_read`. Use it to decide reading order: highest `fan_in`
first, because those are the files everything else depends on.

## 2. Fill the slots in place

Each slot sits inside the managed block, between
`<!-- agent-engineering:start -->` and `<!-- agent-engineering:end -->`.
Replace the whole `> **TODO (judgment).** …` quote block with your answer.
Leave every table above it exactly as generated.

A re-run of `knowledge.mjs` regenerates the block and your answers go with it.
That is deliberate: the facts and the judgment about them belong to the same
snapshot. Anything you want to survive a re-run goes under `## Notes`, outside
the markers.

## 3. What a good answer looks like

**Name files.** "Auth is handled in middleware" is unusable. "`src/mw/auth.ts`
validates the JWT and attaches `req.user`; every route in `src/api/` assumes it
ran" can be acted on.

**Answer the question that was asked.** The slots are deliberately specific.
The most valuable one is the conventions disagreement — two files that solve
the same problem differently. A codebase with two competing conventions will
grow a third unless the disagreement is written down.

**Mark your confidence.**

| You | Write |
|---|---|
| read the file and saw it | state it plainly |
| concluded it from files you read | prefix `INFERRED:` |
| cannot tell from what you read | `UNKNOWN` — and say what you would need to read |

`UNKNOWN` is a finding, not a failure. It tells the next session where the map
runs out. A confident wrong answer costs more than a blank, because everything
downstream trusts this file.

**Say what surprised you.** If the code contradicts its own README, or two
modules disagree about what a core term means, that belongs in the notes. It is
the single most expensive thing for a new contributor to discover alone.

## 4. Do not

- Do not edit the generated tables, even to fix something you believe is wrong.
  If a fact is wrong, the parser is wrong: record it under `## Notes` and say so.
- Do not add documents. The five are a fixed set so that later sessions can load
  one by name without listing the directory. Extra context goes in `## Notes`.
- Do not describe what the project should do. This is a description of what is
  there, including the parts that are bad. Improvements are tasks, not knowledge.
- Do not pad. Every sentence that says nothing costs tokens in every future
  session that loads the file.
