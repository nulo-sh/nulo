import type { Page } from "puppeteer"
import { clickByTestId, replaceInputValue, withTimeoutMessage } from "./dom"
import { chooseRecipient, openSend, submitSend, waitForSendGone } from "./send-page"
import { refreshBalances } from "./tokens"
import { waitForToast } from "./widgets"

// ── Transfer ───────────────────────────────────────────────────────────

export interface SendTransferOptions {
	fromType: "public" | "private"
	toType: "public" | "private"
	amount: string
	destination: string
}

/** Checks the `desired` radio of a side group (`send-from-type` or `send-to-type`). A side is disabled
 *  until the token's capabilities load, so the click is retried until the radio is enabled and checked. */
export async function setActiveSendType(
	page: Page,
	testId: "send-from-type" | "send-to-type",
	desired: "public" | "private",
): Promise<void> {
	const radio = `${testId.replace(/-type$/, "")}-${desired}`
	await withTimeoutMessage(
		page.waitForFunction(
			(id: string) => {
				const input = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)
				if (!input || input.disabled) return false
				if (!input.checked) input.click()
				return input.checked
			},
			{ timeout: 30_000, polling: 500 },
			radio,
		),
		async () =>
			`setActiveSendType: ${radio} never checked (now ${await page.evaluate((id: string) => {
				const input = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)
				return input ? `disabled ${input.disabled}, checked ${input.checked}` : "absent"
			}, radio)})`,
	)
}

/** One send from Home: Send, the person, both sides, the amount, the review and Send now, then the
 *  toast and the page gone. */
export async function sendTransfer(page: Page, opts: SendTransferOptions): Promise<void> {
	// The Send page reads a token-balance cache that may lag the chain after a send another test made;
	// a person refreshes Assets first, and the amount field's enabled wait below is the signal.
	if (opts.fromType === "private") await refreshBalances(page)

	await openSend(page)
	await chooseRecipient(page, opts.destination)
	await setActiveSendType(page, "send-from-type", opts.fromType)
	await setActiveSendType(page, "send-to-type", opts.toType)
	await fillSendForm(page, opts)
	await submitSend(page)

	// The toast only appears after client-side proving; native proving (the prover-ON canary) adds tens
	// of seconds there, the shield path most, so it gets real headroom. Proverless shards stay tight.
	await waitForToast(page, "Transaction submitted", process.env.NULO_E2E_PROVERLESS === "1" ? 60_000 : 300_000)
	await waitForSendGone(page)
}

/** Answers the person step with `destination` when it shows, then types the amount once its field
 *  takes input (it is disabled while the chosen side's balance is 0 or loading). */
export async function enterSendForm(page: Page, opts: { amount: string; destination: string }): Promise<void> {
	if (await page.$('[data-testid="send-person-step"]')) await chooseRecipient(page, opts.destination)
	await page.waitForFunction(
		() => {
			const input = document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')
			return Boolean(input) && !input?.disabled
		},
		{ timeout: 60_000, polling: 2_000 },
	)
	// The v-model-aware helper: Puppeteer's triple-click and type is unreliable on the Input wrapper.
	await replaceInputValue(page, '[data-testid="send-amount-input"]', opts.amount)
}

/** Fills the open Send form and waits until "Review send" is enabled: the fee estimate landed. */
export async function fillSendForm(page: Page, opts: { amount: string; destination: string }): Promise<void> {
	await enterSendForm(page, opts)
	try {
		await page.waitForFunction(
			() => {
				const btn = document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')
				return Boolean(btn) && !btn?.disabled
			},
			{ timeout: 120_000, polling: 3_000 },
		)
	} catch (e) {
		const snapshot = await page.evaluate(() => {
			const q = (t: string) => document.querySelector<HTMLElement>(`[data-testid="${t}"]`)
			const amount = q("send-amount-input") as HTMLInputElement | null
			return {
				amountValue: amount?.value,
				amountDisabled: amount?.disabled,
				payee: q("send-payee-address")?.textContent?.slice(0, 20),
				submitText: q("send-submit")?.textContent?.trim().slice(0, 80),
				feeLine: q("send-fee-line")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120),
				bodySnippet: (document.body.textContent ?? "").slice(0, 400),
			}
		})
		console.error("[sendTransfer] Review send never became enabled. Snapshot:", JSON.stringify(snapshot, null, 2))
		throw e
	}
}

/** Map a (fromType, toType) pair to the user-visible transfer-type label
 *  that the settled `TransactionCard` renders in its chip. Matches the
 *  wallet's TRANSFER_TYPE_LABELS table in `src/utils/tx-enrichment.ts`. */
function transferTypeLabel(fromType: "public" | "private", toType: "public" | "private"): string {
	if (fromType === "private" && toType === "private") return "Private → Private"
	if (fromType === "private" && toType === "public") return "Private → Public"
	if (fromType === "public" && toType === "public") return "Public → Public"
	return "Public → Private"
}

/** Wait for the most recent transfer to surface as a settled
 *  `TransactionCard` on the activity list with status="confirmed".
 *
 *  Matches by `(amount, transferType-label)` — both data-attributes that
 *  the wallet exposes on the card root and that mirror what the user
 *  sees in the rendered card. The user's confirmation event is the
 *  status icon flipping to the green check; the test waits for the
 *  same fact instead of sleeping past it.
 *
 *  Throws with a `(hash=...)` diagnostic if the card reaches a terminal
 *  state that isn't "confirmed" (i.e. "failed" — reverted or dropped),
 *  so flakes surface the chain hash for crash forensics.
 *
 *  "confirmed" here means **first-mined** (Proposed | Checkpointed |
 *  Proven | Finalized) — the same fact the user sees as the green check
 *  icon. NOT on-chain finality.
 *
 *  Scope caveat: safe for sequential submits with unique `(amount,
 *  transferType)` pairs (the transfers scenario). NOT a safe generic
 *  primitive for parallel or repeated identical-shape submits — a stale
 *  confirmed card from an earlier submit could false-positive. */
export async function waitForTxConfirmation(
	page: Page,
	opts: { amount: string; fromType: "public" | "private"; toType: "public" | "private"; timeout?: number },
): Promise<void> {
	const { amount, fromType, toType, timeout = 60_000 } = opts
	const label = transferTypeLabel(fromType, toType)
	await page.waitForFunction(
		({ a, t }: { a: string; t: string }) => {
			const card = document.querySelector(`[data-testid="tx-card"][data-tx-amount-display="${a}"][data-tx-transfer-type="${t}"]`)
			if (!card) return false
			const status = card.getAttribute("data-tx-status")
			return status === "confirmed" || status === "failed"
		},
		{ timeout, polling: 250 },
		{ a: amount, t: label },
	)
	const meta = await page.evaluate(
		({ a, t }: { a: string; t: string }) => {
			const card = document.querySelector(`[data-testid="tx-card"][data-tx-amount-display="${a}"][data-tx-transfer-type="${t}"]`)
			return {
				status: card?.getAttribute("data-tx-status"),
				hash: card?.getAttribute("data-tx-hash"),
			}
		},
		{ a: amount, t: label },
	)
	if (meta.status !== "confirmed") {
		throw new Error(
			`waitForTxConfirmation: tx ${label} ${amount} terminal as "${meta.status}" (hash=${meta.hash ?? "?"}), expected "confirmed"`,
		)
	}
}

/** Wait for the settled `tx-card` carrying `hash` in the feed the page is showing. The hash is
 *  the one the dApp received back, so it keys the card exactly; the compare ignores case because
 *  the two sides may print it differently. */
export async function waitForTxCardByHash(page: Page, hash: string, timeout = 60_000): Promise<void> {
	await page.waitForFunction(
		(want: string) =>
			[...document.querySelectorAll('[data-testid="tx-card"]')].some(
				(card) => (card.getAttribute("data-tx-hash") ?? "").toLowerCase() === want,
			),
		{ timeout, polling: 250 },
		hash.toLowerCase(),
	)
}

/** Whether a settled `tx-card` carrying `hash` is present right now. */
export async function hasTxCardByHash(page: Page, hash: string): Promise<boolean> {
	return page.evaluate(
		(want: string) =>
			[...document.querySelectorAll('[data-testid="tx-card"]')].some(
				(card) => (card.getAttribute("data-tx-hash") ?? "").toLowerCase() === want,
			),
		hash.toLowerCase(),
	)
}

// ── Fee Method ────────────────────────────────────────────────────────

/** The three selectable fee methods (`send-fee-method-{subtitle}` testids);
 *  the fourth rendered entry ("coming soon") is disabled by design. */
export type FeeMethodSubtitle = "sponsored" | "public" | "private"

/** How long a fee row can stay loading on Send: the forced balance read waits out a read already in
 *  flight, then runs its own, each bounded by the balances store's 20s fetch timeout. */
export const FEE_ROW_READY_MS = 45_000

/** Select a fee payment method in the shared FeeSettingsCard dropdown (the
 *  send flow AND the dApp execute/authwit popups embed the same card).
 *  `mountTimeoutMs` bounds every wait. The card can mount late, and its rows
 *  stay loading (aria-disabled, inert) until the read that answers them lands:
 *  the sponsor rows with the FPC list, the Fee Juice rows with the balance read,
 *  which is forced on every Send mount and takes seconds on a cold path. So the
 *  row is clicked only once it is enabled, and the default wait covers that read. */
export async function selectFeeMethod(
	page: Page,
	methodSubtitle: FeeMethodSubtitle,
	opts: { mountTimeoutMs?: number } = {},
): Promise<void> {
	const mountTimeoutMs = opts.mountTimeoutMs ?? FEE_ROW_READY_MS
	await page.waitForSelector('[data-testid="send-fee-method-trigger"]', { visible: true, timeout: mountTimeoutMs })
	// Open the fee method dropdown (items teleport to #dropdown)
	await page.evaluate(() => {
		;(document.querySelector('[data-testid="send-fee-method-trigger"]') as HTMLElement)?.click()
	})

	const row = `send-fee-method-${methodSubtitle}`
	await withTimeoutMessage(clickByTestId(page, row, mountTimeoutMs), async () => {
		const state = await page.evaluate((id: string) => {
			const el = document.querySelector(`[data-testid="${id}"]`)
			if (!el) return "absent"
			const text = el.textContent?.replace(/\s+/g, " ").trim()
			return el.getAttribute("aria-disabled") === "true" ? `disabled: ${text}` : "enabled"
		}, row)
		return `selectFeeMethod: ${row} was not selectable within ${mountTimeoutMs}ms (now ${state})`
	})

	// The trigger exposes `data-fee-method` once the selection commits;
	// wait for it to match instead of guessing at Vue's render timing.
	await withTimeoutMessage(
		page.waitForFunction(
			(want: string) => document.querySelector('[data-testid="send-fee-method-trigger"]')?.getAttribute("data-fee-method") === want,
			{ timeout: mountTimeoutMs, polling: 50 },
			methodSubtitle,
		),
		async () =>
			`selectFeeMethod: picked ${methodSubtitle}, but the trigger read ${await getSelectedFeeMethod(page)} after ${mountTimeoutMs}ms`,
	)
}

/** Read the currently selected fee method from the trigger's data attribute. */
export async function getSelectedFeeMethod(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		const trigger = document.querySelector('[data-testid="send-fee-method-trigger"]')
		return trigger?.getAttribute("data-fee-method") ?? null
	})
}
