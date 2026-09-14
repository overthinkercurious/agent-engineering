#!/usr/bin/env bash
# Acceptance tests for the deterministic ae-forge runner.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-forge.XXXXXX")"
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

printf '\nae-forge acceptance\n'

EMPTY="$WORK/empty"; mkdir -p "$EMPTY"
run "$EMPTY" 3 start --title "New feature" --kind feature
check "rejects non-Git projects explicitly" "grep -q 'unsupported_project_scope' '$OUT'"

make_project(){
  project="$1"; variant="$2"
  mkdir -p "$project/.dev/knowledge" "$project/.dev/rules" "$project/.dev/policy"
  put "$project/README.md" "# Fixture"
  put "$project/.dev/knowledge/00-index.md" "# Knowledge"
  put "$project/.dev/rules/00-index.md" "# Rules"
  cp "$KIT/scripts/fixtures/forge/policy/$variant/"*.yml "$project/.dev/policy/"
  ( cd "$project" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
}

UNINIT="$WORK/uninitialized"; mkdir -p "$UNINIT"; put "$UNINIT/README.md"; ( cd "$UNINIT" && git init -q && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm fixture )
run "$UNINIT" 3 start --title "New feature" --kind feature
check "requires ae-init artifacts in a valid Git project" "grep -q 'project_not_initialized' '$OUT'"

P="$WORK/project"; make_project "$P" prototype

run "$P" 0 start --title "Secure billing portal" --kind feature --signals ui,auth,payment,api --id secure-billing
F="$P/.dev/work/secure-billing"
check "creates a durable feature workspace" "[ -s '$F/manifest.json' ] && [ -s '$F/state.json' ]"
check "routes security and verification specialists" "grep -q '\"vault\"' '$OUT' && grep -q '\"probe\"' '$OUT' && grep -q '\"judge\"' '$OUT'"
check "routes threat and journey lenses" "grep -q '\"threat\"' '$OUT' && grep -q '\"journey\"' '$OUT'"
check "prototype policy controls budget, command, and release" "grep -q '\"budget_tier\": \"small\"' '$F/manifest.json' && grep -q 'hidden/precedence.test.mjs' '$F/manifest.json' && grep -q '\"release_output\": \"pr_ready_branch\"' '$F/manifest.json'"
check "effective policy records authority and reasons" "grep -q '\"allowed_write_roots\"' '$F/context/effective-policy.json' && grep -q '\"reasons\"' '$F/context/effective-policy.json'"

run "$P" 4 advance --id secure-billing --to implementation
run "$P" 0 advance --id secure-billing --to classified
run "$P" 0 advance --id secure-billing --to discovery
put "$F/discovery/synthesis.md"
run "$P" 0 advance --id secure-billing --to definition
put "$F/design/definition.md"
put "$F/plan/implementation.md" "approved plan"
run "$P" 0 advance --id secure-billing --to plan_review
put "$F/reviews/plan-review.md"
run "$P" 0 advance --id secure-billing --to awaiting_approval
run "$P" 4 approve --id secure-billing
check "approval rejects unfinished authoritative artifacts" "grep -q 'unfinished' '$OUT'"

put "$F/intent.md" "# Intent: ship a secure billing portal with observable acceptance."
run "$P" 0 approve --id secure-billing
run "$P" 0 check --id secure-billing
check "approval receipt validates" "grep -q '\"ok\": true' '$OUT' && grep -q '\"status\": \"approved\"' '$OUT'"
run "$P" 0 advance --id secure-billing --to implementation
put "$F/implementation/summary.md"
put "$F/plan/implementation.md" "changed after approval"
run "$P" 5 advance --id secure-billing --to integration
check "approved artifact edits invalidate execution" "grep -q 'changed after approval' '$OUT'"
put "$F/plan/implementation.md" "approved plan"
run "$P" 0 advance --id secure-billing --to integration
put "$F/implementation/integration.md"
run "$P" 0 advance --id secure-billing --to audit
run "$P" 0 advance --id secure-billing --to repair --findings finding:1234567890abcdef
run "$P" 4 advance --id secure-billing --to verification
check "repair cannot skip implementation and re-audit" "grep -q 'illegal state transition' '$OUT'"
put "$F/implementation/repair-1.md" "repair finding:1234567890abcdef"
run "$P" 0 advance --id secure-billing --to implementation
put "$F/implementation/summary.md" "repaired implementation"
run "$P" 0 advance --id secure-billing --to integration
put "$F/implementation/integration.md" "repair integration"
run "$P" 0 advance --id secure-billing --to audit
put "$F/reviews/domain-audit.md" "independent re-audit"
run "$P" 0 advance --id secure-billing --to verification
put "$F/verification/summary.md" "independent re-test"

mkdir -p "$P/hidden" "$P/src" "$P/.dev/context"
cp "$KIT/scripts/fixtures/forge/config-precedence/src/"*.mjs "$P/src/"
cp "$KIT/scripts/fixtures/forge/config-precedence/hidden/precedence.test.mjs" "$P/hidden/precedence.test.mjs"
node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("{ ...requestOptions, ...storedDefaults }","{ ...storedDefaults, ...requestOptions }"))' "$P/src/config.mjs"
cp "$KIT/scripts/fixtures/forge/fake-host.mjs" "$P/.dev/context/fake-host.mjs"
node -e 'const fs=require("fs");const c={schema:1,id:"judge-secure-billing",command:"node",args:[process.argv[2],"--mode","complete","--adapter-id","judge-secure-billing","--model-class","smaller","--cite-receipt","secure-billing-regression"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$P/.dev/context/host-judge-secure-billing.json" "$P/.dev/context/fake-host.mjs"

run "$P" 0 verify --id secure-billing --receipt-id secure-billing-regression --command "node --test hidden/precedence.test.mjs"
check "verify runner-executes the declared quality command for real" "grep -q '\"exit_code\": 0' '$OUT' && grep -q '\"issuer\": \"forge\"' '$OUT'"
run "$P" 0 verify --id secure-billing --receipt-id secure-billing-regression --command "node --test hidden/precedence.test.mjs"
check "a repeated receipt id for the same command is idempotent" "grep -q '\"idempotent\": true' '$OUT'"

run "$P" 0 dispatch --id secure-billing --dispatch-id judge-release --specialist judge --stage verification --host-config .dev/context/host-judge-secure-billing.json --independent --request "Issue the final release verdict" --acceptance AC-PORTAL --inputs README.md --tools read --invariants "Cite only measured evidence" --procedure "Confirm the runner-executed regression before verdict" --next-check "Record the release verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Judge cites the runner-owned receipt as measured evidence, not a self-report" "grep -q 'receipt:secure-billing-regression' '$F/runs/dispatches/judge-release/result.json' && grep -q '\"status\": \"acknowledged\"' '$F/runs/dispatches/judge-release/record.json'"
put "$F/reviews/release-audit.md" "judge release audit"
run "$P" 0 advance --id secure-billing --to ready_for_pr
check "repair loop reaches ready only after implementation, re-audit, re-test, a runner-executed receipt, and an independent Judge verdict" "grep -q '\"status\": \"ready_for_pr\"' '$OUT'"

run "$P" 0 start --title "Cache defect" --kind bug --id cache-defect
check "ordinary work avoids security specialist cost" "! grep -q '\"vault\"' '$OUT'"
check "isolated defect is recorded as light and diagnosis-required" "grep -q '\"execution_tier\": \"light\"' '$P/.dev/work/cache-defect/manifest.json' && grep -q '\"diagnosis_required\": true' '$P/.dev/work/cache-defect/manifest.json'"
run "$P" 0 route --id cache-defect --signals security
check "new evidence expands routing" "grep -q '\"vault\"' '$OUT' && grep -q '\"threat\"' '$OUT'"
check "security evidence raises the same defect to deep with a recorded reason" "grep -q '\"execution_tier\": \"deep\"' '$P/.dev/work/cache-defect/manifest.json' && grep -q '\"source\": \"signal_update\"' '$P/.dev/work/cache-defect/context/risk-assessment.json'"
run "$P" 5 reserve --id cache-defect --operation-id denied --operation-kind specialist --tool command --write tests/out.txt --calls 1
check "authority policy rejects writes outside its effective roots" "grep -q 'outside effective authority' '$OUT'"
run "$P" 5 reserve --id cache-defect --operation-id denied-network --operation-kind specialist --tool command --network --calls 1
check "authority policy rejects unapproved network use" "grep -q 'network dispatch is outside' '$OUT'"
run "$P" 0 reserve --id cache-defect --operation-id dispatch-1 --operation-kind specialist --tool read --calls 1 --input-tokens 100 --output-tokens 20 --context-tokens 10 --wall-time-seconds 2
run "$P" 0 reserve --id cache-defect --operation-id dispatch-1 --operation-kind specialist --tool read --calls 1 --input-tokens 100 --output-tokens 20 --context-tokens 10 --wall-time-seconds 2
check "identical reservation retry is idempotent" "grep -q '\"idempotent\": true' '$OUT'"
run "$P" 0 reconcile --id cache-defect --operation-id dispatch-1 --calls 1 --context-tokens 10 --wall-time-seconds 2
check "missing host token telemetry stays explicit and uses estimates" "grep -q '\"telemetry\": \"unavailable\"' '$OUT' && grep -q '\"provenance\": \"estimated\"' '$OUT'"
run "$P" 0 reconcile --id cache-defect --operation-id dispatch-1
check "reconciliation retry does not repeat a side effect" "grep -q '\"idempotent\": true' '$OUT'"
run "$P" 0 pause --id cache-defect --to blocked --reason dependency_missing --resume-action "install dependency"
run "$P" 0 resume --id cache-defect
check "resume restores the recorded state without repeating work" "grep -q '\"status\": \"created\"' '$OUT' && grep -q '\"repeated_external_side_effect\": false' '$OUT'"

mkdir -p "$P/.dev/context"
cp "$KIT/scripts/fixtures/forge/fake-host.mjs" "$P/.dev/context/fake-host.mjs"
host_config(){
  node -e 'const fs=require("fs");const id=process.argv[3],mode=process.argv[4],model=process.argv[5],permission=process.argv[6]==="true"?"available":"unavailable",isolation=process.argv[8],telemetry=process.argv[9];const config={schema:1,id,command:"node",args:[process.argv[2],"--mode",mode,"--adapter-id",id,"--model-class",model,"--isolation",isolation,"--permission-status",permission,"--telemetry-status",telemetry],deterministic:true,cacheable:true,timeout_ms:Number(process.argv[7])};fs.writeFileSync(process.argv[1],JSON.stringify(config,null,2)+"\n")' "$1" "$P/.dev/context/fake-host.mjs" "$2" "$3" "$4" "$5" "${6:-5000}" "${7:-fresh_process}" "${8:-measured}"
}
host_config "$P/.dev/context/host-complete.json" fake-complete complete smaller true
host_config "$P/.dev/context/host-malformed.json" fake-malformed malformed smaller true
host_config "$P/.dev/context/host-secret.json" fake-secret secret smaller true
host_config "$P/.dev/context/host-needs.json" fake-needs needs-specialist smaller true
host_config "$P/.dev/context/host-strong.json" fake-strong complete strongest true
host_config "$P/.dev/context/host-unenforced.json" fake-unenforced complete smaller false
host_config "$P/.dev/context/host-fail.json" fake-fail host-fail smaller true
host_config "$P/.dev/context/host-huge.json" fake-huge huge smaller true
host_config "$P/.dev/context/host-bad-artifact.json" fake-bad-artifact bad-artifact smaller true
host_config "$P/.dev/context/host-slow.json" fake-slow slow smaller true 500
host_config "$P/.dev/context/host-self.json" fake-self needs-self smaller true
host_config "$P/.dev/context/host-counted.json" fake-counted counted smaller true
host_config "$P/.dev/context/host-needs-scout.json" fake-needs-scout needs-scout smaller true
host_config "$P/.dev/context/host-needs-probe.json" fake-needs-probe needs-probe smaller true
host_config "$P/.dev/context/host-shared.json" fake-shared complete smaller true 5000 shared_context
host_config "$P/.dev/context/host-unavailable.json" fake-unavailable unavailable smaller true 5000 fresh_process unavailable
host_config "$P/.dev/context/host-diagnosis.json" fake-diagnosis diagnosis smaller true
host_config "$P/.dev/context/host-diagnosis-blocked.json" fake-diagnosis-blocked diagnosis-blocked smaller true

run "$P" 0 start --title "Ambiguous configuration symptom" --kind bug --id diagnosis-gate
DG="$P/.dev/work/diagnosis-gate"
run "$P" 0 advance --id diagnosis-gate --to classified
run "$P" 0 advance --id diagnosis-gate --to discovery
put "$DG/discovery/synthesis.md" "symptom reproduced"
run "$P" 5 advance --id diagnosis-gate --to definition
check "corrective definition waits for a tested causal account" "grep -q 'tested diagnosis is required' '$OUT'"
run "$P" 0 dispatch --id diagnosis-gate --dispatch-id probe-diagnosis --specialist probe --stage diagnosis --host-config .dev/context/host-diagnosis.json --independent --request "Establish the cause of the configuration symptom" --acceptance AC-DIAGNOSIS --inputs README.md --tools read --invariants "Do not prescribe a repair" --procedure "Compare competing hypotheses" --next-check "Record the supported cause" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Probe records observations hypotheses tests cause and uncertainty" "grep -q '\"established_cause\"' '$DG/runs/dispatches/probe-diagnosis/result.json' && grep -q '\"disposition\": \"disproved\"' '$DG/runs/dispatches/probe-diagnosis/result.json'"
run "$P" 0 advance --id diagnosis-gate --to definition
check "tested diagnosis opens corrective definition" "grep -q '\"status\": \"definition\"' '$OUT'"

run "$P" 0 start --title "Unresolved intermittent symptom" --kind bug --id diagnosis-uncertain
DU="$P/.dev/work/diagnosis-uncertain"
run "$P" 0 advance --id diagnosis-uncertain --to classified
run "$P" 0 advance --id diagnosis-uncertain --to discovery
run "$P" 0 dispatch --id diagnosis-uncertain --dispatch-id probe-uncertain --specialist probe --stage diagnosis --host-config .dev/context/host-diagnosis-blocked.json --independent --request "Diagnose without inventing a cause" --acceptance AC-DIAGNOSIS --inputs README.md --tools read --invariants "Preserve uncertainty" --procedure "Test competing hypotheses" --next-check "Halt if the cause is unsupported" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "unsupported cause halts with uncertainty preserved" "grep -q '\"status\": \"blocked\"' '$DU/state.json' && grep -q '\"established_cause\": null' '$DU/runs/dispatches/probe-uncertain/result.json'"

host_config_for(){
  local project="$1" path="$2" id="$3" mode="$4" model="$5"
  mkdir -p "$project/.dev/context"
  cp "$KIT/scripts/fixtures/forge/fake-host.mjs" "$project/.dev/context/fake-host.mjs"
  node -e 'const fs=require("fs");const c={schema:1,id:process.argv[3],command:"node",args:[process.argv[2],"--mode",process.argv[4],"--adapter-id",process.argv[3],"--model-class",process.argv[5]],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$path" "$project/.dev/context/fake-host.mjs" "$id" "$mode" "$model"
}

MIXED="$WORK/mixed-model"; make_project "$MIXED" critical
host_config_for "$MIXED" "$MIXED/.dev/context/host-strong.json" mixed-strong complete strongest
run "$MIXED" 0 start --title "Cross-system change" --kind feature --signals external --id mixed-model
run "$MIXED" 5 dispatch --id mixed-model --dispatch-id strong-unexplained --specialist probe --stage discovery --host-config .dev/context/host-strong.json --independent --request "Inspect cross-system risk" --acceptance AC-RISK --inputs README.md --tools read --invariants bounded --procedure inspect --next-check report --calls 1 --input-tokens 100 --output-tokens 50 --context-tokens 500
check "mixed profile cannot hide an unexplained stronger-model call" "grep -q 'requires a recorded escalation reason' '$OUT'"
run "$MIXED" 0 dispatch --id mixed-model --dispatch-id strong-explained --specialist probe --stage discovery --host-config .dev/context/host-strong.json --model-escalation-reason "Deep cross-system uncertainty requires the stronger evaluated host model" --independent --request "Inspect cross-system risk" --acceptance AC-RISK --inputs README.md --tools read --invariants bounded --procedure inspect --next-check report --calls 1 --input-tokens 100 --output-tokens 50 --context-tokens 500
check "stronger-model escalation is explicit and charged as mixed" "grep -q 'mixed-profile stronger-model escalation' '$MIXED/.dev/work/mixed-model/runs/dispatches/strong-explained/packet.json' && grep -q '\"model_profile\": \"mixed\"' '$MIXED/.dev/work/mixed-model/manifest.json'"

DIFF="$WORK/diff-risk"; make_project "$DIFF" prototype
run "$DIFF" 0 start --title "Internal refactor" --kind refactor --id diff-risk
DR="$DIFF/.dev/work/diff-risk"
run "$DIFF" 0 advance --id diff-risk --to classified
run "$DIFF" 0 advance --id diff-risk --to discovery
put "$DR/discovery/synthesis.md" "isolated internal behavior"
run "$DIFF" 0 advance --id diff-risk --to definition
put "$DR/design/definition.md" "bounded refactor definition"
put "$DR/plan/implementation.md" "bounded refactor plan"
run "$DIFF" 0 advance --id diff-risk --to plan_review
put "$DR/reviews/plan-review.md" "plan accepted"
run "$DIFF" 0 advance --id diff-risk --to awaiting_approval
put "$DR/intent.md" "# Intent: bounded internal refactor"
run "$DIFF" 0 approve --id diff-risk
run "$DIFF" 0 advance --id diff-risk --to implementation
mkdir -p "$DIFF/src"; put "$DIFF/src/service.mjs" "export function authorizeTenant(permission) { return permission }"
( cd "$DIFF" && git add src/service.mjs && git -c user.email=test@example.com -c user.name=Test commit -qm security-boundary )
run "$DIFF" 0 reclassify --id diff-risk
check "completed security behavior raises rigor and adds coverage" "grep -q '\"effective_tier\": \"deep\"' '$DR/context/risk-assessment.json' && grep -q '\"vault\"' '$DR/manifest.json' && grep -q '\"threat\"' '$DR/manifest.json'"
run "$DIFF" 0 doctor --id diff-risk
check "risk reclassification remains candidate-bound and healthy" "grep -q '\"ok\": true' '$OUT'"

run "$P" 0 start --title "Implementation dispatch" --kind feature --signals api --id implementation-dispatch
I="$P/.dev/work/implementation-dispatch"
put "$I/intent.md" "# Approved implementation intent"
run "$P" 0 advance --id implementation-dispatch --to classified
run "$P" 0 advance --id implementation-dispatch --to discovery
put "$I/discovery/synthesis.md" "bounded implementation discovery"
run "$P" 0 advance --id implementation-dispatch --to definition
put "$I/design/definition.md" "bounded implementation definition"
put "$I/plan/implementation.md" "bounded implementation plan"
run "$P" 0 advance --id implementation-dispatch --to plan_review
put "$I/reviews/plan-review.md" "independent plan review"
run "$P" 0 advance --id implementation-dispatch --to awaiting_approval
run "$P" 0 approve --id implementation-dispatch
run "$P" 0 advance --id implementation-dispatch --to implementation
run "$P" 0 dispatch --id implementation-dispatch --dispatch-id core-implementation --specialist core --stage implementation --host-config .dev/context/host-complete.json --request "Implement the approved bounded behavior" --acceptance AC-IMPL-1 --inputs plan/implementation.md --tools read --write src --invariants "Preserve approved behavior" --procedure "Inspect approved plan" --next-check "Run integration checks" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --wall-time-seconds 5
check "an implementation specialist completes from an approved minimal packet" "grep -q '\"specialist\": \"core\"' '$I/runs/dispatches/core-implementation/result.json' && grep -q '\"status\": \"acknowledged\"' '$I/runs/dispatches/core-implementation/record.json'"

run "$P" 0 start --title "Wrong specialist stage" --kind feature --signals api --id wrong-specialist-stage
run "$P" 5 dispatch --id wrong-specialist-stage --dispatch-id core-too-early --specialist core --stage discovery --host-config .dev/context/host-complete.json --request "Implement too early" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "implementation specialists cannot run in discovery" "grep -q 'not eligible' '$OUT'"

run "$P" 0 start --title "Dispatch success" --kind bug --id dispatch-success
run "$P" 0 dispatch --id dispatch-success --dispatch-id probe-1 --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Inspect the bounded request" --acceptance AC-1 --inputs README.md --tools read --invariants "Do not modify source" --procedure "Inspect packet" --next-check "none" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --wall-time-seconds 5
DS="$P/.dev/work/dispatch-success/runs/dispatches/probe-1"
check "one specialist receives a validated minimal packet and returns a result" "grep -q '\"status\": \"acknowledged\"' '$DS/record.json' && grep -q '\"specialist\": \"probe\"' '$DS/result.json'"
check "dispatch records observed host, model, isolation, permissions, and dependency key" "grep -q 'fake-small-v1' '$DS/record.json' && grep -q 'deterministic fake-host capability handshake' '$DS/record.json' && grep -q 'fresh_process' '$DS/record.json' && grep -q '\"dependency_key\"' '$DS/packet.json'"
check "dispatch records validation and reconciled budget impact" "grep -q '\"validation\": \"passed\"' '$DS/record.json' && grep -q '\"budget_impact\"' '$DS/record.json'"
check "packet contains only selected inputs and filtered tools" "[ \$(node -e \"const p=require('$DS/packet.json');process.stdout.write(String(p.inputs.length===1&&p.allowed_tools.join(',')==='read'))\") = true ]"
check "measured specialist usage is reconciled" "grep -q '\"input_tokens\": 120' '$P/.dev/work/dispatch-success/state.json' && grep -q '\"provenance\": \"measured\"' '$P/.dev/work/dispatch-success/state.json'"
run "$P" 0 dispatch --id dispatch-success --dispatch-id probe-1 --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Inspect the bounded request" --acceptance AC-1 --inputs README.md --tools read --invariants "Do not modify source" --procedure "Inspect packet" --next-check "none" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --wall-time-seconds 5
check "acknowledged dispatch retry is idempotent" "grep -q '\"idempotent\": true' '$OUT'"
run "$P" 4 dispatch --id dispatch-success --dispatch-id probe-duplicate --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Inspect the bounded request" --acceptance AC-1 --inputs README.md --tools read --invariants "Do not modify source" --procedure "Inspect packet" --next-check "none" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --wall-time-seconds 5
check "complete current evidence stops a redundant specialist call" "grep -q 'current evidence already satisfies' '$OUT'"
cp "$P/README.md" "$WORK/readme.backup"
put "$P/README.md" "# Changed fixture"
run "$P" 7 dispatch --id dispatch-success --dispatch-id probe-1 --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Inspect the bounded request" --acceptance AC-1 --inputs README.md --tools read --invariants "Do not modify source" --procedure "Inspect packet" --next-check "none" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000 --wall-time-seconds 5
check "a dispatch id cannot reuse evidence after its dependencies change" "grep -q 'different or stale evidence' '$OUT'"
cp "$WORK/readme.backup" "$P/README.md"
run "$P" 0 doctor --id dispatch-success
check "workspace doctor explains durability and validates dispatch evidence" "grep -q '\"ok\": true' '$OUT' && grep -q 'host memory and unavailable telemetry are not evidence' '$OUT'"
cp "$DS/result.json" "$P/.dev/context/result.backup"
node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));d.summary+=" changed";fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' "$DS/result.json"
run "$P" 1 doctor --id dispatch-success
check "workspace doctor detects stale persisted result evidence" "grep -q 'result digest mismatch' '$OUT'"
cp "$P/.dev/context/result.backup" "$DS/result.json"

run "$P" 0 start --title "Idea only" --kind idea --id idea-only
run "$P" 5 dispatch --id idea-only --dispatch-id judge-too-early --specialist judge --stage discovery --host-config .dev/context/host-complete.json --independent --request "Judge too early" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "Judge cannot run during idea or planning work" "grep -q 'not eligible' '$OUT'"
run "$P" 5 dispatch --id idea-only --dispatch-id unenforced --specialist probe --stage discovery --host-config .dev/context/host-unenforced.json --independent --request "Unsafe host" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "host without enforceable permissions is rejected" "grep -q 'cannot enforce' '$OUT'"
run "$P" 5 dispatch --id idea-only --dispatch-id shared-review --specialist probe --stage discovery --host-config .dev/context/host-shared.json --independent --request "Shared review" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "independent work rejects shared host context" "grep -q 'requires observed host isolation' '$OUT'"
run "$P" 5 dispatch --id idea-only --dispatch-id wrong-model --specialist probe --stage discovery --host-config .dev/context/host-strong.json --independent --request "Wrong model tier" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "actual host model cannot violate the effective profile" "grep -q 'exceeds the effective' '$OUT'"
run "$P" 5 dispatch --id idea-only --dispatch-id secret-packet --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Use password=supersecret123" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "secret-like packet content is blocked before persistence" "grep -q 'blocked before packet persistence' '$OUT' && [ ! -e '$P/.dev/work/idea-only/runs/dispatches/secret-packet/packet.json' ]"
run "$P" 4 dispatch --id idea-only --dispatch-id missing-input --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Require exact context" --acceptance AC-1 --inputs missing-required.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1
check "missing exact context fails instead of being silently omitted" "grep -q 'input is not a file' '$OUT' && [ ! -e '$P/.dev/work/idea-only/runs/dispatches/missing-input/packet.json' ]"

run "$P" 0 start --title "Fabricated evidence" --kind bug --id fabricated-evidence
node -e 'const fs=require("fs");const c={schema:1,id:"fabricated-receipt",command:"node",args:[process.argv[2],"--mode","complete","--adapter-id","fabricated-receipt","--model-class","smaller","--cite-receipt","never-verified"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$P/.dev/context/host-fabricated-receipt.json" "$P/.dev/context/fake-host.mjs"
run "$P" 0 dispatch --id fabricated-evidence --dispatch-id fabricated-1 --specialist probe --stage discovery --host-config .dev/context/host-fabricated-receipt.json --independent --request "Cite unverified evidence" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
check "a specialist cannot self-certify measured evidence without a real runner-owned receipt" "grep -q 'without a matching runner-owned receipt' '$P/.dev/work/fabricated-evidence/runs/dispatches/fabricated-1/record.json'"

run "$P" 0 start --title "Missing release audit" --kind refactor --id missing-release-audit
MRA="$P/.dev/work/missing-release-audit"
run "$P" 0 advance --id missing-release-audit --to classified
run "$P" 0 advance --id missing-release-audit --to discovery
put "$MRA/discovery/synthesis.md" "isolated"
run "$P" 0 advance --id missing-release-audit --to definition
put "$MRA/design/definition.md" "bounded"
put "$MRA/plan/implementation.md" "bounded plan"
run "$P" 0 advance --id missing-release-audit --to plan_review
put "$MRA/reviews/plan-review.md" "reviewed"
run "$P" 0 advance --id missing-release-audit --to awaiting_approval
put "$MRA/intent.md" "# Intent: bounded fix"
run "$P" 0 approve --id missing-release-audit
run "$P" 0 advance --id missing-release-audit --to implementation
put "$MRA/implementation/summary.md" "bounded change"
run "$P" 0 advance --id missing-release-audit --to integration
put "$MRA/implementation/integration.md" "integrated"
run "$P" 0 advance --id missing-release-audit --to audit
put "$MRA/reviews/domain-audit.md" "audited"
run "$P" 0 advance --id missing-release-audit --to verification
put "$MRA/verification/summary.md" "tested"
run "$P" 0 verify --id missing-release-audit --receipt-id missing-release-audit-regression --command "node --test hidden/precedence.test.mjs"
put "$MRA/reviews/release-audit.md" "no independent judge dispatched"
run "$P" 5 advance --id missing-release-audit --to ready_for_pr
check "ready_for_pr is refused without an independent Judge verification dispatch on the candidate" "grep -q 'independent Judge verification dispatch' '$OUT'"

run "$P" 0 start --title "Unavailable telemetry" --kind bug --id unavailable-telemetry
run "$P" 0 dispatch --id unavailable-telemetry --dispatch-id unavailable-1 --specialist probe --stage discovery --host-config .dev/context/host-unavailable.json --independent --request "Preserve unknown telemetry" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 77 --output-tokens 33 --context-tokens 500
check "unavailable model telemetry stays explicit while reserved estimates are charged" "grep -q '\"provenance\": \"unavailable\"' '$P/.dev/work/unavailable-telemetry/runs/dispatches/unavailable-1/result.json' && grep -q '\"input_tokens\": 77' '$P/.dev/work/unavailable-telemetry/state.json'"

run "$P" 0 start --title "Malformed result" --kind bug --id malformed-result
run "$P" 0 dispatch --id malformed-result --dispatch-id malformed-1 --specialist probe --stage discovery --host-config .dev/context/host-malformed.json --independent --request "Return malformed" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
check "malformed specialist output is recorded as failure and halts" "grep -q '\"status\": \"failed\"' '$P/.dev/work/malformed-result/runs/dispatches/malformed-1/record.json' && grep -q '\"status\": \"halted\"' '$P/.dev/work/malformed-result/state.json'"
run "$P" 0 resume --id malformed-result
run "$P" 0 dispatch --id malformed-result --dispatch-id malformed-2 --retry-of malformed-1 --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Return malformed" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
MR="$P/.dev/work/malformed-result/runs/dispatches/malformed-2/record.json"
check "one repairable contract retry is recorded and succeeds" "grep -q '\"attempt\": 2' '$MR' && grep -q '\"retry_of\": \"malformed-1\"' '$MR' && grep -q '\"validation\": \"passed\"' '$MR'"
run "$P" 6 dispatch --id malformed-result --dispatch-id malformed-3 --retry-of malformed-1 --specialist probe --stage discovery --host-config .dev/context/host-complete.json --independent --request "Return malformed" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
check "a second local retry is stopped" "grep -q 'local retry limit is exhausted' '$OUT'"

run "$P" 0 start --title "Secret result" --kind bug --id secret-result
run "$P" 0 dispatch --id secret-result --dispatch-id secret-1 --specialist probe --stage discovery --host-config .dev/context/host-secret.json --independent --request "Return secret" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
SR="$P/.dev/work/secret-result/runs/dispatches/secret-1"
check "secret-like result is blocked without persisting the value" "[ ! -e '$SR/result.json' ] && grep -q 'secret-like content blocked' '$SR/record.json' && ! grep -q 'abcdefghijklmnopqrstuvwxyz' '$SR/record.json'"

run "$P" 0 start --title "Specialist escalation" --kind bug --id specialist-escalation
run "$P" 0 dispatch --id specialist-escalation --dispatch-id probe-needs --specialist probe --stage discovery --host-config .dev/context/host-needs.json --independent --request "Inspect schema risk" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 500
check "validated needs_specialist returns control to Forge" "grep -q '\"status\": \"awaiting_specialist\"' '$P/.dev/work/specialist-escalation/state.json' && grep -q '\"specialty\": \"shift\"' '$OUT'"

run "$P" 0 start --title "Cycle result" --kind bug --id cycle-result
run "$P" 0 dispatch --id cycle-result --dispatch-id self-cycle --specialist probe --stage discovery --host-config .dev/context/host-self.json --independent --request "Return a cycle" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
check "a specialist cannot route back to itself" "grep -q 'routing cycle' '$P/.dev/work/cycle-result/runs/dispatches/self-cycle/record.json' && grep -q '\"status\": \"halted\"' '$P/.dev/work/cycle-result/state.json'"

run "$P" 0 start --title "Multi-hop cycle" --kind feature --signals research --id multi-hop-cycle
run "$P" 0 dispatch --id multi-hop-cycle --dispatch-id cycle-parent --specialist probe --stage discovery --host-config .dev/context/host-needs-scout.json --independent --request "Request bounded research" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
run "$P" 0 resume --id multi-hop-cycle
run "$P" 0 dispatch --id multi-hop-cycle --dispatch-id cycle-child --parent-dispatch cycle-parent --specialist scout --stage discovery --host-config .dev/context/host-needs-probe.json --request "Perform bounded research" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
check "multi-hop specialist ancestry blocks a return cycle" "grep -q 'routing cycle' '$P/.dev/work/multi-hop-cycle/runs/dispatches/cycle-child/record.json' && grep -q '\"status\": \"halted\"' '$P/.dev/work/multi-hop-cycle/state.json'"

run "$P" 0 start --title "Host failure" --kind bug --id host-failure
run "$P" 0 dispatch --id host-failure --dispatch-id host-failure-1 --specialist probe --stage discovery --host-config .dev/context/host-fail.json --independent --request "Fail safely" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
HF="$P/.dev/work/host-failure/runs/dispatches/host-failure-1"
check "host failures are redacted before persistence" "grep -q 'REDACTED:credential_assignment' '$HF/record.json' && ! grep -q 'synthetic-secret-value' '$HF/record.json'"

run "$P" 0 start --title "Huge result" --kind bug --id huge-result
run "$P" 0 dispatch --id huge-result --dispatch-id huge-1 --specialist probe --stage discovery --host-config .dev/context/host-huge.json --independent --request "Return bounded evidence" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
HR="$P/.dev/work/huge-result/runs/dispatches/huge-1"
check "oversized evidence is rejected without result persistence" "grep -q 'evidence limit' '$HR/record.json' && [ ! -e '$HR/result.json' ]"

run "$P" 0 start --title "Artifact scope" --kind bug --id artifact-scope
run "$P" 0 dispatch --id artifact-scope --dispatch-id artifact-1 --specialist probe --stage discovery --host-config .dev/context/host-bad-artifact.json --independent --request "Respect artifact scope" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
AR="$P/.dev/work/artifact-scope/runs/dispatches/artifact-1"
check "reported artifacts outside packet scope are blocked" "grep -q 'outside its packet write scope' '$AR/record.json' && [ ! -e '$AR/result.json' ]"

run "$P" 0 start --title "Host timeout" --kind bug --id host-timeout
run "$P" 0 dispatch --id host-timeout --dispatch-id timeout-1 --specialist probe --stage discovery --host-config .dev/context/host-slow.json --independent --request "Respect cancellation" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 20 --output-tokens 20 --context-tokens 500
TO="$P/.dev/work/host-timeout/runs/dispatches/timeout-1"
check "host timeout cancels the child and records a bounded failure" "grep -q 'cancellation timeout' '$TO/record.json' && grep -q '\"status\": \"halted\"' '$P/.dev/work/host-timeout/state.json'"

run "$P" 0 start --title "Dispatch recovery" --kind bug --id dispatch-recovery
run "$P" 0 dispatch --id dispatch-recovery --dispatch-id recover-1 --specialist probe --stage discovery --host-config .dev/context/host-counted.json --independent --request "Recover persisted evidence" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 500 --wall-time-seconds 5
DR="$P/.dev/work/dispatch-recovery"
node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const p=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));for(const k of Object.keys(p.budget)){s.budget.reserved[k]=p.budget[k];s.budget.consumed[k]=0}s.usage={schema:1,calls:0,input_tokens:{value:null,provenance:"unavailable"},output_tokens:{value:null,provenance:"unavailable"},reasoning_tokens:{value:null,provenance:"unavailable"},cached_tokens:{value:null,provenance:"unavailable"},charge_usd:{value:null,provenance:"unavailable"},wall_time_ms:0};s.operation={id:"recover-1",kind:"specialist:probe",attempt:1,status:"reserved"};fs.writeFileSync(process.argv[1],JSON.stringify(s,null,2)+"\n")' "$DR/state.json" "$DR/runs/dispatches/recover-1/packet.json"
run "$P" 0 dispatch --id dispatch-recovery --dispatch-id recover-1 --specialist probe --stage discovery --host-config .dev/context/host-counted.json --independent --request "Recover persisted evidence" --acceptance AC-1 --inputs README.md --tools read --invariants bounded --procedure inspect --next-check none --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 500 --wall-time-seconds 5
check "a persisted result reconciles a reserved retry without repeating the host" "grep -q '\"recovered\": true' '$OUT' && grep -q '\"status\": \"acknowledged\"' '$DR/state.json' && [ \$(wc -l < '$DR/runs/dispatches/recover-1/host-calls.log') -eq 1 ]"

run "$P" 0 start --title "Budget stop" --kind bug --id budget-stop
run "$P" 6 reserve --id budget-stop --operation-id too-large --operation-kind specialist --tool read --calls 99
check "over-budget reservation halts before dispatch" "grep -q 'budget reservation exceeds' '$OUT' && grep -q '\"status\": \"halted\"' '$P/.dev/work/budget-stop/state.json'"

run "$P" 0 start --title "Cancel me" --kind bug --id cancel-me
run "$P" 0 cancel --id cancel-me --reason user_changed_direction
run "$P" 4 resume --id cancel-me
check "cancelled runs are terminal" "grep -q 'not resumable' '$OUT'"
run "$P" 0 start --title "Replacement" --kind bug --id replacement --supersedes cancel-me
check "a new run may reference but cannot revive a cancelled run" "grep -q '\"supersedes_run_id\": \"cancel-me\"' '$P/.dev/work/replacement/manifest.json' && grep -q '\"status\": \"cancelled\"' '$P/.dev/work/cancel-me/state.json'"

mkdir -p "$P/.dev/work/.locks"; put "$P/.dev/work/.locks/cache-defect.lock" "active"
run "$P" 7 route --id cache-defect --signals api
check "a concurrent writer is rejected" "grep -q 'conflicting_active_writer' '$OUT'"
rm "$P/.dev/work/.locks/cache-defect.lock"

for policy in authority.yml routing.yml quality-gates.yml release.yml; do
  cp "$P/.dev/policy/$policy" "$WORK/$policy"
  printf '\n# changed\n' >> "$P/.dev/policy/$policy"
  run "$P" 1 check --id cache-defect
  check "$policy mutation makes the run stale" "grep -q 'stale_effective_policy' '$OUT'"
  cp "$WORK/$policy" "$P/.dev/policy/$policy"
done
cp "$P/.dev/knowledge/00-index.md" "$WORK/knowledge-index.md"; printf '\nchanged\n' >> "$P/.dev/knowledge/00-index.md"
run "$P" 1 check --id cache-defect
check "selected knowledge mutation makes the run stale" "grep -q 'stale_effective_policy' '$OUT'"
cp "$WORK/knowledge-index.md" "$P/.dev/knowledge/00-index.md"

put "$P/src/new-candidate.txt" "candidate changed"
run "$P" 1 check --id secure-billing
check "candidate changes invalidate recorded evidence identity" "grep -q 'recorded candidate is stale' '$OUT'"
rm "$P/src/new-candidate.txt"

CRITICAL="$WORK/critical"; make_project "$CRITICAL" critical
run "$CRITICAL" 0 start --title "Cache defect" --kind bug --id critical-cache
CF="$CRITICAL/.dev/work/critical-cache"
check "critical policy expands coverage and budget for the same request" "grep -q '\"core\"' '$OUT' && grep -q '\"compat\"' '$OUT' && grep -q '\"failure\"' '$OUT' && grep -q '\"budget_tier\": \"medium\"' '$CF/manifest.json'"
check "critical policy changes authority and quality commands" "grep -q '\"tests\"' '$CF/context/effective-policy.json' && grep -q 'npm test' '$CF/manifest.json'"
run "$CRITICAL" 3 start --title "Weak override" --kind bug --id weak-override --budget-tier large
check "run overrides cannot expand a hard project budget" "grep -q 'cannot exceed project tier' '$OUT'"

run "$P" 2 start --title Escape --kind bug --id ../../escape
check "unsafe ids cannot escape .dev/work" "[ ! -e '$P/escape' ]"
run "$P" 0 list
check "lists resumable workspaces" "grep -q 'secure-billing' '$OUT' && grep -q 'cache-defect' '$OUT'"
check "manifest records a concrete base revision" "grep -Eq '\"base_commit\": \"[a-f0-9]{40}' '$F/manifest.json'"

CODEX_P="$WORK/codex-adapter"; make_project "$CODEX_P" prototype
mkdir -p "$CODEX_P/src" "$CODEX_P/.dev/context"
cp "$KIT/scripts/fixtures/forge/config-precedence/src/config.mjs" "$CODEX_P/src/config.mjs"
cp "$KIT/scripts/fixtures/forge/fake-codex.mjs" "$CODEX_P/.dev/context/fake-codex.mjs"
node -e 'const fs=require("fs");const c={schema:1,id:"codex-fake-small",command:"node",args:[process.argv[2],"--adapter-id","codex-fake-small","--model","fake-small-v1","--model-class","smaller","--reasoning-effort","low","--codex-command","node","--codex-driver",process.argv[3]],deterministic:true,cacheable:false,timeout_ms:10000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$CODEX_P/.dev/context/host.json" "$KIT/skills/ae-forge/scripts/codex-host.mjs" "$CODEX_P/.dev/context/fake-codex.mjs"
( cd "$CODEX_P" && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm adapter-fixture )
run "$CODEX_P" 0 start --title "Codex adapter" --kind bug --id codex-adapter
run "$CODEX_P" 0 dispatch --id codex-adapter --dispatch-id probe-codex --specialist probe --stage discovery --host-config .dev/context/host.json --independent --request "Diagnose the routed precedence defect" --acceptance AC-PRECEDENCE --inputs src/config.mjs --tools read --invariants "Do not modify source" --procedure "Inspect the routed source" --next-check "Report the causal merge order" --calls 1 --input-tokens 500 --output-tokens 300 --context-tokens 2000 --wall-time-seconds 10
CD="$CODEX_P/.dev/work/codex-adapter/runs/dispatches/probe-codex"
check "Codex adapter runs through the observed fresh read-only boundary" "grep -q 'codex-cli fake-1.0.0' '$CD/record.json' && grep -q '\"validation\": \"passed\"' '$CD/record.json'"
check "Codex adapter replaces model usage with host telemetry" "grep -q '\"value\": 321' '$CD/result.json' && grep -q '\"value\": 13' '$CD/result.json' && grep -q '\"provenance\": \"unavailable\"' '$CD/result.json'"
check "dispatch binds the shared contract and cleans isolated context" "grep -q '\"contract_sha256\"' '$CD/packet.json' && ! find '$CD' -maxdepth 1 -type d -name 'host-workspace-*' | grep -q ."
run "$CODEX_P" 0 start --title "Codex write refusal" --kind bug --id codex-write-refusal
run "$CODEX_P" 0 dispatch --id codex-write-refusal --dispatch-id probe-write --specialist probe --stage discovery --host-config .dev/context/host.json --independent --request "Attempt a write" --acceptance AC-WRITE --inputs src/config.mjs --tools read --write src --invariants "Stay bounded" --procedure "Inspect source" --next-check "Refuse unsupported authority" --calls 1 --input-tokens 500 --output-tokens 300 --context-tokens 2000 --wall-time-seconds 10
CWR="$CODEX_P/.dev/work/codex-write-refusal/runs/dispatches/probe-write"
check "read-only Codex adapter fails closed on write authority" "grep -q 'refuses packets with allowed writes' '$CWR/record.json' && grep -q '\"status\": \"halted\"' '$CODEX_P/.dev/work/codex-write-refusal/state.json'"

ALPHA="$WORK/alpha"; make_project "$ALPHA" prototype
mkdir -p "$ALPHA/src" "$ALPHA/hidden" "$ALPHA/.dev/context"
cp "$KIT/scripts/fixtures/forge/config-precedence/src/"*.mjs "$ALPHA/src/"
cp "$KIT/scripts/fixtures/forge/config-precedence/hidden/precedence.test.mjs" "$ALPHA/hidden/precedence.test.mjs"
cp "$KIT/scripts/fixtures/forge/fake-host.mjs" "$ALPHA/.dev/context/fake-host.mjs"
( cd "$ALPHA" && git add -A && git -c user.email=test@example.com -c user.name=Test commit -qm alpha-seed )

run "$ALPHA" 0 start --title "Explicit option ignored" --kind bug --id alpha-precedence
AL="$ALPHA/.dev/work/alpha-precedence"
run "$ALPHA" 0 advance --id alpha-precedence --to classified
run "$ALPHA" 0 advance --id alpha-precedence --to discovery
put "$AL/discovery/synthesis.md" "An explicit request option is silently overridden by a stored default for both the direct and wrapper callers of the shared resolver."
run "$ALPHA" 5 advance --id alpha-precedence --to definition
check "Alpha mode 1: corrective definition waits for a tested causal account" "grep -q 'tested diagnosis is required' '$OUT'"

node -e 'const fs=require("fs");const c={schema:1,id:"alpha-probe-diagnosis",command:"node",args:[process.argv[2],"--mode","diagnosis","--adapter-id","alpha-probe-diagnosis","--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$ALPHA/.dev/context/host-alpha-diagnosis.json" "$ALPHA/.dev/context/fake-host.mjs"
run "$ALPHA" 0 dispatch --id alpha-precedence --dispatch-id probe-alpha-diagnosis --specialist probe --stage diagnosis --host-config .dev/context/host-alpha-diagnosis.json --independent --request "Establish the cause of the ignored request option" --acceptance AC-PRECEDENCE --inputs src/config.mjs --tools read --invariants "Do not modify source" --procedure "Trace the merge order through both callers" --next-check "Record the established cause" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Alpha mode 1: Probe independently establishes the shared-resolver cause" "grep -q '\"established_cause\"' '$AL/runs/dispatches/probe-alpha-diagnosis/result.json' && grep -q '\"disposition\": \"disproved\"' '$AL/runs/dispatches/probe-alpha-diagnosis/result.json'"
run "$ALPHA" 0 advance --id alpha-precedence --to definition
put "$AL/design/definition.md" "Fix the shared resolveConfig merge order so explicit request options win over stored defaults, without touching either caller."
put "$AL/plan/implementation.md" "Swap the spread order in src/config.mjs: stored defaults first, then request options."
run "$ALPHA" 0 advance --id alpha-precedence --to plan_review
put "$AL/reviews/plan-review.md" "Independent review confirms the one-line precedence swap is sufficient and requires no caller changes."
run "$ALPHA" 0 advance --id alpha-precedence --to awaiting_approval
put "$AL/intent.md" "# Intent: preserve explicit request options over stored configuration defaults"
run "$ALPHA" 0 approve --id alpha-precedence

put "$AL/plan/implementation.md" "mutated after approval"
run "$ALPHA" 5 advance --id alpha-precedence --to implementation
check "Alpha mode 2: mutating the approved plan after approval invalidates execution" "grep -q 'changed after approval' '$OUT'"
put "$AL/plan/implementation.md" "Swap the spread order in src/config.mjs: stored defaults first, then request options."
run "$ALPHA" 0 advance --id alpha-precedence --to implementation

node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("{ ...requestOptions, ...storedDefaults }","{ ...storedDefaults, ...requestOptions }"))' "$ALPHA/src/config.mjs"
put "$AL/implementation/summary.md" "Repaired the shared resolver's merge order; both the direct and wrapper callers inherit the fix unchanged."
run "$ALPHA" 0 advance --id alpha-precedence --to integration
put "$AL/implementation/integration.md" "Confirmed both callers now return the explicit request value."
run "$ALPHA" 0 advance --id alpha-precedence --to audit
put "$AL/reviews/domain-audit.md" "Independent audit confirms the fix is confined to src/config.mjs and no caller was edited."
run "$ALPHA" 0 advance --id alpha-precedence --to verification
put "$AL/verification/summary.md" "Independent regression re-test is pending execution."

run "$ALPHA" 0 pause --id alpha-precedence --to blocked --reason awaiting_ci_runner --resume-action "resume once the regression command can run"
run "$ALPHA" 0 resume --id alpha-precedence
check "Alpha mode 3: interruption resumes verification without repeating recorded evidence" "grep -q '\"status\": \"verification\"' '$OUT' && grep -q '\"repeated_external_side_effect\": false' '$OUT'"

node -e 'const fs=require("fs");const c={schema:1,id:"alpha-judge",command:"node",args:[process.argv[2],"--mode","complete","--adapter-id","alpha-judge","--model-class","smaller","--cite-receipt","alpha-precedence-regression"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$ALPHA/.dev/context/host-alpha-judge.json" "$ALPHA/.dev/context/fake-host.mjs"
run "$ALPHA" 0 verify --id alpha-precedence --receipt-id alpha-precedence-regression --command "node --test hidden/precedence.test.mjs"
check "the runner-executed regression genuinely passes on the repaired candidate" "grep -q '\"exit_code\": 0' '$OUT' && grep -q '\"issuer\": \"forge\"' '$OUT'"

run "$ALPHA" 0 dispatch --id alpha-precedence --dispatch-id judge-alpha --specialist judge --stage verification --host-config .dev/context/host-alpha-judge.json --independent --request "Issue the release verdict for the precedence fix" --acceptance AC-PRECEDENCE --inputs src/config.mjs --tools read --invariants "Cite only measured evidence" --procedure "Confirm the runner-executed regression and the established diagnosis" --next-check "Record the release verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
check "Judge's verdict cites the real regression receipt, not a self-report" "grep -q 'receipt:alpha-precedence-regression' '$AL/runs/dispatches/judge-alpha/result.json' && grep -q '\"status\": \"acknowledged\"' '$AL/runs/dispatches/judge-alpha/record.json'"
put "$AL/reviews/release-audit.md" "Judge verdict: explicit request options are now honored for both callers; no residual risk recorded."
run "$ALPHA" 0 advance --id alpha-precedence --to ready_for_pr
check "Alpha reaches ready_for_pr only with independent diagnosis, a real regression, and an independent verdict" "grep -q '\"status\": \"ready_for_pr\"' '$OUT'"
put "$AL/final-report.md" "Delivered: the shared resolver now preserves explicit request options. Evidence: probe diagnosis, runner-executed regression, judge verdict. Residual risk: none recorded."
run "$ALPHA" 0 advance --id alpha-precedence --to complete
check "Alpha mode 1 completes end to end with independent, runner-owned evidence" "grep -q '\"status\": \"complete\"' '$OUT'"

node -e 'const fs=require("fs");const c={schema:1,id:"alpha-core-uncovered",command:"node",args:[process.argv[2],"--mode","complete","--adapter-id","alpha-core-uncovered","--model-class","smaller"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$ALPHA/.dev/context/host-alpha-core-uncovered.json" "$ALPHA/.dev/context/fake-host.mjs"
node -e 'const fs=require("fs");const c={schema:1,id:"alpha-judge-narrow",command:"node",args:[process.argv[2],"--mode","complete","--adapter-id","alpha-judge-narrow","--model-class","smaller","--cite-receipt","alpha-uncovered-regression"],deterministic:true,cacheable:true,timeout_ms:5000};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+"\n")' "$ALPHA/.dev/context/host-alpha-judge-narrow.json" "$ALPHA/.dev/context/fake-host.mjs"
run "$ALPHA" 0 start --title "Uncovered acceptance" --kind refactor --signals api --id alpha-uncovered
AU="$ALPHA/.dev/work/alpha-uncovered"
run "$ALPHA" 0 advance --id alpha-uncovered --to classified
run "$ALPHA" 0 advance --id alpha-uncovered --to discovery
put "$AU/discovery/synthesis.md" "bounded"
run "$ALPHA" 0 advance --id alpha-uncovered --to definition
put "$AU/design/definition.md" "bounded"
put "$AU/plan/implementation.md" "bounded plan"
run "$ALPHA" 0 advance --id alpha-uncovered --to plan_review
put "$AU/reviews/plan-review.md" "reviewed"
run "$ALPHA" 0 advance --id alpha-uncovered --to awaiting_approval
put "$AU/intent.md" "# Intent: bounded refactor"
run "$ALPHA" 0 approve --id alpha-uncovered
run "$ALPHA" 0 advance --id alpha-uncovered --to implementation
run "$ALPHA" 0 dispatch --id alpha-uncovered --dispatch-id core-uncovered --specialist core --stage implementation --host-config .dev/context/host-alpha-core-uncovered.json --request "Implement the bounded change" --acceptance AC-UNCOVERED-1,AC-UNCOVERED-2 --inputs plan/implementation.md --tools read --write src --invariants "Preserve behavior" --procedure "Inspect the approved plan" --next-check "Run integration checks" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
put "$AU/implementation/summary.md" "bounded change"
run "$ALPHA" 0 advance --id alpha-uncovered --to integration
put "$AU/implementation/integration.md" "integrated"
run "$ALPHA" 0 advance --id alpha-uncovered --to audit
put "$AU/reviews/domain-audit.md" "audited"
run "$ALPHA" 0 advance --id alpha-uncovered --to verification
put "$AU/verification/summary.md" "tested"
run "$ALPHA" 0 verify --id alpha-uncovered --receipt-id alpha-uncovered-regression --command "node --test hidden/precedence.test.mjs"
run "$ALPHA" 0 dispatch --id alpha-uncovered --dispatch-id judge-uncovered --specialist judge --stage verification --host-config .dev/context/host-alpha-judge-narrow.json --independent --request "Issue the release verdict" --acceptance AC-UNCOVERED-1 --inputs README.md --tools read --invariants "Cite only measured evidence" --procedure "Confirm the runner-executed regression" --next-check "Record the verdict" --calls 1 --input-tokens 200 --output-tokens 100 --context-tokens 1000
put "$AU/reviews/release-audit.md" "judge release audit"
run "$ALPHA" 5 advance --id alpha-uncovered --to ready_for_pr
check "ready_for_pr is refused when Judge's cited acceptance ids do not cover every implemented acceptance id" "grep -q 'cover every implemented acceptance id' '$OUT' && grep -q 'AC-UNCOVERED-2' '$OUT'"

printf '\n'
if [ "$FAIL" -gt 0 ]; then printf '\033[31m%d failed\033[0m, %d passed\n\n' "$FAIL" "$PASS"; exit 1; fi
printf '\033[32mall %d assertions passed\033[0m\n\n' "$PASS"
