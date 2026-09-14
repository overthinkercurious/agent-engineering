# Plan

Create `plan/implementation.md` as an executable dependency graph rather than a
chronological essay.

## Each task declares

- Outcome and acceptance criteria it advances.
- Owner specialty and applied lenses.
- Inputs, produced interfaces, and dependencies.
- Expected files or bounded areas, labeled as an estimate.
- Implementation constraints and delegated choices.
- Focused checks and integration evidence.
- Parallelization eligibility.

Prefer vertical slices that leave behavior verifiable. Separate tasks only when
their interfaces are explicit and their work can be reviewed independently.

## Independent review

Dispatch Probe in a fresh context to write `reviews/plan-review.md`. It checks
intent traceability, missing decisions, task/interface consistency, risk
coverage, verification independence, and realistic integration. It returns
specific findings rather than a bare PASS.

Repair the plan and re-review only affected areas. Proceed when no material
finding requires a product decision or missing evidence.
