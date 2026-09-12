#!/usr/bin/env bash
# test-install.sh - acceptance tests for scaffold.sh and doctor.sh.
#
# Runs against throwaway projects in a temp dir. Nothing here touches the
# machine outside $TMPDIR. Exits non-zero on the first failed assertion.

set -uo pipefail
KIT="$(cd -P "$(dirname "$0")/.." && pwd)"
SKILL="$KIT/skills/ae-setup"
SCAFFOLD="$SKILL/scripts/scaffold.sh"
DOCTOR="$SKILL/scripts/doctor.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ae-test.XXXXXX")"
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
head_ "1. dry-run writes nothing"
P="$(newproj dry)"
BEFORE="$(cd "$P" && find . -path ./.git -prune -o -print | sort | md5sum)"
bash "$SCAFFOLD" --root "$P" --dry-run >/dev/null 2>&1; rc=$?
AFTER="$(cd "$P" && find . -path ./.git -prune -o -print | sort | md5sum)"
check "exits 0"                 "[ $rc -eq 0 ]"
check "filesystem unchanged"    "[ '$BEFORE' = '$AFTER' ]"

# ---------------------------------------------------------------------------
head_ "2. fresh install creates the expected tree"
P="$(newproj fresh)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1; rc=$?
check "exits 0"                          "[ $rc -eq 0 ]"
for d in tasks decisions knowledge rules context scratch evidence; do
  check ".dev/$d exists"                 "[ -d '$P/.dev/$d' ]"
done
check ".dev/kit/scripts/doctor.sh exists" "[ -f '$P/.dev/kit/scripts/doctor.sh' ]"
check ".dev/kit/references copied"        "[ -f '$P/.dev/kit/references/targets.yml' ]"
check ".dev/kit/assets copied"            "[ -f '$P/.dev/kit/assets/pointer-block.md' ]"
check "doctor.sh is executable"           "[ -x '$P/.dev/kit/scripts/doctor.sh' ]"
check ".dev/kit-version written"          "[ -s '$P/.dev/kit-version' ]"
check "ENGINEERING.md created"            "[ -f '$P/ENGINEERING.md' ]"
check "AGENTS.md created"                 "[ -f '$P/AGENTS.md' ]"
check "AGENTS.md has the block"           "grep -qF 'agent-engineering:start' '$P/AGENTS.md'"
check "version substituted, not literal"  "! grep -qF '__KIT_VERSION__' '$P/AGENTS.md'"
check ".gitignore has scratch"            "grep -qF '.dev/scratch/' '$P/.gitignore'"
check "no CLAUDE.md (tool not present)"   "[ ! -f '$P/CLAUDE.md' ]"

# ---------------------------------------------------------------------------
head_ "3. doctor passes a clean install"
OUT="$WORK/d3.txt"; bash "$P/.dev/kit/scripts/doctor.sh" "$P" > "$OUT" 2>&1; rc=$?
check "exits 0"                           "[ $rc -eq 0 ]"
check "reports healthy"                   "grep -q healthy '$OUT'"

# ---------------------------------------------------------------------------
head_ "4. idempotency: second run changes nothing"
P="$(newproj idem)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
SNAP1="$WORK/snap1"; (cd "$P" && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 md5sum) > "$SNAP1" 2>/dev/null
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1; rc=$?
SNAP2="$WORK/snap2"; (cd "$P" && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 md5sum) > "$SNAP2" 2>/dev/null
check "second run exits 0"                "[ $rc -eq 0 ]"
check "byte-identical tree"               "diff -q '$SNAP1' '$SNAP2'"
check "exactly one start marker"          "[ \$(grep -cF 'agent-engineering:start' '$P/AGENTS.md') -eq 1 ]"

# ---------------------------------------------------------------------------
head_ "5. user content outside the markers survives"
P="$(newproj usercontent)"
cat > "$P/AGENTS.md" <<'EOF'
# My project

Hand written intro that must survive.

## Commands
- npm test
EOF
cat > "$P/.gitignore" <<'EOF'
node_modules/
.env.local
EOF
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "intro preserved"                   "grep -qF 'Hand written intro that must survive.' '$P/AGENTS.md'"
check "user heading preserved"            "grep -qF '## Commands' '$P/AGENTS.md'"
check "block appended"                    "grep -qF 'agent-engineering:start' '$P/AGENTS.md'"
check "gitignore user lines preserved"    "grep -qF '.env.local' '$P/.gitignore'"
# now change the block content and re-run: user content still survives
printf 'MUTATED\n' > "$SKILL/assets/.probe" 2>/dev/null || true
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "intro still there after re-run"    "grep -qF 'Hand written intro that must survive.' '$P/AGENTS.md'"
check "still exactly one block"           "[ \$(grep -cF 'agent-engineering:start' '$P/AGENTS.md') -eq 1 ]"
rm -f "$SKILL/assets/.probe"

# ---------------------------------------------------------------------------
head_ "6. ENGINEERING.md is never overwritten"
P="$(newproj humanowned)"
printf -- '---\noperator_mode: director\nkit_version: 9.9.9\nallowed_root_files: []\nscratch_retention_days: 1\n---\nMY OWN CONTENT\n' > "$P/ENGINEERING.md"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "content untouched"                 "grep -qF 'MY OWN CONTENT' '$P/ENGINEERING.md'"
check "operator_mode untouched"           "grep -qF 'operator_mode: director' '$P/ENGINEERING.md'"

# ---------------------------------------------------------------------------
head_ "7. Claude Code detection writes the CLAUDE.md import"
P="$(newproj claudeproj)"; mkdir -p "$P/.claude/skills"
cp -R "$SKILL" "$P/.claude/skills/ae-setup"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
check "CLAUDE.md created"                 "[ -f '$P/CLAUDE.md' ]"
check "imports AGENTS.md"                 "grep -qF '@AGENTS.md' '$P/CLAUDE.md'"
check "AGENTS.md also written"            "grep -qF 'agent-engineering:start' '$P/AGENTS.md'"
check "CLAUDE.md does not duplicate block" "! grep -qF 'Check install health' '$P/CLAUDE.md'"
out="$(bash "$P/.dev/kit/scripts/doctor.sh" "$P" 2>&1)"; rc=$?
check "doctor passes with a real skill dir" "[ $rc -eq 0 ]"

# ---------------------------------------------------------------------------
head_ "8. doctor catches breakage"
P="$(newproj broken)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
rm -rf "$P/.dev/tasks"
bash "$P/.dev/kit/scripts/doctor.sh" "$P" >/dev/null 2>&1; rc=$?
check "missing .dev/tasks fails"          "[ $rc -ne 0 ]"

P="$(newproj stale)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
mkdir -p "$P/.agents/skills/ae-setup/scripts"
printf '9.9.9\n' > "$P/.agents/skills/ae-setup/scripts/kit-version.txt"
printf 'x\n' > "$P/.agents/skills/ae-setup/SKILL.md"
bash "$P/.dev/kit/scripts/doctor.sh" "$P" >/dev/null 2>&1; rc=$?
check "stale kit-version fails"           "[ $rc -ne 0 ]"

P="$(newproj nogitignore)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
rm -f "$P/.gitignore"
bash "$P/.dev/kit/scripts/doctor.sh" "$P" >/dev/null 2>&1; rc=$?
check "missing .gitignore fails"          "[ $rc -ne 0 ]"

P="$(newproj crlf)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
printf '#!/usr/bin/env bash\r\necho hi\r\n' > "$P/.dev/kit/scripts/lib.sh"
bash "$P/.dev/kit/scripts/doctor.sh" "$P" >/dev/null 2>&1; rc=$?
check "CRLF scripts fail"                 "[ $rc -ne 0 ]"

# ---------------------------------------------------------------------------
head_ "9. malformed managed block refuses to guess"
P="$(newproj malformed)"
printf '# Notes\n\n<!-- agent-engineering:start -->\nhalf a block\n' > "$P/AGENTS.md"
BEFORE="$(md5sum < "$P/AGENTS.md")"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1; rc=$?
AFTER="$(md5sum < "$P/AGENTS.md")"
check "exits non-zero"                    "[ $rc -ne 0 ]"
check "leaves the file untouched"         "[ '$BEFORE' = '$AFTER' ]"

# ---------------------------------------------------------------------------
head_ "10. refuses to write outside the project root"
P="$(newproj sandbox)"
out="$(bash "$SCAFFOLD" --root "$P/does-not-exist" 2>&1)"; rc=$?
check "bad --root exits non-zero"         "[ $rc -ne 0 ]"

# ---------------------------------------------------------------------------
head_ "11. the suite is a dependency, not committed content"
P="$(newproj dependency)"
mkdir -p "$P/.claude/skills"; cp -R "$SKILL" "$P/.claude/skills/ae-setup"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
printf '{"version":1,"skills":{"ae-setup":{"sourceType":"git"}}}\n' > "$P/skills-lock.json"
(cd "$P" && git add -A >/dev/null 2>&1 && git -c user.email=t@t -c user.name=t commit -qm installed >/dev/null 2>&1)
TRACKED="$WORK/tracked.txt"; (cd "$P" && git ls-files) > "$TRACKED"
check "ae- skills are NOT tracked"        "! grep -q 'skills/ae-setup' '$TRACKED'"
check ".dev/kit/ is NOT tracked"          "! grep -q '^\.dev/kit/' '$TRACKED'"
check ".dev/kit-version IS tracked"       "grep -qx '.dev/kit-version' '$TRACKED'"
check "AGENTS.md IS tracked"              "grep -qx 'AGENTS.md' '$TRACKED'"
check "ENGINEERING.md IS tracked"         "grep -qx 'ENGINEERING.md' '$TRACKED'"
check ".dev/tasks IS tracked"             "grep -q '^.dev/tasks/.gitkeep' '$TRACKED'"
check ".dev/decisions IS tracked"         "grep -q '^.dev/decisions/.gitkeep' '$TRACKED'"
# The knowledge base and rules are generated, but they are the project's own
# record of itself and must survive a clone. If these ever land in .gitignore
# the suite silently stops being useful to anyone but the machine that ran it.
check ".dev/knowledge IS tracked"         "grep -q '^.dev/knowledge/.gitkeep' '$TRACKED'"
check ".dev/rules IS tracked"             "grep -q '^.dev/rules/.gitkeep' '$TRACKED'"
check "skills-lock.json IS tracked"       "grep -qx 'skills-lock.json' '$TRACKED'"
check "working tree is clean after install" "[ -z \"\$(cd '$P' && git status --porcelain)\" ]"
printf 'junk\n' > "$P/.dev/scratch/throwaway.txt"
check "scratch contents stay ignored"     "[ -z \"\$(cd '$P' && git status --porcelain .dev/scratch)\" ]"

C="$WORK/cloned"; git clone -q "$P" "$C" 2>/dev/null
check "clone has the committed record"    "[ -f '$C/AGENTS.md' ] && [ -d '$C/.dev/tasks' ] && [ -f '$C/skills-lock.json' ]"
check "clone has working dirs"            "[ -d '$C/.dev/scratch' ] && [ -d '$C/.dev/context' ]"
check "clone does NOT carry the suite"    "[ ! -d '$C/.claude/skills/ae-setup' ]"
check "clone does NOT carry .dev/kit"     "[ ! -d '$C/.dev/kit' ]"
check "clone's AGENTS.md says how to restore" "grep -qF 'npx skills add' '$C/AGENTS.md'"

# ---------------------------------------------------------------------------
head_ "12. skills the user wrote themselves stay tracked"
# The hazard in ignoring .claude/skills/ wholesale: it would silently stop
# tracking the user's own work. Prefix-scoped ignores must not do that.
P="$(newproj ownskills)"
mkdir -p "$P/.claude/skills/my-own-skill" "$P/.claude/skills/ae-setup"
printf -- '---\nname: my-own-skill\ndescription: mine\n---\nbody\n' > "$P/.claude/skills/my-own-skill/SKILL.md"
cp -R "$SKILL/." "$P/.claude/skills/ae-setup/"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
(cd "$P" && git add -A >/dev/null 2>&1 && git -c user.email=t@t -c user.name=t commit -qm x >/dev/null 2>&1)
TRACKED="$WORK/tracked2.txt"; (cd "$P" && git ls-files) > "$TRACKED"
check "the user's own skill IS tracked"   "grep -q 'my-own-skill/SKILL.md' '$TRACKED'"
check "the suite's skill is NOT tracked"  "! grep -q 'ae-setup' '$TRACKED'"

# ---------------------------------------------------------------------------
head_ "13. doctor flags a suite that is still tracked from an older install"
P="$(newproj migrate)"
mkdir -p "$P/.claude/skills/ae-setup"; cp -R "$SKILL/." "$P/.claude/skills/ae-setup/"
(cd "$P" && git add -f .claude >/dev/null 2>&1 && git -c user.email=t@t -c user.name=t commit -qm "old style" >/dev/null 2>&1)
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
OUT="$WORK/doc.txt"; bash "$P/.dev/kit/scripts/doctor.sh" "$P" > "$OUT" 2>&1
check "names the untracking command"      "grep -qF 'git rm -r --cached' '$OUT'"

# ---------------------------------------------------------------------------
head_ "14. gitignore covers both the suite and the working zones"
P="$(newproj ignores)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
for e in '.claude/skills/ae-*/' '.agents/skills/ae-*/' '.dev/kit/' '.dev/scratch/*'; do
  check "ignores $e"                      "grep -qF '$e' '$P/.gitignore'"
done
check "restore command is in .gitignore"  "grep -qF 'npx skills add' '$P/.gitignore'"

head_ "15. a missing working directory warns, it does not fail"
P="$(newproj workdir)"
bash "$SCAFFOLD" --root "$P" >/dev/null 2>&1
rm -rf "$P/.dev/scratch"
OUT="$WORK/d15.txt"; bash "$P/.dev/kit/scripts/doctor.sh" "$P" > "$OUT" 2>&1; rc=$?
check "still exits 0"                     "[ $rc -eq 0 ]"
check "reports it as a warning"           "grep -q 'disposable by design' '$OUT'"


# ---------------------------------------------------------------------------
# Every test above passes --root, which normalises the path through cd/pwd and
# hides a whole class of bug. SKILL.md tells the agent to run scaffold with no
# arguments, so that is the path that has to work. On Git Bash, git reports
# C:/Users/... while pwd reports /c/Users/..., and comparing the two made
# ae_assert_inside reject the project's own .dev directories.
head_ "16. runs from inside the project with no arguments"
P="$(newproj cwdroot)"
OUT="$WORK/d16.txt"
( cd "$P" && bash "$SCAFFOLD" ) > "$OUT" 2>&1; rc=$?
check "exits 0"                           "[ $rc -eq 0 ]"
check "does not claim to escape the root" "! grep -q 'outside the project root' '$OUT'"
for d in tasks decisions knowledge rules context scratch evidence; do
  check ".dev/$d created"                 "[ -d '$P/.dev/$d' ]"
done
check "ENGINEERING.md created"            "[ -f '$P/ENGINEERING.md' ]"
( cd "$P" && bash .dev/kit/scripts/doctor.sh ) > "$WORK/d16b.txt" 2>&1; rc=$?
check "doctor with no args exits 0"       "[ $rc -eq 0 ]"

# ---------------------------------------------------------------------------
# The whole four-stage chain, on one project, in the order SKILL.md gives.
head_ "17. the full chain produces every artifact"
P="$(newproj chain)"
mkdir -p "$P/src"
printf '{"name":"c","scripts":{"test":"jest","lint":"eslint ."}}
' > "$P/package.json"
printf 'export const login = (u) => u
' > "$P/src/auth.js"
( cd "$P" && git add -A && git -c user.email=t@t -c user.name=t commit -qm init ) >/dev/null 2>&1
( cd "$P" && bash "$SCAFFOLD" ) >/dev/null 2>&1
( cd "$P" && node .dev/kit/scripts/analyze.mjs ) >/dev/null 2>&1
check "stage 2 wrote analysis.json"       "[ -s '$P/.dev/context/analysis.json' ]"
( cd "$P" && node .dev/kit/scripts/knowledge.mjs --quiet ) >/dev/null 2>&1
check "stage 3 wrote the index"           "[ -s '$P/.dev/knowledge/00-index.md' ]"
check "stage 3 found the auth risk"       "grep -q 'src/auth.js' '$P/.dev/knowledge/40-risks.md'"
( cd "$P" && node .dev/kit/scripts/rules.mjs --quiet ) >/dev/null 2>&1
check "stage 4 wrote the rules index"     "[ -s '$P/.dev/rules/00-index.md' ]"
check "stage 4 found a real gate"         "grep -q 'npm run test' '$P/.dev/rules/00-index.md'"
( cd "$P" && bash .dev/kit/scripts/doctor.sh ) > "$WORK/d17.txt" 2>&1; rc=$?
check "doctor still healthy"              "[ $rc -eq 0 ]"
( cd "$P" && git add -A && git -c user.email=t@t -c user.name=t commit -qm kb ) >/dev/null 2>&1
check "knowledge is committed, not ignored" "( cd '$P' && git ls-files ) | grep -q '.dev/knowledge/00-index.md'"
check "analysis.json stays ignored"       "! ( cd '$P' && git ls-files ) | grep -q 'analysis.json'"

# ---------------------------------------------------------------------------
printf '\n'
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31m%d failed\033[0m, %d passed\n\n' "$FAIL" "$PASS"; exit 1
fi
printf '\033[32mall %d assertions passed\033[0m\n\n' "$PASS"
