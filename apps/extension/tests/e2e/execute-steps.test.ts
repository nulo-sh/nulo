/**
 * The execute window over the armed build's fixtures (`src/e2e/execute-fixture.ts`), which no live
 * dApp sends: a struct's rows, the decoder's deepest and widest values, and the raw values under a
 * readable call, laid out in the real window at the approval window's width and a side panel's.
 * Layout, hit testing and paint time need a browser; the component tests hold the rows' content.
 * A release build, run without the declaration, renders no fixture.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { reloadExtensionPage, setViewport } from "./fixtures/browser"
import { clickByTestId, openPopup, test } from "./fixtures/extension"
import { shotSend } from "./fixtures/shots"

const ARMED = process.env.NULO_E2E_EXECUTE_FIXTURE === "1"
const sel = (id: string) => `[data-testid="${id}"]`
/** The rows the decoder's widest value draws: one parameter of 1,024 items under 31 arrays each. */
const WIDE_ROWS = 32_769
/** Every element that holds dApp-supplied payload text. */
const PAYLOAD = [
	"execute-op-summary-call",
	"execute-op-payload-row",
	"execute-op-decoded-param",
	"execute-op-arg",
	"execute-op-discovered-authwit",
].map(sel)
/** The authorizations each fixture's estimate lists. */
const AUTHWITS: Record<string, number> = { batch: 2, deep: 1 }

/** Loads the fixture's window afresh: a query change alone reuses the mounted window. */
async function openFixture(page: Page, name: string, width: number): Promise<void> {
	await setViewport(page, { width, height: 800 })
	await page.evaluate((hash: string) => {
		window.location.hash = hash
	}, `#/windows/execute?fixture=${name}`)
	await reloadExtensionPage(page)
	await page.waitForSelector(sel("execute-op-item"), { visible: true, timeout: 30_000 })
}

/** Opens the details and, once the fixture's estimate has listed them, every authorization's own. */
async function openDetails(page: Page, name: string): Promise<void> {
	await clickByTestId(page, "execute-op-details-toggle")
	await page.waitForSelector(sel("execute-op-details"), { visible: true, timeout: 10_000 })
	const listed = AUTHWITS[name] ?? 0
	await page.waitForFunction(
		(s: string, n: number) => document.querySelectorAll(s).length === n,
		{ timeout: 10_000 },
		sel("execute-op-discovered-authwit"),
		listed,
	)
	await page.$$eval(`${sel("execute-discovered-authwit-toggle")}[aria-expanded="false"]`, (toggles) => {
		for (const toggle of toggles) (toggle as HTMLElement).click()
	})
	await page.waitForFunction(
		(s: string, n: number) => document.querySelectorAll(s).length === n,
		{ timeout: 10_000 },
		sel("execute-discovered-authwit-details"),
		listed,
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

describe.skipIf(!ARMED)("the execute window's value tree, over the fixtures", () => {
	test("every payload line stays inside the card, at 400 and at 240 px", { timeout: 300_000 }, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		try {
			for (const width of [400, 240]) {
				for (const name of ["batch", "deep", "ancestry", "depth"]) {
					await openFixture(page, name, width)
					await openDetails(page, name)
					expect(await textPastCard(page), `${name} at ${width} px`).toEqual([])
					if (name === "batch" || name === "deep") await shotSend(page, `a1-${name}-details-${width}`, "execute-op-details")
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
			await openDetails(page, "batch")
			const first = '[data-call-index="0"]'
			expect(await page.$(`${first} ${sel("execute-op-raw-args")}`)).toBeNull()
			await page.click(`${first} ${sel("execute-op-raw-toggle")}`)
			await page.waitForSelector(`${first} ${sel("execute-op-raw-args")}`, { visible: true, timeout: 10_000 })
			const fields = await page.$$eval(`${first} ${sel("execute-op-arg-field")}`, (els) => els.map((el) => el.getAttribute("title")))
			// `deposit` carries an order of four fields and a route of two pools, two fields each.
			expect(fields).toHaveLength(8)
			expect(fields.every((f) => /^0x[0-9a-f]{64}$/.test(f ?? ""))).toBe(true)
			expect(await textPastCard(page)).toEqual([])
		} finally {
			await page.close()
		}
	})

	test("the decoder's widest value opens every row with one press and closes with the next", { timeout: 300_000 }, async ({
		registeredExtension: ctx,
	}) => {
		const page = await openPopup(ctx)
		try {
			await openFixture(page, "wide", 400)
			const toPaint = await page.evaluate(async (rows: number) => {
				const toggle = document.querySelector<HTMLElement>('[data-testid="execute-op-details-toggle"]')
				if (!toggle) throw new Error("no details toggle")
				const count = () => document.querySelectorAll('[data-testid="execute-op-decoded-param"]').length
				const start = performance.now()
				toggle.click()
				await new Promise<void>((resolve) => {
					const tick = () => (count() >= rows ? resolve() : requestAnimationFrame(tick))
					tick()
				})
				await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
				return { ms: Math.round(performance.now() - start), rows: count() }
			}, WIDE_ROWS)
			console.log(`[execute-steps] wide: ${toPaint.rows} rows painted ${toPaint.ms} ms after the press`)
			expect(toPaint.rows).toBe(WIDE_ROWS)
			await clickByTestId(page, "execute-op-details-toggle")
			await page.waitForFunction(() => document.querySelector('[data-testid="execute-op-details"]') === null, { timeout: 30_000 })
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
