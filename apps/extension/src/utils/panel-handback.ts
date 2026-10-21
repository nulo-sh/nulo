/**
 * The hand-back: a hand-off window that ends its flow leaves one record in `chrome.storage.session`
 * for Firefox's toolbar panel, which then opens on the flow's page with the flow's outcome snack. The
 * panel reads the record before its router exists and removes it on its first arrival there, so the
 * next panel the person opens lands there once.
 */
import { closesOnFocusLoss } from "@/utils/browser-surface"
import type { Snack } from "@/utils/snack"

export const HANDBACK_KEY = "nulo:own-window:handback"

const HANDBACK_ROUTES = [
	"/popup/settings/contacts",
	"/popup/settings/accounts",
	"/popup/settings/accounts/import",
	"/popup/general",
	"/popup/restore-again",
] as const
export type HandbackRoute = (typeof HANDBACK_ROUTES)[number]

/** Above the longest label a flow builds: Restore again names up to 64 networks, which the network
 *  form caps at 25 characters each. */
const MAX_LABEL_LENGTH = 2048
const MAX_PROFILE_ID_LENGTH = 128

/** An outcome belongs to the profile of the run that produced it; another profile never sees it. */
export type HandbackSnack = Snack & { profileId: string }

export interface Handback {
	route: HandbackRoute
	snack?: HandbackSnack
}

/** The decoded record, a closed set of routes and a short text: a malformed snack is dropped and
 *  the route kept, a malformed route drops the record. */
export function decodeHandback(raw: unknown): Handback | undefined {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
	const { route, snack } = raw as Record<string, unknown>
	if (!HANDBACK_ROUTES.includes(route as HandbackRoute)) return undefined
	const decoded = decodeSnack(snack)
	return decoded ? { route: route as HandbackRoute, snack: decoded } : { route: route as HandbackRoute }
}

function decodeSnack(raw: unknown): HandbackSnack | undefined {
	if (typeof raw !== "object" || raw === null) return undefined
	const { kind, label, profileId } = raw as Record<string, unknown>
	if (kind !== "success" && kind !== "error") return undefined
	if (typeof label !== "string" || label.length === 0 || label.length > MAX_LABEL_LENGTH) return undefined
	if (typeof profileId !== "string" || profileId.length === 0 || profileId.length > MAX_PROFILE_ID_LENGTH) return undefined
	return { kind, label, profileId }
}

/** Removes the record only while it still holds `raw`: a hand-back written since is the next one. */
export async function removeHandbackIfUnchanged(raw: unknown): Promise<void> {
	const stored: unknown = (await chrome.storage.session.get(HANDBACK_KEY))[HANDBACK_KEY]
	if (JSON.stringify(stored) === JSON.stringify(raw)) await chrome.storage.session.remove(HANDBACK_KEY)
}

let landing: { handback: Handback; raw: unknown } | undefined

/** The route this panel opened for, until it arrives there. */
export function landingRoute(): HandbackRoute | undefined {
	return landing?.handback.route
}

/**
 * Called once at the panel's boot, before the router exists: the route the panel lands on, or
 * undefined. Only Firefox's toolbar panel reads the record. Never rejects: a failed read opens the
 * panel as usual.
 */
export async function readHandback(): Promise<HandbackRoute | undefined> {
	if (!closesOnFocusLoss()) return undefined
	try {
		const raw: unknown = (await chrome.storage.session.get(HANDBACK_KEY))[HANDBACK_KEY]
		if (raw === undefined) return undefined
		const handback = decodeHandback(raw)
		if (!handback) {
			await removeHandbackIfUnchanged(raw)
			return undefined
		}
		landing = { handback, raw }
		return handback.route
	} catch (error) {
		console.debug("hand-back read failed", { error })
		return undefined
	}
}

/** The record this panel landed for, as read, until its arrival ends the landing. */
export function pendingLanding(): { handback: Handback; raw: unknown } | undefined {
	return landing
}

/** Ends the landing: a later lock, reset or guard bounce goes Home. */
export function endLanding(): void {
	landing = undefined
}
