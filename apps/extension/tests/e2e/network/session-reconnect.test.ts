import { expect, inject } from "vitest"
import { clickByTestId, test } from "../fixtures/extension"
import { openPlayground } from "../fixtures/playground"
import { waitForPopup, approveConnect, approveVerify, recordCreatedWindows } from "../fixtures/popups"
import { switchToLocalNetwork } from "../fixtures/helpers"
import { openPopup, waitForHash } from "../fixtures/extension"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const CONNECTED = '[data-testid="pg-status"][data-status="connected"]'

/**
 * A remembered app's reconnect: `handleDiscovery` approves it with no connect window, and its
 * emoji check still opens, on its own, as the one window the reconnect creates.
 */
test.skipIf(!hasConfig)(
	"session-reconnect — a remembered app's reconnect opens its emoji check and nothing else",
	{ timeout: 120_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		// Switch to Local Network so the playground's chainInfo (Fr.ZERO = 0)
		// matches the wallet's active network. The page stays open to record windows.
		const control = await openPopup(ctx)
		await waitForHash(control, "#/popup/general", 15_000)
		await switchToLocalNetwork(control)

		const dappPage = await openPlayground(ctx)
		const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
		await clickByTestId(dappPage, "pg-btn-connect")
		await approveVerify(await approveConnect(ctx, await discoverP))
		await dappPage.waitForSelector(CONNECTED, { timeout: 20_000 })

		await clickByTestId(dappPage, "pg-btn-disconnect")
		await dappPage.waitForSelector('[data-testid="pg-status"][data-status="disconnected"]', { timeout: 10_000 })
		await dappPage.reload({ waitUntil: "domcontentloaded" })
		await dappPage.waitForSelector('[data-testid="pg-status"]', { timeout: 10_000 })

		const created = await recordCreatedWindows(control)
		const checkP = waitForPopup(ctx, "verify", { timeout: 30_000 })
		await clickByTestId(dappPage, "pg-btn-connect")
		const check = await checkP
		await check.waitForSelector('[data-testid="verify-emoji-grid"]', { visible: true, timeout: 30_000 })
		const shown = await check.evaluate(async () => ({
			window: (await chrome.windows.getCurrent()).id,
			isReconnect: new URLSearchParams(location.hash.split("?")[1]).get("isReconnect"),
		}))
		expect(shown).toEqual({ window: expect.any(Number), isReconnect: "true" })

		await approveVerify(check)
		await dappPage.waitForSelector(CONNECTED, { timeout: 20_000 })
		expect(await created()).toEqual([{ id: shown.window, type: "popup" }])
		await dappPage.close()
	},
)
