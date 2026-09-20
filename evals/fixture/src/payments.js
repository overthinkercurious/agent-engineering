// PLANTED DEFECT: non-idempotent-retry
// The retry wrapper re-POSTs a charge with no idempotency key, so a timeout
// that actually succeeded upstream produces a duplicate charge.
export async function chargeWithRetry(http, amount, card) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await http.post('/v1/charges', { amount, card })
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
}
