/**
 * An account with two tokens and advanced sequences, for files that fire Send-page sends back to
 * back, and a ledger of what its balance rows must read after the file's settled sends.
 *
 * The fixture shields TST and ALT, then sends one private TST and one private ALT to the minter and
 * one private TST to a second address, each mined before the next: a first send on a sequence
 * touches the (sender, recipient) handshake every token shares, so a case that wants two sends to
 * share nothing uses sequences these sends already advanced. Amounts it uses: 300, 45, 11, 12, 13.
 */
import { expect, inject } from "vitest"
import type { Page } from "puppeteer"
import type { AztecTestConfig } from "./aztec"
import { type ExtensionContext, openPopup, test as base, waitForHash } from "./extension"
import { captureBalanceBaseline, importTokenAndWaitForBalance, waitForFreshBalanceRow } from "./helpers"
import {
	type BurstSend,
	confirmSend,
	startSend,
	waitForEstimate,
	waitForTransferStage,
	waitForTransfersTerminal,
	waitForTxsMined,
} from "./send-burst"

export const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const ONE = 10n ** 18n
export const raw = (whole: string): string => (BigInt(whole) * ONE).toString()

type Balances = { publicRaw: bigint; privateRaw: bigint }

export interface Burst {
	page: Page
	ctx: ExtensionContext
	account: string
	/** A second recipient whose TST sequence the fixture already advanced. */
	other: string
	tokens: Record<string, string>
	/** What each token's balance row must read after the file's settled sends. */
	ledger: Record<string, Balances>
}

/** Closes the popup page and opens a fresh one, the way a person abandons a half-filled send. */
export async function reopen(burst: Burst): Promise<void> {
	await burst.page.close()
	burst.page = await openPopup(burst.ctx)
	await waitForHash(burst.page, "#/popup/general")
}

/** Applies the sends whose journal rows succeeded to the ledger. */
export async function settle(burst: Burst, sends: readonly BurstSend[]): Promise<void> {
	const rows = await waitForTransfersTerminal(burst.page)
	for (const send of sends) {
		if (rows.find((r) => r.amount === raw(send.amount))?.stage !== "succeeded") continue
		const entry = burst.ledger[send.token]
		const value = BigInt(raw(send.amount))
		if (send.from === "public") entry.publicRaw -= value
		else entry.privateRaw -= value
		if (send.destination.toLowerCase() !== burst.account.toLowerCase()) continue
		if (send.to === "public") entry.publicRaw += value
		else entry.privateRaw += value
	}
}

export async function expectLedger(burst: Burst, tokens: readonly string[]): Promise<void> {
	for (const token of tokens) {
		const contract = burst.tokens[token]
		const baseline = await captureBalanceBaseline(burst.page, burst.account, contract)
		await waitForFreshBalanceRow(burst.page, {
			account: burst.account,
			tokenContract: contract,
			expectedPublicRaw: burst.ledger[token].publicRaw.toString(),
			expectedPrivateRaw: burst.ledger[token].privateRaw.toString(),
			baselineUpdatedAt: baseline,
			timeoutMs: 90_000,
		})
	}
}

/** One send at a time: confirmed, mined, settled. */
async function sendAndMine(burst: Burst, send: BurstSend): Promise<void> {
	await startSend(burst.page, send)
	expect(await waitForEstimate(burst.page)).toBe("ready")
	await confirmSend(burst.page)
	const row = await waitForTransferStage(burst.page, raw(send.amount), ["succeeded"])
	await waitForTxsMined(burst.page, [row.txHash as string])
	await settle(burst, [send])
}

export const burstTest = base.extend<{ burst: Burst }>({
	burst: [
		async ({ feeJuiceImportedExtension: ctx }, use) => {
			const config = aztecConfig as AztecTestConfig
			const { deployExtraTokensForAccount, randomAztecAddress } = await import("./aztec")
			const extra = await deployExtraTokensForAccount(config, ctx.accountAddress, [{ symbol: "ALT", amount: 50n * ONE }])
			const page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general")
			await importTokenAndWaitForBalance(page, ctx.accountAddress, extra.ALT, (50n * ONE).toString())
			const burst: Burst = {
				page,
				ctx,
				account: ctx.accountAddress,
				other: await randomAztecAddress(),
				tokens: { TST: config.tokenAddress, ALT: extra.ALT },
				ledger: { TST: { publicRaw: 1000n * ONE, privateRaw: 0n }, ALT: { publicRaw: 50n * ONE, privateRaw: 0n } },
			}
			const minter = config.minterAddress
			for (const send of [
				{ token: "TST", from: "public", to: "private", amount: "300", destination: ctx.accountAddress, fee: "sponsored" },
				{ token: "ALT", from: "public", to: "private", amount: "45", destination: ctx.accountAddress, fee: "sponsored" },
				{ token: "TST", from: "private", to: "private", amount: "11", destination: minter, fee: "sponsored" },
				{ token: "ALT", from: "private", to: "private", amount: "12", destination: minter, fee: "sponsored" },
				{ token: "TST", from: "private", to: "private", amount: "13", destination: burst.other, fee: "sponsored" },
			] as const satisfies readonly BurstSend[]) {
				await sendAndMine(burst, send)
			}
			await use(burst)
			await burst.page.close()
		},
		{ scope: "file" },
	],
})
