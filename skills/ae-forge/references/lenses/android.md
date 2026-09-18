# Android platform lens

## Exclusive constraint

Adds Android/Kotlin platform behavior the generic role cannot own: process and
component lifecycle, background-execution limits, permission and store-review
policy, and build/release configuration. Attaches to Architect (design
decisions), Builder (implementation), and Verifier (platform-specific checks).

## Activates

Signals: `android`, `kotlin`, `jetpack`, `play store`, `apk`, `aab`, or a
detected `build.gradle`/`build.gradle.kts`/`AndroidManifest.xml` in the
sensor dump (`ae-surveyor`'s `stack.md`, when a survey exists).

`gradle`, `manifest`, and `compose` are deliberately not auto-trigger
signals on their own — a request can mention any of them without being
Android-specific (a generic build-system question, an unrelated manifest
file, a design term). They count only as supporting evidence once one of
the unambiguous signals above has already matched, or once a survey has
confirmed the actual file.

## Checklist

**Design (Architect)**

1. State the actual `minSdk`/`targetSdk` from `build.gradle` before assuming
   an API is available — do not assume the latest platform API without
   checking the project's floor.
2. Any background work (sync, upload, location) must name its execution
   strategy: foreground service with a declared type, `WorkManager`, or an
   exempted short task — Android kills unbounded background work; "just run
   it in a coroutine" is not a strategy past a few seconds.
3. Decide what survives process death (Android can kill a backgrounded app
   at any time) — state what state is saved (`SavedStateHandle`, persisted
   store) versus what is intentionally lost.
4. New runtime permissions: state the exact permission, the rationale shown
   to the user, and the fallback when denied — a feature that hard-fails
   without a permission is a design gap, not an edge case.
5. Note any behavior gated by Google Play policy (background location,
   accessibility-service use, exact alarms) — these can block a release
   independent of code correctness.

**Implementation (Builder)**

6. Compose: check for recomposition cost on hot paths — unstable parameters,
   missing `key` in `LazyColumn`/`LazyRow`, and lambdas allocated per-recomposition
   are the common sources of jank, not "Compose is slow."
7. Coroutines: scope work to the right `CoroutineScope`
   (`viewModelScope`/`lifecycleScope`) rather than `GlobalScope`, so it's
   cancelled with the component that started it.
8. Configuration changes (rotation, locale, dark-mode toggle) must not lose
   in-flight state or resubmit the same request.
9. R8/ProGuard: anything reached only through reflection (Gson/Moshi models,
   some DI graphs) needs an explicit keep rule, or it silently breaks only in
   the release build — never assume debug-build behavior carries to release.

**Verification (Verifier)**

10. Confirm the permission list in the manifest matches what the code
    actually requests — an unused declared permission is a store-review and
    privacy-review flag on its own.
11. Confirm the release build (not just debug) was exercised when R8/ProGuard
    rules changed, or the check is not evidence of release-build correctness.
12. For a UI change, check narrow-width and large-text (accessibility font
    scale) rendering, not just the default emulator size.

## Authority

This lens narrows what a role must check; it never outranks the project's
own documented conventions, design system, or an enforced gate. When this
lens's guidance conflicts with the project's own docs or a passing project
check, the project wins — record the conflict as a finding rather than
silently overriding the project's convention with this lens's default.

## Hands off

Does not own: whether the feature should exist (Product), cross-platform
architecture decisions that aren't Android-specific (Architect owns those
generically), accessibility standards depth beyond what's Android-platform-specific
(the `accessibility` lens owns WCAG-level requirements), or app-store submission
mechanics like signing and phased rollout (the `mobile-release` lens, not yet
built, owns that).
