// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { type Page, TimeoutError } from "puppeteer"
import { isTargetGone, pickFile, prepareClick } from "./browser"

/**
 * Patch a Page so its waiters default to time-based (`polling: 200`)
 * instead of Puppeteer's default `'raf'` (rAF-based) polling.
 *
 * `'raf'` polling is throttled in offscreen / unfocused tabs in modern
 * Chrome. The popup tab can lose focus during async flows when the SW
 * pushes a navigation while another popup window has focus — the page
 * state actually advances, but the waiter never observes it.
 *
 * `waitForFunction` directly accepts `polling`. `waitForSelector` does
 * NOT — it converts to a `waitForFunction` internally with rAF polling
 * baked in. To work around that we re-implement `waitForSelector` on top
 * of `waitForFunction` (running the standard "exists + visible if
 * requested + enabled if requested" predicate in-page). The new
 * implementation honours the same options shape: `{ visible, hidden,
 * timeout }` plus our forced `polling: 200`.
 */
export function patchPagePolling(page: Page): void {
	// ── waitForFunction passthrough ──────────────────────────────────────
	const originalWaitForFunction = page.waitForFunction.bind(page) as Page["waitForFunction"]
	// biome-ignore lint/suspicious/noExplicitAny: signature passthrough for Puppeteer overloads
	;(page as any).waitForFunction = (...args: any[]) => {
		const optionsIdx = args.findIndex((a) => a && typeof a === "object" && ("timeout" in a || "polling" in a))
		if (optionsIdx >= 0) {
			const opts = args[optionsIdx]
			if (!("polling" in opts)) {
				args[optionsIdx] = { ...opts, polling: 200 }
			}
		} else {
			args.splice(1, 0, { polling: 200 })
		}
		return (originalWaitForFunction as unknown as (...a: unknown[]) => unknown)(...args)
	}

	// ── waitForSelector replacement ──────────────────────────────────────
	// Only intercept plain-CSS selectors. Puppeteer also supports prefixed
	// selectors (`text/...`, `xpath/...`, `aria/...`, `pierce/...`); those go
	// through specialized QueryHandlers we don't reimplement. Delegate them
	// to Puppeteer's original waitForSelector.
	const originalWaitForSelector = page.waitForSelector.bind(page) as Page["waitForSelector"]
	const PUPPETEER_PREFIXED_SELECTOR_RE = /^(?:text|xpath|aria|pierce)\//
	// biome-ignore lint/suspicious/noExplicitAny: passthrough for Puppeteer overloads
	;(page as any).waitForSelector = async (selector: string, options: { visible?: boolean; hidden?: boolean; timeout?: number } = {}) => {
		if (PUPPETEER_PREFIXED_SELECTOR_RE.test(selector)) {
			return originalWaitForSelector(selector, options)
		}
		const { visible = false, hidden = false, timeout = 30_000 } = options
		// Use our patched waitForFunction (polling: 200) under the hood.
		// biome-ignore lint/suspicious/noExplicitAny: dynamic invocation on the patched method
		await (page as any).waitForFunction(
			(args: { sel: string; visible: boolean; hidden: boolean }) => {
				const el = document.querySelector<HTMLElement>(args.sel)
				const shown = (e: HTMLElement) => {
					const style = window.getComputedStyle(e)
					if (style.display === "none" || style.visibility === "hidden") return false
					const rect = e.getBoundingClientRect()
					return rect.width !== 0 && rect.height !== 0
				}
				if (args.hidden) return !el || !shown(el)
				return !!el && (!args.visible || shown(el))
			},
			{ timeout, polling: 200 },
			{ sel: selector, visible, hidden },
		)
		// Original waitForSelector returns an ElementHandle. The replacement
		// returns null because our callers all immediately discard it (and
		// element-handle methods are broken by the same CDP regression that
		// motivated this whole approach).
		return null
	}
}

/** Await a puppeteer wait and, on TIMEOUT ONLY, replace it with a diagnostic
 *  that names what never happened. Every other failure — frame detach, CDP
 *  disconnect, page crash — keeps its own identity and message, because
 *  relabelling those as "the state never settled" is exactly how a real fault
 *  gets buried under a plausible-looking flake. The original is preserved as
 *  `cause`. Pass a function when the diagnostic has to read live page state. */
export async function withTimeoutMessage<T>(wait: Promise<T>, message: string | (() => string | Promise<string>)): Promise<T> {
	try {
		return await wait
	} catch (err) {
		if (!(err instanceof TimeoutError)) throw err
		let text: string
		try {
			text = typeof message === "function" ? await message() : message
		} catch (diagErr) {
			// A diagnostic that reads a dead page must never replace the timeout
			// it was meant to explain.
			text = `<diagnostic failed: ${diagErr instanceof Error ? diagErr.message : String(diagErr)}>`
		}
		throw new Error(text, { cause: err })
	}
}

/**
 * Detect puppeteer detach errors that can occur during the brief CDP race
 * between `browser.newPage()` and the first `page.goto(...)`. These signal
 * a half-initialized frame, not a wallet-side problem — retrying with a
 * fresh page resolves them. Symptom string varies across puppeteer-core
 * versions and timing; match on any of the known phrases.
 */
export function isFrameDetachError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err)
	// "Attempted to use detached Frame/Page" is puppeteer's OTHER detach wording
	// (thrown by the handle decorators rather than the navigation path). Without
	// it the retry above cannot see the very failure it exists to absorb.
	return /Navigating frame was detached|frame got detached|Attempted to use detached (Frame|Page)|Session closed|Target closed|Connection closed/i.test(
		msg,
	)
}

/** Wait for Vue hash router to reach the expected hash.
 *
 *  Explicit `polling: 200` matters: Puppeteer's default is `'raf'`
 *  (requestAnimationFrame) which is THROTTLED in offscreen / unfocused tabs
 *  in modern Chrome. The popup tab is technically focused, but during async
 *  flows where the SW pushes a navigation while another popup window has
 *  focus, the rAF-driven poll can stall — the hash transition lands but
 *  this `waitForFunction` never observes it. Time-based polling avoids
 *  the throttling regardless of focus state.
 *
 *  The 15s default budgets for the bare-default call sites, which are all
 *  cold-boot openers (`openPopup` → first route): SW start + Vue mount +
 *  session hydration exceeds 5s under parallel-agent host load, which made
 *  the alphabetically-last files (the `sw-*` family, paying a fresh cold
 *  boot per single-test file at peak accumulated load) the suite's dominant
 *  flake. A genuinely broken route fails at any timeout; call sites that
 *  need a tighter bound pass one explicitly. */
export async function waitForHash(page: Page, expectedHash: string, timeout = 15_000): Promise<void> {
	try {
		await page.waitForFunction((hash: string) => window.location.hash === hash, { timeout, polling: 200 }, expectedHash)
	} catch (err) {
		if (!(err instanceof TimeoutError)) throw err
		// The page that missed the hash may be the stalled one, so its answer is bounded too.
		const at = await Promise.race([
			page
				.evaluate(() => window.location.hash)
				.then(
					(hash) => `the page is at ${JSON.stringify(hash)}`,
					() => "the page's hash is unreadable",
				),
			new Promise<string>((done) => setTimeout(() => done("the page did not answer within 2 s"), 2_000)),
		])
		// Still a TimeoutError, the one type `withTimeoutMessage` relabels; callers wrap this in it.
		throw new TimeoutError(`waitForHash: ${expectedHash} not reached in ${timeout} ms; ${at}`, { cause: err })
	}
}

/** Waits for a profile-creating page, found by its root testid, to settle whether it shows the
 *  Profile-name field: `hidden` for a first profile, `shown` for a later one. */
export async function waitForNameField(page: Page, pageTestId: string, timeout = 15_000): Promise<"hidden" | "shown"> {
	const handle = await withTimeoutMessage(
		page.waitForFunction(
			(id: string) => {
				const state = document.querySelector(`[data-testid="${id}"]`)?.getAttribute("data-name-field")
				return state === "hidden" || state === "shown" ? state : null
			},
			{ timeout, polling: 100 },
			pageTestId,
		),
		`${pageTestId} never settled its name field`,
	)
	return (await handle.jsonValue()) as "hidden" | "shown"
}

/** A first profile: the page settles `hidden` and renders no name input. */
export async function expectNoNameField(page: Page, pageTestId: string, nameInputTestId: string): Promise<void> {
	const state = await waitForNameField(page, pageTestId)
	if (state !== "hidden") throw new Error(`${pageTestId}: a first profile must show no name field, got "${state}"`)
	if (await page.$(`[data-testid="${nameInputTestId}"]`)) throw new Error(`${pageTestId}: ${nameInputTestId} rendered on a first profile`)
}

/** A later profile: the page settles `shown` with the name input prefilled `expected`. */
export async function expectNameFieldPrefill(page: Page, pageTestId: string, nameInputTestId: string, expected: string): Promise<void> {
	const state = await waitForNameField(page, pageTestId)
	if (state !== "shown") throw new Error(`${pageTestId}: a later profile must show the name field, got "${state}"`)
	const value = await page.$eval(`[data-testid="${nameInputTestId}"] input`, (el) => (el as HTMLInputElement).value)
	if (value !== expected) throw new Error(`${nameInputTestId}: expected the prefill "${expected}", got "${value}"`)
}

/** Type into an input found by placeholder.
 *
 *  History: previously used `elementHandle.click({ clickCount: 3 })` + `.type()`,
 *  which routes through Puppeteer's CDP element-handle path. Recent
 *  Chrome/Puppeteer combos (24.4x against Chrome 128+) hang on that path with
 *  `Runtime.callFunctionOn timed out`, even though synthetic in-page clicks
 *  work fine. Now we go through the same page.evaluate + prototype-setter
 *  path that `replaceInputValue` uses — robust across CDP regressions and
 *  also faster because there's no real-mouse-event sequence. */
export async function typeIntoInput(page: Page, placeholder: string, text: string): Promise<void> {
	await replaceInputValue(page, `input[placeholder="${placeholder}"]`, text)
}

/** Click a visible enabled button by its text content.
 *  Uses page.evaluate to find the actual <button> element, avoiding
 *  stale references from Puppeteer's text/ selector matching descendant nodes. */
export async function clickButtonByText(page: Page, text: string, timeout = 10_000): Promise<void> {
	await page.waitForFunction(
		(label: string) => {
			const button = [...document.querySelectorAll("button")].find((b) => {
				const normalized = b.textContent?.replace(/\s+/g, " ").trim()
				if (normalized !== label) return false
				const style = window.getComputedStyle(b)
				const rect = b.getBoundingClientRect()
				return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
			})
			if (!button) return false
			button.click()
			return true
		},
		{ timeout },
		text,
	)
}

/** Replace the full value of an `<input>` identified by a CSS selector,
 *  firing the proper `input` event so Vue v-model updates. Puppeteer's
 *  triple-click → type dance is unreliable on some custom Input wrappers
 *  (the selection gets lost before typing lands).
 *
 *  Picks the LAST matching visible element — Vue often keeps the old popup
 *  mounted for transitions, and the topmost popup is what the user sees.
 *
 *  If the matched element is not itself an `<input>` (e.g., a `data-testid`
 *  forwarded via Vue's `inheritAttrs` lands on the Input component's wrapper
 *  div), descend to the first `<input>` underneath. */
export async function replaceInputValue(page: Page, selector: string, value: string): Promise<void> {
	await page.waitForSelector(selector, { visible: true, timeout: 5_000 })
	await page.evaluate(
		async ({ sel, val }: { sel: string; val: string }) => {
			const candidates = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.offsetParent !== null)
			const matched = candidates[candidates.length - 1]
			if (!matched) throw new Error(`replaceInputValue: no visible match for ${sel}`)
			const input = matched instanceof HTMLInputElement ? matched : (matched.querySelector("input") as HTMLInputElement | null)
			if (!input) throw new Error(`replaceInputValue: no <input> reachable from ${sel}`)
			input.focus()
			// Use the prototype setter so Vue's v-model listener fires
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
			setter?.call(input, val)
			input.dispatchEvent(new Event("input", { bubbles: true }))
			input.dispatchEvent(new Event("change", { bubbles: true }))
			// Vue's reactivity flush is microtask-based. Without an explicit
			// flush before this evaluate returns, a quick chain like
			//   replaceInputValue(a) -> replaceInputValue(b) -> clickByTestId(submit)
			// can race the form's :disabled binding — the click sometimes lands
			// while disabled is still true (button stays gated) AND sometimes
			// fires the click handler with stale values, so the submit handler
			// fast-fails silently. Awaiting two microtasks is enough to flush
			// nested computeds in practice.
			await Promise.resolve()
			await Promise.resolve()
		},
		{ sel: selector, val: value },
	)
}

/** Clicks the last visible, enabled match of `selector`, polling until one exists: a stacked popup
 *  transition can leave the old card in the DOM, and the last match is the topmost. `aria-disabled`
 *  counts as disabled unless `pressAriaDisabled`, since a synthetic click would bypass the
 *  `pointer-events: none` that keeps a person's click off it. */
async function clickLast(page: Page, selector: string, timeout: number, pressAriaDisabled: boolean): Promise<void> {
	await prepareClick(page)
	try {
		await page.waitForFunction(
			(sel: string, pressAria: boolean) => {
				const candidates = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => {
					if ((el as HTMLButtonElement).disabled) return false
					if (!pressAria && el.getAttribute("aria-disabled") === "true") return false
					const style = window.getComputedStyle(el)
					if (style.display === "none" || style.visibility === "hidden") return false
					const rect = el.getBoundingClientRect()
					return rect.width !== 0 && rect.height !== 0
				})
				const target = candidates[candidates.length - 1]
				if (!target) return false
				target.click()
				return true
			},
			{ timeout },
			selector,
			pressAriaDisabled,
		)
	} catch (err) {
		// Approval popups auto-close themselves on the click that resolves the
		// interaction (e.g. cap-approve-btn → resolveInteraction → window.remove).
		// page.waitForFunction is still polling when the Chrome target detaches,
		// throwing nested errors: outer "Waiting failed" / "Error: Waiting failed"
		// with `cause: TargetCloseError("Target closed")` underneath. The click
		// already fired (otherwise the popup wouldn't be closing), so swallow
		// target-detach errors. Re-raise everything else.
		if (!isTargetDetachError(err)) throw err
	}
}

/** Click by an arbitrary CSS selector, for a target whose only stable handle is not a testid.
 *  `pressAriaDisabled` presses an `aria-disabled` match too: only for a control that explains
 *  itself when pressed. */
export async function clickSelector(
	page: Page,
	selector: string,
	opts: { timeout?: number; pressAriaDisabled?: boolean } = {},
): Promise<void> {
	await clickLast(page, selector, opts.timeout ?? 10_000, opts.pressAriaDisabled ?? false)
}

/** Click by `data-testid`; preferred over text matching, which churns with copy, case and i18n. */
export async function clickByTestId(page: Page, testId: string, timeout = 10_000): Promise<void> {
	await clickLast(page, `[data-testid="${testId}"]`, timeout, false)
}

/** Click the control that opens a file picker and answer it with `filePath`. */
export const pickFileByTestId = (page: Page, testId: string, filePath: string): Promise<void> =>
	pickFile(page, () => clickByTestId(page, testId), filePath)

export function isTargetDetachError(err: unknown): boolean {
	const messages: string[] = []
	let current: unknown = err
	let depth = 0
	while (current && typeof current === "object" && "message" in current && depth < 5) {
		messages.push(String((current as { message?: string }).message ?? ""))
		current = (current as { cause?: unknown }).cause
		depth++
	}
	const stack = err instanceof Error && typeof err.stack === "string" ? err.stack : ""
	const haystack = `${messages.join(" ")} ${stack}`
	return /Target ?Close(d)?|frame was detached|frame got detached|Session closed/i.test(haystack) || isTargetGone(haystack)
}
