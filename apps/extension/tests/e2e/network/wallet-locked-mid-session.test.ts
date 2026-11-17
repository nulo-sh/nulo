import { expect, inject } from "vitest"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import {
	callExpectingNoPopup,
	errorEnvelopeOf,
	snapshotResultSeq,
	tracedEnvelope,
	waitForPgResult,
	assertPgOk,
} from "../fixtures/playground"
import { lockWallet } from "../fixtures/helpers"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A connected session's request after a lock is refused at the ingress, before any method runs,
 * with the `WALLET_LOCKED` envelope, and opens no window: the dApp asks the person to unlock.
 */
test.skipIf(!hasConfig)(
	"wallet-locked-mid-session — a request after a lock answers WALLET_LOCKED and opens no window",
	{ timeout: 90_000 },
	async ({ dappConnectedExtension }) => {
		const page = dappConnectedExtension.playgroundPage

		// Sanity: getChainInfo works while unlocked
		const beforeSeq = await snapshotResultSeq(page)
		await clickByTestId(page, "pg-btn-getChainInfo")
		const before = await waitForPgResult(page, "getChainInfo", beforeSeq, 15_000)
		await assertPgOk(page, before, "wallet-locked-mid-session:before")

		// Lock the wallet via the popup UI
		const popupPage = await openPopup(dappConnectedExtension)
		await waitForHash(popupPage, "#/popup/general")
		await lockWallet(popupPage)
		await popupPage.close()

		const result = await callExpectingNoPopup(dappConnectedExtension, page, "getChainInfo", async () => {
			await clickByTestId(page, "pg-btn-getChainInfo")
		})
		expect(result.status).toBe("error")
		expect(errorEnvelopeOf(result)).toEqual(
			tracedEnvelope({
				code: 4900,
				message: "The wallet is locked. Unlock it to continue.",
				data: { walletErrorCode: "WALLET_LOCKED" },
			}),
		)
	},
)
