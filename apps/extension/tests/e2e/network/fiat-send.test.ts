/**
 * C3 fiat-input flow, end-to-end on the sandbox: the agent build arms
 * `VITE_NULO_E2E_PRICE_MAP=1`, mapping every sandbox-chain token to USDC, and
 * the test refuses the provider and seeds a usd-coin quote and a Fee Juice quote
 * into the price cache — so the full priced-token UI (row fiat, header aggregate,
 * unit-pair toggle, fiat typing → derived token amount, the fee's dollars) runs
 * against a REAL funded wallet with no live API dependency.
 */

import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { reloadExtensionPage } from "../fixtures/browser"
import { replaceInputValue } from "../fixtures/dom"
import { test, openPopup, waitForHash, clickByTestId } from "../fixtures/extension"
import { pinnedFeeTexts, refusePrices, seedFeeJuiceQuote } from "../fixtures/fee-quote"
import { setActiveSendType, waitForHomeTotal } from "../fixtures/helpers"
import type { AztecTestConfig } from "../fixtures/aztec"
import { chooseRecipient, closeReview, closeSendFeeSheet, openReview, openSendFeeSheet, waitForReviewReady } from "../fixtures/send-page"
import { atWidth, NARROW_WIDTH } from "../fixtures/type-roles"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/** A viewport point 1 px inside the amount row's top edge, over the middle or the right end of `testid`. */
async function rowTopEdge(page: Page, testid: string, over: "middle" | "right"): Promise<{ x: number; y: number }> {
	return page.evaluate(
		(id: string, at: string) => {
			const row = document.querySelector('[data-testid="send-amount-row"]')
			const el = document.querySelector(`[data-testid="${id}"]`)
			if (!row || !el) throw new Error(`rowTopEdge: send-amount-row or ${id} is missing`)
			row.scrollIntoView({ block: "center" })
			const box = el.getBoundingClientRect()
			return { x: at === "middle" ? box.left + box.width / 2 : box.right - 2, y: row.getBoundingClientRect().top + 1 }
		},
		testid,
		over,
	)
}

/**
 * Where an element lies against the box it must stay inside: the text lines it covers, whether it may
 * wrap, its edges and its text. Lines are read from the text's own boxes: a flex item's border box is
 * one rectangle however many lines its text takes.
 */
type Placed = { lines: number; nowrap: boolean; top: number; bottom: number; left: number; right: number; text: string }
async function placed(page: Page, selector: string, measure: "self" | "parent" = "self"): Promise<{ el: Placed; box: Placed } | null> {
	return page.evaluate(
		(s: string, which: string) => {
			const [boxSel, elSel] = s.split(" >> ")
			const box = document.querySelector(boxSel)
			const found = box?.querySelector(elSel)
			const el = which === "parent" ? found?.parentElement : found
			if (!box || !el) return null
			const textRects = (node: Element): DOMRect[] => {
				const rects: DOMRect[] = []
				const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
				for (let t = walker.nextNode(); t; t = walker.nextNode()) {
					const range = document.createRange()
					range.selectNodeContents(t)
					rects.push(...Array.from(range.getClientRects()).filter((r) => r.width > 0))
				}
				return rects.sort((a, b) => a.top - b.top)
			}
			// A rect starting below the current line's bottom opens a new line.
			const lines = (node: Element): number => {
				let count = 0
				let bottom = Number.NEGATIVE_INFINITY
				for (const r of textRects(node)) {
					const opens = r.top >= bottom - 2
					if (opens) count++
					bottom = opens ? r.bottom : Math.max(bottom, r.bottom)
				}
				return count
			}
			const read = (node: Element): Placed => {
				const r = node.getBoundingClientRect()
				const text = (node.textContent ?? "").replace(/\s+/g, " ").trim()
				const nowrap = getComputedStyle(node).whiteSpace === "nowrap"
				return { lines: lines(node), nowrap, top: r.top, bottom: r.bottom, left: r.left, right: r.right, text }
			}
			return { el: read(el), box: read(box) }
		},
		selector,
		measure,
	)
}

/** One line that may never wrap, inside its box: nothing cut, the dollars on the figure's line. */
function expectWhole(at: { el: Placed; box: Placed } | null, label: string): Placed {
	expect(at, `${label} is on the page`).not.toBeNull()
	const { el, box } = at as { el: Placed; box: Placed }
	const inside = el.left >= box.left - 0.5 && el.right <= box.right + 0.5
	expect({ lines: el.lines, nowrap: el.nowrap, inside }, `${label}: ${el.text}`).toEqual({ lines: 1, nowrap: true, inside: true })
	return el
}

/** The fee as the popup prints it at the pinned quote, whatever its last digit's rounding. */
function expectPinnedFee(text: string): void {
	const amount = /^~([\d.]+) FJ \(/.exec(text)?.[1]
	expect(amount, `"${text}" names a fee with its dollars`).toBeDefined()
	expect([...pinnedFeeTexts(amount ?? "")]).toContain(text)
}

test.skipIf(!hasConfig)(
	"priced sandbox token: row + header fiat render, fiat typing derives the send amount, every fee carries its dollars",
	{ timeout: 240_000 },
	async ({ tokenReadyExtension }) => {
		const prices = await refusePrices(tokenReadyExtension)
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general")

		// Seed both quotes beside each other; remount so the stale-on-connect read adopts them.
		await seedFeeJuiceQuote(tokenReadyExtension, prices)
		await page.evaluate(async () => {
			const key = "nulo:core:token-prices"
			const stored = (await chrome.storage.local.get(key))[key]
			const quotes = typeof stored === "string" ? JSON.parse(stored) : {}
			quotes["usd-coin"] = { coingeckoId: "usd-coin", usd: 1.0, fetchedAt: Date.now(), providerUpdatedAt: null }
			await chrome.storage.local.set({ [key]: JSON.stringify(quotes) })
		})
		await reloadExtensionPage(page)
		await waitForHash(page, "#/popup/general")

		// ── B1: the funded token row carries its fiat line ────────────────
		await page.waitForSelector('[data-testid="token-fiat"]', { visible: true, timeout: 60_000 })
		const rowFiat = await page.$eval('[data-testid="token-fiat"]', (el) => el.textContent?.trim() ?? "")
		expect(rowFiat).toMatch(/^≈ \$/)

		// ── A1: the aggregate header shows a REAL dollar figure ───────────
		await waitForHomeTotal(page)
		const headerText = await page.$eval('[data-testid="balance-amount"]', (el) => el.textContent?.trim() ?? "")
		expect(headerText).toMatch(/\$/)
		expect(headerText).not.toBe("$0.00") // 1,000 minted tokens at ~$1 ≠ zero

		// ── C3: open Send from the token page ─────────────────────────────
		await clickByTestId(page, "tokens-card")
		await page.waitForSelector('[data-testid="actions-send"]', { visible: true, timeout: 30_000 })
		await page.evaluate(() => document.querySelector('[data-testid="actions-send"]')?.scrollIntoView({ block: "center" }))
		await clickByTestId(page, "actions-send")
		await page.waitForSelector('[data-testid="send-person-step"]', { timeout: 30_000 })
		await chooseRecipient(page, tokenReadyExtension.accountAddress)
		await page.waitForSelector('[data-testid="send-amount-input"]', { visible: true, timeout: 30_000 })

		// The fixture mints PUBLIC tokens: select the funded side (the private
		// balance is zero, which disables the input).
		await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 10_000 })
		await setActiveSendType(page, "send-from-type", "public")

		// The unit pair exists ONLY for priced tokens — this run has one.
		await page.waitForSelector('[data-testid="send-amount-fiat-toggle"]', { visible: true, timeout: 15_000 })
		// The From choice prints the side's balance, amount and symbol, once it loads (async after the
		// popup opens).
		await page.waitForSelector('[data-testid="send-from-balance-public"]', { visible: true, timeout: 30_000 })
		const balanceSeg = await page.$eval('[data-testid="send-from-balance-public"]', (el) => el.textContent?.trim() ?? "")
		expect(balanceSeg).toMatch(/\d/)

		// Flip to USD with a press on the switch at the amount row's top edge: the switch takes a press
		// anywhere in the row's height. A press on the field's right end, beside the switch, still
		// lands in the field.
		const onSwitch = await rowTopEdge(page, "send-amount-fiat-toggle", "middle")
		await page.mouse.click(onSwitch.x, onSwitch.y)
		await page.waitForSelector('[data-testid="send-amount-fiat-input"]', { visible: true, timeout: 10_000 })
		const fiatFocused = () => page.$eval('[data-testid="send-amount-fiat-input"]', (el) => el === document.activeElement)
		expect(await fiatFocused()).toBe(false)
		const onField = await rowTopEdge(page, "send-amount-fiat-input", "right")
		await page.mouse.click(onField.x, onField.y)
		expect(await fiatFocused()).toBe(true)
		await page.type('[data-testid="send-amount-fiat-input"]', "2")

		// Debounced derivation lands: the secondary line shows the TOKEN
		// amount that will send (round-down at the frozen quote, ~2 at ~$1).
		await page.waitForFunction(
			() => {
				const el = document.querySelector('[data-testid="send-amount-derived"]')
				return el !== null && /≈ \d/.test(el.textContent ?? "")
			},
			{ timeout: 10_000, polling: 100 },
		)
		const derived = await page.$eval('[data-testid="send-amount-derived"]', (el) => el.textContent?.trim() ?? "")
		const derivedAmount = Number.parseFloat((derived.match(/≈ ([\d.,]+)/)?.[1] ?? "0").replace(/,/g, ""))
		expect(derivedAmount).toBeGreaterThan(1.5)
		expect(derivedAmount).toBeLessThan(2.5)

		// Flip back: the token input returns, carrying the derived amount.
		await clickByTestId(page, "send-amount-fiat-toggle")
		await page.waitForSelector('[data-testid="send-amount-input"]', { visible: true, timeout: 10_000 })

		// ── The fee's dollars, and every figure whole at the side panel's width ──
		// A long amount, so the review's dollar figure cannot share the amount's line at 240 px.
		await replaceInputValue(page, '[data-testid="send-amount-input"]', "888.123456")
		await page.waitForFunction(
			() => document.querySelector('[data-testid="send-amount-fiat-label"]')?.textContent?.includes("888.12"),
			{ timeout: 10_000, polling: 100 },
		)
		// Nulo's sponsor pays on the sandbox: its cost is the line's note, priced at the pinned quote. The
		// sandbox's fee falls as a suite runs, so the dollars may read the helper's bound, `(<$0.001)`.
		const noteFigure = '[data-testid="send-fee-line-note"] >> [data-testid="send-fee-figure"]'
		await page
			.waitForFunction(
				() =>
					/\(<?\$/.test(
						document.querySelector('[data-testid="send-fee-line-note"] [data-testid="send-fee-figure"]')?.textContent ?? "",
					),
				{ timeout: 120_000, polling: 250 },
			)
			.catch(async (cause) => {
				const line = await page.evaluate(() => document.querySelector('[data-testid="send-fee-line"]')?.textContent ?? null)
				throw new Error(`no priced sponsor note; the fee line reads ${JSON.stringify(line?.replace(/\s+/g, " ").trim())}`, {
					cause,
				})
			})
		const fee = expectWhole(await placed(page, noteFigure), "the form's fee at 360 px").text
		expectPinnedFee(fee)
		await atWidth(page, NARROW_WIDTH, async () => {
			const at = expectWhole(await placed(page, noteFigure), `the form's fee at ${NARROW_WIDTH} px`)
			expect(at.text).toBe(fee)
		})

		// The review's fee row reads the line's fee; at 240 px it and the amount's dollars stay whole.
		await openReview(page)
		await waitForReviewReady(page)
		const rowFigure = '[data-testid="send-review-fee-value"] >> [data-testid="send-fee-figure"]'
		expect(expectWhole(await placed(page, rowFigure), "the review's fee at 360 px").text).toBe(fee)
		await atWidth(page, NARROW_WIDTH, async () => {
			expect(expectWhole(await placed(page, rowFigure), `the review's fee at ${NARROW_WIDTH} px`).text).toBe(fee)
			const hero = await placed(page, '[data-testid="send-review"] >> [data-testid="send-review-amount"]')
			const fiat = expectWhole(
				await placed(page, '[data-testid="send-review"] >> [data-testid="send-review-amount-fiat"]'),
				"the amount's dollars",
			)
			expect(fiat.text).toMatch(/^≈ \$888\.1\d$/)
			// Wrapped whole under the amount, flush with its left edge.
			const amount = hero?.el as Placed
			expect({ below: fiat.top >= amount.bottom - 1, flush: Math.abs(fiat.left - amount.left) < 1 }).toEqual({
				below: true,
				flush: true,
			})
		})
		await closeReview(page)

		// The Fee sheet's You pay: the struck fee with its dollars, whole at 240 px.
		await openSendFeeSheet(page)
		const youPay = '[data-testid="fee-estimate"] >> [data-testid="fee-estimate-usd"]'
		await page.waitForSelector('[data-testid="fee-estimate"] [data-testid="fee-estimate-usd"]', { timeout: 30_000 })
		await atWidth(page, NARROW_WIDTH, async () => {
			const usd = expectWhole(await placed(page, youPay), `You pay's dollars at ${NARROW_WIDTH} px`)
			expect(expectWhole(await placed(page, youPay, "parent"), `You pay's fee at ${NARROW_WIDTH} px`).text).toBe(fee)
			expect(usd.text).toBe(fee.slice(fee.indexOf("(")))
		})
		await closeSendFeeSheet(page)

		expect(await prices.refused.failures(), "price interception failures").toEqual([])
		await prices.refused.stop()
		expect(tokenReadyExtension.pageErrors).toEqual([])
	},
)
