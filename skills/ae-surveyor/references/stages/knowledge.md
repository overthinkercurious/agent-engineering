# Stage 3 - Knowledge

Owner of `.dev/knowledge/`. Runs after Analyze and before Rules. Produces
five files — `stack.md`, `architecture.md`, `schema.md`, `commands.md`,
`decisions.md` — never a sixth, and never a parallel documentation tree.
Expand these five; do not invent a new one.

## Choose the shape first

Read `.dev/context/analysis.json`, the stage-2 sensor dump, before writing
anything. It decides how this stage runs:

- **Fan out** when the dump shows more than one detected stack, more than
  one component, or a file count past the point where one continuous
  reading pass would plausibly conflate unrelated subsystems. Dispatch four
  isolated passes — `stack`, `architecture`, `schema`, `commands` — each
  given only the sensor dump and its own question, never the other three
  passes' output or each other's existence. Use `native-parallel` or
  `native-sequential` per this host's `dispatch` tier in `targets.yml`; on
  `none`, run the same four passes sequentially in this session and say so
  in the index. Run `decisions` after, as a fifth sequential pass reading
  all four results — it is synthesis of the others, not a narrow domain
  read, so it cannot be isolated from them.
- **Combined** when none of the above apply: one pass produces all five
  files in order, in this session. Isolation buys accuracy on a genuinely
  large or mixed repository, not speed; don't pay for it on a small one.

Whichever shape runs, every pass reads the same sensor dump as its ground
truth rather than re-deriving its own view of the repository — that shared
input is what keeps independent passes from drifting apart on the same fact.

## Read for a purpose

Start with the sensor dump's control-file and high-signal-file selections:
instructions, product or architecture docs, manifests, CI. Treat
documentation as a claim until corroborated by code. Selection is a reading
plan, not proof anything was actually read — disclose what a pass skipped.

When a trace needs a file outside the selection, read it and record the
path and reason under the target file's `## Notes`. Scanner inventory and
an empty route list are discovery limits, not evidence of absence.

## Tag every claim

Use `scripts/artifact-support.mjs` (`stamp`, `writeManaged`) for the
generated-block markers and snapshot line — do not hand-roll a second
version of that convention.

Inside the block, every claim carries exactly one tag:

    OBSERVED — path:line the pass actually opened, e.g. `src/api/order.ts:42`
    INFERRED — the reasoning, stated, not just the conclusion
    UNKNOWN  — what file or check would resolve it

There is no fourth tag. `ASSUMED` does not exist in this kit. Preserve
generated facts across a rerun; a changed sensor dump invalidates the
synthesis that read it, so compare retained claims against fresh evidence
before keeping them rather than renewing trust through a timestamp alone.

## Give every document a consumer

| Document | Answers | Read by |
|---|---|---|
| stack.md | What's this built with, what may I import, what's the resolved version | every role |
| architecture.md | Components, entrypoints, who owns what, dependency direction | architect, builder |
| schema.md | What persisted state looks like, migration path, mutable vs append-only | data-focused work |
| commands.md | Exact command, cwd, shell, environment names, prerequisites, what it actually checks | builder, verifier |
| decisions.md | Why it's built this way; what was rejected and why | architect |

A repeated convention needs at least three inspected examples; a single
observation is a `## Notes` entry, not a rule. Do not call an import a
boundary violation without an established boundary, and do not treat a
passing grep as proof of a security guarantee.

## Review

Preserve user notes verbatim. Finish with a short record under the index's
`## Notes`: which shape ran, files actually inspected, unread high-signal
files, and readiness — ready for reuse, partial, or needs repair. A
generated knowledge base is not production certification of the code it
describes.
