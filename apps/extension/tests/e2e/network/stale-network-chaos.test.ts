/**
 * A reset beside a live network: Testnet is stale while Local serves a connected playground dApp.
 * The run is held inside its purge (`network-reset-purging`), and while it is held a dApp send on
 * Local waits instead of being refused, and a second popup, opened with Local active, shows A4.
 * Once released the held send lands, A5 shows once across both popups, nothing on Local was
 * removed, the dApp's session row is unchanged, and Testnet's accounts sit on the seed chain.
 *
 * @requires-proverless — the restore gate exists only in proverless builds (`wallet/runtime.ts`).
 */
import type { Page } from "puppeteer"
import { describe, expect, inject } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { type AztecTestConfig, mintPublicTokensForAccount, waitForTxMined } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { ensureUnlocked, lockWallet } from "../fixtures/helpers"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { armRestoreGate, clearRestoreGate, readRestoreGate, waitForRestoreGateHeld } from "../fixtures/restore-gate"
import { SESSION_KEY_PREFIX } from "../fixtures/dappSession"
import { readSealedRows } from "../fixtures/sealed-rows"
import {
	PREVIOUS_TESTNET_CHAIN_ID,
	readAccounts,
	readNetwork,
	readTakeoverTrace,
	seedStaleNetwork,
	snapshotChain,
	storeActiveNetwork,
	takeoverScreen,
	traceTakeover,
} from "../helpers/stale-network"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/** The time a held request gets to show it is not answered before the test calls it waiting. */
const WAIT_WINDOW_MS = 4_000

/** Every stored dApp session row, raw. */
async function sessionRows(page: Page): Promise<Record<string, string>> {
	return page.evaluate(async (prefix: string) => {
		const all = await chrome.storage.local.get(null)
		return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(prefix))) as Record<string, string>
	}, SESSION_KEY_PREFIX)
}

/** The dApp's settled answers to `method` after `fromSeq`; a call in flight shows a pending row. */
async function settledSince(page: Page, method: string, fromSeq: number): Promise<string[]> {
	return page.$$eval(
		`[data-testid="pg-result"][data-method="${method}"]`,
		(rows, after) =>
			rows
				.filter((r) => Number(r.getAttribute("data-result-seq") ?? "0") > after)
				.map((r) => r.getAttribute("data-status") ?? "")
				.filter((status) => status === "ok" || status === "error"),
		fromSeq,
	)
}

/** Execute windows open now. A window counts from its target's creation, before it renders. */
function executeWindows(ctx: ExtensionContext): number {
	return ctx.browser.targets().filter((t) => t.type() === "page" && t.url().includes("#/windows/execute")).length
}

describe("stale network beside a live one", () => {
	test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
		if (process.env.E2E_REQUIRE_SETUP === "1") expect(hasConfig).toBe(true)
	})

	test.skipIf(!hasConfig)(
		"N2 held purge: a Local dApp send waits and lands, a second popup on Local shows A4, A5 once, Local untouched",
		{ timeout: 600_000, retry: 0 },
		async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
			await mintPublicTokensForAccount(aztecConfig!, ctx.accountAddress)
			const pg = ctx.playgroundPage
			await setPgInput(pg, "tokenAddress", aztecConfig!.tokenAddress)
			await setPgInput(pg, "recipient", aztecConfig!.minterAddress)
			await setPgInput(pg, "amount", "1")

			const page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general", 30_000)
			const local = await readNetwork(page, "local")
			const localBefore = await snapshotChain(page, local.chainId, local.id)
			const sessionsBefore = await sessionRows(page)
			expect(Object.keys(sessionsBefore)).toHaveLength(1)

			await lockWallet(page)
			await seedStaleNetwork(page, "network-reset")
			await storeActiveNetwork(page, "testnet")
			await ensureUnlocked(page)
			expect(await takeoverScreen(page)).toBe("network-reset")

			let second: Page | undefined
			try {
				await armRestoreGate(page, "network-reset-purging")
				await traceTakeover(page)
				await clickByTestId(page, "stale-network-reset")
				await clickByTestId(page, "stale-confirm-submit")
				await waitForRestoreGateHeld(page, "network-reset-purging", 30_000)

				// A dApp request that arrives during the run waits for it: no window and no answer until the
				// release, checked after the wait and again just before it.
				expect(executeWindows(ctx)).toBe(0)
				const seq = await snapshotResultSeq(pg)
				const executeP = waitForPopup(ctx, "execute", { timeout: 180_000 })
				executeP.catch(() => {})
				await clickByTestId(pg, "pg-btn-sendTx-default")
				const early = await Promise.race([
					executeP.then(() => "window"),
					new Promise((r) => setTimeout(() => r("waiting"), WAIT_WINDOW_MS)),
				])
				expect(early).toBe("waiting")
				expect(executeWindows(ctx)).toBe(0)
				expect(await settledSince(pg, "sendTx", seq)).toEqual([])

				// Every popup shows A4 while a run holds the lock, whatever network is active.
				await storeActiveNetwork(page, "local")
				second = await openPopup(ctx)
				await traceTakeover(second)
				expect(await takeoverScreen(second, "progress", 15_000)).toBe("progress")
				// Every check ran inside the hold: its safety timer had not released it.
				expect(executeWindows(ctx)).toBe(0)
				expect(await settledSince(pg, "sendTx", seq)).toEqual([])
				expect(await readRestoreGate(page)).toEqual({ at: "network-reset-purging", held: true })

				await clearRestoreGate(page)
				const execute = await executeP
				await waitForExecuteContent(execute, 60_000)
				// The run is over and the held send not yet approved: Local's rows are exactly as before.
				expect(await snapshotChain(page, local.chainId, local.id)).toEqual(localBefore)
				await approveExecute(execute, { approvableTimeoutMs: 120_000 })
				const sent = await waitForPgResult(pg, "sendTx", seq, 300_000)
				await assertPgOk(pg, sent, "stale-network-chaos:held-send")
				// The dApp is answered at submission; the send lands only once the node proves it.
				const txHash = (sent.resultJson as { txHash?: string }).txHash
				if (typeof txHash !== "string") throw new Error(`held send: no txHash in ${JSON.stringify(sent.resultJson)}`)
				await waitForTxMined(aztecConfig!, txHash)
			} finally {
				await clearRestoreGate(page)
			}

			const traces = [await readTakeoverTrace(page), await readTakeoverTrace(second!)]
			expect(traces.reduce((n, t) => n + t.readyToasts, 0)).toBe(1)

			expect((await readNetwork(page, "testnet")).chainId).toBe(CHAIN_IDS.TESTNET)
			expect(await readAccounts(page, CHAIN_IDS.TESTNET)).not.toEqual([])
			expect(await readAccounts(page, PREVIOUS_TESTNET_CHAIN_ID)).toEqual([])
			const localAfter = await snapshotChain(page, local.chainId, local.id)
			expect(Object.keys(localBefore).filter((key) => !(key in localAfter))).toEqual([])
			expect((await readSealedRows<{ chainId: number }>(page, "txs")).some(({ row }) => row.chainId === local.chainId)).toBe(true)
			expect(await sessionRows(page)).toEqual(sessionsBefore)
		},
	)
})
