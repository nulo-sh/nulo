import type { RouteRecordRaw } from "vue-router"

/**
 * Settings URLs that moved, each to a fixed target. The router applies a redirect record before any
 * guard runs, so the target's own `isAuthRequired` decides; a forwarded query cannot change it.
 */
export const LEGACY_SETTINGS_REDIRECTS: readonly RouteRecordRaw[] = [
	{ path: "/popup/settings/security", redirect: "/popup/settings/lock" },
	{ path: "/popup/settings/appearance", redirect: "/popup/settings/display" },
	{ path: "/popup/settings/advanced", redirect: "/popup/settings/developer" },
]
