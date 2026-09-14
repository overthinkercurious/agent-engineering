#!/usr/bin/env bash
# validate-suite.sh - the authoring contract in CONTRIBUTING.md, as an exit code.
#
# A convention that is only written down drifts the moment the roster grows.
# This is the mechanical half. Run it before every commit that touches skills/.
#
# Usage: bash scripts/validate-suite.sh [skills-dir]

set -uo pipefail
ROOT="$(cd -P "$(dirname "$0")/.." && pwd)"
SKILLS="${1:-$ROOT/skills}"

C_RED=''; C_YEL=''; C_GRN=''; C_DIM=''; C_OFF=''
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
fi
FAILS=0; WARNS=0
fail() { printf '%s FAIL %s %s\n' "$C_RED" "$C_OFF" "$*"; FAILS=$((FAILS+1)); }
warn() { printf '%s warn %s %s\n' "$C_YEL" "$C_OFF" "$*"; WARNS=$((WARNS+1)); }
ok()   { printf '%s  ok  %s %s\n' "$C_GRN" "$C_OFF" "$*"; }

# Read one frontmatter key, joining folded (`key: >`) continuations.
fm_get() {
  awk -v want="$2" '
    NR == 1 && $0 == "---" { inb = 1; next }
    inb && $0 == "---"     { exit }
    !inb                   { next }
    {
      if (match($0, /^[A-Za-z_][A-Za-z0-9_]*:/)) {
        key = substr($0, 1, RLENGTH - 1)
        val = substr($0, RLENGTH + 1)
        sub(/^[[:space:]]+/, "", val)
        if (key == want) { collecting = 1; if (val != ">" && val != "|") out = val; next }
        collecting = 0; next
      }
      if (collecting) {
        line = $0; sub(/^[[:space:]]+/, "", line)
        out = (out == "" ? line : out " " line)
      }
    }
    END { print out }
  ' "$1"
}

# Agent Skills permits extension data under `metadata`, not as arbitrary
# top-level frontmatter keys. Ownership lives there so other tools accept the
# skill while this suite can still enforce non-overlap.
fm_metadata_get() {
  awk -v want="$2" '
    NR == 1 && $0 == "---" { inb = 1; next }
    inb && $0 == "---"     { exit }
    !inb                   { next }
    /^metadata:[[:space:]]*$/ { inmeta = 1; next }
    inmeta && /^[^[:space:]]/ { inmeta = 0 }
    inmeta {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      if (index(line, want ":") == 1) {
        sub("^" want ":[[:space:]]*", "", line)
        gsub(/^"|"$/, "", line)
        print line
        exit
      }
    }
  ' "$1"
}

[ -d "$SKILLS" ] || { echo "no skills directory at $SKILLS" >&2; exit 2; }

MANIFEST="$(mktemp "${TMPDIR:-/tmp}/ae-val.XXXXXX")"
trap 'rm -f "$MANIFEST"' EXIT

printf '\nvalidating suite in %s\n' "$SKILLS"

found=0
while IFS= read -r skillmd; do
  found=$((found + 1))
  dir="$(dirname "$skillmd")"
  base="$(basename "$dir")"
  rel="${skillmd#"$ROOT"/}"

  printf '\n%s%s%s\n' "$C_DIM" "$rel" "$C_OFF"

  head -1 "$skillmd" | grep -q '^---$' || { fail "$base: no YAML frontmatter on line 1"; continue; }

  name="$(fm_get "$skillmd" name)"
  desc="$(fm_get "$skillmd" description)"
  owns="$(fm_metadata_get "$skillmd" owns)"

  # name: required, must match the directory, must be prefixed.
  # Install flattens every skill into one directory, so a name is a global
  # identifier. A collision silently overwrites someone else's skill.
  if [ -z "$name" ]; then
    fail "$base: frontmatter has no 'name'"
  else
    [ "$name" = "$base" ] || fail "$base: name '$name' does not match its directory"
    case "$name" in
      ae-*) ;;
      *) fail "$base: name must start with 'ae-' (installed names are global and collide)" ;;
    esac
    printf '%s\t%s\t%s\n' "$name" "$owns" "$rel" >> "$MANIFEST"
  fi

  # description: the entire triggering mechanism. Too short means it never fires.
  if [ -z "$desc" ]; then
    fail "$base: frontmatter has no 'description' - the skill will never trigger"
  else
    n=${#desc}
    if [ "$n" -lt 120 ]; then
      fail "$base: description is $n chars. All 'when to use' info lives here, so it needs the contexts and phrasings that should fire it."
    elif [ "$n" -gt 1400 ]; then
      warn "$base: description is $n chars - it is always in context for every session"
    else
      ok "$base: description $n chars"
    fi
  fi

  [ -n "$owns" ] || warn "$base: no 'metadata.owns' - the manifest and the duplicate-ownership check need it"

  # body length: progressive disclosure level 2
  body_lines="$(awk 'NR>1 && $0=="---" { found=1; next } found' "$skillmd" | wc -l | tr -d ' ')"
  if [ "$body_lines" -gt 500 ]; then
    fail "$base: body is $body_lines lines (limit 500) - move detail into references/ with explicit pointers"
  else
    ok "$base: body $body_lines lines"
  fi

  # Bundled scripts must resolve wherever the skill is installed, on whichever
  # tool installed it. A bare `bash scripts/x.sh` depends on the caller's cwd.
  if [ -d "$dir/scripts" ]; then
    if grep -qE '(^|[^A-Za-z_])(bash|sh|python3?|node)[[:space:]]+\.?/?scripts/' "$skillmd" 2>/dev/null; then
      fail "$base: calls scripts/ by a relative path, which depends on the caller's working directory. Resolve the skill directory first."
    else
      ok "$base: no cwd-relative script calls"
    fi
    # CLAUDE_SKILL_DIR is Claude Code's, and 22 of the 24 tools in targets.yml
    # are not Claude Code. Using it is correct; using it with no fallback makes
    # the skill silently a no-op everywhere else, because the unset variable
    # expands to nothing and the path becomes /scripts/...
    if grep -q 'CLAUDE_SKILL_DIR' "$skillmd" 2>/dev/null; then
      if grep -qE 'CLAUDE_SKILL_DIR:-|\.agents/skills|\.claude/skills' "$skillmd" 2>/dev/null; then
        ok "$base: CLAUDE_SKILL_DIR has a non-Claude fallback"
      else
        fail "$base: uses \${CLAUDE_SKILL_DIR} with no fallback. It is unset on every tool that is not Claude Code, and expands to nothing."
      fi
    fi
  fi

  # no skill invokes another skill - escalation is a return value, not a call
  if grep -qiE 'invoke (the )?(ae-|skill)|use the ae-[a-z-]+ skill' "$skillmd" 2>/dev/null; then
    warn "$base: looks like it invokes another skill. Escalation is a structured return value, never a call."
  fi

  # oversized references need navigation
  if [ -d "$dir/references" ]; then
    for r in "$dir/references"/*.md; do
      [ -f "$r" ] || continue
      rl="$(wc -l < "$r" | tr -d ' ')"
      if [ "$rl" -gt 300 ] && ! grep -qiE '^#+ *(table of contents|contents)' "$r"; then
        warn "$base: references/$(basename "$r") is $rl lines and has no table of contents"
      fi
    done
  fi
done <<EOF
$(find "$SKILLS" -name SKILL.md -type f | sort)
EOF

if [ "$found" = "0" ]; then
  fail "no SKILL.md found anywhere under $SKILLS"
fi

# ---- cross-skill checks: these only matter once there is more than one -------
printf '\n%ssuite-wide%s\n' "$C_DIM" "$C_OFF"

dupname="$(awk -F'\t' '{ c[$1]++ } END { for (k in c) if (c[k] > 1) print k }' "$MANIFEST" 2>/dev/null)"
if [ -n "$dupname" ]; then
  fail "duplicate skill name(s): $dupname - install flattens all skills into one directory, so these overwrite each other"
else
  ok "all skill names unique"
fi

dupowns="$(awk -F'\t' '$2 != "" { c[$2]++ } END { for (k in c) if (c[k] > 1) print k }' "$MANIFEST" 2>/dev/null)"
if [ -n "$dupowns" ]; then
  fail "two skills claim the same 'owns': $dupowns - overlapping ownership is how routing becomes a guess"
else
  ok "no duplicate ownership"
fi

printf '\n%d skill(s) checked\n' "$found"
if [ "$FAILS" -gt 0 ]; then
  printf '%s%d failure(s)%s, %d warning(s)\n\n' "$C_RED" "$FAILS" "$C_OFF" "$WARNS"; exit 1
fi
printf '%svalid%s - %d warning(s)\n\n' "$C_GRN" "$C_OFF" "$WARNS"
