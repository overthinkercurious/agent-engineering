#!/usr/bin/env bash
# test-scaffold.sh - acceptance tests for scaffold.sh and doctor.sh.
#
# Runs against throwaway projects in a temp dir. Nothing here touches the
# machine outside $TMPDIR. Reports every failure, then exits non-zero.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
SKILL="$KIT/skills/ae-surveyor"
SCAFFOLD="$SKILL/scripts/scaffold.sh"
DOCTOR="$SKILL/scripts/doctor.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-scaf.XXXXXX")"
command -v cygpath >/dev/null 2>&1 && WORK="$(cygpath -m "$WORK")"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
no()   { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2" >/dev/null 2>&1; then ok "$1"; else no "$1"; fi; }
head_(){ printf '\n\033[2m%s\033[0m\n' "$1"; }

newproj() { # $1 name, extra args = files to touch
  local p="$WORK/$1"; shift
  mkdir -p "$p" && (cd "$p" && git init -q .)
  for f in "$@"; do mkdir -p "$p/$(dirname "$f")"; : > "$p/$f"; done
  printf '%s' "$p"
}

# ---------------------------------------------------------------------------
head_ "1. dry run writes nothing"
P="$(newproj dry)"
BEFORE="$(cd "$P" && find . -path ./.git -prune -o -print | sort | md5sum)"
bash "$SCAFFOLD" --root "$P" --dry-run >/dev/null 2>&1; rc=$?
AFTER="$(cd "$P" && find . -path ./.git -prune -o -print | sort | md5sum)"
check "exits 0"                           "[ $rc -eq 0 ]"
check "filesystem unchanged"              "[ '$BEFORE' = '$AFTER' ]"

# ---------------------------------------------------------------------------
head_ "2. fresh scaffold creates exactly what is read"
P="$(newproj fresh)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1; rc=$?
check "exits 0"                           "[ $rc -eq 0 ]"
for d in context knowledge rules; do
  check ".dev/$d exists"                  "[ -d '$P/.dev/$d' ]"
done
check "no directory nothing reads"        "[ ! -d '$P/.dev/tasks' ] && [ ! -d '$P/.dev/scratch' ]"
check "no .dev/kit copy"                  "[ ! -d '$P/.dev/kit' ]"
check "AGENTS.md created"                 "[ -f '$P/AGENTS.md' ]"
check "AGENTS.md has the block"           "grep -qF 'agent-engineering:start' '$P/AGENTS.md'"
check "repo placeholder substituted"      "! grep -qF '__KIT_REPO__' '$P/AGENTS.md'"
check "no stale version placeholder"      "! grep -qF '__KIT_VERSION__' '$P/AGENTS.md'"
check "routes to the knowledge index"     "grep -qF '.dev/knowledge/00-index.md' '$P/AGENTS.md'"
check ".gitignore ignores analysis"       "grep -qF '.dev/context/' '$P/.gitignore'"
check "no CLAUDE.md (tool not present)"   "[ ! -f '$P/CLAUDE.md' ]"

# ---------------------------------------------------------------------------
head_ "3. doctor on a scaffolded but not-yet-indexed project"
OUT="$WORK/d3.txt"; bash "$DOCTOR" "$P" > "$OUT" 2>&1; rc=$?
check "exits 0 (nothing is broken yet)"   "[ $rc -eq 0 ]"
check "says the knowledge base is absent" "grep -q 'no knowledge base yet' '$OUT'"

# ---------------------------------------------------------------------------
head_ "4. running twice changes nothing"
B="$(cd "$P" && find . -path ./.git -prune -o -type f -print | sort | xargs md5sum 2>/dev/null | md5sum)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
A="$(cd "$P" && find . -path ./.git -prune -o -type f -print | sort | xargs md5sum 2>/dev/null | md5sum)"
check "byte-identical"                    "[ '$B' = '$A' ]"

# ---------------------------------------------------------------------------
head_ "5. content outside the markers is never touched"
P="$(newproj preserve)"
printf 'MY OWN HEADER\n\nkeep me\n' > "$P/AGENTS.md"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "pre-existing content survives"     "grep -qF 'MY OWN HEADER' '$P/AGENTS.md'"
check "block was appended"                "grep -qF 'agent-engineering:start' '$P/AGENTS.md'"
printf '\nTRAILING NOTE\n' >> "$P/AGENTS.md"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "trailing content survives a re-run" "grep -qF 'TRAILING NOTE' '$P/AGENTS.md'"

# ---------------------------------------------------------------------------
head_ "6. Claude Code gets an import, not a duplicate block"
P="$(newproj claude CLAUDE.md)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "imports AGENTS.md"                 "grep -qF '@AGENTS.md' '$P/CLAUDE.md'"
check "AGENTS.md also written"            "[ -f '$P/AGENTS.md' ]"
check "CLAUDE.md does not duplicate it"   "! grep -qF 'Project knowledge' '$P/CLAUDE.md'"
mkdir -p "$P/.claude/skills" && cp -R "$SKILL" "$P/.claude/skills/ae-surveyor"
bash "$DOCTOR" "$P" >/dev/null 2>&1
check "doctor passes with a real skill dir" "[ $? -eq 0 ]"

# ---------------------------------------------------------------------------
head_ "7. Antigravity gets workspace skills and a native rule"
P="$(newproj antigravity)"
mkdir -p "$P/.agents/skills"
cp -R "$SKILL" "$P/.agents/skills/ae-surveyor"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1; rc=$?
check "scaffold exits 0"                    "[ $rc -eq 0 ]"
check "writes the current Antigravity rule" "[ -s '$P/.agents/rules/agent-engineering.md' ]"
check "rule routes to project knowledge"    "grep -qF '.dev/knowledge/00-index.md' '$P/.agents/rules/agent-engineering.md'"
check "does not write the legacy rule path" "[ ! -e '$P/.agent/rules/agent-engineering.md' ]"
( cd "$P" && bash "$DOCTOR" ) >/dev/null 2>&1
check "doctor recognizes Antigravity install" "[ $? -eq 0 ]"

# ---------------------------------------------------------------------------
head_ "8. doctor catches breakage"
P="$(newproj broken)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
rm -rf "$P/.dev/knowledge"
bash "$DOCTOR" "$P" >/dev/null 2>&1
check "missing .dev/knowledge fails"      "[ $? -ne 0 ]"
P="$(newproj nogi)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
rm -f "$P/.gitignore"
bash "$DOCTOR" "$P" >/dev/null 2>&1
check "missing .gitignore fails"          "[ $? -ne 0 ]"
P="$(newproj ignoredkb)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
printf '.dev/knowledge/\n' >> "$P/.gitignore"
OUT="$WORK/d7.txt"; bash "$DOCTOR" "$P" > "$OUT" 2>&1
check "gitignoring the deliverable fails" "[ $? -ne 0 ] && grep -q 'committed record this tool exists to produce' '$OUT'"

# ---------------------------------------------------------------------------
head_ "9. a malformed managed block refuses to guess"
P="$(newproj malformed)"
printf 'top\n<!-- agent-engineering:start -->\nno end marker\n' > "$P/AGENTS.md"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1; rc=$?
check "exits non-zero"                    "[ $rc -ne 0 ]"
check "leaves the file untouched"         "grep -qF 'no end marker' '$P/AGENTS.md'"

# ---------------------------------------------------------------------------
head_ "10. refuses to write outside the project root"
bash "$SCAFFOLD" --root "$WORK/does-not-exist" >/dev/null 2>&1
check "bad --root exits non-zero"         "[ $? -ne 0 ]"

# ---------------------------------------------------------------------------
# Every test above passes --root, which normalises the path through cd/pwd and
# hides a whole class of bug. SKILL.md tells the agent to run with no
# arguments, so that is the path that has to work. On Git Bash, git reports
# C:/Users/... while pwd reports /c/Users/..., and comparing the two made
# ae_assert_inside reject the project's own .dev directories.
head_ "11. runs from inside the project with no arguments"
P="$(newproj cwdroot)"
OUT="$WORK/d10.txt"
( cd "$P" && bash "$SCAFFOLD" ) > "$OUT" 2>&1; rc=$?
check "exits 0"                           "[ $rc -eq 0 ]"
check "does not claim to escape the root" "! grep -q 'outside the project root' '$OUT'"
for d in context knowledge rules; do
  check ".dev/$d created"                 "[ -d '$P/.dev/$d' ]"
done
( cd "$P" && bash "$DOCTOR" ) >/dev/null 2>&1
check "doctor with no args exits 0"       "[ $? -eq 0 ]"

# ---------------------------------------------------------------------------
head_ "12. the suite is a dependency, the knowledge base is not"
P="$(newproj deps)"
mkdir -p "$P/.claude/skills/ae-surveyor" "$P/.claude/skills/my-own-skill" "$P/.agents/skills/ae-surveyor" "$P/.aider-desk/skills/ae-surveyor" "$P/skills/ae-forge"
printf 'x\n' > "$P/.claude/skills/ae-surveyor/SKILL.md"
printf 'x\n' > "$P/.claude/skills/my-own-skill/SKILL.md"
printf 'x\n' > "$P/.agents/skills/ae-surveyor/SKILL.md"
printf 'x\n' > "$P/.aider-desk/skills/ae-surveyor/SKILL.md"
printf 'x\n' > "$P/skills/ae-forge/SKILL.md"
printf '{}\n' > "$P/skills-lock.json"
printf '{"name":"d","scripts":{"test":"jest"}}\n' > "$P/package.json"
mkdir -p "$P/src" && printf 'export const login = (u) => u\n' > "$P/src/auth.js"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
node "$SKILL/scripts/analyze.mjs" --root "$P" >/dev/null 2>&1
node "$SKILL/scripts/knowledge.mjs" --root "$P" --quiet >/dev/null 2>&1
node "$SKILL/scripts/rules.mjs" --root "$P" --quiet >/dev/null 2>&1
( cd "$P" && git add -A && git -c user.email=t@t -c user.name=t commit -qm init ) >/dev/null 2>&1
TRACKED="$WORK/tracked.txt"; ( cd "$P" && git ls-files ) > "$TRACKED"
check "ae- skills are NOT tracked"        "! grep -q 'skills/ae-surveyor' '$TRACKED'"
check "all-agent ae- copies are ignored"  "! grep -q 'skills/ae-forge' '$TRACKED'"
check "the user's own skill IS tracked"   "grep -q 'my-own-skill/SKILL.md' '$TRACKED'"
check "analysis.json is NOT tracked"      "! grep -q 'analysis.json' '$TRACKED'"
check "knowledge base IS tracked"         "grep -q '.dev/knowledge/00-index.md' '$TRACKED'"
check "rules index IS tracked"            "grep -q '.dev/rules/00-index.md' '$TRACKED'"
check "feature workspaces are ignored"    "( cd '$P' && git check-ignore -q .dev/work/example/state.json )"
check "AGENTS.md IS tracked"              "grep -qx 'AGENTS.md' '$TRACKED'"
check "skills-lock.json IS tracked"       "grep -qx 'skills-lock.json' '$TRACKED'"
check "working tree is clean after init"  "[ -z \"\$( cd '$P' && git status --porcelain )\" ]"
C="$WORK/clone"; git clone -q "$P" "$C" >/dev/null 2>&1
check "clone carries the knowledge base"  "[ -s '$C/.dev/knowledge/00-index.md' ]"
check "clone does NOT carry the suite"    "[ ! -d '$C/.claude/skills/ae-surveyor' ]"
check "clone says how to restore"         "grep -q 'npx skills@1.7.0 add' '$C/AGENTS.md'"

# ---------------------------------------------------------------------------
head_ "13. the full chain, in the order SKILL.md gives"
P="$(newproj chain)"
mkdir -p "$P/src"
printf '{"name":"c","scripts":{"test":"jest","lint":"eslint ."}}\n' > "$P/package.json"
printf '{"compilerOptions":{"strict":true}}\n' > "$P/tsconfig.json"
printf 'export const login = (u) => u\n' > "$P/src/auth.js"
( cd "$P" && git add -A && git -c user.email=t@t -c user.name=t commit -qm init ) >/dev/null 2>&1
( cd "$P" && bash "$SCAFFOLD" ) >/dev/null 2>&1
( cd "$P" && node "$SKILL/scripts/analyze.mjs" ) >/dev/null 2>&1
check "stage 2 wrote analysis.json"       "[ -s '$P/.dev/context/analysis.json' ]"
( cd "$P" && node "$SKILL/scripts/knowledge.mjs" --quiet ) >/dev/null 2>&1
check "stage 3 wrote the index"           "[ -s '$P/.dev/knowledge/00-index.md' ]"
check "stage 3 found the auth risk"       "grep -q 'src/auth.js' '$P/.dev/knowledge/40-risks.md'"
( cd "$P" && node "$SKILL/scripts/rules.mjs" --quiet ) >/dev/null 2>&1
check "stage 4 wrote the rules index"     "[ -s '$P/.dev/rules/00-index.md' ]"
check "stage 4 found a real gate"         "grep -q 'npm run test' '$P/.dev/rules/00-index.md'"
OUT="$WORK/d12.txt"; ( cd "$P" && bash "$DOCTOR" ) > "$OUT" 2>&1; rc=$?
check "doctor healthy after a full run"   "[ $rc -eq 0 ]"
check "doctor sees the knowledge base"    "grep -q 'knowledge base present' '$OUT'"
check "doctor flags unanswered slots"     "grep -q 'unanswered judgment slots' '$OUT'"

# ---------------------------------------------------------------------------
printf '\n'
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31m%d failed\033[0m, %d passed\n\n' "$FAIL" "$PASS"; exit 1
fi
printf '\033[32mall %d assertions passed\033[0m\n\n' "$PASS"
