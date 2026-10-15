/**
 * A reset whose background dies part-way resumes from its journal. Both runs are held at a named
 * step, every extension page closes (Firefox ends an event page only then; `FIREFOX.md`), the
 * background stops, and the next unlock picks the run up:
 *
 *  - both causes, held once the purge is durable and before the row is rewritten, with Local made
 *    active meanwhile: A4 shows on Local while the resume runs, the row is rewritten, the accounts
 *    come back at their addresses, A5 shows once, and Local's account still loads;
 *  - address change, held after the first of two accounts is re-created: no account is created
 *    twice.
 *
 * @requires-proverless — the restore gate exists only in proverless builds (`wallet/runtime.ts`).
 */
import type { Page } from "puppeteer"
import { describe, expect, inject } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import type { RestoreGateHoldPoint } from "@/e2e/restore-gate"
import type { AztecTestConfig } from "../fixtures/aztec"
import { stopBackground } from "../fixtures/browser"
import { clickByTestId, type ExtensionContext, launchExtension, openPopup, registerProfile, test, waitForHash } from "../fixtures/extension"
import {
	closeStuckPopup,
	createAccount,
	ensureUnlocked,
	getAccountAddress,
	importTokenAndWaitForBalance,
	lockWallet,
	switchToLocalNetwork,
	waitForLockScreen,
	waitForToast,
} from "../fixtures/helpers"
import { armRestoreGate, clearRestoreGate, waitForRestoreGateHeld } from "../fixtures/restore-gate"
import { TEST_PASSWORD } from "../helpers/import-drivers"
import {
	PREVIOUS_TESTNET_CHAIN_ID,
	readAccounts,
	readNetwork,
	readTakeoverTrace,
	type StoredAccount,
	seedStaleNetwork,
	storeActiveNetwork,
	takeoverScreen,
	traceTakeover,
} from "../helpers/stale-network"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const identity = ({ address, name, index, type, visible }: StoredAccount) => ({ address, name, index, type, visible })

/** Starts the reset of the active stale Testnet and returns once the run holds at `at`. */
async function startHeld(page: Page, screen: string, at: RestoreGateHoldPoint): Promise<void> {
	expect(await takeoverScreen(page, screen)).toBe(screen)
	await armRestoreGate(page, at)
	await clickByTestId(page, "stale-network-reset")
	await clickByTestId(page, "stale-confirm-submit")
	await waitForRestoreGateHeld(page, at, 30_000)
}

/** Closes every page, stops the background, and reopens a popup at the lock screen with the hold
 *  cleared, so the resumed run passes the step the dead one stopped at. */
async function killAndReopen(ctx: ExtensionContext, page: Page): Promise<Page> {
	await page.close()
	await stopBackground(ctx)
	const popup = await openPopup(ctx)
	await waitForLockScreen(popup, 60_000)
	await clearRestoreGate(popup)
	return popup
}

describe("stale network reset after a background death", () => {
	test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
		if (process.env.E2E_REQUIRE_SETUP === "1") expect(hasConfig).toBe(true)
	})

	test.skipIf(!hasConfig)(
		"N3 a held run resumes after the background dies: A4 on Local, A5 once, no account created twice",
		{ timeout: 600_000, retry: 0 },
		async () => {
			const ctx = await launchExtension()
			let page: Page | undefined
			try {
				await registerProfile(ctx)
				page = await openPopup(ctx)
				await waitForHash(page, "#/popup/general", 30_000)
				await createAccount(page, "Savings")
				await closeStuckPopup(page)
				const testnetBefore = (await readAccounts(page, CHAIN_IDS.TESTNET)).map(identity)
				expect(testnetBefore.map((a) => a.index)).toEqual([0, 1])
				await switchToLocalNetwork(page)
				const localAccount = await getAccountAddress(page)

				// Both causes, held after the purge is durable; Local is active when the background dies.
				await lockWallet(page)
				await seedStaleNetwork(page, "both")
				await storeActiveNetwork(page, "testnet")
				await ensureUnlocked(page)
				await startHeld(page, "network-reset", "network-reset-purged")
				await storeActiveNetwork(page, "local")
				page = await killAndReopen(ctx, page)
				await traceTakeover(page)
				await ensureUnlocked(page, TEST_PASSWORD, { decisionBudgetMs: 120_000 })
				await waitForToast(page, "Your accounts have new addresses.", 120_000, { kind: "success" })
				await page.waitForSelector('[data-testid="account-address-copy"]', { visible: true, timeout: 120_000 })
				expect(await getAccountAddress(page)).toBe(localAccount)
				// Local's PXE still answers: a balance read of the fixture token lands fresh.
				await importTokenAndWaitForBalance(page, localAccount, aztecConfig!.tokenAddress, "0")
				const trace = await readTakeoverTrace(page)
				expect(trace.sawProgress).toBe(true)
				expect(trace.readyToasts).toBe(1)
				expect((await readNetwork(page, "testnet")).chainId).toBe(CHAIN_IDS.TESTNET)
				expect((await readAccounts(page, CHAIN_IDS.TESTNET)).map(identity)).toEqual(testnetBefore)
				expect(await readAccounts(page, PREVIOUS_TESTNET_CHAIN_ID)).toEqual([])

				// Address change, held after the first of the two accounts is re-created.
				await lockWallet(page)
				await seedStaleNetwork(page, "address-change")
				await storeActiveNetwork(page, "testnet")
				await ensureUnlocked(page)
				await startHeld(page, "new-addresses", "network-reset-account")
				page = await killAndReopen(ctx, page)
				await ensureUnlocked(page, TEST_PASSWORD, { decisionBudgetMs: 120_000 })
				await waitForToast(page, "Your accounts have new addresses.", 120_000, { kind: "success" })
				expect((await readAccounts(page, CHAIN_IDS.TESTNET)).map(identity)).toEqual(testnetBefore)
			} finally {
				if (page && !page.isClosed()) await clearRestoreGate(page)
				await ctx.close()
			}
		},
	)
})
