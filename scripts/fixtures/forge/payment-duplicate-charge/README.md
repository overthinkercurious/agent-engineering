# Beta payment duplicate-charge fixture

This committed fixture seeds the Phase 7 Beta flagship defect: `chargeCustomer`
in `src/charge.mjs` appends a charge to the ledger unconditionally, with no
check for a prior charge sharing the same `idempotencyKey`. A retried request
(client retry, proxy retry, or queue redelivery) or two concurrent requests for
the same logical charge each append their own ledger entry, double-charging the
customer.

## Intended repair

The fix is confined to `src/charge.mjs`: before appending a new charge, look up
whether a charge with the same `idempotencyKey` already exists in the ledger,
and if so return that existing charge instead of creating a second one. This is
a small, one-function change — it does not require touching any caller, does
not change the charge shape, and does not refuse legitimate repeat charges
that use a different `idempotencyKey` (see the fixture's third test).

## Hidden checks

`hidden/duplicate-charge.test.mjs` represents grader-owned behavioral checks
and is excluded from any implementer's write scope. It asserts:

1. two calls sharing an `idempotencyKey` result in exactly one ledger entry
   (the retried-request case);
2. two "concurrent" calls sharing an `idempotencyKey` also settle to one entry
   and return the same charge (the concurrent-request case);
3. two calls with different `idempotencyKey` values each still charge (so a
   repair cannot simply refuse all repeated charges to the same customer).

The seed fails tests 1 and 2 and passes test 3. The intended repair passes all
three.

Policy variants live under `../policy/prototype` and `../policy/critical`.
