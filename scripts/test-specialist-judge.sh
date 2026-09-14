#!/usr/bin/env bash
# Acceptance tests for the deepened Judge specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Judge
# through the new scripts/fixtures/forge/fake-host-judge.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-judge.XXXXXX")"
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

printf '\nJudge specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Bring a run to a Judge-eligible stage (verification) the same way
# test-forge.sh advances secure-billing all the way through implementation,
# integration, and audit.
advance_to_verification(){
  local project="$1" id="$2" dir="$3"
  run "$project" 0 advance --id "$id" --to classified
  run "$project" 0 advance --id "$id" --to discovery
  put "$dir/discovery/synthesis.md" "symptom and scope recorded"
  run "$project" 0 advance --id "$id" --to definition
  put "$dir/design/definition.md" "bounded definition"
  put "$dir/plan/implementation.md" "bounded plan"
  run "$project" 0 advance --id "$id" --to plan_review
  put "$dir/reviews/plan-review.md" "reviewed"
  run "$project" 0 advance --id "$id" --to awaiting_approval
  put "$dir/intent.md" "# Intent: bounded change with observable acceptance."
  run "$project" 0 approve --id "$id"
  run "$project" 0 advance --id "$id" --to implementation
  put "$dir/implementation/summary.md" "bounded implementation"
  run "$project" 0 advance --id "$id" --to integration
  put "$dir/implementation/integration.md" "integrated"
  run "$project" 0 advance --id "$id" --to audit
  put "$dir/reviews/domain-audit.md" "independent domain audit"
  run "$project" 0 advance --id "$id" --to verification
  put "$dir/verification/summary.md" "independent verification"
}

host_config(){
  # $1 output path, $2 adapter id, $3 mode, remaining args appended verbatim
  node -e 'const fs=require("fs");const extra=process.argv.slice(5);const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","strongest",...extra],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-judge.mjs" "$2" "$3" "${@:4}"
}

P="$WORK/project"; make_project "$P" critical
mkdir -p "$P/.dev/context" "$P/src" "$P/hidden"
cp "$KIT/scripts/fixtures/forge/config-precedence/src/"*.mjs "$P/src/"
cp "$KIT/scripts/fixtures/forge/config-precedence/hidden/precedence.test.mjs" "$P/hidden/precedence.test.mjs"
# The raw fixture ships the precedence defect (stored defaults win over an
# explicit request option); apply the same one-line fix test-forge.sh applies
# so the declared quality command actually passes and Judge has a real green
# receipt to cite.
node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("{ ...requestOptions, ...storedDefaults }","{ ...storedDefaults, ...requestOptions }"))' "$P/src/config.mjs"
( cd "$P" && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm "add precedence fixture" )

# All host-config fixture files are written up front, before any `verify` or
# `dispatch` call. Candidate identity is a hash of every untracked file
# outside .dev/work (see identity.mjs candidateIdentity), so writing a new
# host-config file between `verify` and `dispatch` would change the candidate
# identity out from under the receipt `verify` just wrote, and the receipt
# would then fail to resolve for the dispatch. Declaring every host-config
# fixture before any verify/dispatch call keeps the untracked-file set (and
# therefore the candidate identity) stable across each case's verify+dispatch
# pair.
host_config "$P/.dev/context/host-judge-positive.json" judge-positive judge-positive --cite-receipt judge-positive-regression
host_config "$P/.dev/context/host-judge-ambiguous.json" judge-ambiguous judge-ambiguous --cite-receipt judge-ambiguous-regression
host_config "$P/.dev/context/host-judge-negative.json" judge-negative judge-negative

DISPATCH_ARGS=(--acceptance AC-1,AC-2 --inputs README.md --tools read --invariants "Cite only real runner-owned receipts and independent verification" --procedure "Trace every acceptance id to a receipt or an independent Probe result" --next-check "Record the release verdict" --calls 1 --input-tokens 220 --output-tokens 110 --context-tokens 1200 --model-escalation-reason "Judge is registered strongest and this project runs the mixed-model profile")

# --- Positive: Judge traces every acceptance id to a cited MEASURED receipt
# that the runner itself wrote via `forge.mjs verify`, plus an independent
# Probe result, finds full coverage, and returns complete. ------------------
run "$P" 0 start --title "Positive release verdict" --kind feature --signals api --id judge-positive
JP="$P/.dev/work/judge-positive"
advance_to_verification "$P" judge-positive "$JP"
run "$P" 0 verify --id judge-positive --receipt-id judge-positive-regression --command "node --test hidden/precedence.test.mjs"
check "verify runner-executes the declared quality command for real" "grep -q '\"exit_code\": 0' '$OUT' && grep -q '\"issuer\": \"forge\"' '$OUT'"
run "$P" 0 dispatch --id judge-positive --dispatch-id judge-release --specialist judge --stage verification --host-config .dev/context/host-judge-positive.json --independent --request "Issue the release verdict" "${DISPATCH_ARGS[@]}"
JPR="$JP/runs/dispatches/judge-release"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$JPR/record.json' && grep -q '\"validation\": \"passed\"' '$JPR/record.json'"
check "positive case cites the real runner-owned receipt, not a self-report" "grep -q 'receipt:judge-positive-regression' '$JPR/result.json' && grep -q '\"status\": \"complete\"' '$JPR/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$JP/state.json' && ! grep -q '\"status\": \"blocked\"' '$JP/state.json'"

# --- Ambiguous: one acceptance id (AC-3) has no cited evidence at all. Judge
# must name that exact missing input via needs_input (Judge's Missing-inputs
# section), not invent coverage for it. --------------------------------------
run "$P" 0 start --title "Ambiguous release verdict" --kind feature --signals api --id judge-ambiguous
JA="$P/.dev/work/judge-ambiguous"
advance_to_verification "$P" judge-ambiguous "$JA"
run "$P" 0 verify --id judge-ambiguous --receipt-id judge-ambiguous-regression --command "node --test hidden/precedence.test.mjs"
run "$P" 0 dispatch --id judge-ambiguous --dispatch-id judge-release --specialist judge --stage verification --host-config .dev/context/host-judge-ambiguous.json --independent --request "Issue the release verdict" --acceptance AC-1,AC-2,AC-3 --inputs README.md --tools read --invariants "Cite only real runner-owned receipts and independent verification" --procedure "Trace every acceptance id to a receipt or an independent Probe result" --next-check "Record the release verdict" --calls 1 --input-tokens 220 --output-tokens 110 --context-tokens 1200 --model-escalation-reason "Judge is registered strongest and this project runs the mixed-model profile"
JAR="$JA/runs/dispatches/judge-release"
check "ambiguous case is recorded as blocked pending the missing input" "grep -q '\"status\": \"blocked\"' '$JA/state.json'"
check "ambiguous case names the uncovered acceptance id AC-3 as the missing input" "grep -q '\"AC-3\"' '$JAR/result.json'"
check "ambiguous case invents no findings to paper over the gap" "grep -q '\"findings\": \[\]' '$JAR/result.json'"

# --- Negative: Judge is asked to certify a claim with no real evidence behind
# it at all (no --cite-receipt). Judge must not silently complete as a clean
# ready verdict; it records an open finding instead, consistent with its
# Authority-and-boundaries section. ------------------------------------------
run "$P" 0 start --title "Negative release verdict" --kind feature --signals api --id judge-negative
JN="$P/.dev/work/judge-negative"
advance_to_verification "$P" judge-negative "$JN"
run "$P" 0 dispatch --id judge-negative --dispatch-id judge-release --specialist judge --stage verification --host-config .dev/context/host-judge-negative.json --independent --request "Issue the release verdict" "${DISPATCH_ARGS[@]}"
JNR="$JN/runs/dispatches/judge-release"
check "negative case dispatch validates (Judge still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$JNR/record.json'"
check "negative case does not return a clean ready verdict with no evidence" "grep -q '\"severity\": \"high\"' '$JNR/result.json' && grep -q '\"status\": \"open\"' '$JNR/result.json'"
check "negative case names the exact failed condition: no receipt or independent verification behind the claim" "grep -q 'no MEASURED receipt resolves' '$JNR/result.json'"
check "negative finding is tracked as an open finding on the run, not silently dropped" "grep -q 'finding:3f8b6d2a19e4c507' '$JN/state.json'"

printf '\nJudge specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
