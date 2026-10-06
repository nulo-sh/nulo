/**
 * Deleting the profile that has just proven and sent a transaction completes, and the lock screen's
 * picker no longer lists it.
 *
 * Once bb.js loads its CRS in the browser it caches the points in IndexedDB's `keyval-store` and
 * keeps that connection open for the life of the page, so an erase that deleted the store waited
 * 5 s on the blocked delete, rejected, and the reset page answered "Couldn't delete profile". A WASM
 * prove loads the CRS, and so does a `profileTx` gate count on every prover backend; the profiling
 * call comes first so the store is open in the required-Presto CI lane too, where the send proves
 * natively.
 *
 * Profile B exists so the delete lands on the lock screen rather than registration. Run it with
 * `NULO_E2E_RETRY=0`: it spends on-chain and PXE state that a retry would find half-consumed.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type AztecTestConfig, mintPublicTokensForAccount } from "../fixtures/aztec"
import { TEST_PASSWORD } from "../fixtures/constants"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import {
	createAndActivateProfile,
	lockWallet,
	readSessionRow,
	resetProfile,
	unlockProfile,
	waitForProfilePurged,
} from "../fixtures/helpers"
import { callExpectingNoPopup, setPgInput } from "../fixtures/playground"
import { sendDefaultTx } from "../fixtures/send"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const PROFILE_B_PASSWORD = "SecondProfilePw123!"

const hasCrsCache = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === "keyval-store"))

test.skipIf(!hasConfig)(
	"delete-after-prove — the profile that just proved a send deletes and leaves the picker",
	{ timeout: 600_000, retry: 0 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const { playgroundPage: dapp, accountAddress } = ctx
		await mintPublicTokensForAccount(config, accountAddress)

		await setPgInput(dapp, "tokenAddress", config.tokenAddress)
		await setPgInput(dapp, "recipient", config.minterAddress)
		await setPgInput(dapp, "amount", "1")
		const profiled = await callExpectingNoPopup(ctx, dapp, "profileTx", () => clickByTestId(dapp, "pg-btn-profileTx"), 180_000)
		expect(profiled.status).toBe("ok")

		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 15_000)
		expect(await hasCrsCache(page), "the profiling call must have loaded the CRS").toBe(true)

		await sendDefaultTx(ctx, dapp, config, "delete-after-prove:send", { popupTimeoutMs: 120_000 })

		const profileA = (await readSessionRow(page))?.profile ?? ""
		expect(profileA).not.toBe("")
		const profileB = await createAndActivateProfile(page, "Profile B", PROFILE_B_PASSWORD)
		await lockWallet(page)
		await unlockProfile(page, profileA, TEST_PASSWORD)

		await resetProfile(page)
		await waitForProfilePurged(page, profileA, { timeoutMs: 60_000 })
		await waitForHash(page, "#/popup/auth", 15_000)

		await clickByTestId(page, "auth-profile")
		await page.waitForSelector(`[data-testid="select-profile-row"][data-profile-id="${profileB}"]`, { visible: true, timeout: 10_000 })
		const listed = await page.$$eval('[data-testid="select-profile-row"]', (rows) => rows.map((r) => r.getAttribute("data-profile-id")))
		expect(listed).toEqual([profileB])

		expect(await hasCrsCache(page), "the erase must leave bb.js's CRS cache in place").toBe(true)
		expect(ctx.pageErrors).toEqual([])
	},
)
