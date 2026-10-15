#!/usr/bin/env bash
# Regenerates cli/package.json and cli/package-lock.json, the npm tree install.sh installs with
# `npm ci`, for one Aztec version: `.github/actions/setup-aztec/lock.sh <aztec version>`.
# Run it on every Aztec bump and review the lockfile diff like any dependency change.
set -euo pipefail

VERSION="${1:?usage: lock.sh <aztec version>}"
CLI_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/cli"

at_least() {
	[ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}
NPM_HAVE=$(npm --version)
if ! at_least "$NPM_HAVE" 11.17.0; then
	echo "npm $NPM_HAVE predates min-release-age-exclude (11.17.0), which this resolve's age gate needs." >&2
	exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cat > "$WORK/package.json" <<JSON
{
  "name": "aztec-cli",
  "private": true,
  "dependencies": {
    "@aztec-labs/aztec": "$VERSION",
    "@aztec-labs/cli-wallet": "$VERSION"
  }
}
JSON

# The same 7-day gate as bunfig.toml, with the Aztec scopes exempt as they are there; the registry
# is named so a user-level mirror cannot write its URLs into the committed lockfile.
(
	cd "$WORK"
	npm_config_registry=https://registry.npmjs.org/ \
		npm_config_min_release_age=7 \
		npm_config_min_release_age_exclude=$'@aztec-labs/*\n\n@aztec-foundation/*' \
		npm install --package-lock-only --ignore-scripts --no-audit --no-fund
)

mkdir -p "$CLI_DIR"
cp "$WORK/package.json" "$WORK/package-lock.json" "$CLI_DIR/"
echo "Locked $(grep -c '"resolved":' "$CLI_DIR/package-lock.json") packages for Aztec $VERSION in $CLI_DIR."
