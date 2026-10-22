/**
 * The active network is a custom one whose node never answers and that holds no account yet. The
 * unlock still finishes: the account waits for its node, the chip reads the node inactive, and the
 * chip opens Networks, where the person can switch. `app.vue`'s start has no unit harness, so only
 * the real shell proves it.
 */
import { describe, expect } from "vitest"
import { TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { clickByTestId, openPopup, test, waitForHash } from "./fixtures/extension"
import { ensureUnlocked, lockWallet } from "./fixtures/helpers"
import { addNetwork, readNetworkRows } from "./helpers/stale-network"

/** A chainId no seed carries, so no stored account matches it. */
const CUSTOM_CHAIN_ID = 777_000_001

describe("start on a dead custom node", () => {
	test("the unlock finishes with the chip inactive and the account waiting, and the chip opens Networks", {
		timeout: 90_000,
		retry: 0,
	}, async ({ registeredExtensionPerTest: ctx }) => {
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		const networks = await readNetworkRows(page)
		await lockWallet(page)
		await addNetwork(
			page,
			{
				name: "My Node",
				kind: "custom",
				chainId: CUSTOM_CHAIN_ID,
				l1ChainId: TESTNET_L1_CHAIN_ID,
				movedAccount: false,
				active: true,
			},
			networks,
		)
		await ensureUnlocked(page)

		await page.waitForSelector('[data-testid="network-button"][data-status="inactive"]', { visible: true, timeout: 15_000 })
		expect(await page.$('[data-testid="header-account-loading"]')).not.toBeNull()
		await clickByTestId(page, "network-button")
		await waitForHash(page, "#/popup/settings/networks")
	})
})
