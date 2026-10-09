#!/usr/bin/env bash
# Run the e2e network suite inside an Ubuntu 24.04 container that mirrors
# our GitHub Actions runner. Lets us iterate on `connectPlayground:awaitVerifyPopup`
# (and similar timing cliffs) without paying the 15-30min CI roundtrip.
#
# Usage (from the host):
#   docker run --rm -it --platform=linux/amd64 \
#     --cpus=4 --memory=12g --shm-size=2g \
#     -v "$PWD":/work -w /work \
#     -v nulo-bun-cache:/root/.bun/install/cache \
#     -v nulo-aztec:/root/.aztec \
#     ubuntu:24.04 \
#     bash -lc './apps/extension/scripts/e2e/docker-ci-like.sh 5/5'
#
# `--cpus` + `--memory` constraints are deliberately tight to approximate the
# GitHub-hosted ubuntu-latest runner profile (4 vCPU, 16GB; we leave 4GB headroom
# for the macOS host's hypervisor). `--shm-size` matters for Chrome (default 64MB
# is way too small for headless puppeteer + multiple tabs).
#
# Named volumes:
#   nulo-bun-cache    — preserves bun's npm cache across runs (~few minutes saved)
#   nulo-aztec        — preserves aztec CLI install (~5 minutes saved)
#
# Arg 1: vitest --shard expression (e.g. "5/5"). Default "5/5" (the shard that
#        hits the connectPlayground:awaitVerifyPopup failure deterministically).

set -euo pipefail

SHARD="${1:-5/5}"

echo "::group::apt deps"
export DEBIAN_FRONTEND=noninteractive
apt-get update >/dev/null
# Core build deps + Chrome runtime deps (matches what puppeteer needs).
apt-get install -y --no-install-recommends \
	curl ca-certificates git jq unzip xz-utils python3 build-essential pkg-config \
	libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2t64 libxshmfence1 \
	libxkbcommon0 libdrm2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
	libpango-1.0-0 libcairo2 libcups2 fonts-liberation \
	>/dev/null
echo "::endgroup::"

echo "::group::bun + node (pinned)"
# The pinned archives are always installed and put first on PATH, so a bun or node already in the
# image never stands in for them. Both are checked against their pin before either is extracted.
if [ "$(uname -m)" != x86_64 ]; then
	echo "::error::docker-ci-like.sh pins only linux x64 Bun and Node: run the container with --platform=linux/amd64 (this is $(uname -m))." >&2
	exit 1
fi
BUN_VERSION=1.4.2
# Aztec's installer requires Node >= 24.12.0.
NODE_VERSION=v24.16.0
PINS="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/docker-ci-like.pins.sha256"
TOOLS=/opt/docker-ci-like
DOWNLOADS=$(mktemp -d)
trap 'rm -rf "$DOWNLOADS"' EXIT

fetch_pinned() {
	local key="$1" url="$2"
	mkdir -p "$DOWNLOADS/$(dirname "$key")"
	curl -fsSL --proto '=https' --proto-redir '=https' --retry 5 --retry-delay 2 --retry-max-time 120 \
		--retry-all-errors -o "$DOWNLOADS/$key" "$url"
	# A key with no pin line gives sha256sum nothing to check, which it reports as a failure.
	(cd "$DOWNLOADS" && awk -v key="$key" '$2 == key' "$PINS" | sha256sum -c --strict)
}

BUN_KEY="bun/$BUN_VERSION/bun-linux-x64.zip"
NODE_KEY="node/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"
fetch_pinned "$BUN_KEY" "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/bun-linux-x64.zip"
fetch_pinned "$NODE_KEY" "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"

rm -rf "$TOOLS"
mkdir -p "$TOOLS/bun/bin" "$TOOLS/node"
unzip -q -j "$DOWNLOADS/$BUN_KEY" bun-linux-x64/bun -d "$TOOLS/bun/bin"
ln -s bun "$TOOLS/bun/bin/bunx"
tar -xJf "$DOWNLOADS/$NODE_KEY" -C "$TOOLS/node" --strip-components=1
# The bun cache volume mounts at $BUN_INSTALL/install/cache.
export BUN_INSTALL=/root/.bun
export PATH="$TOOLS/bun/bin:$TOOLS/node/bin:$PATH"
if [ "$(bun --version)" != "$BUN_VERSION" ] || [ "$(node --version)" != "$NODE_VERSION" ]; then
	echo "::error::the pinned archives did not install Bun $BUN_VERSION and Node $NODE_VERSION." >&2
	exit 1
fi
echo "bun: $(command -v bun) ($(bun --version)); node: $(command -v node) ($(node --version))"
echo "::endgroup::"

echo "::group::bun install"
bun install --frozen-lockfile
echo "::endgroup::"

echo "::group::aztec cli"
AZTEC_VERSION=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('apps/extension/package.json','utf8')).dependencies['@aztec-labs/aztec.js'])")
echo "Aztec version: $AZTEC_VERSION"
echo "node: $(command -v node) ($(node --version))"
# The CI action's install script, keyed like its cache: a volume installed under other pins, an
# older lockfile or an older install.sh, or missing a tool global-setup.ts needs, is reinstalled.
SETUP_AZTEC=.github/actions/setup-aztec
STAMP=$(find "$SETUP_AZTEC" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
AZTEC_VERSION_DIR="/root/.aztec/versions/$AZTEC_VERSION"
TOOLS_PRESENT=1
for tool in node_modules/.bin/aztec bin/aztec-anvil internal-bin/forge internal-bin/anvil; do
	[ -x "$AZTEC_VERSION_DIR/$tool" ] || TOOLS_PRESENT=0
done
if [ "$TOOLS_PRESENT" = 0 ] || [ "$(cat "$AZTEC_VERSION_DIR/.setup-aztec-stamp" 2>/dev/null)" != "$STAMP" ]; then
	echo "::warning::aztec install absent or from other pins at $AZTEC_VERSION_DIR; reinstalling"
	rm -rf "$AZTEC_VERSION_DIR"
	AZTEC_VERSION="$AZTEC_VERSION" bash "$SETUP_AZTEC/install.sh"
	echo "$STAMP" > "$AZTEC_VERSION_DIR/.setup-aztec-stamp"
fi
ln -sfn "$AZTEC_VERSION_DIR" /root/.aztec/current
export PATH="/root/.aztec/current/bin:/root/.aztec/current/node_modules/.bin:$PATH"
echo "::endgroup::"

echo "::group::env"
export NULO_E2E_WALLET_PROBE=1
env | grep -E 'NULO_E2E|AZTEC_|VITE_' | sort
echo "::endgroup::"

# A path-looking arg targets specific test FILE(s) (mirrors the CI heavy
# jobs, e.g. fee-methods); an N/M arg is a vitest shard expression.
if [[ "$SHARD" == *.test.ts ]]; then
	echo "::group::e2e:agent $SHARD"
	bun run e2e:agent "$SHARD"
else
	echo "::group::e2e:agent --shard=$SHARD"
	bun run e2e:agent --shard="$SHARD"
fi
echo "::endgroup::"
