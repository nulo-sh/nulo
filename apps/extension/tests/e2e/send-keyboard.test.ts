/**
 * The smoke wallet holds no balance, so the amount field and Max are disabled and out of the Tab
 * path here; Max's own stop is proven in the funded `network/send-amount-exact.test.ts`.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { UI_STORAGE_KEYS } from "@/popup/constants/storage-keys"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { interceptRpc } from "./fixtures/browser"
import { clickByTestId, openPopup, registerProfile, test, waitForHash, type ExtensionContext } from "./fixtures/extension"
import { captureSoleProfileId, getAccountAddress, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { startNodeStub } from "./fixtures/node-stub"
import { readSendInputs, shotSend } from "./fixtures/send-page"
import { readActivityScope, seedTokenRow } from "./helpers/activity-seeds"
import { SEEDED_FPC_IDS, SEEDED_SPONSOR_FPC_ID, fpcRowIds, seedProtocolFpcs } from "./helpers/fpc-seeds"
import { activeTestId, coveredAt, focusRing, pressEscape, tabAround, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
const DESTINATION_INPUT = `${sel("send-destination-field")} input`
const OPEN_TRIGGER = `[data-dropdown-open="true"] ${sel("send-fee-method-trigger")}`
const CLOSED_TRIGGER = `[data-dropdown-open="false"] ${sel("send-fee-method-trigger")}`
const TESTNET_RPC_ORIGIN = new URL(TESTNET_RPC_URL).origin

/** Saves contacts straight to storage, which Send reads when it opens. */
async function seedContacts(page: Page, names: string[]): Promise<void> {
	const profileId = await captureSoleProfileId(page)
	await page.evaluate(
		(pid: string, list: string[]) => {
			const rows = list.map((name, i) => {
				const id = `e2e-contact-${i}`
				const address = `0x${String(i + 1).padStart(64, "0")}`
				return [
					`nulo:core:contacts@${id}`,
					JSON.stringify({ id, profileId: pid, name, address, abbr: name.slice(0, 2).toUpperCase() }),
				]
			})
			return chrome.storage.local.set(Object.fromEntries(rows))
		},
		profileId,
		names,
	)
}

async function openSendPage(ctx: ExtensionContext, { priced = false, sponsors = false, contacts = [] as string[] } = {}): Promise<Page> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	if (contacts.length) await seedContacts(page, contacts)
	const scope = priced || sponsors ? await readActivityScope(page) : undefined
	if (scope && sponsors) {
		expect(await fpcRowIds(page), "FPC rows before the seed").toEqual([])
		await seedProtocolFpcs(page, scope)
	}
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

/** Contacts load with Send's other mount reads, after the field already suggests the account. */
async function waitForSuggestionRows(page: Page, rows: number): Promise<void> {
	await page.waitForFunction(
		(s: string, n: number) => document.querySelector(s)?.children.length === n,
		{ timeout: 10_000 },
		sel("send-destination-suggestions"),
		rows,
	)
}

async function readSuggestionList(page: Page) {
	return page.evaluate(
		(input: string, list: string) => {
			const field = document.querySelector(input)
			const box = document.querySelector(list)
			const named = document.getElementById(field?.getAttribute("aria-activedescendant") ?? "")
			const rows = [...(box?.children ?? [])]
			const view = box?.getBoundingClientRect()
			const shown = (el: Element) => {
				const r = el.getBoundingClientRect()
				return Boolean(view) && r.top >= (view?.top ?? 0) - 1 && r.bottom <= (view?.bottom ?? 0) + 1
			}
			return {
				role: box?.getAttribute("role") ?? null,
				rows: rows.length,
				scrolls: (box?.scrollHeight ?? 0) > (box?.clientHeight ?? 0),
				controlled: Boolean(box?.id) && field?.getAttribute("aria-controls") === box?.id,
				active:
					named && rows.includes(named)
						? {
								row: rows.indexOf(named),
								role: named.getAttribute("role"),
								selected: named.getAttribute("aria-selected"),
								shown: shown(named),
							}
						: null,
			}
		},
		DESTINATION_INPUT,
		sel("send-destination-suggestions"),
	)
}

async function waitForAmountMode(page: Page, mode: "token" | "usd"): Promise<void> {
	await page.waitForSelector(sel(mode === "usd" ? "send-amount-fiat-input" : "send-amount-input"), { timeout: 5_000 })
}

test("the destination suggestions: a listbox Down, Up, Escape and Enter drive, picking only from the field", {
	timeout: 120_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	// Three contacts and the profile's own "Account 1" match "Acc": four rows, more than the list shows.
	const page = await openSendPage(ctx, { contacts: ["Acc A", "Acc B", "Acc C"] })
	const account = await getAccountAddress(page)

	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type("Acc")
	await waitForSuggestionRows(page, 4)
	expect(await readSuggestionList(page)).toEqual({ role: "listbox", rows: 4, scrolls: true, controlled: true, active: null })
	await page.keyboard.press("ArrowDown")
	expect((await readSuggestionList(page)).active).toEqual({ row: 0, role: "option", selected: "true", shown: true })
	// The list fades in, and a shot taken mid-fade shows the token card through it.
	await page.waitForFunction(
		(s: string) => document.querySelector(s)?.getAnimations().length === 0,
		{ timeout: 5_000 },
		sel("send-destination-suggestions"),
	)
	await shotSend(page, "send-suggestion-highlighted", "send-destination-field")

	expect(await pressEscape(page)).toBe(true)
	await page.waitForSelector(sel("send-destination-suggestions"), { hidden: true, timeout: 5_000 })
	expect(await activeTestId(page)).toBe("send-destination-field")
	await page.keyboard.press("Backspace")
	await page.waitForSelector(sel("send-destination-suggestions"), { visible: true, timeout: 5_000 })
	// Up from no highlight goes to the last row, which the list scrolls to.
	await page.keyboard.press("ArrowUp")
	expect((await readSuggestionList(page)).active).toMatchObject({ row: 3, shown: true })
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("recipient-card"), { timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(account)

	await clickByTestId(page, "recipient-card-change")
	await page.waitForSelector(DESTINATION_INPUT, { timeout: 5_000 })
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type("Acc")
	await waitForSuggestionRows(page, 4)
	// Inside the quarter second the suggestions outlive the field's blur by. The list scrolls, and a
	// scrolling element is a Tab stop unless it opts out: Tab goes on to the token card.
	await page.keyboard.press("Tab")
	expect(await activeTestId(page)).toBe("send-token-trigger")
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

async function pickSeededSponsorByKeyboard(ctx: ExtensionContext): Promise<void> {
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
	expect(await fpcRowIds(page), "FPC rows after the picks").toEqual([...SEEDED_FPC_IDS].sort())
}

test("the fee method picker: a Tab stop with the ring; Enter opens it, the arrows and Enter pick, Escape returns to it", {
	timeout: 180_000,
	retry: 0,
}, async ({ freshExtensionPerTest: ctx }) => {
	// Discovery stores its own sponsor rows beside the seeded ones whenever a node answers, so the
	// node is held from before the profile exists, in every run mode.
	const stub = await startNodeStub()
	try {
		const node = await interceptRpc(ctx.browser, ctx.extensionId, TESTNET_RPC_ORIGIN, { kind: "redirect", to: stub.url })
		try {
			await registerProfile(ctx)
			await pickSeededSponsorByKeyboard(ctx)
			// Read before `stop()`, which drops Firefox's tally.
			expect(await node.failures(), "testnet interception failures").toEqual([])
			expect(await node.hits()).toBeGreaterThan(0)
		} finally {
			await node.stop()
		}
		expect(stub.requests()).toBeGreaterThan(0)
	} finally {
		await stub.stop()
	}
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
