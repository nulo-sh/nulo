/**
 * The logs window's editor under `style-src` without `'unsafe-inline'`: its styles reach it in its
 * shadow root, and the root's retargeting of focus and selection leaves the follow of new lines as
 * it was. The launch's CSP recorder fails the file on a blocked style. Each case starts at the end
 * of a window with more lines than it shows, so a scroll of its own cannot stop the follow first.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage, prepareClick } from "./fixtures/browser"
import { readEditorStyles } from "./fixtures/code-editor"
import { type ExtensionContext, test } from "./fixtures/extension"

const HOST = "logs-editor"

/** The scroller's geometry, read once the frames after a change have run. */
async function scroller(page: Page): Promise<{ height: number; gapToEnd: number }> {
	return page.evaluate(async (id) => {
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
		if (!(el instanceof HTMLElement)) throw new Error("the logs editor has no scroller")
		return { height: el.scrollHeight, gapToEnd: el.scrollHeight - el.scrollTop - el.clientHeight }
	}, HOST)
}

/** Logs `count` lines from the window and waits until the editor's document has grown by them. */
async function logLines(page: Page, count: number): Promise<void> {
	const { height } = await scroller(page)
	await page.evaluate((n) => {
		for (let i = 0; i < n; i++) console.info(`viewer probe ${i}`)
	}, count)
	await page.waitForFunction(
		(id, min) => {
			const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
			return el instanceof HTMLElement && el.scrollHeight >= min
		},
		{ timeout: 10_000, polling: 50 },
		HOST,
		height + count * 10,
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
	expect((await scroller(page)).gapToEnd).toBeLessThan(2)
	return page
}

test("the logs editor takes its styles from its shadow root", async ({ registeredExtension: ctx }) => {
	const page = await openLogs(ctx)
	expect(await readEditorStyles(page, HOST)).toEqual({ display: "flex", fontSize: "13px", scrollbarWidth: "none" })
	await page.close()
})

test("with nothing selected and the search panel closed, new lines are followed", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	await logLines(page, 3)
	expect((await scroller(page)).gapToEnd).toBeLessThan(2)
	await page.close()
})

test("selecting log text stops the follow", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	const line = await page.evaluate((id) => {
		const lines = [...(document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelectorAll(".cm-line") ?? [])]
		const box = lines[Math.floor(lines.length / 2)]?.getBoundingClientRect()
		if (!box) throw new Error("the logs editor rendered no line")
		return { left: box.left + 2, right: box.left + Math.min(box.width - 4, 300), y: box.top + box.height / 2 }
	}, HOST)
	await prepareClick(page)
	await page.mouse.move(line.left, line.y)
	await page.mouse.down()
	await page.mouse.move(line.right, line.y, { steps: 5 })
	await page.mouse.up()
	await logLines(page, 3)
	expect((await scroller(page)).gapToEnd).toBeGreaterThan(20)
	await page.close()
})

test("focusing the search panel stops the follow", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	await page.evaluate((id) => {
		const content = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-content")
		if (!(content instanceof HTMLElement)) throw new Error("the logs editor has no content")
		content.focus({ preventScroll: true })
	}, HOST)
	await page.keyboard.down("Control")
	await page.keyboard.press("f")
	await page.keyboard.up("Control")
	await page.waitForFunction(
		(id) => !!document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.activeElement?.closest(".cm-panel.cm-search"),
		{
			timeout: 5_000,
			polling: 50,
		},
		HOST,
	)
	await logLines(page, 3)
	expect((await scroller(page)).gapToEnd).toBeGreaterThan(20)
	await page.close()
})
