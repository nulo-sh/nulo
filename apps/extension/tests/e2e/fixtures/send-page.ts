/**
 * The Send page from the outside: who is paid, what it says a send publishes, and the one way to
 * submit one. Every real send in the suite goes through `submitSend`, which reads the fee card's tag,
 * the warning and the publish line's `you` together and refuses to click while they disagree, then
 * passes the review: so each send is also a check that the gate and its mirrors hold on the built
 * extension.
 */
import type { Page } from "puppeteer"
import { pointerClick } from "../helpers/legal-drivers"
import { clickByTestId, replaceInputValue, withTimeoutMessage } from "./dom"
import { settleClosedPopup } from "./popup-leave"
import { FEE_ROW_READY_MS, type FeeMethodSubtitle, selectFeeMethod } from "./fee-method"

export { settleThemeTransitions, shotSend } from "./shots"

export type Visibility = "hidden" | "public" | "exposed" | "unknown"

export interface SendView {
	/** `fee-settings-card[data-origin]`; the card stays mounted while its sheet is closed. */
	origin: string | null
	/** `send-fee-method-trigger[data-fee-method]`: may preview a saved pick while balances load. */
	method: string | null
	/** The card's tag `data-notice-shape`; null when no tag is drawn. */
	tag: string | null
	/** `send-publish[data-you]`; null before a person is chosen. */
	you: Visibility | null
	/** The form's warning, `send-fee-warning`, is drawn. */
	warning: boolean
	/** `send-fee-line[data-payer]`. */
	payer: string | null
	sheetOpen: boolean
	/** `send-fee-change[aria-expanded]`: the Fee sheet is open. */
	feeSheetOpen: boolean
}

export interface ReviewView {
	you: Visibility | null
	shape: string | null
	to: string | null
	amount: string | null
	/** `send-review-fee[data-payer]`. */
	payer: string | null
	remedyHref: string | null
	ready: boolean
}

const sel = (testid: string) => `[data-testid="${testid}"]`

/** Opens Send from Home; it asks who is paid first. */
export async function openSend(page: Page): Promise<void> {
	await clickByTestId(page, "actions-send")
	await page.waitForSelector(sel("send-person-step"), { timeout: 10_000 })
}

/** Answers the person step with `destination` the way a paste does: the field takes it, then "Pay this
 *  address", unless the field already chose a contact or an account holding it. Waits for the form and
 *  fails unless its payee is `destination`. */
export async function chooseRecipient(page: Page, destination: string): Promise<void> {
	await replaceInputValue(page, `${sel("send-destination-field")} input`, destination)
	await withTimeoutMessage(
		page.waitForFunction(
			() => {
				if (document.querySelector('[data-testid="send-payee"]')) return true
				document.querySelector<HTMLElement>('[data-testid="send-pay-address"]')?.click()
				return false
			},
			{ timeout: 10_000, polling: 100 },
		),
		async () => `chooseRecipient: the form never opened for ${destination.slice(0, 10)}…; the step shows ${await stepText(page)}`,
	)
	const { destination: payee } = await readSendInputs(page)
	if (payee.toLowerCase() !== destination.toLowerCase()) {
		throw new Error(`chooseRecipient: the form pays ${payee.slice(0, 10)}…, not ${destination.slice(0, 10)}…`)
	}
}

const stepText = (page: Page) =>
	page.evaluate(
		() => document.querySelector('[data-testid="send-person-step"]')?.textContent?.replace(/\s+/g, " ").slice(0, 200) ?? "no step",
	)

export async function readSendView(page: Page): Promise<SendView> {
	return page.evaluate(() => {
		const q = (t: string) => document.querySelector(`[data-testid="${t}"]`)
		return {
			origin: q("fee-settings-card")?.getAttribute("data-origin") ?? null,
			method: q("send-fee-method-trigger")?.getAttribute("data-fee-method") ?? null,
			tag: q("send-fee-privacy-notice")?.getAttribute("data-notice-shape") ?? null,
			you: (q("send-publish")?.getAttribute("data-you") as Visibility | null) ?? null,
			warning: Boolean(q("send-fee-warning")),
			payer: q("send-fee-line")?.getAttribute("data-payer") ?? null,
			sheetOpen: q("send-review-sheet")?.getAttribute("data-open") === "true",
			feeSheetOpen: q("send-fee-change")?.getAttribute("aria-expanded") === "true",
		}
	})
}

/** The card's tag ⇔ the form's warning ⇔ `you` exposed: three readings of one fact. Anything else is
 *  a page at odds with itself. */
export function assertPublishInvariant(view: SendView): SendView {
	const tagged = view.tag !== null
	const exposed = view.you === "exposed"
	if (tagged !== view.warning || view.warning !== exposed) {
		throw new Error(
			`the Send page disagrees with itself (tag ${view.tag}, warning ${view.warning}, you ${view.you}): ${JSON.stringify(view)}`,
		)
	}
	return view
}

/** Waits until the card, under `origin`, names `method` on its trigger: a default takes a balance read
 *  to land, so this is the signal, never a sleep. The returned view has passed the invariant. */
export async function waitForFee(page: Page, origin: "private" | "public", method: FeeMethodSubtitle, timeout = 90_000): Promise<SendView> {
	try {
		await page.waitForFunction(
			({ o, m }: { o: string; m: string }) =>
				document.querySelector('[data-testid="fee-settings-card"]')?.getAttribute("data-origin") === o &&
				document.querySelector('[data-testid="send-fee-method-trigger"]')?.getAttribute("data-fee-method") === m,
			{ timeout, polling: 250 },
			{ o: origin, m: method },
		)
	} catch (e) {
		throw new Error(
			`fee card never settled on ${method} under a ${origin} origin; it shows ${JSON.stringify(await readSendView(page))}`,
			{
				cause: e,
			},
		)
	}
	return assertPublishInvariant(await readSendView(page))
}

/** Waits for the tag to read `shape`, or to be gone (`null`). Returns the settled view, invariant checked. */
export async function waitForTag(page: Page, shape: string | null, timeout = 30_000): Promise<SendView> {
	await page.waitForFunction(
		(want: string | null) =>
			(document.querySelector('[data-testid="send-fee-privacy-notice"]')?.getAttribute("data-notice-shape") ?? null) === want &&
			Boolean(document.querySelector('[data-testid="send-fee-warning"]')) === (want !== null),
		{ timeout, polling: 250 },
		shape,
	)
	return assertPublishInvariant(await readSendView(page))
}

/** Opens the Fee sheet from the line's Change; the card shows inside it. */
export async function openSendFeeSheet(page: Page): Promise<void> {
	await pointerClick(page, "send-fee-change")
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="send-fee-change"]')?.getAttribute("aria-expanded") === "true" &&
			Boolean(document.querySelector('[data-testid="send-fee-sheet"] [data-testid="fee-settings-card"]')),
		{ timeout: 10_000, polling: 100 },
	)
}

/** The Fee sheet is closed in the store and its DOM has left. */
export async function closeSendFeeSheet(page: Page): Promise<void> {
	await page.evaluate(() =>
		document.querySelector<HTMLElement>('[data-testid="send-fee-sheet"] [data-testid="popup-close-btn"]')?.click(),
	)
	await page.waitForFunction(() => document.querySelector('[data-testid="send-fee-change"]')?.getAttribute("aria-expanded") === "false", {
		timeout: 10_000,
		polling: 100,
	})
	await settleClosedPopup(page, "send-fee-sheet")
}

/** Picks Send's fee method in its sheet, then closes the sheet. */
export async function selectSendFeeMethod(page: Page, method: FeeMethodSubtitle, opts: { mountTimeoutMs?: number } = {}): Promise<void> {
	await openSendFeeSheet(page)
	await selectFeeMethod(page, method, { mountTimeoutMs: opts.mountTimeoutMs ?? FEE_ROW_READY_MS })
	await closeSendFeeSheet(page)
}

export async function waitForReview(page: Page, open: boolean, timeout = 15_000): Promise<void> {
	await page.waitForFunction(
		(want: string) => document.querySelector('[data-testid="send-review-sheet"]')?.getAttribute("data-open") === want,
		{ timeout, polling: 100 },
		open ? "true" : "false",
	)
}

/** "Send now" is armed: `data-ready` set and the button enabled. */
export async function waitForReviewReady(page: Page, timeout = 15_000): Promise<void> {
	await page.waitForFunction(
		() => {
			const btn = document.querySelector<HTMLButtonElement>('[data-testid="send-review-submit"]')
			return Boolean(btn) && btn?.getAttribute("data-ready") === "true" && !btn?.disabled
		},
		{ timeout, polling: 100 },
	)
}

export async function readReview(page: Page): Promise<ReviewView> {
	return page.evaluate(() => {
		const q = (t: string) => document.querySelector(`[data-testid="${t}"]`)
		const you = q("send-review-row-you")
		return {
			you: (you?.getAttribute("data-visibility") as Visibility | null) ?? null,
			shape: you?.getAttribute("data-notice-shape") ?? null,
			to: q("send-review-row-to")?.getAttribute("data-visibility") ?? null,
			amount: q("send-review-row-amount")?.getAttribute("data-visibility") ?? null,
			payer: q("send-review-fee")?.getAttribute("data-payer") ?? null,
			remedyHref: q("send-fee-privacy-remedy")?.getAttribute("href") ?? null,
			ready: q("send-review-submit")?.getAttribute("data-ready") === "true",
		}
	})
}

/** "Review send" is a real button: a hit-tested click, so nothing may sit over it. */
export async function openReview(page: Page): Promise<void> {
	await pointerClick(page, "send-submit")
	await waitForReview(page, true)
}

/** The sheet is closed in the store and its DOM has left: finished by hand when the leave transition sticks. */
export async function waitForReviewClosed(page: Page): Promise<void> {
	await waitForReview(page, false)
	await settleClosedPopup(page, "send-review-submit")
}

export async function closeReview(page: Page): Promise<void> {
	await clickByTestId(page, "popup-close-btn")
	await waitForReviewClosed(page)
}

/**
 * Submits the filled form the one way it offers: a real click on "Review send", the sheet, the
 * arming wait, then a real click on "Send now". The toast is the caller's to wait for.
 */
export async function submitSend(page: Page): Promise<SendView> {
	const view = assertPublishInvariant(await readSendView(page))
	await openReview(page)
	await waitForReviewReady(page)
	await pointerClick(page, "send-review-submit")
	return view
}

/** The page has left. */
export async function waitForSendGone(page: Page, timeout = 10_000): Promise<void> {
	await page.waitForFunction(() => !document.querySelector('[data-testid="send-page"]'), { timeout })
}

/** The form's two values: the amount typed and the address the payee block shows whole. */
export async function readSendInputs(page: Page): Promise<{ amount: string; destination: string }> {
	return page.evaluate(() => ({
		amount: document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')?.value ?? "",
		destination: document.querySelector('[data-testid="send-payee-address"]')?.textContent?.replace(/\s+/g, "") ?? "",
	}))
}
