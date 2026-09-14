# Phase 2 acceptance record

Date: 2026-09-13  
Status: accepted

## Implemented controls

- Forge compiles authority, routing, quality, release, knowledge-index, and
  rules-index inputs before it selects routing or creates a budget.
- The manifest contains the resolved policy digest, source/context digests,
  reasons, host bounds, permitted run overrides, required commands, release
  boundary, and concrete Git base commit.
- Approval receipts bind the run, explicit user approval event, policy, base,
  and authoritative artifact hashes.
- Candidate identity binds the current commit plus tracked, uncommitted, and
  untracked project content while excluding the run workspace.
- All run-state changes use the lifecycle transition function. Prerequisites
  are checked before entering their consuming state.
- Repair must return through implementation, integration, domain re-audit,
  candidate-bound re-test, and release audit.
- Dispatch reservation enforces effective tool, write-root, network, state,
  approval, and budget boundaries. Reconciliation records measured or
  estimated usage without representing unavailable cost telemetry as zero.
- Writes are atomic, active writers conflict through a per-run lock, operation
  retries are idempotent, pauses retain a reason and resume action, and
  cancellation is terminal. A replacement run may reference a cancelled run
  without reviving it.

## Adversarial review

The first review found that dispatch reservation could have bypassed effective
authority and that actual usage above a reservation did not trip the circuit
breaker. Both paths were closed before acceptance. A cancellation-reason
contract mismatch was also found by the acceptance fixture and corrected.

## Verification

- Shipped contract and registry validator: passed.
- Phase 1 contract suite: 35 passed, 0 failed.
- Forge lifecycle/policy acceptance suite: 86 passed, 0 failed.
- Existing scaffold suite: 70 passed, 0 failed.
- Existing artifact suite: 80 passed, 0 failed.
- Full `npm test`: passed with exit code 0.
- Development model/API spend: $0.

## Exit decision

Accepted. The public runner cannot advance, dispatch, approve, repair, resume,
or complete through an unvalidated state path, and all four project policies
plus selected project context have exercised runtime consumers.
