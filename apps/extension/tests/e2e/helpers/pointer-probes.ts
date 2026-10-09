/**
 * Real-browser facts a page test cannot reach: what the pointer would hit, where the keyboard is,
 * whether the page handled a key.
 * Every probe reads the live document; none clicks (that is `pointerClick` in `legal-drivers.ts`).
 */
import type { Page } from "puppeteer"

const sel = (testid: string) => `[data-testid="${testid}"]`

/** What sits on top of the element at its centre — its testid or tag — or null when the element itself is hit. */
export async function coveredAt(page: Page, testid: string): Promise<string | null> {
	return page.evaluate((s) => {
		const el = document.querySelector(s)
		if (!el) throw new Error(`${s} not found`)
		const box = el.getBoundingClientRect()
		const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
		if (top && (el === top || el.contains(top))) return null
		return top?.getAttribute("data-testid") ?? top?.tagName ?? "nothing"
	}, sel(testid))
}

/** The named control focus is in — the focused element's own testid or its nearest named ancestor's
 *  (an `Input` names its wrapper, not the `<input>`) — or the bare tag when nothing above it is named. */
export async function activeTestId(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.activeElement
		return el?.closest("[data-testid]")?.getAttribute("data-testid") ?? el?.tagName ?? "none"
	})
}

/** Focus lands on the named control. A released focus trap hands focus back on a timer, not in the
 *  release itself, so a read straight after the close can beat it — this waits for the landing. */
export async function waitForFocus(page: Page, testid: string, timeout = 5_000): Promise<void> {
	await page
		.waitForFunction(
			(s: string) => document.activeElement?.closest("[data-testid]")?.getAttribute("data-testid") === s,
			{ timeout, polling: 50 },
			testid,
		)
		.catch(async (error: unknown) => {
			throw new Error(`focus did not land on ${testid} (on ${await activeTestId(page)}): ${String(error)}`)
		})
}

/** Whether focus is inside the popup that holds the named control (its wrapper under `#popup`). A Tab
 *  walk checked with this proves the keyboard never left; one that merely misses an outside control
 *  can pass after focus has escaped. */
export async function focusInPopupOf(page: Page, testid: string): Promise<boolean> {
	return page.evaluate((s) => {
		const el = document.querySelector(s)
		const wrapper = el && [...document.querySelectorAll("#popup > *")].find((w) => w.contains(el))
		return Boolean(wrapper && document.activeElement && wrapper.contains(document.activeElement))
	}, sel(testid))
}

/** Presses Tab `times` times and reports where focus landed after each press. */
export async function tabAround(page: Page, times: number): Promise<string[]> {
	const visited: string[] = []
	for (let i = 0; i < times; i++) {
		await page.keyboard.press("Tab")
		visited.push(await activeTestId(page))
	}
	return visited
}

/** Presses Tab until focus is in the named control, at most `limit` times, and returns the walk. */
export async function tabTo(page: Page, testid: string, limit = 40): Promise<string[]> {
	const visited: string[] = []
	while (visited.length < limit) {
		visited.push(...(await tabAround(page, 1)))
		if (visited.at(-1) === testid) return visited
	}
	throw new Error(`Tab never reached ${testid}: ${visited.join(" → ")}`)
}

type EscapeRead = { __escapeHandled?: boolean }

/** Presses Escape and returns whether the page marked it handled, which decides whether Chrome's
 *  toolbar popup closes; this suite's tab never shows it. The reader is a `window` capture listener
 *  that reads `defaultPrevented` in a `setTimeout(0)` after the dispatch, so a listener that stops
 *  propagation cannot starve it and it still sees every listener's mark. */
export async function pressEscape(page: Page): Promise<boolean> {
	await page.evaluate(() => {
		const w = window as unknown as EscapeRead
		w.__escapeHandled = undefined
		const read = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return
			window.removeEventListener("keydown", read, true)
			setTimeout(() => {
				w.__escapeHandled = e.defaultPrevented
			}, 0)
		}
		window.addEventListener("keydown", read, true)
	})
	await page.keyboard.press("Escape")
	await page.waitForFunction(() => (window as unknown as EscapeRead).__escapeHandled !== undefined, {
		timeout: 5_000,
		polling: 50,
	})
	return page.evaluate(() => (window as unknown as EscapeRead).__escapeHandled === true)
}

/** The colour a design token resolves to on this page's root, as the browser serialises a computed
 *  colour, so it compares with any computed colour. Throws when the root does not define the token. */
export async function tokenColor(page: Page, token: string): Promise<string> {
	return page.evaluate((name: string) => {
		if (!getComputedStyle(document.documentElement).getPropertyValue(name).trim()) throw new Error(`${name} is not defined`)
		const probe = document.createElement("i")
		probe.style.color = `var(${name})`
		document.body.append(probe)
		const color = getComputedStyle(probe).color
		probe.remove()
		return color
	}, token)
}

/** The named control's computed outline: `style width offset`, and its colour, read once its
 *  transitions have settled, since a control with `transition: all` brings its ring in over time. */
export async function focusRing(page: Page, testid: string): Promise<{ ring: string; color: string }> {
	return page.$eval(sel(testid), async (el) => {
		// `getAnimations` flushes style first, so a transition the focus just started is in the list.
		const settled = Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)))
		await Promise.race([settled, new Promise((r) => setTimeout(r, 1_000))])
		const style = getComputedStyle(el)
		return { ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`, color: style.outlineColor }
	})
}
