/**
 * The logs window's editor under `style-src` without `'unsafe-inline'`: its styles reach it in its
 * shadow root, and a selection or focus inside the root still stops the follow of new lines. The
 * launch's CSP recorder fails the file on a blocked style. The follow is read off the viewer's own
 * state, its scroll-to-end button, which a line it does not follow shows: CodeMirror keeps a view
 * that rests within 4px of its end there on its own, so where the view lands proves nothing.
 */
import { randomUUID } from "node:crypto"
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage, prepareClick } from "./fixtures/browser"
import { readEditorStyles } from "./fixtures/code-editor"
import { type ExtensionContext, test } from "./fixtures/extension"
import { pollUntil } from "./fixtures/poll"

const HOST = "logs-editor"
/** Under one line's height: the follow's scroll to the end, give or take CodeMirror's margin. */
const AT_END = 10
/** The viewer's `SCROLL_DISABLE_THRESHOLD`: a scroll that leaves the view this far from its end
 *  shows the button too, and that show is not a line left unfollowed. */
const SCROLLED_AWAY = 20

/** The scroller's gap to its end, read after two frames with no change to the editor's lines: the
 *  wallet's own lines land at any time, each in the DOM a frame before CodeMirror scrolls to it. */
async function gapToEnd(page: Page): Promise<number> {
	return page.evaluate(async (id) => {
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot
		const el = root?.querySelector(".cm-scroller")
		const content = root?.querySelector(".cm-content")
		if (!(el instanceof HTMLElement) || !content) throw new Error("the logs editor has no scroller")
		let changed = true
		const observer = new MutationObserver(() => {
			changed = true
		})
		observer.observe(content, { childList: true, subtree: true, characterData: true })
		const giveUp = performance.now() + 5_000
		try {
			while (changed) {
				if (performance.now() > giveUp) throw new Error("the logs editor kept changing for 5 s")
				changed = false
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
			}
		} finally {
			observer.disconnect()
		}
		return el.scrollHeight - el.scrollTop - el.clientHeight
	}, HOST)
}

/**
 * Logs `count` lines from the window, then waits until the editor renders the last of them and has
 * settled. Every caller appends at the end of a view resting there, and CodeMirror renders lines past
 * the viewport, so the last line is in the DOM whether or not the view followed it.
 */
async function logLines(page: Page, count: number): Promise<void> {
	const tag = `viewer probe ${randomUUID().slice(0, 8)}`
	await page.evaluate(
		(t, n) => {
			for (let i = 0; i < n; i++) console.info(`${t} ${i}`)
		},
		tag,
		count,
	)
	await pollUntil(
		() =>
			page.evaluate(
				(id, t) => {
					let highest = -1
					for (const line of document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelectorAll(".cm-line") ?? []) {
						const text = line.textContent ?? ""
						const at = text.lastIndexOf(`${t} `)
						const index = at < 0 ? "" : text.slice(at + t.length + 1)
						if (/^\d+$/.test(index)) highest = Math.max(highest, Number(index))
					}
					return highest
				},
				HOST,
				tag,
			),
		(highest) => highest === count - 1,
		{
			label: `the logs editor rendering probe line ${count - 1}`,
			timeoutMs: 10_000,
			intervalMs: 50,
			show: (highest) => `highest probe line rendered ${highest}`,
		},
	)
	await gapToEnd(page)
}

/**
 * Arms the follow check before the step that should stop the follow, so a wallet line landing after
 * that step is seen too. Latched: CodeMirror's stick to the end scrolls the view back, which hides
 * the button again. A scroll away from the end before the first show is recorded, not counted.
 */
async function armFollowCheck(page: Page): Promise<void> {
	const shownAlready = await page.evaluate(
		(id, away) => {
			const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
			if (!(el instanceof HTMLElement)) throw new Error("the logs editor has no scroller")
			const button = '[data-testid="logs-scroll-btn"]'
			const latch = { shown: false, scrolledAway: false, stop: () => {} }
			const onScroll = () => {
				if (el.scrollHeight - el.scrollTop - el.clientHeight >= away) latch.scrolledAway = true
			}
			const observer = new MutationObserver((records) => {
				const added = records.some(({ addedNodes }) =>
					[...addedNodes].some((node) => node instanceof Element && (node.matches(button) || node.querySelector(button))),
				)
				if (!added) return
				latch.shown = true
				latch.stop()
			})
			latch.stop = () => {
				observer.disconnect()
				el.removeEventListener("scroll", onScroll, { capture: true })
			}
			// Capture runs before the viewer's own listener, whose button can stop the latch mid-dispatch.
			el.addEventListener("scroll", onScroll, { capture: true })
			observer.observe(document.body, { childList: true, subtree: true })
			;(window as unknown as { __followCheck?: typeof latch }).__followCheck = latch
			return document.querySelector(button) !== null
		},
		HOST,
		SCROLLED_AWAY,
	)
	expect(shownAlready).toBe(false)
}

/** Logs one line and reports whether the viewer followed every line since `armFollowCheck`. */
async function followedSinceArmed(page: Page): Promise<boolean> {
	await logLines(page, 1)
	const { shown, scrolledAway } = await page.evaluate(() => {
		const latch = (window as unknown as { __followCheck?: { shown: boolean; scrolledAway: boolean; stop: () => void } }).__followCheck
		if (!latch) throw new Error("the follow check was never armed")
		latch.stop()
		return { shown: latch.shown, scrolledAway: latch.scrolledAway }
	})
	expect(scrolledAway).toBe(false)
	return !shown
}

async function openLogs(ctx: ExtensionContext): Promise<Page> {
	const page = await newPage(ctx.browser)
	await page.setViewport({ width: 900, height: 700 })
	await gotoExtensionPage(page, extensionUrl(ctx.extensionId, "/src/popup/index.html#/windows/logger"))
	await page.waitForFunction(
		(id) => !!document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-content"),
		{ timeout: 30_000, polling: 100 },
		HOST,
	)
	return page
}

/** A logs window with more lines than it shows, resting at the end. */
async function filledLogs(ctx: ExtensionContext): Promise<Page> {
	const page = await openLogs(ctx)
	await logLines(page, 60)
	expect(await gapToEnd(page)).toBeLessThan(AT_END)
	return page
}

test("the logs editor takes its styles from its shadow root", async ({ registeredExtension: ctx }) => {
	const page = await openLogs(ctx)
	expect(await readEditorStyles(page, HOST)).toEqual({ display: "flex", fontSize: "13px", scrollbarWidth: "none" })
	await page.close()
})

test("with nothing selected and the search panel closed, new lines are followed", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	await armFollowCheck(page)
	expect(await followedSinceArmed(page)).toBe(true)
	expect(await gapToEnd(page)).toBeLessThan(AT_END)
	await page.close()
})

test("selecting log text stops the follow", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	await armFollowCheck(page)
	const line = await page.evaluate((id) => {
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot
		const view = root?.querySelector(".cm-scroller")?.getBoundingClientRect()
		if (!root || !view) throw new Error("the logs editor has no scroller")
		// CodeMirror renders lines beyond the visible area too; a drag there selects nothing.
		const shown = [...root.querySelectorAll(".cm-line")]
			.map((el) => el.getBoundingClientRect())
			.filter((box) => box.top >= view.top + 4 && box.bottom <= view.bottom - 4 && box.width > 40)
		const box = shown[Math.floor(shown.length / 2)]
		if (!box) throw new Error("the logs editor shows no line")
		return { left: box.left + 2, right: box.left + Math.min(box.width - 4, 300), y: box.top + box.height / 2 }
	}, HOST)
	await prepareClick(page)
	await page.mouse.move(line.left, line.y)
	await page.mouse.down()
	await page.mouse.move(line.right, line.y, { steps: 5 })
	await page.mouse.up()
	const selected = await page.evaluate((id) => {
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot as
			| (ShadowRoot & { getSelection?: () => Selection | null })
			| null
			| undefined
		return (root?.getSelection ? root.getSelection() : document.getSelection())?.toString() ?? ""
	}, HOST)
	expect(selected.length).toBeGreaterThan(0)
	expect(await followedSinceArmed(page)).toBe(false)
	await page.close()
})

test("focusing the search panel stops the follow", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	await armFollowCheck(page)
	await page.evaluate((id) => {
		const content = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-content")
		if (!(content instanceof HTMLElement)) throw new Error("the logs editor has no content")
		content.focus({ preventScroll: true })
	}, HOST)
	// F3 opens the panel while there is no query, on every platform; Mod-F is Cmd on macOS.
	await page.keyboard.press("F3")
	await page.waitForFunction(
		(id) => !!document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.activeElement?.closest(".cm-panel.cm-search"),
		{ timeout: 5_000, polling: 50 },
		HOST,
	)
	expect(await followedSinceArmed(page)).toBe(false)
	await page.close()
})
