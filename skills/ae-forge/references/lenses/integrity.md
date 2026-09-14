# Integrity

**Covers:** data integrity and concurrency. **Escalates to:** Shift.

- State the invariant before selecting storage or transaction mechanics.
- Define ownership, uniqueness, ordering, and consistency requirements.
- Consider duplicate, delayed, concurrent, and partially completed operations.
- Keep validation at every boundary that can violate the invariant.
- Test interleavings or idempotency where races matter.

Required evidence: invariants and checks that fail when they break.
Will not own schema migration or retention policy.
