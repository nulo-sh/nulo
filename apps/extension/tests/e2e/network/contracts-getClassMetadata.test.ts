import { inject } from "vitest"
import { clickByTestId, test } from "../fixtures/extension"
import { assertPgOk, callExpectingNoPopup, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { waitForPopup, approveCapabilities } from "../fixtures/popups"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #19 — getContractClassMetadata is silent on default sessions: a held `contractClasses`
 * grant for every class admits the deployed token's real class without a window.
 */
test.skipIf(!hasConfig)("contracts-getClassMetadata — silent path", { timeout: 90_000 }, async ({ dappConnectedExtension }) => {
	const page = dappConnectedExtension.playgroundPage

	// Grant contractClasses bundle
	await page.evaluate(() => {
		const select = document.querySelector<HTMLSelectElement>('[data-testid="pg-bundle-select"]')!
		select.value = "contractClasses"
		select.dispatchEvent(new Event("change", { bubbles: true }))
	})
	const seqGrant = await snapshotResultSeq(page)
	const popupP = waitForPopup(dappConnectedExtension, "capabilities", { timeout: 30_000 })
	await clickByTestId(page, "pg-btn-requestCapabilities")
	await approveCapabilities(await popupP)
	await assertPgOk(page, await waitForPgResult(page, "requestCapabilities", seqGrant, 30_000), "getClassMetadata:grant")

	await page.evaluate((classId: string) => {
		const input = document.querySelector<HTMLInputElement>('[data-testid="pg-input-classId"]')!
		const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
		setter?.call(input, classId)
		input.dispatchEvent(new Event("input", { bubbles: true }))
	}, aztecConfig!.tokenClassId)

	const result = await callExpectingNoPopup(dappConnectedExtension, page, "getContractClassMetadata", async () => {
		await clickByTestId(page, "pg-btn-getContractClassMetadata")
	})
	await assertPgOk(page, result, "getClassMetadata:call")
})
