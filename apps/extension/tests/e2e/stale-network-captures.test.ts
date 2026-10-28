/**
 * Stale-network captures, opt-in: `STALE_NETWORK_CAPTURES=1` renders every state of the approved
 * layout into `tests/e2e/.captures/` (gitignored), one file per reference, at the popup's 360×600
 * and 2×, dark and light. Skipped in every other run, and on Firefox: the references are compared at one
 * browser's pixels.
 *
 * Every frame is the real popup over seeded storage. A running reset (A4) is frozen by holding
 * one storage write inside the background, never by a build flag. A10, a send refused because an
 * imported key does not open, needs a node to reach the send, so the network suite captures it.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { isFirefox, setViewport } from "./fixtures/browser"
import { clickByTestId, launchExtension, openPopup, registerProfile, test, waitForHash } from "./fixtures/extension"
import {
	closeStuckPopup,
	createAccount,
	ensureUnlocked,
	lockWallet,
	navigateByHash,
	waitForLockScreen,
	waitForToast,
} from "./fixtures/helpers"
import { switchToNetwork } from "./fixtures/networks"
import { confirmImport, exportAccountBody, FIRST_ACCOUNT_NAME, previewImport } from "./helpers/account-io"
import {
	addNetwork,
	DEAD_NODE,
	type NetworkRow,
	readNetworkRows,
	seedStaleMainnet,
	seedStaleNetwork,
	takeoverScreen,
} from "./helpers/stale-network"
import { CAPTURE_VIEWPORT, CAPTURES_ENABLED, capture } from "./helpers/stale-network-capture"
import {
	armHold,
	corruptImportedKeys,
	forgetTestnetAccounts,
	heldWrites,
	releaseHold,
	removeNetwork,
	seedStaleLocal,
	setTestnetPrimary,
} from "./helpers/stale-network-capture-seeds"
import { CHAIN_IDS, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"

async function text(page: Page, needle: string, timeout = 60_000): Promise<void> {
	await page.waitForFunction((t: string) => document.body.textContent?.includes(t), { timeout, polling: 100 }, needle)
}

/** Locks from wherever the popup is: the takeover replaces the Header and carries its own LOCK. */
async function lockAnywhere(page: Page): Promise<void> {
	if (await page.$('[data-testid="stale-network-lock"]')) {
		await clickByTestId(page, "stale-network-lock")
		await waitForLockScreen(page)
	} else {
		await lockWallet(page)
	}
}

/** Locks, seeds, unlocks. The seed gets the networks read before the lock: the network service
 *  serves none to a locked profile, and a sealed row opens only in the background. */
async function relock(page: Page, seed: (networks: NetworkRow[]) => Promise<unknown>): Promise<void> {
	const networks = await readNetworkRows(page)
	await lockAnywhere(page)
	await seed(networks)
	await ensureUnlocked(page)
}

describe.skipIf(!CAPTURES_ENABLED || isFirefox)("stale-network captures", () => {
	test("every takeover state, dark and light", { timeout: 900_000, retry: 0 }, async ({ registeredExtension: ctx }) => {
		let foreignBody: string
		const donor = await launchExtension()
		try {
			await registerProfile(donor)
			const donorPage = await openPopup(donor)
			await waitForHash(donorPage, "#/popup/general", 30_000)
			await switchToNetwork(donorPage, "Testnet")
			foreignBody = await exportAccountBody(donorPage, FIRST_ACCOUNT_NAME, false)
		} finally {
			await donor.close()
		}

		const page = await openPopup(ctx)
		await setViewport(page, CAPTURE_VIEWPORT)
		await waitForHash(page, "#/popup/general", 30_000)
		// A new profile starts on Mainnet; every takeover below is Testnet's.
		await switchToNetwork(page, "Testnet")
		await createAccount(page, "Account 2")
		await closeStuckPopup(page)

		// A1, A3, then A4b, A4 and A5 from one held run.
		await relock(page, (networks) => seedStaleNetwork(page, "network-reset", { networks }))
		await takeoverScreen(page, "network-reset")
		await capture(page, "A1-network-reset")
		await clickByTestId(page, "stale-network-reset")
		await page.waitForSelector('[data-testid="stale-confirm"]', { visible: true })
		await capture(page, "A3-confirm")
		await armHold(ctx, "purged")
		await clickByTestId(page, "stale-confirm-submit")
		await text(page, "Removing old data")
		await capture(page, "A4b-removing")
		await releaseHold(ctx, "second-account")
		await text(page, "Moving Account 2")
		await capture(page, "A4-resetting")
		await releaseHold(ctx)
		await waitForToast(page, "Testnet is ready", 120_000)
		await capture(page, "A5b-as-built")

		// A15: Networks over a quarantined Testnet; A1b: the user's node does not serve the new chain.
		await relock(page, async (networks) => {
			await seedStaleNetwork(page, "network-reset", { networks })
			await setTestnetPrimary(page, DEAD_NODE, networks)
		})
		await takeoverScreen(page, "network-reset")
		await page.waitForSelector('[data-testid="stale-network-node-line"]', { visible: true, timeout: 30_000 })
		await capture(page, "A1b-node-line")
		await clickByTestId(page, "stale-network-switch")
		await waitForHash(page, "#/popup/settings/networks")
		await page.waitForSelector('[data-testid="network-row"]', { visible: true })
		await capture(page, "A15-header")
		await page.evaluate(() => history.back())

		// R2: the new Testnet chain is already a network of the profile.
		const held = await (async () => {
			let id = ""
			await relock(page, async (networks) => {
				await setTestnetPrimary(page, null, networks)
				id = (
					await addNetwork(
						page,
						{
							name: "My Testnet",
							kind: "custom",
							chainId: CHAIN_IDS.TESTNET,
							l1ChainId: TESTNET_L1_CHAIN_ID,
							movedAccount: false,
							active: false,
						},
						networks,
					)
				).networkId
			})
			return id
		})()
		await takeoverScreen(page, "already-added")
		await capture(page, "R2-already-added")

		// R1 and the Full Backup notice: a run whose purge record is refused stops, and its journal stays.
		await relock(page, (networks) => removeNetwork(page, held, networks))
		await takeoverScreen(page, "network-reset")
		await armHold(ctx, "fail-purged")
		await clickByTestId(page, "stale-network-reset")
		await clickByTestId(page, "stale-confirm-submit")
		await takeoverScreen(page, "paused")
		expect(await heldWrites(ctx)).toBeGreaterThan(0)
		await capture(page, "R1-paused")
		await navigateByHash(page, "#/popup/settings/security/export/full", 15_000)
		await page.waitForSelector('[data-testid="full-backup-reset-notice"]', { visible: true, timeout: 15_000 })
		await capture(page, "A11-backup-notice")
		await navigateByHash(page, "#/popup/general", 15_000)
		await takeoverScreen(page, "paused")

		// R3: Local is stale too, and Testnet's reset has not finished (the hold refuses its resume).
		await relock(page, (networks) => seedStaleLocal(page, networks))
		await takeoverScreen(page, "one-at-a-time")
		await capture(page, "R3-one-at-a-time")
		await releaseHold(ctx)
		await clickByTestId(page, "stale-network-go-to")
		await takeoverScreen(page, "paused")
		await clickByTestId(page, "stale-network-retry")
		await waitForToast(page, "Testnet is ready", 120_000)

		// A2, then A3b: an imported key that no longer opens.
		await relock(page, (networks) => seedStaleNetwork(page, "address-change", { networks }))
		await takeoverScreen(page, "new-addresses")
		await capture(page, "A2-new-addresses")
		await clickByTestId(page, "stale-network-reset")
		await clickByTestId(page, "stale-confirm-submit")
		await waitForToast(page, "Your accounts have new addresses.", 120_000)
		expect(await previewImport(page, foreignBody)).toBeTruthy()
		await confirmImport(page, "Imported 1")
		await closeStuckPopup(page)

		// R1b: a paused reset whose journal holds an imported key: export leads, at both scroll
		// positions, and the export page lists the held account. An address change keeps the chain, so
		// the key still opens; the network-reset seed renames its chain, which its seal binds.
		await relock(page, (networks) => seedStaleNetwork(page, "address-change", { networks }))
		await takeoverScreen(page, "new-addresses")
		await armHold(ctx, "fail-purged")
		await clickByTestId(page, "stale-network-reset")
		await clickByTestId(page, "stale-confirm-submit")
		await takeoverScreen(page, "paused")
		await page.waitForSelector('[data-testid="stale-network-export"]', { visible: true, timeout: 15_000 })
		await capture(page, "R1b-paused-export")
		await page.evaluate(() => document.querySelector('[data-testid="stale-network-note"]')?.scrollIntoView({ block: "end" }))
		await capture(page, "R1b-paused-export-scrolled")
		await clickByTestId(page, "stale-network-export")
		await waitForHash(page, "#/popup/settings/security/export/account")
		await page.waitForSelector('[data-testid="export-account-row"][data-account-name="Imported 1"]', { visible: true, timeout: 15_000 })
		await capture(page, "R1b-export-held")
		await releaseHold(ctx)
		await navigateByHash(page, "#/popup/general", 15_000)
		await takeoverScreen(page, "paused")
		await clickByTestId(page, "stale-network-retry")
		await waitForToast(page, "Your accounts have new addresses.", 120_000)
		await relock(page, async (networks) => {
			await seedStaleNetwork(page, "network-reset", { networks })
			expect(await corruptImportedKeys(page)).toBe(1)
		})
		await takeoverScreen(page, "network-reset")
		await clickByTestId(page, "stale-network-reset")
		await page.waitForSelector('[data-testid="stale-confirm-unmovable"]', { visible: true })
		await capture(page, "A3b-cannot-move")
		await clickByTestId(page, "stale-confirm-cancel")

		// R4: a custom network whose addresses moved, on a node that does not answer.
		let devnet = ""
		await relock(page, async (networks) => {
			devnet = (
				await addNetwork(
					page,
					{
						name: "My Devnet",
						kind: "custom",
						chainId: 31337 ^ 7,
						l1ChainId: 31337,
						movedAccount: true,
						active: true,
					},
					networks,
				)
			).networkId
		})
		await takeoverScreen(page, "new-addresses")
		await clickByTestId(page, "stale-network-reset")
		await clickByTestId(page, "stale-confirm-submit")
		await takeoverScreen(page, "node-down")
		await capture(page, "R4-node-down")

		// A6: Mainnet, whose addresses moved.
		await relock(page, async (networks) => {
			await removeNetwork(page, devnet, networks)
			await seedStaleMainnet(page, networks)
		})
		await takeoverScreen(page, "blocked")
		await capture(page, "A6-mainnet-blocked")

		// A4c, then A15b: the first switch to Local, still stale from R3 and never opened, resets it
		// behind A4c, then is held while it creates Local's default account.
		await clickByTestId(page, "stale-network-switch")
		await waitForHash(page, "#/popup/settings/networks")
		await armHold(ctx, "purged")
		const local = '[data-testid="network-row"][data-network-name="Local Network"]'
		await page.waitForSelector(local, { visible: true })
		await page.evaluate((sel: string) => {
			document.querySelector(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
		}, local)
		await clickByTestId(page, "network-set-active")
		await takeoverScreen(page, "loading")
		await capture(page, "A4c-loader")
		await releaseHold(ctx, "local-default-account")
		await navigateByHash(page, "#/popup/general", 15_000)
		await page.waitForSelector('[data-testid="header-account-loading"]', { visible: true, timeout: 30_000 })
		await capture(page, "A15b-header-loading")
		await releaseHold(ctx)
		await page.waitForSelector('[data-testid="account-address-copy"]', { visible: true, timeout: 60_000 })

		// A1c and A3c: a Testnet this profile never opened, whose only change is the move off the
		// user's node.
		await relock(page, async (networks) => {
			await forgetTestnetAccounts(page, networks)
			await setTestnetPrimary(page, DEAD_NODE, networks)
		})
		await takeoverScreen(page, "network-reset")
		await page.waitForSelector('[data-testid="stale-network-node-line"]', { visible: true, timeout: 30_000 })
		await capture(page, "A1c-never-opened")
		await clickByTestId(page, "stale-network-reset")
		await page.waitForSelector('[data-testid="stale-confirm"]', { visible: true })
		await capture(page, "A3c-never-opened")
		await clickByTestId(page, "stale-confirm-cancel")
	})
})
