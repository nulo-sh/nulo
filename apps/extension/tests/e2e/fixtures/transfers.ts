import type { Page } from "puppeteer"
import { clickByTestId, replaceInputValue, withTimeoutMessage } from "./dom"
import { type SendAction, submitSend } from "./send-page"
import { refreshBalances } from "./tokens"
import { waitForToast } from "./widgets"

// ── Transfer ───────────────────────────────────────────────────────────

export interface SendTransferOptions {
	fromType: "public" | "private"
	toType: "public" | "private"
	amount: string
	destination: string
	/** What the footer must offer this send: "send" at once, or "review" through the sheet because
	 *  the fee names the account. The other offer fails the send (`submitSend`) — a real send is a
	 *  check on the gate, never a detour around it. */
	expect?: SendAction
}

/** Toggle a send-type pair (send-from-type or send-to-type) until the
 *  expected label is active. The SendTypesCard toggle handler is guarded
 *  by token capability flags that arrive asynchronously after popup
 *  mount, so an early click is a no-op. Retries the click every 500ms
 *  for up to 30s, verifying the `toggle_active` class landed on the
 *  expected span. */
export async function setActiveSendType(page: Page, testId: string, desired: "public" | "private"): Promise<void> {
	const targetLabel = desired.toUpperCase()
	await page.waitForFunction(
		({ id, label }: { id: string; label: string }) => {
			const container = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
			if (!container) return false
			const spans = [...container.querySelectorAll("span")]
			const active = spans.find((s) => (s.className ?? "").toLowerCase().includes("active"))
			if (active?.textContent?.trim() === label) return true
			// Kick the toggle (no-op if the handler is still guarded by
			// missing token capabilities; we'll re-check next tick)
			container.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
			return false
		},
		{ timeout: 30_000, polling: 500 },
		{ id: testId, label: targetLabel },
	)
}

/** Execute a transfer via the SendPopup. Uses data-testid selectors throughout.
 *  Opens the popup, toggles types, enters amount + destination, submits, waits for toast. */
export async function sendTransfer(page: Page, opts: SendTransferOptions): Promise<void> {
	// When sending from private, the token-balance cache the Send
	// popup reads may lag the on-chain state. Typical scenario: the
	// prior test shielded value, the tx confirmed, the test closed
	// the page, and this test opened a fresh popup whose cached
	// private balance is still 0 or pre-shield. Without an explicit
	// refresh, the amount input stays :disabled (gated on
	// `tokenBalanceByType`) and `sendTransfer` hangs on the 60s
	// amount-enabled wait. Mirror the manual recovery a user would
	// do: refresh balances on the Assets view, give PXE a moment,
	// then open Send. See memory/feedback_network_e2e_between_m21_prs.
	if (opts.fromType === "private") {
		await refreshBalances(page)
		// No post-refresh sleep: the downstream `tokenBalanceByType > 0`
		// wait on the amount input (60s budget, 2s polling) IS the
		// signal we'd be waiting for. If the refresh hasn't landed by
		// then the test fails honestly with "amount input never enabled"
		// rather than silently proceeding on a stale balance.
	}

	// Open SendPopup
	await page.evaluate(() => {
		;(document.querySelector('[data-testid="actions-send"]') as HTMLElement)?.click()
	})

	// Wait for SendTypesCard to mount
	await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 10_000 })

	// The toggle handler is guarded by token capability flags
	// (hasPrivateTransfers / hasPublicTransfers). On mount, these are
	// falsy until the token loads its metadata, so an early click is a
	// no-op. Poll via setActiveSendType — we assert the expected active
	// label appears before proceeding.
	await setActiveSendType(page, "send-from-type", opts.fromType)
	await setActiveSendType(page, "send-to-type", opts.toType)

	await fillSendForm(page, opts)
	await submitSend(page, { expect: opts.expect ?? "send" })

	// Wait for submission toast + popup auto-close. The toast only appears AFTER client-side
	// proving; native proving (the prover-ON canary) adds tens of seconds to that pipeline —
	// especially the shield (public→private) path — so give it real headroom there. Proverless
	// bulk shards stay tight to keep failures honest-fast.
	await waitForToast(page, "Transaction submitted", process.env.NULO_E2E_PROVERLESS === "1" ? 60_000 : 300_000)
	// Wait for popup to fully close
	await page.waitForFunction(() => !document.querySelector('[data-testid="send-destination-field"]'), { timeout: 10_000 })
}

/** Types the amount and destination into the open Send form, once its amount field takes input. */
export async function enterSendForm(page: Page, opts: { amount: string; destination: string }): Promise<void> {
	// Wait for amount input to become ENABLED
	// AmountCard has :disabled="!tokenBalanceByType" — disabled when balance for selected type is 0/loading
	await page.waitForFunction(
		() => {
			const input = document.querySelector('[data-testid="send-amount-input"]') as HTMLInputElement
			return input && !input.disabled
		},
		{ timeout: 60_000, polling: 2_000 },
	)

	// Enter amount + destination via the v-model-aware helper; Puppeteer's
	// triple-click + type is unreliable on our custom Input wrapper.
	await replaceInputValue(page, '[data-testid="send-amount-input"]', opts.amount)
	await replaceInputValue(page, '[data-testid="send-destination-field"] input', opts.destination)
}

/** Fills the open Send form and waits until the footer is clickable — the fee estimate landed. */
export async function fillSendForm(page: Page, opts: { amount: string; destination: string }): Promise<void> {
	await enterSendForm(page, opts)

	// Wait for send button to become clickable (pointer-events != none)
	// This means fee estimation (which triggers simulateTx → PXE sync) completed.
	try {
		await page.waitForFunction(
			() => {
				const btn = document.querySelector('[data-testid="send-submit"]') as HTMLElement
				return btn && getComputedStyle(btn).pointerEvents !== "none"
			},
			{ timeout: 120_000, polling: 3_000 },
		)
	} catch (e) {
		const snapshot = await page.evaluate(() => {
			const amount = document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')
			const dest = document.querySelector<HTMLInputElement>('[data-testid="send-destination-field"] input')
			const submit = document.querySelector<HTMLElement>('[data-testid="send-submit"]')
			const feeTrigger = document.querySelector<HTMLElement>('[data-testid="send-fee-method-trigger"]')
			return {
				amountValue: amount?.value,
				amountDisabled: amount?.disabled,
				destValue: dest?.value?.slice(0, 20),
				submitText: submit?.textContent?.trim().slice(0, 80),
				submitPointerEvents: submit ? getComputedStyle(submit).pointerEvents : null,
				feeMethodText: feeTrigger?.textContent?.trim().slice(0, 80),
				bodySnippet: (document.body.textContent ?? "").slice(0, 400),
			}
		})
		console.error("[sendTransfer] submit never became enabled. Snapshot:", JSON.stringify(snapshot, null, 2))
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
			return el.getAttribute("aria-disabled") === "true" ? "disabled" : "enabled"
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
