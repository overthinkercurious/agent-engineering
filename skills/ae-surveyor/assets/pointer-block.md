## Project knowledge

This project was surveyed by [agent-engineering](https://github.com/__KIT_REPO__).

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
npx skills@1.7.0 add __KIT_REPO__ --agent AGENT_ID --copy -y
```

Replace `AGENT_ID` with the current IDE's identifier from the installation table
in the linked Agent Engineering README.

Then ask the agent to run the survey. If the knowledge base looks out of date,
re-run it: only the sections whose sources actually changed are regenerated.
