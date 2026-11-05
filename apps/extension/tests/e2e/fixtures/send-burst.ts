/**
 * Sends fired back to back from the Send page, the way a person spams them: each helper drives
 * one step and returns, so a test can interleave a second send with the first one's estimate,
 * proof or mining. Reads what the page and the journal say; never sleeps for an outcome.
 */
import type { Page } from "puppeteer"
import { clickByTestId, replaceInputValue } from "./extension"
import { type FeeMethodSubtitle, selectFeeMethod, selectSendToken, setActiveSendType } from "./helpers"
import { openSend, readSendView, submitSend, waitForSendGone } from "./send-page"
import { PollTimeoutError, pollUntil } from "./poll"
import { readSealedRows } from "./sealed-rows"
import { bringToFront } from "./browser"

export type Side = "public" | "private"

export interface BurstSend {
	token: string
	from: Side
	to: Side
	/** Whole tokens; amounts in one test are distinct so rows can be told apart. */
	amount: string
	destination: string
	fee: FeeMethodSubtitle
	/** The fee card's priority; Normal, the card's default, when unset. */
	speed?: "normal" | "fast" | "urgent"
}

export type EstimateState = "ready" | "failed" | "queued" | "estimating"

/**
 * Opens Send and fills it; the estimate is left to run. Brings the page to the front first: a
 * background tab never finishes the token sheet's close transition.
 */
export async function startSend(page: Page, send: BurstSend): Promise<void> {
	await bringToFront(page)
	await openSend(page)
	await selectSendToken(page, send.token)
	await setActiveSendType(page, "send-from-type", send.from)
	await setActiveSendType(page, "send-to-type", send.to)
	await page.waitForFunction(
		() => {
			const input = document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')
			return Boolean(input) && !input?.disabled
		},
		{ timeout: 60_000, polling: 250 },
	)
	await replaceInputValue(page, '[data-testid="send-amount-input"]', send.amount)
	await replaceInputValue(page, '[data-testid="send-destination-field"] input', send.destination)
	await selectFeeMethod(page, send.fee)
	if (send.speed) await clickByTestId(page, `send-fee-priority-${send.speed}`)
}

/** The estimate's state right now: the fee row (landed or queued), or the page's "Couldn't estimate fee" snack. */
export async function readEstimateState(page: Page): Promise<EstimateState> {
	return page.evaluate(() => {
		for (const card of document.querySelectorAll('[data-testid="snackbar"]')) {
			const title = card.querySelector('[data-testid="snackbar-title"]')?.textContent ?? ""
			const sub = card.querySelector('[data-testid="snackbar-sub"]')?.textContent ?? ""
			if (`${title} ${sub}`.toLowerCase().includes("estimate fee")) return "failed"
		}
		if (document.querySelector('[data-testid="fee-estimate"]')) return "ready"
		const queued = document.querySelector(
			'[data-testid="fee-estimate-queued"], [data-testid="fee-estimate-queued-cap"], [data-testid="fee-estimate-queued-sponsored"]',
		)
		return queued ? "queued" : "estimating"
	})
}

/** Waits until the estimate lands or fails, through any queued spell; the last state on timeout. */
export async function waitForEstimate(page: Page, timeout = 120_000): Promise<EstimateState> {
	try {
		return await pollUntil(
			() => readEstimateState(page),
			(state) => state === "ready" || state === "failed",
			{ label: "the estimate landed or failed", timeoutMs: timeout, intervalMs: 250 },
		)
	} catch (error) {
		if (error instanceof PollTimeoutError) return error.last as EstimateState
		throw error
	}
}

/** Whether Send is enabled, and whether the queued row offers to queue: against a fee cap, or with
 *  Nulo's sponsor paying; `null` when there is no Send button. */
const readQueueOffer = (page: Page) =>
	page.evaluate(() => {
		const send = document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')
		const queueable = Boolean(
			document.querySelector('[data-testid="fee-estimate-queued-cap-line"], [data-testid="fee-estimate-queued-sponsored-line"]'),
		)
		return send ? { enabled: !send.disabled, queueable } : null
	})

/** Fails unless the fee row turns queued and stays queued for the whole window, with Send enabled
 *  exactly while it offers to queue. */
export async function expectEstimateQueued(page: Page, windowMs: number): Promise<void> {
	await pollUntil(
		() => readEstimateState(page),
		(state) => state !== "estimating",
		{ label: "the estimate answering queued", timeoutMs: 30_000, intervalMs: 250 },
	)
	const deadline = Date.now() + windowMs
	while (Date.now() < deadline) {
		const state = await readEstimateState(page)
		if (state !== "queued") throw new Error(`the estimate was expected to stay queued, but it is ${state}`)
		const offer = await readQueueOffer(page)
		if (!offer) throw new Error("Send is missing while the estimate is queued")
		if (offer.enabled !== offer.queueable)
			throw new Error(`Send must be enabled exactly while the row offers to queue: ${JSON.stringify(offer)}`)
		await new Promise((r) => setTimeout(r, 250))
	}
}

/** Confirms the filled send the way the footer offers it and waits for the page to leave. */
export async function confirmSend(page: Page): Promise<void> {
	await bringToFront(page)
	const { action } = await readSendView(page)
	await submitSend(page, { expect: action ?? "send" })
	await waitForSendGone(page, 30_000)
}

export interface TransferRow {
	id: string
	amount: string
	transferType: number | undefined
	stage: string | undefined
	txHash: string | undefined
	error: string | undefined
	createdAt: number
	/** Set while the send asks again: the fee it found and the cap it was held to. */
	reask: { fee: string; cap: string } | undefined
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"])

/** Popup transfer rows of the journal, oldest first. */
export async function readTransferRows(page: Page): Promise<TransferRow[]> {
	const records = await readSealedRows(page, "journal")
	const rows: TransferRow[] = []
	for (const { row } of records) {
		try {
			if (row.kind !== "transfer") continue
			const progress = row.progress as { stage?: string; txHash?: string; reask?: { fee: string; cap: string } } | undefined
			const error = row.error as { message?: string } | null | undefined
			rows.push({
				id: String(row.id),
				amount: String(row.amountRaw ?? ""),
				transferType: typeof row.transferType === "number" ? row.transferType : undefined,
				stage: progress?.stage,
				txHash: progress?.txHash ?? (typeof row.txHash === "string" ? row.txHash : undefined),
				error: error?.message,
				createdAt: Number(row.createdAt ?? 0),
				reask: progress?.reask && { fee: progress.reask.fee, cap: progress.reask.cap },
			})
		} catch {
			// A row this reader cannot parse is not a transfer it drove.
		}
	}
	return rows.sort((a, b) => a.createdAt - b.createdAt)
}

/** Waits for the transfer row of `amountRaw` to reach `stage`. */
export async function waitForTransferStage(
	page: Page,
	amountRaw: string,
	stages: readonly string[],
	timeout = 120_000,
): Promise<TransferRow> {
	const row = await pollUntil(
		async () => (await readTransferRows(page)).find((r) => r.amount === amountRaw),
		(row) => Boolean(row?.stage && stages.includes(row.stage)),
		{ label: `transfer ${amountRaw} at ${stages.join("|")}`, timeoutMs: timeout, intervalMs: 250 },
	)
	return row as TransferRow
}

/** Fails unless the transfer row of `amountRaw` appears and then stays at `stage` for the whole window. */
export async function expectStageHeld(page: Page, amountRaw: string, stage: string, windowMs: number): Promise<void> {
	await waitForTransferStage(page, amountRaw, [stage], 30_000)
	const deadline = Date.now() + windowMs
	while (Date.now() < deadline) {
		const row = (await readTransferRows(page)).find((r) => r.amount === amountRaw)
		if (row?.stage !== stage) throw new Error(`transfer ${amountRaw} was expected to wait at ${stage}, but is ${JSON.stringify(row)}`)
		await new Promise((r) => setTimeout(r, 250))
	}
}

/** Waits until every transfer row is terminal, then returns them all. */
export async function waitForTransfersTerminal(page: Page, timeout = 300_000): Promise<TransferRow[]> {
	return pollUntil(
		() => readTransferRows(page),
		(rows) => rows.every((r) => r.stage && TERMINAL.has(r.stage)),
		{
			label: "every transfer terminal",
			timeoutMs: timeout,
			intervalMs: 500,
			show: (rows) => `in flight ${JSON.stringify(rows.filter((r) => !TERMINAL.has(r.stage ?? "")))}`,
		},
	)
}

/** The wallet's tx record status per hash (TxStatus: 0 Pending, 1 Dropped, 2+ in a block); `null` before it is recorded. */
export async function readTxStatuses(page: Page, hashes: readonly string[]): Promise<Record<string, number | null>> {
	const rows = await readSealedRows<{ status?: number }>(page, "txs")
	return Object.fromEntries(
		hashes.map((hash) => {
			const status = rows.find((tx) => tx.naturalId === hash)?.row.status
			return [hash, typeof status === "number" ? status : null]
		}),
	)
}

/** Waits until the wallet's tx record for each hash is in a block. */
export async function waitForTxsMined(page: Page, hashes: readonly string[], timeout = 180_000): Promise<void> {
	await pollUntil(
		async () => {
			const statuses = await readTxStatuses(page, hashes)
			if (hashes.some((h) => statuses[h] === 1)) throw new Error(`txs not mined, one dropped: ${JSON.stringify(statuses)}`)
			return statuses
		},
		(statuses) => hashes.every((h) => (statuses[h] ?? -1) >= 2),
		{ label: "txs mined", timeoutMs: timeout, intervalMs: 500 },
	)
}
