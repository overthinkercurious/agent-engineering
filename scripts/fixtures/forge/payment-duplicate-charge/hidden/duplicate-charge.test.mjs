import assert from 'node:assert/strict'
import test from 'node:test'
import { chargeCustomer } from '../src/charge.mjs'

test('a retried request with the same idempotency key charges exactly once', () => {
  const ledger = []
  chargeCustomer(ledger, { customerId: 'cust_1', amountCents: 4200, idempotencyKey: 'idem-abc' })
  chargeCustomer(ledger, { customerId: 'cust_1', amountCents: 4200, idempotencyKey: 'idem-abc' })
  assert.equal(ledger.length, 1)
})

test('two concurrent requests sharing an idempotency key still result in one charge', () => {
  const ledger = []
  const first = chargeCustomer(ledger, { customerId: 'cust_2', amountCents: 1000, idempotencyKey: 'idem-xyz' })
  const second = chargeCustomer(ledger, { customerId: 'cust_2', amountCents: 1000, idempotencyKey: 'idem-xyz' })
  assert.equal(ledger.length, 1)
  assert.equal(first.id, second.id)
})

test('requests with different idempotency keys each still charge', () => {
  const ledger = []
  chargeCustomer(ledger, { customerId: 'cust_3', amountCents: 500, idempotencyKey: 'idem-1' })
  chargeCustomer(ledger, { customerId: 'cust_3', amountCents: 500, idempotencyKey: 'idem-2' })
  assert.equal(ledger.length, 2)
})
