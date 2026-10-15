/**
 * A reset bump on a live node: Local re-keyed off the seed's chainId with every derived address
 * moved, the shape an Aztec reset leaves (both causes), on a profile that never opened Local, so
 * no PXE store for the seed chain exists before the reset. The harness funds the account's true
 * address first; after the reset the row is back on the seed chain, a fresh PXE store syncs that
 * balance, a send lands, and the history holds only the new send.
 */
import type { Page } from "puppeteer"
import { describe, expect, inject } from "vitest"
import { accountLine } from "@/components/stale-network/copy"
import { CHAIN_IDS, LOCAL_L1_CHAIN_ID } from "@/utils/chain-ids"
import { type AztecTestConfig, mintPublicTokensForAccount } from "../fixtures/aztec"
import { clickByTestId, launchExtension, test, waitForHash } from "../fixtures/extension"
import {
	ensureUnlocked,
	getAccountAddress,
	importTokenAndWaitForBalance,
	lockWallet,
	sendTransfer,
	waitForToast,
	waitForTxConfirmation,
} from "../fixtures/helpers"
import { seedTransaction } from "../helpers/activity-seeds"
import {
	deriveNuloAccountAddress,
	gotoPopupImport,
	importSeed,
	makeRecoveryTriple,
	POPUP_IMPORT_SHELL,
	TEST_PASSWORD,
} from "../helpers/import-drivers"
import { PREVIOUS_LOCAL_CHAIN_ID, readAccounts, readNetwork, seedStaleLocalBothCauses, takeoverScreen } from "../helpers/stale-network"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const MINTED = 1000n * 10n ** 18n
const OLD_SEND = `0x${"0d".repeat(32)}`

/** Every stored transaction row's chain, account and hash. */
async function transactionRows(page: Page): Promise<{ chainId: number; account: string; hash: string }[]> {
	return page.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		return Object.entries(all)
			.filter(([key, raw]) => key.startsWith("nulo:core:txs@") && typeof raw === "string")
			.map(([, raw]) => JSON.parse(raw as string))
			.map((row) => ({ chainId: row.chainId, account: row.account, hash: row.hash }))
	})
}

describe("stale network on a live node", () => {
	test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
		if (process.env.E2E_REQUIRE_SETUP === "1") expect(hasConfig).toBe(true)
	})

	test.skipIf(!hasConfig)(
		"N1 both causes on Local: A1 with the address line, then the true address syncs its balance and a send lands",
		{ timeout: 600_000, retry: 0 },
		async () => {
			const ctx = await launchExtension()
			try {
				const { words, masterBase64 } = await makeRecoveryTriple()
				const page = await gotoPopupImport(ctx)
				await importSeed(page, words.join(" "), TEST_PASSWORD, POPUP_IMPORT_SHELL)
				await waitForHash(page, "#/popup/general", 30_000)
				const trueAddress = await deriveNuloAccountAddress(masterBase64, LOCAL_L1_CHAIN_ID, 0)
				await mintPublicTokensForAccount(aztecConfig!, trueAddress, MINTED)

				await lockWallet(page)
				const seeded = await seedStaleLocalBothCauses(page)
				expect(seeded.moved).toHaveLength(1)
				await seedTransaction(
					page,
					{
						profileId: seeded.profileId,
						networkId: seeded.networkId,
						chainId: PREVIOUS_LOCAL_CHAIN_ID,
						account: seeded.moved[0]!,
						token: { contract: aztecConfig!.tokenAddress, name: "Test Token", symbol: "TT", decimals: 18 },
					},
					{ hash: OLD_SEND, amount: "1" },
				)
				await ensureUnlocked(page)

				expect(await takeoverScreen(page)).toBe("network-reset")
				const box = await page.$eval('[data-testid="stale-network-box"]', (el) => el.textContent ?? "")
				expect(box).toContain(accountLine("Local Network", 1, true))
				await clickByTestId(page, "stale-network-reset")
				await clickByTestId(page, "stale-confirm-submit")
				await waitForToast(page, "Your accounts have new addresses.", 120_000, { kind: "success" })

				expect((await readNetwork(page, "local")).chainId).toBe(CHAIN_IDS.SANDBOX)
				expect((await readAccounts(page, CHAIN_IDS.SANDBOX)).map((a) => [a.address, a.index])).toEqual([[trueAddress, 0]])
				expect(await readAccounts(page, PREVIOUS_LOCAL_CHAIN_ID)).toEqual([])
				expect(await getAccountAddress(page)).toBe(trueAddress)

				await importTokenAndWaitForBalance(page, trueAddress, aztecConfig!.tokenAddress, MINTED.toString())
				await sendTransfer(page, { fromType: "public", toType: "public", amount: "10", destination: trueAddress, expect: "send" })
				await waitForTxConfirmation(page, { amount: "10", fromType: "public", toType: "public", timeout: 180_000 })

				const history = await transactionRows(page)
				expect(history.map((row) => row.hash)).not.toContain(OLD_SEND)
				expect(history.length).toBeGreaterThan(0)
				expect(history.every((row) => row.chainId === CHAIN_IDS.SANDBOX && row.account === trueAddress)).toBe(true)
			} finally {
				await ctx.close()
			}
		},
	)
})
