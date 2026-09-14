# Audit

Reclassify the completed diff, then route applicable specialist audits. Audit
contexts receive the approved artifacts, exact candidate diff, relevant project
context, and their own workflow. They do not inherit implementation reasoning.

## Findings

Every finding states severity, violated intent or invariant, evidence, affected
behavior, smallest valid repair, and verification method. Record all findings
and their disposition under `reviews/`.

Dispatch focused repairs for actionable findings. Re-review only the repair and
its affected behavior. Count repeated failures by normalized finding cause, not
by raw command failure count. Escalate when a critical or high finding remains
after the configured repair budget.

## Verify

Run the project's required commands on the exact candidate revision and store
receipts under `verification/`. Exercise accepted user journeys in a realistic
preview. Include loading, empty, error, recovery, accessibility, authorization,
migration, performance, or dependency-failure evidence when routed by risk.
