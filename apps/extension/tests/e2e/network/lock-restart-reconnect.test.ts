import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { allowSelfRestart, reloadExtensionPage } from "../fixtures/browser"
import { clickByTestId, grantCapBundle, openPopup, test, waitForHash } from "../fixtures/extension"
import { ensureUnlocked, pressHeaderLock, switchToLocalNetwork } from "../fixtures/helpers"
import { assertPgOk, callExpectingNoPopup, openPlayground, selectPgBundle } from "../fixtures/playground"
import { approveConnect, approveVerify, waitForPopup, waitForPopupClosed } from "../fixtures/popups"
import { refuseSessionDeletes, waitForExtensionRestart } from "../fixtures/session"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const CONNECTED = '[data-testid="pg-status"][data-status="connected"]'
const DISCONNECTED = '[data-testid="pg-status"][data-status="disconnected"]'

const firstAccount = async (accountIds: (string | null)[]): Promise<string[]> => {
	const address = accountIds[0]
	if (!address) throw new Error("capabilities popup returned no accounts")
	return [address]
}

/**
 * A connected app meets the wallet's restart as it meets an update: Chrome injects no content script
 * into a page already open, so the app's page loads again. Its connect then queues behind the lock
 * screen, and the unlock drains it into the remembered session's emoji check, its grants intact.
 *
 * Before restarting, the wallet ends every session, so the idle app shows its disconnect at once
 * (without that, neither browser tells it within 35 s), and it closes the check window a second
 * app left unanswered, which the lock had already sent to the unlock screen and which Chrome would
 * otherwise leave as a New Tab window.
 */
test.skipIf(!hasConfig)(
	"lock-restart-reconnect — after the restart that ends a lock the wallet could not save, a reloaded app reconnects through the unlock",
	{ timeout: 240_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		await allowSelfRestart(ctx.browser)
		const control = await openPopup(ctx)
		await waitForHash(control, "#/popup/general", 15_000)
		await switchToLocalNetwork(control)

		const dappPage = await openPlayground(ctx)
		const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
		await clickByTestId(dappPage, "pg-btn-connect")
		await approveVerify(await approveConnect(ctx, await discoverP))
		await dappPage.waitForSelector(CONNECTED, { timeout: 20_000 })
		await grantCapBundle(ctx, dappPage, "accounts", firstAccount)

		const secondApp = await openPlayground(ctx)
		const checkP = waitForPopup(ctx, "verify", { timeout: 30_000 })
		await clickByTestId(secondApp, "pg-btn-connect")
		const unansweredCheck = await checkP

		await refuseSessionDeletes(ctx)
		await ctx.checkCspViolations()
		await waitForExtensionRestart(ctx, control, () => pressHeaderLock(control))

		await dappPage.waitForSelector(DISCONNECTED, { timeout: 5_000 })
		await waitForPopupClosed(unansweredCheck, 5_000)
		expect(ctx.browser.targets().filter((target) => target.url().startsWith("chrome://new-tab-page"))).toEqual([])
		await secondApp.close()

		await reloadExtensionPage(dappPage)
		await dappPage.waitForSelector('[data-testid="pg-btn-connect"]', { visible: true, timeout: 30_000 })
		const verifyP = waitForPopup(ctx, "verify", { timeout: 60_000 })
		await clickByTestId(dappPage, "pg-btn-connect")
		const popup = await openPopup(ctx)
		await waitForHash(popup, "#/popup/auth", 15_000)
		// The toolbar badge counts the connects queued behind the lock screen.
		await popup.waitForFunction(async () => (await chrome.action.getBadgeText({})) === "1", { timeout: 15_000, polling: 250 })
		await ensureUnlocked(popup)
		await approveVerify(await verifyP)
		await dappPage.waitForSelector(CONNECTED, { timeout: 20_000 })

		await selectPgBundle(dappPage, "accounts")
		const caps = await callExpectingNoPopup(ctx, dappPage, "requestCapabilities", () =>
			clickByTestId(dappPage, "pg-btn-requestCapabilities"),
		)
		await assertPgOk(dappPage, caps, "requestCapabilities after the restart")
		await dappPage.close()
		await popup.close()
	},
)
