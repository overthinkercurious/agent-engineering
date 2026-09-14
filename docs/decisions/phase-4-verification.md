# Phase 4 verification checkpoint

Date: 2026-09-13  
Status: accepted; Phase 5 may begin

## Implemented behavior

- Forge is the only specialist dispatcher. Specialist and stage eligibility are
  enforced before launch; Judge is limited to verification.
- Dispatch creates a schema-valid minimal packet and bounded brief with exact
  input digests, acceptance IDs, invariants, allowed tools and writes, reserved
  usage, workflow digest, policy digest, candidate identity, and routing ancestry.
- Launch configuration is separate from observed host capability evidence. The
  adapter must complete a bounded capability handshake reporting the actual
  adapter/model identity and `available`, `unavailable`, or `unknown` status for
  fresh context, per-dispatch model selection, usage telemetry, tool/write
  enforcement, and cancellation acknowledgement.
- Independent work requires observed fresh isolation. Unenforced permissions and
  model-profile violations halt before the specialist call.
- Result envelopes are bounded, validated, binding-checked, deduplicated, and
  secret-scanned before outcome state changes. Proposed artifacts are checked
  against allowed write roots, current content digests, and secret patterns.
- `needs_specialist` returns control to Forge. Parent evidence and complete
  routing ancestry are required, so self-cycles and multi-hop cycles fail closed.
- Dispatch records include validation status, observed host capabilities,
  configuration and dependency digests, timing, reservation, actual budget
  impact, and result/failure evidence.
- Exact retries are content-bound. Changed source, task, workflow, policy,
  candidate, host configuration, host implementation, or runtime cannot reuse
  the old dispatch ID. A persisted result can reconcile a stranded reservation
  without repeating the host call.
- Child output is capped, host execution has a cancellation timeout, common
  credential forms are redacted, and secret-bearing evidence is not persisted.
- Workspace doctor checks policy, approval/candidate freshness, packet/brief/result
  bindings and digests, routing ancestry, budget reservation, host configuration,
  secret findings, and the local durability boundary.
- The shipped Codex adapter verifies routed UTF-8 inputs itself, embeds only that
  bounded context, and disables the model shell. This avoids host-dependent read
  commands while retaining a fresh process, read-only sandbox, schema-constrained
  output, exact model selection, and host-measured usage.

## Adversarial review

Implementation and live authoring exposed six defects before acceptance:

1. a completed dispatch record could coexist with a reserved state after an
   interruption;
2. dispatch IDs could return old evidence after dependency changes;
3. dependency keys omitted task-specific brief content and routing ancestry;
4. host capability fields were configuration claims rather than observations.
5. the initial response schema used keywords outside the host Structured Outputs
   subset; and
6. noninteractive Windows execution rejected shell reads even in a read-only
   workspace.

Recovery reconciliation, content-bound idempotence, complete dependency inputs,
multi-hop routing ancestry, a pre-dispatch capability handshake, a validated
Structured Outputs subset, and tool-free inline routing now cover those failures.
Doctor also caught a test fixture whose in-project backup file changed candidate
identity; the fixture was corrected rather than weakening the freshness check.

## Verification

- Forge acceptance suite: 171 passed, 0 failed.
- Contract suite: 35 passed, 0 failed.
- Scaffold/host suite: 70 passed, 0 failed.
- Initialization/artifact suite: 96 passed, 0 failed.
- Suite validation: 2 skills valid, 0 warnings.
- `skill-creator` quick validation: `ae-init` and `ae-forge` valid.
- Full `npm test`: passed with exit code 0.
- The versioned real-model record is
  [`docs/development-traces/phase-4-model-trace-v3.json`](../development-traces/phase-4-model-trace-v3.json).
- Accepted smaller arm: `gpt-5.6-luna`, low reasoning, 12,798 measured input
  tokens, 573 measured output tokens, 97 measured reasoning tokens, 17,205 ms.
- Accepted reference arm: `gpt-6-astra`, low reasoning, 15,553 measured input
  tokens, 783 measured output tokens, 76 measured reasoning tokens, 32,369 ms.
- Both arms matched the causal oracle, kept runtime evidence explicitly unknown,
  made no repair, returned no findings, and passed result validation and doctor.
- Monetary charge was unavailable, so no cost claim is made.

## Exit-gate decision

Phase 4 is accepted. Every tested invocation is attributable, schema-valid,
budgeted, stage-appropriate, and safe to persist. Exact routed context remained
accessible through the tool-free boundary, stale evidence was rejected, and host
capabilities were observed rather than inferred from registry labels. The trace
retains the failed schema and context-retrieval attempts instead of hiding them.

This is an authoring checkpoint, not a Phase 9 claim of general smaller-model
equivalence or cost reduction. Phase 5 may begin.
