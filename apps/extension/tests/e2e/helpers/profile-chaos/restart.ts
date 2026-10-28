import { backgroundOrigin, EXTENSION_SCHEME, stopBackground } from "../../fixtures/browser"
import { pollUntil } from "../../fixtures/poll"
import { openPopup } from "../../fixtures/wallet-pages"
import { checkLogContinuity } from "./checkers"
import { type DrainedLog, drainLogs } from "./collect"
import { live, type World } from "./model"
import type { Driven, RunState } from "./state"
import { backgroundServing, HOME, REGISTER, type Signal, settle } from "./ui"

export const RESTART_MS = 90_000
const NO_SESSION_PAGES = ["/popup/import", "/popup/profile/new"]

/** Reads the background's lines right before it stops, so the step checks them with its successor's:
 *  only what it logs between this read and the stop stays unread. A failed read or a gap in it is
 *  the step's own gap, apart from the restart's. */
export async function drainBeforeStop(s: RunState): Promise<void> {
	let lines: DrainedLog[]
	try {
		lines = await drainLogs(s.anchor, s.logs.lastId)
	} catch {
		s.logs.gaps.push("logs: the read right before the planned stop failed")
		return
	}
	const continuity = checkLogContinuity(
		s.logs.lastId,
		lines.map((l) => l.id),
	)
	if (!continuity.complete) s.logs.gaps.push(`logs: ${continuity.reason}`)
	s.logs.carried.push(...lines)
	if (lines.length) s.logs.lastId = (lines.at(-1) as DrainedLog).id
}

/** Stops the background once its last lines are read, and returns once a successor runs. Where the
 *  background will not stop under an open page, every extension page closes first and a fresh
 *  anchor wakes the successor; the authenticator there is the session's, so the passkeys survive. */
export async function replaceBackground(s: RunState): Promise<void> {
	const before = await backgroundOrigin(s.ctx)
	await drainBeforeStop(s)
	if (!s.caps.restartUnderOpenPage) {
		for (const page of await s.ctx.browser.pages()) if (page.url().startsWith(EXTENSION_SCHEME)) await page.close().catch(() => {})
		s.extras = []
	}
	await stopBackground(s.ctx)
	if (!s.caps.restartUnderOpenPage) {
		s.anchor = await openPopup(s.ctx)
		s.errors.watch(s.anchor, "anchor")
	}
	await pollUntil(
		() => backgroundOrigin(s.ctx),
		(origin) => origin !== undefined && origin !== before,
		{ label: "a successor background", timeoutMs: RESTART_MS, intervalMs: 250 },
	)
}

/** `flowOpened`: the anchor's import or create already opened its profile's session. */
export async function restartBackground(s: RunState, next: World, flowOpened = false): Promise<Driven> {
	// A page the restart outlives keeps a route that needs no session, whatever the session and the
	// profiles left (`decideLockLanding` settles an established page, `src/popup/lock-landing.ts`).
	// A flow that opened its session is over once the restart drops it, unless the shell had not yet
	// marked that session open: the lock screen, or the page kept.
	const kept = s.caps.restartUnderOpenPage ? NO_SESSION_PAGES.find((hash) => s.anchor.url().includes(`#${hash}`)) : undefined
	await replaceBackground(s)
	const t0 = Date.now()
	await backgroundServing(s.anchor, RESTART_MS)
	const locked: Signal = live(next).length ? { label: "lock", hash: "/popup/auth" } : REGISTER
	// An open session keeps the page where it stood: any page showing the account selector, or any
	// Settings page, which a locked wallet leaves for the lock screen, reads as open. O1 judges which.
	const open: Signal[] = [HOME, { label: "open", testid: "account-selector" }, { label: "open", hash: "/popup/settings/" }]
	const keptPage: Signal[] = kept ? [{ label: "kept", hash: kept }] : []
	const wants = kept ? (flowOpened ? [locked, ...keptPage] : keptPage) : next.session.kind === "open" ? open : [locked]
	const driven = await settle(s.anchor, wants, Object.fromEntries(wants.map((w) => [w.label, "committed"])), RESTART_MS)
	driven.settle.elapsedMs = Date.now() - t0
	return driven
}
