import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { bringToFront, prepareKeys } from "../fixtures/browser"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { navigateByHash, switchToLocalNetwork } from "../fixtures/helpers"
import { openPlayground } from "../fixtures/playground"
import { approveConnect, approveVerify, recordWindowChanges, waitForPopup } from "../fixtures/popups"
import { settleThemeTransitions, shotSend } from "../fixtures/send-page"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const ALLOW = '[data-testid="discover-allow-btn"]'
const EVERY_SITE = '[data-testid="discover-every-site"]'
const CONFIRM = '[data-testid="confirm-submit"]'
const TOGGLE = '[data-testid="every-site-toggle"]'
const APP_ROW = '[data-testid="connected-app-row"]'
const GRID = '[data-testid="verify-emoji-grid"]'
const CONNECTED = '[data-testid="pg-status"][data-status="connected"]'
const DISCONNECTED = '[data-testid="pg-status"][data-status="disconnected"]'

async function walletOnLocalNetwork(ctx: ExtensionContext): Promise<Page> {
	const wallet = await openPopup(ctx)
	await waitForHash(wallet, "#/popup/general", 15_000)
	await switchToLocalNetwork(wallet)
	return wallet
}

/** The Connected Apps switch once read, as stored for the profile. */
async function readEverySite(wallet: Page): Promise<boolean> {
	await wallet.waitForFunction(
		(sel: string) => document.querySelector(sel)?.getAttribute("data-toggle-disabled") === "false",
		{ timeout: 15_000, polling: 100 },
		TOGGLE,
	)
	return wallet.$eval(TOGGLE, (el) => el.getAttribute("data-toggle-active") === "true")
}

async function enabledAllow(connect: Page): Promise<void> {
	await connect.waitForFunction(
		(allow: string, everySite: string) =>
			[allow, everySite].every((sel) => {
				const button = document.querySelector<HTMLButtonElement>(sel)
				return !!button && !button.disabled
			}),
		{ timeout: 30_000, polling: 200 },
		ALLOW,
		EVERY_SITE,
	)
}

/**
 * The connect window's "Allow every site" asks the Settings confirm inside the window, which no
 * other window opens: Escape closes it with nothing written, Turn on writes the profile's sealed
 * switch and answers the site as Allow. Settings → Connected Apps then reads it on, and a site the
 * person disconnected reconnects with no connect window, through the emoji check.
 */
test.skipIf(!aztecConfig)(
	"connect-every-site — Allow every site asks first; then a disconnected app reconnects with no connect window",
	{ timeout: 180_000 },
	async ({ registeredExtensionPerTest: ctx }) => {
		const wallet = await walletOnLocalNetwork(ctx)
		await navigateByHash(wallet, "#/popup/settings/connected-apps")
		expect(await readEverySite(wallet)).toBe(false)

		const dapp = await openPlayground(ctx)
		const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
		await clickByTestId(dapp, "pg-btn-connect")
		const connect = await discoverP
		await enabledAllow(connect)
		// The two buttons fade in as they enable; a shot mid-fade reads them washed out.
		await settleThemeTransitions(connect)
		await shotSend(connect, "every-site-window", "discover-every-site")

		await clickByTestId(connect, "discover-every-site")
		await connect.waitForSelector(CONFIRM, { visible: true, timeout: 10_000 })
		await shotSend(connect, "every-site-window-confirm", "confirm-submit")
		await prepareKeys(connect)
		await connect.keyboard.press("Escape")
		await connect.waitForSelector(CONFIRM, { hidden: true, timeout: 10_000 })
		expect(connect.isClosed()).toBe(false)
		await enabledAllow(connect)
		await bringToFront(wallet)
		await navigateByHash(wallet, "#/popup/settings/connected-apps")
		expect(await readEverySite(wallet)).toBe(false)

		await bringToFront(connect)
		const check = await approveConnect(ctx, connect, async () => {
			await clickByTestId(connect, "discover-every-site")
			await connect.waitForSelector(CONFIRM, { visible: true, timeout: 10_000 })
			await clickByTestId(connect, "confirm-submit")
		})
		await approveVerify(check)
		await dapp.waitForSelector(CONNECTED, { timeout: 20_000 })

		// The page stayed open on Connected Apps: it reads the switch again when the window writes it.
		await bringToFront(wallet)
		await wallet.waitForFunction(
			(sel: string) => document.querySelector(sel)?.getAttribute("data-toggle-active") === "true",
			{ timeout: 10_000, polling: 100 },
			TOGGLE,
		)
		await wallet.waitForSelector(APP_ROW, { visible: true, timeout: 15_000 })

		// Disconnect forgets the site; with the switch on, its next connection asks nothing first.
		await bringToFront(dapp)
		await clickByTestId(dapp, "pg-btn-disconnect")
		await dapp.waitForSelector(DISCONNECTED, { timeout: 10_000 })
		await bringToFront(wallet)
		await clickByTestId(wallet, "session-disconnect")
		await wallet.waitForSelector(CONFIRM, { visible: true, timeout: 10_000 })
		await clickByTestId(wallet, "confirm-submit")
		await wallet.waitForFunction((sel: string) => document.querySelector(sel) === null, { timeout: 10_000, polling: 100 }, APP_ROW)

		const changes = await recordWindowChanges(wallet)
		const recheckP = waitForPopup(ctx, "verify", { timeout: 30_000 })
		await bringToFront(dapp)
		await clickByTestId(dapp, "pg-btn-connect")
		const recheck = await recheckP
		await recheck.waitForSelector(GRID, { visible: true, timeout: 30_000 })
		const recheckWindow = await recheck.evaluate(async () => (await chrome.windows.getCurrent()).id)
		expect((await changes()).filter((c) => c.change === "created").map((c) => c.id)).toEqual([recheckWindow])
		await approveVerify(recheck)
		await dapp.waitForSelector(CONNECTED, { timeout: 20_000 })

		await bringToFront(wallet)
		await wallet.waitForSelector(APP_ROW, { visible: true, timeout: 15_000 })
		await shotSend(wallet, "every-site-connected-apps", "privacy-row-every-site")
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)
