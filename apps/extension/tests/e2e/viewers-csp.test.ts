/**
 * The logs window's editor under `style-src` without `'unsafe-inline'`: its styles reach it in its
 * shadow root, and a selection or focus inside the root still stops the follow of new lines. The
 * launch's CSP recorder fails the file on a blocked style. The follow is read off the viewer's own
 * state, its scroll-to-end button, which a line it does not follow shows: CodeMirror keeps a view
 * that rests within 4px of its end there on its own, so where the view lands proves nothing.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage, prepareClick } from "./fixtures/browser"
import { readEditorStyles } from "./fixtures/code-editor"
import { type ExtensionContext, test } from "./fixtures/extension"

const HOST = "logs-editor"
/** Under one line's height: the follow's scroll to the end, give or take CodeMirror's margin. */
const AT_END = 10

/** The scroller's geometry, read once the frames after a change have run. */
async function scroller(page: Page): Promise<{ height: number; gapToEnd: number }> {
	return page.evaluate(async (id) => {
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
		if (!(el instanceof HTMLElement)) throw new Error("the logs editor has no scroller")
		return { height: el.scrollHeight, gapToEnd: el.scrollHeight - el.scrollTop - el.clientHeight }
	}, HOST)
}

/**
 * Logs `count` lines from the window, then waits until the editor has grown by that many lines and
 * stayed still long enough for any line still in flight, and CodeMirror's scroll after it, to land.
 */
async function logLines(page: Page, count: number): Promise<void> {
	const { height } = await scroller(page)
	const lineHeight = await page.evaluate((id) => {
		const line = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-line")
		if (!(line instanceof HTMLElement)) throw new Error("the logs editor rendered no line")
		return line.getBoundingClientRect().height
	}, HOST)
	await page.evaluate((n) => {
		for (let i = 0; i < n; i++) console.info(`viewer probe ${i}`)
	}, count)
	await page.waitForFunction(
		(id, min) => {
			const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
			if (!(el instanceof HTMLElement)) return false
			const w = window as unknown as { __probeHeight?: number; __probeSince?: number }
			if (el.scrollHeight !== w.__probeHeight) {
				w.__probeHeight = el.scrollHeight
				w.__probeSince = performance.now()
				return false
			}
			return el.scrollHeight >= min && performance.now() - (w.__probeSince ?? 0) >= 300
		},
		{ timeout: 10_000, polling: 50 },
		HOST,
		height + count * lineHeight - 1,
	)
}

/** Logs one line and reports whether the viewer followed it. */
async function followsNextLine(page: Page): Promise<boolean> {
	expect(await page.$('[data-testid="logs-scroll-btn"]')).toBeNull()
	await page.evaluate(() => {
		const w = window as unknown as { __scrollBtnShown?: boolean }
		w.__scrollBtnShown = false
		new MutationObserver((records, observer) => {
			const shown = records.some(({ addedNodes }) =>
				[...addedNodes].some(
					(node) =>
						node instanceof Element &&
						(node.matches('[data-testid="logs-scroll-btn"]') || node.querySelector('[data-testid="logs-scroll-btn"]')),
				),
			)
			if (!shown) return
			w.__scrollBtnShown = true
			observer.disconnect()
		}).observe(document.body, { childList: true, subtree: true })
	})
	await logLines(page, 1)
	return !(await page.evaluate(() => (window as unknown as { __scrollBtnShown?: boolean }).__scrollBtnShown))
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
	expect((await scroller(page)).gapToEnd).toBeLessThan(AT_END)
	return page
}

test("the logs editor takes its styles from its shadow root", async ({ registeredExtension: ctx }) => {
	const page = await openLogs(ctx)
	expect(await readEditorStyles(page, HOST)).toEqual({ display: "flex", fontSize: "13px", scrollbarWidth: "none" })
	await page.close()
})

test("with nothing selected and the search panel closed, new lines are followed", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	expect(await followsNextLine(page)).toBe(true)
	expect((await scroller(page)).gapToEnd).toBeLessThan(AT_END)
	await page.close()
})

test("selecting log text stops the follow", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
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
	expect(await followsNextLine(page)).toBe(false)
	await page.close()
})

test("focusing the search panel stops the follow", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
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
	expect(await followsNextLine(page)).toBe(false)
	await page.close()
})
