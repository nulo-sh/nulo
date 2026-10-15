import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { feePicksKey } from "@/utils/profile-ui-keys"
import { clickByTestId, openPopup, test } from "../fixtures/extension"
import { captureSoleProfileId } from "../fixtures/helpers"
import { snapshotResultSeq } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { waitForDappExecuteWorked } from "../fixtures/journal"
import { getSponsoredFpcAddress, mintPublicTokensForAccount, type AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/** The id of the active network's FPC row at `address`. Protocol FPCs are stored per profile and
 *  chain under one address, so the address alone can name another network's row. */
async function fpcIdAt(page: Page, address: string): Promise<string> {
	const profileId = await captureSoleProfileId(page)
	const id = await page.waitForFunction(
		async (pid: string, want: string) => {
			const all = (await chrome.storage.local.get(null)) as Record<string, unknown>
			const network = all[`nulo:core:networks@${all[`nulo:core:active-network@${pid}`]}`]
			const chainId = typeof network === "string" ? (JSON.parse(network) as { chainId?: number }).chainId : undefined
			for (const [key, raw] of Object.entries(all)) {
				if (!key.startsWith("nulo:core:fpcs@")) continue
				const row = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>
				if (row?.profileId === pid && row.chainId === chainId && String(row.address).toLowerCase() === want.toLowerCase())
					return row.id
			}
			return false
		},
		{ timeout: 10_000, polling: 200 },
		profileId,
		address,
	)
	return (await id.jsonValue()) as string
}

/** The app windows' saved fee pick for `account`, or null; runs in an extension page. The card keys
 *  the map by the account's address, so the lookup ignores hex case. */
async function savedFeePick(key: string, account: string): Promise<{ type?: string; fpc?: { id?: string } } | null> {
	const saved = ((await chrome.storage.local.get(key))[key] ?? {}) as Record<string, { type?: string; fpc?: { id?: string } }>
	return Object.entries(saved).find(([address]) => address.toLowerCase() === account.toLowerCase())?.[1] ?? null
}

/**
 * Test #35 — user picks Sponsored FPC fee in the execute popup.
 *
 * Default sendTx (no preset fee) opens with FeeSettingsCard. The user clicks
 * the trigger to override, then picks "sponsored". approveExecute({ feeMethod:
 * "sponsored" }) handles the two-step.
 *
 * Uses `dappConnectedExtensionWithTransactionCap` so the cap-popup
 * round-trip happens in fixture setup (hookTimeout=300s) rather than
 * during this test's budget. Asserts on `data-stage` (active processing
 * stage) instead of the dApp's full sendTx promise.
 */
test.skipIf(!hasConfig)(
	"tx-sendTx-sponsoredFpc — user override → sponsored fee → reaches active stage",
	{ timeout: 90_000 },
	async ({ dappConnectedExtensionWithTransactionCap }) => {
		const { playgroundPage: page, accountAddress } = dappConnectedExtensionWithTransactionCap

		// Pre-mint tokens so simulate succeeds + journal enters active stage.
		await mintPublicTokensForAccount(aztecConfig!, accountAddress)

		await page.evaluate(
			({ token, recipient }: { token: string; recipient: string }) => {
				const setVal = (sel: string, v: string) => {
					const input = document.querySelector<HTMLInputElement>(sel)
					if (!input) return
					const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
					setter?.call(input, v)
					input.dispatchEvent(new Event("input", { bubbles: true }))
				}
				setVal('[data-testid="pg-input-tokenAddress"]', token)
				setVal('[data-testid="pg-input-recipient"]', recipient)
				setVal('[data-testid="pg-input-amount"]', "1")
			},
			{ token: aztecConfig!.tokenAddress, recipient: aztecConfig!.minterAddress },
		)

		await snapshotResultSeq(page)
		const execPopupP = waitForPopup(dappConnectedExtensionWithTransactionCap, "execute", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-sendTx-default")
		const execPopup = await execPopupP
		await waitForExecuteContent(execPopup)

		// Only an explicit pick saves, so an empty record here makes the readback below this pick's.
		const sponsorFpcId = await fpcIdAt(execPopup, await getSponsoredFpcAddress())
		const feeKey = feePicksKey(await captureSoleProfileId(execPopup))
		expect(await execPopup.evaluate(savedFeePick, feeKey, accountAddress)).toBeNull()

		// Use the existing FeeSettingsCard's send-fee-method-* testids via approveExecute.
		// "sponsored" is the typical default + reasserted via the override flow.
		await approveExecute(execPopup, { feeMethod: "sponsored" })

		// Wait for the wallet's journal to enter an active processing stage
		// instead of the dApp's full sendTx promise. The popup-shape +
		// fee-method override flow is what this test verifies.
		const walletPopup = await openPopup(dappConnectedExtensionWithTransactionCap)
		await waitForDappExecuteWorked(walletPopup)

		// The confirm does not wait for the save, and the window closes on it: read it back here.
		await expect
			.poll(() => walletPopup.evaluate(savedFeePick, feeKey, accountAddress), { timeout: 10_000, interval: 200 })
			.toMatchObject({ type: "fpc", fpc: { id: sponsorFpcId } })
	},
)
