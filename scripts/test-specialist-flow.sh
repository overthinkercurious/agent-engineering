#!/usr/bin/env bash
# Contract fixtures for the deepened Flow specialist workflow.
# Structural pattern follows scripts/test-forge.sh: same PASS/FAIL harness,
# same make_project-style temp Git project, same forge.mjs dispatch shape.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-flow.XXXXXX")"
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

printf '\nFlow specialist acceptance\n'

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
  node -e 'const fs=require("fs");const id=process.argv[3],mode=process.argv[4];const config={schema:1,id,command:"node",args:[process.argv[2],"--mode",mode,"--adapter-id",id,"--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(config,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-flow.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" prototype
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-flow-positive.json" flow-positive flow-positive
host_config "$P/.dev/context/host-flow-ambiguous.json" flow-ambiguous flow-ambiguous
host_config "$P/.dev/context/host-flow-negative.json" flow-negative flow-negative

# Reach a state where Flow is both selected (via triggering signals) and
# stage-eligible. SPECIALIST_STAGES['flow'] = ['plan', 'audit'] and the
# 'plan' stage is eligible while status is in
# ['definition', 'plan_review', 'awaiting_approval'] (see dispatch.mjs
# STAGE_STATES). Reaching 'definition' needs only discovery synthesis.
run "$P" 0 start --title "Checkout onboarding redesign" --kind feature --signals ui,ux,journey,onboarding --id flow-fixture
SF="$P/.dev/work/flow-fixture"
check "Flow is routed for a ui/ux/journey/onboarding-signaled run" "grep -q '\"flow\"' '$SF/manifest.json'"

run "$P" 0 advance --id flow-fixture --to classified
run "$P" 0 advance --id flow-fixture --to discovery
put "$SF/discovery/synthesis.md" "checkout onboarding needs a redesigned first-run and error path"
run "$P" 0 advance --id flow-fixture --to definition
check "run reaches definition, where the plan stage is dispatch-eligible" "grep -q '\"status\": \"definition\"' '$OUT'"

# --- Positive: walks happy path and forced-failure path, confirms clear
# error message and input retention on retry
run "$P" 0 dispatch --id flow-fixture --dispatch-id flow-positive-1 --specialist flow --stage plan --host-config .dev/context/host-flow-positive.json --independent --request "Confirm the checkout submission journey satisfies acceptance on the happy path and a forced payment failure" --acceptance AC-checkout-submit --inputs README.md --tools read --invariants "Walk the failure path to a terminal state, not just to the thrown error" --procedure "Walk checkout submission twice: once succeeding, once with the payment request forced to fail" --next-check "Confirm the failure path shows a clear message and preserves entered input" --calls 1 --input-tokens 210 --output-tokens 95 --context-tokens 1200
FP="$SF/runs/dispatches/flow-positive-1"
check "positive case validates and completes" "grep -q '\"validation\": \"passed\"' '$FP/record.json' && grep -q '\"status\": \"complete\"' '$FP/result.json'"
check "positive case confirms a clear, actionable error message" "grep -q 'could not be processed' '$FP/result.json'"
check "positive case confirms entered input survives the retry" "grep -q 'details remain in the form' '$FP/result.json'"
check "positive case grounds the conclusion in observed evidence for both paths" "grep -q 'observed:happy-path-confirmation' '$FP/result.json' && grep -q 'observed:error-state' '$FP/result.json'"
check "positive case does not escalate or pause the run" "grep -q '\"status\": \"acknowledged\"' '$FP/record.json'"

# --- Ambiguous: missing approved journey/wireframe and exercisable error states
run "$P" 0 dispatch --id flow-fixture --dispatch-id flow-ambiguous-1 --specialist flow --stage plan --host-config .dev/context/host-flow-ambiguous.json --independent --request "Accept the new first-run onboarding journey with no approved wireframe supplied" --acceptance AC-onboarding-first-run --inputs README.md --tools read --invariants "Do not invent onboarding behavior or error-state coverage" --procedure "Attempt to model and walk the onboarding journey" --next-check "Return the missing-input status if the journey or error-state evidence is absent" --calls 1 --input-tokens 85 --output-tokens 28 --context-tokens 400
FA="$SF/runs/dispatches/flow-ambiguous-1"
check "ambiguous case returns needs_input" "grep -q '\"status\": \"needs_input\"' '$FA/result.json'"
check "ambiguous case names the actual missing inputs from flow.md" "grep -q 'approved journey or wireframe' '$FA/result.json' && grep -q 'exercise its error states' '$FA/result.json'"
check "ambiguous case pauses the run as blocked, awaiting the missing input" "grep -q '\"status\": \"blocked\"' '$SF/state.json'"
run "$P" 0 resume --id flow-fixture

# --- Negative: naive "happy path was walked, so the flow works" claim must
# not pass silently
run "$P" 0 dispatch --id flow-fixture --dispatch-id flow-negative-1 --specialist flow --stage plan --host-config .dev/context/host-flow-negative.json --independent --request "Confirm the checkout submission flow works; the happy path was walked" --acceptance AC-checkout-submit --inputs README.md --tools read --invariants "Test the happy-path-only claim, do not accept it" --procedure "Walk the happy path, then force the submission network request to fail" --next-check "Reject the claim if the failure path has no visible message" --calls 1 --input-tokens 160 --output-tokens 75 --context-tokens 900
FN="$SF/runs/dispatches/flow-negative-1"
check "negative case does not silently accept the happy-path-only claim" "grep -q 'Rejected' '$FN/result.json'"
check "negative case names the exact failed condition" "grep -q 'never tested with the network request failing' '$FN/result.json' && grep -q 'no visible message at all' '$FN/result.json'"
check "negative case records an open critical journey-lens finding instead of completing clean" "grep -q '\"severity\": \"critical\"' '$FN/result.json' && grep -q '\"lens\": \"journey\"' '$FN/result.json' && grep -q '\"status\": \"open\"' '$FN/result.json'"
check "the open finding is tracked on run state" "grep -q 'finding:bbbbbbbbbbbbbbbb' '$SF/state.json'"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
