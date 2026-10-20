import { describe, expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { CHROME_ONLY, isFirefox, stopBackground } from "../fixtures/browser"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import { switchToLocalNetwork } from "../fixtures/helpers"
import { openPlayground } from "../fixtures/playground"
import { approveConnect, waitForPopup, waitForPopupClosed } from "../fixtures/popups"
import { readLivenessBaseline, waitForWorkerLiveness } from "../fixtures/session"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * The emoji check's session lives only in the background's memory, so a crash ends it and the
 * check window can only show an error. The next background closes that window as it boots, and no
 * other extension page: the popup kept open beside it stays, on its route, served by the successor.
 */
describe.skipIf(isFirefox)(CHROME_ONLY.backgroundKillUnderPage, () => {
	test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
		if (process.env.E2E_REQUIRE_SETUP === "1") expect(hasConfig).toBe(true)
	})

	test.skipIf(!hasConfig)(
		"restart-closes-check-window — the check window a crash ended closes when the background boots again; the popup stays",
		{ timeout: 180_000 },
		async ({ registeredExtensionPerTest: ctx }) => {
			const control = await openPopup(ctx)
			await waitForHash(control, "#/popup/general", 15_000)
			await switchToLocalNetwork(control)

			const dappPage = await openPlayground(ctx)
			const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
			await clickByTestId(dappPage, "pg-btn-connect")
			const check = await approveConnect(ctx, await discoverP)

			// No alarm may wake the successor: the open pages' own reconnects do.
			await control.evaluate(() => chrome.alarms.clearAll())
			await stopBackground(ctx)
			const afterKill = await readLivenessBaseline(control)

			await waitForPopupClosed(check, 15_000)
			expect(control.isClosed()).toBe(false)
			await waitForHash(control, "#/popup/general", 5_000)
			await waitForWorkerLiveness(control, afterKill)
			await dappPage.close()
			await control.close()
		},
	)
})
