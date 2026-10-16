/**
 * The logs window's editor under `style-src` without `'unsafe-inline'`: its styles reach it in its
 * shadow root, and focus moving inside the root still stops the follow of new lines. The launch's
 * CSP recorder fails the file on a blocked style. Each case starts at the end of a window with more
 * lines than it shows, so a scroll of its own cannot stop the follow first, and reads the follow off
 * one new line: the viewer re-arms it on any scroll that ends within 20px of the end.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage } from "./fixtures/browser"
import { readEditorStyles } from "./fixtures/code-editor"
import { type ExtensionContext, test } from "./fixtures/extension"

const HOST = "logs-editor"
/** Under one line's height: at the end, or a line short of it. */
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

test("with the search panel closed, new lines are followed", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	await logLines(page, 1)
	expect((await scroller(page)).gapToEnd).toBeLessThan(AT_END)
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
		{
			timeout: 5_000,
			polling: 50,
		},
		HOST,
	)
	await logLines(page, 1)
	expect((await scroller(page)).gapToEnd).toBeGreaterThan(AT_END)
	await page.close()
})
