import { defineManifest } from "@crxjs/vite-plugin"
import ManifestConfig from "./manifest.config.ts"

// Permissions that don't exist in Firefox MV3:
// - "background": Firefox uses a persistent background page model, not
//   the dedicated MV3 background permission flag.
// - "offscreen": no `chrome.offscreen` API in Firefox MV3. There the PXE
//   page is a frame of the background page instead (`wallet/utils/
//   offscreen.ts`, chosen at runtime via `hasOffscreenApi()`). Including
//   the permission would emit a manifest warning at install time without
//   any benefit.
// - "sidePanel": Chrome-only; AMO's validator rejects it outright
//   ("Invalid permissions"). Every call site is feature-gated on
//   `chrome.sidePanel`. Firefox's counterpart is the `sidebar_action`
//   below, which needs no permission.
const FIREFOX_INCOMPATIBLE_PERMISSIONS = new Set(["background", "offscreen", "sidePanel"])

const { side_panel, icons } = ManifestConfig as { side_panel: { default_path: string }; icons: Record<string, string> }

// @ts-expect-error ManifestConfig provides all required fields
export default defineManifest((_env) => ({
	...ManifestConfig,
	browser_specific_settings: {
		gecko: {
			// Firefox validates the id shape at install (a GUID in braces or an email-shaped
			// string) and rejects the whole add-on as invalid otherwise. It is the add-on's
			// permanent identity on AMO: never change it once a Firefox build has shipped.
			id: "wallet@nulo.sh",
			// Mozilla's taxonomy counts what leaves the add-on: transactions and balance queries go
			// to the configured node, which `financialAndPaymentInfo` names; keys, contacts and
			// connected-app origins stay on the device and are declared nowhere. The Firefox
			// publish runner refuses a build whose declaration differs from this one.
			data_collection_permissions: {
				required: ["financialAndPaymentInfo"],
			},
			// WebAuthn from an extension page — how a passkey profile is created and unlocked —
			// works from Firefox 150. 153 is the floor this wallet is tested against, and it
			// deliberately excludes the 140 ESR line rather than shipping a passkey flow that
			// cannot run there.
			strict_min_version: "153.0",
		},
	},
	// The page Chrome's side panel loads. A step run there is not in a `popup` view, so a passkey
	// ceremony runs in place, where the toolbar panel hands it to a window of its own. Firefox
	// titles the sidebar with the add-on's name, but draws a generic puzzle piece unless given an
	// icon, and opens it only when asked.
	sidebar_action: {
		default_panel: side_panel.default_path,
		default_icon: icons,
		open_at_install: false,
	},
	background: {
		scripts: ["src/wallet/index.ts"],
		type: "module",
		persistent: false,
	},
	// @ts-expect-error
	permissions: ManifestConfig.permissions.filter((permission) => !FIREFOX_INCOMPATIBLE_PERMISSIONS.has(permission)),
	// Firefox merges these with the MV3 host origins into one optional set: the install grant is unchanged.
	optional_host_permissions: ["https://127.0.0.1/*", "http://127.0.0.1/*"],
}))
