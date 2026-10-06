/**
 * A seeded burst of Send-page actions fired with no pause between them, the way a person spams the
 * wallet: sends of two tokens across the transfer types, fee methods and recipients the reserved
 * balances allow, some abandoned mid-estimate by closing the page, interleaved with dApp sends of
 * the same account. Whatever the interleaving, every confirmed send succeeds, no estimate fails,
 * and the balance rows reconcile with the sends.
 *
 * Runs only with `NULO_E2E_CHAOS=1` (the nightly lanes): a seed fixes the actions, not their
 * timing, so this hunts for orderings `same-token-concurrent-sends.test.ts` does not name. The seed
 * is `NULO_E2E_CHAOS_SEED` when set, else random, and is always logged so a failure replays.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { type Burst, aztecConfig, burstTest as test, expectLedger, raw, reopen, settle } from "../fixtures/burst-account"
import { clickByTestId, connectPlayground, grantCapBundle } from "../fixtures/extension"
import { assertPgOk, setPgInput, snapshotResultSeq, waitForPgResults } from "../fixtures/playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import {
	type BurstSend,
	confirmSend,
	startSend,
	waitForEstimate,
	waitForTransferStage,
	waitForTransfersTerminal,
	waitForTxsMined,
} from "../fixtures/send-burst"

const enabled = aztecConfig !== undefined && process.env.NULO_E2E_CHAOS === "1"
const ACTIONS = 8
/** The share of actions that are dApp sends rather than Send-page sends. */
const DAPP_SHARE = 0.2
const SIDES = ["public", "private"] as const

/** mulberry32: a small seeded PRNG, so a logged seed replays the same actions. */
function prng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

type Action = { kind: "send"; send: BurstSend; abandon: boolean } | { kind: "dapp" }

/**
 * Draws the actions up front and reserves each amount against the side it spends, so no action finds
 * its balance taken by one still in flight. Amounts are distinct and clear of the fixture's; a dApp
 * action is the playground's default sendTx, one base unit of public TST.
 */
function plan(seed: number, burst: Burst): Action[] {
	const next = prng(seed)
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
	const reserved = structuredClone(burst.ledger)
	const recipients = [(aztecConfig as NonNullable<typeof aztecConfig>).minterAddress, burst.other]
	const actions: Action[] = []
	for (let i = 0; i < ACTIONS; i++) {
		if (next() < DAPP_SHARE) {
			reserved.TST.publicRaw -= 1n
			actions.push({ kind: "dapp" })
			continue
		}
		const token = pick(["TST", "ALT"] as const)
		const from = pick(SIDES)
		const amount = String(31 + i)
		const side = from === "public" ? "publicRaw" : "privateRaw"
		if (reserved[token][side] < BigInt(raw(amount))) continue
		reserved[token][side] -= BigInt(raw(amount))
		// The Send page offers private fee juice only beside a public origin.
		const fee = pick(from === "public" ? (["sponsored", "public", "private"] as const) : (["sponsored", "public"] as const))
		const send: BurstSend = { token, from, to: pick(SIDES), amount, destination: pick(recipients), fee }
		actions.push({ kind: "send", send, abandon: next() < 0.2 })
	}
	return actions
}

/** The playground's default sendTx, approved and left to run; its result is collected at the end. */
async function fireDappSend(burst: Burst, playground: Page): Promise<void> {
	const config = aztecConfig as AztecTestConfig
	await playground.bringToFront()
	await setPgInput(playground, "tokenAddress", config.tokenAddress)
	await setPgInput(playground, "recipient", config.minterAddress)
	await setPgInput(playground, "amount", "1")
	const approvalP = waitForPopup(burst.ctx, "execute", { timeout: 60_000 })
	await clickByTestId(playground, "pg-btn-sendTx-default")
	const approval = await approvalP
	await waitForExecuteContent(approval, 60_000)
	await approveExecute(approval, { feeMethod: "sponsored", approvableTimeoutMs: 300_000 })
}

async function connectAccount(burst: Burst): Promise<Page> {
	const playground = await connectPlayground(burst.ctx)
	await grantCapBundle(burst.ctx, playground, "transaction", async (ids) => {
		const mine = ids.find((id) => id?.toLowerCase() === burst.account.toLowerCase())
		if (!mine) throw new Error("the capabilities popup does not offer the burst account")
		return [mine]
	})
	return playground
}

/**
 * A send whose estimate is queued behind an earlier one cannot be confirmed until it lands, so each
 * send waits for its estimate (through any queued spell) and is confirmed the moment Send enables.
 */
/** The fee menu as the page shows it, so a send the menu would not take names its reason. */
async function readFeeMenu(page: Page): Promise<(string | undefined)[]> {
	await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="send-fee-method-trigger"]')?.click())
	await new Promise((r) => setTimeout(r, 500))
	return page.evaluate(() =>
		[...document.querySelectorAll('[data-testid^="send-fee-method-"]:not([data-testid="send-fee-method-trigger"])')].map((el) =>
			el.textContent?.replace(/\s+/g, " ").trim(),
		),
	)
}

async function runSend(burst: Burst, send: BurstSend, abandon: boolean): Promise<"confirmed" | "abandoned" | "failed"> {
	await startSend(burst.page, send).catch(async (err: unknown) => {
		throw new Error(
			`starting ${JSON.stringify(send)} failed; fee menu ${JSON.stringify(await readFeeMenu(burst.page))}: ${String(err)}`,
		)
	})
	if (abandon) {
		await reopen(burst)
		return "abandoned"
	}
	if ((await waitForEstimate(burst.page, 600_000)) !== "ready") return "failed"
	await confirmSend(burst.page)
	return "confirmed"
}

test.skipIf(!enabled)("a seeded burst of sends keeps every invariant", { timeout: 1_800_000, retry: 0 }, async ({ burst }) => {
	const seed = process.env.NULO_E2E_CHAOS_SEED ? Number(process.env.NULO_E2E_CHAOS_SEED) : Math.floor(Math.random() * 2 ** 31)
	const actions = plan(seed, burst)
	console.log(`[send-chaos] seed=${seed} (replay: NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=${seed}) actions=${JSON.stringify(actions)}`)
	const playground = await connectAccount(burst)
	const dappFrom = await snapshotResultSeq(playground)
	let dappSends = 0
	const confirmed: BurstSend[] = []
	const failedEstimates: string[] = []
	for (const action of actions) {
		if (action.kind === "dapp") {
			await fireDappSend(burst, playground)
			dappSends++
			continue
		}
		const outcome = await runSend(burst, action.send, action.abandon)
		if (outcome === "failed") failedEstimates.push(action.send.amount)
		if (outcome === "confirmed") confirmed.push(action.send)
	}
	expect(failedEstimates, `seed ${seed}: estimates that failed`).toEqual([])
	for (const result of await waitForPgResults(playground, "sendTx", dappFrom, dappSends, 900_000)) {
		await assertPgOk(playground, result, `seed ${seed}: dApp send`)
	}
	// A confirmed send's row exists only once the service worker has resolved its keys.
	for (const send of confirmed) {
		await waitForTransferStage(burst.page, raw(send.amount), ["succeeded", "failed", "cancelled"], 900_000)
	}
	const amounts = new Set(confirmed.map((s) => raw(s.amount)))
	const rows = (await waitForTransfersTerminal(burst.page, 900_000)).filter((r) => amounts.has(r.amount))
	expect(
		rows.map((r) => [r.amount, r.stage, r.error]),
		`seed ${seed}`,
	).toEqual(rows.map((r) => [r.amount, "succeeded", undefined]))
	expect(rows, `seed ${seed}: a confirmed send has no journal row`).toHaveLength(confirmed.length)
	await waitForTxsMined(
		burst.page,
		rows.map((r) => r.txHash as string),
		600_000,
	)
	await settle(burst, confirmed)
	burst.ledger.TST.publicRaw -= BigInt(dappSends)
	await expectLedger(burst, ["TST", "ALT"])
	await playground.close()
})
