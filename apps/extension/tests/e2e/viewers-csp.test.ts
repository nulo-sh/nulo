/**
 * The logs window's editor under `style-src` without `'unsafe-inline'`: its styles reach it in its
 * shadow root, new lines are followed, and a selection or focus inside the root holds the view where
 * it rests while lines arrive, a line that trims the log included; the toolbar's three triggers are Tab
 * stops that Enter and Space open and Escape closes, focus back on each; the more menu opens, and
 * its Clear empties the log, which keeps taking lines. The launch's CSP recorder fails the
 * file on a blocked style. The wallet logs its own lines into the window at any time, so a test waits
 * for its own lines by a nonce. A hold is read off where a shown line lands, measured from where the
 * viewer stopped its follow, and off the viewer's scroll-to-end button.
 */
import { randomUUID } from "node:crypto"
import type { KeyInput, Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage, prepareClick } from "./fixtures/browser"
import { readEditorStyles } from "./fixtures/code-editor"
import { type ExtensionContext, test } from "./fixtures/extension"
import { pollUntil } from "./fixtures/poll"
import { shotSend } from "./fixtures/send-page"
import { pointerClick } from "./helpers/legal-drivers"
import { focusRing, pressEscape, SPACE, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"

const HOST = "logs-editor"
/** Under one line's height: the follow's scroll to the end, give or take CodeMirror's margin. */
const AT_END = 10
/** The viewer's `SCROLL_DISABLE_THRESHOLD`: a scroll that leaves the view this far from its end
 *  shows the button too, and that show is not a line left unfollowed. */
const SCROLLED_AWAY = 20
/** The viewer's cap with Debug mode off, plus the 100 entries it drops at a time. */
const LOG_CAP = 1_100

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
async function logLines(page: Page, count: number, timeoutMs = 10_000): Promise<void> {
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
			timeoutMs,
			intervalMs: 50,
			show: (highest) => `highest probe line rendered ${highest}`,
		},
	)
	await gapToEnd(page)
}

/**
 * Arms the follow check before the step that should stop the follow, so a wallet line landing after
 * that step is seen too. Latched: CodeMirror's stick to the end scrolls the view back, which hides
 * the button again. A scroll that leaves the view away from its end is recorded and refused.
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
			// Never stops the latch: Vue renders the button between the scroll's listeners, and a stop
			// there would drop this one's before it reads.
			const observer = new MutationObserver((records) => {
				latch.shown ||= records.some(({ addedNodes }) =>
					[...addedNodes].some((node) => node instanceof Element && (node.matches(button) || node.querySelector(button))),
				)
			})
			latch.stop = () => {
				observer.disconnect()
				el.removeEventListener("scroll", onScroll)
			}
			// Added after the viewer's listener, so it reads the gap the viewer judges, once CodeMirror's
			// own listener has measured in the event and landed a follow still due.
			el.addEventListener("scroll", onScroll)
			observer.observe(document.body, { childList: true, subtree: true })
			;(window as unknown as { __followCheck?: typeof latch }).__followCheck = latch
			return document.querySelector(button) !== null
		},
		HOST,
		SCROLLED_AWAY,
	)
	expect(shownAlready, "the button showed before the stop step").toBe(false)
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
	expect(scrolledAway, "the view scrolled away from its end").toBe(false)
	return !shown
}

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

/**
 * Drags across part of `line`, leaving it selected, and returns it where it rests once the viewer has
 * stopped its follow: the hold is measured from there.
 */
async function selectAcross(page: Page, line: ShownLine): Promise<ShownLine> {
	// The viewer stops its follow on `selectionchange`, which Firefox dispatches in a later task: the
	// drag is done once a change that shows the selection has run its listeners, the viewer's first.
	// A follow due at the stop lands in CodeMirror's next measure, and its scroll is judged the frame
	// after, so the line is read two frames on.
	await page.evaluate(
		(id, text) => {
			const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot as
				| (ShadowRoot & { getSelection?: () => Selection | null })
				| null
				| undefined
			;(window as unknown as { __selectionSeen?: Promise<number | null> }).__selectionSeen = new Promise((resolve, reject) => {
				const onChange = () => {
					const selection = root?.getSelection ? root.getSelection() : document.getSelection()
					if (!selection || selection.isCollapsed) return
					document.removeEventListener("selectionchange", onChange)
					requestAnimationFrame(() =>
						requestAnimationFrame(() => {
							const view = root?.querySelector(".cm-scroller")?.getBoundingClientRect()
							const shown = [...(root?.querySelectorAll(".cm-line") ?? [])].find((el) => el.textContent === text)
							resolve(view && shown ? shown.getBoundingClientRect().top - view.top : null)
						}),
					)
				}
				document.addEventListener("selectionchange", onChange)
				setTimeout(() => reject(new Error("no selectionchange showed the drag's selection")), 10_000)
			})
		},
		HOST,
		line.text,
	)
	await prepareClick(page)
	await page.mouse.move(line.left, line.y)
	await page.mouse.down()
	await page.mouse.move(line.right, line.y, { steps: 5 })
	await page.mouse.up()
	const { selected, top } = await page.evaluate(async (id) => {
		const top = await (window as unknown as { __selectionSeen?: Promise<number | null> }).__selectionSeen
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot as
			| (ShadowRoot & { getSelection?: () => Selection | null })
			| null
			| undefined
		return { selected: (root?.getSelection ? root.getSelection() : document.getSelection())?.toString() ?? "", top }
	}, HOST)
	expect(selected.length).toBeGreaterThan(0)
	expect(top, `${line.text} once the selection stopped the follow`).not.toBeNull()
	return { ...line, top: top ?? Number.NaN }
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

/**
 * A logs window holding exactly its cap, resting at the end: its next line trims it. After a full cap
 * of lines, lines go one at a time until one trims, which leaves 1,001 entries; 99 more fill it.
 */
async function cappedLogs(ctx: ExtensionContext): Promise<Page> {
	const page = await openLogs(ctx)
	await logLines(page, LOG_CAP, 60_000)
	let trimmed = false
	for (let i = 0; i < 100 && !trimmed; i++) {
		const { height } = await scroller(page)
		await logLines(page, 1)
		trimmed = (await scroller(page)).height < height
	}
	expect(trimmed).toBe(true)
	const before = await scroller(page)
	await logLines(page, LOG_CAP - 1_001)
	const after = await scroller(page)
	expect(after.height - before.height, "a wallet line trimmed the log while it filled").toBeGreaterThanOrEqual(
		(LOG_CAP - 1_001) * (await lineHeight(page)) - 1,
	)
	expect(after.gapToEnd).toBeLessThan(AT_END)
	return page
}

/**
 * Logs `count` lines, one of which trims the log, and waits for the editor to land 100 lines short;
 * a few wallet lines may land with them. A held view renders too little past its end for a burst's
 * last line to show, so the height is the measure.
 */
async function logTrimming(page: Page, count: number): Promise<void> {
	const { height } = await scroller(page)
	const line = await lineHeight(page)
	const tag = `viewer trim ${randomUUID().slice(0, 8)}`
	await page.evaluate(
		(t, n) => {
			for (let i = 0; i < n; i++) console.info(`${t} ${i}`)
		},
		tag,
		count,
	)
	const landed = height + (count - 100) * line
	await settle(page, landed - line / 2, landed + 3 * line)
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

test("a selection at the end holds the view while lines arrive", async ({ registeredExtension: ctx }) => {
	const page = await filledLogs(ctx)
	const line = await selectAcross(page, await middleLine(page))
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
	expect(await gapToEnd(page)).toBeLessThan(AT_END)
	const line = await middleLine(page)
	await logLines(page, 2)
	await expectHeld(page, line)
	await page.close()
})

test("a selection at the end holds the view through the line that trims the log, and through a burst that trims it again", async ({
	registeredExtension: ctx,
}) => {
	const page = await cappedLogs(ctx)
	const line = await selectAcross(page, await middleLine(page))
	// The trim restores the view one line off the end, inside the band a scroll to the end resumes in.
	await logTrimming(page, 1)
	await expectHeld(page, line)
	await logLines(page, 2)
	await expectHeld(page, line)
	// A burst whose 98th line trims: any of the four after it that land before CodeMirror measures
	// ride its snapshot.
	await logTrimming(page, 102)
	await expectHeld(page, line)
	await page.close()
}, 120_000)

async function waitForShownLine(page: Page, text: string, shown: boolean): Promise<void> {
	await pollUntil(
		() =>
			page.evaluate(
				(id, t) =>
					[...(document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelectorAll(".cm-line") ?? [])].some((line) =>
						(line.textContent ?? "").includes(t),
					),
				HOST,
				text,
			),
		(has) => has === shown,
		{ label: `the logs editor ${shown ? "showing" : "no longer showing"} ${text}`, timeoutMs: 10_000, intervalMs: 50 },
	)
}

const sel = (testid: string) => `[data-testid="${testid}"]`
const OPEN_KEYS: KeyInput[] = ["Enter", SPACE]

async function expectAccentRing(page: Page, testid: string): Promise<void> {
	await waitForFocus(page, testid)
	expect(await focusRing(page, testid)).toEqual({ ring: "solid 2px 2px", color: await tokenColor(page, "--nulo-accent") })
}

async function tabStep(page: Page, testid: string, back = false): Promise<void> {
	if (back) await page.keyboard.down("Shift")
	await page.keyboard.press("Tab")
	if (back) await page.keyboard.up("Shift")
	await expectAccentRing(page, testid)
}

async function openAndEscape(page: Page, key: KeyInput, opened: string, focusInside: () => Promise<void>): Promise<void> {
	await page.keyboard.press(key)
	await page.waitForSelector(sel(opened), { visible: true, timeout: 5_000 })
	await focusInside()
	expect(await pressEscape(page)).toBe(true)
	await page.waitForSelector(sel(opened), { hidden: true, timeout: 5_000 })
}

test("the toolbar's Source, Level and more are Tab stops in that order, ringed, that Enter and Space open and Escape closes back onto them", async ({
	registeredExtension: ctx,
}) => {
	const page = await openLogs(ctx)
	await tabTo(page, "logs-filter-source")
	await expectAccentRing(page, "logs-filter-source")
	await tabStep(page, "logs-filter-level")
	await tabStep(page, "logs-more-trigger")

	// The menu's trap sets no first focus, so ArrowDown moves it in: the hand-back below is real.
	for (const key of OPEN_KEYS) {
		await openAndEscape(page, key, "logs-export-csv", async () => {
			await page.keyboard.press("ArrowDown")
			await waitForFocus(page, "logs-export-csv")
		})
		await expectAccentRing(page, "logs-more-trigger")
	}

	await tabStep(page, "logs-filter-level", true)
	for (const key of OPEN_KEYS) {
		await openAndEscape(page, key, "logs-filter-level-panel", async () => {})
		await expectAccentRing(page, "logs-filter-level")
	}

	// Source's search field takes focus as its panel opens, so the Escape must hand it back.
	await tabStep(page, "logs-filter-source", true)
	for (const key of OPEN_KEYS) {
		await openAndEscape(page, key, "logs-filter-source-panel", () => waitForFocus(page, "logs-filter-source-panel"))
		await expectAccentRing(page, "logs-filter-source")
	}

	await tabStep(page, "logs-filter-level")
	await shotSend(page, "logs-toolbar-focus", "logs-filter-level")
	await page.close()
})

test("the more menu offers the CSV export and Clear logs, which empties the log and keeps it live", async ({
	registeredExtension: ctx,
}) => {
	const page = await openLogs(ctx)
	// Past the 100-line bound below, which a trim never crosses: it leaves 1,000 lines.
	await logLines(page, 120)
	const marker = `viewer clear ${randomUUID().slice(0, 8)}`
	await page.evaluate((m) => console.info(m), marker)
	await waitForShownLine(page, marker, true)
	const line = await lineHeight(page)

	await pointerClick(page, "logs-more-trigger")
	await page.waitForSelector(sel("logs-export-csv"), { visible: true, timeout: 5_000 })
	await page.waitForSelector(sel("logs-clear"), { visible: true, timeout: 5_000 })
	await shotSend(page, "logs-more-menu", "logs-more-trigger")

	await pointerClick(page, "logs-clear")
	// The menu's trap hands focus back on a timer; a pointer's focus draws no ring.
	await waitForFocus(page, "logs-more-trigger")
	expect((await focusRing(page, "logs-more-trigger")).ring).toMatch(/^none /)
	// Later lines alone can push the marker out of the rendered range. A cleared log floors at the
	// window's height, under 100 lines.
	await settle(page, 0, 100 * line)
	await waitForShownLine(page, marker, false)
	await logLines(page, 1)
	await page.close()
})
