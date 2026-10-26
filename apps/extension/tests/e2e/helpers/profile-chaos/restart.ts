import { backgroundOrigin, EXTENSION_SCHEME, stopBackground } from "../../fixtures/browser"
import { pollUntil } from "../../fixtures/poll"
import { openPopup } from "../../fixtures/wallet-pages"
import { live, type World } from "./model"
import type { Driven, RunState } from "./state"
import { backgroundServing, HOME, REGISTER, type Signal, settle } from "./ui"

const RESTART_MS = 90_000

/**
 * Stops the background and waits for its successor. Where the background will not stop under an
 * open page, every extension page closes first and the anchor reopens to wake the successor; the
 * authenticator there is the session's, so the run's passkeys survive.
 */
export async function restartBackground(s: RunState, next: World): Promise<Driven> {
	const before = await backgroundOrigin(s.ctx)
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
	const t0 = Date.now()
	await backgroundServing(s.anchor, RESTART_MS)
	const locked: Signal = live(next).length ? { label: "lock", hash: "/popup/auth" } : REGISTER
	// An open session keeps the page where it stood, Settings included, so any page showing the
	// account selector reads as open.
	const open: Signal[] = [HOME, { label: "open", testid: "account-selector" }]
	const wants = next.session.kind === "open" ? open : [locked]
	const driven = await settle(s.anchor, wants, Object.fromEntries(wants.map((w) => [w.label, "committed"])), RESTART_MS)
	driven.settle.elapsedMs = Date.now() - t0
	return driven
}
