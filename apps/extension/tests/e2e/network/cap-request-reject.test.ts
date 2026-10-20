import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { expect, inject } from "vitest"
import { clickByTestId, test } from "../fixtures/extension"
import { snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { waitForPopup, rejectCapabilities } from "../fixtures/popups"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #10 — user rejects capability popup → playground gets 4001 `USER_REJECTED`: the window
 * closes only once the wallet has taken its Reject, so its close never answers first.
 */
test.skipIf(!hasConfig)(
	"cap-request-reject — Reject button surfaces error to the dApp",
	{ timeout: 60_000 },
	async ({ dappConnectedExtension }) => {
		const page = dappConnectedExtension.playgroundPage
		const fromSeq = await snapshotResultSeq(page)

		await page.evaluate(() => {
			const select = document.querySelector<HTMLSelectElement>('[data-testid="pg-bundle-select"]')!
			select.value = "basic"
			select.dispatchEvent(new Event("change", { bubbles: true }))
		})

		const popupP = waitForPopup(dappConnectedExtension, "capabilities", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-requestCapabilities")

		const popup = await popupP
		await rejectCapabilities(popup)

		const result = await waitForPgResult(page, "requestCapabilities", fromSeq, 20_000)
		expect(result.status).toBe("error")
		const errorPayload = result.errorJson as string | { message?: string } | undefined
		const errMessage = typeof errorPayload === "string" ? errorPayload : errorPayload?.message
		expect(JSON.parse(errMessage ?? "{}")).toMatchObject({ code: 4001, data: { walletErrorCode: UserRejectedError.CODE } })
	},
)
