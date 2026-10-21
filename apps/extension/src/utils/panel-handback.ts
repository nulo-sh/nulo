/**
 * The hand-back: a hand-off window that ends its flow leaves one record in `chrome.storage.session`
 * for Firefox's toolbar panel, which then opens on the flow's page with the flow's outcome snack. The
 * panel reads the record before its router exists and removes it on its first arrival there, so the
 * next panel the person opens lands there once.
 */
import { watch } from "vue"
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

const MAX_LABEL_LENGTH = 200
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
async function removeIfUnchanged(raw: unknown): Promise<void> {
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
			await removeIfUnchanged(raw)
			return undefined
		}
		landing = { handback, raw }
		return handback.route
	} catch (error) {
		console.debug("hand-back read failed", { error })
		return undefined
	}
}

/** What the panel shows now: its completed route, and the open session's profile. */
export interface LandingState {
	path: string
	loggedIn: boolean
	profileId: string | undefined
}

/**
 * Settles the landing on the first arrival at its route with a session open: the record is removed,
 * the landing ends (a later lock or reset goes Home), and the snack shows when the session, read
 * after the removal, is still open on the snack's profile. A preload Firefox abandons dies holding it.
 */
export function settleLanding(state: () => LandingState, show: (snack: Snack) => void): void {
	const taken = landing
	if (!taken) return
	let settled = false
	const stop = watch(
		state,
		async ({ path, loggedIn }) => {
			if (settled || !loggedIn || path !== taken.handback.route) return
			settled = true
			landing = undefined
			queueMicrotask(() => stop())
			try {
				await removeIfUnchanged(taken.raw)
			} catch (error) {
				console.debug("hand-back removal failed", { error })
			}
			const { snack } = taken.handback
			const now = state()
			if (snack && now.loggedIn && now.profileId === snack.profileId) show({ kind: snack.kind, label: snack.label })
		},
		{ immediate: true },
	)
}

/** Forgets the landing; for tests. */
export function resetLanding(): void {
	landing = undefined
}
