/**
 * Retry 0: the test mints into the file-scoped `tokenReadyExtension`, so a retry would run against
 * a balance the first attempt already raised.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type AztecTestConfig, mintPublicTokensForAccount } from "../fixtures/aztec"
import { openPopup, replaceInputValue, test, waitForHash } from "../fixtures/extension"
import { captureBalanceBaseline, seedUsdQuoteAndReload, setActiveSendType, waitForFreshBalanceRow } from "../fixtures/helpers"
import { chooseRecipient, closeReview, openReview, openSend, readSendInputs, shotSend } from "../fixtures/send-page"
import { pointerClick } from "../helpers/legal-drivers"
import { activeTestId } from "../helpers/pointer-probes"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const MINTED = 1_234_567_123_456_789_012_345_678n
const PUBLIC_BALANCE = 1000n * 10n ** 18n + MINTED
const AMOUNT = '[data-testid="send-amount-input"]'
const USD = '[data-testid="send-amount-fiat-input"]'
const REVIEW_AMOUNT = '[data-testid="send-review-amount"]'

/** On a timeout the error carries what the page showed, so a refused amount reads as one. */
async function waitForEstimateAndConfirm(page: Page): Promise<void> {
	try {
		// The fee card stays mounted, unshown, while its sheet is closed: the estimate lands in it all the same.
		await page.waitForSelector('[data-testid="fee-estimate"]', { timeout: 120_000 })
		await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')?.disabled === false, {
			timeout: 10_000,
		})
	} catch (err) {
		const shown = await page.evaluate(() => ({
			amount: document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')?.value,
			confirmDisabled: document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')?.disabled,
		}))
		throw new Error(`no estimate with Confirm on: ${JSON.stringify(shown)}`, { cause: err })
	}
}

async function waitForAmount(page: Page, expected: string): Promise<void> {
	try {
		await page.waitForFunction(
			(sel: string, want: string) => document.querySelector<HTMLInputElement>(sel)?.value === want,
			{ timeout: 10_000 },
			AMOUNT,
			expected,
		)
	} catch (err) {
		const amount = await page.$eval(AMOUNT, (el) => (el as HTMLInputElement).value)
		throw new Error(`the amount field reads ${JSON.stringify(amount)}, not ${JSON.stringify(expected)}`, { cause: err })
	}
}

async function readTokenLine(
	page: Page,
): Promise<{ text: string; lines: number; maxAbove: boolean; inside: boolean; spans: Record<string, number[]> }> {
	return page.evaluate(() => {
		const box = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.getBoundingClientRect()
		const unit = (px: number) => Math.round(px * 60) / 60
		const label = document.querySelector('[data-testid="send-amount-fiat-label"]')
		const range = document.createRange()
		if (label) range.selectNodeContents(label)
		const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
		const [fiat, max, row] = ["send-amount-fiat-label", "send-amount-max", "send-amount-row"].map(box)
		const parts = [fiat, max]
		return {
			text: label?.textContent?.trim() ?? "",
			lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
			maxAbove: !!(max && row) && max.bottom <= row.top,
			// Firefox lays boxes out in 1/60 px and reports them through float32, so a control set flush on
			// the row's edge can read 0.00002 px past it: edges compare at that unit.
			inside: !!row && parts.every((rect) => !!rect && unit(rect.left) >= unit(row.left) && unit(rect.right) <= unit(row.right)),
			spans: Object.fromEntries(Object.entries({ fiat, max, row }).map(([k, r]) => [k, [unit(r?.left ?? -1), unit(r?.right ?? -1)]])),
		}
	})
}

/** `hidden` is how far the field's text can scroll, in px: 0 when the whole amount is in view. */
async function readField(page: Page): Promise<{ value: string; hidden: number; fontSize: number; metaTop: number }> {
	return page.$eval(AMOUNT, (el) => {
		const input = el as HTMLInputElement
		const at = input.scrollLeft
		input.scrollLeft = 1e6
		const hidden = input.scrollLeft
		input.scrollLeft = at
		return {
			value: input.value,
			hidden,
			fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
			metaTop: document.querySelector('[data-testid="send-amount-meta"]')?.getBoundingClientRect().top ?? Number.NaN,
		}
	})
}

async function fieldShowsWholeAmount(page: Page): Promise<boolean> {
	const fits = (sel: string) => {
		const input = document.querySelector<HTMLInputElement>(sel)
		if (!input) return false
		const at = input.scrollLeft
		input.scrollLeft = 1e6
		const hidden = input.scrollLeft
		input.scrollLeft = at
		return hidden === 0
	}
	return page.waitForFunction(fits, { timeout: 3_000 }, AMOUNT).then(
		() => true,
		() => false,
	)
}

type UsdLines = {
	hidden: number
	fontSize: number
	derivedPx: number
	lines: number
	spill: number
	belowAmount: number
	inMeta: boolean
}

/**
 * The USD field and the derived token line: `spill` is how far the line or Max runs past the amount
 * row, `belowAmount` how far the line sits under it, and `inMeta` whether it is drawn in the line
 * under the field rather than a row of its own.
 */
async function readUsdLines(page: Page): Promise<UsdLines> {
	return page.$eval(USD, (el) => {
		const input = el as HTMLInputElement
		const at = input.scrollLeft
		input.scrollLeft = 1e6
		const hidden = input.scrollLeft
		input.scrollLeft = at
		const nan = { top: Number.NaN, bottom: Number.NaN, left: Number.NaN, right: Number.NaN }
		const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? nan
		const derived = document.querySelector('[data-testid="send-amount-derived"]')
		const [line, max, row] = [box("send-amount-derived"), box("send-amount-max"), box("send-amount-row")]
		return {
			hidden,
			fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
			derivedPx: derived ? Number.parseFloat(getComputedStyle(derived).fontSize) : Number.NaN,
			lines: derived?.getClientRects().length ?? 0,
			spill: Math.max(line.right, max.right) - row.right,
			belowAmount: line.top - row.bottom,
			inMeta: Boolean(derived && document.querySelector('[data-testid="send-amount-meta"]')?.contains(derived)),
		}
	})
}

type ReviewAmount = {
	text: string
	overflow: number
	fontSize: number
	scrollWidth: number
	clientWidth: number
	scale: string
	figures: string
}

async function readReviewAmount(page: Page): Promise<ReviewAmount> {
	return page.$eval(REVIEW_AMOUNT, (el) => {
		const style = getComputedStyle(el)
		return {
			text: el.textContent?.replace(/\s+/g, "") ?? "",
			overflow: el.scrollWidth - el.clientWidth,
			fontSize: Number.parseFloat(style.fontSize),
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			scale: (el as HTMLElement).style.getPropertyValue("--hero-scale"),
			figures: style.fontVariantNumeric,
		}
	})
}

test.skipIf(!hasConfig)(
	"a million or more estimates and confirms, typed and Max amounts stay exact, all of it shows, and an unreadable paste blocks Send",
	{ timeout: 420_000, retry: 0 },
	async ({ tokenReadyExtension }) => {
		await mintPublicTokensForAccount(aztecConfig!, tokenReadyExtension.accountAddress, MINTED)

		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general")
		await page.waitForSelector('[data-testid="token-symbol"]', { visible: true, timeout: 30_000 })
		const baseline = await captureBalanceBaseline(page, tokenReadyExtension.accountAddress, aztecConfig!.tokenAddress)
		await waitForFreshBalanceRow(page, {
			account: tokenReadyExtension.accountAddress,
			tokenContract: aztecConfig!.tokenAddress,
			expectedPublicRaw: PUBLIC_BALANCE.toString(),
			baselineUpdatedAt: baseline,
			timeoutMs: 90_000,
		})
		await seedUsdQuoteAndReload(page)

		await openSend(page)
		await chooseRecipient(page, tokenReadyExtension.accountAddress)
		await setActiveSendType(page, "send-from-type", "public")
		await setActiveSendType(page, "send-to-type", "public")
		await page.waitForFunction(
			(sel: string) => document.querySelector<HTMLInputElement>(sel)?.disabled === false,
			{ timeout: 60_000, polling: 1_000 },
			AMOUNT,
		)

		// Leaving the field is what rests the amount.
		await replaceInputValue(page, AMOUNT, "1234567.123456789012345678")
		await page.$eval(AMOUNT, (el) => (el as HTMLInputElement).blur())
		await waitForEstimateAndConfirm(page)
		expect((await readSendInputs(page)).amount).toBe("1,234,567.123456789012345678")
		// Soft, so one run reports every fit check.
		expect.soft(await fieldShowsWholeAmount(page), `typed, at rest: ${JSON.stringify(await readField(page))}`).toBe(true)

		// Max leaves the amount at rest, grouped and fitted at once.
		await pointerClick(page, "send-amount-max")
		await waitForAmount(page, "1,235,567.123456789012345678")
		expect.soft(await page.$eval(AMOUNT, (el) => el === document.activeElement), "Max left the field focused").toBe(false)
		expect.soft(await fieldShowsWholeAmount(page), `Max, at rest: ${JSON.stringify(await readField(page))}`).toBe(true)
		const resting = await readField(page)
		await page.$eval(AMOUNT, (el) => (el as HTMLInputElement).focus())
		await page
			.waitForFunction(
				(sel: string) => {
					const input = document.querySelector(sel)
					return input !== null && Number.parseFloat(getComputedStyle(input).fontSize) === 40
				},
				{ timeout: 3_000 },
				AMOUNT,
			)
			.catch(() => undefined)
		const focused = await readField(page)
		expect.soft(focused.fontSize, "with focus the field is at full size").toBe(40)
		expect.soft(focused.metaTop, "the line under the field moved").toBeCloseTo(resting.metaTop, 0)
		await page.$eval(AMOUNT, (el) => (el as HTMLInputElement).blur())
		await waitForEstimateAndConfirm(page)
		expect(await page.$eval('[data-testid="send-from-balance-public"]', (el) => el.textContent?.trim())).toBe("1,235,567.12345678 TST")
		// "≈" stays with its figure on one line under the field, Max sits over the field, and both
		// stay within the amount's width.
		const meta = await readTokenLine(page)
		expect(meta.text).toMatch(/^≈ \$1,235,567\./)
		expect.soft(meta.lines, `the dollar line breaks: ${JSON.stringify(meta)}`).toBe(1)
		expect.soft(meta.maxAbove, `Max is not over the amount row: ${JSON.stringify(meta)}`).toBe(true)
		expect.soft(meta.inside, `the line passes the amount's width: ${JSON.stringify(meta)}`).toBe(true)

		await openReview(page)
		await shotSend(page, "sheet-send-review", "send-review-submit")
		const review = await readReviewAmount(page)
		console.log(`[send-amount-exact] review amount: ${JSON.stringify(review)}`)
		expect(review.text).toBe("1,235,567.123456789012345678TST")
		expect.soft(review.overflow, `the review's amount line overflows: ${JSON.stringify(review)}`).toBeLessThanOrEqual(0)
		expect.soft(review.fontSize, "the review's amount is below 60% of 30 px").toBeGreaterThanOrEqual(18)
		await closeReview(page)

		await pointerClick(page, "send-amount-fiat-toggle")
		await page.waitForSelector('[data-testid="send-amount-derived"]', { visible: true, timeout: 10_000 })
		expect((await page.$eval(USD, (el) => (el as HTMLInputElement).value)).length, "a long USD figure").toBeGreaterThanOrEqual(12)
		// The whole balance's derived line is fitted on one line under the amount, at 8 px or more.
		const usd = await readUsdLines(page)
		expect.soft(usd.hidden, `USD at rest hides its tail: ${JSON.stringify(usd)}`).toBe(0)
		expect.soft(usd.lines, `the derived line wraps: ${JSON.stringify(usd)}`).toBe(1)
		expect.soft(usd.spill, `the derived line or Max leaves the row: ${JSON.stringify(usd)}`).toBeLessThanOrEqual(0.5)
		expect.soft(usd.belowAmount, `the derived line is not under the amount: ${JSON.stringify(usd)}`).toBeGreaterThanOrEqual(-0.5)
		expect.soft(usd.derivedPx, `the derived line draws below 8 px: ${JSON.stringify(usd)}`).toBeGreaterThanOrEqual(8)
		await page.$eval(USD, (el) => (el as HTMLInputElement).focus())
		await page
			.waitForFunction(
				(sel: string) => Number.parseFloat(getComputedStyle(document.querySelector(sel) as Element).fontSize) === 40,
				{ timeout: 3_000 },
				USD,
			)
			.catch(() => undefined)
		expect.soft((await readUsdLines(page)).fontSize, "with focus the USD field is at full size").toBe(40)
		await pointerClick(page, "send-amount-fiat-toggle")
		await waitForAmount(page, "1,235,567.123456789012345678")

		// A paste the field cannot read stays as pasted, says so, and blocks Send until an amount reads.
		await page.$eval(AMOUNT, (el) => {
			const input = el as HTMLInputElement
			input.focus()
			input.value = "1e5"
			input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }))
		})
		await waitForAmount(page, "1e5")
		await page.waitForSelector('[data-testid="send-amount-unreadable-hint"]', { visible: true, timeout: 5_000 })
		await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')?.disabled === true, {
			timeout: 5_000,
		})
		// By keyboard: Max is the stop before the field, over it on the label line.
		await page.keyboard.down("Shift")
		await page.keyboard.press("Tab")
		await page.keyboard.up("Shift")
		expect(await activeTestId(page)).toBe("send-amount-max")
		await shotSend(page, "send-max-focused", "send-amount-row")
		await page.keyboard.press("Enter")
		await waitForAmount(page, "1,235,567.123456789012345678")
		await waitForEstimateAndConfirm(page)

		// Typed, a comma is the decimal point, and a point after it re-reads that comma as grouping.
		await replaceInputValue(page, AMOUNT, "")
		await page.keyboard.type("1,234")
		await waitForAmount(page, "1.234")
		await page.keyboard.type(".56")
		await waitForAmount(page, "1234.56")

		// A comma typed between two digits becomes the point there, and the next key lands after it.
		await replaceInputValue(page, AMOUNT, "")
		await page.keyboard.type("12")
		await page.keyboard.press("ArrowLeft")
		await page.keyboard.type(",5")
		await waitForAmount(page, "1.52")

		// A short derived line keeps its full size in the line under the field.
		await pointerClick(page, "send-amount-fiat-toggle")
		await replaceInputValue(page, USD, "25")
		await page.waitForFunction(() => document.querySelector('[data-testid="send-amount-derived"]')?.textContent === "≈ 25 TST", {
			timeout: 10_000,
		})
		const short = await readUsdLines(page)
		expect.soft(short.derivedPx, `a short derived line shrinks: ${JSON.stringify(short)}`).toBe(13)
		expect.soft(short.inMeta, `a short derived line leaves the line under the field: ${JSON.stringify(short)}`).toBe(true)

		expect(tokenReadyExtension.pageErrors).toEqual([])
	},
)
