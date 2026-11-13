/**
 * The execute window over the armed build's fixtures (`src/e2e/execute-fixture.ts`), which no live
 * dApp sends: numbered steps on a rail, each its own press row, a struct's rows, the decoder's
 * deepest and widest values and the raw values under a readable call, laid out in the real window
 * at the approval window's width and a side panel's. Layout, hit testing, the Tab walk, a pointer
 * drag and paint time need a browser; the component tests hold the rows' content and order.
 * A release build, run without the declaration, renders no fixture.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { BROWSER, bringToFront, isFirefox, reloadExtensionPage, setViewport } from "./fixtures/browser"
import { clickByTestId, openPopup, test } from "./fixtures/extension"
import { openExecuteAuthwits, openExecuteSteps } from "./fixtures/popups"
import { shotSend } from "./fixtures/shots"

const ARMED = process.env.NULO_E2E_EXECUTE_FIXTURE === "1"
const SHOTS = Boolean(process.env.NULO_E2E_SHOT_DIR)
const sel = (id: string) => `[data-testid="${id}"]`
const stepRow = (j: number) => `${sel("execute-op-step-toggle")}[data-step-index="${j}"]`
const step = (j: number) => `${sel("execute-op-summary-call")}[data-call-index="${j}"]`
/** The rows the decoder's widest value draws: one parameter of 1,024 items under 31 arrays each. */
const WIDE_ROWS = 32_769
/** Every element that holds dApp-supplied payload text. */
const PAYLOAD = [
	"execute-op-summary-call",
	"execute-op-payload-row",
	"execute-op-decoded-param",
	"execute-op-arg",
	"execute-op-summary-authwit",
	"execute-op-discovered-authwit",
].map(sel)
/** The authorizations each fixture's estimate lists. */
const AUTHWITS: Record<string, number> = { batch: 2, deep: 1, "wide-authwits": 2 }

/** Loads the fixture's window afresh: a query change alone reuses the mounted window. */
async function openFixture(page: Page, name: string, width: number): Promise<void> {
	await setViewport(page, { width, height: 800 })
	await page.evaluate((hash: string) => {
		window.location.hash = hash
	}, `#/windows/execute?fixture=${name}`)
	await reloadExtensionPage(page)
	await page.waitForSelector(sel("execute-op-item"), { visible: true, timeout: 30_000 })
	const listed = AUTHWITS[name] ?? 0
	await page.waitForFunction(
		(s: string, n: number) => document.querySelectorAll(s).length === n,
		{ timeout: 10_000 },
		sel("execute-op-summary-authwit"),
		listed,
	)
}

/** Opens every step and, once the fixture's estimate has listed them, the authorizations' node. */
async function openEverything(page: Page, name: string): Promise<void> {
	await openExecuteSteps(page)
	if (!AUTHWITS[name]) return
	await openExecuteAuthwits(page)
	await page.waitForFunction(
		(s: string, n: number) => document.querySelectorAll(s).length === n,
		{ timeout: 10_000 },
		sel("execute-discovered-authwit-details"),
		AUTHWITS[name],
	)
}

/** Each payload text line that reaches past the card's left or right edge, with its overshoot. */
async function textPastCard(page: Page): Promise<string[]> {
	return page.evaluate((selectors: string[]) => {
		const card = document.querySelector('[data-testid="execute-op-item"]')?.getBoundingClientRect()
		if (!card) throw new Error("no execute-op-item")
		const lines = (holder: Element) => {
			const found: { text: string; rect: DOMRect }[] = []
			const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const range = document.createRange()
				range.selectNodeContents(node)
				const text = node.textContent?.trim().slice(0, 32) ?? ""
				found.push(...[...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => ({ text, rect })))
			}
			return found
		}
		const all = [...document.querySelectorAll(selectors.join(", "))].flatMap(lines)
		if (all.length === 0) throw new Error("no payload text")
		return all.flatMap(({ text, rect }) => {
			const over = Math.max(card.left - rect.left, rect.right - card.right)
			return over > 0.5 ? [`${text} (${over.toFixed(1)} px)`] : []
		})
	}, PAYLOAD)
}

/** Each step whose chevron starts a line of its own instead of ending its sentence's last line. */
async function chevronsAlone(page: Page): Promise<string[]> {
	return page.$$eval('[data-testid="execute-op-summary-call"]', (rows) => {
		const shown = (node: Node) => node.textContent?.replace(/[\s\u00a0]/g, "") && !node.parentElement?.closest('[aria-hidden="true"]')
		const lastTextBefore = (row: Element, chevron: Element) => {
			const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
			let last: Node | undefined
			for (
				let node = walker.nextNode();
				node && node.compareDocumentPosition(chevron) & Node.DOCUMENT_POSITION_FOLLOWING;
				node = walker.nextNode()
			) {
				if (shown(node)) last = node
			}
			return last
		}
		const lastLine = (node: Node) => {
			const range = document.createRange()
			range.selectNodeContents(node)
			return [...range.getClientRects()].filter((rect) => rect.width > 0).at(-1)
		}
		return rows.flatMap((row) => {
			const at = `step ${row.getAttribute("data-call-index")}`
			const chevron = row.querySelector('[data-testid="execute-op-step-chevron"]')
			const last = chevron && lastTextBefore(row, chevron)
			if (!chevron || !last) throw new Error(`${at} has no chevron, or no text before it`)
			const word = lastLine(last)
			const mark = chevron.getBoundingClientRect()
			// Text and glyph align differently, so a shared line is an overlap of their boxes, not a shared top.
			const beside = word && mark.top < word.bottom && mark.bottom > word.top && mark.left >= word.right - 0.5
			return beside
				? []
				: [`${at}: chevron at ${mark.top.toFixed(1)}, "${last.textContent?.trim().slice(-16)}" ends at ${word?.top.toFixed(1)}`]
		})
	})
}

/** What has focus: its testid, a step row's index, or `scroll` for a scrolling region with no testid. */
async function focused(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null
		if (!el || el === document.body) return "body"
		const index = el.getAttribute("data-step-index")
		const id = el.getAttribute("data-testid")
		if (id) return index === null ? id : `${id}#${index}`
		const style = getComputedStyle(el)
		return /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight ? "scroll" : el.tagName
	})
}

/** 1 when Firefox puts the window's scrolling region in the Tab order: the region overflows. */
const scrollStops = (page: Page): Promise<number> =>
	page.evaluate((firefox: boolean) => {
		for (let el = document.querySelector('[data-testid="execute-op-item"]')?.parentElement; el; el = el.parentElement) {
			if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return firefox ? 1 : 0
		}
		return 0
	}, isFirefox)

/** Tabs `presses` times from the top of the page, each stop read as `focused` reads it. A blur
 *  leaves the browser's start point at the last press, so the walk starts from a focused anchor
 *  ahead of everything. Firefox puts a window that overflows in the Tab order ahead of its controls
 *  (`FIREFOX.md`); a walk never tabs past the stop it asserts, since the next press leaves the page. */
async function tabWalk(page: Page, presses: number): Promise<string[]> {
	await bringToFront(page)
	await page.evaluate(() => {
		const start = document.createElement("span")
		start.tabIndex = -1
		start.dataset.tabWalkStart = ""
		document.body.prepend(start)
		start.focus()
	})
	const stops: string[] = []
	try {
		for (let i = 0; i < presses; i++) {
			await page.keyboard.press("Tab")
			stops.push(await focused(page))
		}
	} finally {
		await page.evaluate(() => document.querySelector("[data-tab-walk-start]")?.remove())
	}
	return stops
}

const isOpen = (page: Page, selector: string) => page.$eval(selector, (el) => el.getAttribute("aria-expanded") === "true")
const rectOf = (page: Page, selector: string) =>
	page.$eval(selector, (el) => {
		const r = el.getBoundingClientRect()
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
	})

/** Every DOM element Tab could reach, not disabled and drawn. */
const tabbableCount = (page: Page) =>
	page.evaluate(
		() =>
			[...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
				(el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
			).length,
	)

/** Every chip is one stop: the app's leads, each step's follows its row, and each authorization's
 *  line holds its consumer's. */
const CHIP = "contract-chip"
const ROWS = [0, 1, 2, 3, 4, 5].map((j) => `execute-op-step-toggle#${j}`)
const STOPS_AT_REST = [CHIP, ...ROWS.flatMap((row) => [row, CHIP]), "execute-op-authwits-toggle", CHIP, CHIP]
const STOPS_OPEN = [
	CHIP,
	...ROWS.flatMap((row) => [row, CHIP, "execute-op-raw-toggle"]),
	"execute-op-authwits-toggle",
	...[0, 1].flatMap(() => [CHIP, "execute-discovered-authwit-toggle", "execute-discovered-authwit-raw-toggle"]),
]
/** The footer's two stops, after every stop of the card. */
const FOOTER = ["execute-reject-btn", "execute-confirm-btn"]

/** Each footer button's testid and hold, read only if it follows the card in document order. */
const footerAfterCard = (page: Page) =>
	page.evaluate((ids: string[]) => {
		const card = document.querySelector('[data-testid="execute-op-item"]')
		if (!card) throw new Error("no execute-op-item")
		return ids.map((id) => {
			const button = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
			const follows = button && card.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
			return follows ? { id, disabled: button.disabled } : { id, missing: true }
		})
	}, FOOTER)

describe.skipIf(!ARMED)("the execute window's rail, over the fixtures", () => {
	test("every payload line stays inside the card and every step's chevron ends its sentence beside the last word, at 400 and at 240 px", {
		timeout: 300_000,
	}, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			for (const width of [400, 240]) {
				for (const name of ["batch", "deep", "ancestry", "depth"]) {
					await openFixture(page, name, width)
					await openEverything(page, name)
					expect(await textPastCard(page), `${name} at ${width} px`).toEqual([])
					expect(await chevronsAlone(page), `${name} at ${width} px`).toEqual([])
				}
			}
		} finally {
			await page.close()
		}
	})

	test("a readable call's raw values open, closed by default, to its wire fields", { timeout: 120_000 }, async ({
		registeredExtension: ctx,
	}) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "batch", 400)
			await page.$eval(stepRow(0), (el) => (el as HTMLElement).click())
			await page.waitForSelector(`${stepRow(0)}[aria-expanded="true"]`, { timeout: 10_000 })
			expect(await page.$(`${step(0)} ${sel("execute-op-raw-args")}`)).toBeNull()
			await page.click(`${step(0)} ${sel("execute-op-raw-toggle")}`)
			await page.waitForSelector(`${step(0)} ${sel("execute-op-raw-args")}`, { visible: true, timeout: 10_000 })
			const fields = await page.$$eval(`${step(0)} ${sel("execute-op-arg-field")}`, (els) =>
				els.map((el) => el.getAttribute("title")),
			)
			// `deposit` carries an order of four fields and a route of two pools, two fields each.
			expect(fields).toHaveLength(8)
			expect(fields.every((f) => /^0x[0-9a-f]{64}$/.test(f ?? ""))).toBe(true)
			expect(await textPastCard(page)).toEqual([])
		} finally {
			await page.close()
		}
	})

	test("the decoder's widest value opens every row with one press on its step and closes with the next", { timeout: 300_000 }, async ({
		registeredExtension: ctx,
	}) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "wide", 400)
			const toPaint = await pressAndCount(page, stepRow(0), sel("execute-op-decoded-param"), WIDE_ROWS)
			console.log(`[execute-steps] wide: ${toPaint.rows} rows painted ${toPaint.ms} ms after the press`)
			expect(toPaint.rows).toBe(WIDE_ROWS)
			await page.$eval(stepRow(0), (el) => (el as HTMLElement).click())
			await page.waitForFunction(() => document.querySelector('[data-testid="execute-op-details"]') === null, { timeout: 30_000 })
		} finally {
			await page.close()
		}
	})

	test("the authorizations' node opens two of the widest authorizations with one press", { timeout: 300_000 }, async ({
		registeredExtension: ctx,
	}) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "wide-authwits", 400)
			const toPaint = await pressAndCount(
				page,
				sel("execute-op-authwits-toggle"),
				sel("execute-discovered-authwit-decoded-param"),
				2 * WIDE_ROWS,
			)
			console.log(`[execute-steps] wide-authwits: ${toPaint.rows} rows painted ${toPaint.ms} ms after the press`)
			expect(toPaint.rows).toBe(2 * WIDE_ROWS)
			await clickByTestId(page, "execute-op-authwits-toggle")
			await page.waitForFunction(() => document.querySelector('[data-testid="execute-discovered-authwit-details"]') === null, {
				timeout: 30_000,
			})
		} finally {
			await page.close()
		}
	})

	test("batch: Tab meets 16 stops at rest and 26 with everything open, then the footer; 7 presses open everything, 15 reach every value", {
		timeout: 180_000,
	}, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "batch", 400)
			// A fixture answers no request, so the footer's two stops are held; under a request they
			// follow the card's, 18 at rest and 28 open.
			expect(await footerAfterCard(page)).toEqual(FOOTER.map((id) => ({ id, disabled: true })))
			expect(STOPS_AT_REST.length + FOOTER.length).toBe(18)
			const restScroll = await scrollStops(page)
			const atRest = await tabWalk(page, STOPS_AT_REST.length + restScroll)
			expect(atRest).toEqual([...Array(restScroll).fill("scroll"), ...STOPS_AT_REST])
			expect(await tabbableCount(page)).toBe(STOPS_AT_REST.length)

			let presses = 0
			for (const row of [...ROWS.map((_, j) => stepRow(j)), sel("execute-op-authwits-toggle")]) {
				await page.$eval(row, (el) => (el as HTMLElement).click())
				await page.waitForSelector(`${row}[aria-expanded="true"]`, { timeout: 10_000 })
				presses++
			}
			expect(presses).toBe(7)
			const raws = await page.$$(`${sel("execute-op-raw-toggle")}, ${sel("execute-discovered-authwit-raw-toggle")}`)
			expect(presses + raws.length).toBe(15)
			expect(await tabbableCount(page)).toBe(STOPS_OPEN.length)
			const openScroll = await scrollStops(page)
			const open = await tabWalk(page, STOPS_OPEN.length + openScroll)
			expect(open).toEqual([...Array(openScroll).fill("scroll"), ...STOPS_OPEN])
			expect(STOPS_OPEN.length + FOOTER.length).toBe(28)
		} finally {
			await page.close()
		}
	})

	test("Enter on a row opens its step with focus left on the row, which does not move; the next Tab reaches its chip, the one after enters the step, where Enter opens the raw values", {
		timeout: 120_000,
	}, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "batch", 400)
			const scroll = await scrollStops(page)
			expect((await tabWalk(page, 4 + scroll)).slice(scroll)).toEqual([
				CHIP,
				"execute-op-step-toggle#0",
				CHIP,
				"execute-op-step-toggle#1",
			])
			const before = await rectOf(page, stepRow(1))
			await page.keyboard.press("Enter")
			await page.waitForSelector(`${stepRow(1)}[aria-expanded="true"]`, { timeout: 10_000 })
			expect([await focused(page), (await rectOf(page, stepRow(1))).top]).toEqual(["execute-op-step-toggle#1", before.top])
			expect([await isOpen(page, stepRow(0)), await isOpen(page, stepRow(2))]).toEqual([false, false])
			await page.keyboard.press("Tab")
			expect(await page.evaluate((s: string) => document.querySelector(s)?.contains(document.activeElement), step(1))).toBe(true)
			expect(await focused(page)).toBe(CHIP)
			await page.keyboard.press("Tab")
			expect(await focused(page)).toBe("execute-op-raw-toggle")
			await page.keyboard.press("Enter")
			await page.waitForSelector(`${step(1)} ${sel("execute-op-raw-args")}`, { visible: true, timeout: 10_000 })
			expect([await focused(page), await isOpen(page, stepRow(1))]).toEqual(["execute-op-raw-toggle", true])
		} finally {
			await page.close()
		}
	})

	test("by mouse: a drag over the recipient selects it and a press on a named address or a chip opens nothing of the step; the text and the padding open it", {
		timeout: 180_000,
	}, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "batch", 400)
			await bringToFront(page)
			const recipient = `${step(2)} ${sel("execute-op-line-to")}`
			const address = await rectOf(page, recipient)
			const midY = address.top + address.height / 2
			await page.mouse.move(address.left + 1, midY)
			await page.mouse.down()
			await page.mouse.move(address.right - 1, midY, { steps: 8 })
			await page.mouse.up()
			const selected = await page.evaluate(() => window.getSelection()?.toString().trim())
			expect(selected).toBe(await page.$eval(recipient, (el) => el.textContent?.trim()))
			expect(await isOpen(page, stepRow(2))).toBe(false)
			await page.evaluate(() => window.getSelection()?.removeAllRanges())

			const named = `${step(2)} ${sel("execute-op-line-from")}[data-address-shows="name"]`
			await page.waitForSelector(named, { visible: true, timeout: 10_000 })
			await page.click(named)
			expect(await isOpen(page, stepRow(2))).toBe(false)

			await page.click(`${step(0)} ${sel("execute-op-summary-call-title")}`)
			await page.waitForSelector(`${stepRow(0)}[aria-expanded="true"]`, { timeout: 10_000 })
			// The row's padding, past its sentence: the press lands on the row's own button.
			const row = await page.$eval(stepRow(1), (el) => {
				const r = el.parentElement!.getBoundingClientRect()
				return { left: r.left, top: r.top, height: r.height }
			})
			expect(row.height, "a one-line step's press reaches past 24 px").toBeGreaterThanOrEqual(24)
			expect(
				await page.evaluate(
					(x: number, y: number) => document.elementFromPoint(x, y)?.getAttribute("data-step-index"),
					row.left + 2,
					row.top + 2,
				),
			).toBe("1")
			await page.mouse.click(row.left + 2, row.top + 2)
			await page.waitForSelector(`${stepRow(1)}[aria-expanded="true"]`, { timeout: 10_000 })

			await page.click(`${step(3)} ${sel(CHIP)}`)
			await page.waitForSelector(sel("contract-chip-panel"), { visible: true, timeout: 10_000 })
			expect(await isOpen(page, stepRow(3))).toBe(false)
		} finally {
			await page.close()
		}
	})

	test("ten calls: the tenth box holds 10 inside its 20 px", { timeout: 120_000 }, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "ten", 400)
			const tenth = await page.$eval(`${step(9)} ${sel("execute-op-step-number")}`, (box) => {
				const range = document.createRange()
				range.selectNodeContents(box)
				const text = range.getBoundingClientRect()
				const r = box.getBoundingClientRect()
				return {
					label: box.textContent?.trim(),
					width: r.width,
					height: r.height,
					inside: text.left >= r.left && text.right <= r.right,
				}
			})
			expect(tenth).toEqual({ label: "10", width: 20, height: 20, inside: true })
		} finally {
			await page.close()
		}
	})

	// Firefox refuses a capture of an extension page (`FIREFOX.md`); captures are opt-in output.
	test.skipIf(!SHOTS || BROWSER !== "chrome")(
		"captures of the rail, light and dark",
		{ timeout: 300_000 },
		async ({ registeredExtension: ctx }) => {
			const page = await openPopup(ctx)
			try {
				for (const name of ["one", "batch", "deep", "raw"]) {
					await openFixture(page, name, 400)
					await shotSend(page, `execute-${name}-rest-400`, "execute-op-summary")
					await page.$eval(stepRow(name === "batch" ? 1 : 0), (el) => (el as HTMLElement).click())
					await shotSend(page, `execute-${name}-one-open-400`, "execute-op-details")
					await openFixture(page, name, 400)
					await openEverything(page, name)
					await shotSend(page, `execute-${name}-all-open-400`, "execute-op-from-account")
				}
				await openFixture(page, "batch", 240)
				await shotSend(page, "execute-batch-rest-240", "execute-op-summary")
				for (const name of ["batch", "deep"]) {
					await openFixture(page, name, 240)
					await openEverything(page, name)
					await shotSend(page, `execute-${name}-all-open-240`, "execute-op-from-account")
				}
				await openFixture(page, "batch", 400)
				await tabWalk(page, 2)
				await shotSend(page, "execute-batch-focus-400", "execute-op-summary")
				await openFixture(page, "ten", 400)
				await shotSend(page, "execute-ten-rest-400", "execute-op-leaves-account")
			} finally {
				await page.close()
			}
		},
	)
})

/** Presses `press` inside one task and counts `rows` each frame until `want` are mounted, then two
 *  frames more, so the time spans the press to the rows painted. */
async function pressAndCount(page: Page, press: string, rows: string, want: number): Promise<{ ms: number; rows: number }> {
	return page.evaluate(
		async (target: string, row: string, n: number) => {
			const el = document.querySelector<HTMLElement>(target)
			if (!el) throw new Error(`no ${target}`)
			const count = () => document.querySelectorAll(row).length
			const start = performance.now()
			el.click()
			await new Promise<void>((resolve) => {
				const tick = () => (count() >= n ? resolve() : requestAnimationFrame(tick))
				tick()
			})
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			return { ms: Math.round(performance.now() - start), rows: count() }
		},
		press,
		rows,
		want,
	)
}

const chipOf = (j: number) => `${step(j)} ${sel(CHIP)}`
const chipOpen = (page: Page, selector: string) => page.$eval(selector, (el) => el.getAttribute("aria-expanded") === "true")
const pressShut = (page: Page) =>
	page.waitForFunction((s: string) => !document.querySelector(s), { timeout: 10_000 }, sel("contract-chip-panel"))
const shiftTab = async (page: Page) => {
	await page.keyboard.down("Shift")
	await page.keyboard.press("Tab")
	await page.keyboard.up("Shift")
}

/** A source run holds the fixture list, whose Testnet entries the `listed` fixture calls; an artifact
 *  run is unarmed, so it skips these. */
describe.skipIf(!ARMED)("contract chips over the held list", () => {
	test("the worker's list reaches each chip: a listed token draws its picture, symbol and solid seal, the PrivateFPC its name and seal; a flagged token keeps its badge and an unknown contract its short address, neither sealed", {
		timeout: 120_000,
	}, async ({ listedExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "listed", 400)
			await page.waitForSelector(`${chipOf(0)}[data-level="nulo"]`, { timeout: 10_000 })
			const chips = await page.$$eval(sel("execute-op-summary-call"), (rows) =>
				rows.map((row) => {
					const chip = row.querySelector('[data-testid="contract-chip"]')
					return {
						level: chip?.getAttribute("data-level"),
						name: chip?.getAttribute("aria-label"),
						label: chip?.querySelector('[data-testid="execute-op-summary-call-to"]')?.textContent?.trim(),
						picture: Boolean(chip?.querySelector('[data-testid="token-mark-logo"]')),
						badge: Boolean(chip?.querySelector('[data-testid="token-mark"] svg')),
						seal: Boolean(chip?.querySelector('[data-testid="contract-chip-seal"]')),
					}
				}),
			)
			expect(chips).toEqual([
				{ level: "nulo", name: "USDC, Nulo verified", label: "USDC", picture: true, badge: false, seal: true },
				{ level: "none", name: "0x000000..00f1, Unverified", label: "0x000000..00f1", picture: false, badge: true, seal: false },
				{ level: "none", name: "0x2c3d4e..4e5f, Unverified", label: "0x2c3d4e..4e5f", picture: false, badge: false, seal: false },
				{
					level: "nulo",
					name: "Private Fee Juice, Nulo verified",
					label: "Private Fee Juice",
					picture: false,
					badge: false,
					seal: true,
				},
			])
		} finally {
			await page.close()
		}
	})

	test("by key: Enter or Space on a chip opens its press on its link and leaves the step shut; Tab goes on past the chip and shuts it; Shift+Tab and Escape return to the chip; the app's press keeps focus on its chip; at 240 px a press stays in the window, the lowest included", {
		timeout: 180_000,
	}, async ({ listedExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "listed", 400)
			await page.waitForSelector(`${chipOf(0)}[data-level="nulo"]`, { timeout: 10_000 })
			const scroll = await scrollStops(page)
			expect((await tabWalk(page, 3 + scroll)).slice(scroll)).toEqual([CHIP, "execute-op-step-toggle#0", CHIP])
			await page.keyboard.press("Enter")
			await page.waitForSelector(sel("contract-chip-panel"), { visible: true, timeout: 10_000 })
			expect([await focused(page), await isOpen(page, stepRow(0))]).toEqual(["contract-chip-explorer-link", false])

			await page.keyboard.press("Tab")
			await pressShut(page)
			expect([await focused(page), await chipOpen(page, chipOf(0))]).toEqual(["execute-op-step-toggle#1", false])
			await shiftTab(page)
			expect(await focused(page)).toBe(CHIP)

			await page.keyboard.press("Enter")
			await page.waitForSelector(sel("contract-chip-explorer-link"), { visible: true, timeout: 10_000 })
			await shiftTab(page)
			await pressShut(page)
			expect(await page.$eval(chipOf(0), (el) => el === document.activeElement)).toBe(true)

			await page.keyboard.press("Enter")
			await page.waitForSelector(sel("contract-chip-explorer-link"), { visible: true, timeout: 10_000 })
			await page.keyboard.press("Escape")
			await pressShut(page)
			expect(await page.$eval(chipOf(0), (el) => el === document.activeElement)).toBe(true)
			expect(await isOpen(page, stepRow(0))).toBe(false)
			await page.keyboard.press(" ")
			await page.waitForSelector(sel("contract-chip-explorer-link"), { visible: true, timeout: 10_000 })
			expect(await isOpen(page, stepRow(0))).toBe(false)
			await page.keyboard.press("Escape")
			await pressShut(page)

			const app = `${sel("execute-dapp-name")} ${sel(CHIP)}`
			await page.focus(app)
			await page.keyboard.press("Enter")
			await page.waitForSelector(sel("contract-chip-panel"), { visible: true, timeout: 10_000 })
			expect(await page.$eval(app, (el) => el === document.activeElement)).toBe(true)
			await page.keyboard.press("Tab")
			await pressShut(page)
			expect(await focused(page)).toBe("execute-op-step-toggle#0")

			await openFixture(page, "listed", 240)
			for (const j of [0, 3]) {
				await page.$eval(chipOf(j), (el) => el.scrollIntoView({ block: "end" }))
				await page.click(chipOf(j))
				await page.waitForSelector(sel("contract-chip-panel"), { visible: true, timeout: 10_000 })
				const placed = await page.$eval(sel("contract-chip-panel"), (panel) => {
					const r = (panel.parentElement as HTMLElement).getBoundingClientRect()
					return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
				})
				expect(placed, `step ${j}'s press at 240 px`).toBe(true)
				expect(await isOpen(page, stepRow(j))).toBe(false)
				await page.keyboard.press("Escape")
				await pressShut(page)
			}
		} finally {
			await page.close()
		}
	})

	test("an app's longest strings stay inside: its chip clips a 64-character name at 400 and 240 px, and each press wraps a 63-character host or a 64-character contract name inside its card", {
		timeout: 120_000,
	}, async ({ listedExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			for (const width of [400, 240]) {
				await openFixture(page, "long-names", width)
				await page.waitForSelector(`${chipOf(0)}[data-level="none"]`, { timeout: 10_000 })
				const app = `${sel("execute-dapp-name")} ${sel(CHIP)}`
				const chip = await page.$eval(sel("execute-app-chip-label"), (label) => {
					const box = (label.closest('[data-testid="contract-chip"]') as HTMLElement).getBoundingClientRect()
					return { inside: box.left >= 0 && box.right <= window.innerWidth, clipped: label.scrollWidth > label.clientWidth }
				})
				expect(chip, `the app chip at ${width} px`).toEqual({ inside: true, clipped: true })
				for (const target of [app, chipOf(0)]) {
					await page.click(target)
					await page.waitForSelector(sel("contract-chip-panel"), { visible: true, timeout: 10_000 })
					const wraps = await page.$eval(sel("contract-chip-panel"), (panel) => panel.scrollWidth <= panel.clientWidth)
					expect(wraps, `${target}'s press at ${width} px`).toBe(true)
					await page.keyboard.press("Escape")
					await pressShut(page)
				}
			}
		} finally {
			await page.close()
		}
	})
})

describe.skipIf(ARMED)("a release build", () => {
	test("renders no fixture: the route names no request, so the window reports its error", { timeout: 120_000 }, async ({
		registeredExtension: ctx,
	}) => {
		const page = await openPopup(ctx)
		try {
			await page.evaluate(() => {
				window.location.hash = "#/windows/execute?fixture=batch"
			})
			await reloadExtensionPage(page)
			await page.waitForSelector(sel("error-text"), { visible: true, timeout: 30_000 })
			expect(await page.$(sel("execute-op-item"))).toBeNull()
		} finally {
			await page.close()
		}
	})
})
