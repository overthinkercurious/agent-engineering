#!/usr/bin/env bash
# Acceptance tests for the deepened Shift specialist workflow.
# Mirrors the structural pattern of scripts/test-forge.sh: same PASS/FAIL
# harness, same make_project-style temp Git project setup, same
# `node skills/ae-forge/scripts/forge.mjs dispatch ...` invocation shape.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-shift.XXXXXX")"
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

printf '\nae-forge Shift specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Shift is a "strongest" model-class specialist (registry.json), so the
# project uses the critical policy variant (model_profile: mixed) and every
# dispatch below records an explicit model-escalation reason.
P="$WORK/project"; make_project "$P" critical
mkdir -p "$P/.dev/context"
cp "$KIT/scripts/fixtures/forge/fake-host-shift.mjs" "$P/.dev/context/fake-host-shift.mjs"

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[".dev/context/fake-host-shift.mjs","--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","strongest"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" _ "$2" "$3"
}
host_config "$P/.dev/context/host-shift-positive.json" shift-positive shift-positive
host_config "$P/.dev/context/host-shift-ambiguous.json" shift-ambiguous shift-ambiguous
host_config "$P/.dev/context/host-shift-negative.json" shift-negative shift-negative

# Advance a feature (not a bug) with data/schema/migration signals so Shift
# is routed at start (routing cannot change after approval) and no
# diagnosis-required gate blocks definition.
advance_to_implementation(){
  id="$1"
  run "$P" 0 start --title "Shift fixture $id" --kind feature --signals data,schema,migration --id "$id"
  F="$P/.dev/work/$id"
  check "Shift is routed for $id" "grep -q '\"shift\"' '$OUT'"
  put "$F/intent.md" "# Intent: bounded data-change fixture for $id"
  run "$P" 0 advance --id "$id" --to classified
  run "$P" 0 advance --id "$id" --to discovery
  put "$F/discovery/synthesis.md" "orders.currency backfill requested"
  run "$P" 0 advance --id "$id" --to definition
  put "$F/design/definition.md" "bounded data-change definition"
  put "$F/plan/implementation.md" "expand/backfill/contract plan under review"
  run "$P" 0 advance --id "$id" --to plan_review
  put "$F/reviews/plan-review.md" "plan reviewed"
  run "$P" 0 advance --id "$id" --to awaiting_approval
  run "$P" 0 approve --id "$id"
  run "$P" 0 advance --id "$id" --to implementation
}

## --- Positive: valid worked example ---------------------------------------
advance_to_implementation "shift-positive-case"
run "$P" 0 dispatch --id shift-positive-case --dispatch-id shift-positive-1 --specialist shift --stage implementation \
  --host-config .dev/context/host-shift-positive.json --model-escalation-reason "Schema-integrity risk requires the evaluated strongest host model" \
  --request "Plan the orders.currency migration and backfill" --acceptance AC-SHIFT-POSITIVE --inputs README.md --tools read \
  --invariants "Preserve compatibility across the rolling-deploy window" --procedure "Design expand/backfill/contract with an idempotent batch" \
  --next-check "Record the rehearsal receipt and recovery procedure" --calls 1 --input-tokens 900 --output-tokens 420 --context-tokens 2000
SP="$P/.dev/work/shift-positive-case/runs/dispatches/shift-positive-1"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$SP/record.json' && grep -q '\"status\": \"complete\"' '$SP/result.json'"
check "positive case records no inappropriate escalation" "[ \$(node -e \"const r=require('$SP/result.json');process.stdout.write(String(r.needs_specialist.length))\") = 0 ]"
check "positive case cites the compatibility, idempotency key, and rehearsal evidence" "grep -q 'idempotency-key' '$SP/result.json' && grep -q 'expand-contract' '$SP/result.json' && grep -q 'backfill-rehearsal' '$SP/result.json'"

## --- Ambiguous: missing-input example -------------------------------------
advance_to_implementation "shift-ambiguous-case"
run "$P" 0 dispatch --id shift-ambiguous-case --dispatch-id shift-ambiguous-1 --specialist shift --stage implementation \
  --host-config .dev/context/host-shift-ambiguous.json --model-escalation-reason "Schema-integrity risk requires the evaluated strongest host model" \
  --request "Backfill orders.currency" --acceptance AC-SHIFT-AMBIGUOUS --inputs README.md --tools read \
  --invariants "Do not invent schema or scale facts" --procedure "State the plan only once required inputs are present" \
  --next-check "Resume once schema, topology, and scale evidence are supplied" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 500
AC="$P/.dev/work/shift-ambiguous-case"
check "ambiguous case returns needs_input and pauses the run" "grep -q '\"status\": \"blocked\"' '$AC/state.json' && grep -q '\"status\": \"needs_input\"' '$AC/runs/dispatches/shift-ambiguous-1/result.json'"
check "ambiguous case names the actual missing inputs from Shift's Inputs/Missing-inputs sections" "grep -q 'current_schema_definition' '$AC/runs/dispatches/shift-ambiguous-1/result.json' && grep -q 'deployment_topology' '$AC/runs/dispatches/shift-ambiguous-1/result.json' && grep -q 'orders_row_count_evidence' '$AC/runs/dispatches/shift-ambiguous-1/result.json'"
check "ambiguous case records no invented migration plan" "! grep -q 'idempotency-key' '$AC/runs/dispatches/shift-ambiguous-1/result.json'"

## --- Negative: the naive "looks fine" answer must not pass ----------------
advance_to_implementation "shift-negative-case"
run "$P" 0 dispatch --id shift-negative-case --dispatch-id shift-negative-1 --specialist shift --stage implementation \
  --host-config .dev/context/host-shift-negative.json --model-escalation-reason "Schema-integrity risk requires the evaluated strongest host model" \
  --request "Confirm the submitted orders.currency backfill is safe to run" --acceptance AC-SHIFT-NEGATIVE --inputs README.md --tools read \
  --invariants "Do not accept an unverified safety claim" --procedure "Check idempotency and rehearsal scale before agreeing the plan is safe" \
  --next-check "Record a finding if the plan is not actually safe" --calls 1 --input-tokens 900 --output-tokens 420 --context-tokens 2000
SN="$P/.dev/work/shift-negative-case/runs/dispatches/shift-negative-1"
check "negative case does not silently complete as fine" "grep -q '\"status\": \"complete\"' '$SN/result.json' && grep -q '\"status\": \"open\"' '$SN/result.json'"
check "negative case records a finding naming the exact failed condition (no idempotency key)" "grep -q 'no idempotency key' '$SN/result.json' && grep -q 'double-appl' '$SN/result.json'"
check "negative case finding is tagged critical severity under the migrate lens" "grep -q '\"severity\": \"critical\"' '$SN/result.json' && grep -q '\"lens\": \"migrate\"' '$SN/result.json'"
check "negative case rejects the naive staging-passed claim as insufficient evidence" "grep -q 'not representative' '$SN/result.json' || grep -q 'not the' '$SN/result.json'"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
