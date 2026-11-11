/** The shared FeeSettingsCard's method picker: Send's sheet and the dApp windows embed the same card. */
import type { Page } from "puppeteer"
import { clickByTestId, withTimeoutMessage } from "./dom"

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
