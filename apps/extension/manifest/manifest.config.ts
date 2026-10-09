// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ManifestV3Export } from "@crxjs/vite-plugin"
import packageJson from "../package.json"

const { version, name, description, displayName } = packageJson

// Map the package.json semver onto Chrome's 4-int manifest version. Strip every
// non-digit, non-dot character (e.g. "1.2.3-rc.1" → "1.2.3.1") and split on
// "." only. Anything beyond four parts is discarded; missing parts default to 0,
// so stable, rc and beta versions all produce Chrome-installable strings. The
// original `version` is preserved in `version_name` below for the UI string
// Chrome shows users.
const [major = "0", minor = "0", patch = "0", label = "0"] = version.replace(/[^\d.]+/g, "").split(".")

export default {
	name: displayName || name,
	description,
	version: `${major}.${minor}.${patch}.${label}`,
	version_name: version,
	manifest_version: 3,
	// Presto: HTTPS is the proving transport; plain HTTP carries only the witness-free health
	// diagnostic and the headless CI server. Holding both keeps extension pages out of Chrome's
	// local-network-access prompt.
	host_permissions: ["https://passkey.nulo.sh/", "https://127.0.0.1/*", "http://127.0.0.1/*"],
	action: {
		default_popup: "src/popup/index.html#/popup/general",
	},
	background: {
		service_worker: "src/wallet/index.ts",
		type: "module",
	},
	side_panel: {
		default_path: "src/popup/index.html",
	},
	content_scripts: [
		{
			all_frames: true,
			js: ["src/content-script/content.ts"],
			matches: ["*://*/*"],
			// The passkey Relying Party host and its descendants must carry no script at all,
			// the wallet's own included: any script there could run the PRF ceremony.
			exclude_matches: ["*://passkey.nulo.sh/*", "*://*.passkey.nulo.sh/*"],
			run_at: "document_start",
		},
	],
	permissions: ["alarms", "offscreen", "storage", "sidePanel", "unlimitedStorage", "downloads"],
	content_security_policy: {
		extension_pages: [
			"default-src 'self'",
			"script-src 'self' 'wasm-unsafe-eval'",
			"img-src 'self' data: blob:",
			// Every node URL the network form accepts: any HTTPS host, and plain HTTP on localhost,
			// 127.0.0.1 and [::1]. Both browsers ignore an `http://[::1]:*` source, so plain HTTP is
			// allowed by scheme, and `rpcTransportVerdict` (the form and the node factory) is what
			// refuses a remote one. Firefox checks `downloads.download` of a blob URL against this.
			"connect-src 'self' blob: https: http:",
			// CodeMirror (the logs and JSON viewers) generates its theme into a `<style>` element and
			// rewrites it as themes mount, so no hash can name it; a hash would also switch
			// 'unsafe-inline' off for the Presto banner's inline stylesheet.
			"style-src 'self' 'unsafe-inline'",
		].join("; "),
	},
	cross_origin_embedder_policy: {
		value: "require-corp",
	},
	cross_origin_opener_policy: {
		value: "same-origin",
	},
	// Generated from src/assets/logo.png by scripts/store-icons.ts; `--check` fails on drift.
	icons: {
		16: "src/assets/icons/16.png",
		32: "src/assets/icons/32.png",
		48: "src/assets/icons/48.png",
		96: "src/assets/icons/96.png",
		128: "src/assets/icons/128.png",
	},
} as ManifestV3Export
