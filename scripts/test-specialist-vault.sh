#!/usr/bin/env bash
# Acceptance tests for the deepened Vault specialist workflow.
# Follows the same PASS/FAIL harness and make_project-style fixture setup as
# scripts/test-forge.sh, but stays self-contained: it only dispatches Vault
# through the new scripts/fixtures/forge/fake-host-vault.mjs modes and never
# touches a shared script, schema, or another specialist's workflow file.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge-vault.XXXXXX")"
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

printf '\nVault specialist acceptance\n'

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

# Bring a run to a Vault-eligible stage (plan) the same way test-forge.sh
# advances secure-billing: classified -> discovery -> definition -> plan_review.
advance_to_plan_review(){
  local project="$1" id="$2" dir="$3"
  run "$project" 0 advance --id "$id" --to classified
  run "$project" 0 advance --id "$id" --to discovery
  put "$dir/discovery/synthesis.md" "symptom and scope recorded"
  run "$project" 0 advance --id "$id" --to definition
  put "$dir/design/definition.md" "bounded definition"
  put "$dir/plan/implementation.md" "bounded plan"
  run "$project" 0 advance --id "$id" --to plan_review
  put "$dir/reviews/plan-review.md" "reviewed"
}

host_config(){
  # $1 output path, $2 adapter id, $3 mode
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class","strongest"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$1" "$KIT/scripts/fixtures/forge/fake-host-vault.mjs" "$2" "$3"
}

P="$WORK/project"; make_project "$P" critical
mkdir -p "$P/.dev/context"

host_config "$P/.dev/context/host-vault-positive.json" vault-positive vault-positive
host_config "$P/.dev/context/host-vault-ambiguous.json" vault-ambiguous vault-ambiguous
host_config "$P/.dev/context/host-vault-negative.json" vault-negative vault-negative

DISPATCH_ARGS=(--acceptance AC-VAULT-TENANCY --inputs README.md --tools read --invariants "Never accept authentication as authorization" --procedure "Trace the ownership check for the cross-tenant refunds route" --next-check "Record the authorization verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --model-escalation-reason "Vault is registered strongest and this project runs the mixed-model profile")

# --- Positive: Vault correctly identifies and requires a test for a real
# cross-tenant authorization risk, and completes with no inappropriate
# escalation. ---------------------------------------------------------------
run "$P" 0 start --title "Internal refunds route" --kind feature --signals security,tenant --id vault-positive
VP="$P/.dev/work/vault-positive"
advance_to_plan_review "$P" vault-positive "$VP"
run "$P" 0 dispatch --id vault-positive --dispatch-id vault-check --specialist vault --stage plan --host-config .dev/context/host-vault-positive.json --independent --request "Review authorization on the internal refunds route" "${DISPATCH_ARGS[@]}"
VPR="$VP/runs/dispatches/vault-check"
check "positive case validates and completes" "grep -q '\"status\": \"acknowledged\"' '$VPR/record.json' && grep -q '\"validation\": \"passed\"' '$VPR/record.json'"
check "positive case records the cross-tenant finding as fixed, not left open" "grep -q '\"status\": \"fixed\"' '$VPR/result.json' && grep -q 'finding:7c1e9a2b4d6f0813' '$VPR/result.json'"
check "positive case names no inappropriate specialist escalation" "grep -q '\"needs_specialist\": \[\]' '$VPR/result.json'"
check "positive dispatch does not leave the run awaiting_specialist or blocked" "! grep -q '\"status\": \"awaiting_specialist\"' '$VP/state.json' && ! grep -q '\"status\": \"blocked\"' '$VP/state.json'"

# --- Ambiguous: Vault lacks the authorization model and must name that exact
# missing input via needs_input (Vault's Missing-inputs section), not invent
# an ownership rule. ---------------------------------------------------------
run "$P" 0 start --title "New refunds route, no authorization model" --kind feature --signals security,tenant --id vault-ambiguous
VA="$P/.dev/work/vault-ambiguous"
advance_to_plan_review "$P" vault-ambiguous "$VA"
run "$P" 0 dispatch --id vault-ambiguous --dispatch-id vault-check --specialist vault --stage plan --host-config .dev/context/host-vault-ambiguous.json --independent --request "Threat-model the new refunds route" "${DISPATCH_ARGS[@]}"
VAR="$VA/runs/dispatches/vault-check"
check "ambiguous case is recorded as blocked pending the missing input" "grep -q '\"status\": \"blocked\"' '$VA/state.json'"
check "ambiguous case names the authorization model as the missing input" "grep -q 'authorization_model' '$VAR/result.json'"
check "ambiguous case invents no ownership rule or finding" "grep -q '\"findings\": \[\]' '$VAR/result.json'"

# --- Negative: the naive read ('a session check exists') would say "looks
# fine"; Vault must not silently pass that. It records an open critical
# finding for the missing tenant/owner comparison instead of completing
# clean. -----------------------------------------------------------------
run "$P" 0 start --title "Refunds route with only a session check" --kind feature --signals security,tenant --id vault-negative
VN="$P/.dev/work/vault-negative"
advance_to_plan_review "$P" vault-negative "$VN"
run "$P" 0 dispatch --id vault-negative --dispatch-id vault-check --specialist vault --stage plan --host-config .dev/context/host-vault-negative.json --independent --request "Review authorization on the internal refunds route" "${DISPATCH_ARGS[@]}"
VNR="$VN/runs/dispatches/vault-check"
check "negative case dispatch validates (Vault still returns a structured result)" "grep -q '\"validation\": \"passed\"' '$VNR/record.json'"
check "negative case records an open critical finding instead of a clean pass" "grep -q '\"severity\": \"critical\"' '$VNR/result.json' && grep -q '\"status\": \"open\"' '$VNR/result.json'"
check "negative case names the exact failed condition: session identity was never compared to the resource owner" "grep -q 'never compares' '$VNR/result.json'"
check "negative finding is tracked as an open finding on the run, not silently dropped" "grep -q 'finding:7c1e9a2b4d6f0813' '$VN/state.json'"

printf '\nVault specialist acceptance: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
