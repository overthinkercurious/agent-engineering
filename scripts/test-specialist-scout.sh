#!/usr/bin/env bash
# Acceptance tests for the deepened Scout specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Scout
# through the new scripts/fixtures/forge/fake-host-scout.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-scout.XXXXXX")"
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

printf '\nScout specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Scout is only stage-eligible for discovery (SPECIALIST_STAGES.scout in
# dispatch.mjs), so bring each run just to discovery: classified -> discovery.
advance_to_discovery(){
  local project="$1" id="$2"
  run "$project" 0 advance --id "$id" --to classified
  run "$project" 0 advance --id "$id" --to discovery
}

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-scout.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" prototype
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-scout-positive.json" scout-positive scout-positive
host_config "$P/.dev/context/host-scout-ambiguous.json" scout-ambiguous scout-ambiguous
host_config "$P/.dev/context/host-scout-negative.json" scout-negative scout-negative

DISPATCH_ARGS=(--acceptance AC-OPPORTUNITY-EVIDENCE --inputs README.md --tools read --invariants "Cite every material claim; never manufacture market size, customer counts, or traction" --procedure "Turn the decision into research questions, gather primary evidence, examine current alternatives including doing nothing, check reused research for staleness" --next-check "Record the evidence report with sources, dates, confidence, and alternatives" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000)

# --- Positive: Scout finds a real recurring support-ticket pattern with a
# count and date range, cites the export receipt, and names a credible
# alternative (a pinned help-center article) considered and set aside. ------
run "$P" 0 start --title "Recurring onboarding confusion" --kind idea --signals research --id scout-positive
advance_to_discovery "$P" scout-positive
SP="$P/.dev/work/scout-positive"
run "$P" 0 dispatch --id scout-positive --dispatch-id scout-check --specialist scout --stage discovery --host-config .dev/context/host-scout-positive.json --independent --request "Assess whether recurring onboarding confusion is a real opportunity" "${DISPATCH_ARGS[@]}"
SPR="$SP/runs/dispatches/scout-check"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$SPR/record.json' && grep -q '\"validation\": \"passed\"' '$SPR/record.json'"
check "positive case cites a dated, counted support-ticket pattern" "grep -q '34 support tickets' '$SPR/result.json' && grep -q '2026-06-01' '$SPR/result.json' && grep -q '2026-08-15' '$SPR/result.json'"
check "positive case names a credible alternative considered and set aside" "grep -q 'pinned-article-alternative' '$SPR/result.json' && grep -q 'pinned' '$SPR/result.json'"
check "positive case names no inappropriate specialist escalation" "grep -q '\"needs_specialist\": \[\]' '$SPR/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$SP/state.json' && ! grep -q '\"status\": \"blocked\"' '$SP/state.json'"

# --- Ambiguous: real demand evidence exists, but feasibility turns on a
# pending integration-boundary decision. Scout must escalate to spine naming
# the exact missing input rather than guessing at feasibility. --------------
run "$P" 0 start --title "Bulk export opportunity, boundary unresolved" --kind idea --signals research --id scout-ambiguous
advance_to_discovery "$P" scout-ambiguous
SA="$P/.dev/work/scout-ambiguous"
run "$P" 0 dispatch --id scout-ambiguous --dispatch-id scout-check --specialist scout --stage discovery --host-config .dev/context/host-scout-ambiguous.json --independent --request "Assess whether bulk export is a viable opportunity" "${DISPATCH_ARGS[@]}"
SAR="$SA/runs/dispatches/scout-check"
check "ambiguous case is recorded as awaiting the missing specialist input" "grep -q '\"status\": \"awaiting_specialist\"' '$SA/state.json'"
check "ambiguous case escalates to spine naming the exact missing input" "grep -q '\"specialty\": \"spine\"' '$SAR/result.json' && grep -q 'integration_boundary_feasibility' '$SAR/result.json'"
check "ambiguous case invents no feasibility finding" "grep -q '\"findings\": \[\]' '$SAR/result.json'"

# --- Negative: the naive read would be "users clearly want this" from a
# single sales-call comment. Scout must NOT launder that anecdote into a
# trend; it records an open finding instead of completing clean. -----------
run "$P" 0 start --title "One-click import demand claim" --kind idea --signals research --id scout-negative
advance_to_discovery "$P" scout-negative
SN="$P/.dev/work/scout-negative"
run "$P" 0 dispatch --id scout-negative --dispatch-id scout-check --specialist scout --stage discovery --host-config .dev/context/host-scout-negative.json --independent --request "Assess whether users clearly want a one-click import" "${DISPATCH_ARGS[@]}"
SNR="$SN/runs/dispatches/scout-check"
check "negative case dispatch validates (Scout still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$SNR/record.json'"
check "negative case records an open finding instead of a clean pass" "grep -q '\"status\": \"open\"' '$SNR/result.json'"
check "negative case names the exact failed condition: one anecdote treated as a trend, no count or corroboration" "grep -q 'as if it were a trend' '$SNR/result.json' && grep -q 'no second independent signal' '$SNR/result.json'"
check "negative case marks demand unknown rather than asserting it" "grep -q 'one_click_import_demand' '$SNR/result.json'"
check "negative finding is tracked as an open finding on the run, not silently dropped" "grep -q 'finding:7c1e4a9d2f6b0358' '$SN/state.json'"

printf '\nScout specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
