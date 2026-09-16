#!/usr/bin/env bash
# doctor.sh - report whether the agent-engineering install is actually healthy.
#
# Exits non-zero when something is missing. That exit code is the whole value
# of this script: it is the one part of the install story that can be checked
# without a model, so it is the part that gets trusted.
#
# Warnings do not fail the run. Failures do.

set -uo pipefail

AE_SELF="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
. "$AE_SELF/lib.sh"

AE_KIT_ROOT="$(cd -P "$AE_SELF/.." && pwd)"

# Accepts the project root positionally or as --root DIR, so it matches
# scaffold.sh rather than failing on the flag a user reasonably expects.
if [ "${1:-}" = "--root" ]; then
  ROOT="${2:-}"
  [ -n "$ROOT" ] || { printf 'missing directory after --root\n' >&2; exit 2; }
else
  ROOT="${1:-}"
fi
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
printf 'kit:     %s\n' "$AE_KIT_ROOT"

# ------------------------------------------------------------- .dev/ --------
# Severity splits on lifecycle. knowledge/ and rules/ are the committed record
# and their absence means init has not run, or its output was lost. context/
# holds only regenerable analysis, so a missing one is a note.

ae_head "directories"
missing_durable=""
for d in knowledge rules; do
  [ -d "$ROOT/.dev/$d" ] || missing_durable="$missing_durable .dev/$d"
done

if [ -n "$missing_durable" ]; then
  fail "missing committed directories:$missing_durable - re-run ae-init"
else
  ae_ok ".dev/knowledge and .dev/rules present (the committed record)"
fi
if [ -d "$ROOT/.dev/context" ]; then
  ae_ok ".dev/context present"
else
  warn "missing .dev/context - regenerable by design; re-run ae-init to recreate"
fi

# ---------------------------------------------------------- artifacts -------
# The directories existing proves scaffold ran. These prove init finished.

ae_head "artifacts"
if [ -s "$ROOT/.dev/knowledge/00-index.md" ]; then
  n="$(find "$ROOT/.dev/knowledge" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
  ae_ok "knowledge base present ($n document(s))"
  todo="$(grep -rl 'TODO (judgment)' "$ROOT/.dev/knowledge" 2>/dev/null | wc -l | tr -d ' ')"
  [ "$todo" != "0" ] && warn "$todo knowledge document(s) still have unanswered judgment slots"
else
  warn "no knowledge base yet - run ae-init stages 2 and 3"
fi
if [ -s "$ROOT/.dev/rules/00-index.md" ]; then
  ae_ok "rules index present"
else
  warn "no rules yet - run ae-init stage 4"
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
    fail "$disp detected but $ifile has no agent-engineering block - re-run ae-init"
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
  fail ".gitignore missing - the suite and the analysis dump would be committed"
else
  miss=""
  for e in "**/skills/ae-*/"; do
    grep -qF "$e" "$GI" || miss="$miss $e"
  done
  if [ -n "$miss" ]; then
    fail ".gitignore is missing suite entries:$miss - re-run ae-init"
  else
    ae_ok ".gitignore excludes the installed suite"
  fi
  if grep -qF ".dev/context/" "$GI"; then
    ae_ok ".gitignore excludes the regenerable analysis"
  else
    fail ".gitignore does not exclude .dev/context/ - analysis.json would be committed"
  fi
  # knowledge/ and rules/ are the deliverable. If a future edit ever ignores
  # them the suite silently stops being useful to anyone but this machine.
  for e in ".dev/knowledge" ".dev/rules"; do
    grep -qE "^${e}" "$GI" && fail "$e is gitignored, but it is the committed record this tool exists to produce"
  done
fi

# The suite is a dependency. If a project committed it under an earlier install
# (or before these ignore rules existed), the ignore rules alone will not undo
# that: git keeps tracking a file it already knows about. Say so, with the fix.
if (cd "$ROOT" && git rev-parse --git-dir >/dev/null 2>&1); then
  tracked="$(cd "$ROOT" && git ls-files 2>/dev/null | grep -E '(^|/)skills/ae-[^/]+/' | head -1)"
  if [ -n "$tracked" ]; then
    warn "the suite is still tracked by git (e.g. $tracked). Ignore rules do not untrack existing files; remove the reported installed copies from the git index."
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

# ------------------------------------------------------- line endings -------

ae_head "line endings"
crlf=0
for f in "$AE_SELF"/*.sh; do
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
