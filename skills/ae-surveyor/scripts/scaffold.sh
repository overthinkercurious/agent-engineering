#!/usr/bin/env bash
# scaffold.sh - prepare a project to hold the generated knowledge artifacts.
#
# Stage 1 of ae-surveyor. Deterministic by design: there is no model judgment
# anywhere in this file, which is the point. The parts of a workflow system
# that can be checked by an exit code should never be left to a prompt.
#
# Everything is create-if-absent or write-between-markers, so running it twice
# changes nothing. Run with --dry-run to see the plan without touching disk.

set -euo pipefail

AE_SELF="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
. "$AE_SELF/lib.sh"

AE_KIT_ROOT="$(cd -P "$AE_SELF/.." && pwd)"
AE_KIT_REPO="overthinkercurious/agent-engineering"
export AE_KIT_REPO

DRY=0
ROOT=""

usage() {
  cat <<'USAGE'
Usage: scaffold.sh [--dry-run] [--root DIR]

  --dry-run   Print what would change and exit 0 without writing anything.
  --root DIR  Install into DIR instead of the detected project root.
  -h, --help  This message.

Creates .dev/{context,knowledge,rules}, writes a pointer block into the
instruction file of every detected tool, and configures .gitignore.
Never writes outside the project root.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --root)    ROOT="${2:-}"; [ -n "$ROOT" ] || ae_die "--root needs a directory"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) ae_die "unknown argument: $1 (try --help)" ;;
  esac
done

# ------------------------------------------------------ preconditions -------

if [ -n "$ROOT" ]; then
  [ -d "$ROOT" ] || ae_die "--root is not a directory: $ROOT"
  ROOT="$(cd -P "$ROOT" && pwd)"
else
  ROOT="$(ae_project_root)"
fi

TARGETS_YML="$AE_KIT_ROOT/references/targets.yml"
ASSETS="$AE_KIT_ROOT/assets"
[ -f "$TARGETS_YML" ] || ae_die "missing references/targets.yml next to the scripts (looked in $AE_KIT_ROOT)"
[ -d "$ASSETS" ]      || ae_die "missing assets/ next to the scripts (looked in $AE_KIT_ROOT)"

TSV="$(mktemp "${TMPDIR:-/tmp}/ae-targets.XXXXXX")"
BODY="$(mktemp "${TMPDIR:-/tmp}/ae-body.XXXXXX")"
SUMMARY="$(mktemp "${TMPDIR:-/tmp}/ae-sum.XXXXXX")"
trap 'rm -f "$TSV" "$BODY" "$SUMMARY"' EXIT
ae_targets_tsv "$TARGETS_YML" > "$TSV"
[ -s "$TSV" ] || ae_die "targets.yml parsed to nothing - check its indentation"
note() { printf '%s\t%s\n' "$1" "$2" >> "$SUMMARY"; }

printf '\nagent-engineering\n'
printf 'project: %s\n' "$ROOT"
[ "$DRY" = "1" ] && printf '%sdry run - nothing will be written%s\n' "$AE_C_YEL" "$AE_C_OFF"

if ! (cd "$ROOT" && git rev-parse --git-dir >/dev/null 2>&1); then
  ae_warn "not a git repository - the knowledge base only means something when it is committed, and churn ranking needs history"
fi

# ------------------------------------------------------------ .dev/ ---------
# Four directories, each read by something that exists today. Anything a
# future workflow needs gets created when that workflow does; empty
# directories nobody reads are just noise in a diff.

ae_head "directories"
for d in context knowledge rules; do
  target="$ROOT/.dev/$d"
  ae_assert_inside "$ROOT" "$target"
  if [ -d "$target" ]; then
    ae_info ".dev/$d/ exists"; note unchanged ".dev/$d/"
  else
    [ "$DRY" = "1" ] || { mkdir -p "$target"; : > "$target/.gitkeep"; }
    ae_ok ".dev/$d/ created"; note created ".dev/$d/"
  fi
done

# ------------------------------------------------ instruction pointers ------

ae_head "instruction files"
detected_any=0
for id in $(ae_target_ids "$TSV"); do
  ifile="$(ae_target_field "$TSV" "$id" instruction_file)"
  style="$(ae_target_field "$TSV" "$id" pointer_style)"
  detect="$(ae_target_field "$TSV" "$id" detect)"
  always="$(ae_target_field "$TSV" "$id" always)"
  disp="$(ae_target_field "$TSV" "$id" display)"
  conf="$(ae_target_field "$TSV" "$id" confidence)"
  [ -n "$ifile" ] || continue

  if [ "$always" != "true" ] && ! ae_target_detected "$ROOT" "$detect"; then
    ae_info "$disp not detected - skipped"
    continue
  fi
  detected_any=1

  case "$style" in
    import) ae_render "$ASSETS/claude-import.md" > "$BODY" ;;
    block)  ae_render "$ASSETS/pointer-block.md" > "$BODY" ;;
    *)      ae_die "unknown pointer_style '$style' for target '$id'" ;;
  esac

  path="$ROOT/$ifile"
  ae_assert_inside "$ROOT" "$path"
  st="$(ae_write_block "$path" "" "$BODY" "$DRY")"
  case "$st" in
    unchanged) ae_info "$ifile unchanged" ;;
    *)         ae_ok "$ifile $st ($disp)" ;;
  esac
  note "$st" "$ifile"
  [ "$conf" = "low" ] && ae_warn "$disp path confidence is low - verify it before relying on this install"
done

if [ "$detected_any" = "0" ]; then
  ae_warn "no AI tool detected in this project - only AGENTS.md was written"
fi

# ------------------------------------------------------- host table ---------
# No other skill in this kit can read this file's targets.yml - installed
# skills cannot reach each other's directories. Without a channel, a consumer
# has to assume the safest dispatch tier, which silently downgrades every
# isolated review on a host that in fact supports them. Publishing the
# resolved table into the project is a data channel, not a "keep these two
# files in sync" instruction that nothing enforces.
#
# The table lists every known host, not only the detected ones: the consumer
# is the agent that is running, and it knows which tool it is. Its job is to
# look itself up, not to infer itself from what this project happens to
# contain.

ae_head "host capability table"
HOST_JSON="$ROOT/.dev/context/host.json"
ae_assert_inside "$ROOT" "$HOST_JSON"
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
{
  printf '{\n'
  printf '  "generated_by": "ae-surveyor/scripts/scaffold.sh",\n'
  printf '  "default_dispatch": "none",\n'
  printf '  "hosts": {\n'
  first=1
  for id in $(ae_target_ids "$TSV"); do
    disp="$(ae_target_field "$TSV" "$id" display)"
    dsp="$(ae_target_field "$TSV" "$id" dispatch)"
    dver="$(ae_target_field "$TSV" "$id" dispatch_verified)"
    ifile="$(ae_target_field "$TSV" "$id" instruction_file)"
    detect="$(ae_target_field "$TSV" "$id" detect)"
    [ -n "$dsp" ] || dsp="none"
    if ae_target_detected "$ROOT" "$detect"; then det="true"; else det="false"; fi
    [ "$first" = "1" ] || printf ',\n'
    first=0
    printf '    "%s": { "display": "%s", "dispatch": "%s", "dispatch_verified": "%s", "instruction_file": "%s", "detected_in_project": %s }' \
      "$(esc "$id")" "$(esc "$disp")" "$(esc "$dsp")" "$(esc "$dver")" "$(esc "$ifile")" "$det"
  done
  printf '\n  }\n}\n'
} > "$BODY"

if [ "$DRY" = "1" ]; then
  ae_info ".dev/context/host.json would be written"
  note unchanged ".dev/context/host.json"
elif [ -f "$HOST_JSON" ] && cmp -s "$BODY" "$HOST_JSON"; then
  ae_info ".dev/context/host.json unchanged"
  note unchanged ".dev/context/host.json"
else
  cp "$BODY" "$HOST_JSON"
  ae_ok ".dev/context/host.json written (dispatch tiers for $(ae_target_ids "$TSV" | wc -l | tr -d ' ') known hosts)"
  note written ".dev/context/host.json"
fi

# ------------------------------------------------------- .gitignore ---------

ae_head ".gitignore"
ae_render "$ASSETS/gitignore.fragment" > "$BODY"
GI="$ROOT/.gitignore"
st="$(ae_write_block "$GI" "# " "$BODY" "$DRY")"
case "$st" in
  unchanged) ae_info ".gitignore unchanged" ;;
  *)         ae_ok ".gitignore $st (suite excluded, analysis excluded)" ;;
esac
note "$st" ".gitignore"

# ---------------------------------------------------------- summary ---------

ae_head "summary"
for s in created written updated unchanged; do
  n="$(awk -F'\t' -v s="$s" '$1==s' "$SUMMARY" | wc -l | tr -d ' ')"
  [ "$n" = "0" ] && continue
  printf '  %-10s %s\n' "$s" "$(awk -F'\t' -v s="$s" '$1==s { printf "%s ", $2 }' "$SUMMARY")"
done

if [ "$DRY" = "1" ]; then
  printf '\n%sdry run complete - no files were written%s\n\n' "$AE_C_YEL" "$AE_C_OFF"
else
  printf '\nNext: analyze the codebase (stage 2)\n\n'
fi
