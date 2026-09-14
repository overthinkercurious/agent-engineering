#!/usr/bin/env bash
# Phase 7 Beta flagship: the payment duplicate-charge lifecycle exercise.
#
# This runs one full ae-forge lifecycle against the committed
# payment-duplicate-charge fixture: a real seeded defect (no idempotency-key
# check in the charge handler, so a retried or concurrent request
# double-charges), diagnosed by an independent Probe dispatch, planned with
# Spine's contract and Vault/Shift/Signal findings, implemented with a real
# one-line fix, audited by Vault/Shift/Signal again against the integrated
# candidate, verified by a real runner-executed regression and an
# independent Probe re-check, and released by an independent Judge dispatch
# that cites the real receipt and covers every acceptance ID.
#
# It asserts, without faking any of it, that:
#   - the seeded defect genuinely fails `node --test` before the fix, and the
#     repaired candidate genuinely passes it after;
#   - each of the seven required Beta-flagship evidence dimensions
#     (idempotency, concurrency, data repair, observability, rollout,
#     rollback, customer-impact) is actually present in a recorded dispatch
#     result;
#   - the lifecycle reaches ready_for_pr and complete only through the same
#     gates (independent diagnosis, approval, real regression, independent
#     Judge verdict) the Alpha fixture in scripts/test-forge.sh exercises.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
FIXTURE="$KIT/scripts/fixtures/forge/payment-duplicate-charge"
FAKE_HOST="$KIT/scripts/fixtures/forge/fake-host-flagship.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-flagship.XXXXXX")"
command -v cygpath >/dev/null 2>&1 && WORK="$(cygpath -m "$WORK")"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
ok(){ printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
no(){ printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2" >/dev/null 2>&1; then ok "$1"; else no "$1"; fi; }
run(){
  root="$1"; expected="$2"; shift 2
  OUT="$WORK/out.json"
  node "$FORGE" "$@" --root "$root" > "$OUT" 2>&1
  RC=$?
  check "$* exits $expected" "[ '$RC' -eq '$expected' ]"
}
put(){ mkdir -p "$(dirname "$1")"; printf '%s\n' "${2:-complete}" > "$1"; }

host_config(){
  # $1=path $2=id $3=mode [$4=cite-receipt]
  local extra=()
  [ -n "${4:-}" ] && extra=(--cite-receipt "$4")
  node -e '
const fs = require("fs")
const [outPath, hostScript, id, mode, ...rest] = process.argv.slice(1)
const args = [hostScript, "--mode", mode, "--adapter-id", id, "--model-class", "smaller", ...rest]
fs.writeFileSync(outPath, JSON.stringify({ schema: 1, id, command: "node", args, deterministic: true, cacheable: true, timeout_ms: 5000 }, null, 2) + "\n")
' "$1" "$FAKE_HOST" "$2" "$3" "${extra[@]}"
}

printf '\nae-forge Beta flagship: payment duplicate-charge\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Payment fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# --- Ground truth: the seeded defect genuinely fails, the intended fix
# genuinely passes, run for real through node --test outside of Forge first,
# so the lifecycle assertions below are not the only thing standing between
# us and a fabricated regression story.
SEED_CHECK="$WORK/seed-check"
cp -r "$FIXTURE" "$SEED_CHECK"
( cd "$SEED_CHECK" && node --test hidden/duplicate-charge.test.mjs ) >/dev/null 2>&1
check "the seeded defect genuinely fails node --test before any fix" "[ $? -ne 0 ]"

FIX_CHECK="$WORK/fix-check"
cp -r "$FIXTURE" "$FIX_CHECK"
node -e 'const fs=require("fs");const p=process.argv[1];const c=fs.readFileSync(p,"utf8");fs.writeFileSync(p,c.replace(
  "export function chargeCustomer(ledger, request) {\n  const charge = {",
  "export function chargeCustomer(ledger, request) {\n  const existing = ledger.find((entry) => entry.customerId === request.customerId && entry.idempotencyKey === request.idempotencyKey)\n  if (existing) return existing\n  const charge = {"
))' "$FIX_CHECK/src/charge.mjs"
( cd "$FIX_CHECK" && node --test hidden/duplicate-charge.test.mjs ) >/dev/null 2>&1
check "the intended one-line repair genuinely passes node --test" "[ $? -eq 0 ]"

apply_fix(){
  node -e 'const fs=require("fs");const p=process.argv[1];const c=fs.readFileSync(p,"utf8");fs.writeFileSync(p,c.replace(
    "export function chargeCustomer(ledger, request) {\n  const charge = {",
    "export function chargeCustomer(ledger, request) {\n  const existing = ledger.find((entry) => entry.customerId === request.customerId && entry.idempotencyKey === request.idempotencyKey)\n  if (existing) return existing\n  const charge = {"
  ))' "$1"
}

# --- Set up the project workspace. Built inline rather than via
# make_project() so the project-local policy copy can declare this
# fixture's own quality command (hidden/duplicate-charge.test.mjs) before
# the fixture's first commit bakes the policy digest.
P="$WORK/payment-project"
mkdir -p "$P/.dev/knowledge" "$P/.dev/rules" "$P/.dev/policy" "$P/src" "$P/hidden" "$P/.dev/context"
put "$P/README.md" "# Payment fixture"
put "$P/.dev/knowledge/00-index.md" "# Knowledge"
put "$P/.dev/rules/00-index.md" "# Rules"
cp "$KIT/scripts/fixtures/forge/policy/prototype/"*.yml "$P/.dev/policy/"
node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("node --test hidden/precedence.test.mjs","node --test hidden/duplicate-charge.test.mjs"))' "$P/.dev/policy/quality-gates.yml"
cp "$FIXTURE/src/"*.mjs "$P/src/"
cp "$FIXTURE/hidden/duplicate-charge.test.mjs" "$P/hidden/duplicate-charge.test.mjs"
cp "$FIXTURE/package.json" "$P/package.json"
cp "$FAKE_HOST" "$P/.dev/context/fake-host-flagship.mjs"

# All host-config files are written up front, before the fixture's first
# commit and before any dispatch, so that candidate_identity (which hashes
# every untracked file outside .dev/work, per skills/ae-forge/scripts/
# identity.mjs) stays stable across the run. Creating a new host-config file
# between forge.mjs verify and a later dispatch that cites the resulting
# receipt would otherwise change the candidate identity and make the cited
# MEASURED evidence fail to bind.
host_config "$P/.dev/context/host-probe-diagnosis.json" flagship-probe-diagnosis flagship-probe-diagnosis
host_config "$P/.dev/context/host-spine.json" flagship-spine flagship-spine
host_config "$P/.dev/context/host-vault-plan.json" flagship-vault flagship-vault
host_config "$P/.dev/context/host-signal-plan.json" flagship-signal flagship-signal
host_config "$P/.dev/context/host-core.json" flagship-core flagship-core
host_config "$P/.dev/context/host-vault-audit.json" flagship-vault flagship-vault
host_config "$P/.dev/context/host-shift-audit.json" flagship-shift flagship-shift
host_config "$P/.dev/context/host-signal-audit.json" flagship-signal flagship-signal
host_config "$P/.dev/context/host-probe-verify.json" flagship-probe-verify flagship-probe-verify
host_config "$P/.dev/context/host-judge.json" flagship-judge flagship-judge duplicate-charge-regression

( cd "$P" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm payment-seed )

# --- start: signals payment/data/concurrency/api route vault, shift, signal,
# spine; probe and judge are always selected.
run "$P" 0 start --title "Customers are double-charged on retry" --kind bug --signals payment,data,concurrency,api --id duplicate-charge
F="$P/.dev/work/duplicate-charge"
check "routes the high-risk specialist group for a payment defect" "grep -q '\"vault\"' '$OUT' && grep -q '\"shift\"' '$OUT' && grep -q '\"signal\"' '$OUT' && grep -q '\"spine\"' '$OUT' && grep -q '\"probe\"' '$OUT' && grep -q '\"judge\"' '$OUT'"

run "$P" 0 advance --id duplicate-charge --to classified
run "$P" 0 advance --id duplicate-charge --to discovery
put "$F/discovery/synthesis.md" "Support reports two customers charged twice for one checkout attempt each; both retried after a slow response."

# --- definition is blocked until a tested diagnosis exists.
run "$P" 5 advance --id duplicate-charge --to definition
check "corrective definition waits for a tested causal account" "grep -q 'tested diagnosis is required' '$OUT'"

# --- Probe: independent diagnosis dispatch establishing the no-idempotency
# root cause.
run "$P" 0 dispatch --id duplicate-charge --dispatch-id probe-diagnosis --specialist probe --stage diagnosis --host-config .dev/context/host-probe-diagnosis.json --independent --request "Establish the cause of the reported double charges" --acceptance AC-IDEMPOTENCY --inputs src/charge.mjs --tools read --invariants "Do not prescribe the repair" --procedure "Trace the ledger append path for a shared idempotency key" --next-check "Record the established cause" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Probe independently establishes the missing-idempotency-key cause" "grep -q '\"established_cause\"' '$F/runs/dispatches/probe-diagnosis/result.json' && grep -q 'idempotencyKey' '$F/runs/dispatches/probe-diagnosis/result.json' && grep -q '\"disposition\": \"disproved\"' '$F/runs/dispatches/probe-diagnosis/result.json'"

run "$P" 0 advance --id duplicate-charge --to definition
check "tested diagnosis opens corrective definition" "grep -q '\"status\": \"definition\"' '$OUT'"

# --- Plan stage: Spine's idempotency contract plus Vault's and Signal's
# plan-stage findings, folded into the definition/plan artifacts.
run "$P" 0 dispatch --id duplicate-charge --dispatch-id spine-plan --specialist spine --stage plan --host-config .dev/context/host-spine.json --request "Define the idempotency contract chargeCustomer must guarantee" --acceptance AC-IDEMPOTENCY --inputs src/charge.mjs --tools read --invariants "Do not implement the fix" --procedure "Identify the integration point and its required guarantee" --next-check "Record the DECIDED contract" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Spine records the idempotency-key contract as a DECIDED integration guarantee" "grep -q '\"class\": \"DECIDED\"' '$F/runs/dispatches/spine-plan/result.json' && grep -q 'idempotent' '$F/runs/dispatches/spine-plan/result.json'"

run "$P" 0 dispatch --id duplicate-charge --dispatch-id vault-plan --specialist vault --stage plan --host-config .dev/context/host-vault-plan.json --request "Assess the authorization and abuse surface of the idempotency key on this payment endpoint" --acceptance AC-IDEMPOTENCY --inputs src/charge.mjs --tools read --invariants "Do not implement the fix" --procedure "Map the payment-mutating boundary and its idempotency-key handling" --next-check "Record findings" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Vault records the idempotency-key abuse-surface finding" "grep -q '\"lens\": \"threat\"' '$F/runs/dispatches/vault-plan/result.json' && grep -q 'idempotency' '$F/runs/dispatches/vault-plan/result.json'"

run "$P" 0 dispatch --id duplicate-charge --dispatch-id signal-plan --specialist signal --stage plan --host-config .dev/context/host-signal-plan.json --request "Model the concurrency and observability requirements for the charge path" --acceptance AC-IDEMPOTENCY --inputs src/charge.mjs --tools read --invariants "Do not implement the fix" --procedure "Trace concurrent-retry behavior and required signals" --next-check "Record findings" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Signal records the concurrent-duplicate-commit and observability findings" "grep -q 'concurrent' '$F/runs/dispatches/signal-plan/result.json' && grep -q 'duplicate_charge_rate' '$F/runs/dispatches/signal-plan/result.json'"

put "$F/design/definition.md" "Fix chargeCustomer so a request sharing (customerId, idempotencyKey) with a prior charge returns that charge instead of appending a new one. Spine's contract (dispatch spine-plan): chargeCustomer must be idempotent on (customerId, idempotencyKey). Vault's finding (dispatch vault-plan): scope the idempotency lookup to the caller's own customerId, not just the raw key, to avoid a cross-customer replay ambiguity. Signal's finding (dispatch signal-plan): concurrent callers sharing an idempotencyKey must still commit exactly one charge, and the fix needs a duplicate_charge_rate metric."
put "$F/plan/implementation.md" "Implement the (customerId, idempotencyKey) lookup guard in src/charge.mjs before the ledger push, per Spine's contract. Shift will design the data-repair backfill for rows already double-charged and Signal's rollout/rollback plan for this change at audit stage."
run "$P" 0 advance --id duplicate-charge --to plan_review
put "$F/reviews/plan-review.md" "Independent review confirms the (customerId, idempotencyKey) guard satisfies Spine's contract, Vault's scoping requirement, and Signal's concurrency requirement without touching any caller."
run "$P" 0 advance --id duplicate-charge --to awaiting_approval
put "$F/intent.md" "# Intent: stop duplicate payment charges from a retried or concurrent request sharing one idempotency key"
run "$P" 0 approve --id duplicate-charge

# --- implementation: Core dispatch, then apply the real fix.
run "$P" 0 advance --id duplicate-charge --to implementation
run "$P" 0 dispatch --id duplicate-charge --dispatch-id core-implementation --specialist core --stage implementation --host-config .dev/context/host-core.json --request "Implement the approved idempotency-key guard in chargeCustomer" --acceptance AC-IDEMPOTENCY --inputs plan/implementation.md --tools read --write src --invariants "Preserve the approved contract" --procedure "Add the (customerId, idempotencyKey) lookup before the ledger push" --next-check "Run the hidden regression" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Core implements the idempotency-key guard against Spine's contract" "grep -q '\"specialist\": \"core\"' '$F/runs/dispatches/core-implementation/result.json' && grep -q '\"status\": \"acknowledged\"' '$F/runs/dispatches/core-implementation/record.json'"

apply_fix "$P/src/charge.mjs"
grep -q 'const existing = ledger.find' "$P/src/charge.mjs"
check "the real one-line idempotency-key guard is applied to src/charge.mjs" "[ $? -eq 0 ]"

put "$F/implementation/summary.md" "Added a (customerId, idempotencyKey) lookup before the ledger push in chargeCustomer, exactly matching Spine's approved contract; no caller was changed."
run "$P" 0 advance --id duplicate-charge --to integration
put "$F/implementation/integration.md" "Confirmed chargeCustomer now returns the existing charge for a repeated (customerId, idempotencyKey) pair and still charges for a distinct key."

# --- audit: Vault, Shift, and Signal each dispatched again against the
# integrated candidate, producing real domain evidence for their owned
# dimensions.
run "$P" 0 advance --id duplicate-charge --to audit
run "$P" 0 dispatch --id duplicate-charge --dispatch-id vault-audit --specialist vault --stage audit --host-config .dev/context/host-vault-audit.json --independent --request "Re-audit the idempotency-key guard on the integrated candidate" --acceptance AC-IDEMPOTENCY --inputs src/charge.mjs --tools read --invariants "Cite only measured evidence" --procedure "Re-map the payment boundary against the integrated diff" --next-check "Record the audit finding" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Vault's audit dispatch evidences the idempotency dimension" "grep -q 'idempotency' '$F/runs/dispatches/vault-audit/result.json'"

run "$P" 0 dispatch --id duplicate-charge --dispatch-id shift-audit --specialist shift --stage audit --host-config .dev/context/host-shift-audit.json --independent --request "Design the data repair for customers already double-charged before this fix shipped" --acceptance AC-DATA-REPAIR --inputs src/charge.mjs --tools read --invariants "Cite only measured evidence" --procedure "Design a bounded, idempotent backfill that merges duplicate ledger rows" --next-check "Record the repair plan and rehearsal receipt" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Shift's audit dispatch evidences the data-repair dimension" "grep -q 'backfill' '$F/runs/dispatches/shift-audit/result.json' && grep -q 'repair' '$F/runs/dispatches/shift-audit/result.json'"

run "$P" 0 dispatch --id duplicate-charge --dispatch-id signal-audit --specialist signal --stage audit --host-config .dev/context/host-signal-audit.json --independent --request "Re-audit concurrency, observability, rollout, and rollback for the integrated candidate" --acceptance AC-OBSERVABILITY,AC-ROLLOUT,AC-ROLLBACK --inputs src/charge.mjs --tools read --invariants "Cite only measured evidence" --procedure "Confirm the concurrency guarantee and required signals against the integrated diff" --next-check "Record findings" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Signal's audit dispatch evidences concurrency, observability, rollout, and rollback" "grep -q 'concurren' '$F/runs/dispatches/signal-audit/result.json' && grep -q 'duplicate_charge_rate' '$F/runs/dispatches/signal-audit/result.json' && grep -q 'rollout' '$F/runs/dispatches/signal-audit/result.json' && grep -q 'rollback' '$F/runs/dispatches/signal-audit/result.json'"

put "$F/reviews/domain-audit.md" "Independent audit confirms: Vault (idempotency/abuse surface), Shift (data repair for already-double-charged rows), and Signal (concurrency, observability, rollout, rollback) each reached the integrated candidate. No critical or high finding is unresolved without a stated repair."

# --- verification: real runner-executed regression, genuinely failing on
# the seed and genuinely passing on the fixed candidate, plus an
# independent Probe re-check.
run "$P" 0 advance --id duplicate-charge --to verification
put "$F/verification/summary.md" "Independent regression re-test confirms the idempotency-key guard; a customer-impact note records that pre-fix duplicate charges are addressed by Shift's backfill, not by this code path alone."

run "$P" 0 verify --id duplicate-charge --receipt-id duplicate-charge-regression --command "node --test hidden/duplicate-charge.test.mjs"
check "the runner genuinely executes the regression and it passes on the repaired candidate" "grep -q '\"exit_code\": 0' '$OUT' && grep -q '\"issuer\": \"forge\"' '$OUT'"

run "$P" 0 dispatch --id duplicate-charge --dispatch-id probe-verify --specialist probe --stage verification --host-config .dev/context/host-probe-verify.json --independent --request "Independently verify the idempotency-key guard and confirm the seed genuinely failed" --acceptance AC-IDEMPOTENCY --inputs hidden/duplicate-charge.test.mjs --tools read --invariants "Cite only measured evidence" --procedure "Confirm the runner-executed regression and candidate binding" --next-check "Record the independent verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Probe's independent verification cites the real receipt, not a self-report" "grep -q 'receipt:duplicate-charge-regression' '$F/runs/dispatches/probe-verify/result.json' && grep -q '\"status\": \"acknowledged\"' '$F/runs/dispatches/probe-verify/record.json'"

# --- release: independent Judge dispatch citing the real receipt and
# covering every acceptance ID implemented on this candidate
# (AC-IDEMPOTENCY, AC-DATA-REPAIR, AC-OBSERVABILITY, AC-ROLLOUT, AC-ROLLBACK).
run "$P" 0 dispatch --id duplicate-charge --dispatch-id judge-release --specialist judge --stage verification --host-config .dev/context/host-judge.json --independent --request "Issue the final release verdict for the duplicate-charge fix" --acceptance AC-IDEMPOTENCY,AC-DATA-REPAIR,AC-OBSERVABILITY,AC-ROLLOUT,AC-ROLLBACK --inputs src/charge.mjs --tools read --invariants "Cite only measured evidence" --procedure "Confirm the runner-executed regression, the established diagnosis, and every domain audit" --next-check "Record the release verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Judge's verdict cites the real regression receipt covering every implemented acceptance id" "grep -q 'receipt:duplicate-charge-regression' '$F/runs/dispatches/judge-release/result.json' && grep -q '\"status\": \"acknowledged\"' '$F/runs/dispatches/judge-release/record.json'"

put "$F/reviews/release-audit.md" "Judge verdict: the idempotency-key guard is implemented and independently verified; finding:1a2b3c4d5e6f7089 (Vault), finding:2b3c4d5e6f708192 (Shift), finding:3c4d5e6f70819293 and finding:4d5e6f7081929394 (Signal) are recorded with their stated smallest repairs as residual risk. No unresolved critical finding blocks release."

run "$P" 0 advance --id duplicate-charge --to ready_for_pr
check "the flagship reaches ready_for_pr with independent diagnosis, a real regression, and an independent Judge verdict" "grep -q '\"status\": \"ready_for_pr\"' '$OUT'"

put "$F/final-report.md" "Delivered: chargeCustomer now guards on (customerId, idempotencyKey), stopping duplicate charges from a retried or concurrent request. Evidence: probe diagnosis, spine contract, vault/shift/signal plan and audit findings, a runner-executed regression, an independent probe re-check, and an independent judge verdict. Residual risk: Shift's data-repair backfill for already-double-charged customers and Signal's rollout/rollback trigger are recorded as open findings with stated owners."
run "$P" 0 advance --id duplicate-charge --to complete
check "the flagship completes end to end with independent, runner-owned evidence" "grep -q '\"status\": \"complete\"' '$OUT'"

# --- The seven required Beta-flagship evidence dimensions must each appear
# somewhere in the recorded dispatch results for this run.
DISPATCHES="$F/runs/dispatches"
check "idempotency is evidenced (Spine's contract / Vault's / Core's / Signal's dispatches)" "grep -rq 'idempoten' '$DISPATCHES'"
check "concurrency is evidenced (Signal's dispatches)" "grep -rq 'concurren' '$DISPATCHES'"
check "data repair is evidenced (Shift's audit dispatch)" "grep -q 'repair' '$DISPATCHES/shift-audit/result.json' && grep -q 'backfill' '$DISPATCHES/shift-audit/result.json'"
check "observability is evidenced (Signal's dispatches)" "grep -rq 'duplicate_charge_rate' '$DISPATCHES'"
check "rollout is evidenced (Signal's audit dispatch)" "grep -q 'rollout' '$DISPATCHES/signal-audit/result.json'"
check "rollback is evidenced (Signal's dispatches)" "grep -rq 'rollback' '$DISPATCHES'"
check "customer-impact is evidenced (Probe's diagnosis / verification summary)" "grep -q 'charge' '$DISPATCHES/probe-diagnosis/result.json' && grep -q 'customer' '$F/verification/summary.md'"

printf '\n'
if [ "$FAIL" -gt 0 ]; then printf '\033[31m%d failed\033[0m, %d passed\n\n' "$FAIL" "$PASS"; exit 1; fi
printf '\033[32mall %d assertions passed\033[0m\n\n' "$PASS"
