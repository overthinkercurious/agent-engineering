#!/usr/bin/env bash
# Acceptance tests for the deepened Pixel specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Pixel
# through the new scripts/fixtures/forge/fake-host-pixel.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-pixel.XXXXXX")"
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

printf '\nPixel specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Bring a run to a Pixel-eligible stage (implementation) the same way
# test-forge.sh advances secure-billing: classified -> discovery -> definition
# -> plan_review -> awaiting_approval -> approve -> implementation.
advance_to_implementation(){
  local project="$1" id="$2" dir="$3"
  run "$project" 0 advance --id "$id" --to classified
  run "$project" 0 advance --id "$id" --to discovery
  put "$dir/discovery/synthesis.md" "symptom and scope recorded"
  run "$project" 0 advance --id "$id" --to definition
  put "$dir/design/definition.md" "approved checkout design: idle, submitting, success, failure"
  put "$dir/plan/implementation.md" "bounded plan"
  run "$project" 0 advance --id "$id" --to plan_review
  put "$dir/reviews/plan-review.md" "reviewed"
  run "$project" 0 advance --id "$id" --to awaiting_approval
  put "$dir/intent.md" "# Intent: implement the approved checkout form"
  run "$project" 0 approve --id "$id"
  run "$project" 0 advance --id "$id" --to implementation
}

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-pixel.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" prototype
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-pixel-positive.json" pixel-positive pixel-positive
host_config "$P/.dev/context/host-pixel-ambiguous.json" pixel-ambiguous pixel-ambiguous
host_config "$P/.dev/context/host-pixel-negative.json" pixel-negative pixel-negative

DISPATCH_ARGS=(--acceptance AC-CHECKOUT-FORM --inputs README.md --tools read --write src --invariants "Implement only the approved design states" --procedure "Map each approved design state to a code path" --next-check "Record the state map and any escalation" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000)

# --- Positive: Pixel implements the checkout form exactly per the approved
# design, mapping all four approved states to code paths, and completes with
# no inappropriate escalation. --------------------------------------------
run "$P" 0 start --title "Checkout form" --kind feature --signals ui --id pixel-positive
PP="$P/.dev/work/pixel-positive"
advance_to_implementation "$P" pixel-positive "$PP"
run "$P" 0 dispatch --id pixel-positive --dispatch-id pixel-impl --specialist pixel --stage implementation --host-config .dev/context/host-pixel-positive.json --independent --request "Implement the approved checkout form" "${DISPATCH_ARGS[@]}"
PPR="$PP/runs/dispatches/pixel-impl"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$PPR/record.json' && grep -q '\"validation\": \"passed\"' '$PPR/record.json'"
check "positive case cites the design-state-to-code-path map for every approved state" "grep -q 'checkout-state-map' '$PPR/result.json' && grep -q 'checkout-state-test' '$PPR/result.json'"
check "positive case names no inappropriate specialist escalation" "grep -q '\"needs_specialist\": \[\]' '$PPR/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$PP/state.json' && ! grep -q '\"status\": \"blocked\"' '$PP/state.json'"

# --- Ambiguous: the approved design is silent on an offline/interrupted-
# submission state. Pixel must escalate that exact missing input to Flow
# (Pixel's Missing-inputs section) instead of inventing offline UI. --------
run "$P" 0 start --title "Checkout form, no offline state specified" --kind feature --signals ui --id pixel-ambiguous
PA="$P/.dev/work/pixel-ambiguous"
advance_to_implementation "$P" pixel-ambiguous "$PA"
run "$P" 0 dispatch --id pixel-ambiguous --dispatch-id pixel-impl --specialist pixel --stage implementation --host-config .dev/context/host-pixel-ambiguous.json --independent --request "Implement the approved checkout form" "${DISPATCH_ARGS[@]}"
PAR="$PA/runs/dispatches/pixel-impl"
check "ambiguous case is recorded as awaiting the escalated specialist" "grep -q '\"status\": \"awaiting_specialist\"' '$PA/state.json'"
check "ambiguous case names flow and the missing offline state" "grep -q '\"specialty\": \"flow\"' '$PAR/result.json' && grep -q 'offline_submission_state' '$PAR/result.json'"
check "ambiguous case invents no offline UI or finding" "grep -q '\"findings\": \[\]' '$PAR/result.json'"

# --- Negative: the claim "the implementation matches the design's inline
# error message" is false — it only logs to the console. Pixel must not
# accept that claim; it records an open finding instead of completing
# clean. --------------------------------------------------------------------
run "$P" 0 start --title "Checkout form audit" --kind feature --signals ui --id pixel-negative
PN="$P/.dev/work/pixel-negative"
advance_to_implementation "$P" pixel-negative "$PN"
run "$P" 0 dispatch --id pixel-negative --dispatch-id pixel-audit --specialist pixel --stage implementation --host-config .dev/context/host-pixel-negative.json --independent --request "Verify the checkout form matches the approved design" "${DISPATCH_ARGS[@]}"
PNR="$PN/runs/dispatches/pixel-audit"
check "negative case dispatch validates (Pixel still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$PNR/record.json'"
check "negative case records an open finding instead of a clean pass" "grep -q '\"severity\": \"high\"' '$PNR/result.json' && grep -q '\"status\": \"open\"' '$PNR/result.json'"
check "negative case names the exact failed condition: the inline error is not rendered, only logged" "grep -q 'console.error' '$PNR/result.json' && grep -q 'renders no visible element' '$PNR/result.json'"
check "negative finding is tracked as an open finding on the run, not silently dropped" "grep -q 'finding:9f2b7e1a6c3d5804' '$PN/state.json'"

printf '\nPixel specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
