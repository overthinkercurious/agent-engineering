# Test automation lens (whether a test proves anything)

## Exclusive constraint

Adds test-quality depth to Builder's test changes and to Verifier's judgment
of whether a suite is meaningful. It turns "are the tests good" from an
impression into checks. Builder still owns writing them and Verifier still
owns the verdict; this lens owns the question of whether a passing test is
evidence.

## Activates

Signals: `test-automation`, `test`, `flaky`, `coverage`, `fixture`, `mock`,
`e2e`, `integration`, `regression`, or any change that adds or modifies tests
in a way the request did not obviously require.

Always activates for `kind: refactor`, where the suite is the only evidence
that behaviour did not change.

## Checklist

**Does the test fail for the right reason? (Builder, Verifier)**

1. Confirm a new test fails without the change and passes with it. A test that
   passes against unmodified code proves nothing and will never catch a
   regression.
2. Confirm the assertion is about observable behaviour, not the
   implementation's internal steps. A test asserting that a specific private
   method was called breaks on every refactor and catches no defect.
3. Confirm the test does not restate the implementation. Computing the
   expected value with the same expression the code uses asserts only that the
   machine is deterministic.
4. Confirm a mock is not the thing under test. A suite where every dependency
   is mocked proves the mocks agree with each other.

**Does it cover the real risk? (Builder, Verifier)**

5. Confirm the failure paths are exercised, not only the happy path: the
   error, the empty case, the boundary, and the concurrent or repeated call
   where those apply.
6. Confirm a bug fix carries a regression test that reproduces the original
   report — the original reproduction, not a nearby case that happens to pass.
7. Treat coverage as a map of what is untested, never as a quality score. A
   line executed without an assertion is covered and unverified.

**Will it keep working? (Builder, Reliability)**

8. Check for time, timezone, locale, ordering, and random-seed dependence.
   A test that passes only before midnight is a scheduled failure.
9. Check for inter-test dependence through shared state, fixtures, or
   execution order. A suite that passes only in one order is not a suite.
10. Check that waits are on conditions, not durations. A sleep long enough to
    pass locally is a flake on slower hardware.
11. Check that a flaky test is fixed or quarantined with an owner, never
    retried until green. A retry loop converts a real intermittent defect into
    a silent one.

**Is it honest about what ran? (Verifier)**

12. Confirm the suite ran in the project's required clean form. A cached pass
    is not a pass.
13. Confirm no test was skipped, filtered, or marked pending as part of this
    change without that being stated as a finding.
14. For `kind: refactor`, confirm the existing tests passed **unmodified**.
    Editing the tests and the code together removes the only evidence that
    behaviour was preserved.

## Evidence

Report the exact invocation and exit status, not a paraphrase. Where a test
could not be run — no device, no service, no credentials — name the exact
untested behaviour rather than reporting the suite as green.

## Findings

Every finding names the test, what it currently proves, and what it would need
to assert to prove the intended behaviour. "Needs more tests" is not a
finding; "the retry path has no test, so the duplicate-charge fix is
unverified" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
testing conventions, its declared coverage policy, or an enforced gate. Where
the project documents a required test form or a clean-test invocation, that
wins and this lens records the difference as a finding.

## Hands off

Does not own: what the software should do (Product), whether the design is
right (Architect), which risks deserve a specialist (routing), the
implementation itself (Builder), or the final delivery verdict (Verifier).
