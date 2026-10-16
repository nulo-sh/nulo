import { expect } from "vitest"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { interceptRpc } from "./fixtures/browser"
import { test, openPopup, waitForHash } from "./fixtures/extension"
import { captureSoleProfileId, resetProfile, waitForProfilePurged } from "./fixtures/helpers"

const TESTNET_RPC_ORIGIN = new URL(TESTNET_RPC_URL).origin

// Reset deletes the only profile and lands on /popup/register. A file-scoped
// fixture would leak that wiped state into any subsequent test; use the
// per-test fixture so each reset starts from a fresh registered browser.
//
// The reset UI AWAITS the full purge before navigating (reset.vue handleReset),
// so the purge's own completion signal is observed first and the redirect —
// prompt once the awaited delete resolved — after. The test budget must cover
// the PER-TEST fixture (browser launch + registration, inside the timeout)
// plus the worst-case diagnostic paths of the inner waits — a tighter ceiling
// converts every crafted fail-loud error into a generic vitest timeout.
// Happy path measures ~7s; the ceiling is headroom for the diagnostics, not a
// wait budget.
test("reset profile wipes state and routes to register", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")

	const profileId = await captureSoleProfileId(page)
	await resetProfile(page)
	await waitForProfilePurged(page, profileId, { timeoutMs: 15_000 })

	// With only one profile, deletion lands the user on /popup/register
	await page.waitForFunction(() => window.location.hash.includes("/popup/register"), { timeout: 10_000 })

	expect(registeredExtensionPerTest.pageErrors).toEqual([])
}, 60_000)

// A refused node fails each call fast, so whatever the purge still waits on is the node client's
// retry backoff, which a fake node cannot reproduce: only the real PXE makes the boot, sync and
// op calls the purge drains. Same 15 s purge budget as the reachable case.
test("reset purges within the same budget while the node refuses connections", async ({ registeredExtensionPerTest: ctx }) => {
	const node = await interceptRpc(ctx.browser, ctx.extensionId, TESTNET_RPC_ORIGIN, { kind: "refuse" })
	try {
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general")

		const profileId = await captureSoleProfileId(page)
		await resetProfile(page)
		await waitForProfilePurged(page, profileId, { timeoutMs: 15_000 })
		await page.waitForFunction(() => window.location.hash.includes("/popup/register"), { timeout: 10_000 })

		expect(await node.failures()).toEqual([])
		expect(await node.hits()).toBeGreaterThan(0)
		expect(ctx.pageErrors).toEqual([])
	} finally {
		await node.stop()
	}
}, 60_000)
