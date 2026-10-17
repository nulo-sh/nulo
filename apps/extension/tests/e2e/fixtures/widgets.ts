import type { ElementHandle, Page } from "puppeteer"
import { prepareClick } from "./browser"
import { clickByTestId, replaceInputValue, withTimeoutMessage } from "./dom"

// ── Dropdown ───────────────────────────────────────────────────────────

/**
 * Opens the dropdown whose trigger carries `triggerTestId` and resolves once the dropdown's own
 * state (`data-dropdown-open`) reads open. It waits for a visible trigger and clicks at most once:
 * `DropdownRoot` toggles on every trigger click, so a second click would close the menu, and a menu
 * already open is left open.
 */
export async function openDropdown(page: Page, triggerTestId: string): Promise<void> {
	await prepareClick(page)
	await withTimeoutMessage(page.waitForFunction(openTrigger, { timeout: 10_000 }, triggerTestId, true), () =>
		dropdownDiagnostic(page, triggerTestId, "no visible trigger"),
	)
	await withTimeoutMessage(page.waitForFunction(openTrigger, { timeout: 5_000 }, triggerTestId, false), () =>
		dropdownDiagnostic(page, triggerTestId, "the menu never read open"),
	)
}

/** Page side: the state read and the click pick one trigger by `clickByTestId`'s rule, so they never disagree. */
function openTrigger(id: string, click: boolean): boolean {
	const trigger = [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
		.filter((el) => {
			if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return false
			const style = window.getComputedStyle(el)
			if (style.display === "none" || style.visibility === "hidden") return false
			const rect = el.getBoundingClientRect()
			return rect.width > 0 && rect.height > 0
		})
		.at(-1)
	if (!trigger) return false
	const open = trigger.closest("[data-dropdown-open]")?.getAttribute("data-dropdown-open") === "true"
	if (click && !open) trigger.click()
	return click || open
}

/** The page's state at a dropdown wait's timeout, so a red names which stage stalled and why. */
export async function dropdownDiagnostic(page: Page, triggerTestId: string, stage: string): Promise<string> {
	const state = await page.evaluate((id: string) => {
		const triggers = [...document.querySelectorAll(`[data-testid="${id}"]`)]
		return {
			triggers: triggers.length,
			open: triggers.map((el) => el.closest("[data-dropdown-open]")?.getAttribute("data-dropdown-open") ?? null),
			hash: window.location.hash,
			visibility: document.visibilityState,
			focused: document.hasFocus(),
		}
	}, triggerTestId)
	return `${triggerTestId}: ${stage}: ${JSON.stringify(state)}`
}

// ── Snackbar ───────────────────────────────────────────────────────────

/** Wait for the snack whose title or sub contains `text` (case-insensitive: the title is uppercased
 *  by CSS, not in the DOM), optionally of one `kind`, and return it. A success closes itself after
 *  2 s; an error stays until closed. `hold` focuses the card's action in the same task that finds
 *  the card, which holds a success open as a person's focus does; for a test of where the action
 *  leads or what the card says, never of focus, keyboard reach or the card's life. */
export async function waitForToast(
	page: Page,
	text: string,
	timeout = 5_000,
	opts: { kind?: "success" | "info" | "error"; hold?: boolean } = {},
): Promise<ElementHandle<Element>> {
	const handle = await page.waitForFunction(
		(t: string, kind: string | null, hold: boolean) => {
			const reads = (card: Element) =>
				`${card.querySelector('[data-testid="snackbar-title"]')?.textContent ?? ""} ${card.querySelector('[data-testid="snackbar-sub"]')?.textContent ?? ""}`
			const card = [...document.querySelectorAll('[data-testid="snackbar"]')].find(
				(c) => (!kind || c.getAttribute("data-kind") === kind) && reads(c).toLowerCase().includes(t.toLowerCase()),
			)
			if (!card || !hold) return card ?? null
			// The card holds on its `focusin`, which a page without focus never dispatches.
			let held = false
			card.addEventListener(
				"focusin",
				() => {
					held = true
				},
				{ once: true },
			)
			card.querySelector<HTMLElement>('[data-testid="snackbar-action"]')?.focus({ preventScroll: true })
			if (!held) throw new Error(`the snack containing "${t}" took no focus, so nothing holds it open`)
			return card
		},
		{ timeout, polling: 200 },
		text,
		opts.kind ?? null,
		opts.hold === true,
	)
	const element = handle.asElement() as ElementHandle<Element> | null
	if (!element) throw new Error(`the snack containing "${text}" left between the wait and the read`)
	return element
}

/** Wait until no snack shows `text`, read as `waitForToast` reads it; a leaving card still counts. */
export async function waitForToastGone(page: Page, text: string, timeout = 5_000): Promise<void> {
	await page.waitForFunction(
		(t: string) =>
			[...document.querySelectorAll('[data-testid="snackbar"]')].every((card) => {
				const title = card.querySelector('[data-testid="snackbar-title"]')?.textContent ?? ""
				const sub = card.querySelector('[data-testid="snackbar-sub"]')?.textContent ?? ""
				return !`${title} ${sub}`.toLowerCase().includes(t.toLowerCase())
			}),
		{ timeout, polling: 100 },
		text,
	)
}

// ── Popup chain helpers ──────────────────────────────────────────────────

/** Last-resort recovery for popup DOM that outlived its close: presses Escape, then removes every
 *  popup container and dimmer without touching the store — so never while a lower popup must stay
 *  (`settleClosedPopup` is the scoped form). */
export async function closeStuckPopup(page: Page): Promise<void> {
	await page.keyboard.press("Escape").catch(() => undefined)
	await page.evaluate(() => {
		// Mutate any leftover popup containers so subsequent waitForSelector
		// doesn't trip on stale `new-contact-submit` etc. Removing inert DOM
		// is safe — Vue will re-create on next open.
		const teleport = document.querySelector("#popup")
		if (teleport) {
			while (teleport.firstChild) teleport.removeChild(teleport.firstChild)
		}
		const dimmers = document.querySelectorAll("[class*='dark_bg'i]")
		for (const d of dimmers) d.remove()
	})
}

/** Wait for ConfirmPopup to mount, then click its confirm button. Use for
 *  delete-confirm flows that chain through ConfirmPopup. */
export async function acceptConfirmPopup(page: Page, timeout = 5_000): Promise<void> {
	await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout })
	await clickByTestId(page, "confirm-submit")
	// The popup's <Transition> can stick mid-leave in headless Chrome
	// (rAF throttling), so we don't gate on the confirm-submit selector
	// disappearing. Force the close.
	await closeStuckPopup(page)
}

/** Close every open popup via the popupStore. Useful for resetting state
 *  between assertions when a flow leaves a popup mounted. */
export async function closeAllPopups(page: Page): Promise<void> {
	await page.evaluate(() => {
		// Pinia store is exposed on the app's globalThis under the hood, but
		// the most reliable way is to dispatch the same Esc key the popup
		// click-area handles already.
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
	})
	// Best-effort: wait briefly for any active popup teardowns
	await page.waitForFunction(
		() => {
			const popups = document.querySelectorAll('[data-testid$="-submit"], [data-testid$="-cancel"]')
			// If the popup container is still rendering submit/cancel buttons in a
			// teleport target, give it another tick. This is heuristic — most
			// callers are about to navigate anyway.
			return popups.length === 0 || true
		},
		{ timeout: 1_000 },
	)
}

/** Set an input's value AND fire blur so v-model + @blur validation both run.
 *  Use this in form-validation tests where errors only surface on blur. */
export async function setInputAndBlur(page: Page, selector: string, value: string): Promise<void> {
	await replaceInputValue(page, selector, value)
	await page.evaluate((sel: string) => {
		const candidates = [...document.querySelectorAll<HTMLInputElement>(sel)].filter((el) => el.offsetParent !== null)
		const input = candidates[candidates.length - 1]
		input?.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
	}, selector)
}
