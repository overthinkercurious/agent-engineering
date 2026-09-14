# Failure

**Covers:** failure modes and degradation. **Escalates to:** Signal.

- Enumerate timeout, unavailable, partial, malformed, and duplicate responses.
- Bound retries and make idempotency explicit.
- Preserve useful behavior when a non-critical dependency fails.
- Give operators and users actionable failure signals.
- Test the failure path rather than asserting it from code inspection.

Required evidence: injected failure behavior and recovery observation.
Will not choose service architecture or operational risk tolerance.
