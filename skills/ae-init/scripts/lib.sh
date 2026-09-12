#!/usr/bin/env bash
# lib.sh - shared helpers for the agent-engineering kit.
# Sourced by scaffold.sh and doctor.sh. Never run directly.
#
# Portability contract, because these scripts run on whatever machine the
# operator happens to have:
#   * bash 3.2 (macOS still ships it) - no associative arrays, no mapfile
#   * no `sed -i`  - GNU and BSD disagree on whether it takes a suffix
#   * no `yq`/`jq` - a kit that needs installing before it installs is broken
#   * POSIX awk only - no gawk 3-argument match()

AE_MARK_START='<!-- agent-engineering:start -->'
AE_MARK_END='<!-- agent-engineering:end -->'

# ---------------------------------------------------------------- output ----

AE_C_RED=''; AE_C_YEL=''; AE_C_GRN=''; AE_C_DIM=''; AE_C_OFF=''
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  AE_C_RED=$'\033[31m'; AE_C_YEL=$'\033[33m'; AE_C_GRN=$'\033[32m'
  AE_C_DIM=$'\033[2m';  AE_C_OFF=$'\033[0m'
fi

ae_ok()   { printf '%s  ok  %s%s\n'   "$AE_C_GRN" "$AE_C_OFF" "  $*"; }
ae_info() { printf '%s   -  %s%s\n'   "$AE_C_DIM" "$AE_C_OFF" "  $*"; }
ae_warn() { printf '%s warn %s%s\n'   "$AE_C_YEL" "$AE_C_OFF" "  $*"; }
ae_fail() { printf '%s FAIL %s%s\n'   "$AE_C_RED" "$AE_C_OFF" "  $*"; }
ae_head() { printf '\n%s%s%s\n' "$AE_C_DIM" "$*" "$AE_C_OFF"; }

# Hard error: print and exit non-zero. Used for conditions where continuing
# would leave the project half-written.
ae_die() { ae_fail "$*"; exit 1; }

# ------------------------------------------------------------ filesystem ----

# Directory of the script that sourced us, symlink-resolved.
ae_self_dir() {
  local src="${BASH_SOURCE[1]:-$0}" dir
  while [ -L "$src" ]; do
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    case "$src" in /*) ;; *) src="$dir/$src" ;; esac
  done
  cd -P "$(dirname "$src")" && pwd
}

# The project we are installing into. Git root when there is one, otherwise
# the current directory. Never guesses upward past a non-repo.
#
# The cd/pwd round-trip is load-bearing on Windows. Git for Windows reports a
# native path (C:/Users/...) while `pwd` in this shell reports the MSYS form
# (/c/Users/...). Mixing the two makes ae_assert_inside compare unlike strings
# and reject the project's own directories, so every path this kit handles is
# normalised to whatever form the shell itself uses.
ae_project_root() {
  local top
  if top="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$top" ]; then
    (cd -P "$top" 2>/dev/null && pwd) || printf '%s\n' "$top"
  else
    pwd
  fi
}

# Refuse to write anywhere outside the project root. This is the mechanical
# version of the "never write outside the project" rule - a check, not a
# sentence in a prompt.
ae_assert_inside() {
  local root="$1" path="$2" real_parent
  real_parent="$(cd "$(dirname "$path")" 2>/dev/null && pwd)" || return 0
  case "$real_parent/" in
    "$root"/*|"$root"/) return 0 ;;
    *) ae_die "refusing to write outside the project root: $path" ;;
  esac
}

# --------------------------------------------------------- targets.yml ------

# Flatten the two-level `targets:` map into id<TAB>key<TAB>value rows.
# Deliberately strict about shape: two-space indent for ids, four for fields,
# scalar values only. Lists are written as comma-separated scalars so this
# parser stays 20 lines instead of becoming a YAML implementation.
ae_targets_tsv() {
  awk '
    BEGIN { intg = 0; id = "" }
    {
      line = $0
      sub(/[[:space:]]+$/, "", line)
      if (line ~ /^targets:[[:space:]]*$/) { intg = 1; next }
      if (intg && line ~ /^[^[:space:]#]/) { intg = 0 }
      if (!intg) next
      if (line ~ /^[[:space:]]*#/) next
      if (line ~ /^  [A-Za-z0-9_.-]+:[[:space:]]*$/) {
        s = line; sub(/^  /, "", s); sub(/:[[:space:]]*$/, "", s); id = s; next
      }
      if (id != "" && line ~ /^    [A-Za-z0-9_]+:[[:space:]]*..*/) {
        s = line; sub(/^    /, "", s)
        p = index(s, ":")
        k = substr(s, 1, p - 1)
        v = substr(s, p + 1)
        sub(/^[[:space:]]+/, "", v); sub(/[[:space:]]+$/, "", v)
        gsub(/^"/, "", v); gsub(/"$/, "", v)
        printf "%s\t%s\t%s\n", id, k, v
      }
    }
  ' "$1"
}

ae_target_ids()   { awk -F'\t' '{ if (!seen[$1]++) print $1 }' "$1"; }
ae_target_field() { awk -F'\t' -v i="$2" -v k="$3" '$1==i && $2==k { print $3; exit }' "$1"; }

# A target counts as present when any of its detect paths exists in the
# project. Detection is filesystem evidence rather than an env var, because
# these scripts run from wherever the skill was installed, long after whatever
# set that variable is gone.
ae_target_detected() {
  local root="$1" detect="$2" p old_ifs
  [ -n "$detect" ] || return 1
  old_ifs="$IFS"; IFS=','
  for p in $detect; do
    p="$(printf '%s' "$p" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -n "$p" ] || continue
    if [ -e "$root/$p" ]; then IFS="$old_ifs"; return 0; fi
  done
  IFS="$old_ifs"; return 1
}

# ------------------------------------------------------- managed blocks -----

# Write BODY between markers in FILE, touching nothing outside them.
#   $1 file  $2 comment prefix ('' for markdown, '# ' for .gitignore)
#   $3 body file  $4 dry-run flag (1/0)
# Echoes one of: created | updated | unchanged
# Exits non-zero when the file has a start marker but no end marker, because
# guessing where a truncated block ends is how user content gets eaten.
ae_write_block() {
  local file="$1" pfx="$2" body="$3" dry="$4"
  local start="${pfx}${AE_MARK_START}" end="${pfx}${AE_MARK_END}"
  local tmp status
  tmp="$(mktemp "${TMPDIR:-/tmp}/ae.XXXXXX")" || return 1

  if [ ! -f "$file" ]; then
    { printf '%s\n' "$start"; cat "$body"; printf '%s\n' "$end"; } > "$tmp"
    status=created
  elif grep -qF "$start" "$file"; then
    grep -qF "$end" "$file" || {
      rm -f "$tmp"
      ae_die "$file has an agent-engineering start marker but no end marker. Fix it by hand; this script will not guess where the block ends."
    }
    awk -v s="$start" -v e="$end" -v bf="$body" '
      index($0, s) == 1 && !done {
        print
        while ((getline l < bf) > 0) print l
        close(bf); skip = 1; next
      }
      skip && index($0, e) == 1 { print; skip = 0; done = 1; next }
      skip { next }
      { print }
    ' "$file" > "$tmp"
    status=updated
  else
    { cat "$file"
      [ -s "$file" ] && [ -n "$(tail -c 1 "$file")" ] && printf '\n'
      printf '\n%s\n' "$start"; cat "$body"; printf '%s\n' "$end"
    } > "$tmp"
    status=updated
  fi

  if [ -f "$file" ] && cmp -s "$tmp" "$file"; then
    rm -f "$tmp"; printf 'unchanged\n'; return 0
  fi
  if [ "$dry" = "1" ]; then rm -f "$tmp"; printf '%s\n' "$status"; return 0; fi
  mkdir -p "$(dirname "$file")"
  mv "$tmp" "$file"
  printf '%s\n' "$status"
}

ae_block_present() { [ -f "$1" ] && grep -qF "$AE_MARK_START" "$1"; }

# Substitute the handful of placeholders templates are allowed to use.
ae_render() {
  sed -e "s|__KIT_REPO__|${AE_KIT_REPO:-overthinkercurious/agent-engineering}|g" "$1"
}
