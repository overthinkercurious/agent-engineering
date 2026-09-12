# Stage 4 — Rules

Owner of `.dev/rules/`. Runs last, after the knowledge base exists.

`rules.mjs` has already derived the rules whose enforcement this project
already has. Your job is to add the stack-specific ones — and to refuse most of
the candidates you think of.

## The admission test

> A rule is admitted only if it names a command that fails when the rule is
> broken.

Apply it before writing anything. A rule with no enforcement is a suggestion,
suggestions accumulate, and a rules file nobody finishes reading enforces
nothing at all. Three rules with exit codes behind them beat thirty without.

| Candidate | Verdict |
|---|---|
| "Prefer composition over inheritance" | reject — nothing fails |
| "No `any` in new code" | admit — `npm run typecheck` fails |
| "Handlers must validate input" | reject as written; admit if a lint rule or a test asserts it |
| "Migrations must be reversible" | admit only if a command checks it |

If a rule matters but has no enforcement, do not write it as a rule. Write it
as a task in `.dev/tasks/`: the work is to build the check.

## 1. Research the stack, do not recall it

For each framework and runtime in `.dev/knowledge/10-stack.md`, search the
official documentation for its current recommended practice. Version matters:
a rule that was right two majors ago is now noise. Cite the source in the rule
file.

Admit a rule from research only when you can also name the command in *this*
project that enforces it. A best practice with no local enforcement is a task.

## 2. Count the violations before you write the rule

For every rule you are about to add, count how many existing files break it.
Record that number in the rule file.

This is the ratchet, and it is what makes rules adoptable in a codebase that
was not written under them:

- Rules apply to code you **change**, never to code that already exists.
- Existing breakages are **listed debt**, not a blocker on unrelated work.
- The recorded count may go down over time. It must not go up.

A rule introduced without a count is indistinguishable from a demand to stop
and fix the whole codebase, and it will be ignored on that basis.

## 3. Write it

Add rules to the derived file that already covers the area, or create a new
`NN-topic.md` and add it to the table in `00-index.md`. Each rule is a row:

| Rule | Enforced by | Existing violations |
|---|---|---|
| No new `any` | `npm run typecheck` | 12 |

Keep the rule text to one sentence. If it needs a paragraph, it is two rules or
it is not a rule.

## 4. If the project has no gates at all

`00-index.md` will say so. Do not invent rules to fill the gap — say plainly
that nothing here can be verified by exit code, and that the highest-value
change available is building one gate. Then stop. A rules file that nothing
enforces is exactly the failure this stage exists to prevent.

## Do not

- Do not copy a generic style guide. Everything here must be specific to what
  the analysis found in this project.
- Do not write a rule you cannot name the enforcing command for, even a good one.
- Do not apply rules retroactively. That is what the ratchet is for.
- Do not edit `ENGINEERING.md`. It is human-owned; if a rule belongs there,
  tell the user and let them write it.
