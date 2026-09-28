# Validate the kit in use

Structural and CLI tests cannot prove that a role finds real defects. Use
independent behavioral cases when changing review methods or lens routing.
Give the evaluating agent only the request, required kit methods, and raw
repository evidence. Withhold the expected answer and proposed repair.

Use temporary projects and prohibit production writes. Start with these six
cases, including clean controls:

| Case | Raw situation | Observable result |
|---|---|---|
| Routine | trim a non-null display name while preserving null fallback | correct plan approved, no invented blockers |
| Authorization | replace authenticated organization scope with query input | concrete cross-organization access blocker |
| Stored data | drop old column before backfill and before old instances retire | preservation, coexistence, and rollback failures detected |
| Frontend | replace native button with role-only div and test pointer only | keyboard requirement blocks the plan |
| Unknown cause | retry create after persistence but before response arrives | reproduce duplicates with controls; diagnose without edits |
| Assessment | audit a correct null-safe formatter against a narrow contract | bounded zero-finding audit, freshly verified; no edits |

Score actual artifacts against expected behavior after the pass. Count missed
blockers and false blockers, whether the requested outcome completed, and any
scope or order violation. Record elapsed time and token/cost metrics only when
the host exposes them. Missing metrics are unavailable, never zero. A single
passing six-case run is a regression baseline, not a universal quality score.
Extend cases for each lens used in real projects and when a real failure occurs.

For Auditor, persist scope and exclusions before opening scoped source. For
Verifier, reopen source and execute fresh relevant checks. For plan reviews,
distinguish planned tests from tests actually executed. Record `isolated` only
when a separate context was actually supplied; a Verifier after an Auditor in
the same context records `same-session`.

## Installed host checks

From the target project, resolve the installed Forge directory and run:

```bash
node "$AE/scripts/host-smoke.mjs" --root "$PWD"
```

The check reads files and invokes the installed contract, structural validator,
and selector. It never installs or updates plugins, fabricates hook markers,
or dispatches agents. `ok` means distribution checks passed; host loading,
hook observation, and actual isolated dispatch have separate evidence fields.

Then invoke Forge in a new conversation in the host actually used, perform one
routine delivery in an isolated fixture, and inspect the run artifact. Confirm
four-role routing, complete review results, actual review context, and the
current session's enforcement marker if hooks are expected. Exercise a denied
source edit during Plan and an allowed edit during Build. Repeat this for each
host in use. A host capability table or a directly executed hook is not proof
that the host loads that hook.

Hook limits remain explicit: only configured edit tools are intercepted;
shell writes, unsupported/malformed events, and hosts that do not load hooks
are outside this enforcement. Separate checkouts prevent concurrent chats
from changing one another's candidate. Ledger validation is not a sandbox.

## Antigravity workspace hook

The optional `assets/antigravity-hooks.json` defines the kit-owned entry for
`.agents/hooks.json`. Merge that named entry into the existing workspace file;
preserve unrelated hooks. It assumes the preferred `.agents/skills` install
path. The adapter handles Antigravity's camelCase payloads, TargetFile paths,
PreInvocation session evidence, and JSON allow/deny responses. Do not use the
Claude exit-code event shape for this host. PreInvocation supplies the actual
conversation ID; use it as `--session` on Forge start/focus and contract checks.
Configuration alone never establishes that the running host loaded the hook.

Format verified 2026-09-28 against [Antigravity's official hooks documentation](https://www.antigravity.google/docs/hooks/).
