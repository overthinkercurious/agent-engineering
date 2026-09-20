# Payments lens (money movement and its invariants)

## Exclusive constraint

Adds money-movement depth to Security's payment boundary and Data's
persistent-state boundary: exactly-once intent, amounts that cannot drift, and
reconciliation when the two systems disagree. Security still owns who may pay;
this lens owns whether the amount is right and charged once.

## Activates

Signals: `payments`, `charge`, `refund`, `invoice`, `subscription`,
`checkout`, `payout`, `ledger`, or a detected payment SDK in the project.

Skip when the change cannot affect an amount, a charge, an entitlement, or a
financial record.

## Checklist

**Charge exactly once (Security, Reliability)**

1. Confirm every mutating call carries an idempotency key derived from the
   business intent, not from a retry counter or a timestamp.
2. Confirm a timeout is treated as UNKNOWN, never as failure. Retrying a
   request that actually succeeded is the classic double charge.
3. Confirm webhooks are verified by signature, deduplicated by event id, and
   safe to process out of order and more than once.
4. Confirm the client cannot choose the amount, the currency, or the item
   price. Trust the server's computed intent, never the submitted one.

**Keep the amount exact (Data)**

5. Confirm money is an integer in the currency's minor unit, or an exact
   decimal type. Floating point on a money path is a defect, not a rounding
   preference.
6. Confirm currency travels with every amount, and that no arithmetic mixes
   currencies implicitly.
7. Confirm rounding happens once, at a defined point, in a defined direction,
   and that tax, discount and fee ordering is fixed rather than incidental.

**Keep the record truthful (Data)**

8. Confirm financial records are append-only: a correction supersedes, it does
   not overwrite. A mutated charge row destroys the audit trail.
9. Confirm local state and provider state can be reconciled, and that the
   provider is the source of truth for what actually moved.
10. Confirm a partial failure - charged upstream, not recorded locally - is
    detectable and recoverable, and say which side wins.

**Refunds and entitlement (Security, Data)**

11. Confirm a refund cannot exceed the captured amount, in aggregate across
    partial refunds, and cannot be replayed.
12. Confirm entitlement changes follow the settled payment state rather than
    the optimistic client one.

**Handle the sensitive parts (Security)**

13. Confirm card data never reaches your servers or logs where a hosted field
    or token is available; name the compliance scope this change moves into or
    out of.
14. Confirm amounts, failures and reconciliation gaps are observable to an
    operator without exposing personal or card data.

## Evidence

Name the provider, the exact call, and the idempotency strategy inspected.
Report whether duplicate, delayed and out-of-order delivery were exercised in
a sandbox or only reasoned about - a payment path reviewed only on the happy
path has not been reviewed.

## Findings

Every finding names the money-path step, the failure that triggers it, and
what a user or the business loses. "Not idempotent" is not actionable; "a
gateway timeout on checkout charges the customer twice and records one order"
is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
financial invariants, its provider's documented semantics, or an enforced
gate. Where the project declares a money representation or a reconciliation
policy, that wins and this lens records the difference as a finding.

## Hands off

Does not own: general authorization (Security), general schema migration
mechanics (Data), general retry and queue design (Reliability), the checkout
journey and its states (Experience), or the final delivery verdict (Verifier).
