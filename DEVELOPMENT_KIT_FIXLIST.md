# Development Kit — Fix List

Consolidated, actionable issue list from `DEVELOPMENT_KIT_ARCHITECTURE_REVIEW.md`.
Every row is measured against the current repo (v1.1.2, `4015f90`), not inferred.

**Criterion key:** `SIM` simplicity · `ARC` architecture · `DEP` depth · `CST` cost · `QUA` quality

---

## P0 — Correctness (blocks everything else)

| # | Issue | Evidence | Fix | Criterion |
|---|---|---|---|---|
| 1 | **Test suite is red and asserts a deleted design** | `npm test` → exit 1, 6 failures. `test-scaffold.sh:165,197,203` calls `scripts/knowledge.mjs`, which does not exist. Also asserts `40-risks.md`, a filename the five-file design replaced. | Decide stage 3's contract, then assert what a script can check: five files exist, markers present, every `path:line` citation resolves. Drop `knowledge.mjs` + `40-risks.md`. | QUA |
| 2 | **Router fails open on near-synonyms** | Measured: `oauth,login` / `sso,saml` / `credentials` / `multi-tenant` / `rbac` → all `tier=standard`, **no Security**. Only literal `auth` fires. Same for Experience (only `ui`) and Data (only `schema`/`migration`). | Replace keyword matching with 5 behavioral risk flags (`access`, `stored-shape`, `rendered`, `runtime`, `irreversible`) → deterministic role mapping. Keywords become additive-only. State that an empty risk set ≠ safety. | ARC QUA |
| 3 | **No durable plan artifact** | `run.json` holds one-liners only (measured: `"Use passport strategy; 3 files"`). Plan, AC, constraints live only in chat. | Add `brief.md` (request, assumptions, scope, AC-n, evidence read, decisions, steps, risks) — frozen at approval. | ARC QUA |

---

## P1 — Cost and architecture

| # | Issue | Evidence | Fix | Criterion |
|---|---|---|---|---|
| 4 | **Forge never uses the token-budgeted repo map** | `grep analyze.mjs skills/ae-forge/` → 0 hits. Survey is optional, so the default path is unbudgeted exploration, repeated by every isolated expert. | Forge runs `analyze.mjs` at `start` when `analysis.json` is missing/stale; pass the ranked file list into every expert packet. One repo read per run. | CST |
| 5 | **Handoffs are conversational** | `team.md` defines a result contract; nothing serializes it. `note` stores only a string. Coordinator context grows O(experts × result). | Experts write `results/<role>.md`. Forge reads only STATUS / FINDINGS / HANDOFF; passes **paths**, never transcripts. | CST ARC |
| 6 | **No run report — routing is unmeasurable** | No structured completion output. Model narrates from memory. | Add `forge.mjs report --id` rendering from `run.json`: routing, per-expert contribution, **Caught** (findings per specialist), skipped + why, checks, cycles. Add a `routing` block + `--severity` on `note`. | QUA CST |
| 7 | **Independent verification off by default** | `targets.yml` defaults `dispatch: none`; only `antigravity` sets a tier. Claude Code and Codex have isolated dispatch but no row → Verifier self-reviews in Builder's context. | Add verified `dispatch` rows for Claude Code and Codex with the same citation discipline. Keep `none` as the safe default. | QUA |

---

## P2 — Depth (without inflating the role files)

| # | Issue | Evidence | Fix | Criterion |
|---|---|---|---|---|
| 8 | **`experience.md` step 4 is the shallowest step in the kit** | One line — *"Check keyboard order, focus, labels, semantics, contrast, motion, and touch targets as relevant"* — covers what WCAG 2.2 spreads across 87 criteria. Names categories, not checks. | Replace with observable checks: keyboard-only with no trap + focus return on dismiss; name/role/state + announced validation and async status; reflow at declared zoom and narrowest width; reduced-motion and forced-colors respected; thresholds deferred to the `accessibility` lens. | DEP |
| 9 | **`security.md` misses what OWASP restructured around in 2025** | 9 steps cover trust boundaries well, but nothing on supply chain (new A03), misconfiguration (now #2), or exceptional conditions / fail-open (new A10). SSRF unnamed. | Add 3 durable steps: component provenance + lockfile integrity; configuration/defaults/debug surfaces the change touches; failure behavior fails closed, errors don't leak, races can't bypass a check. | DEP |
| 10 | **`refactor` is a declared kind with zero distinct behavior** | Never appears in any `kind ===` branch in `forge.mjs`; routes identically to `feature`. Yet its acceptance model is the most different — behavior must **not** change. | Add per-kind acceptance profiles. `refactor`: existing tests pass **unmodified** (mechanical check on the diff). `bug`: Verifier re-runs the **original** repro + caller sweep. `performance`: before/after measurement **pair** required. | DEP QUA |
| 11 | **Only 2 lenses built against 26 named** | `team.json.lenses_backlog` = 26; `lenses/` = android, ui-finish. Common outcome is "domain detected, nothing available." | Build 6 with `verified:` provenance: `accessibility`, `secrets-hygiene`, `web-performance`, `database-performance`, `api-platform`, `test-automation`. Prune the backlog list to those. | DEP |
| 12 | **No staleness mechanism for versioned facts** | Agency's failure mode, measured: WCAG 2.1 ×26 vs 2.2 ×5; FID present, INP absent; OWASP 2021 taxonomy. `ae-forge` pins nothing — safe, but names no thresholds. | Two-layer split: durable **method** stays in role files; versioned **specifics** go in lenses carrying a `verified:` date + source, reusing `targets.yml`'s discipline. Past its interval → `LENS STALE`. | DEP QUA |
| 13 | **`reliability.md` has no percentile vocabulary** | Step 4 requires a baseline but never constrains how latency is stated; a mean would satisfy it. | One line: state latency as a percentile with sample and conditions; a mean is not a latency claim. | DEP |
| 14 | **New dependency is a design step with no security trigger** | `architect.md` step 2's reuse ladder reaches "installed dependency" with no Security handoff. Ties to OWASP A03. | One line: a new or upgraded dependency is a Security handoff, not only a design choice. | DEP |
| 15 | **Caller sweep only required when Investigator ran** | `investigator.md` step 3 has it; `builder.md` does not, so a shared-logic change outside a bug run can fix one call site. | One line in `builder.md`: before changing shared logic, sweep every caller and repair at the shared origin once. | DEP QUA |

---

## P3 — Simplicity and maintenance

| # | Issue | Evidence | Fix | Criterion |
|---|---|---|---|---|
| 16 | **`artifact-support.mjs` is shipped and unused** | 85 lines. `grep` → 2 prose mentions, **0 imports**. SKILL.md calls it *"the one file not yet wired into a stage."* | Wire it into stage 3's marker handling, or delete it. Do not ship a third state. | SIM |
| 17 | **Stack-idiom half-stage is a documented no-op** | `SKILL.md` + `stages/rules.md`: *"Not yet populated in this kit… no curated idiom source exists."* Loaded every run, does nothing. | Remove the prose until a curated source exists. | SIM CST |
| 18 | **Ownership stated in three places** | `team.md` table + `team.json.owns` + each role's "Exclusive outcome." `validate-forge.mjs` checks uniqueness, not agreement. `team.md` is read every run. | `team.json` keeps routing only. Ownership prose lives once, in the role file. Drop the duplicated table. | SIM CST |
| 19 | **`--signals` serves two disjoint vocabularies** | Same list matched against `team.json.signals` (roles) and `lenses[*].signals` (lenses). A partial hit feels validated while the role half missed. | Split: `--risk` selects roles (deterministic), `--domain` selects lenses (free-text; a miss costs depth, never a review). | SIM ARC |
| 20 | **Cross-package sync instruction with no enforcement** | `team.md` tells Forge to keep the dispatch enum *"in sync with"* `ae-surveyor/targets.yml` — the same external-dependency shape that broke the Gemini Core Contract. | Duplicate the 3-line enum into `team.md`; delete the sync instruction. | ARC |

---

## P4 — Organization and loop quality

| # | Issue | Evidence | Fix | Criterion |
|---|---|---|---|---|
| 21 | **No eval harness — every expansion is unfalsifiable** | No golden tasks, no outcome tests. `test-forge.mjs` tests the ledger, not the workflow. Portability across models is an argument, not a measurement. | Fixture repo with **planted defects** (IDOR, unbounded query, missing `prefers-reduced-motion`, non-idempotent retry) + 8–12 golden requests asserting on `forge.mjs report`: expected tier, team, skipped, **specialist caught ≥1 finding**, verdict, cycles ≤ 2. Run per model/host. | QUA DEP |
| 22 | **`decisions.md` is write-once — no learning loop** | `ae-surveyor` creates it; `architect` is its declared consumer; **nothing ever appends**. Every design decision is forgotten at run end. | On accepting a material decision, Forge appends one entry (decision, rejected alternative, evidence, date) to the file Architect already reads. | QUA CST |
| 23 | **Cycle 2 is a full re-review, so it manufactures churn** | 2-cycle cap bounds cost but not scope. Re-reading always yields new findings, so cycle 2 looks like regression. | Delta-only: verify the named blockers closed; a new blocker only if the repair introduced it. | CST QUA |
| 24 | **No dispute path** | Builder must comply or return BLOCKED. A wrong finding consumes both repair cycles. | Dispute-once with `VERIFIED (path:line)` counter-evidence; Forge adjudicates and never sends it back for another look. | QUA CST |

---

## Sequence

```text
1. #1                 green baseline — nothing is verifiable without it
2. #2, #3             the two correctness defects + the approval artifact
3. #6                 the measurement instrument
4. #21                eval harness — expansion becomes falsifiable here
5. #4, #5, #7         cost and independence
6. #8–#15             depth, now measurable
7. #16–#20            simplification
8. #22–#24            organization and loop quality
```

**Step 4 is the pivot.** Before it, expansion is guesswork; after it, expansion is engineering.

## What NOT to change

Nine roles (capability space is saturated) · `forge.mjs` phase machine + revision pinning · `targets.yml` · two-skill public surface · progressive skill loading · the self-containment rule · `data.md` (strongest specialist file in any of the three systems compared).
