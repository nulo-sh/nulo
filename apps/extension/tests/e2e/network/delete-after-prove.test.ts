/**
 * Deleting the profile that has just proven and sent a transaction completes, and the lock screen's
 * picker no longer lists it.
 *
 * Once bb.js loads its CRS it keeps IndexedDB's `keyval-store` open for the life of the page, so
 * the erase must leave that store alone: deleting it blocks, and the reset fails. The required-Presto
 * CI lane proves natively and never opens it, so the popup opens it the way bb.js's idb-keyval does
 * and holds it through the erase on every prover backend.
 *
 * Profile B exists so the delete lands on the lock screen rather than registration. Run it with
 * `NULO_E2E_RETRY=0`: it spends on-chain and PXE state that a retry would find half-consumed.
 */
import type { Page } from "puppeteer"
import { expect, inject, onTestFinished } from "vitest"
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
import { sendDefaultTx } from "../fixtures/send"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const PROFILE_B_PASSWORD = "SecondProfilePw123!"

const hasCrsCache = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === "keyval-store"))

type HoldsCrsStore = { heldCrsStore?: IDBDatabase }

/** Opens `keyval-store` as idb-keyval does (one `keyval` object store) and never closes it on
 *  `versionchange`, the connection bb.js leaves behind. A reload would drop it, so it is asserted. */
const holdCrsStore = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open("keyval-store")
				request.onupgradeneeded = () => request.result.createObjectStore("keyval")
				request.onsuccess = () => {
					;(window as HoldsCrsStore).heldCrsStore = request.result
					resolve()
				}
				request.onerror = () => reject(request.error)
			}),
	)
const holdsCrsStore = (page: Page) => page.evaluate(() => (window as HoldsCrsStore).heldCrsStore instanceof IDBDatabase)
const releaseCrsStore = (page: Page) => page.evaluate(() => (window as HoldsCrsStore).heldCrsStore?.close())

test.skipIf(!hasConfig)(
	"delete-after-prove — the profile that just proved a send deletes and leaves the picker",
	{ timeout: 600_000, retry: 0 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const { playgroundPage: dapp, accountAddress } = ctx
		// `openPopup` restarts the arrays, so what came since the last one is asserted before it: here
		// the fixture's setup popup and its connect and grant windows.
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
		await mintPublicTokensForAccount(config, accountAddress)

		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 15_000)
		await holdCrsStore(page)
		onTestFinished(() => releaseCrsStore(page).catch(() => undefined))

		await sendDefaultTx(ctx, dapp, config, "delete-after-prove:send", { popupTimeoutMs: 120_000 })

		const profileA = (await readSessionRow(page))?.profile ?? ""
		expect(profileA).not.toBe("")
		const profileB = await createAndActivateProfile(page, "Profile B", PROFILE_B_PASSWORD)
		await lockWallet(page)
		await unlockProfile(page, profileA, TEST_PASSWORD)

		expect(await holdsCrsStore(page), "the popup must still hold the CRS store when the erase runs").toBe(true)
		await resetProfile(page)
		await waitForProfilePurged(page, profileA, { timeoutMs: 60_000 })
		await waitForHash(page, "#/popup/auth", 15_000)

		await clickByTestId(page, "auth-profile")
		await page.waitForSelector(`[data-testid="select-profile-row"][data-profile-id="${profileB}"]`, { visible: true, timeout: 10_000 })
		const listed = await page.$$eval('[data-testid="select-profile-row"]', (rows) => rows.map((r) => r.getAttribute("data-profile-id")))
		expect(listed).toEqual([profileB])

		expect(await hasCrsCache(page), "the erase must leave bb.js's CRS cache in place").toBe(true)
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)
