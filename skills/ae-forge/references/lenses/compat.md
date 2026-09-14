# Compat — backward-compatibility lens

## Contract metadata

- **ID/version:** `compat` / `1`
- **Covers:** compatibility and contracts
- **Escalates to:** `spine`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when a specific interface, API, schema, wire message, or dependency
version that already has existing callers or consumers is being changed —
a field added, removed, renamed, retyped, or given new semantics; a status
or error code repurposed; a dependency version bump. Do not activate for
designing a brand-new interface with no current callers, for internal
refactors that touch no public shape, or solely because a filename contains
`api` or `schema`: the trigger is an existing contract changing, not a
keyword match. Do not use Compat to design the replacement contract, choose
sync/async shape, or decide data ownership — that is Spine's remit.

## Inputs and missing inputs

Read the current contract as it exists today (schema, endpoint, or message
definition, including its version), the diff or description of the proposed
change, and the list of existing callers/consumers of that contract. For a
dependency bump, read the dependency's changelog or diff between the current
and target version plus this codebase's actual usage of the affected
surface. If the current contract is missing, return `needs_input` naming
`current_interface_contract`. If the caller list is missing, return
`needs_input` naming `existing_callers`. Never infer who calls an interface
from the interface's own definition — an unlisted caller is not evidence
that none exist.

## Questions and procedure

1. Diff the proposed shape against the current shape field by field (or
   parameter by parameter, or enum value by enum value): what was added,
   removed, renamed, retyped, or marked required that was previously
   optional.
2. For each removed, renamed, or newly required field or parameter, check
   whether any enumerated existing caller sends or omits it in a way the new
   shape rejects. A shape-only diff is not sufficient — trace it against the
   actual caller list, not against a guess at who probably calls it.
3. For each field that keeps its name and type, check for a semantic change:
   does the same field now mean something different (a timestamp that used
   to record creation now records the latest update; a count that used to
   exclude soft-deleted rows now includes them). A field that is
   shape-compatible but semantically changed is still breaking if a caller's
   logic depends on the old meaning.
4. For a dependency version bump, check the target version's changelog for
   breaking changes and confirm, against this codebase's actual call sites,
   whether any changed or removed API is in use. A version bump with no
   changelog check is `ASSUMED` safe, not `OBSERVED` safe.
5. Classify the net change as additive-only (every enumerated caller keeps
   working unmodified) or breaking (at least one enumerated caller fails or
   silently misbehaves), and state which caller and which clause of the diff
   causes a breaking classification.
6. Cite the smallest current evidence — the specific diff line and the
   specific caller — that supports each classification.

The intermediate deliverable is a compact table of changed field/parameter/
dependency surface, old behavior, new behavior, affected caller(s), and
additive/breaking disposition.

## Evidence and finding taxonomy

Required evidence is the current contract, the proposed contract or diff,
the enumerated caller list, and — for a dependency bump — the changelog or
diff plus the codebase's usage of the affected surface. Finding categories
are breaking removal/rename, breaking new-required field, breaking semantic
change on an unchanged field/shape, and unverified dependency bump (a bump
shipped without checking its changelog against actual usage). Severity
follows the shared finding contract and the number and criticality of
affected callers; it is not inferred from how small the diff looks.

## Non-decisions and escalation

Compat does not design the replacement contract, choose a versioning or
migration strategy, decide synchronous versus asynchronous shape, or decide
which system should own the data or behavior — those are Spine's design
decisions. Compat's job stops at classifying whether a specific change to an
existing contract is additive or breaking and citing the evidence for that
classification. Escalate to Spine whenever a change classifies as breaking
(Spine must decide the compatibility path: version bump, shim, or deprecation
window) and whenever the current contract or caller list is present but
Compat cannot resolve whether a given caller is affected (an ambiguous or
partial caller list). Return the request to Forge; do not dispatch Spine.

## Stop conditions

Stop once every changed field, parameter, enum value, or dependency surface
has a current-evidence-backed additive/breaking classification, or once a
missing-input/escalation condition is recorded. Stop immediately on a stale
contract snapshot, a missing caller list, forbidden access to the caller
code, or satisfied coverage. Do not invent a finding to justify the lens,
and do not accept "it looks like one field" as a substitute for checking the
field's actual required/optional marking and semantics.

## Examples

### Valid worked example

The `GET /invoices/{id}` response is changing `paidAt` from "set when the
invoice is marked paid" to "set when the invoice record was last modified"
— same field name, same type (nullable timestamp), different meaning.
Compat traces the enumerated caller `billing-dashboard`, which reads
`paidAt` to decide whether to show a "Paid" badge, and finds it would now
show "Paid" after an unrelated edit to an unpaid invoice. This is a breaking
semantic change despite an unchanged shape. Compat emits:

```json
{
  "schema": 2,
  "id": "finding:1a2b3c4d5e6f7890",
  "lens": "compat",
  "severity": "high",
  "criterion": "existing callers of a changed field retain its documented meaning",
  "invariant": "paidAt reflects the invoice's paid timestamp, not its last-modified timestamp",
  "evidence_ids": ["diff:invoices-service#paidAt", "caller:billing-dashboard#paid-badge"],
  "affected_behavior": "billing-dashboard shows a Paid badge on invoices that were edited but never paid",
  "smallest_repair": "add a new updatedAt field for the modification timestamp and leave paidAt's meaning unchanged",
  "verification": "replay billing-dashboard's badge logic against an edited-but-unpaid invoice fixture and confirm no Paid badge is shown",
  "status": "open"
}
```

(`id` is the canonical hash of `criterion`, `invariant`, `affected_behavior`,
and `evidence_ids`, computed the same way `findingId` computes it — Compat
does not choose it by hand.)

### Misleading example

"We didn't change the field's name or type, so this is backward compatible"
is rejected: `paidAt` kept its name and type but changed what event sets it,
and `billing-dashboard`'s badge logic depends on that meaning, not just on
the field's presence and type. A shape-compatible diff can still be a
breaking change, and Compat does not accept "the shape didn't change" as
proof that no caller is affected.

### Missing-input example

Given a proposed dependency bump from `payments-sdk@2.4.0` to `3.0.0` with
its changelog attached but no record of which of this codebase's call sites
use the SDK surfaces the changelog marks as breaking, Compat returns
`needs_input` naming `existing_callers` (here, the codebase's own call sites
acting as the "callers" of the SDK's changed surface). It does not assume
the bump is safe because the changelog "only mentions a few edge cases," and
it escalates the unresolved breaking-change question to `spine` once the
missing call-site inventory is supplied and still shows an affected surface.
