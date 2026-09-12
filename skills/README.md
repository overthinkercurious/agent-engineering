# Suite layout

Every directory containing a `SKILL.md` is installed as a skill. **Install
flattens the tree**: `skills/stages/ae-frame/` would become
`.claude/skills/ae-frame/`. So subdirectories here are for humans reading the
repo, and skill names are global identifiers that must not collide.

That is why every name carries the `ae-` prefix. It also lets the generated
`.gitignore` exclude the suite with `.claude/skills/ae-*/` while leaving skills
the user wrote themselves tracked.

## Current

```
skills/
└── ae-setup/                 # the single entry point                  [BUILT]
    ├── SKILL.md              # the four-stage chain
    ├── scripts/              # deterministic stage owners
    ├── references/stages/    # model-driven stage owners
    └── assets/               # templates written into target projects
```

One installed skill, not four. Setup, analysis, knowledge and rules are stages
of one operation with one entry point, so they are one skill whose body routes
between owners — not four skills competing to trigger on the same sentence.

## Target shape

```
skills/
├── ae-setup/                 # install, analyze, generate                [BUILT]
│
├── ae-orchestrate/           # the work entry point                    [Phase 7]
│   └── references/
│       ├── manifest.yml      # one ~60-token entry per specialist
│       └── specialists/
│           ├── performance/  # perf-db-query.md, bundle.md, ...
│           ├── security/     # sec-tenancy.md, secrets.md, ...
│           └── data/         # migration-safety.md, indexing.md, ...
│
└── stages/                   # the fixed pipeline                    [Phase 7/9]
    ├── ae-frame/     ae-diagnose/    ae-architect/
    └── ae-implement/ ae-qa/          ae-release/
```

Roughly eight installed skills, not eighty.

## Why stages and specialists are reference files, not skills

Skill metadata is always in context, about 100 words per skill. Eighty
installed specialists would put close to 10k tokens into every session before
any work starts, and would put eighty deliberately pushy descriptions in
competition to fire. Trigger precision gets worse as the roster grows, which
defeats the point of a deep roster.

As reference files they cost nothing until something routes to one. They stay
reachable by name: the orchestrator loads `perf-db-query` by asking for that
file.

The same argument applies at small scale, which is why `ae-setup` has
`references/stages/` rather than four sibling skills.

Full reasoning in `docs/decisions/0001-specialists-are-references.md`.

## Adding a skill

Read `CONTRIBUTING.md`, then run:

```bash
npm test
```

`scripts/validate-suite.sh` enforces the naming, description, portability,
ownership and size rules mechanically. A convention that is only written down
drifts as soon as the roster grows.
