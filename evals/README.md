# Evals

Before this existed, every change to the kit was unfalsifiable: add a lens,
deepen a role, re-tier a request — and there was no way to tell whether it
helped, did nothing, or made things worse. `test-forge.mjs` proves the ledger
enforces its rules; nothing proved the *workflow produced good outcomes*.

Two layers, one source of truth (`cases.json`).

## Layer A — routing (deterministic, runs in `npm test`)

```bash
node scripts/test-evals.mjs
```

Routing is a pure function of its inputs, so every golden case asserts the
tier, team, skip set and approval requirement that `forge.mjs start` produces.
Change `chooseTeam` and these fail.

It also checks that **every planted defect is owned by a role the case
actually routes to**. A defect nobody was selected to find is an un-gradeable
case, not a hard one.

> Layer A found a real bug on its first run: `lens-select.mjs`'s CLI guard
> compared `import.meta.url` against a hand-built `file://${process.argv[1]}`,
> which never matches on Windows or on any relative invocation. The CLI had
> been silently printing nothing while `team.md` instructed the model to run
> it. The unit test missed it by importing the function directly.

## Layer B — depth (needs a model)

Layer A proves the right specialist was **called**. Only Layer B proves the
specialist was deep enough to **find something** — and that distinction
matters, because a routing failure and a depth failure look identical from the
outside and are fixed in completely different places.

Run each case's `request` against `evals/fixture/` with a real model and grade:

| Question | Where the answer comes from | Diagnosis if wrong |
|---|---|---|
| Did the model pick `expect_risk` itself? | the routing block it prints | routing judgment — tighten the flag definitions in `team.json` |
| Did the routed team match `expect`? | `forge.mjs report` | router regression — Layer A should have caught it |
| Did the owning specialist catch the planted defect? | the report's `Caught` line | **depth** — the role file or its lens is too shallow |
| Did it catch it at `min_severity` or above? | `Caught` line | calibration |
| Did anything get caught that was *not* planted? | `Caught` line | either a real find or a false positive; judge it |

### Planted defects

Each is labelled in-file in `evals/fixture/`, so a grader can confirm what was
supposed to be found.

| Defect | File | Owner | Severity |
|---|---|---|---|
| `idor` — reads by id with no ownership check | `src/orders.js` | security | high |
| `unbounded-query` — no LIMIT on a growing table | `src/orders.js` | reliability | high |
| `non-idempotent-retry` — re-POSTs a charge with no idempotency key | `src/payments.js` | reliability | critical |
| `no-reduced-motion` — infinite animation, no `prefers-reduced-motion` | `web/banner.css` | experience | medium |
| `low-contrast` — ~2.8:1 against a 4.5:1 AA threshold | `web/banner.css` | experience | medium |

### Reading the results

Run the suite against each target model and host to turn "works with any model
and any IDE" from an architectural argument into a table. The same numbers
answer the routing-ROI question:

- a specialist selected often whose `Caught` line is always empty is
  **over-triggered** — it is pure cost;
- a defect surfacing in a role's boundary while that role sits in `Skipped` is
  **under-triggered** — and `Skipped` already names the reason to fix;
- the Verifier repeatedly catching what a specialist missed is a **depth** gap,
  not a routing one.

## Adding a case

Add to `cases.json`. A case needs `request`, `kind`, `expect_risk`, and an
`expect` block; add `planted` only when you also add the defect to the fixture
and name an owner the case routes to. Keep the fixture small — it is a grading
instrument, not a sample application.
