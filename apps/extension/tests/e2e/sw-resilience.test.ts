import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { isFirefox, stopBackground } from "./fixtures/browser"
import { TEST_PASSWORD } from "./fixtures/constants"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue, withTimeoutMessage } from "./fixtures/extension"
import {
	acceptConfirmPopup,
	ensureUnlocked,
	lockWallet,
	navigateByHash,
	readLivenessBaseline,
	waitForWorkerLiveness,
} from "./fixtures/helpers"

const STRICT_TOGGLE = '[data-testid="strict-security-toggle"]'

/**
 * Turns strict mode off through Settings → Lock and its confirmation, asserting the flag flipped, then
 * locks and unlocks so the next session persists its bearer. Hash navigation, not the nav tab:
 * clicking through the shell races the routing an unlock is still finishing.
 */
async function optOutOfStrictMode(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/settings/lock")
	await page.waitForSelector(STRICT_TOGGLE, { visible: true, timeout: 10_000 })
	await clickByTestId(page, "strict-security-toggle")
	await acceptConfirmPopup(page)
	await withTimeoutMessage(
		page.waitForFunction(
			() => document.querySelector('[data-testid="strict-security-toggle"]')?.getAttribute("data-toggle-active") === "false",
			{ timeout: 10_000, polling: 200 },
		),
		async () => {
			const seen = await page
				.evaluate(
					() =>
						document.querySelector('[data-testid="strict-security-toggle"]')?.getAttribute("data-toggle-active") ?? "<absent>",
				)
				.catch(() => "<unreadable>")
			return `strict-security-toggle never flipped off (still ${seen}) — the opt-out this test depends on did not happen`
		},
	)
	await navigateByHash(page, "#/popup/general")

	await lockWallet(page)
	await page.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="auth-password-input"]', TEST_PASSWORD)
	await clickByTestId(page, "auth-submit")
	await waitForHash(page, "#/popup/general", 10_000)
}

// A background death — Chrome recycling its idle worker, Firefox ending its event page — and the
// cold respawn on the next event is where storage migrations, service init and cold-boot races
// actually break. `stopBackground` is what makes these tests mean anything: a kill that leaves the
// background running lets every test here pass against one that never died.
describe("background death and cold respawn", () => {
	test("extension survives SW stop+respawn: lock → kill SW → unlock → general", async ({ registeredExtension }) => {
		const page = await openPopup(registeredExtension)
		await waitForHash(page, "#/popup/general")

		await lockWallet(page)
		await page.close()

		await stopBackground(registeredExtension)

		// Open a fresh popup. The popup app's SW client will trigger the SW to
		// spawn cold, write the liveness heartbeat, and serve the locked-state
		// initial route (/popup/auth). The baseline is read AFTER the stop: the
		// old instance is gone, so anything newer is the replacement's.
		const page2 = await openPopup(registeredExtension)
		await waitForWorkerLiveness(page2, await readLivenessBaseline(page2))

		// Locked from before reload, so we land on auth
		await waitForHash(page2, "#/popup/auth", 15_000)

		// Unlock with the original password
		await page2.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 10_000 })
		await replaceInputValue(page2, '[data-testid="auth-password-input"]', TEST_PASSWORD)
		await clickByTestId(page2, "auth-submit")
		await page2.waitForFunction(() => !window.location.hash.includes("/popup/auth"), { timeout: 15_000 })
		await waitForHash(page2, "#/popup/general", 10_000)

		expect(registeredExtension.pageErrors).toEqual([])
		await page2.close()
	}, 90_000)

	/**
	 * With strict security mode default ON, SW death without a manual lock
	 * MUST also land the user on `/popup/auth`. Without strict mode the
	 * persisted `passhash` bearer would silently re-unlock; under strict ON
	 * the bearer is never persisted, so cold-restore short-circuits → lock
	 * screen.
	 *
	 * Automated coverage for the strict-default-ON contract. Differs from
	 * the previous test by NOT calling `lockWallet()` — proves the lock
	 * comes from strict mode, not from explicit user action.
	 */
	// A popup that stays OPEN across the kill keeps its store (a selected profile, an authenticated
	// page). The replacement worker holds no session, so the popup's reconnect boot must lock it on
	// its own — nothing here clicks Lock. Pre-fix the shell stayed on general with a dead session
	// behind it, and the next Lock click stripped the header without navigating.
	// Chrome's alone: Firefox will not end an event page while an extension page keeps it busy.
	test.skipIf(isFirefox)(
		"an open popup outlives the kill: it locks itself on reconnect and unlocks again",
		async ({ registeredExtension }) => {
			const page = await openPopup(registeredExtension)
			await ensureUnlocked(page)
			await waitForHash(page, "#/popup/general")

			await stopBackground(registeredExtension)

			await waitForWorkerLiveness(page, await readLivenessBaseline(page))
			await waitForHash(page, "#/popup/auth", 30_000)
			await page.waitForFunction(async () => !(await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"], {
				timeout: 10_000,
				polling: 200,
			})

			await ensureUnlocked(page)
			await waitForHash(page, "#/popup/general", 15_000)
			expect(registeredExtension.pageErrors).toEqual([])
			await page.close()
		},
	)

	test("strict mode default ON: unlock → kill SW → expect lock screen on respawn", async ({ registeredExtension }) => {
		const page = await openPopup(registeredExtension)
		await waitForHash(page, "#/popup/general")
		// Note: deliberately NO lockWallet() call. Strict mode is the lock.
		await page.close()

		await stopBackground(registeredExtension)

		const page2 = await openPopup(registeredExtension)
		await waitForWorkerLiveness(page2, await readLivenessBaseline(page2))

		// Strict ON: persisted Session has no passhash → restore() silentCloses
		// → popup boots locked → /popup/auth. This route assertion IS the
		// strict-mode contract; the actual unlock UI is exercised by the
		// existing "lock → kill SW → unlock" test above.
		await waitForHash(page2, "#/popup/auth", 15_000)

		expect(registeredExtension.pageErrors).toEqual([])
		await page2.close()
	}, 90_000)

	/**
	 * Strict-mode opt-out: when the user disables strict mode AND re-unlocks, the
	 * persisted bearer comes back. Cold-restore then silently reconstructs the
	 * in-memory secret → `/popup/general` (no lock screen).
	 *
	 * The opt-out is driven through the real Settings → Lock toggle. An earlier
	 * version posted to ConfigService over `chrome.runtime.sendMessage` to stay
	 * independent of layout, but wallet services listen on PORTS — the SW's only
	 * onMessage listener returns false — so the flag never actually changed and this
	 * test asserted a silent restore that strict mode had never been turned off for.
	 */
	test("strict mode OFF (opt-out): unlock → toggle off → relock+unlock → kill SW → silent restore", async ({ registeredExtension }) => {
		const page = await openPopup(registeredExtension)
		// These tests share one browser, and the strict-mode test above now leaves the
		// wallet genuinely LOCKED — which it always should have, but could not while
		// the "kill" left the worker running. Establish the precondition instead of
		// inheriting it.
		await ensureUnlocked(page)
		await waitForHash(page, "#/popup/general")

		await optOutOfStrictMode(page)
		await page.close()

		await stopBackground(registeredExtension)

		const page2 = await openPopup(registeredExtension)
		await waitForWorkerLiveness(page2, await readLivenessBaseline(page2))

		// Lenient mode: bearer cached → silent restore → directly into /popup/general.
		// (No lock screen; user wouldn't see it under strict OFF.)
		await waitForHash(page2, "#/popup/general", 15_000)

		expect(registeredExtension.pageErrors).toEqual([])
		await page2.close()
	}, 120_000)

	// A new worker answers no port until its services register, seconds into its boot, so a page that
	// mounts in that window has its first reads rejected when their port drops. Strict mode would lock
	// the popup on reconnect and leave the page, so the session is opted out first. Chrome's alone:
	// Firefox will not end an event page while an extension page keeps it busy.
	test.skipIf(isFirefox)(
		"the Lock page opened while the worker boots reads its settings once the port is back",
		async ({ registeredExtension }) => {
			const page = await openPopup(registeredExtension)
			await ensureUnlocked(page)
			await waitForHash(page, "#/popup/general")
			await navigateByHash(page, "#/popup/settings/lock")
			await page.waitForSelector(STRICT_TOGGLE, { visible: true, timeout: 10_000 })
			if ((await page.$eval(STRICT_TOGGLE, (el) => el.getAttribute("data-toggle-active"))) === "true") {
				await optOutOfStrictMode(page)
			}
			await navigateByHash(page, "#/popup/general")

			await stopBackground(registeredExtension)
			await navigateByHash(page, "#/popup/settings/lock")
			await page.waitForSelector(STRICT_TOGGLE, { visible: true, timeout: 30_000 })
			expect(await page.$eval(STRICT_TOGGLE, (el) => el.getAttribute("data-toggle-active"))).toBe("false")
			expect(registeredExtension.pageErrors).toEqual([])
			await page.close()
		},
		120_000,
	)

	/**
	 * Regression pin for the setInterval-vs-while-loop liveness gap.
	 *
	 * After the SW is stopped via CDP, a fresh popup must see a NEW liveness
	 * timestamp (strictly newer than the pre-restart snapshot) within
	 * HEARTBEAT_INTERVAL_MS (10s). Pre-fix, the first liveness write happened
	 * only after waiting the full setInterval tick — so on cold respawn the
	 * gap between "SW spawned" and "fresh liveness appears" was always
	 * >= 10s plus startup time. The runtime.ts immediate write closes that
	 * gap; this test fails if anyone reintroduces the setInterval-only
	 * pattern.
	 *
	 * Existence vs timestamp comparison:
	 * chrome.storage.session survives SW termination while the extension
	 * stays loaded, so an existence check would pass on the stale pre-restart
	 * value and miss the regression. Fresh-timestamp comparison is the
	 * correctness fix.
	 */
	test("regression: liveness signal lands within HEARTBEAT_INTERVAL_MS of SW respawn", async ({ registeredExtension }) => {
		const HEARTBEAT_INTERVAL_MS = 10_000

		const page = await openPopup(registeredExtension)
		// These tests share one browser, and the strict-mode test above now leaves the
		// wallet genuinely LOCKED — which it always should have, but could not while
		// the "kill" left the worker running. Establish the precondition instead of
		// inheriting it.
		await ensureUnlocked(page)
		await waitForHash(page, "#/popup/general")

		// Snapshot the liveness timestamp BEFORE killing the SW — deliberately, unlike
		// the recovery gates above: this test TIMES the replacement's first write, and
		// a baseline read after the stop could already be that write, costing a full
		// tick and breaking the bound below. The old worker's last tick can land in
		// the window before the kill; the 10s budget is what absorbs it.
		const beforeLiveness = await readLivenessBaseline(page)
		await page.close()

		await stopBackground(registeredExtension)

		// Clock starts at the KILL, not after `openPopup` — which already waits for
		// the background to be connected, i.e. for the very write being timed. Timing
		// from there measured nothing and would not have caught the regression this
		// test exists for. Including the popup-open cost makes this an upper bound on
		// respawn-to-liveness, which is what the assertion needs.
		const start = Date.now()
		const page2 = await openPopup(registeredExtension)
		await page2.waitForFunction(
			async (priorTs: number) => {
				try {
					const r = await chrome.storage.session.get("nulo:liveness")
					const v = Number(r["nulo:liveness"] ?? 0)
					return v > priorTs
				} catch {
					return false
				}
			},
			{ timeout: HEARTBEAT_INTERVAL_MS, polling: 250 },
			beforeLiveness,
		)
		const elapsed = Date.now() - start

		// Strict bound — 10s. If this fails the runtime is back to setInterval-only
		// semantics and the launchExtension flake will resurface in unrelated tests.
		expect(elapsed).toBeLessThan(HEARTBEAT_INTERVAL_MS)
		expect(registeredExtension.pageErrors).toEqual([])
		await page2.close()
	}, 60_000)
})
