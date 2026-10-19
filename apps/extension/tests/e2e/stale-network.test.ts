/**
 * A stale network meets its user: the unlock classifies stored rows an update left behind, the
 * takeover owns the popup, and the reset runs in place without the recovery phrase.
 *
 * Each test seeds its shape while the wallet is locked (`helpers/stale-network.ts`), so the unlock
 * runs the production classification. No node is needed: the reset is offline, and Mainnet's
 * endpoint is a closed loopback port.
 *
 * S1a  network reset: A1, a Switch network round trip, one reset from a double click, A4, then
 *      A5 only once the account is loaded; the row is back on the seed's chainId and the accounts
 *      keep their addresses, names and indexes; Local is untouched; Home's card stays hidden.
 * S1b  address change (A2) with a hidden account and an imported one: the derived accounts come
 *      back at their true addresses, the hidden one hidden, the imported one at its address with
 *      a key that opens.
 * S1c  Mainnet (A6): one button, no reset, and leaving it writes nothing to Mainnet's rows.
 * S1d  R2: deleting, from Networks, the network that holds the new chain brings back A1's reset.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { CHAIN_IDS, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { clickByTestId, launchExtension, openPopup, registerProfile, test, waitForHash } from "./fixtures/extension"
import {
	closeStuckPopup,
	createAccount,
	deleteNetworkRow,
	ensureUnlocked,
	lockWallet,
	navigateByHash,
	waitForToast,
} from "./fixtures/helpers"
import { confirmImport, exportAccountBody, exportImportedAccountBody, FIRST_ACCOUNT_NAME, previewImport } from "./helpers/account-io"
import {
	addNetwork,
	E2E_MAINNET_CHAIN_ID,
	PREVIOUS_TESTNET_CHAIN_ID,
	readAccounts,
	readNetwork,
	readTakeoverTrace,
	TAKEOVER,
	takeoverScreen,
	type StoredAccount,
	seedStaleMainnet,
	seedStaleNetwork,
	snapshotChain,
	traceTakeover,
} from "./helpers/stale-network"
import { getStartedRows, waitForHomeReminders } from "./fixtures/tokens"

const identity = ({ address, name, index, type, visible }: StoredAccount) => ({ address, name, index, type, visible })

/** Opens Networks from the takeover and activates `name` from its detail page. */
async function switchFromTakeover(page: Page, name: string): Promise<void> {
	await clickByTestId(page, "stale-network-switch")
	await waitForHash(page, "#/popup/settings/networks")
	const row = `[data-testid="network-row"][data-network-name="${name}"]`
	await page.waitForSelector(row, { visible: true, timeout: 10_000 })
	await page.evaluate((sel: string) => {
		document.querySelector(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	}, row)
	await clickByTestId(page, "network-set-active")
	await page.evaluate(() => {
		window.location.hash = "/popup/general"
	})
}

describe("stale network", () => {
	test("S1a network reset: A1, Switch network and back, one reset from a double click, A4, then A5 with the account loaded", {
		timeout: 240_000,
		retry: 0,
	}, async ({ registeredExtensionPerTest: ctx }) => {
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		await createAccount(page, "Savings")
		await closeStuckPopup(page)
		// The reset must keep the profile's reminder flags: after Hide, the card is the phrase row alone.
		await navigateByHash(page, "#/popup/general", 15_000)
		await waitForHomeReminders(page)
		await clickByTestId(page, "get-started-hide")
		await page.waitForSelector('[data-testid="get-started-aztec"]', { hidden: true, timeout: 10_000 })
		expect(await getStartedRows(page)).toEqual(["get-started-phrase"])
		const before = await readAccounts(page, CHAIN_IDS.TESTNET)
		expect(before.map((a) => [a.name, a.index])).toEqual([
			[FIRST_ACCOUNT_NAME, 0],
			["Savings", 1],
		])
		const local = await readNetwork(page, "local")
		const localBefore = await snapshotChain(page, local.chainId, local.id)

		await lockWallet(page)
		await seedStaleNetwork(page, "network-reset")
		await ensureUnlocked(page)
		expect(await takeoverScreen(page)).toBe("network-reset")
		expect(await page.$('[data-testid="account-address-copy"]')).toBeNull()
		expect(await page.$('[data-testid="home-scroller"]')).toBeNull()

		// Networks is reachable and shows no account; Back returns to the takeover.
		await clickByTestId(page, "stale-network-switch")
		await waitForHash(page, "#/popup/settings/networks")
		await page.waitForSelector('[data-testid="network-row"]', { visible: true, timeout: 10_000 })
		expect(await page.$(TAKEOVER)).toBeNull()
		expect(await page.$('[data-testid="account-address-copy"]')).toBeNull()
		expect(await page.$('[data-testid="header-account-loading"]')).toBeNull()
		await page.evaluate(() => history.back())
		expect(await takeoverScreen(page)).toBe("network-reset")

		await clickByTestId(page, "stale-network-reset")
		await page.waitForSelector('[data-testid="stale-confirm-submit"]', { visible: true, timeout: 10_000 })
		await traceTakeover(page)
		await page.evaluate(() => {
			const submit = document.querySelector<HTMLElement>('[data-testid="stale-confirm-submit"]')
			submit?.click()
			submit?.click()
		})
		await waitForToast(page, "Your accounts kept their addresses.", 120_000, { kind: "success" })
		const trace = await readTakeoverTrace(page)
		expect(trace.sawProgress).toBe(true)
		expect(trace.atToast).toEqual({ hash: "#/popup/general", account: true, takeover: false })

		expect((await readNetwork(page, "testnet")).chainId).toBe(CHAIN_IDS.TESTNET)
		expect((await readAccounts(page, CHAIN_IDS.TESTNET)).map(identity)).toEqual(before.map(identity))
		expect(await readAccounts(page, PREVIOUS_TESTNET_CHAIN_ID)).toEqual([])
		expect(await snapshotChain(page, local.chainId, local.id)).toEqual(localBefore)
		await waitForHomeReminders(page)
		expect(await getStartedRows(page)).toEqual(["get-started-phrase"])
	})

	test("S1b address change: A2; derived accounts return at their true addresses, the hidden one hidden, the imported one with its key", {
		timeout: 300_000,
		retry: 0,
	}, async ({ registeredExtensionPerTest: ctx }) => {
		// An account file from another master: the imported row is genuinely foreign.
		let foreignBody: string
		const donor = await launchExtension()
		try {
			await registerProfile(donor)
			const donorPage = await openPopup(donor)
			await waitForHash(donorPage, "#/popup/general", 30_000)
			foreignBody = await exportAccountBody(donorPage, FIRST_ACCOUNT_NAME, false)
		} finally {
			await donor.close()
		}

		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		await createAccount(page, "Savings")
		const importedAddress = await previewImport(page, foreignBody)
		expect(importedAddress).toBeTruthy()
		await confirmImport(page)
		await closeStuckPopup(page)
		const before = await readAccounts(page, CHAIN_IDS.TESTNET)
		expect(before.map((a) => a.type).sort()).toEqual([0, 0, 1])

		await lockWallet(page)
		await seedStaleNetwork(page, "address-change", { hideIndex: 1 })
		await ensureUnlocked(page)
		expect(await takeoverScreen(page)).toBe("new-addresses")

		await clickByTestId(page, "stale-network-reset")
		await clickByTestId(page, "stale-confirm-submit")
		await waitForToast(page, "Your accounts have new addresses.", 120_000, { kind: "success" })
		await waitForHash(page, "#/popup/general", 30_000)

		const after = await readAccounts(page, CHAIN_IDS.TESTNET)
		const derived = (rows: StoredAccount[]) => rows.filter((a) => a.type === 0).map(identity)
		expect(derived(after)).toEqual(derived(before).map((a) => (a.index === 1 ? { ...a, visible: false } : a)))
		expect(after.filter((a) => a.type === 1).map((a) => a.address)).toEqual([importedAddress])
		// The re-export preview re-derives the address from the decrypted key: only a key that opens passes.
		expect(await previewImport(page, await exportImportedAccountBody(page, false))).toBe(importedAddress)
	})

	test("S1c Mainnet: A6 offers one button and no reset, and leaving it writes nothing to Mainnet's rows", {
		timeout: 180_000,
		retry: 0,
	}, async ({ registeredExtensionPerTest: ctx }) => {
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		await lockWallet(page)
		const { networkId } = await seedStaleMainnet(page)
		const mainnetBefore = await snapshotChain(page, E2E_MAINNET_CHAIN_ID, networkId)
		await ensureUnlocked(page)

		expect(await takeoverScreen(page)).toBe("blocked")
		const controls = await page.$$eval(`${TAKEOVER} button`, (buttons) => buttons.map((b) => b.getAttribute("data-testid")))
		expect(controls).toEqual(["stale-network-chip", "stale-network-lock", "stale-network-switch"])

		await switchFromTakeover(page, "Testnet")
		await page.waitForSelector('[data-testid="account-address-copy"]', { visible: true, timeout: 60_000 })
		expect(await page.$(TAKEOVER)).toBeNull()
		expect(await snapshotChain(page, E2E_MAINNET_CHAIN_ID, networkId)).toEqual(mainnetBefore)
	})

	test("S1d R2: deleting the network that holds the new chain, from Networks, brings back A1's reset", {
		timeout: 180_000,
		retry: 0,
	}, async ({ registeredExtensionPerTest: ctx }) => {
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		await lockWallet(page)
		await seedStaleNetwork(page, "network-reset")
		await addNetwork(page, {
			name: "My Testnet",
			kind: "custom",
			chainId: CHAIN_IDS.TESTNET,
			l1ChainId: TESTNET_L1_CHAIN_ID,
			movedAccount: false,
			active: false,
		})
		await ensureUnlocked(page)
		expect(await takeoverScreen(page)).toBe("already-added")

		await clickByTestId(page, "stale-network-open-networks")
		await waitForHash(page, "#/popup/settings/networks")
		await deleteNetworkRow(page, "My Testnet")
		await navigateByHash(page, "#/popup/general", 15_000)
		expect(await takeoverScreen(page, "network-reset", 15_000)).toBe("network-reset")
	})
})
