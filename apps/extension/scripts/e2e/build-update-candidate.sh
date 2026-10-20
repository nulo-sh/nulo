#!/usr/bin/env bash
# Builds the wallet as an update candidate for the in-place update scenarios and copies it to
# apps/extension/.e2e-state/update-candidate/<browser>/, the path they read from NULO_E2E_UPDATE_TO.
#
#   bash apps/extension/scripts/e2e/build-update-candidate.sh <chrome|firefox> [suffix]
#
# The build is a production one, as a release is, with `-<suffix>` (default `update.1`) appended to
# the package version the way `_build-extension.yml`'s `version_suffix` does. The suffix's digits make
# the manifest's 4-int `version` greater than the release's, which a browser needs to report the swap
# as an update, and the changed `__VERSION__` makes the integrity coordinator re-derive every account,
# as a real update does. `package.json` is restored on every exit.
set -euo pipefail

BROWSER="${1:-}"
SUFFIX="${2:-update.1}"
case "$BROWSER" in
  chrome | firefox) ;;
  *)
    echo "usage: $0 <chrome|firefox> [suffix]" >&2
    exit 2
    ;;
esac
if [[ ! "$SUFFIX" =~ ^[a-z]+\.[1-9][0-9]*$ ]]; then
  echo "suffix must be <word>.<n> with n >= 1, so the manifest version rises: got '$SUFFIX'" >&2
  exit 2
fi

EXT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="$EXT/package.json"
OUT="$EXT/.e2e-state/update-candidate/$BROWSER"

# A test-only VITE_* flag would ship into the candidate; a release build refuses every one but two.
for name in $(compgen -e); do
  case "$name" in
    VITE_FEE_JUICE_BRIDGE_URL | VITE_NULO_ALLOW_IFRAME_DAPPS) ;;
    VITE_*)
      echo "$name is set: an update candidate is built as a release is, with no test-only VITE_* flag" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$EXT/.e2e-state"
BACKUP="$(mktemp "$EXT/.e2e-state/package.json.XXXXXX")"
cp "$PKG" "$BACKUP"
restore() { cp "$BACKUP" "$PKG" && rm -f "$BACKUP"; }
trap restore EXIT

SUFFIX="$SUFFIX" PKG="$PKG" bun -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync(process.env.PKG, 'utf8'));
  p.version = p.version + '-' + process.env.SUFFIX;
  fs.writeFileSync(process.env.PKG, JSON.stringify(p, null, '\t') + '\n');
  console.log('[update-candidate] version', p.version);
"

(cd "$EXT" && bun run "build:$BROWSER")

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$EXT/dist/$BROWSER/." "$OUT/"
echo "[update-candidate] $BROWSER candidate at $OUT ($(bun -e "console.log(require('$OUT/manifest.json').version)"))"
