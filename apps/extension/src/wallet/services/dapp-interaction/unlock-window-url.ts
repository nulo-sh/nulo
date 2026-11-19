/**
 * The route a locked discovery's window opens on, written by the worker and read by the page. The
 * origin is the content script's top-frame origin, never text the dApp supplies.
 */
const UNLOCK_ROUTE = "#/windows/unlock"

export function unlockWindowHash(origin: string): string {
	return `${UNLOCK_ROUTE}?origin=${encodeURIComponent(origin)}`
}

/** The origin an unlock window's hash names, or `undefined` for another route, a missing origin or
 *  one that is not a serialized origin. */
export function siteOfUnlockWindowHash(hash: string): string | undefined {
	const at = hash.indexOf("?")
	if (at === -1 || hash.slice(0, at) !== UNLOCK_ROUTE) return undefined
	const origin = new URLSearchParams(hash.slice(at + 1)).get("origin")
	if (!origin) return undefined
	try {
		return new URL(origin).origin === origin ? origin : undefined
	} catch {
		return undefined
	}
}
