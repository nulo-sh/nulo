/**
 * Sends fired back to back from the Send page, the way a person spams them: each helper drives
 * one step and returns, so a test can interleave a second send with the first one's estimate,
 * proof or mining. Reads what the page and the journal say; never sleeps for an outcome.
 */
import type { Page } from "puppeteer"
import { replaceInputValue } from "./extension"
import { type FeeMethodSubtitle, selectFeeMethod, selectSendToken, setActiveSendType } from "./helpers"
import { openSend, readSendView, submitSend, waitForSendGone } from "./send-page"

export type Side = "public" | "private"

export interface BurstSend {
	token: string
	from: Side
	to: Side
	/** Whole tokens; amounts in one test are distinct so rows can be told apart. */
	amount: string
	destination: string
	fee: FeeMethodSubtitle
}

export type EstimateState = "ready" | "failed" | "queued" | "estimating"

/**
 * Opens Send and fills it; the estimate is left to run. Brings the page to the front first: a
 * background tab never finishes the token sheet's close transition.
 */
export async function startSend(page: Page, send: BurstSend): Promise<void> {
	await page.bringToFront()
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
	await selectFeeWithin(page, send.fee, 30_000)
}

/** A click on a fee method can miss while the card re-reads its balances after a send lands: try until the selection takes. */
async function selectFeeWithin(page: Page, fee: FeeMethodSubtitle, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		try {
			return await selectFeeMethod(page, fee, { mountTimeoutMs: 30_000 })
		} catch (err) {
			if (Date.now() > deadline) throw err
			await new Promise((r) => setTimeout(r, 500))
		}
	}
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
		return document.querySelector('[data-testid="fee-estimate-queued"]') ? "queued" : "estimating"
	})
}

/** Waits until the estimate lands or fails, through any queued spell; the last state on timeout. */
export async function waitForEstimate(page: Page, timeout = 120_000): Promise<EstimateState> {
	const deadline = Date.now() + timeout
	for (;;) {
		const state = await readEstimateState(page)
		if (state === "ready" || state === "failed" || Date.now() > deadline) return state
		await new Promise((r) => setTimeout(r, 250))
	}
}

const sendDisabled = (page: Page) =>
	page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')?.disabled === true)

/** Fails unless the fee row turns queued and stays queued, with Send disabled, for the whole window. */
export async function expectEstimateQueued(page: Page, windowMs: number): Promise<void> {
	const settle = Date.now() + 30_000
	while ((await readEstimateState(page)) === "estimating") {
		if (Date.now() > settle) throw new Error("the estimate never answered queued")
		await new Promise((r) => setTimeout(r, 250))
	}
	const deadline = Date.now() + windowMs
	while (Date.now() < deadline) {
		const state = await readEstimateState(page)
		if (state !== "queued") throw new Error(`the estimate was expected to stay queued, but it is ${state}`)
		if (!(await sendDisabled(page))) throw new Error("Send was enabled while the estimate was queued")
		await new Promise((r) => setTimeout(r, 250))
	}
}

/** Confirms the filled send the way the footer offers it and waits for the page to leave. */
export async function confirmSend(page: Page): Promise<void> {
	await page.bringToFront()
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
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"])

/** Popup transfer rows of the journal, oldest first. */
export async function readTransferRows(page: Page): Promise<TransferRow[]> {
	const raws = await page.evaluate(async () => {
		const all = (await chrome.storage.local.get(null)) as Record<string, unknown>
		return Object.entries(all).flatMap(([key, raw]) => (key.startsWith("nulo:journal@") ? [raw] : []))
	})
	const rows: TransferRow[] = []
	for (const raw of raws) {
		try {
			const row = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>
			if (row.kind !== "transfer") continue
			const progress = row.progress as { stage?: string; txHash?: string } | undefined
			const error = row.error as { message?: string } | null | undefined
			rows.push({
				id: String(row.id),
				amount: String(row.amountRaw ?? ""),
				transferType: typeof row.transferType === "number" ? row.transferType : undefined,
				stage: progress?.stage,
				txHash: progress?.txHash ?? (typeof row.txHash === "string" ? row.txHash : undefined),
				error: error?.message,
				createdAt: Number(row.createdAt ?? 0),
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
	const deadline = Date.now() + timeout
	for (;;) {
		const row = (await readTransferRows(page)).find((r) => r.amount === amountRaw)
		if (row?.stage && stages.includes(row.stage)) return row
		if (Date.now() > deadline) throw new Error(`transfer ${amountRaw} never reached ${stages.join("|")}: ${JSON.stringify(row)}`)
		await new Promise((r) => setTimeout(r, 250))
	}
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
	const deadline = Date.now() + timeout
	for (;;) {
		const rows = await readTransferRows(page)
		if (rows.every((r) => r.stage && TERMINAL.has(r.stage))) return rows
		if (Date.now() > deadline)
			throw new Error(`transfers still in flight: ${JSON.stringify(rows.filter((r) => !TERMINAL.has(r.stage ?? "")))}`)
		await new Promise((r) => setTimeout(r, 500))
	}
}

/** The wallet's tx record status per hash (TxStatus: 0 Pending, 1 Dropped, 2+ in a block); `null` before it is recorded. */
export async function readTxStatuses(page: Page, hashes: readonly string[]): Promise<Record<string, number | null>> {
	return page.evaluate(async (hs: string[]) => {
		const keys = hs.map((h) => `nulo:core:txs@${h}`)
		const got = (await chrome.storage.local.get(keys)) as Record<string, unknown>
		const out: Record<string, number | null> = {}
		for (const h of hs) {
			const value = got[`nulo:core:txs@${h}`]
			const row = (typeof value === "string" ? JSON.parse(value) : value) as { status?: number } | undefined
			out[h] = typeof row?.status === "number" ? row.status : null
		}
		return out
	}, hashes as string[])
}

/** Waits until the wallet's tx record for each hash is in a block. */
export async function waitForTxsMined(page: Page, hashes: readonly string[], timeout = 180_000): Promise<void> {
	const deadline = Date.now() + timeout
	for (;;) {
		const statuses = await readTxStatuses(page, hashes)
		if (hashes.every((h) => (statuses[h] ?? -1) >= 2)) return
		if (Date.now() > deadline || hashes.some((h) => statuses[h] === 1)) {
			throw new Error(`txs not mined: ${JSON.stringify(statuses)}`)
		}
		await new Promise((r) => setTimeout(r, 500))
	}
}
