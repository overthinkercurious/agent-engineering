#!/usr/bin/env bash
# doctor.sh - report whether the agent-engineering install is actually healthy.
#
# Exits non-zero when something is missing or stale. That exit code is the
# whole value of this script: it is the one part of the install story that can
# be checked without a model, so it is the part that gets trusted.
#
# Warnings do not fail the run. Failures do.

set -uo pipefail

AE_SELF="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
. "$AE_SELF/lib.sh"

AE_KIT_ROOT="$(cd -P "$AE_SELF/.." && pwd)"
INSTALLED_VERSION="$(cat "$AE_SELF/kit-version.txt" 2>/dev/null || echo unknown)"

ROOT="${1:-}"
if [ -n "$ROOT" ]; then
  [ -d "$ROOT" ] || { printf 'not a directory: %s\n' "$ROOT" >&2; exit 2; }
  ROOT="$(cd -P "$ROOT" && pwd)"
else
  ROOT="$(ae_project_root)"
fi

TARGETS_YML="$AE_KIT_ROOT/references/targets.yml"
[ -f "$TARGETS_YML" ] || { printf 'missing references/targets.yml beside the scripts\n' >&2; exit 2; }

TSV="$(mktemp "${TMPDIR:-/tmp}/ae-doc.XXXXXX")"
trap 'rm -f "$TSV"' EXIT
ae_targets_tsv "$TARGETS_YML" > "$TSV"

FAILS=0
WARNS=0
fail() { ae_fail "$*"; FAILS=$((FAILS + 1)); }
warn() { ae_warn "$*"; WARNS=$((WARNS + 1)); }

printf '\nagent-engineering doctor\n'
printf 'project: %s\n' "$ROOT"
printf 'kit:     v%s (running from %s)\n' "$INSTALLED_VERSION" "$AE_SELF"

# ------------------------------------------------------------- .dev/ --------

ae_head "runtime directories"
# Severity splits on lifecycle, not on tidiness. tasks/, decisions/, knowledge/
# and rules/ are the durable record and are committed, so their absence means
# something was lost. scratch/, context/ and evidence/ hold nothing that
# survives by design, so a missing one is a note: setup recreates it for free.
missing_durable=""
for d in tasks decisions knowledge rules; do
  [ -d "$ROOT/.dev/$d" ] || missing_durable="$missing_durable .dev/$d"
done
missing_work=""
for d in context scratch evidence; do
  [ -d "$ROOT/.dev/$d" ] || missing_work="$missing_work .dev/$d"
done

if [ -n "$missing_durable" ]; then
  fail "missing committed directories:$missing_durable - these hold the durable record; re-run setup"
else
  ae_ok ".dev/tasks, .dev/decisions, .dev/knowledge and .dev/rules present (the committed record)"
fi
if [ -n "$missing_work" ]; then
  warn "missing working directories:$missing_work - disposable by design; re-run setup to recreate"
else
  ae_ok ".dev/scratch, .dev/context and .dev/evidence present"
fi

if [ -d "$ROOT/.dev/kit/scripts" ]; then
  ae_ok ".dev/kit/scripts present"
else
  fail ".dev/kit/scripts missing - the pointer block tells operators to run doctor from there"
fi

# -------------------------------------------------- ENGINEERING.md ----------

ae_head "ENGINEERING.md"
ENG="$ROOT/ENGINEERING.md"
if [ ! -f "$ENG" ]; then
  fail "ENGINEERING.md missing - re-run setup"
else
  fm="$(awk 'NR==1 && $0=="---" { inb=1; next } inb && $0=="---" { exit } inb { print }' "$ENG")"
  if [ -z "$fm" ]; then
    fail "ENGINEERING.md has no YAML frontmatter - the structure gate reads its keys from there"
  else
    miss=""
    for k in operator_mode kit_version allowed_root_files scratch_retention_days; do
      printf '%s\n' "$fm" | grep -q "^${k}:" || miss="$miss $k"
    done
    if [ -n "$miss" ]; then
      fail "ENGINEERING.md frontmatter is missing required key(s):$miss"
    else
      mode="$(printf '%s\n' "$fm" | awk -F': *' '/^operator_mode:/ { print $2; exit }' | awk '{ print $1 }')"
      ae_ok "ENGINEERING.md parseable (operator_mode: ${mode:-unset})"
    fi
  fi
fi

# ------------------------------------------------- instruction files --------

ae_head "instruction files"
for id in $(ae_target_ids "$TSV"); do
  ifile="$(ae_target_field "$TSV" "$id" instruction_file)"
  detect="$(ae_target_field "$TSV" "$id" detect)"
  always="$(ae_target_field "$TSV" "$id" always)"
  disp="$(ae_target_field "$TSV" "$id" display)"
  conf="$(ae_target_field "$TSV" "$id" confidence)"
  skdir="$(ae_target_field "$TSV" "$id" skills_dir)"
  [ -n "$ifile" ] || continue

  if [ "$always" != "true" ] && ! ae_target_detected "$ROOT" "$detect"; then
    continue
  fi

  if ae_block_present "$ROOT/$ifile"; then
    ae_ok "$ifile has the managed block ($disp)"
  else
    fail "$disp detected but $ifile has no agent-engineering block - re-run setup"
  fi

  # Skills present where this tool looks for them?
  sd="$ROOT/$skdir"
  if [ -d "$sd" ]; then
    n="$(find "$sd" -maxdepth 2 -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$n" = "0" ]; then
      fail "$disp reads $skdir/ but no SKILL.md is there - run: npx skills add ${AE_KIT_REPO:-overthinkercurious/agent-engineering} --copy"
    else
      ae_ok "$skdir/ has $n skill(s)"
    fi
    # The Windows failure mode: a committed symlink clones back as a text stub.
    for stub in "$sd"/*; do
      [ -e "$stub" ] || continue
      if [ -f "$stub" ] && [ "$(wc -c < "$stub" | tr -d ' ')" -lt 400 ] && grep -qE '^\.{0,2}/?[A-Za-z0-9_./-]+$' "$stub" 2>/dev/null; then
        fail "$stub looks like a broken symlink stub, not a skill directory. This happens when symlinked skills are committed and cloned on Windows. Re-install with: npx skills add ... --copy"
      fi
    done
  else
    warn "$disp reads $skdir/ but that directory does not exist here"
  fi

  [ "$conf" = "low" ] && warn "$disp path confidence is 'low' in targets.yml - it was not verified against that tool's docs"
done

# -------------------------------------------------------- .gitignore --------

ae_head ".gitignore"
GI="$ROOT/.gitignore"
if [ ! -f "$GI" ]; then
  fail ".gitignore missing - the suite and every working zone would be committed"
else
  miss=""
  for e in ".claude/skills/ae-*/" ".agents/skills/ae-*/" ".dev/kit/"; do
    grep -qF "$e" "$GI" || miss="$miss $e"
  done
  if [ -n "$miss" ]; then
    fail ".gitignore is missing suite entries:$miss - re-run setup"
  else
    ae_ok ".gitignore excludes the installed suite (.claude, .agents, .dev/kit)"
  fi

  miss=""
  for e in ".dev/scratch/" ".dev/context/" ".dev/evidence/"; do
    grep -qF "$e" "$GI" || miss="$miss $e"
  done
  if [ -n "$miss" ]; then
    fail ".gitignore is missing working-zone entries:$miss"
  else
    ae_ok ".gitignore covers scratch, context and evidence"
  fi
fi

# The suite is a dependency. If a project committed it under an earlier install
# (or before these ignore rules existed), the ignore rules alone will not undo
# that: git keeps tracking a file it already knows about. Say so, with the fix.
if (cd "$ROOT" && git rev-parse --git-dir >/dev/null 2>&1); then
  tracked="$(cd "$ROOT" && git ls-files '.claude/skills/ae-*' '.agents/skills/ae-*' '.dev/kit' 2>/dev/null | head -1)"
  if [ -n "$tracked" ]; then
    warn "the suite is still tracked by git (e.g. $tracked). Ignore rules do not untrack existing files. Run: git rm -r --cached .claude/skills/ae-* .agents/skills/ae-* .dev/kit"
  else
    ae_ok "the suite is not tracked by git"
  fi
fi

ae_head "dependency manifest"
if [ -f "$ROOT/skills-lock.json" ]; then
  n="$(grep -c '"sourceType"' "$ROOT/skills-lock.json" 2>/dev/null || echo 0)"
  ae_ok "skills-lock.json present ($n skill(s) pinned) - commit this file"
else
  warn "no skills-lock.json - without it there is no record of which suite version this project expects. It is written by 'npx skills add'."
fi

# ------------------------------------------------------- staleness ----------

ae_head "version"
PINNED="$(cat "$ROOT/.dev/kit-version" 2>/dev/null || echo "")"
if [ -z "$PINNED" ]; then
  fail ".dev/kit-version missing - re-run setup"
else
  # The available version is whatever the skills CLI last placed in a skills dir.
  AVAIL=""
  for sd in .agents/skills .claude/skills; do
    f="$(find "$ROOT/$sd" -maxdepth 3 -name kit-version.txt 2>/dev/null | head -1)"
    [ -n "$f" ] && { AVAIL="$(cat "$f")"; break; }
  done
  if [ -z "$AVAIL" ]; then
    ae_info "scaffolded from v$PINNED (no installed skill copy found to compare against)"
  elif [ "$AVAIL" = "$PINNED" ]; then
    ae_ok "v$PINNED, matches the installed skill"
  else
    fail "stale: project scaffolded from v$PINNED, installed skill is v$AVAIL - re-run setup"
  fi
fi

# ------------------------------------------------------- line endings -------

ae_head "line endings"
crlf=0
for f in "$ROOT"/.dev/kit/scripts/*.sh; do
  [ -f "$f" ] || continue
  if head -c 4000 "$f" | grep -q $'\r'; then
    fail "$(basename "$f") has CRLF line endings and will not run. Add '*.sh text eol=lf' to .gitattributes and re-checkout."
    crlf=1
  fi
done
[ "$crlf" = "0" ] && ae_ok "kit scripts are LF"

# ---------------------------------------------------------- verdict ---------

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  printf '%s%d failure(s), %d warning(s)%s\n\n' "$AE_C_RED" "$FAILS" "$WARNS" "$AE_C_OFF"
  exit 1
fi
printf '%shealthy%s - %d warning(s)\n\n' "$AE_C_GRN" "$AE_C_OFF" "$WARNS"
exit 0
