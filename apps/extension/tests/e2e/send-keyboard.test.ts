/**
 * The smoke wallet holds no balance, so the amount field and Max are disabled and out of the Tab
 * path here; Max's own stop is proven in the funded `network/send-amount-exact.test.ts`. With
 * nothing to spend the form opens on the token row.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { trimAddress } from "@/utils/string"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { interceptRpc } from "./fixtures/browser"
import {
	clickByTestId,
	launchExtension,
	openPopup,
	registerOnListChain,
	test,
	waitForHash,
	type ExtensionContext,
} from "./fixtures/extension"
import { captureSoleProfileId, getAccountAddress, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { startNodeStub } from "./fixtures/node-stub"
import { skipUnlessListPrices } from "./fixtures/token-list"
import { chooseRecipient, openSend, readSendInputs, shotSend } from "./fixtures/send-page"
import { settleClosedPopup } from "./fixtures/popup-leave"
import { readActivityScope, seedJournalRecord, seedTokenRow } from "./helpers/activity-seeds"
import { SEEDED_SPONSOR_FPC_ID, fpcRowIds, seedProtocolFpcs } from "./helpers/fpc-seeds"
import { savedFeePicks } from "./helpers/ui-preferences"
import { activeTestId, focusRing, pressEscape, tabAround, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
const DESTINATION_INPUT = `${sel("send-destination-field")} input`
const OPEN_TRIGGER = `[data-dropdown-open="true"] ${sel("send-fee-method-trigger")}`
const CLOSED_TRIGGER = `[data-dropdown-open="false"] ${sel("send-fee-method-trigger")}`
const TESTNET_RPC_ORIGIN = new URL(TESTNET_RPC_URL).origin

/** The first `count` addresses `0x…01`, `0x…02`, … that are points on the curve, so Send can pay each. */
function contactAddresses(count: number): string[] {
	const out: string[] = []
	for (let n = 1; out.length < count; n++) {
		const address = `0x${n.toString(16).padStart(64, "0")}`
		if (isValidAztecAddress(address)) out.push(address)
	}
	return out
}

/** Saves contacts straight to storage, which Send reads when it opens; the i-th at `contactAddresses`' i-th. */
async function seedContacts(page: Page, names: string[]): Promise<void> {
	const profileId = await captureSoleProfileId(page)
	const addresses = contactAddresses(names.length)
	await page.evaluate(
		(pid: string, list: string[], at: string[]) => {
			const rows = list.map((name, i) => {
				const id = `e2e-contact-${i}`
				return [
					`nulo:core:contacts@${id}`,
					JSON.stringify({ id, profileId: pid, name, address: at[i], abbr: name.slice(0, 2).toUpperCase() }),
				]
			})
			return chrome.storage.local.set(Object.fromEntries(rows))
		},
		profileId,
		names,
		addresses,
	)
}

/** Opens Send on its person step, or with `form` on the form for the profile's own account. */
async function openSendPage(
	ctx: ExtensionContext,
	{ priced = false, sponsors = false, form = false, contacts = [] as string[] } = {},
): Promise<{ page: Page; seededFpcIds: string[] }> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	if (contacts.length) await seedContacts(page, contacts)
	const scope = priced || sponsors ? await readActivityScope(page, { priced }) : undefined
	let seededFpcIds: string[] = []
	if (scope && sponsors) {
		expect(await fpcRowIds(page), "FPC rows before the seed").toEqual([])
		seededFpcIds = await seedProtocolFpcs(page, scope)
		expect(seededFpcIds, "the sponsor is offered on the spec's chain").toContain(SEEDED_SPONSOR_FPC_ID)
	}
	if (scope && priced) {
		await seedTokenRow(page, scope, 1, { transfers: true })
		await seedUsdQuoteAndReload(page, scope.token.priceId)
	}
	await openSend(page)
	await page.waitForSelector(sel("send-destination-field"), { visible: true, timeout: 15_000 })
	if (form) await chooseRecipient(page, await getAccountAddress(page))
	return { page, seededFpcIds }
}

async function expectAccentRing(page: Page, testid: string): Promise<void> {
	expect(await activeTestId(page)).toBe(testid)
	const { ring, color } = await focusRing(page, testid)
	expect(ring, testid).toMatch(/^solid 2px /)
	expect(color, testid).toBe(await tokenColor(page, "--nulo-accent"))
}

/** A real paste: the field's own text copied and pasted back by key events, so the browser runs its
 *  paste with its own event order and caret scroll, which a scripted insertion does not. */
async function pasteOwnText(page: Page, selector: string, text: string) {
	await page.focus(selector)
	await page.keyboard.type(text)
	await page.keyboard.down("Control")
	await page.keyboard.press("KeyA")
	await page.keyboard.press("KeyC")
	await page.keyboard.up("Control")
	await page.keyboard.press("Backspace")
	await page.keyboard.down("Control")
	await page.keyboard.press("KeyV")
	await page.keyboard.up("Control")
}

/** The field's scroll once two frames have passed, after any scroll the browser or the page owes it. */
const settledScroll = (page: Page, selector: string) =>
	page.$eval(
		selector,
		(el) =>
			new Promise<{ length: number; overflows: boolean; scrollLeft: number }>((resolve) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						const input = el as HTMLInputElement
						resolve({
							length: input.value.length,
							overflows: input.scrollWidth > input.clientWidth,
							scrollLeft: input.scrollLeft,
						})
					}),
				),
			),
	)

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

/** The line under a capped list: below the rows, inside the box and the popup, and not covered. */
async function readMoreLine(page: Page) {
	return page.evaluate(
		(line: string, list: string, box: string) => {
			const el = document.querySelector(line)
			if (!el) return null
			const r = el.getBoundingClientRect()
			const rows = document.querySelector(list)?.getBoundingClientRect()
			const frame = document.querySelector(box)?.getBoundingClientRect()
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			return {
				text: el.textContent?.trim(),
				below: Boolean(rows) && r.height > 0 && r.top >= (rows?.bottom ?? 0) - 1,
				inBox: Boolean(frame) && r.bottom <= (frame?.bottom ?? 0) + 1,
				inPopup: r.top >= 0 && r.bottom <= window.innerHeight,
				uncovered: Boolean(hit && el.contains(hit)),
			}
		},
		sel("send-destination-more"),
		sel("send-destination-suggestions"),
		sel("send-destination-popover"),
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
	// Fifty-one more match "z" alone: one more than the list draws.
	const zeds = Array.from({ length: 51 }, (_, i) => `Zed ${i + 1}`)
	const { page } = await openSendPage(ctx, { contacts: ["Acc A", "Acc B", "Acc C", ...zeds] })
	const account = await getAccountAddress(page)

	// A pasted address shows its start; a typed character then brings the caret back into view.
	await pasteOwnText(page, DESTINATION_INPUT, `0x${"0c2b".repeat(16)}`)
	expect(await settledScroll(page, DESTINATION_INPUT), "a pasted address shows its start").toEqual({
		length: 66,
		overflows: true,
		scrollLeft: 0,
	})
	await page.keyboard.type("1")
	expect((await settledScroll(page, DESTINATION_INPUT)).scrollLeft, "a typed character shows the caret").toBeGreaterThan(0)
	await page.keyboard.down("Control")
	await page.keyboard.press("KeyA")
	await page.keyboard.up("Control")
	await page.keyboard.press("Backspace")

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
		sel("send-destination-popover"),
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
	// A held Enter: its auto-repeat reaches the token row the form opens on, and must not open it.
	await page.keyboard.down("Enter")
	await page.keyboard.down("Enter")
	await page.keyboard.up("Enter")
	await page.waitForSelector(sel("send-payee"), { timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(account)
	await waitForFocus(page, "send-token-trigger")
	await expectAccentRing(page, "send-token-trigger")
	expect(await page.$(sel("token-address-field"))).toBeNull()
	expect(await page.$(sel("select-token-search"))).toBeNull()

	// Back on the person step the field is empty and focused. The line shares the box with the
	// scrolling rows: Up still reveals the last drawn row whole.
	await clickByTestId(page, "subpage-back")
	await waitForFocus(page, "send-destination-field")
	await page.keyboard.type("z")
	await waitForSuggestionRows(page, 50)
	expect(await readMoreLine(page)).toEqual({
		text: "Keep typing to narrow 1 more match.",
		below: true,
		inBox: true,
		inPopup: true,
		uncovered: true,
	})
	await page.keyboard.press("ArrowUp")
	expect((await readSuggestionList(page)).active).toMatchObject({ row: 49, shown: true })
	const lastDrawn = await page.$eval(
		DESTINATION_INPUT,
		(field, address: string) =>
			document
				.getElementById(field.getAttribute("aria-activedescendant") ?? "")
				?.querySelector(address)
				?.textContent?.trim(),
		sel("recipient-suggestion-address"),
	)
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("send-payee"), { timeout: 5_000 })
	const picked = (await readSendInputs(page)).destination
	expect(contactAddresses(3 + zeds.length).slice(3)).toContain(picked)
	expect(trimAddress(picked)).toBe(lastDrawn)

	await clickByTestId(page, "subpage-back")
	await waitForFocus(page, "send-destination-field")
	await page.keyboard.type("Acc")
	await waitForSuggestionRows(page, 4)
	// Inside the quarter second the suggestions outlive the field's blur by. The list scrolls, and a
	// scrolling element is a Tab stop unless it opts out: Tab goes on to the step's own-account row,
	// whose Enter is its own choice, never the first suggestion's.
	await page.keyboard.press("Tab")
	expect(await activeTestId(page)).toBe("send-own-account")
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("send-payee"), { timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(account)
})

test("the unit switch: a Tab stop right after the token card, the accent ring, Enter and Space, a held Enter once; each side group one stop its arrows move through", {
	timeout: 180_000,
	retry: 0,
}, async ({ listedExtensionPerTest: ctx, skip }) => {
	skipUnlessListPrices(skip)
	const { page } = await openSendPage(ctx, { priced: true, form: true })
	await page.waitForSelector(sel("send-amount-fiat-toggle"), { visible: true, timeout: 30_000 })
	await shotSend(page, "send-at-rest", "send-amount-row")

	await waitForFocus(page, "send-token-trigger")
	// Max stands before the amount field; both are disabled without a balance, so the unit switch
	// follows the token card.
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
	// Past the amount card each side group is one stop, its checked radio, and an arrow both moves to
	// and checks the other side.
	expect(await tabAround(page, 1)).toEqual(["send-from-private"])
	await page.keyboard.press("ArrowRight")
	await waitForFocus(page, "send-from-public")
	expect(await page.$eval(sel("send-from-type"), (el) => el.getAttribute("data-side"))).toBe("public")
	await page.keyboard.press("ArrowLeft")
	await waitForFocus(page, "send-from-private")
	expect(await page.$eval(sel("send-from-type"), (el) => el.getAttribute("data-side"))).toBe("private")
	expect(await tabAround(page, 1)).toEqual(["send-to-private"])
	// The radio itself is invisible over its choice, which draws the ring.
	const { ring, color } = await focusRing(page, "send-to-private-choice")
	expect(ring).toMatch(/^solid 2px /)
	expect(color).toBe(await tokenColor(page, "--nulo-accent"))
	await page.keyboard.press("ArrowDown")
	await waitForFocus(page, "send-to-public")
	expect(await page.$eval(sel("send-to-type"), (el) => el.getAttribute("data-side"))).toBe("public")
	await shotSend(page, "send-sides-focused", "send-to-type")
})

test("the token card draws the accent ring when focused", { timeout: 180_000, retry: 0 }, async ({ listedExtensionPerTest: ctx, skip }) => {
	skipUnlessListPrices(skip)
	const { page } = await openSendPage(ctx, { priced: true, form: true })
	await page.waitForSelector(sel("send-token-symbol"), { visible: true, timeout: 30_000 })
	await page.focus(sel("subpage-back"))
	await tabTo(page, "send-token-trigger")
	await expectAccentRing(page, "send-token-trigger")
	await shotSend(page, "send-token-focused", "send-token-trigger")
})

async function pickSeededSponsorByKeyboard(ctx: ExtensionContext): Promise<void> {
	const { page, seededFpcIds } = await openSendPage(ctx, { priced: true, sponsors: true, form: true })
	const account = await getAccountAddress(page)
	await page.waitForSelector(sel("send-fee-change"), { visible: true, timeout: 30_000 })
	await page.waitForSelector(sel("send-amount-fiat-toggle"), { visible: true, timeout: 30_000 })
	await shotSend(page, "send-fee-at-rest", "send-fee-line")

	// Change opens the Fee sheet on the card's method trigger, a stop inside the sheet's trap.
	await tabTo(page, "send-fee-change")
	await expectAccentRing(page, "send-fee-change")
	await page.keyboard.press("Enter")
	await waitForFocus(page, "send-fee-method-trigger")
	expect(await page.$(`${sel("send-fee-sheet")} ${sel("send-fee-method-trigger")}`), "the trigger is the sheet's").not.toBeNull()
	await expectAccentRing(page, "send-fee-method-trigger")
	await shotSend(page, "send-fee-focused", "send-fee-method-trigger")
	const trigger = await page.$eval(sel("send-fee-method-trigger"), (el) => ({ tag: el.tagName, type: el.getAttribute("type") }))
	expect(trigger).toEqual({ tag: "BUTTON", type: "button" })

	await page.keyboard.press("Enter")
	await page.waitForSelector(OPEN_TRIGGER, { timeout: 5_000 })
	// The menu measures a trigger the sheet moved in: it opens 8 px beside it.
	const gap = await feeMenuGap(page)
	expect(
		[gap.above, gap.below].some((edge) => Math.abs(edge - 8) <= 1),
		JSON.stringify(gap),
	).toBe(true)
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
	await expect
		.poll(async () => (await savedFeePicks(page)).send[account]?.private, { timeout: 10_000, interval: 200 })
		.toMatchObject({ type: "fpc", fpc: { id: SEEDED_SPONSOR_FPC_ID } })
	await waitForFocus(page, "send-fee-method-trigger")

	await page.keyboard.press(" ")
	await page.waitForSelector(OPEN_TRIGGER, { timeout: 5_000 })
	await page.keyboard.press("Escape")
	await page.waitForSelector(CLOSED_TRIGGER, { timeout: 5_000 })
	await waitForFocus(page, "send-fee-method-trigger")
	expect(await fpcRowIds(page), "FPC rows after the picks").toEqual(seededFpcIds)

	// Only the chosen priority carries the accent border; the level under the pointer does not.
	await page.waitForSelector(sel("send-fee-priority-fast"), { visible: true, timeout: 10_000 })
	await page.hover(sel("send-fee-priority-fast"))
	// `getAnimations()` flushes style, so a hover's transition counts once the hover has applied.
	await page.waitForFunction(
		(s: string) => {
			const fast = document.querySelector(s)
			return Boolean(fast?.matches(":hover")) && fast?.getAnimations().length === 0
		},
		{ timeout: 5_000 },
		sel("send-fee-priority-fast"),
	)
	const borders = await page.evaluate(() =>
		["normal", "fast"].map(
			(level) => getComputedStyle(document.querySelector(`[data-testid="send-fee-priority-${level}"]`) as Element).borderTopColor,
		),
	)
	const accent = await tokenColor(page, "--nulo-accent")
	expect(borders[0], "the chosen priority's border").toBe(accent)
	expect(borders[1], "the hovered priority's border").not.toBe(accent)

	// The row can end the page, where Tab hands focus to the browser; re-entry is tested from the
	// control before it.
	await page.focus(sel("send-fee-priority-normal"))
	await page.keyboard.press("ArrowRight")
	await waitForFocus(page, "send-fee-priority-fast")
	expect(await page.$eval(sel("send-fee-priority-fast"), (el) => el.getAttribute("aria-selected"))).toBe("true")
	await expectAccentRing(page, "send-fee-priority-fast")
	await page.keyboard.press("Tab")
	expect(await activeTestId(page), "Tab from the chosen priority").not.toMatch(/^send-fee-priority-/)
	await page.focus(sel("send-fee-priority-fast"))
	await page.keyboard.down("Shift")
	await page.keyboard.press("Tab")
	await page.keyboard.up("Shift")
	expect(await activeTestId(page), "Shift+Tab from the chosen priority").not.toMatch(/^send-fee-priority-/)
	await page.keyboard.press("Tab")
	await waitForFocus(page, "send-fee-priority-fast")

	// Escape closes the sheet back onto Change.
	expect(await pressEscape(page)).toBe(true)
	await settleClosedPopup(page, "send-fee-sheet")
	await waitForFocus(page, "send-fee-change")
}

test("the fee method picker: a Tab stop with the ring; Enter opens it, the arrows and Enter pick, Escape returns to it", {
	timeout: 180_000,
	retry: 0,
}, async ({ skip }) => {
	skipUnlessListPrices(skip)
	// Discovery stores its own sponsor rows beside the seeded ones whenever a node answers, so the
	// node is held from before the profile exists, in every run mode.
	const ctx = await launchExtension({ tokenList: "held" })
	try {
		await pickSponsorBehindStub(ctx)
	} finally {
		await ctx.close()
	}
})

async function pickSponsorBehindStub(ctx: ExtensionContext): Promise<void> {
	const stub = await startNodeStub()
	try {
		const node = await interceptRpc(ctx.browser, ctx.extensionId, TESTNET_RPC_ORIGIN, { kind: "redirect", to: stub.url })
		try {
			await registerOnListChain(ctx)
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
}

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

test("a mouse press held on a suggestion while the field's blur matches another destination picks the pressed one", {
	timeout: 120_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	const home = await openPopup(ctx)
	await waitForHash(home, "#/popup/general", 30_000)
	const account = await getAccountAddress(home)
	// Named after the account's address, so typing that address suggests both.
	await seedContacts(home, [`${account} fan`])
	const [namesake] = contactAddresses(1)
	await home.close()
	const { page } = await openSendPage(ctx)
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type(account)
	await waitForSuggestionRows(page, 2)

	// The press blurs the field, which matches the account; the step waits for the press to end, so
	// its release lands on the row it began on.
	const at = await page.$$eval(
		sel("recipient-suggestion-address"),
		(els, short: string) => {
			const box = els.find((el) => el.textContent?.trim() === short)?.getBoundingClientRect()
			return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null
		},
		trimAddress(namesake),
	)
	if (!at) throw new Error("the namesake's suggestion is not drawn")
	await page.mouse.move(at.x, at.y)
	await page.mouse.down()
	await new Promise((resolve) => setTimeout(resolve, 300))
	await page.mouse.up()
	await page.waitForSelector(sel("send-payee"), { visible: true, timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(namesake)
	expect(await page.$(sel("token-address-field"))).toBeNull()
	expect(await page.$(sel("select-token-search"))).toBeNull()
})

test("a mouse press held on a Recent row while the field holds a contact's whole address pays the pressed row", {
	timeout: 120_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	await seedContacts(page, ["Alice"])
	const [alice, recent] = contactAddresses(2)
	const scope = await readActivityScope(page)
	await seedTokenRow(page, scope, 1)
	await seedJournalRecord(page, scope, {
		id: "5e0d5e0d5e0d5e0d",
		tokenId: 1,
		amount: "700000",
		recipient: recent,
		progress: { stage: "succeeded" },
	})
	await openSend(page)
	const row = `${sel("send-recent")}[data-address="${recent}"]`
	await page.waitForSelector(row, { visible: true, timeout: 10_000 })
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type(alice)
	await waitForSuggestionRows(page, 1)

	// The press blurs the field, which holds Alice's address whole, so the field would choose her; the
	// click the release delivers lands first, on the row it began on.
	const at = await page.$eval(row, (el) => {
		const box = el.getBoundingClientRect()
		const x = box.left + box.width / 2
		const y = box.top + box.height / 2
		return { x, y, reachable: el.contains(document.elementFromPoint(x, y)) }
	})
	expect(at.reachable, "the Recent row takes the press").toBe(true)
	await page.mouse.move(at.x, at.y)
	await page.mouse.down()
	await new Promise((resolve) => setTimeout(resolve, 300))
	await page.mouse.up()
	await page.waitForSelector(sel("send-payee"), { visible: true, timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(recent)
})
