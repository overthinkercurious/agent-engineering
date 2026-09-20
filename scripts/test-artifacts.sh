#!/usr/bin/env bash
# test-analyze.sh - acceptance tests for the init analyzer.
#
# Builds a synthetic project covering every extraction path, then asserts the
# analysis. Most assertions here exist because the behaviour they check was
# wrong at some point: routes came out of README code fences, Python fan-in
# resolved to zero, and documentation examples flooded the must-read set.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
ANALYZE="$KIT/skills/ae-surveyor/scripts/analyze.mjs"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-an.XXXXXX")"
# Git Bash on Windows: node is a native Windows binary, so MSYS translates a
# path passed as a whole argument but NOT one embedded inside a `node -e`
# string. An untranslated /tmp/... then resolves to a bogus C:/tmp path, so
# every require() in this file silently returns nothing - which reads as 27 failing
# assertions rather than as a broken harness. Normalise once, here.
command -v cygpath >/dev/null 2>&1 && WORK="$(cygpath -m "$WORK")"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
ok(){ printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
no(){ printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2" >/dev/null 2>&1; then ok "$1"; else no "$1"; fi; }
head_(){ printf '\n\033[2m%s\033[0m\n' "$1"; }

# --------------------------------------------------------------- fixture ----
P="$WORK/fix"
mkdir -p "$P"/{src,docs,api,tests,migrations,.github/workflows}
cd "$P"

cat > package.json <<'EOF'
{ "name": "fixture", "engines": { "node": ">=20" },
  "scripts": { "test": "jest", "build": "tsc -p .", "lint": "eslint ." },
  "dependencies": { "express": "^4.19.0" },
  "devDependencies": { "jest": "^29.0.0" } }
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "strict": true, "noImplicitAny": true } }
EOF
# A README whose code fence looks exactly like a route declaration.
cat > README.md <<'EOF'
# Fixture
```js
app.get('/from-the-readme', handler)
```
EOF
cat > src/index.js <<'EOF'
import { router } from './routes.js'
import { verify } from './auth.js'
import express from 'express'
export default express()
EOF
cat > src/routes.js <<'EOF'
import { db } from './db.js'
export const router = {}
app.get('/users', h)
app.post('/users/:id', h)
EOF
cat > src/auth.js <<'EOF'
export function verify(token) { return !!token }
EOF
cat > src/db.js <<'EOF'
export const db = {}
EOF
# A documentation example that also looks like a route.
cat > docs/example.js <<'EOF'
app.get('/from-the-docs', handler)
EOF
cat > api/__init__.py <<'EOF'
EOF
cat > api/models.py <<'EOF'
class User: pass
EOF
cat > api/main.py <<'EOF'
from api.models import User
from .helpers import fmt
import os
@app.get("/py-users")
def list_users(): return os.environ["DATABASE_URL"]
EOF
cat > api/helpers.py <<'EOF'
def fmt(x): return x
EOF
cat > tests/index.test.js <<'EOF'
import app from '../src/index.js'
app.get('/only-in-a-test', h)
EOF
cat > migrations/001_init.sql <<'EOF'
CREATE TABLE users (id int);
EOF
cat > .github/workflows/ci.yml <<'EOF'
jobs:
  build:
    steps:
      - run: npm ci
      - run: npm test
EOF
cat > Dockerfile <<'EOF'
FROM node:20
EOF
cat > .gitignore <<'EOF'
.dev/context/
.dev/work/
EOF
git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm init

J="$P/.dev/context/analysis.json"
node "$ANALYZE" --root "$P" --out "$J" >/dev/null 2>&1
q(){ node -e "const d=require('$J'); const v=($1); process.stdout.write(String(v))" 2>/dev/null; }
# Equality checks go through this rather than `check`, which evals its argument
# and mangles nested single quotes.
eq(){ # label  node-expr  expected  [json-file]
  local got
  got="$(node -e "const d=require('${4:-$J}'); const v=($2); process.stdout.write(String(v))" 2>/dev/null)"
  if [ "$got" = "$3" ]; then ok "$1"; else no "$1 (got '$got', want '$3')"; fi
}

# --------------------------------------------------------------------------
head_ "inventory and stack"
check "parses every file"            "[ \$(q 'd.inventory.total_files') -ge 14 ]"
eq    "detects npm"                  "d.stack.package_managers[0]" "npm"
check "reads package.json deps"      "[ -n \"\$(q 'd.stack.manifests[0].deps.express')\" ]"
check "captures node engine"         "[ -n \"\$(q 'd.stack.runtimes.node')\" ]"
check "counts javascript and python" "[ -n \"\$(q 'd.inventory.by_language.javascript.files')\" ] && [ -n \"\$(q 'd.inventory.by_language.python.files')\" ]"

head_ "commands"
eq    "npm scripts"                  "d.commands.scripts.test" "jest"
check "CI run steps"                 "q 'JSON.stringify(d.commands.ci[0].run_steps)' | grep -q 'npm test'"

head_ "deployment and enforcement"
check "finds the Dockerfile"         "[ \$(q 'd.deployment.containers.length') -ge 1 ]"
check "finds env var references"     "q 'JSON.stringify(d.deployment.env_vars)' | grep -q DATABASE_URL"
eq    "detects tsconfig strictness"  "d.enforcement.typescript_options.strict" "true"

head_ "routes: code only, never docs or tests"
R="$WORK/routes.txt"; q 'JSON.stringify(d.routes)' > "$R"
check "finds the real JS route"      "grep -q '/users' '$R'"
check "finds the Python route"       "grep -q '/py-users' '$R'"
check "IGNORES the README fence"     "! grep -q 'from-the-readme' '$R'"
check "IGNORES the docs example"     "! grep -q 'from-the-docs' '$R'"
check "IGNORES routes in tests"      "! grep -q 'only-in-a-test' '$R'"

head_ "imports resolve to fan-in"
fan(){ node -e "const d=require('$J');const r=d.ranking.find(x=>x.path==='$1');process.stdout.write(String(r?r.fan_in:-1))"; }
check "relative JS import counted"   "[ \$(fan src/routes.js) -ge 1 ]"
check "transitive JS import counted" "[ \$(fan src/db.js) -ge 1 ]"
check "python absolute import counted" "[ \$(fan api/models.py) -ge 1 ]"
check "python relative import counted" "[ \$(fan api/helpers.py) -ge 1 ]"
check "external deps separated"      "q 'JSON.stringify(Object.keys(d.stack.external_imports))' | grep -q express"

head_ "risk, schema and selection"
check "flags the auth file"          "q 'JSON.stringify(d.risk_files)' | grep -q 'src/auth.js'"
check "finds the migration"          "q 'JSON.stringify(d.schema_files)' | grep -q '001_init.sql'"
check "docs tree excluded from code" "! q 'JSON.stringify(d.ranking.map(r=>r.path))' | grep -q 'docs/example.js'"
check "tests excluded from code"     "! q 'JSON.stringify(d.ranking.map(r=>r.path))' | grep -q 'index.test.js'"
check "auth file is must-read"       "q 'JSON.stringify(d.ranking.filter(r=>r.must_read).map(r=>r.path))' | grep -q 'src/auth.js'"

head_ "coverage report"
check "claims 100% parsed"           "[ \$(q 'd.coverage.files_parsed_pct') -eq 100 ]"
check "reports risk coverage"        "[ \$(q 'd.coverage.risk_files_covered_pct') -eq 100 ]"
check "states its caveats"           "[ \$(q 'd.coverage.caveats.length') -ge 3 ]"
check "pins the commit"              "[ -n \"\$(q 'd.git.head')\" ]"

head_ "modes"
rm -f "$P/.dev/context/none.json"
node "$ANALYZE" --root "$P" --out "$P/.dev/context/none.json" --estimate >/dev/null 2>&1
check "--estimate writes nothing"    "[ ! -f '$P/.dev/context/none.json' ]"
node "$ANALYZE" --root "$P" --out "$P/.dev/context/full.json" --depth full >/dev/null 2>&1
check "--depth full reads all code"  "[ \$(node -e \"const d=require('$P/.dev/context/full.json');process.stdout.write(String(d.selection.files.length===d.coverage.code_files))\") = 'true' ]"
node "$ANALYZE" --root "$P" --out "$P/.dev/context/tiny.json" --budget-tokens 1 >/dev/null 2>&1
check "tiny budget reports deferrals" "[ \$(node -e \"const d=require('$P/.dev/context/tiny.json');process.stdout.write(String(d.selection.deferred_high_signal.length))\") -ge 1 ]"
node "$ANALYZE" --root "$P" --out "$WORK/escape-analysis.json" >/dev/null 2>&1
check "analysis output cannot escape project root" "[ $? -eq 2 ] && [ ! -e '$WORK/escape-analysis.json' ]"

head_ "runs outside a git repo"
NG="$WORK/nogit"; mkdir -p "$NG/src"; cp "$P/package.json" "$NG/"; cp "$P/src/index.js" "$NG/src/"
node "$ANALYZE" --root "$NG" --out "$NG/.dev/context/analysis.json" >/dev/null 2>&1
check "still produces analysis"      "[ -f '$NG/.dev/context/analysis.json' ]"
eq    "reports not-a-repo"           "d.git.is_repo" "false" "$NG/.dev/context/analysis.json"
# Without this the manual directory walk can return zero files and every
# assertion above still passes, which is how an ESM require() bug once shipped.
check "walk still finds files"       "[ \$(node -e \"const d=require('$NG/.dev/context/analysis.json');process.stdout.write(String(d.inventory.total_files))\") -ge 2 ]"
check "walk still parses code"       "[ \$(node -e \"const d=require('$NG/.dev/context/analysis.json');process.stdout.write(String(d.coverage.code_files))\") -ge 1 ]"

# ---------------------------------------------------------------------------
KNOW="$KIT/skills/ae-surveyor/scripts/knowledge.mjs"
RULES="$KIT/skills/ae-surveyor/scripts/rules.mjs"

head_ "stage 3: knowledge base"
KB="$P/.dev/knowledge"
node "$KNOW" --root "$P" --in "$J" --out "$KB" --quiet >/dev/null 2>&1; rc=$?
check "exits 0"                      "[ $rc -eq 0 ]"
# The contract is five named documents plus the index - "never a sixth, and
# never a parallel documentation tree" (references/stages/knowledge.md).
for f in 00-index stack architecture schema commands decisions; do
  check "$f.md written"              "[ -s '$KB/$f.md' ]"
done
check "no sixth document"            "[ \"\$(ls '$KB' | wc -l)\" -eq 6 ]"
check "facts: npm script table"      "grep -q 'jest' '$KB/commands.md'"
check "facts: route from code"       "grep -q '/users' '$KB/architecture.md'"
check "facts: NOT the README route"  "! grep -q 'from-the-readme' '$KB/architecture.md'"
check "facts: auth surfaced as risk" "grep -q 'src/auth.js' '$KB/architecture.md'"
check "leaves judgment slots"        "grep -q 'TODO (judgment)' '$KB/architecture.md'"
check "title sits outside the block" "[ \"\$(head -1 '$KB/stack.md')\" = '# Stack' ]"
check "index links every doc"        "grep -q 'decisions.md' '$KB/00-index.md'"
check "index names each consumer"    "grep -q 'architect, builder' '$KB/00-index.md'"
check "index states the tag contract" "grep -q 'ASSUMED' '$KB/00-index.md'"
check "records its caveats"          "grep -q 'lower bound' '$KB/00-index.md'"

node -e 'const fs=require("fs");const p=process.argv[1];const s=fs.readFileSync(p,"utf8").replace(/(<!-- agent-engineering:judgment:[a-z0-9-]+:start -->)[\s\S]*?(<!-- agent-engineering:judgment:[a-z0-9-]+:end -->)/,"$1\nProject control flow is documented from reviewed source.\n$2");fs.writeFileSync(p,s)' "$KB/architecture.md"
node "$KNOW" --root "$P" --in "$J" --out "$KB" --quiet >/dev/null 2>&1
check "completed knowledge judgment survives regeneration" "grep -q 'Project control flow is documented' '$KB/architecture.md'"

head_ "stage 3: re-running preserves human edits"
printf '
HAND-WRITTEN NOTE
' >> "$KB/stack.md"
node "$KNOW" --root "$P" --in "$J" --out "$KB" --quiet >/dev/null 2>&1
check "note survives regeneration"   "grep -q 'HAND-WRITTEN NOTE' '$KB/stack.md'"
check "facts still present"          "grep -q 'javascript' '$KB/stack.md'"
B1="$(md5sum < "$KB/commands.md")"
node "$KNOW" --root "$P" --in "$J" --out "$KB" --quiet >/dev/null 2>&1
check "idempotent"                   "[ \"$B1\" = \"\$(md5sum < '$KB/commands.md')\" ]"
node "$KNOW" --root "$P" --in "$J" --out "$WORK/escape-knowledge" --quiet >/dev/null 2>&1
check "knowledge output cannot escape project root" "[ $? -eq 2 ] && [ ! -e '$WORK/escape-knowledge' ]"

head_ "stage 3: refuses a half-open block"
printf '# X
<!-- agent-engineering:start -->
broken
' > "$KB/stack.md"
node "$KNOW" --root "$P" --in "$J" --out "$KB" --quiet >/dev/null 2>&1; rc=$?
check "exits non-zero"               "[ $rc -ne 0 ]"
check "leaves the file untouched"    "grep -q 'broken' '$KB/stack.md'"

head_ "stage 5: citations resolve"
CITE="$KIT/skills/ae-surveyor/scripts/verify-citations.mjs"
printf '
## Notes
- OBSERVED `src/auth.js:1` real line
' >> "$KB/architecture.md"
( cd "$P" && node "$CITE" --dir "$KB" --quiet ) >/dev/null 2>&1
check "a resolving citation passes"   "[ $? -eq 0 ]"
printf -- '- OBSERVED `src/auth.js:9999` past end of file
' >> "$KB/architecture.md"
( cd "$P" && node "$CITE" --dir "$KB" --quiet ) >/dev/null 2>&1
check "an out-of-range line fails"    "[ $? -ne 0 ]"
OUTC="$WORK/cite.txt"; ( cd "$P" && node "$CITE" --dir "$KB" ) > "$OUTC" 2>&1
check "it names the broken citation"  "grep -q 'OUT OF RANGE' '$OUTC'"
check "it does not flag a command"    "! grep -q 'npm run' '$OUTC'"
check "citation check refuses to escape the root" "! ( cd '$P' && node \"$CITE\" --dir /etc >/dev/null 2>&1 )"

head_ "stage 4: rules"
RULEOUT="$P/.dev/rules"
node "$RULES" --root "$P" --in "$J" --out "$RULEOUT" --quiet >/dev/null 2>&1; rc=$?
check "exits 0"                      "[ $rc -eq 0 ]"
check "index written"                "[ -s '$RULEOUT/00-index.md' ]"
check "derives the typescript rule"  "[ -s '$RULEOUT/10-typescript.md' ]"
check "gate names a real command"    "grep -q 'npm run test' '$RULEOUT/00-index.md'"
check "typecheck rule cites tsc"     "grep -qE 'tsc|typecheck' '$RULEOUT/10-typescript.md'"
check "states the admission test"    "grep -q 'names a command that fails' '$RULEOUT/00-index.md'"
check "states the ratchet"           "grep -q 'ratchet' '$RULEOUT/00-index.md'"
check "lists what CI runs"           "grep -q 'npm test' '$RULEOUT/00-index.md'"
node -e 'const fs=require("fs");const p=process.argv[1];const s=fs.readFileSync(p,"utf8").replace(/(<!-- agent-engineering:judgment:10-typescript:start -->)[\s\S]*?(<!-- agent-engineering:judgment:10-typescript:end -->)/,"$1\nNo additional stack-specific rule is currently justified.\n$2");fs.writeFileSync(p,s)' "$RULEOUT/10-typescript.md"
node "$RULES" --root "$P" --in "$J" --out "$RULEOUT" --quiet >/dev/null 2>&1
check "completed rules judgment survives regeneration" "grep -q 'No additional stack-specific rule' '$RULEOUT/10-typescript.md'"
node "$RULES" --root "$P" --in "$J" --out "$WORK/escape-rules" --quiet >/dev/null 2>&1
check "rules output cannot escape project root" "[ $? -eq 2 ] && [ ! -e '$WORK/escape-rules' ]"

head_ "stage 4: a project with no gates says so"
BARE="$WORK/bare"; mkdir -p "$BARE"
printf '{
  \"name\": \"bare\"
}
' > "$BARE/package.json"
node "$ANALYZE" --root "$BARE" --out "$BARE/.dev/context/analysis.json" >/dev/null 2>&1
node "$RULES" --root "$BARE" --in "$BARE/.dev/context/analysis.json" --out "$BARE/.dev/rules" --quiet >/dev/null 2>&1
check "admits no rules"              "! ls '$BARE/.dev/rules'/10-*.md >/dev/null 2>&1"
check "says nothing is verifiable"   "grep -q 'No test, lint, typecheck or build command' '$BARE/.dev/rules/00-index.md'"

FORGE="$KIT/skills/ae-forge/scripts/forge.mjs"
node "$FORGE" start --root "$P" --title "Initialized fixture" --kind bug --id init-to-forge > "$P/.dev/context/forge.json" 2>&1; rc=$?
check "Forge starts beside optional project knowledge" "[ $rc -eq 0 ] && grep -q '\"investigator\"' '$P/.dev/work/init-to-forge/run.json' && grep -q '\"verifier\"' '$P/.dev/work/init-to-forge/run.json'"

node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));d.scripts.typecheck="tsc --noEmit";fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' "$P/package.json"
node "$ANALYZE" --root "$P" --out "$J" >/dev/null 2>&1
node "$FORGE" status --root "$P" --id init-to-forge > "$P/.dev/context/forge-status.json" 2>&1
check "project knowledge refresh does not strand active work" "[ $? -eq 0 ] && grep -q '\"status\": \"active\"' '$P/.dev/context/forge-status.json'"

head_ "stages refuse to run before analysis"
node "$KNOW" --root "$WORK" --in "$WORK/does-not-exist.json" --quiet >/dev/null 2>&1
check "knowledge exits non-zero"     "[ $? -ne 0 ]"
node "$RULES" --root "$WORK" --in "$WORK/does-not-exist.json" --quiet >/dev/null 2>&1
check "rules exits non-zero"         "[ $? -ne 0 ]"

printf '\n'
if [ "$FAIL" -gt 0 ]; then printf '\033[31m%d failed\033[0m, %d passed\n\n' "$FAIL" "$PASS"; exit 1; fi
printf '\033[32mall %d assertions passed\033[0m\n\n' "$PASS"
