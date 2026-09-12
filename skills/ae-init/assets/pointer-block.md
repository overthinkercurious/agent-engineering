## Project knowledge

This project was indexed by [agent-engineering](https://github.com/__KIT_REPO__).

**Start here:** `.dev/knowledge/00-index.md` routes you to the one document
that answers your question. Read that document, not all of them.

| Question | Document |
|---|---|
| What is this built with? | `.dev/knowledge/10-stack.md` |
| How do I run and test it? | `.dev/knowledge/20-commands.md` |
| How is it shaped? What breaks if I change this? | `.dev/knowledge/30-architecture.md` |
| What is expensive to get wrong? | `.dev/knowledge/40-risks.md` |
| How is code written here? | `.dev/knowledge/50-conventions.md` |
| What is enforced, and by which command? | `.dev/rules/00-index.md` |

These documents are generated but committed. Content between the
`agent-engineering` markers is rewritten on every run; anything outside the
markers is preserved, so corrections go under `## Notes`.

Facts in a managed block came from a parser, not from a model, and are safe to
rely on. A slot still reading `TODO (judgment)` has not been answered yet.
Anything marked `INFERRED` was derived rather than read; anything marked
`UNKNOWN` is a gap, not an oversight.

`.dev/context/` holds the raw analysis dump. It is regenerated on every run and
is not committed.

**The suite itself is not committed to this repository.** It is a dependency,
listed in `skills-lock.json` and gitignored. In a fresh clone, restore it with:

```bash
npx skills add __KIT_REPO__ --copy -y
```

then ask the agent to run ae-init. If the knowledge base looks out of date,
re-run it: every stage is idempotent and the facts are regenerated from the
current code.
