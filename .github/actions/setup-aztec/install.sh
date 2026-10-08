#!/usr/bin/env bash
# Installs the Aztec toolchain for AZTEC_VERSION into ${AZTEC_HOME:-$HOME/.aztec}/versions/<version>,
# running nothing it fetched without hashing it first. Every download is checked against
# installer-pins.sha256; the pinned upstream installer keeps its layout logic, with its two
# unpinnable steps replaced: Foundry comes from a pinned release tarball instead of foundryup,
# and the npm tree comes from the committed cli/ lockfile with install scripts off.
set -euo pipefail

: "${AZTEC_VERSION:?set AZTEC_VERSION to the @aztec-labs/aztec.js version in apps/extension/package.json}"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PINS="$HERE/installer-pins.sha256"
CLI_DIR="$HERE/cli"
# Packages whose install script must run, after `npm ci --ignore-scripts`. A package joins only
# when the toolchain is shown to fail without its script, and only once that script is read.
# bcrypto: `@aztec-labs/aztec-node` cannot load without its binding, and its script is a local
# `node-gyp rebuild` of the bundled C sources (its gyp file runs only compiler probes).
REBUILD=(bcrypto)

fail() {
	echo "::error::$1" >&2
	exit 1
}

if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
	fail "setup-aztec pins only Linux x86_64 downloads; this is $(uname -s) $(uname -m)."
fi
for pkg in @aztec-labs/aztec @aztec-labs/cli-wallet; do
	if ! grep -Fq "\"$pkg\": \"$AZTEC_VERSION\"" "$CLI_DIR/package.json"; then
		fail "cli/package.json does not pin $pkg at $AZTEC_VERSION: run .github/actions/setup-aztec/lock.sh $AZTEC_VERSION."
	fi
done

WORK=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aztec-install.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

pin_for() {
	PIN=$(awk -v path="$1" '$2 == path { print $1 }' "$PINS")
	if ! [[ "$PIN" =~ ^[0-9a-f]{64}$ ]]; then
		fail "setup-aztec has no single SHA-256 pin for '$1' in .github/actions/setup-aztec/installer-pins.sha256. Re-pin for Aztec $AZTEC_VERSION (aztec-update skill, the pin surface)."
	fi
}

fetch() {
	local path="$1" url="$2" actual
	pin_for "$path"
	mkdir -p "$(dirname "$WORK/$path")"
	curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 -o "$WORK/$path" "$url"
	actual=$(sha256sum "$WORK/$path" | cut -d' ' -f1)
	if [ "$actual" != "$PIN" ]; then
		fail "$url hashes to $actual, not its pin $PIN ('$path'). Upstream changed a pinned file: read the new bytes before re-pinning."
	fi
	echo "Verified $path: $actual"
}

at_least() {
	[ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

manifest_version() {
	awk -v tool="$1:" '$1 == tool { print $2 }' "$WORK/$AZTEC_VERSION/versions"
}

fetch "$AZTEC_VERSION/install" "https://install.aztec-labs.com/$AZTEC_VERSION/install"
fetch "$AZTEC_VERSION/versions" "https://install.aztec-labs.com/$AZTEC_VERSION/versions"
NOIR_VERSION=$(manifest_version noir)
FOUNDRY_VERSION=$(manifest_version foundry)
NODE_MIN=$(manifest_version node)
if [ -z "$NOIR_VERSION" ] || [ -z "$FOUNDRY_VERSION" ] || [ -z "$NODE_MIN" ]; then
	fail "the pinned versions manifest of Aztec $AZTEC_VERSION lacks a noir, foundry or node version."
fi

# Below its Node minimum the installer would install one through nvm, unpinned.
NODE_HAVE=$(node --version | sed 's/^v//')
if ! at_least "$NODE_HAVE" "$NODE_MIN"; then
	fail "Node $NODE_HAVE is below the $NODE_MIN that Aztec $AZTEC_VERSION's installer requires: raise setup-node's version."
fi

NOIR_ASSET=noir-x86_64-unknown-linux-gnu.tar.gz
fetch "noir/$NOIR_VERSION/$NOIR_ASSET" \
	"https://github.com/noir-lang/noir/releases/download/v$NOIR_VERSION/$NOIR_ASSET"
mkdir "$WORK/noir-bin"
tar -xzf "$WORK/noir/$NOIR_VERSION/$NOIR_ASSET" -C "$WORK/noir-bin" ./nargo ./noir-profiler

FOUNDRY_TOOLS="anvil cast chisel forge"
FOUNDRY_ASSET="foundry_v${FOUNDRY_VERSION}_linux_amd64.tar.gz"
fetch "foundry/$FOUNDRY_VERSION/$FOUNDRY_ASSET" \
	"https://github.com/foundry-rs/foundry/releases/download/v$FOUNDRY_VERSION/$FOUNDRY_ASSET"
# Exactly the four tools, each a regular file (`-`): a link, a duplicate or an extra entry could
# plant a file or redirect a hashed path.
tar -tvzf "$WORK/foundry/$FOUNDRY_VERSION/$FOUNDRY_ASSET" > "$WORK/foundry-members.txt"
if [ "$(awk '{ print substr($1, 1, 1), $NF }' "$WORK/foundry-members.txt" | sort | tr '\n' ' ')" \
	!= "- anvil - cast - chisel - forge " ]; then
	cat "$WORK/foundry-members.txt" >&2
	fail "the Foundry tarball must hold exactly the regular files $FOUNDRY_TOOLS."
fi
mkdir "$WORK/foundry-bin"
# shellcheck disable=SC2086 # the four names are fixed words.
tar -xzf "$WORK/foundry/$FOUNDRY_VERSION/$FOUNDRY_ASSET" -C "$WORK/foundry-bin" $FOUNDRY_TOOLS

# The installer's whole body is one `{ … main "$@"; exit }` block. Dropping those two lines turns
# it into function definitions; each must match exactly once, so a reshaped installer fails here.
INSTALLER="$WORK/$AZTEC_VERSION/install"
for line in 'main "$@"' 'exit'; do
	if [ "$(grep -Fxc "$line" "$INSTALLER")" != 1 ]; then
		fail "the pinned installer no longer has exactly one '$line' line; re-read it before re-pinning."
	fi
done
grep -Fxv -e 'main "$@"' -e 'exit' "$INSTALLER" > "$WORK/installer-functions.sh"

# shellcheck disable=SC2154 # version_path and version_internal_bin_path come from the installer.
(
	export CI=1 VERBOSE=1
	export INSTALL_URI="file://$WORK" NARGO="$WORK/noir-bin/nargo"
	# shellcheck source=/dev/null
	source "$WORK/installer-functions.sh"
	[ "$VERSION" = "$AZTEC_VERSION" ] || fail "the installer pinned for $AZTEC_VERSION installs $VERSION."
	declare -F install_foundry install_aztec_packages main > /dev/null ||
		fail "the pinned installer no longer defines install_foundry, install_aztec_packages and main."

	# The installer runs these in `retry`/`dump_fail` subshells, which inherit the overrides but
	# turn errexit off: each body sets it again, as upstream's do, or a failed step would pass.
	# shellcheck disable=SC2329 # invoked by the installer's main.
	install_foundry() {
		set -euo pipefail
		local tool
		for tool in $FOUNDRY_TOOLS; do
			rm -f "$version_internal_bin_path/$tool"
			cp -p "$WORK/foundry-bin/$tool" "$version_internal_bin_path/$tool"
		done
	}
	# shellcheck disable=SC2329 # invoked by the installer's main.
	install_aztec_packages() {
		set -euo pipefail
		local pkg node_prefix
		node_prefix="$(dirname "$(dirname "$(command -v node)")")"
		cp "$CLI_DIR/package.json" "$CLI_DIR/package-lock.json" "$version_path/"
		npm ci --prefix "$version_path" --ignore-scripts --no-audit --no-fund
		# node-gyp reads npm_config_nodedir itself: headers come from the running Node, not a download.
		for pkg in "${REBUILD[@]}"; do
			npm_config_nodedir="$node_prefix" npm rebuild "$pkg" --prefix "$version_path"
		done
	}

	main
)
ls -la "${AZTEC_HOME:-$HOME/.aztec}/versions/$AZTEC_VERSION/bin/"
