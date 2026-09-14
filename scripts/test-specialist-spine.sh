#!/usr/bin/env bash
# Acceptance tests for the deepened Spine specialist workflow.
# Mirrors the structural pattern of scripts/test-forge.sh: same PASS/FAIL
# harness, same make_project-style temp Git project setup, same
# `node skills/ae-forge/scripts/forge.mjs dispatch ...` invocation shape.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-spine.XXXXXX")"
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

printf '\nae-forge Spine specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Spine is a "strongest" model-class specialist (registry.json), so the
# project uses the critical policy variant (model_profile: mixed) and every
# dispatch below records an explicit model-escalation reason.
P="$WORK/project"; make_project "$P" critical
mkdir -p "$P/.dev/context"
cp "$KIT/scripts/fixtures/forge/fake-host-spine.mjs" "$P/.dev/context/fake-host-spine.mjs"

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[".dev/context/fake-host-spine.mjs","--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","strongest"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" _ "$2" "$3"
}
host_config "$P/.dev/context/host-spine-positive.json" spine-positive spine-positive
host_config "$P/.dev/context/host-spine-ambiguous.json" spine-ambiguous spine-ambiguous
host_config "$P/.dev/context/host-spine-negative.json" spine-negative spine-negative

# Advance a feature (not a bug) with architecture/integration/api signals so
# Spine is routed at start (routing cannot change after approval) and no
# diagnosis-required gate blocks definition. Spine's eligible stage is
# "plan" (definition/plan_review/awaiting_approval), not "implementation" —
# Spine designs the boundary before Core implements it.
advance_to_plan(){
  id="$1"
  run "$P" 0 start --title "Spine fixture $id" --kind feature --signals architecture,integration,api --id "$id"
  F="$P/.dev/work/$id"
  check "Spine is routed for $id" "grep -q '\"spine\"' '$OUT'"
  put "$F/intent.md" "# Intent: bounded interface-boundary fixture for $id"
  run "$P" 0 advance --id "$id" --to classified
  run "$P" 0 advance --id "$id" --to discovery
  put "$F/discovery/synthesis.md" "orders CreateOrder shippingRegion boundary change requested"
  run "$P" 0 advance --id "$id" --to definition
  put "$F/design/definition.md" "bounded interface-boundary definition"
  put "$F/plan/implementation.md" "interface contract and compatibility plan under review"
  run "$P" 0 advance --id "$id" --to plan_review
}

## --- Positive: valid worked example ---------------------------------------
advance_to_plan "spine-positive-case"
run "$P" 0 dispatch --id spine-positive-case --dispatch-id spine-positive-1 --specialist spine --stage plan \
  --host-config .dev/context/host-spine-positive.json --model-escalation-reason "Cross-service interface-compatibility risk requires the evaluated strongest host model" \
  --request "Design the CreateOrder shippingRegion interface change" --acceptance AC-SPINE-POSITIVE --inputs README.md --tools read \
  --invariants "Every existing caller must keep working unmodified" --procedure "Classify additive vs breaking and require versioning if breaking" \
  --next-check "Record the compatibility path before implementation proceeds" --calls 1 --input-tokens 900 --output-tokens 420 --context-tokens 2000
SP="$P/.dev/work/spine-positive-case/runs/dispatches/spine-positive-1"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$SP/record.json' && grep -q '\"status\": \"complete\"' '$SP/result.json'"
check "positive case records no inappropriate escalation" "[ \$(node -e \"const r=require('$SP/result.json');process.stdout.write(String(r.needs_specialist.length))\") = 0 ]"
check "positive case cites the caller map, breaking classification, and v2 compatibility decision" "grep -q 'observed:callers-createorder' '$SP/result.json' && grep -q 'decided:breaking-classification' '$SP/result.json' && grep -q 'decided:v2-compat-path' '$SP/result.json'"

## --- Ambiguous: missing-input example -------------------------------------
advance_to_plan "spine-ambiguous-case"
run "$P" 0 dispatch --id spine-ambiguous-case --dispatch-id spine-ambiguous-1 --specialist spine --stage plan \
  --host-config .dev/context/host-spine-ambiguous.json --model-escalation-reason "Cross-service interface-compatibility risk requires the evaluated strongest host model" \
  --request "Design the orders-to-warehouse-sync boundary" --acceptance AC-SPINE-AMBIGUOUS --inputs README.md --tools read \
  --invariants "Do not invent contract or caller facts" --procedure "State the boundary design only once required inputs are present" \
  --next-check "Resume once the current contract and caller list are supplied" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 500
AC="$P/.dev/work/spine-ambiguous-case"
check "ambiguous case returns needs_input and pauses the run" "grep -q '\"status\": \"blocked\"' '$AC/state.json' && grep -q '\"status\": \"needs_input\"' '$AC/runs/dispatches/spine-ambiguous-1/result.json'"
check "ambiguous case names the actual missing inputs from Spine's Inputs/Missing-inputs sections" "grep -q 'current_interface_contract' '$AC/runs/dispatches/spine-ambiguous-1/result.json' && grep -q 'existing_callers' '$AC/runs/dispatches/spine-ambiguous-1/result.json'"
check "ambiguous case records no invented boundary decision" "! grep -q 'decided:v2-compat-path' '$AC/runs/dispatches/spine-ambiguous-1/result.json'"

## --- Negative: the naive "looks fine" answer must not pass ----------------
advance_to_plan "spine-negative-case"
run "$P" 0 dispatch --id spine-negative-case --dispatch-id spine-negative-1 --specialist spine --stage plan \
  --host-config .dev/context/host-spine-negative.json --model-escalation-reason "Cross-service interface-compatibility risk requires the evaluated strongest host model" \
  --request "Confirm the submitted CreateOrder change is backward compatible" --acceptance AC-SPINE-NEGATIVE --inputs README.md --tools read \
  --invariants "Do not accept an unverified compatibility claim" --procedure "Check the actual schema diff and caller list before agreeing the change is compatible" \
  --next-check "Record a finding if the change is not actually compatible" --calls 1 --input-tokens 900 --output-tokens 420 --context-tokens 2000
SN="$P/.dev/work/spine-negative-case/runs/dispatches/spine-negative-1"
check "negative case does not silently complete as fine" "grep -q '\"status\": \"complete\"' '$SN/result.json' && grep -q '\"status\": \"open\"' '$SN/result.json'"
check "negative case records a finding naming the exact failed condition (required field breaks existing callers)" "grep -q 'required' '$SN/result.json' && grep -q 'checkout-web' '$SN/result.json'"
check "negative case finding is tagged critical severity under the compat lens" "grep -q '\"severity\": \"critical\"' '$SN/result.json' && grep -q '\"lens\": \"compat\"' '$SN/result.json'"
check "negative case rejects the naive backward-compatible claim as insufficient evidence" "grep -q 'not backward compatible' '$SN/result.json' || grep -q 'not accept' '$SN/result.json'"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
