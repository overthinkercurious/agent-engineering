# Stage 4 - Rules

Owner of `.dev/rules/`. Record what the project enforces with exact scope.
The analyzer discovers candidate commands; it does not execute or certify them.

## Admission

A rule needs an inspected command or check that fails when that exact rule is
broken. Read the configuration or test, not just its name.

| Candidate | Decision |
|---|---|
| TypeScript checks must pass | Admit when a real typecheck command exists |
| No explicit any, enforced by strict mode | Reject: strict mode permits explicit any |
| Every changed risk file gets a new test, enforced by npm test | Reject: passing tests do not prove a test was added |
| No lint warnings | Admit only if the command fails on warnings |
| Payloads are scrubbed before logging | A direct-call grep proves call placement only; inspect scrubbing tests |

For stack claims needing external documentation, consult official documentation
matching the declared version. Cite it beside local enforcement evidence.
Research cannot create enforcement; avoid a generic best-practice catalog.

## Scope and results

Record command, project-relative cwd, shell, environment variable names,
infrastructure/device prerequisites and covered behavior. Never store secret
values. Preserve CI conditionals and expressions as CI context; an incomplete
shell block is not a local command.

Run safe relevant checks within task authority. CI discovery does not authorize
deployments, live data changes, paid calls, dependency installation or device
mutation. Record blocked/not-run checks and their missing prerequisites.

Use rows with Rule, Enforced by, Scope/cwd, Existing violations, and Evidence.
Derive counts from the check or reproducible inspection; use UNKNOWN until
measured, never a default zero. A failing suite is a failing-check baseline,
not necessarily a count of violating files.

Existing debt should not force unrelated repairs. Describe ratcheting only
when tooling supports it; a global check may still fail on old debt. Report
that failure instead of claiming that changed files pass.

## Gaps

Keep unenforced invariants and needed checks in knowledge Notes as gaps.
When no gate is detected, inspect known build/CI files before concluding checks
are absent. Never admit placeholder enforcement. Do not edit application or CI
configuration to manufacture gates during initialization.
