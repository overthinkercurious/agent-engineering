## Development workflow

This project uses the [agent-engineering](https://github.com/__KIT_REPO__) suite, v__KIT_VERSION__.

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

- `ENGINEERING.md` is the standards and structure contract. It is always binding.
- `.dev/tasks/` holds task records, `.dev/decisions/` holds architecture decisions.
- `.dev/knowledge/` and `.dev/rules/` are generated but committed. Content between
  the `agent-engineering` markers is rewritten on every run; anything outside them
  is preserved, so corrections go under `## Notes`.
- `.dev/scratch/`, `.dev/context/` and `.dev/evidence/` are working space. Nothing
  there survives by default.
- Never write a file outside the scratch zone unless a task design named that file.

**The suite itself is not committed to this repository.** It is a dependency,
listed in `skills-lock.json` and gitignored. In a fresh clone, restore it with:

```bash
npx skills add __KIT_REPO__ --copy -y
```

then ask the agent to set up agent-engineering. Check install health any time
with `bash .dev/kit/scripts/doctor.sh`; if that path does not exist, the suite
is not installed in this clone yet.

If the knowledge base looks out of date, re-run setup. Every stage is
idempotent and the facts are regenerated from the current code.
