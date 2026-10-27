import { expect } from "vitest"
import { interceptRpc, reloadExtensionPage } from "./fixtures/browser"
import { test, openPopup, waitForHash } from "./fixtures/extension"
import { captureSoleProfileId, resetProfile, waitForProfilePurged } from "./fixtures/helpers"
import { DEFAULT_NODE_ORIGIN } from "./fixtures/networks"
import { readActivityScope } from "./helpers/activity-seeds"
import { SEEDED_FPC_IDS, fpcRowIds, seedProtocolFpcs } from "./helpers/fpc-seeds"

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
	// The fixture's profile was registered in the popup, which never shows its recovery phrase.
	expect(await resetProfile(page)).toEqual({ warned: true, preTitle: "Irreversible", title: "Delete this profile?" })
	await waitForProfilePurged(page, profileId, { timeoutMs: 15_000 })

	// With only one profile, deletion lands the user on /popup/register
	await page.waitForFunction(() => window.location.hash.includes("/popup/register"), { timeout: 10_000 })

	expect(registeredExtensionPerTest.pageErrors).toEqual([])
}, 60_000)

// Only the production PXE makes the boot, sync and op node calls a purge drains, so only a browser
// proves no retry of theirs still holds it. Same 15 s purge budget as the reachable case. Both
// protocol FPC rows are stored behind the launch's stand-in, whose 400 ends a discovery at once,
// before the node refuses, so the purge drains the PXE's own calls and no discovery registration.
test("reset purges within the same budget while the node refuses connections", async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	await seedProtocolFpcs(page, scope)
	expect(await fpcRowIds(page)).toEqual([...SEEDED_FPC_IDS].sort())

	const node = await interceptRpc(ctx.browser, ctx.extensionId, DEFAULT_NODE_ORIGIN, { kind: "refuse" })
	try {
		await reloadExtensionPage(page)
		await waitForHash(page, "#/popup/general")

		await resetProfile(page)
		await waitForProfilePurged(page, scope.profileId, { timeoutMs: 15_000 })
		await page.waitForFunction(() => window.location.hash.includes("/popup/register"), { timeout: 10_000 })

		expect(await node.failures()).toEqual([])
		expect(await node.hits()).toBeGreaterThan(0)
		expect(ctx.pageErrors).toEqual([])
	} finally {
		await node.stop()
	}
}, 60_000)
