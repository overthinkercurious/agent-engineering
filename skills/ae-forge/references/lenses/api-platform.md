# API platform lens (contracts, compatibility, and evolution)

## Exclusive constraint

Adds contract-evolution depth to Architect's boundary decisions and Builder's
implementation: what a published interface promises, which changes break that
promise, and how a change reaches existing callers safely. Architect still
owns the design; this lens owns whether the interface can change without
breaking someone.

## Activates

Signals: `api`, `endpoint`, `contract`, `schema-change`, `versioning`,
`openapi`, `graphql`, `grpc`, `webhook`, `sdk`, or any change to a surface
consumed outside the module that defines it.

Skip for a purely internal function with all callers in this repository and no
serialization boundary — that is an ordinary refactor, and the caller sweep in
`builder.md` already covers it.

## Checklist

**Establish the contract (Architect)**

1. Identify the actual contract and who consumes it: internal callers, other
   services, third-party clients, mobile app versions still in the field. A
   mobile client is the hard case — old versions persist for months.
2. Determine whether the contract is published or merely exposed. A published
   contract can only change compatibly; an exposed internal one can change
   with a caller sweep.
3. Check whether the project's declared versioning scheme already answers this
   change, before inventing a mechanism for it.

**Classify the change (Architect)**

4. Treat as breaking: removing or renaming a field or endpoint, narrowing an
   accepted type or range, adding a required request field, changing a
   default, changing an error code or status, and tightening validation on
   data that previously passed.
5. Treat as compatible: adding an optional request field, adding a response
   field, adding an endpoint, and widening an accepted range — provided
   consumers are known to ignore unknown fields rather than rejecting them.
   Verify that assumption rather than relying on it.
6. Watch the quiet breaks: changing a field's meaning while keeping its type,
   changing ordering that a client relies on, changing pagination behaviour,
   and changing nullability in either direction.

**Evolve safely (Architect, Builder)**

7. For a breaking change, define the path: add the new shape, migrate
   consumers, then remove the old one — with a stated deprecation window and a
   way to observe remaining usage before removal.
8. Confirm the deprecation is discoverable by a consumer: a documented notice,
   a response header, or a log the consumer's operator can see. A changelog
   entry nobody subscribes to is not notice.
9. Check that error responses are part of the contract: stable codes, a shape
   clients can branch on, and messages that do not leak internal detail.
10. Check pagination, filtering, and sorting defaults — changing a default
    page size is a behavioural break for a client that assumed it.

**Verify the contract (Builder, Verifier)**

11. Confirm the machine-readable definition, the implementation, and the
    documentation agree. Where the project generates one from another, confirm
    the generation actually ran.
12. Confirm a test exercises the contract itself — request and response shape
    against the definition — not only the handler's internals.

## Evidence

Report which consumers were identified and how. An unenumerated consumer set
makes every compatibility claim provisional; say so rather than implying a
sweep that did not happen.

## Findings

Every finding names the contract, the specific change, the consumer class it
breaks, and what the consumer observes when it breaks. "Breaking change"
without naming who breaks is not actionable.

## Authority

This lens narrows what a role must check; it never outranks the project's own
versioning policy, deprecation window, or an enforced contract gate. Where the
project declares a policy, that wins and this lens records the difference as a
finding rather than applying its own default.

## Hands off

Does not own: authentication and authorization on the endpoint (Security),
persisted shape behind it (Data), runtime resilience and rate limiting
(Reliability), the user journey the API serves (Experience), or the final
delivery verdict (Verifier).
