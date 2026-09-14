#!/usr/bin/env bash
# Acceptance tests for the deepened Core specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Core
# through the new scripts/fixtures/forge/fake-host-core.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-core.XXXXXX")"
command -v cygpath >/dev/null 2>&1 && WORK="$(cygpath -m "$WORK")"
#trap 'rm -rf "$WORK"' EXIT
echo "WORK=$WORK"

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

printf '\nCore specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Bring a run to a Core-eligible stage (implementation), the same way
# test-forge.sh advances its "implementation-dispatch" fixture:
# classified -> discovery -> definition -> plan_review -> awaiting_approval
# -> approved -> implementation.
advance_to_implementation(){
  local project="$1" id="$2" dir="$3"
  put "$dir/intent.md" "# Approved intent: implement the refund endpoint contract exactly as designed."
  run "$project" 0 advance --id "$id" --to classified
  run "$project" 0 advance --id "$id" --to discovery
  put "$dir/discovery/synthesis.md" "symptom and scope recorded"
  run "$project" 0 advance --id "$id" --to definition
  put "$dir/design/definition.md" "bounded definition"
  put "$dir/plan/implementation.md" "bounded plan: implement POST /accounts/:id/refunds per the approved contract"
  run "$project" 0 advance --id "$id" --to plan_review
  put "$dir/reviews/plan-review.md" "reviewed"
  run "$project" 0 advance --id "$id" --to awaiting_approval
  run "$project" 0 approve --id "$id"
  run "$project" 0 advance --id "$id" --to implementation
}

# Positive Core review happens at audit stage citing a real runner-owned
# receipt, so bring the run all the way from implementation through
# integration into audit.
advance_to_audit(){
  local project="$1" id="$2" dir="$3"
  advance_to_implementation "$project" "$id" "$dir"
  put "$dir/implementation/summary.md" "refund handler implemented per approved contract"
  run "$project" 0 advance --id "$id" --to integration
  put "$dir/implementation/integration.md" "integrated"
  run "$project" 0 advance --id "$id" --to audit
}

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-core.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" prototype
mkdir -p "$P/.dev/context" "$P/src" "$P/hidden"
cp "$KIT/scripts/fixtures/forge/config-precedence/src/"*.mjs "$P/src/"
cp "$KIT/scripts/fixtures/forge/config-precedence/hidden/precedence.test.mjs" "$P/hidden/precedence.test.mjs"
# The committed fixture's config.mjs reverses request/stored precedence; swap
# it so the policy-required regression genuinely passes, the same fix
# test-forge.sh applies to its own alpha fixture.
node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("{ ...requestOptions, ...storedDefaults }","{ ...storedDefaults, ...requestOptions }"))' "$P/src/config.mjs"
( cd "$P" && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm "add quality-gate fixture files" )

host_config "$P/.dev/context/host-core-positive.json" core-positive core-positive
host_config "$P/.dev/context/host-core-ambiguous.json" core-ambiguous core-ambiguous
host_config "$P/.dev/context/host-core-negative.json" core-negative core-negative

DISPATCH_ARGS=(--acceptance AC-REFUND-CONTRACT --inputs README.md --tools read --write src --invariants "Implement exactly what the approved interface contract specifies; escalate rather than guess an ambiguous clause" --procedure "Trace every documented response clause of POST /accounts/:id/refunds to its implementation and its check" --next-check "Record the contract-clause-to-implementation map" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000)

# --- Positive: Core implements the approved refund contract exactly,
# including its documented 202/409/422 responses, and completes with no
# inappropriate escalation. --------------------------------------------------
run "$P" 0 start --title "Refund endpoint implementation" --kind feature --signals api,backend --id core-positive
CP="$P/.dev/work/core-positive"
advance_to_audit "$P" core-positive "$CP"
run "$P" 0 verify --id core-positive --receipt-id refund-contract-check --command "node --test hidden/precedence.test.mjs"
cp "$OUT" "$WORK/verify-receipt-out.json"
check "the contract-check receipt is runner-executed and passes" "grep -q '\"exit_code\": 0' '$WORK/verify-receipt-out.json'"
run "$P" 0 dispatch --id core-positive --dispatch-id core-check --specialist core --stage audit --host-config .dev/context/host-core-positive.json --request "Implement the approved refund endpoint contract" "${DISPATCH_ARGS[@]}"
CPR="$CP/runs/dispatches/core-check"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$CPR/record.json' && grep -q '\"validation\": \"passed\"' '$CPR/record.json'"
check "positive case cites the contract clauses and the contract-check receipt" "grep -q 'receipt:refund-contract-check' '$CPR/result.json' && grep -q '202' '$CPR/result.json' && grep -q '409' '$CPR/result.json' && grep -q '422' '$CPR/result.json'"
check "positive case names no inappropriate specialist escalation" "grep -q '\"needs_specialist\": \[\]' '$CPR/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$CP/state.json' && ! grep -q '\"status\": \"blocked\"' '$CP/state.json'"

# --- Ambiguous: the approved contract never states retry-after-timeout
# idempotency semantics. Core must name that exact missing input via
# needs_specialist back to Spine (Core's Missing-inputs section), not invent
# a retry rule. --------------------------------------------------------------
run "$P" 0 start --title "Refund retry behavior, contract silent on semantics" --kind feature --signals api,backend --id core-ambiguous
CA="$P/.dev/work/core-ambiguous"
advance_to_implementation "$P" core-ambiguous "$CA"
run "$P" 0 dispatch --id core-ambiguous --dispatch-id core-check --specialist core --stage implementation --host-config .dev/context/host-core-ambiguous.json --request "Implement retry-after-timeout behavior for the refund endpoint" "${DISPATCH_ARGS[@]}"
CAR="$CA/runs/dispatches/core-check"
check "ambiguous case is recorded as awaiting the missing specialist input" "grep -q '\"status\": \"awaiting_specialist\"' '$CA/state.json'"
check "ambiguous case escalates to spine naming the exact missing clause" "grep -q '\"specialty\": \"spine\"' '$CAR/result.json' && grep -q 'retry_idempotency_semantics' '$CAR/result.json'"
check "ambiguous case invents no retry rule or finding" "grep -q '\"findings\": \[\]' '$CAR/result.json'"

# --- Negative: the naive read ('implementation matches the plan, tests
# pass') would say "looks fine"; Core must not silently pass that. It
# records an open finding for the contract-violating duplicate-request
# overwrite instead of completing clean. --------------------------------
run "$P" 0 start --title "Refund endpoint, duplicate request overwrites" --kind feature --signals api,backend --id core-negative
CN="$P/.dev/work/core-negative"
advance_to_implementation "$P" core-negative "$CN"
run "$P" 0 dispatch --id core-negative --dispatch-id core-check --specialist core --stage implementation --host-config .dev/context/host-core-negative.json --request "Implement the approved refund endpoint contract" "${DISPATCH_ARGS[@]}"
CNR="$CN/runs/dispatches/core-check"
check "negative case dispatch validates (Core still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$CNR/record.json'"
check "negative case records an open high-severity finding instead of a clean pass" "grep -q '\"severity\": \"high\"' '$CNR/result.json' && grep -q '\"status\": \"open\"' '$CNR/result.json'"
check "negative case names the exact failed condition: 409 required, 200 overwrite observed" "grep -q 'silently overwrites the prior refund record' '$CNR/result.json'"
check "negative finding is tracked as an open finding on the run, not silently dropped" "grep -q 'finding:9a3f7c2e5b1d0864' '$CN/state.json'"

printf '\nCore specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
