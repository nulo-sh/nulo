/**
 * Non-network e2e coverage for the passkey-profile path.
 *
 * Coverage in this file (in-page modal path A — same FrameTreeNode):
 *   1. Register a passkey profile via the in-page modal (path A).
 *      Asserts the popup lands on /popup/general with a valid 0x... address.
 *   2. Lock + unlock-via-passkey within the same extension session, on a row sealed at the
 *      profile's own PRF input. Unblocked by path A: the modal runs in the popup's existing
 *      FrameTreeNode, so the credential created at register persists across the lock/unlock
 *      cycle on the SAME virtual authenticator.
 *
 * Each step also proves it stayed in the page on both browsers: the passkey card mounted and no
 * window opened. Only Firefox's toolbar panel hands it to a window (`toolbar-panel.test.ts`).
 *
 * A passkey restores nothing: a wallet comes back from its recovery phrase or a full backup
 * (`passkey-backup.test.ts`). Why a passkey cannot cross extension instances in the suite:
 * apps/extension/tests/e2e/PRF-NON-PORTABLE.md.
 */
import { expect } from "vitest"
import type { Page } from "puppeteer"
import { clickByTestId, openPopup, waitForHash, test } from "./fixtures/extension"
import { selectedAccount } from "./fixtures/helpers"
import { readPasskeySurface, registerPasskeyProfile, setupPasskeyVirtualAuth, watchPasskeySurface } from "./fixtures/passkey"

/** The selected account, which the wallet records after the post-register account derivation
 *  settles. */
async function readActiveAccount(page: Page): Promise<string> {
	return (await selectedAccount(page)) as string
}

const IN_PAGE = { cardMounted: true, windowsOpened: 0 }

// registerPasskeyProfile moved to ./fixtures/passkey (shared with the network
// passkey-execution-canary); this file keeps its original call sites.

test("create passkey profile: register flow lands on /popup/general", async ({ freshExtensionPerTest }) => {
	const page = await openPopup(freshExtensionPerTest)
	const auth = await setupPasskeyVirtualAuth(freshExtensionPerTest.browser, page)

	try {
		await watchPasskeySurface(page)
		await registerPasskeyProfile(page)
		expect(await readPasskeySurface(page)).toEqual(IN_PAGE)

		const address = await readActiveAccount(page)
		expect(typeof address).toBe("string")
		expect(address.startsWith("0x")).toBe(true)
		expect(address.length).toBeGreaterThan(2)

		expect(freshExtensionPerTest.pageErrors).toEqual([])
	} finally {
		await auth.cleanup()
		await page.close()
	}
}, 60_000)

test("lock + unlock via passkey: header-lock → auth-submit returns to /popup/general", async ({ freshExtensionPerTest }) => {
	const page = await openPopup(freshExtensionPerTest)
	const auth = await setupPasskeyVirtualAuth(freshExtensionPerTest.browser, page)

	try {
		await registerPasskeyProfile(page)
		const addressBefore = await readActiveAccount(page)
		expect(addressBefore.startsWith("0x")).toBe(true)
		// The row the unlock opens holds the sealed slots and the profile's own PRF input.
		const row = await page.evaluate(async () => {
			const all = await chrome.storage.local.get(null)
			const raw = Object.entries(all).find(([key]) => key.startsWith("nulo:core:profiles@"))?.[1]
			const profile = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>
			return { type: profile.type, keys: ["guard", "secret", "entropy", "prfSalt"].filter((key) => typeof profile[key] === "string") }
		})
		expect(row).toEqual({ type: "passkey", keys: ["guard", "secret", "entropy", "prfSalt"] })

		// Lock via the header. Sets `appStore.isLogined = false` and calls
		// `managers.profile.lockActiveProfile()`; a watcher in app.vue
		// pushes the router to /popup/auth.
		await clickByTestId(page, "header-lock")
		await waitForHash(page, "#/popup/auth", 10_000)

		// Auth page detects passkey-profile, hides password input, exposes
		// just `auth-submit`. Click triggers in-page passkey ceremony in the
		// SAME popup (and SAME FrameTreeNode) — finds the credential created
		// during register on the same virtual authenticator instance.
		// Wait for auth-submit to be present AND ENABLED. After lock, the SW
		// emits onActiveProfileChanged(undefined) which clears appStore.profile.
		// auth.vue's onMounted refetches it asynchronously; while in flight,
		// isAllowedToContinue is false and the submit button is disabled.
		// Clicking a disabled button is a no-op (puppeteer happily clicks
		// disabled elements; nothing fires).
		await page.waitForSelector('[data-testid="auth-submit"]', { visible: true, timeout: 5_000 })
		await page.waitForFunction(
			() => {
				const btn = document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')
				return btn !== null && !btn.disabled
			},
			{ timeout: 10_000 },
		)
		await watchPasskeySurface(page)
		await clickByTestId(page, "auth-submit")
		await waitForHash(page, "#/popup/general", 60_000)
		expect(await readPasskeySurface(page)).toEqual(IN_PAGE)

		const addressAfter = await readActiveAccount(page)
		expect(addressAfter).toBe(addressBefore)

		// Filter the benign "Client disconnected" cascade — lock closes the
		// SW session, in-flight ServiceClients reject with this on cleanup.
		// Same pattern as `security.test.ts:isBenignPasswordChangeError`.
		const nonBenignErrors = freshExtensionPerTest.pageErrors.filter((e) => !e.message.includes("Client disconnected"))
		expect(nonBenignErrors).toEqual([])
	} finally {
		await auth.cleanup()
		await page.close()
	}
}, 90_000)

// NOTE: a cross-browser passkey round-trip stays blocked: a different `puppeteer.launch()` is a
// different authenticator, so no shared credential. See
// `apps/extension/tests/e2e/PRF-NON-PORTABLE.md`.
