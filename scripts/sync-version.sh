#!/usr/bin/env bash
# Propagate the version in VERSION to everywhere else it has to appear.
# VERSION is the single source of truth; run this after bumping it.
set -euo pipefail
cd "$(dirname "$0")/.."
V="$(tr -d ' \n\r' < VERSION)"
[ -n "$V" ] || { echo "VERSION is empty" >&2; exit 1; }
printf '%s\n' "$V" > skills/ae-setup/scripts/kit-version.txt
tmp="$(mktemp)"
sed "s/\"version\": \"[^\"]*\"/\"version\": \"$V\"/" package.json > "$tmp" && mv "$tmp" package.json
echo "synced to $V: package.json, skills/ae-setup/scripts/kit-version.txt"
