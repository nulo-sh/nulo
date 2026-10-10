/**
 * The smoke wallet holds no balance, so the amount field and Max are disabled and out of the Tab
 * path here; Max's own stop is proven in the funded `network/send-amount-exact.test.ts`.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { UI_STORAGE_KEYS } from "@/popup/constants/storage-keys"
import { clickByTestId, openPopup, test, waitForHash, type ExtensionContext } from "./fixtures/extension"
import { getAccountAddress, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { readSendInputs, shotSend } from "./fixtures/send-page"
import { readActivityScope, seedTokenRow } from "./helpers/activity-seeds"
import { SEEDED_SPONSOR_FPC_ID, seedProtocolFpcs } from "./helpers/fpc-seeds"
import { activeTestId, coveredAt, focusRing, tabAround, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
const DESTINATION_INPUT = `${sel("send-destination-field")} input`
const OPEN_TRIGGER = `[data-dropdown-open="true"] ${sel("send-fee-method-trigger")}`
const CLOSED_TRIGGER = `[data-dropdown-open="false"] ${sel("send-fee-method-trigger")}`

async function openSendPage(ctx: ExtensionContext, { priced = false, sponsors = false } = {}): Promise<Page> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	const scope = priced || sponsors ? await readActivityScope(page) : undefined
	if (scope && sponsors) await seedProtocolFpcs(page, scope)
	if (scope && priced) {
		await seedTokenRow(page, scope, 1)
		await seedUsdQuoteAndReload(page)
	}
	await clickByTestId(page, "actions-send")
	await page.waitForSelector(sel("send-destination-field"), { visible: true, timeout: 15_000 })
	return page
}

async function expectAccentRing(page: Page, testid: string): Promise<void> {
	expect(await activeTestId(page)).toBe(testid)
	const { ring, color } = await focusRing(page, testid)
	expect(ring, testid).toMatch(/^solid 2px /)
	expect(color, testid).toBe(await tokenColor(page, "--nulo-accent"))
}

async function waitForAmountMode(page: Page, mode: "token" | "usd"): Promise<void> {
	await page.waitForSelector(sel(mode === "usd" ? "send-amount-fiat-input" : "send-amount-input"), { timeout: 5_000 })
}

test("Enter picks a destination suggestion only from the destination field", { timeout: 120_000, retry: 0 }, async ({
	registeredExtensionPerTest: ctx,
}) => {
	const page = await openSendPage(ctx)
	const account = await getAccountAddress(page)

	// Accounts are suggested by name, so the profile's own "Account 1" stands in for a contact.
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type("Acc")
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("recipient-card"), { timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(account)

	await clickByTestId(page, "recipient-card-change")
	await page.waitForSelector(DESTINATION_INPUT, { timeout: 5_000 })
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type("Acc")
	// Inside the quarter second the suggestions outlive the field's blur by.
	await page.keyboard.press("Tab")
	await page.keyboard.press("Enter")
	expect((await readSendInputs(page)).destination).toBe("Acc")
})

test("the unit switch: a Tab stop right after the token card, the accent ring, Enter and Space, a held Enter once", {
	timeout: 180_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openSendPage(ctx, { priced: true })
	await page.waitForSelector(sel("send-amount-fiat-toggle"), { visible: true, timeout: 30_000 })
	await shotSend(page, "send-at-rest", "send-amount-row")

	await tabTo(page, "send-token-trigger")
	// The amount field is disabled without a balance, so the unit switch follows the token card.
	expect(await tabAround(page, 1)).toEqual(["send-amount-fiat-toggle"])
	await expectAccentRing(page, "send-amount-fiat-toggle")
	await shotSend(page, "send-toggle-focused", "send-amount-row")
	const toggle = await page.$eval(sel("send-amount-fiat-toggle"), (el) => ({ tag: el.tagName, type: el.getAttribute("type") }))
	expect(toggle).toEqual({ tag: "BUTTON", type: "button" })

	await page.keyboard.press("Enter")
	await waitForAmountMode(page, "usd")
	await page.keyboard.press(" ")
	await waitForAmountMode(page, "token")

	// A held Enter: the press and its auto-repeat. The repeat must not flip it back.
	await page.keyboard.down("Enter")
	await page.keyboard.down("Enter")
	await page.keyboard.up("Enter")
	await waitForAmountMode(page, "usd")
	expect(await page.$(sel("send-amount-input"))).toBeNull()
	expect(await activeTestId(page)).toBe("send-amount-fiat-toggle")
	// Disabled without a balance, Max is no stop: the next one is past the amount card.
	expect((await tabAround(page, 1))[0]).not.toBe("send-amount-max")
})

test("the token card draws the accent ring when focused", { timeout: 180_000, retry: 0 }, async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openSendPage(ctx, { priced: true })
	await page.waitForSelector(sel("send-token-symbol"), { visible: true, timeout: 30_000 })
	await tabTo(page, "send-token-trigger")
	await expectAccentRing(page, "send-token-trigger")
	await shotSend(page, "send-token-focused", "send-token-trigger")
})

test("the fee method picker: a Tab stop with the ring; Enter opens it, the arrows and Enter pick, Escape returns to it", {
	timeout: 180_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	// The smoke run has no node to discover sponsors from, so the rows discovery writes are seeded.
	const page = await openSendPage(ctx, { priced: true, sponsors: true })
	const account = await getAccountAddress(page)
	await page.waitForSelector(sel("send-fee-method-trigger"), { visible: true, timeout: 30_000 })
	await page.waitForSelector(sel("send-amount-fiat-toggle"), { visible: true, timeout: 30_000 })
	await shotSend(page, "send-fee-at-rest", "send-fee-method-trigger")

	await tabTo(page, "send-fee-method-trigger")
	await expectAccentRing(page, "send-fee-method-trigger")
	await shotSend(page, "send-fee-focused", "send-fee-method-trigger")
	const trigger = await page.$eval(sel("send-fee-method-trigger"), (el) => ({ tag: el.tagName, type: el.getAttribute("type") }))
	expect(trigger).toEqual({ tag: "BUTTON", type: "button" })

	await page.keyboard.press("Enter")
	await page.waitForSelector(OPEN_TRIGGER, { timeout: 5_000 })
	// Arrow navigation has no target until at least one fee method finishes loading.
	await page.waitForSelector("#dropdown [data-dropdown-item]", { timeout: 30_000 })
	await page.keyboard.press("ArrowDown")
	await page.waitForFunction(() => document.activeElement?.closest("[data-dropdown-item]") !== null, { timeout: 5_000 })
	const row = await activeTestId(page)
	expect(row).toMatch(/^send-fee-method-/)
	const fpcId = await page.evaluate(() => document.activeElement?.closest("[data-dropdown-item]")?.getAttribute("data-fpc-id"))
	expect(fpcId, `the focused row ${row}`).toBe(SEEDED_SPONSOR_FPC_ID)
	await page.keyboard.press("Enter")
	await page.waitForSelector(CLOSED_TRIGGER, { timeout: 5_000 })
	await page.waitForFunction(
		(want: string) => document.querySelector('[data-testid="send-fee-method-trigger"]')?.getAttribute("data-fee-method") === want,
		{ timeout: 10_000 },
		row.replace("send-fee-method-", ""),
	)
	// The pick may land on the row already showing, so only the saved pick tells Enter from a no-op.
	await page.waitForFunction(
		async (key: string, address: string, want: string) => {
			const saved = (await chrome.storage.local.get(key))[key] as
				| Record<string, { private?: { type?: string; fpc?: { id?: string } | null } }>
				| undefined
			const pick = saved?.[address]?.private
			return pick?.type === "fpc" && pick.fpc?.id === want
		},
		{ timeout: 10_000 },
		UI_STORAGE_KEYS.SEND_FEE_PAYMENT_METHODS,
		account,
		SEEDED_SPONSOR_FPC_ID,
	)
	await waitForFocus(page, "send-fee-method-trigger")

	await page.keyboard.press(" ")
	await page.waitForSelector(OPEN_TRIGGER, { timeout: 5_000 })
	await page.keyboard.press("Escape")
	await page.waitForSelector(CLOSED_TRIGGER, { timeout: 5_000 })
	await waitForFocus(page, "send-fee-method-trigger")
})

/** The fee menu's edge and its trigger's, once the menu's entry transition has settled. */
async function feeMenuGap(page: Page): Promise<{ above: number; below: number }> {
	const menu = `#dropdown [data-testid^="send-fee-method-"]`
	await page.waitForSelector(menu, { visible: true, timeout: 5_000 })
	await page.waitForFunction(
		(item: string) => document.querySelector(item)?.parentElement?.getAnimations().length === 0,
		{ timeout: 2_000 },
		menu,
	)
	return page.$eval(
		menu,
		(item, trigger) => {
			const m = (item.parentElement as HTMLElement).getBoundingClientRect()
			const t = ((document.querySelector(trigger) as HTMLElement).closest("#trigger") as HTMLElement).getBoundingClientRect()
			return { above: t.top - m.bottom, below: m.top - t.bottom }
		},
		sel("send-fee-method-trigger"),
	)
}

test("an open destination suggestion list covers neither Max nor the fee method picker, whose first press opens it beside itself", {
	timeout: 120_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openSendPage(ctx)
	await page.waitForSelector(sel("send-fee-method-trigger"), { visible: true, timeout: 30_000 })
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type(await getAccountAddress(page))

	const covered = {
		token: await coveredAt(page, "send-token-trigger"),
		max: await coveredAt(page, "send-amount-max"),
		fee: await coveredAt(page, "send-fee-method-trigger"),
	}
	console.log(`[send-keyboard] under the open suggestion list: ${JSON.stringify(covered)}`)
	expect(await activeTestId(page)).toBe("send-destination-field")
	expect(await page.$(sel("send-destination-suggestions"))).not.toBeNull()
	expect(covered.max).toBeNull()
	expect(covered.fee).toBeNull()

	// The press takes the focus from the destination, which turns into the taller card only once it
	// ends: the menu opens on that press and sits beside the trigger where the card has put it.
	const at = await page.$eval(sel("send-fee-method-trigger"), (el) => {
		const box = el.getBoundingClientRect()
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
	})
	await page.mouse.move(at.x, at.y)
	await page.mouse.down()
	await new Promise((resolve) => setTimeout(resolve, 300))
	await page.mouse.up()
	await page.waitForSelector(sel("recipient-card"), { visible: true, timeout: 5_000 })
	await page.waitForSelector(OPEN_TRIGGER, { timeout: 5_000 })
	const gap = await feeMenuGap(page)
	expect(
		[gap.above, gap.below].some((edge) => Math.abs(edge - 8) <= 1),
		JSON.stringify(gap),
	).toBe(true)
})
