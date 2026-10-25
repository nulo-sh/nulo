import { backgroundOrigin, EXTENSION_SCHEME, stopBackground } from "../../fixtures/browser"
import { pollUntil } from "../../fixtures/poll"
import { openPopup } from "../../fixtures/wallet-pages"
import type { World } from "./model"
import type { Driven, RunState } from "./state"
import { backgroundServing, HOME, settle } from "./ui"

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
	const want = next.session.kind === "open" ? HOME : { label: "lock", hash: "/popup/auth" }
	const driven = await settle(s.anchor, [want], { [want.label]: "committed" }, RESTART_MS)
	driven.settle.elapsedMs = Date.now() - t0
	return driven
}
