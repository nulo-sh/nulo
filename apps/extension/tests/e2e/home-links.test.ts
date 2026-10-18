import type { Page } from "puppeteer"
import { expect } from "vitest"
import { prepareKeys } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"
import { readActivityScope, secondToken, seedTokenRow, seedTransaction } from "./helpers/activity-seeds"
import { activeTestId, focusRing, pressEscape, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
/** Puppeteer's BiDi keyboard (Firefox) knows the space bar only by its key value, not as "Space". */
const SPACE = " "

/** The seeded transaction's token, registered so its page opens. */
const TOKEN_ID = 1
/** A registered token with no activity at all. */
const QUIET_TOKEN_ID = 3
const TOKEN_TX = `0x${"5e".repeat(32)}`
const OTHER_TX = `0x${"6f".repeat(32)}`
/** Wider than the hero: the sanitizer caps code points, so only the chip's own layout can clip it. */
const WIDE_SYMBOL = "\uFF37".repeat(32)

/** A release build's default tokens stop only after the seeder's retry waits (15 s, then 60 s)
 *  against the launch's stand-in node. */
const TOKENS_LAND_MS = 150_000

/** Home's token list has answered and no row in it is still on its way in, so the Tab walk below
 *  crosses a list that no longer changes. */
async function waitForSettledTokens(page: Page): Promise<void> {
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="tokens-list"][data-settled="true"]') !== null &&
			document.querySelector(
				'[data-testid="token-balance-loading"], [data-testid="tokens-skeleton-row"], [data-testid="token-import-row"]',
			) === null,
		{ timeout: TOKENS_LAND_MS, polling: 200 },
	)
}

const txRows = (page: Page) => page.$$eval(sel("tx-card"), (rows) => rows.map((row) => row.getAttribute("data-tx-hash")))

const clearInsideHero = (page: Page) =>
	page.evaluate(() => {
		const hero = document.querySelector('[data-testid="page-hero"]')?.getBoundingClientRect()
		const clear = document.querySelector('[data-testid="activity-token-filter-clear"]')?.getBoundingClientRect()
		if (!hero || !clear) return false
		return clear.left >= hero.left && clear.right <= hero.right && clear.top >= hero.top && clear.bottom <= hero.bottom
	})

async function expectLinkLook(page: Page, testid: string): Promise<void> {
	const color = await page.$eval(sel(testid), (el) => getComputedStyle(el).color)
	expect(color, `${testid}'s text colour`).toBe(await tokenColor(page, "--nulo-secondary"))
	expect(await focusRing(page, testid)).toEqual({ ring: "solid 2px 2px", color: await tokenColor(page, "--nulo-accent") })
}

// "View all" shows only once a fourth token has landed, and smoke's stand-in node lands none:
// network/home-cap.test.ts covers it on four funded tokens.
test("View history on Home and on a token's page is a Tab stop after the token list, in the link colour with the accent ring, and Enter opens History, filtered from a token's page", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	await seedTransaction(page, scope, { hash: TOKEN_TX, amount: "1500000" })
	await seedTransaction(page, { ...scope, token: secondToken(scope) }, { hash: OTHER_TX, amount: "2500000", at: Date.now() - 60_000 })
	await seedUsdQuoteAndReload(page)
	await page.waitForSelector(sel("activity-view-all"), { visible: true, timeout: 15_000 })
	await waitForSettledTokens(page)
	await prepareKeys(page)
	await shotSend(page, "home-links-rest", "activity-view-all")

	await tabTo(page, "tokens-menu-trigger")
	// The nav bar follows the feed, so a walk that crosses it reached the link by wrapping the page.
	const onward = await tabTo(page, "activity-view-all")
	expect(
		onward.filter((id) => id === "BODY" || id.startsWith("nav-")),
		`the walk on: ${onward.join(" → ")}`,
	).toEqual([])
	await shotSend(page, "home-links-view-history-focused", "activity-view-all")
	await expectLinkLook(page, "activity-view-all")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/popup/activity")

	// Seeded after Home settles: a token row the wallet did not land holds its default token's seed open.
	await seedTokenRow(page, scope, TOKEN_ID, { token: { ...scope.token, symbol: WIDE_SYMBOL } })
	await seedTokenRow(page, scope, QUIET_TOKEN_ID, { token: { ...scope.token, contract: `0x${"33".repeat(32)}`, symbol: "QUIET" } })
	await seedUsdQuoteAndReload(page)
	await navigateByHash(page, `#/popup/tokens/${TOKEN_ID}`)
	// Home has the same link; the token page's own menu proves the page has swapped.
	await page.waitForSelector(sel("token-menu-trigger"), { visible: true, timeout: 15_000 })
	await page.waitForSelector(sel("activity-view-all"), { visible: true, timeout: 15_000 })
	await prepareKeys(page)
	await tabTo(page, "activity-view-all")
	await shotSend(page, "token-page-view-history-focused", "activity-view-all")
	await expectLinkLook(page, "activity-view-all")
	await page.keyboard.press("Enter")

	// History opens filtered to the token: its own tx row only, under a chip that stays inside the hero.
	await waitForHash(page, `#/popup/activity?token=${TOKEN_ID}`)
	await page.waitForSelector(sel("activity-token-filter"), { visible: true, timeout: 15_000 })
	await page.waitForSelector(sel("tx-card"), { visible: true, timeout: 15_000 })
	expect(await txRows(page)).toEqual([TOKEN_TX])
	expect(await page.$eval(sel("activity-token-filter-symbol"), (el) => el.textContent)).toBe(WIDE_SYMBOL)
	expect(await clearInsideHero(page), "the clear control's box lies inside the hero").toBe(true)
	await shotSend(page, "history-filtered", "page-hero")

	await prepareKeys(page)
	await tabTo(page, "activity-token-filter-clear")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/popup/activity")
	await page.waitForFunction(
		(chip: string) => !document.querySelector(chip),
		{ timeout: 5_000, polling: 50 },
		sel("activity-token-filter"),
	)
	await page.waitForFunction(
		(card: string) => document.querySelectorAll(card).length === 2,
		{ timeout: 5_000, polling: 50 },
		sel("tx-card"),
	)
	expect((await txRows(page)).sort()).toEqual([TOKEN_TX, OTHER_TX].sort())
	expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("page-hero-title")
	await shotSend(page, "history-cleared", "page-hero")

	// A token with nothing yet keeps its chip over History's own empty state.
	await navigateByHash(page, `#/popup/activity?token=${QUIET_TOKEN_ID}`)
	await page.waitForSelector(sel("activity-token-filter"), { visible: true, timeout: 15_000 })
	await page.waitForSelector(sel("activity-empty"), { visible: true, timeout: 15_000 })
	expect(await txRows(page)).toEqual([])
	await shotSend(page, "history-empty-filtered", "page-hero")

	expect(ctx.pageErrors).toEqual([])
}, 240_000)

type EnterRead = { __enters?: { on: string | null; repeat: boolean }[]; __entersHeard?: boolean }

/** Holds Enter on the focused control: a press, its repeat and the release. Returns each Enter
 *  keydown's target and `repeat`, so a driver that sends no repeat proves nothing and fails. */
async function holdEnter(page: Page): Promise<{ on: string | null; repeat: boolean }[]> {
	await page.evaluate(() => {
		const w = window as unknown as EnterRead
		w.__enters = []
		// A route change keeps the document, and with it a listener an earlier hold installed.
		if (w.__entersHeard) return
		w.__entersHeard = true
		window.addEventListener(
			"keydown",
			(e) => {
				if (e.key !== "Enter") return
				const on = e.target instanceof Element ? (e.target.closest("[data-testid]")?.getAttribute("data-testid") ?? null) : null
				w.__enters?.push({ on, repeat: e.repeat })
			},
			true,
		)
	})
	await page.keyboard.down("Enter")
	await page.keyboard.down("Enter")
	await page.keyboard.up("Enter")
	return page.evaluate(() => (window as unknown as EnterRead).__enters ?? [])
}

const historyLength = (page: Page) => page.evaluate(() => history.length)

test("Send and Receive on Home are the Tab stops after the hero, with the accent ring; a held Enter on Send opens Send once; a held Enter on Receive opens one sheet, Escape closes it back onto Receive and Space opens it again", async ({
	registeredExtension: ctx,
}) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	await page.waitForSelector(sel("actions-send"), { visible: true, timeout: 15_000 })
	await prepareKeys(page)

	// A walk that passes the page's last stop leaves the document on Firefox, so each starts at a named stop.
	await page.focus(sel("header-lock"))
	const onward = await tabTo(page, "actions-send")
	expect(
		onward.filter((id) => id === "BODY" || id.startsWith("nav-") || id.startsWith("tokens-")),
		`the walk on: ${onward.join(" → ")}`,
	).toEqual([])
	const accent = await tokenColor(page, "--nulo-accent")
	expect(await focusRing(page, "actions-send")).toEqual({ ring: "solid 2px 2px", color: accent })
	await shotSend(page, "home-actions-send-focused", "actions-send")
	await page.keyboard.press("Tab")
	expect(await activeTestId(page)).toBe("actions-receive")
	expect(await focusRing(page, "actions-receive")).toEqual({ ring: "solid 2px 2px", color: accent })
	await shotSend(page, "home-actions-receive-focused", "actions-receive")

	await page.keyboard.down("Shift")
	await page.keyboard.press("Tab")
	await page.keyboard.up("Shift")
	await waitForFocus(page, "actions-send")
	const before = await historyLength(page)
	const sendEnters = await holdEnter(page)
	expect(
		sendEnters.map((e) => e.repeat),
		`the Enter keydowns: ${JSON.stringify(sendEnters)}`,
	).toEqual([false, true])
	await waitForHash(page, "#/popup/send")
	await page.waitForSelector(sel("send-footer"), { visible: true, timeout: 15_000 })
	expect(await historyLength(page), "pushStates the held Enter made").toBe(before + 1)

	await page.evaluate(() => history.back())
	await waitForHash(page, "#/popup/general")
	await page.waitForSelector(sel("actions-receive"), { visible: true, timeout: 15_000 })
	await prepareKeys(page)
	await page.focus(sel("header-lock"))
	await tabTo(page, "actions-receive")
	const receiveEnters = await holdEnter(page)
	expect(receiveEnters, "both Enter keydowns reach Receive").toEqual([
		{ on: "actions-receive", repeat: false },
		{ on: "actions-receive", repeat: true },
	])
	await page.waitForSelector(sel("receive-close"), { visible: true, timeout: 15_000 })
	expect(await page.$$eval(sel("receive-close"), (closes) => closes.length)).toBe(1)
	expect(await activeTestId(page)).toBe("actions-receive")

	expect(await pressEscape(page), "Escape is handled").toBe(true)
	await page.waitForFunction((s: string) => !document.querySelector(s), { timeout: 5_000, polling: 50 }, sel("receive-close"))
	await waitForFocus(page, "actions-receive")
	await page.keyboard.press(SPACE)
	await page.waitForSelector(sel("receive-close"), { visible: true, timeout: 15_000 })
	expect(await pressEscape(page), "Escape is handled").toBe(true)
	await waitForFocus(page, "actions-receive")

	expect(ctx.consoleErrors).toEqual([])
	expect(ctx.pageErrors).toEqual([])
}, 120_000)
