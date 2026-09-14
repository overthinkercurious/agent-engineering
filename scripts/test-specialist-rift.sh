#!/usr/bin/env bash
# Acceptance tests for the deepened Rift specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Rift
# through the new scripts/fixtures/forge/fake-host-rift.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-rift.XXXXXX")"
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

printf '\nRift specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Rift is stage-eligible for discovery and plan (SPECIALIST_STAGES in
# dispatch.mjs). Bring a run to discovery, where a product recommendation is
# reviewed before it is approved into a plan.
advance_to_discovery(){
  local project="$1" id="$2"
  run "$project" 0 advance --id "$id" --to classified
  run "$project" 0 advance --id "$id" --to discovery
}

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","strongest"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-rift.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" critical
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-rift-positive.json" rift-positive rift-positive
host_config "$P/.dev/context/host-rift-ambiguous.json" rift-ambiguous rift-ambiguous
host_config "$P/.dev/context/host-rift-negative.json" rift-negative rift-negative

DISPATCH_ARGS=(--acceptance AC-RIFT-CHALLENGE --inputs README.md --tools read --invariants "Never propose the plan or rewrite the recommendation" --procedure "Challenge the product recommendation as actually written" --next-check "Record the challenge verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --model-escalation-reason "Rift is registered strongest and this project runs the mixed-model profile")

# --- Positive: Rift names a specific, falsifiable weakness (the pilot metric
# is confounded by seasonality) and classifies it minor, not fatal. It does
# not rubber-stamp with vague praise, and it does not block the recommendation
# over a non-fatal issue. -----------------------------------------------------
run "$P" 0 start --title "In-app reminders to reduce churn" --kind idea --signals product --id rift-positive
advance_to_discovery "$P" rift-positive
run "$P" 0 dispatch --id rift-positive --dispatch-id rift-check --specialist rift --stage discovery --host-config .dev/context/host-rift-positive.json --independent --request "Challenge the in-app reminder recommendation" "${DISPATCH_ARGS[@]}"
RP="$P/.dev/work/rift-positive/runs/dispatches/rift-check"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$RP/record.json' && grep -q '\"validation\": \"passed\"' '$RP/record.json'"
check "positive case names a specific falsifiable weakness, not vague praise" "grep -q 'confounded by seasonality' '$RP/result.json'"
check "positive case classifies the weakness minor, not fatal" "grep -q '\"outcome\": \"minor:' '$RP/result.json' && ! grep -q '\"outcome\": \"fatal:' '$RP/result.json'"
check "positive case records the weakness as an open finding, not a silent pass" "grep -q 'finding:3f8a1c2d9b7e4051' '$RP/result.json' && grep -q '\"status\": \"open\"' '$RP/result.json'"
check "positive case names no inappropriate specialist escalation" "grep -q '\"needs_specialist\": \[\]' '$RP/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$P/.dev/work/rift-positive/state.json' && ! grep -q '\"status\": \"blocked\"' '$P/.dev/work/rift-positive/state.json'"

# --- Ambiguous: Rift lacks the actual recommendation text and the
# alternatives Scout/Pulse considered, and must name those exact missing
# inputs via needs_input rather than invent an objection. --------------------
run "$P" 0 start --title "Some future product idea" --kind idea --signals product --id rift-ambiguous
advance_to_discovery "$P" rift-ambiguous
run "$P" 0 dispatch --id rift-ambiguous --dispatch-id rift-check --specialist rift --stage discovery --host-config .dev/context/host-rift-ambiguous.json --independent --request "Challenge a recommendation not yet supplied" "${DISPATCH_ARGS[@]}"
RA="$P/.dev/work/rift-ambiguous/runs/dispatches/rift-check"
check "ambiguous case is recorded as blocked pending the missing input" "grep -q '\"status\": \"blocked\"' '$P/.dev/work/rift-ambiguous/state.json'"
check "ambiguous case names the recommendation text and alternatives as missing inputs" "grep -q 'recommendation_text' '$RA/result.json' && grep -q 'alternatives_considered' '$RA/result.json'"
check "ambiguous case invents no objection or finding" "grep -q '\"findings\": \[\]' '$RA/result.json'"

# --- Negative: the naive review ('looks solid, tighten the button copy')
# would rubber-stamp this. Rift must not accept that; it must find the
# stated non-goal does not actually exclude the highest-risk part of the
# request, and classify it fatal. --------------------------------------------
run "$P" 0 start --title "In-app reminders, enterprise excluded" --kind idea --signals product --id rift-negative
advance_to_discovery "$P" rift-negative
run "$P" 0 dispatch --id rift-negative --dispatch-id rift-check --specialist rift --stage discovery --host-config .dev/context/host-rift-negative.json --independent --request "Challenge the in-app reminder recommendation" "${DISPATCH_ARGS[@]}"
RN="$P/.dev/work/rift-negative/runs/dispatches/rift-check"
check "negative case dispatch validates (Rift still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$RN/record.json'"
check "negative case classifies the finding fatal, not a rubber-stamped pass" "grep -q '\"outcome\": \"fatal:' '$RN/result.json'"
check "negative case names the exact failed condition: the non-goal does not exclude the shared login cohort" "grep -q 'does not actually exclude enterprise accounts' '$RN/result.json' && grep -q 'shared.*login cohort' '$RN/result.json'"
check "negative case records an open critical finding instead of surface-level nitpicks" "grep -q '\"severity\": \"critical\"' '$RN/result.json' && grep -q '\"status\": \"open\"' '$RN/result.json'"
check "negative finding is tracked as an open finding on the run, not silently dropped" "grep -q 'finding:9d2b6e1a4f0c7358' '$P/.dev/work/rift-negative/state.json'"

printf '\nRift specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
