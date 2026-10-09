import { expect, inject } from "vitest"
import type { Page } from "puppeteer"
import type { AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { navigateByHash, switchToLocalNetwork } from "../fixtures/helpers"
import { openPlayground } from "../fixtures/playground"
import { approveConnect, approveVerify, waitForPopup } from "../fixtures/popups"
import { shotSend } from "../fixtures/send-page"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const CONNECTED = '[data-testid="pg-status"][data-status="connected"]'
const DISCONNECTED = '[data-testid="pg-status"][data-status="disconnected"]'
const APP_ROW = '[data-testid="connected-app-row"]'

/** The wallet tab stays on Connected apps across the refusal, so the row is seen before it and its
 *  removal is the wallet's own delete event, never the list's first empty render. */

async function walletOnLocalNetwork(ctx: ExtensionContext): Promise<Page> {
	const wallet = await openPopup(ctx)
	await waitForHash(wallet, "#/popup/general", 15_000)
	await switchToLocalNetwork(wallet)
	return wallet
}

async function listConnectedApps(wallet: Page): Promise<void> {
	await navigateByHash(wallet, "#/popup/settings/connected-apps")
	await wallet.waitForSelector(APP_ROW, { visible: true, timeout: 15_000 })
}

async function refuseAndExpectForgotten(check: Page, dapp: Page, wallet: Page): Promise<void> {
	const closed = new Promise<void>((resolve) => check.once("close", () => resolve()))
	await clickByTestId(check, "verify-mismatch-btn")
	await Promise.race([
		closed,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the check window did not close within 10s")), 10_000)),
	])
	await dapp.waitForSelector(DISCONNECTED, { timeout: 20_000 })
	await wallet.waitForFunction(
		(sel: string) => location.hash === "#/popup/settings/connected-apps" && document.querySelector(sel) === null,
		{ timeout: 10_000, polling: 100 },
		APP_ROW,
	)
}

test.skipIf(!hasConfig)(
	"connect-verify-mismatch — a new connection's check refused in the connect window",
	{ timeout: 120_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		const wallet = await walletOnLocalNetwork(ctx)
		const dapp = await openPlayground(ctx)
		const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
		await clickByTestId(dapp, "pg-btn-connect")
		const check = await approveConnect(ctx, await discoverP)
		await dapp.waitForSelector(CONNECTED, { timeout: 20_000 })
		await listConnectedApps(wallet)
		await shotSend(check, "verify-mismatch-new", "verify-mismatch-btn")

		await refuseAndExpectForgotten(check, dapp, wallet)
		expect(ctx.pageErrors).toEqual([])
	},
)

test.skipIf(!hasConfig)(
	"connect-verify-mismatch — an untrusted reconnect's check refused in its own window",
	{ timeout: 150_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		const wallet = await walletOnLocalNetwork(ctx)
		const dapp = await openPlayground(ctx)
		const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
		await clickByTestId(dapp, "pg-btn-connect")
		await approveVerify(await approveConnect(ctx, await discoverP))
		await dapp.waitForSelector(CONNECTED, { timeout: 20_000 })

		// The app's page shows the same flag the check sets, still off.
		await listConnectedApps(wallet)
		await clickByTestId(wallet, "connected-app-row")
		await wallet.waitForSelector(
			'[data-testid="connected-app-verification"] [data-testid="toggle-switch"][data-toggle-active="false"]',
			{ visible: true, timeout: 15_000 },
		)
		await shotSend(wallet, "verify-mismatch-settings-row", "connected-app-verification")

		await clickByTestId(dapp, "pg-btn-disconnect")
		await dapp.waitForSelector(DISCONNECTED, { timeout: 10_000 })
		await listConnectedApps(wallet)

		const checkP = waitForPopup(ctx, "verify", { timeout: 30_000 })
		await clickByTestId(dapp, "pg-btn-connect")
		const check = await checkP
		await check.waitForSelector('[data-testid="verify-emoji-grid"]', { visible: true, timeout: 30_000 })
		await dapp.waitForSelector(CONNECTED, { timeout: 20_000 })
		await shotSend(check, "verify-mismatch-reconnect", "verify-mismatch-btn")

		await refuseAndExpectForgotten(check, dapp, wallet)
		expect(ctx.pageErrors).toEqual([])
	},
)
