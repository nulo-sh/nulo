import { expect, inject } from "vitest"
import type { Page } from "puppeteer"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { clickByTestId, connectPlayground, openPopup, test, waitForHash } from "../fixtures/extension"
import { snapshotResultSeq, waitForPgResult, assertPgOk } from "../fixtures/playground"
import { waitForPopup, approveCapabilities } from "../fixtures/popups"
import { callService } from "../fixtures/session"
import { expectFitsNarrow } from "../fixtures/type-roles"
import type { AztecTestConfig } from "../fixtures/aztec"
import { readNetworkRows } from "../helpers/identity-rows"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A dApp connecting on a chain the wallet has never activated.
 *
 * A new profile starts on Mainnet, the default network, and the playground's default chainInfo
 * resolves to Local Network, so NOT switching first (every other connect fixture does) is exactly
 * the mismatch a user hits when the wallet is on one network and the app on another. The wallet
 * must provision the Local Network default account on demand, list it, name the chain, and let the
 * user either approve as is or switch first.
 *
 * The first test names the app's chain with the longest one-word name the network name field takes,
 * so the window is laid out at 240 px with it. The second keeps the seed name: once switched, the
 * strip names the app's chain and ends a long name in an ellipsis, which that check reads as cut.
 */
const LONG_NAME = "W".repeat(25)

type Ctx = Parameters<typeof connectPlayground>[0]

async function renameDappChain(ctx: Ctx, name: string): Promise<void> {
	const wallet = await openPopup(ctx)
	await waitForHash(wallet, "#/popup/general", 30_000)
	const local = (await readNetworkRows(wallet)).find((row) => row.chainId === 0)
	if (!local) throw new Error("no Local Network row")
	await callService(wallet, NETWORK_SERVICE_NAME, "renameNetwork", [local.id, name])
	await wallet.close()
}

async function requestAccountsCapability(ctx: Ctx, page: Page, dappChain = "Local Network") {
	const fromSeq = await snapshotResultSeq(page)
	await page.evaluate(() => {
		const select = document.querySelector<HTMLSelectElement>('[data-testid="pg-bundle-select"]')!
		select.value = "accounts"
		select.dispatchEvent(new Event("change", { bubbles: true }))
	})
	const popupP = waitForPopup(ctx, "capabilities", { timeout: 60_000 })
	await clickByTestId(page, "pg-btn-requestCapabilities")
	const popup = await popupP
	await popup.waitForSelector('[data-testid="cap-chain-banner"][data-state="mismatch"]', { timeout: 60_000 })
	const bannerText = await popup.$eval('[data-testid="cap-chain-banner"]', (el) => el.textContent ?? "")
	expect(bannerText).toContain(`Connecting on ${dappChain}`)
	expect(bannerText).toContain("Your wallet is on Alpha.")
	const accountIds = await popup.$$eval('[data-testid="cap-account-item"]', (rows) => rows.map((r) => r.getAttribute("data-account-id")))
	expect(accountIds).toHaveLength(1)
	return { popup, fromSeq, address: accountIds[0]! }
}

async function stripNetwork(popup: Page): Promise<string> {
	return popup.$eval('[data-testid="identity-network"]', (el) => el.textContent?.trim() ?? "")
}

async function approveAndAssertGranted(page: Page, popup: Page, fromSeq: number, address: string) {
	await approveCapabilities(popup, { accounts: [address] })
	const result = await waitForPgResult(page, "requestCapabilities", fromSeq, 30_000)
	await assertPgOk(page, result, "cap-chain-mismatch:result")
	const granted = await page.$$eval('[data-testid="pg-account-item"]', (items) => items.map((el) => el.getAttribute("data-account-id")))
	expect(granted).toContain(address)
}

test.skipIf(!hasConfig)(
	"cap-chain-mismatch — approve as is: the wallet stays on Mainnet, the app gets its chain's account, and a long chain name fits at 240 px",
	{ timeout: 180_000 },
	async ({ registeredExtensionPerTest }) => {
		await renameDappChain(registeredExtensionPerTest, LONG_NAME)
		const page = await connectPlayground(registeredExtensionPerTest)
		const { popup, fromSeq, address } = await requestAccountsCapability(registeredExtensionPerTest, page, LONG_NAME)
		// The window closes on approve — read the strip and the layout before deciding.
		expect(await stripNetwork(popup)).toBe("Alpha")
		await expectFitsNarrow(popup, "the capabilities window on a chain with a 25-character name")
		await approveAndAssertGranted(page, popup, fromSeq, address)
	},
)

test.skipIf(!hasConfig)(
	"cap-chain-mismatch — switch first: the banner settles, the strip follows, the same account is granted",
	{ timeout: 180_000 },
	async ({ registeredExtensionPerTest }) => {
		const page = await connectPlayground(registeredExtensionPerTest)
		const { popup, fromSeq, address } = await requestAccountsCapability(registeredExtensionPerTest, page)
		await clickByTestId(popup, "cap-switch-network-btn")
		await popup.waitForSelector('[data-testid="cap-chain-banner"][data-state="switched"]', { timeout: 30_000 })
		await popup.waitForFunction(
			() => document.querySelector('[data-testid="identity-network"]')?.textContent?.trim() === "Local Network",
			{ timeout: 30_000, polling: 200 },
		)
		await approveAndAssertGranted(page, popup, fromSeq, address)
	},
)
