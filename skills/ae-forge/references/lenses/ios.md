# iOS lens (Apple platform behaviour and review)

## Exclusive constraint

Adds Apple-platform depth to Architect, Builder and Verifier: lifecycle and
background limits the OS enforces, permission prompts the user controls, and
the review rules that reject a build regardless of whether the code is correct.

## Activates

Signals: `ios`, `swift`, `swiftui`, `uikit`, `xcode`, `app-store`,
`testflight`, or detected Swift sources, an `.xcodeproj`, a `Podfile`, or a
`Package.swift`.

Skip for a cross-platform change with no Apple-specific behaviour; the generic
roles already cover it.

## Checklist

**Lifecycle and background (Architect, Builder)**

1. Confirm work started on screen survives backgrounding: it completes under a
   background task assertion, or it is resumable, or it is explicitly
   abandoned. Silent truncation on suspend is the usual defect.
2. Confirm state is restored after termination, and that in-flight user input
   is not lost when the system reclaims memory.
3. Confirm background execution uses the right mechanism for the work —
   scheduled refresh, a background transfer, or a declared background mode —
   rather than assuming the app stays alive.
4. Confirm main-thread work is bounded: UI updates on the main actor, and no
   synchronous I/O, decoding, or heavy layout on it.

**Permissions and privacy (Security, Experience)**

5. Confirm every sensitive capability has a purpose string that describes the
   actual use, and that the app degrades usefully when the user declines.
6. Confirm the permission is requested at the moment its value is obvious, not
   batched on first launch.
7. Confirm privacy-sensitive collection is declared accurately and that
   required-reason APIs carry a declared reason. An inaccurate declaration is
   both a review rejection and a trust problem.
8. Confirm credentials live in the keychain with an appropriate accessibility
   class, never in preferences or a plist.

**Interface (Experience)**

9. Confirm layout respects safe areas, Dynamic Type at large accessibility
   sizes, and both orientations where supported.
10. Confirm VoiceOver reaches and labels every control, and that custom
    controls expose traits rather than being decorative views.
11. Confirm dark mode and reduced-motion preferences are honoured.

**Release (Verifier)**

12. Confirm the change introduces no private API, disallowed entitlement, or
    capability the provisioning profile lacks.
13. Confirm version and build numbers advance, and that anything gated by a
    remote flag defaults to the safe state when the flag service is
    unreachable.
14. Confirm the minimum supported OS version still builds and behaves, rather
    than assuming the newest SDK's defaults.

## Evidence

Name the device or simulator, the OS version, and the accessibility settings
under which behaviour was exercised. A screenshot proves appearance, not
interaction; say which flows were actually driven.

## Findings

Every finding names the platform rule or lifecycle event, the user-visible
consequence, and whether it is a correctness defect or a review risk — those
are fixed with different urgency.

## Authority

This lens narrows what a role must check; it never outranks the project's own
declared minimum OS version, its design system, or an enforced gate. Apple's
current documentation outranks this file where they differ: treat anything
here that contradicts a current platform rule as stale and verify it.

## Hands off

Does not own: cross-platform architecture (Architect generically), server
contracts the app consumes (`api-platform`), WCAG-level accessibility depth
(`accessibility`), product scope (Product), or the final delivery verdict
(Verifier).
