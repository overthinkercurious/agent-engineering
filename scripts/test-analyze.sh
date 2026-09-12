#!/usr/bin/env bash
# test-analyze.sh - acceptance tests for the init analyzer.
#
# Builds a synthetic project covering every extraction path, then asserts the
# analysis. Most assertions here exist because the behaviour they check was
# wrong at some point: routes came out of README code fences, Python fan-in
# resolved to zero, and documentation examples flooded the must-read set.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
ANALYZE="$KIT/skills/ae-setup/scripts/analyze.mjs"
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
git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm init

J="$WORK/out.json"
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
rm -f "$WORK/none.json"
node "$ANALYZE" --root "$P" --out "$WORK/none.json" --estimate >/dev/null 2>&1
check "--estimate writes nothing"    "[ ! -f '$WORK/none.json' ]"
node "$ANALYZE" --root "$P" --out "$WORK/full.json" --depth full >/dev/null 2>&1
check "--depth full reads all code"  "[ \$(node -e \"const d=require('$WORK/full.json');process.stdout.write(String(d.selection.files.length===d.coverage.code_files))\") = 'true' ]"
node "$ANALYZE" --root "$P" --out "$WORK/tiny.json" --budget-tokens 1 >/dev/null 2>&1
check "tiny budget reports deferrals" "[ \$(node -e \"const d=require('$WORK/tiny.json');process.stdout.write(String(d.selection.deferred_high_signal.length))\") -ge 1 ]"

head_ "runs outside a git repo"
NG="$WORK/nogit"; mkdir -p "$NG/src"; cp "$P/package.json" "$NG/"; cp "$P/src/index.js" "$NG/src/"
node "$ANALYZE" --root "$NG" --out "$WORK/ng.json" >/dev/null 2>&1
check "still produces analysis"      "[ -f '$WORK/ng.json' ]"
eq    "reports not-a-repo"           "d.git.is_repo" "false" "$WORK/ng.json"
# Without this the manual directory walk can return zero files and every
# assertion above still passes, which is how an ESM require() bug once shipped.
check "walk still finds files"       "[ \$(node -e \"const d=require('$WORK/ng.json');process.stdout.write(String(d.inventory.total_files))\") -ge 2 ]"
check "walk still parses code"       "[ \$(node -e \"const d=require('$WORK/ng.json');process.stdout.write(String(d.coverage.code_files))\") -ge 1 ]"

# ---------------------------------------------------------------------------
KNOW="$KIT/skills/ae-setup/scripts/knowledge.mjs"
RULES="$KIT/skills/ae-setup/scripts/rules.mjs"

head_ "stage 3: knowledge base"
node "$KNOW" --root "$P" --in "$J" --out "$WORK/kb" --quiet >/dev/null 2>&1; rc=$?
check "exits 0"                      "[ $rc -eq 0 ]"
for f in 00-index 10-stack 20-commands 30-architecture 40-risks 50-conventions; do
  check "$f.md written"              "[ -s '$WORK/kb/$f.md' ]"
done
check "facts: npm script table"      "grep -q 'jest' '$WORK/kb/20-commands.md'"
check "facts: route from code"       "grep -q '/users' '$WORK/kb/30-architecture.md'"
check "facts: NOT the README route"  "! grep -q 'from-the-readme' '$WORK/kb/30-architecture.md'"
check "facts: auth in risks"         "grep -q 'src/auth.js' '$WORK/kb/40-risks.md'"
check "leaves judgment slots"        "grep -q 'TODO (judgment)' '$WORK/kb/30-architecture.md'"
check "title sits outside the block" "[ \"\$(head -1 '$WORK/kb/10-stack.md')\" = '# Stack' ]"
check "index links every doc"        "grep -q '50-conventions.md' '$WORK/kb/00-index.md'"
check "records its caveats"          "grep -q 'lower bound' '$WORK/kb/00-index.md'"

head_ "stage 3: re-running preserves human edits"
printf '
HAND-WRITTEN NOTE
' >> "$WORK/kb/10-stack.md"
node "$KNOW" --root "$P" --in "$J" --out "$WORK/kb" --quiet >/dev/null 2>&1
check "note survives regeneration"   "grep -q 'HAND-WRITTEN NOTE' '$WORK/kb/10-stack.md'"
check "facts still present"          "grep -q 'javascript' '$WORK/kb/10-stack.md'"
B1="$(md5sum < "$WORK/kb/20-commands.md")"
node "$KNOW" --root "$P" --in "$J" --out "$WORK/kb" --quiet >/dev/null 2>&1
check "idempotent"                   "[ \"$B1\" = \"\$(md5sum < '$WORK/kb/20-commands.md')\" ]"

head_ "stage 3: refuses a half-open block"
printf '# X
<!-- agent-engineering:start -->
broken
' > "$WORK/kb/10-stack.md"
node "$KNOW" --root "$P" --in "$J" --out "$WORK/kb" --quiet >/dev/null 2>&1; rc=$?
check "exits non-zero"               "[ $rc -ne 0 ]"
check "leaves the file untouched"    "grep -q 'broken' '$WORK/kb/10-stack.md'"

head_ "stage 4: rules"
node "$RULES" --root "$P" --in "$J" --out "$WORK/rules" --quiet >/dev/null 2>&1; rc=$?
check "exits 0"                      "[ $rc -eq 0 ]"
check "index written"                "[ -s '$WORK/rules/00-index.md' ]"
check "derives the typescript rule"  "[ -s '$WORK/rules/10-typescript.md' ]"
check "gate names a real command"    "grep -q 'npm run test' '$WORK/rules/00-index.md'"
check "typecheck rule cites tsc"     "grep -qE 'tsc|typecheck' '$WORK/rules/10-typescript.md'"
check "states the admission test"    "grep -q 'names a command that fails' '$WORK/rules/00-index.md'"
check "states the ratchet"           "grep -q 'ratchet' '$WORK/rules/00-index.md'"
check "lists what CI runs"           "grep -q 'npm test' '$WORK/rules/00-index.md'"

head_ "stage 4: a project with no gates says so"
BARE="$WORK/bare"; mkdir -p "$BARE"
printf '{
  \"name\": \"bare\"
}
' > "$BARE/package.json"
node "$ANALYZE" --root "$BARE" --out "$WORK/bare.json" >/dev/null 2>&1
node "$RULES" --root "$BARE" --in "$WORK/bare.json" --out "$WORK/bare-rules" --quiet >/dev/null 2>&1
check "admits no rules"              "! ls '$WORK/bare-rules'/10-*.md >/dev/null 2>&1"
check "says nothing is verifiable"   "grep -q 'No test, lint, typecheck or build command' '$WORK/bare-rules/00-index.md'"

head_ "stages refuse to run before analysis"
node "$KNOW" --root "$WORK" --in "$WORK/does-not-exist.json" --quiet >/dev/null 2>&1
check "knowledge exits non-zero"     "[ $? -ne 0 ]"
node "$RULES" --root "$WORK" --in "$WORK/does-not-exist.json" --quiet >/dev/null 2>&1
check "rules exits non-zero"         "[ $? -ne 0 ]"

printf '\n'
if [ "$FAIL" -gt 0 ]; then printf '\033[31m%d failed\033[0m, %d passed\n\n' "$FAIL" "$PASS"; exit 1; fi
printf '\033[32mall %d assertions passed\033[0m\n\n' "$PASS"
