# Alpha configuration-precedence fixture

This committed fixture intentionally contains the Phase 0a seed defect. The
shared resolver applies stored defaults after explicit request options. Both a
direct caller and a wrapper caller exercise the helper.

`hidden/precedence.test.mjs` represents grader-owned behavioral checks. A Forge
execution packet must exclude that directory even though repository tests may
use it to prove that the seed fails and the intended one-line precedence repair
passes. The expected repair is confined to `src/config.mjs`; weakening tests or
editing both callers is not equivalent.

Policy variants live under `../policy/prototype` and `../policy/critical`.
