/**
 * The logs window's editor under `style-src` without `'unsafe-inline'`: its styles reach it in its
 * shadow root, and a selection or focus inside the root holds the view where it rests while lines
 * arrive, a line that trims the log included. The launch's CSP recorder fails the file on a blocked
 * style. A hold is read off where a shown line lands and off the viewer's scroll-to-end button.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage, prepareClick } from "./fixtures/browser"
import { readEditorStyles } from "./fixtures/code-editor"
import { type ExtensionContext, test } from "./fixtures/extension"

const HOST = "logs-editor"
/** Under one line's height: the follow's scroll to the end, give or take CodeMirror's margin. */
const AT_END = 10
/** The viewer's cap with Debug mode off, plus the 100 entries it drops at a time: the next entry drops 100. */
const LOG_CAP = 1_100

/** The scroller's geometry, read once the frames after a change have run. */
async function scroller(page: Page): Promise<{ height: number; gapToEnd: number }> {
	return page.evaluate(async (id) => {
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
		if (!(el instanceof HTMLElement)) throw new Error("the logs editor has no scroller")
		return { height: el.scrollHeight, gapToEnd: el.scrollHeight - el.scrollTop - el.clientHeight }
	}, HOST)
}

function lineHeight(page: Page): Promise<number> {
	return page.evaluate((id) => {
		const line = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-line")
		if (!(line instanceof HTMLElement)) throw new Error("the logs editor rendered no line")
		return line.getBoundingClientRect().height
	}, HOST)
}

/** Logs `count` lines from the window, numbered across the run so a line can be found again. */
function logProbes(page: Page, count: number): Promise<number> {
	return page.evaluate((n) => {
		const w = window as unknown as { __probes?: number }
		for (let i = 0; i < n; i++) {
			w.__probes = (w.__probes ?? 0) + 1
			console.info(`viewer probe #${w.__probes}.`)
		}
		return w.__probes ?? 0
	}, count)
}

/**
 * Waits until the scroller's height lies within `[lo, hi]` and has stayed still long enough for any
 * line still in flight, and CodeMirror's scroll after it, to land.
 */
async function settle(page: Page, lo: number, hi = Number.MAX_SAFE_INTEGER, timeout = 10_000): Promise<void> {
	await page.waitForFunction(
		(id, min, max) => {
			const el = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller")
			if (!(el instanceof HTMLElement)) return false
			const w = window as unknown as { __probeHeight?: number; __probeSince?: number }
			if (el.scrollHeight !== w.__probeHeight) {
				w.__probeHeight = el.scrollHeight
				w.__probeSince = performance.now()
				return false
			}
			return el.scrollHeight >= min && el.scrollHeight <= max && performance.now() - (w.__probeSince ?? 0) >= 300
		},
		{ timeout, polling: 50 },
		HOST,
		lo,
		hi,
	)
}

/** Logs `count` lines and waits until the editor has grown by that many. */
async function logLines(page: Page, count: number): Promise<void> {
	const { height } = await scroller(page)
	const line = await lineHeight(page)
	await logProbes(page, count)
	await settle(page, height + count * line - 1)
}

/** Logs one line and reports whether the viewer followed it. */
async function followsNextLine(page: Page): Promise<boolean> {
	expect(await page.$('[data-testid="logs-scroll-btn"]')).toBeNull()
	await page.evaluate(() => {
		const w = window as unknown as { __scrollBtnShown?: boolean }
		w.__scrollBtnShown = false
		// Latched: CodeMirror's stick to the end scrolls the view back, which hides the button again.
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

type ShownLine = { text: string; top: number; left: number; right: number; y: number }

/** The line in the middle of the view: its text, its top below the scroller's, and a span to drag across. */
function middleLine(page: Page): Promise<ShownLine> {
	return page.evaluate((id) => {
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot
		const view = root?.querySelector(".cm-scroller")?.getBoundingClientRect()
		if (!root || !view) throw new Error("the logs editor has no scroller")
		// CodeMirror renders lines beyond the visible area too; a drag there selects nothing.
		const shown = [...root.querySelectorAll(".cm-line")]
			.map((el) => ({ text: el.textContent ?? "", box: el.getBoundingClientRect() }))
			.filter(({ box }) => box.top >= view.top + 4 && box.bottom <= view.bottom - 4 && box.width > 40)
		const line = shown[Math.floor(shown.length / 2)]
		if (!line) throw new Error("the logs editor shows no line")
		const { box } = line
		return {
			text: line.text,
			top: box.top - view.top,
			left: box.left + 2,
			right: box.left + Math.min(box.width - 4, 300),
			y: box.top + box.height / 2,
		}
	}, HOST)
}

/** Where the line reading `text` sits below the scroller's top, or null when it is not rendered. */
function lineTop(page: Page, text: string): Promise<number | null> {
	return page.evaluate(
		async (id, t) => {
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
			const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot
			const view = root?.querySelector(".cm-scroller")?.getBoundingClientRect()
			const line = [...(root?.querySelectorAll(".cm-line") ?? [])].find((el) => el.textContent === t)
			return view && line ? line.getBoundingClientRect().top - view.top : null
		},
		HOST,
		text,
	)
}

/** The view held: `line` sits where it was, within a pixel, and the scroll-to-end button shows. */
async function expectHeld(page: Page, line: ShownLine): Promise<void> {
	const top = await lineTop(page, line.text)
	expect(top, line.text).not.toBeNull()
	expect(Math.abs((top ?? Number.NaN) - line.top), line.text).toBeLessThanOrEqual(1)
	expect(await page.$('[data-testid="logs-scroll-btn"]')).not.toBeNull()
}

/** Drags across part of `line`, leaving it selected. */
async function selectAcross(page: Page, line: ShownLine): Promise<void> {
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

/**
 * A logs window holding exactly its cap, resting at the end: its next line trims it. After a full cap
 * of lines, lines go one at a time until one trims, which leaves 1,001 entries; 99 more fill it.
 */
async function cappedLogs(ctx: ExtensionContext): Promise<Page> {
	const page = await openLogs(ctx)
	const last = await logProbes(page, LOG_CAP)
	// Followed, the last line is rendered once every line has landed.
	await page.waitForFunction(
		(id, t) =>
			[...(document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelectorAll(".cm-line") ?? [])].some((el) =>
				el.textContent?.endsWith(t),
			),
		{ timeout: 60_000, polling: 100 },
		HOST,
		`viewer probe #${last}.`,
	)
	await settle(page, 0)
	let trimmed = false
	for (let i = 0; i < 100 && !trimmed; i++) {
		const { height } = await scroller(page)
		await logProbes(page, 1)
		await page.waitForFunction(
			(id, was) =>
				(document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-scroller") as HTMLElement | null)
					?.scrollHeight !== was,
			{ timeout: 5_000, polling: 20 },
			HOST,
			height,
		)
		trimmed = (await scroller(page)).height < height
	}
	expect(trimmed).toBe(true)
	// A line the test did not log would make one of these trim, and the editor would never grow by 99.
	await logLines(page, LOG_CAP - 1_001)
	expect((await scroller(page)).gapToEnd).toBeLessThan(AT_END)
	return page
}

/** Logs `count` lines, one of which trims the log, and waits for the editor to land 100 lines short. */
async function logTrimming(page: Page, count: number): Promise<void> {
	const { height } = await scroller(page)
	const line = await lineHeight(page)
	await logProbes(page, count)
	const landed = height + (count - 100) * line
	await settle(page, landed - line / 2, landed + line / 2)
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

test("a selection at the end holds the view while lines arrive", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	const line = await middleLine(page)
	await selectAcross(page, line)
	await logLines(page, 2)
	await expectHeld(page, line)
	await page.close()
})

test("the search panel open at the end holds the view while lines arrive", async ({ registeredExtension: ctx }) => {
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
	// The panel lifts the view off the end; scrolling back there resumes the follow, and going back
	// into the search field holds it again, at the end.
	await page.evaluate((id) => {
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot
		const field = root?.activeElement
		const el = root?.querySelector(".cm-scroller")
		if (!(field instanceof HTMLElement) || !(el instanceof HTMLElement)) throw new Error("the search field is not focused")
		el.scrollTop = el.scrollHeight
		field.blur()
		return new Promise<void>((r) => requestAnimationFrame(() => r(field.focus())))
	}, HOST)
	expect((await scroller(page)).gapToEnd).toBeLessThan(AT_END)
	const line = await middleLine(page)
	await logLines(page, 2)
	await expectHeld(page, line)
	await page.close()
})

test("a selection at the end holds the view through the line that trims the log, and through a burst that trims it again", async ({
	registeredExtension: ctx,
}) => {
	const page = await cappedLogs(ctx)
	const line = await middleLine(page)
	await selectAcross(page, line)
	// The trim restores the view one line off the end, inside the band a scroll to the end resumes in.
	await logTrimming(page, 1)
	await expectHeld(page, line)
	await logLines(page, 2)
	await expectHeld(page, line)
	// A burst whose 98th line trims, with four landing after it before CodeMirror measures.
	await logTrimming(page, 102)
	await expectHeld(page, line)
	await page.close()
}, 120_000)
