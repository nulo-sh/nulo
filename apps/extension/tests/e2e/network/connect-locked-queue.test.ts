import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import type { Page } from "puppeteer"
import { describe, expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { isFirefox, reloadExtensionPage } from "../fixtures/browser"
import { TEST_PASSWORD } from "../fixtures/constants"
import {
	clickByTestId,
	grantCapBundle,
	openPopup,
	replaceInputValue,
	test,
	waitForHash,
	type ExtensionContext,
} from "../fixtures/extension"
import { lockWallet, switchToLocalNetwork } from "../fixtures/helpers"
import { registerPasskeyProfile, setupPasskeyVirtualAuth } from "../fixtures/passkey"
import { assertPgOk, callExpectingNoPopup, openPlayground, selectPgBundle, setPgInput, setPgTextarea } from "../fixtures/playground"
import { approveConnect, approveVerify, readWindowId, recordCreatedWindows, waitForPopup } from "../fixtures/popups"
import { serializeInstance } from "../fixtures/selfpay-phase"
import { shotSend } from "../fixtures/shots"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A dApp that asks to connect while the wallet is locked opens one window: the site's origin over the
 * lock screen. Unlocked there, the same window becomes the connect window. Closed instead, it refuses
 * nothing: the badge keeps the request, and an unlock from the toolbar still connects. Either way the
 * session that opens serves every method the app uses, from the same page and from a reloaded one.
 * The password run unlocks in the window; the passkey run, whose credential lives on the toolbar
 * page, closes the window and unlocks there.
 */
async function openUnlockWindow(ctx: ExtensionContext, control: Page) {
	const dappPage = await openPlayground(ctx)
	const created = await recordCreatedWindows(control)
	const unlockP = waitForPopup(ctx, "unlock", { timeout: 30_000 })
	await clickByTestId(dappPage, "pg-btn-connect")
	const unlockWindow = await unlockP
	await unlockWindow.waitForSelector('[data-testid="auth-submit"]', { visible: true, timeout: 15_000 })
	const site = await unlockWindow.$eval('[data-testid="unlock-site"]', (el) => el.textContent?.trim())
	expect(site).toBe(new URL(dappPage.url()).origin)
	expect(await created()).toHaveLength(1)
	return { dappPage, unlockWindow, created }
}

/** Typed into the unlock window, the password turns that window into the connect window. */
async function unlockInWindow(ctx: ExtensionContext, control: Page): Promise<Page> {
	const { dappPage, unlockWindow, created } = await openUnlockWindow(ctx, control)
	await shotSend(unlockWindow, isFirefox ? "ld1-unlock-window-firefox" : "ld1-unlock-window", "unlock-site")
	const windowId = await readWindowId(unlockWindow)
	const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
	await replaceInputValue(unlockWindow, '[data-testid="auth-password-input"]', TEST_PASSWORD)
	await clickByTestId(unlockWindow, "auth-submit")
	const discoverPage = await discoverP
	expect(await readWindowId(discoverPage)).toBe(windowId)
	await discoverPage.waitForSelector('[data-testid="discover-allow-btn"]', { visible: true, timeout: 30_000 })
	expect(await created()).toHaveLength(1)
	await shotSend(discoverPage, isFirefox ? "ld1-after-unlock-firefox" : "ld1-after-unlock", "discover-allow-btn")
	await approveVerify(await approveConnect(ctx, discoverPage))
	await dappPage.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 20_000 })
	return dappPage
}

/** Closed without an unlock, the window leaves the request queued; `unlock` then drains it into a
 *  connect window of its own. */
async function closeThenUnlock(ctx: ExtensionContext, control: Page, unlock: () => Promise<void>): Promise<Page> {
	const { dappPage, unlockWindow } = await openUnlockWindow(ctx, control)
	await shotSend(unlockWindow, isFirefox ? "ld1-unlock-passkey-firefox" : "ld1-unlock-passkey", "unlock-site")
	await unlockWindow.close()
	await control.waitForFunction(async () => (await chrome.action.getBadgeText({})) === "1", { timeout: 10_000, polling: 250 })

	const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })
	await unlock()
	await approveVerify(await approveConnect(ctx, await discoverP))
	await dappPage.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 20_000 })
	return dappPage
}

/** The suite's token as a dApp registers it: the node's instance, serialized for the playground. */
async function tokenInstanceJson(): Promise<string> {
	const node = createAztecNodeClient(aztecConfig!.nodeUrl)
	const instance = await node.getContract(AztecAddress.fromStringUnsafe(aztecConfig!.tokenAddress))
	if (!instance) throw new Error(`token ${aztecConfig!.tokenAddress} not found at the node`)
	return serializeInstance(instance)
}

/** getAccounts, registerContract, a utility read and simulateTx all answer ok, with no window. */
async function expectSessionServes(ctx: ExtensionContext, page: Page, account: string, label: string): Promise<void> {
	const accounts = await callExpectingNoPopup(ctx, page, "getAccounts", () => clickByTestId(page, "pg-btn-getAccounts"))
	await assertPgOk(page, accounts, `${label}:getAccounts`)
	expect((accounts.resultJson as Array<{ item: string }>).map((a) => a.item.toLowerCase())).toContain(account.toLowerCase())

	await setPgTextarea(page, "phase-tokenInstance", await tokenInstanceJson())
	const registered = await callExpectingNoPopup(ctx, page, "phase.register", () => clickByTestId(page, "pg-btn-phase-register"), 60_000)
	await assertPgOk(page, registered, `${label}:registerContract`)
	// balance_of_private is a utility function; the playground's own executeUtility button reads
	// balance_of_public, which is public and fails on every session.
	const utility = await callExpectingNoPopup(ctx, page, "phase.balance", () => clickByTestId(page, "pg-btn-phase-balance"), 90_000)
	await assertPgOk(page, utility, `${label}:executeUtility`)

	await setPgInput(page, "tokenAddress", aztecConfig!.tokenAddress)
	await setPgInput(page, "recipient", aztecConfig!.minterAddress)
	// Zero moves nothing, so the simulation needs no balance on a never-sent account.
	await setPgInput(page, "amount", "0")
	const simulation = await callExpectingNoPopup(ctx, page, "simulateTx", () => clickByTestId(page, "pg-btn-simulateTx-transfer"), 120_000)
	await assertPgOk(page, simulation, `${label}:simulateTx`)
}

/** Reload the app, reconnect through the remembered session's emoji check, and re-ask for the
 *  accounts bundle: already granted, so it answers without a window. */
async function reconnectAfterReload(ctx: ExtensionContext, page: Page, label: string): Promise<void> {
	await reloadExtensionPage(page)
	await page.waitForSelector('[data-testid="pg-btn-connect"]', { visible: true, timeout: 30_000 })
	const verifyP = waitForPopup(ctx, "verify", { timeout: 30_000 })
	await clickByTestId(page, "pg-btn-connect")
	await approveVerify(await verifyP)
	await page.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 20_000 })
	await selectPgBundle(page, "accounts")
	const caps = await callExpectingNoPopup(ctx, page, "requestCapabilities", () => clickByTestId(page, "pg-btn-requestCapabilities"))
	await assertPgOk(page, caps, `${label}:requestCapabilities after reload`)
}

const firstAccount = async (accountIds: (string | null)[]): Promise<string[]> => {
	const address = accountIds[0]
	if (!address) throw new Error("capabilities popup returned no accounts")
	return [address]
}

/** The whole flow after the wallet is unlocked from a queued discovery. */
async function expectLockedConnectServes(ctx: ExtensionContext, connect: () => Promise<Page>, label: string): Promise<void> {
	const page = await connect()
	const [account] = await grantCapBundle(ctx, page, "accounts", firstAccount)
	await expectSessionServes(ctx, page, account!, label)

	await reconnectAfterReload(ctx, page, label)
	await expectSessionServes(ctx, page, account!, `${label}:reload`)
	await page.close()
}

describe("connect-locked-queue — a discovery while locked opens the unlock window", () => {
	test.skipIf(!hasConfig)(
		"connect-locked-queue — password unlock in the window: the same window connects, and the session serves every method, also after a reload",
		{ timeout: 300_000 },
		async ({ registeredExtensionPerTest }) => {
			const ctx = registeredExtensionPerTest
			const popup = await openPopup(ctx)
			await waitForHash(popup, "#/popup/general")
			await switchToLocalNetwork(popup)
			await lockWallet(popup)

			await expectLockedConnectServes(ctx, () => unlockInWindow(ctx, popup), "password")
			await popup.close()
		},
	)

	test.skipIf(!hasConfig)(
		"connect-locked-queue — passkey: the window closed refuses nothing, a toolbar unlock connects, and the session serves every method, also after a reload",
		{ timeout: 300_000 },
		async ({ freshExtensionPerTest }) => {
			const ctx = freshExtensionPerTest
			// The credential lives on the page the authenticator was added to, so every ceremony
			// (register, then the unlock) runs in this one popup, kept open throughout.
			const anchor = await openPopup(ctx)
			const auth = await setupPasskeyVirtualAuth(ctx.browser, anchor)
			try {
				await registerPasskeyProfile(anchor)
				await switchToLocalNetwork(anchor)
				await lockWallet(anchor)

				const unlockWithPasskey = async () => {
					await anchor.waitForFunction(
						() => {
							const btn = document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')
							return btn !== null && !btn.disabled
						},
						{ timeout: 15_000 },
					)
					await clickByTestId(anchor, "auth-submit")
					await waitForHash(anchor, "#/popup/general", 60_000)
				}
				await expectLockedConnectServes(ctx, () => closeThenUnlock(ctx, anchor, unlockWithPasskey), "passkey")
			} finally {
				await auth.cleanup()
			}
		},
	)
})
