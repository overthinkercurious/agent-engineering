#!/usr/bin/env bash
# Acceptance tests for the deepened Pulse specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Pulse
# through the new scripts/fixtures/forge/fake-host-pulse.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-pulse.XXXXXX")"
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

printf '\nPulse specialist acceptance\n'

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
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-pulse.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" prototype
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-pulse-positive.json" pulse-positive pulse-positive
host_config "$P/.dev/context/host-pulse-ambiguous.json" pulse-ambiguous pulse-ambiguous
host_config "$P/.dev/context/host-pulse-negative.json" pulse-negative pulse-negative

DISPATCH_ARGS=(--acceptance AC-PRODUCT-OUTCOME --inputs README.md --tools read --invariants "State an observable outcome, explicit scope, explicit non-goals, and a measurable success signal; never accept an output as a stated outcome" --procedure "Identify the beneficiary and costly situation, state the outcome, define scope and non-goals, and choose a measurable success signal" --next-check "Record the product brief" --calls 1 --input-tokens 160 --output-tokens 80 --context-tokens 800)

# --- Positive: a vague "add bulk export" request is turned into a concrete
# outcome, explicit scope, explicit non-goals, and a measurable success
# signal drawn from an event the project already logs. -----------------------
run "$P" 0 start --title "Bulk export request" --kind feature --signals idea,product --id pulse-positive
run "$P" 0 dispatch --id pulse-positive --dispatch-id pulse-check --specialist pulse --stage discovery --host-config .dev/context/host-pulse-positive.json --request "Add bulk export to the reports page" "${DISPATCH_ARGS[@]}"
PPR="$P/.dev/work/pulse-positive/runs/dispatches/pulse-check"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$PPR/record.json' && grep -q '\"validation\": \"passed\"' '$PPR/record.json'"
check "positive case names an observable outcome, not an output" "grep -q 'Reduce the rate of manual weekly report re-exports' '$PPR/result.json'"
check "positive case states explicit scope and non-goals" "grep -q 'CSV export of the currently filtered' '$PPR/result.json' && grep -q 'non-goals' '$PPR/result.json'"
check "positive case cites a measurable success signal the project already has" "grep -q 'report_export' '$PPR/result.json'"
check "positive case names no inappropriate specialist escalation" "grep -q '\"needs_specialist\": \[\]' '$PPR/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$P/.dev/work/pulse-positive/state.json' && ! grep -q '\"status\": \"blocked\"' '$P/.dev/work/pulse-positive/state.json'"

# --- Ambiguous: "make the dashboard better" names no beneficiary and no
# success signal. Pulse must return needs_input naming exactly those two
# missing inputs instead of inventing scope. ---------------------------------
run "$P" 0 start --title "Vague dashboard request" --kind feature --signals idea,product --id pulse-ambiguous
run "$P" 0 dispatch --id pulse-ambiguous --dispatch-id pulse-check --specialist pulse --stage discovery --host-config .dev/context/host-pulse-ambiguous.json --request "Make the dashboard better" "${DISPATCH_ARGS[@]}"
PAR="$P/.dev/work/pulse-ambiguous/runs/dispatches/pulse-check"
check "ambiguous case is recorded with needs_input status" "grep -q '\"status\": \"needs_input\"' '$PAR/result.json'"
check "ambiguous case names the exact missing beneficiary and success signal" "grep -q 'beneficiary' '$PAR/result.json' && grep -q 'success_signal' '$PAR/result.json'"
check "ambiguous case invents no scope decision" "grep -q '\"assumptions\": \[\]' '$PAR/result.json'"

# --- Negative: the naive read would accept "the goal is to ship the new
# settings page" as a stated outcome. Pulse must reject that framing by name
# instead of completing as if it were a valid success measure. --------------
run "$P" 0 start --title "Settings page output claim" --kind feature --signals idea,product --id pulse-negative
run "$P" 0 dispatch --id pulse-negative --dispatch-id pulse-check --specialist pulse --stage discovery --host-config .dev/context/host-pulse-negative.json --request "The goal is to ship the new settings page" "${DISPATCH_ARGS[@]}"
PNR="$P/.dev/work/pulse-negative/runs/dispatches/pulse-check"
check "negative case dispatch validates (Pulse still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$PNR/record.json'"
check "negative case rejects the output-as-outcome claim by name" "grep -q 'names no observable change the fix is supposed to cause' '$PNR/result.json'"
check "negative case does not complete as if the output claim were a fine outcome" "grep -q '\"confirmed_outcome\"' '$PNR/result.json'"
check "negative case records the replacement outcome as unconfirmed, not decided fact" "grep -q '\"level\": \"low\"' '$PNR/result.json'"

printf '\nPulse specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
