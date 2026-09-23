# Queue and messaging lens (delivery you do not control)

## Exclusive constraint

Adds asynchronous-delivery depth to Reliability's failure boundary and Data's
state boundary: what a broker actually promises, what arrives twice, what
arrives out of order, and what happens to a message nobody can process.

Reliability owns retry and recovery of a running system. This lens owns the
specific guarantees of handing work to something that will deliver it later,
possibly more than once, possibly not in the order you sent it.

## Activates

Signals: `queue`, `message`, `broker`, `kafka`, `rabbitmq`, `sqs`, `pubsub`,
`nats`, `consumer`, `producer`, `event-bus`, `worker`, `job`, `dead-letter`,
or a change that moves work across a process boundary to be done later.

Skip when the work is synchronous and in-process. A function call is not a
message, and treating it as one adds ceremony without adding a guarantee.

## Checklist

**Design (Architect)**

1. State the delivery guarantee the broker actually provides, not the one the
   design assumes. At-least-once is the common default; exactly-once is
   usually at-least-once plus consumer-side deduplication, and saying
   "exactly-once" without naming the dedupe mechanism means it does not exist.
2. State the ordering guarantee and its scope. Ordering is typically per
   partition or per key, never global, and code that assumes global order is
   correct until traffic grows.
3. Name the idempotency key before writing the consumer. "Process this twice
   safely" is a property of the key, not of care taken while coding.
4. Decide what happens on repeated failure: how many attempts, with what
   backoff, and then where. A message that retries forever is an outage that
   looks like activity.
5. Decide who reads the dead-letter queue and when. A dead-letter queue nobody
   monitors is a silent data-loss mechanism with good intentions.

**Implementation (Builder)**

6. Make the consumer idempotent at the point of effect, not at the point of
   receipt. Checking "have I seen this id" before doing the work still
   double-writes when the process dies between the write and the ack.
7. Acknowledge after the effect is durable, never before. Acking on receipt
   converts a crash into lost work.
8. Keep the payload a reference or a version-tolerant record. A consumer
   deployed before a producer will receive the new shape, so an added field
   must not break it and a removed one must not be required.
9. Bound the consumer's own work. A handler with no timeout holds a partition
   hostage while it hangs.
10. Never assume a message is recent. It may have been queued before the last
    deploy; check the state it claims rather than trusting the claim.

**Verification (Verifier)**

11. Deliver the same message twice and confirm one effect. This is the whole
    property; asserting it in a comment is not testing it.
12. Confirm a poisoned message reaches the dead-letter path rather than
    blocking the partition behind it.
13. Confirm the consumer survives a restart mid-handler without losing or
    duplicating the effect.

## Evidence

Name the broker and its configured guarantee with a source, the idempotency
key with `path:line`, the retry and dead-letter policy, and which of the
duplicate, out-of-order and restart cases were actually exercised versus
reasoned about.

## Findings

Every finding names the sequence that produces the failure — "consumer acks at
`worker.ts:31` before the write at `:38`, so a crash between them loses the
event" — not the general risk that messages can be lost.

## Authority

This lens narrows what a role must check; it never outranks the project's own
messaging conventions, its broker's documented behaviour, or an enforced gate.
Where the project has accepted at-most-once delivery deliberately, that
decision wins and this lens records the difference as a finding.

## Hands off

Does not own: general runtime failure and load behaviour (Reliability), the
schema of what is stored once consumed (Data), trust boundaries on the
producer (Security), or the final delivery verdict (Verifier).
