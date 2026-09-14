// Seeded Beta flagship defect: the payment charge handler has no
// idempotency-key check, so a retried or concurrent request with the same
// idempotencyKey appends a second charge to the ledger instead of returning
// the first one.
export function chargeCustomer(ledger, request) {
  const charge = {
    id: `charge_${ledger.length + 1}`,
    customerId: request.customerId,
    amountCents: request.amountCents,
    idempotencyKey: request.idempotencyKey,
  }
  ledger.push(charge)
  return charge
}
