#!/usr/bin/env bash
# Contract fixtures for the deepened Signal specialist workflow.
# Structural pattern follows scripts/test-forge.sh: same PASS/FAIL harness,
# same make_project-style temp Git project, same forge.mjs dispatch shape.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-signal.XXXXXX")"
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

printf '\nSignal specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

host_config(){
  # host_config <output-path> <adapter-id> <mode>
  node -e 'const fs=require("fs");const id=process.argv[3],mode=process.argv[4];const config={schema:1,id,command:"node",args:[process.argv[2],"--mode",mode,"--adapter-id",id,"--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(config,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-signal.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" prototype
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-signal-positive.json" signal-positive signal-positive
host_config "$P/.dev/context/host-signal-ambiguous.json" signal-ambiguous signal-ambiguous
host_config "$P/.dev/context/host-signal-negative.json" signal-negative signal-negative

# Reach a state where Signal is both selected (via triggering signals) and
# stage-eligible. SPECIALIST_STAGES['signal'] = ['plan','implementation','audit']
# and the 'plan' stage is eligible while status is in
# ['definition','plan_review','awaiting_approval'] (see dispatch.mjs
# STAGE_STATES). Reaching 'definition' needs only discovery synthesis.
run "$P" 0 start --title "Concurrent payment retry" --kind feature --signals performance,concurrency,external --id signal-fixture
SF="$P/.dev/work/signal-fixture"
check "Signal is routed for a performance/concurrency/external-signaled run" "grep -q '\"signal\"' '$SF/manifest.json'"

run "$P" 0 advance --id signal-fixture --to classified
run "$P" 0 advance --id signal-fixture --to discovery
put "$SF/discovery/synthesis.md" "duplicate charges observed under concurrent retry"
run "$P" 0 advance --id signal-fixture --to definition
check "run reaches definition, where the plan stage is dispatch-eligible" "grep -q '\"status\": \"definition\"' '$OUT'"

# --- Positive: correctly requires an idempotency key and a specific metric/alert
run "$P" 0 dispatch --id signal-fixture --dispatch-id signal-positive-1 --specialist signal --stage plan --host-config .dev/context/host-signal-positive.json --independent --request "Assess reliability of the concurrent payment retry path" --acceptance AC-RELIABILITY --inputs README.md --tools read --invariants "Cite only measured or observed evidence" --procedure "Trace retry and redelivery paths into the charge handler" --next-check "Record the required idempotency and observability mechanism" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
SP="$SF/runs/dispatches/signal-positive-1"
check "positive case validates and completes" "grep -q '\"validation\": \"passed\"' '$SP/record.json' && grep -q '\"status\": \"complete\"' '$SP/result.json'"
check "positive case requires an idempotency key" "grep -q 'idempotency key' '$SP/result.json'"
check "positive case names a specific duplicate-charge metric" "grep -q 'duplicate_charge_rate' '$SP/result.json'"
check "positive case grounds the requirement in observed and inferred evidence" "grep -q '\"class\": \"OBSERVED\"' '$SP/result.json' && grep -q '\"class\": \"INFERRED\"' '$SP/result.json'"
check "positive case does not escalate or pause the run" "grep -q '\"status\": \"acknowledged\"' '$SP/record.json'"

# --- Ambiguous: missing traffic/concurrency assumptions and observability coverage
run "$P" 0 dispatch --id signal-fixture --dispatch-id signal-ambiguous-1 --specialist signal --stage plan --host-config .dev/context/host-signal-ambiguous.json --independent --request "Assess reliability of a shared checkout path with no stated traffic assumptions" --acceptance AC-RELIABILITY --inputs README.md --tools read --invariants "Do not invent traffic or coverage data" --procedure "Attempt to bound retry and duplication risk" --next-check "Return the missing-input status if traffic and coverage are absent" --calls 1 --input-tokens 90 --output-tokens 30 --context-tokens 500
SA="$SF/runs/dispatches/signal-ambiguous-1"
check "ambiguous case returns needs_input" "grep -q '\"status\": \"needs_input\"' '$SA/result.json'"
check "ambiguous case names the actual missing inputs from signal.md" "grep -q 'concurrent-request rate' '$SA/result.json' && grep -q 'existing metric/alert coverage' '$SA/result.json'"
check "ambiguous case pauses the run as blocked, awaiting the missing input" "grep -q '\"status\": \"blocked\"' '$SF/state.json'"
run "$P" 0 resume --id signal-fixture

# --- Negative: naive "degrades gracefully" claim must not pass silently
run "$P" 0 dispatch --id signal-fixture --dispatch-id signal-negative-1 --specialist signal --stage plan --host-config .dev/context/host-signal-negative.json --independent --request "Confirm the payment-gateway retry degrades gracefully under a slow dependency" --acceptance AC-RELIABILITY --inputs README.md --tools read --invariants "Test the degrades-gracefully claim, do not accept it" --procedure "Trace the retry loop for backoff and circuit-breaker behavior" --next-check "Reject the claim if no backoff or circuit breaker exists" --calls 1 --input-tokens 150 --output-tokens 70 --context-tokens 800
SN="$SF/runs/dispatches/signal-negative-1"
check "negative case does not silently accept the degrades-gracefully claim" "grep -q 'Rejected' '$SN/result.json'"
check "negative case names the exact failed condition" "grep -q 'no backoff or circuit breaker' '$SN/result.json' && grep -q 'thundering-herd' '$SN/result.json'"
check "negative case records an open critical failure-lens finding instead of completing clean" "grep -q '\"severity\": \"critical\"' '$SN/result.json' && grep -q '\"lens\": \"failure\"' '$SN/result.json' && grep -q '\"status\": \"open\"' '$SN/result.json'"
check "the open finding is tracked on run state" "grep -q 'finding:aaaaaaaaaaaaaaaa' '$SF/state.json'"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
