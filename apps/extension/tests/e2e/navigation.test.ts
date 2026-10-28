import type { Page } from "puppeteer"
import { expect } from "vitest"
import { clickByTestId, test, openPopup, waitForHash } from "./fixtures/extension"
import {
	clickNavTab,
	getAccountAddress,
	navigateToSettings,
	openDropdown,
	openHoldings,
	seedUsdQuoteAndReload,
	waitForToast,
	waitForToastGone,
} from "./fixtures/helpers"
import { readActivityScope, seedTransaction } from "./helpers/activity-seeds"
import { tabAround } from "./helpers/pointer-probes"
import { pollUntil } from "./fixtures/poll"
import { bringToFront } from "./fixtures/browser"

test("settings page shows all sections", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")

	// Assert core settings destinations exist by testid. Route segments are
	// the stable contract even when section labels get reorganized.
	for (const segment of ["profile", "accounts", "lock", "networks", "tokens", "privacy", "display", "developer", "about"]) {
		await page.waitForSelector(`[data-testid="setting-nav-${segment}"]`, {
			visible: true,
			timeout: 5_000,
		})
	}

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("activity page shows empty state", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await clickNavTab(page, "activity")
	await waitForHash(page, "#/popup/activity")

	await page.waitForSelector('[data-testid="page-hero-title"]', { visible: true, timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("bottom navigation switches between all four pages", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await openHoldings(page)

	await clickNavTab(page, "activity")
	await waitForHash(page, "#/popup/activity")

	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")

	await clickNavTab(page, "general")
	await waitForHash(page, "#/popup/general")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("back from a Settings page lands where Settings was left, and the page it opened starts at its top", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")
	await page.waitForSelector('[data-testid="setting-nav-developer"]', { visible: true, timeout: 5_000 })

	const left = await page.$eval('[data-testid="settings-page"]', (el) => {
		el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2)
		return el.scrollTop
	})
	expect(left).toBeGreaterThan(0)
	await clickByTestId(page, "setting-nav-developer")
	await waitForHash(page, "#/popup/settings/developer")
	await page.waitForSelector('[data-testid="settings-developer-page"]', { visible: true, timeout: 5_000 })
	expect(await page.$eval('[data-testid="settings-developer-page"]', (el) => el.scrollTop)).toBe(0)

	// Only a style engine starts a transition: count the compact bar's opacity runs from here on.
	await page.evaluate(() => {
		const w = window as unknown as { barFades: number }
		w.barFades = 0
		document.addEventListener(
			"transitionrun",
			(e) => {
				const bar = (e.target as Element).querySelector(':scope > [data-testid="page-title-bar"]')
				if (bar && e.propertyName === "opacity") w.barFades++
			},
			true,
		)
	})
	const barFades = () => page.evaluate(() => (window as unknown as { barFades: number }).barFades)
	const barOpacity = () =>
		page.$eval('[data-testid="page-title-bar"]', (el) => (el.parentElement ? getComputedStyle(el.parentElement).opacity : ""))

	await clickByTestId(page, "subpage-back")
	await waitForHash(page, "#/popup/settings")
	await page.waitForSelector('[data-testid="settings-page"]', { visible: true, timeout: 5_000 })
	const back = await page.$eval('[data-testid="settings-page"]', (el) => el.scrollTop)
	expect(Math.abs(back - left), `left at ${left}, back at ${back}`).toBeLessThanOrEqual(1)
	await pollUntil(barOpacity, (o) => o === "1", { label: "compact bar shown on return", timeoutMs: 5_000, intervalMs: 50 })
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
	expect(await barFades(), "the return draws the compact bar with no fade").toBe(0)

	await page.$eval('[data-testid="settings-page"]', (el) => {
		el.scrollTop = 0
	})
	await pollUntil(barFades, (n) => n > 0, { label: "a real scroll fades the bar", timeoutMs: 5_000, intervalMs: 50 })
	expect(await barFades()).toBe(1)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

type Point = { x: number; y: number }

/** Where a person presses to start or end a drag on `testid`'s text: a quarter in from the outer
 *  edge of its first or last visible character, which must be on screen and on top. Chrome starts no
 *  selection from a press just right of a glyph's middle, only a caret that follows the drag. */
async function textEdge(page: Page, testid: string, edge: "first" | "last"): Promise<Point> {
	const point = await page.$eval(
		`[data-testid="${testid}"]`,
		(el, at) => {
			const texts: Text[] = []
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
			for (let n = walker.nextNode(); n; n = walker.nextNode()) {
				if (n.textContent?.trim() && n.parentElement?.getClientRects().length) texts.push(n as Text)
			}
			const node = at === "first" ? texts[0] : texts.at(-1)
			if (!node) throw new Error(`${el.getAttribute("data-testid")} shows no text`)
			const content = node.textContent ?? ""
			const index = at === "first" ? content.search(/\S/) : content.trimEnd().length - 1
			const range = document.createRange()
			range.setStart(node, index)
			range.setEnd(node, index + 1)
			const box = range.getBoundingClientRect()
			return { x: box.left + box.width * (at === "first" ? 0.25 : 0.75), y: box.top + box.height / 2 }
		},
		edge,
	)
	const onTop = await page.$eval(`[data-testid="${testid}"]`, (el, p) => el.contains(document.elementFromPoint(p.x, p.y)), point)
	if (!onTop) throw new Error(`${testid}'s ${edge} character is off screen or covered`)
	return point
}

/** A mouse drag from `from` to `to` after clearing any selection; returns what it selected. */
async function dragSelect(page: Page, from: Point, to: Point): Promise<string> {
	await page.evaluate(() => window.getSelection()?.removeAllRanges())
	await page.mouse.move(from.x, from.y)
	await page.mouse.down()
	await page.mouse.move(to.x, to.y, { steps: 8 })
	await page.mouse.up()
	return page.evaluate(() => window.getSelection()?.toString() ?? "")
}

const textOf = (page: Page, testid: string) => page.$eval(`[data-testid="${testid}"]`, (el) => (el as HTMLElement).innerText.trim())
const lower = (text: string) => text.toLowerCase()

test("a drag selects the text around a control and none of the control's own but the header's address, which a click still copies whole: the nav, the header's buttons, a toggle, a dropdown, list rows; a drag inside About's version line copies nothing", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await bringToFront(page)
	await page.waitForSelector('[data-testid="balance-amount"]:not([aria-busy])', { visible: true, timeout: 15_000 })
	const hero = await textOf(page, "balance-amount")

	// Nothing selectable lies past the nav or above the header, so these two drags end on a control.
	// Firefox keeps the text a drag ends on, even a control's; the bans are the controls each crosses,
	// in words Home's own text never shows.
	const toNav = await dragSelect(page, await textEdge(page, "balance-amount", "first"), await textEdge(page, "nav-settings", "last"))
	console.log(`[select] hero to the nav: ${JSON.stringify(toNav)}`)
	expect(toNav.split(hero).length - 1, "the hero's figure, once").toBe(1)
	for (const label of ["send", "receive", "home", "history"]) expect(lower(toNav)).not.toContain(label)

	const toHeader = await dragSelect(
		page,
		await textEdge(page, "balance-amount", "last"),
		await textEdge(page, "account-selector", "first"),
	)
	console.log(`[select] hero to the header: ${JSON.stringify(toHeader)}`)
	expect(toHeader).toContain(hero)
	const shortAddress = await textOf(page, "account-address-text")
	expect(toHeader, "the header's shortened address").toContain(shortAddress)
	for (const label of ["testnet", "lock"]) expect(lower(toHeader)).not.toContain(label)

	// The address is a native button: a browser that ignores its text's `user-select` selects nothing
	// here, and the drag's own click must not copy. The write is the handler's first call.
	await page.evaluate(() => {
		const w = window as unknown as { __copies?: string[] }
		w.__copies = []
		navigator.clipboard.writeText = async (text: string) => {
			w.__copies?.push(text)
		}
	})
	const copies = () => page.evaluate(() => (window as unknown as { __copies?: string[] }).__copies ?? [])
	const inAddress = await dragSelect(
		page,
		await textEdge(page, "account-address-text", "first"),
		await textEdge(page, "account-address-text", "last"),
	)
	console.log(`[select] inside the header's address: ${JSON.stringify(inAddress)}`)
	expect(inAddress).toBe(shortAddress)
	expect(await copies()).toEqual([])
	const middle = await page.$eval('[data-testid="account-address-text"]', (el) => {
		const box = el.getBoundingClientRect()
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
	})
	// Chrome keeps a selection through a click inside it, so that click copies nothing (Firefox drops
	// it first): the plain click starts from none.
	await page.evaluate(() => window.getSelection()?.removeAllRanges())
	await page.mouse.click(middle.x, middle.y)
	await waitForToast(page, "Address is copied")
	expect(await copies()).toEqual([await getAccountAddress(page)])

	await navigateToSettings(page, "privacy")
	await page.waitForSelector('[data-testid="explorer-trigger"]', { visible: true, timeout: 10_000 })
	const fiatShown = await page.$eval('[data-testid="fiat-values-toggle"]', (el) => el.getAttribute("aria-checked"))
	const across = async (from: string, to: string) =>
		dragSelect(page, await textEdge(page, from, "first"), await textEdge(page, to, "last"))

	const overToggle = await across("fiat-values-description", "explorer-title")
	console.log(`[select] across the fiat toggle: ${JSON.stringify(overToggle)}`)
	expect(overToggle).toContain(await textOf(page, "fiat-values-description"))
	expect(overToggle).toContain(await textOf(page, "explorer-title"))

	const explorer = await textOf(page, "explorer-trigger")
	const overTrigger = await across("explorer-description", "privacy-mode-title")
	console.log(`[select] across the explorer menu's trigger (${explorer}): ${JSON.stringify(overTrigger)}`)
	expect(overTrigger).toContain(await textOf(page, "explorer-description"))
	expect(overTrigger).toContain(await textOf(page, "privacy-mode-title"))
	expect(lower(overTrigger)).not.toContain(lower(explorer))

	const toggle = await page.$eval('[data-testid="fiat-values-toggle"]', (el) => {
		const box = el.getBoundingClientRect()
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
	})
	const fromToggle = await dragSelect(page, toggle, await textEdge(page, "explorer-title", "last"))
	expect(fromToggle, "a drag that starts on a toggle selects nothing").toBe("")
	expect(await page.$eval('[data-testid="fiat-values-toggle"]', (el) => el.getAttribute("aria-checked"))).toBe(fiatShown)

	// Down About's lists: the rows that open a page or a document are controls; the group titles and
	// the record of the accepted Terms are text.
	await clickByTestId(page, "subpage-back")
	await waitForHash(page, "#/popup/settings")
	await navigateToSettings(page, "about")
	await page.waitForSelector('[data-testid="legal-about-accepted"]', { visible: true, timeout: 10_000 })
	// The address copy's snack slides over the page's foot as it leaves, where the next two drags end.
	await waitForToastGone(page, "Address is copied")

	await page.$eval('[data-testid="legal-about-group"]', (group) => group.firstElementChild?.scrollIntoView({ block: "nearest" }))
	const overLinks = await dragSelect(
		page,
		await textEdge(page, "coingecko-attribution", "first"),
		await textEdge(page, "legal-about-group", "first"),
	)
	console.log(`[select] down About's link rows: ${JSON.stringify(overLinks)}`)
	expect(overLinks).toContain(await textOf(page, "coingecko-attribution"))
	expect(lower(overLinks)).toContain("contact us")
	for (const row of ["nulo website", "feedback", "report issue", "report scam"]) expect(lower(overLinks)).not.toContain(row)

	await page.$eval('[data-testid="legal-about-note"]', (el) => el.scrollIntoView({ block: "end" }))
	const overLegal = await dragSelect(
		page,
		await textEdge(page, "legal-about-group", "first"),
		await textEdge(page, "legal-about-note", "last"),
	)
	console.log(`[select] down the Legal rows: ${JSON.stringify(overLegal)}`)
	expect(overLegal).toContain(await textOf(page, "legal-about-accepted"))
	expect(overLegal).toContain(await textOf(page, "legal-about-note"))
	for (const row of ["terms of use", "privacy policy", "open-source licences"]) expect(lower(overLegal)).not.toContain(row)

	// A version line copies on a click, never on the click that ends a drag inside it. Last, as the
	// copy's toast covers the foot of the page.
	await page.$eval('[data-testid="about-wallet-version"]', (el) => el.scrollIntoView({ block: "center" }))
	const copied = (await copies()).length
	const inVersion = await dragSelect(
		page,
		await textEdge(page, "about-wallet-version", "first"),
		await textEdge(page, "about-wallet-version", "last"),
	)
	console.log(`[select] inside the wallet version: ${JSON.stringify(inVersion)}`)
	expect(inVersion).toContain("Wallet version")
	expect(await copies()).toHaveLength(copied)
	await page.evaluate(() => window.getSelection()?.removeAllRanges())
	await clickByTestId(page, "about-wallet-version")
	expect((await copies()).slice(copied)).toHaveLength(1)
	expect(await textOf(page, "about-wallet-version")).toContain((await copies())[copied])

	await page.evaluate(() => window.getSelection()?.removeAllRanges())
	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("about page shows version info", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")

	await clickByTestId(page, "setting-nav-about")

	await waitForHash(page, "#/popup/settings/about")

	// About page embeds wallet + Aztec version strings. These are informational
	// fixed labels, safe to text-match.
	await page.waitForSelector("text/Wallet version", { visible: true, timeout: 5_000 })
	await page.waitForSelector("text/Aztec version", { visible: true, timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("the dropdown opener waits for a trigger that is not mounted yet and leaves an open menu open", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")

	// The opener's own first look for the trigger, made on Settings where Home's trigger is absent,
	// releases the navigation to Home: the ordering is observed, never left to a clock.
	await page.evaluate(() => {
		const probe: { firstFoundNothing?: boolean; navigated?: boolean } = {}
		const query = Document.prototype.querySelector
		const queryAll = Document.prototype.querySelectorAll
		const observe = (selector: string, foundNothing: boolean) => {
			if (probe.firstFoundNothing !== undefined || !selector.includes("tokens-menu-trigger")) return
			probe.firstFoundNothing = foundNothing
			setTimeout(() => {
				probe.navigated = true
				window.location.hash = "/popup/general"
			})
		}
		Document.prototype.querySelector = function (this: Document, selector: string) {
			const found = query.call(this, selector)
			observe(selector, found === null)
			return found
		} as Document["querySelector"]
		Document.prototype.querySelectorAll = function (this: Document, selector: string) {
			const found = queryAll.call(this, selector)
			observe(selector, found.length === 0)
			return found
		} as Document["querySelectorAll"]
		Object.assign(window, {
			__openerProbe: probe,
			__restoreQueries: () => {
				Document.prototype.querySelector = query
				Document.prototype.querySelectorAll = queryAll
			},
		})
	})
	const readProbe = () =>
		page.evaluate(() => ({
			...(window as unknown as { __openerProbe: { firstFoundNothing?: boolean; navigated?: boolean } }).__openerProbe,
			hash: window.location.hash,
		}))
	try {
		await openDropdown(page, "tokens-menu-trigger")
		expect(await readProbe()).toEqual({ firstFoundNothing: true, navigated: true, hash: "#/popup/general" })
		await page.waitForSelector('[data-testid="tokens-menu-import"]', { visible: true, timeout: 2_000 })

		await openDropdown(page, "tokens-menu-trigger")
		const menuOpen = await page.evaluate(() =>
			document
				.querySelector('[data-testid="tokens-menu-trigger"]')
				?.closest("[data-dropdown-open]")
				?.getAttribute("data-dropdown-open"),
		)
		expect(menuOpen, "a second open must not toggle the menu closed").toBe("true")
		await page.waitForSelector('[data-testid="tokens-menu-import"]', { visible: true, timeout: 2_000 })
	} finally {
		await page.evaluate(() => (window as unknown as { __restoreQueries: () => void }).__restoreQueries())
	}

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

type BarRead = {
	/** The hero title's top, from the top of its scrolling page. */
	titleOffset: number
	heroPaddingBottom: string
	wrapper: { top: number; clientWidth: number }
	bar: Box & { opacity: number }
	/** What the pointer meets at the bar's centre and 1px inside each edge: `bar`, `hero` or a testid. */
	hits: string[]
	/** Logged, not asserted: the parent's height is the flow the bar takes. */
	barParent: Box
}

function readBar(page: Page, wrapperTestid: string): Promise<BarRead> {
	return page.evaluate((wrapperSel: string) => {
		const one = (s: string) => {
			const el = document.querySelector(s)
			if (!el) throw new Error(`${s} not found`)
			return el as HTMLElement
		}
		const boxOf = (el: Element) => {
			const { top, bottom, left, right, width, height } = el.getBoundingClientRect()
			return { top, bottom, left, right, width, height }
		}
		const wrapper = one(wrapperSel)
		const bar = one('[data-testid="page-title-bar"]')
		const hero = one('[data-testid="page-hero"]')
		const b = boxOf(bar)
		// Opacity is not inherited: what shows is the product along the ancestors.
		let opacity = 1
		for (let el: Element | null = bar; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
		const midX = b.left + b.width / 2
		const midY = b.top + b.height / 2
		const points = [
			[midX, midY],
			[b.left + 1, midY],
			[b.right - 1, midY],
			[midX, b.top + 1],
			[midX, b.bottom - 1],
		]
		const hits = points.map(([x, y]) => {
			const hit = document.elementFromPoint(x, y)
			if (hit && bar.contains(hit)) return "bar"
			if (hit && hero.contains(hit)) return "hero"
			return hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"
		})
		const wrapperBox = wrapper.getBoundingClientRect()
		return {
			titleOffset: one('[data-testid="page-hero-title"]').getBoundingClientRect().top - wrapperBox.top,
			heroPaddingBottom: getComputedStyle(hero).paddingBottom,
			wrapper: { top: wrapperBox.top, clientWidth: wrapper.clientWidth },
			bar: { ...b, opacity },
			hits,
			barParent: boxOf(bar.parentElement ?? bar),
		}
	}, `[data-testid="${wrapperTestid}"]`)
}

/** Scrolls the page and waits for the bar's fade to finish in the state the scroll asks for. */
async function scrollAndSettle(page: Page, wrapperTestid: string, to: "top" | "end"): Promise<BarRead> {
	await page.evaluate(
		(s: string, end: boolean) => {
			const wrapper = document.querySelector(s)
			if (wrapper) wrapper.scrollTop = end ? wrapper.scrollHeight : 0
		},
		`[data-testid="${wrapperTestid}"]`,
		to === "end",
	)
	await page.waitForFunction(
		(want: number) => {
			let opacity = 1
			for (let el = document.querySelector('[data-testid="page-title-bar"]'); el; el = el.parentElement)
				opacity *= Number(getComputedStyle(el).opacity)
			return opacity === want
		},
		{ timeout: 5_000, polling: 50 },
		to === "end" ? 1 : 0,
	)
	return readBar(page, wrapperTestid)
}

const SETTINGS_ROW = "setting-nav-networks"

/** Hub rows that kept their ids from the pages they left, so they sit outside `setting-nav-`. */
const HUB_ROWS_OUTSIDE_PREFIX = ["delete-profile-link-btn", "backup-link-btn", "change-password-link-btn"]
/** Every hub row, matched in one query so the result is in DOM order. */
const HUB_ROWS = ['[data-testid^="setting-nav-"]', ...HUB_ROWS_OUTSIDE_PREFIX.map((id) => `[data-testid="${id}"]`)].join(", ")

/** Puts a Settings row under the shown bar's bottom edge, clicks 2px below that edge and returns
 *  what the pointer met there and the hash the click led to. */
async function clickBelowBar(page: Page): Promise<{ hit: string; hash: string }> {
	const point = await page.evaluate((rowSel: string) => {
		const wrapper = document.querySelector('[data-testid="settings-page"]')
		const bar = document.querySelector('[data-testid="page-title-bar"]')
		const row = document.querySelector(rowSel)
		if (!wrapper || !bar || !row) throw new Error("Settings, its bar or its row is missing")
		const barHeight = bar.getBoundingClientRect().height
		wrapper.scrollTop += row.getBoundingClientRect().top - wrapper.getBoundingClientRect().top - barHeight + 8
		const rowBox = row.getBoundingClientRect()
		return { x: rowBox.left + rowBox.width / 2 }
	}, `[data-testid="${SETTINGS_ROW}"]`)
	await page.waitForFunction(
		() => {
			let opacity = 1
			for (let el = document.querySelector('[data-testid="page-title-bar"]'); el; el = el.parentElement)
				opacity *= Number(getComputedStyle(el).opacity)
			return opacity === 1
		},
		{ timeout: 5_000, polling: 50 },
	)
	const y = await page.$eval('[data-testid="page-title-bar"]', (bar) => bar.getBoundingClientRect().bottom + 2)
	const hit = await page.evaluate(
		(x: number, at: number) => document.elementFromPoint(x, at)?.closest("[data-testid]")?.getAttribute("data-testid") ?? "nothing",
		point.x,
		y,
	)
	await page.mouse.click(point.x, y)
	await page
		.waitForFunction(() => window.location.hash === "#/popup/settings/networks", { timeout: 3_000, polling: 50 })
		.catch(() => undefined)
	return { hit, hash: await page.evaluate(() => window.location.hash) }
}

const pages = [
	{ tab: "activity", hash: "#/popup/activity", wrapper: "activity-feed-root" },
	{ tab: "settings", hash: "#/popup/settings", wrapper: "settings-page" },
] as const

test("History's and Settings' titles sit 10px below the header with 28px under the hero; the compact bar shows once the hero leaves, covers the page's width and takes the pointer only while shown", async ({
	registeredExtensionPerTest,
}) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	// Enough rows that History scrolls its hero away.
	const scope = await readActivityScope(page)
	const now = Date.now()
	for (let i = 0; i < 10; i++) {
		await seedTransaction(page, scope, { hash: `0x${(0x10 + i).toString(16).repeat(32)}`, amount: "1500000", at: now - i * 1_000 })
	}
	await seedUsdQuoteAndReload(page)
	await bringToFront(page)

	for (const { tab, hash, wrapper } of pages) {
		await clickNavTab(page, tab)
		await waitForHash(page, hash)
		// Inside the destination's own wrapper: the hash changes before the router swaps the page.
		await page.waitForSelector(`[data-testid="${wrapper}"] [data-testid="page-hero-title"]`, { visible: true, timeout: 10_000 })
		const atTop = await scrollAndSettle(page, wrapper, "top")
		const shown = await scrollAndSettle(page, wrapper, "end")
		const back = await scrollAndSettle(page, wrapper, "top")
		console.log(`[titles] ${tab}: ${JSON.stringify({ atTop, shown, back })}`)

		// Hidden, the bar lets every press through; shown, it is opaque and owns every point it covers.
		expect(atTop.hits.filter((h) => h === "bar")).toEqual([])
		expect(shown.bar.opacity).toBe(1)
		expect(shown.hits).toEqual(["bar", "bar", "bar", "bar", "bar"])
		expect(back.hits.filter((h) => h === "bar")).toEqual([])

		expect.soft(atTop.titleOffset, `${tab}: title below the header`).toBeGreaterThanOrEqual(9)
		expect.soft(atTop.titleOffset, `${tab}: title below the header`).toBeLessThanOrEqual(11)
		expect.soft(atTop.heroPaddingBottom, `${tab}: space under the hero`).toBe("28px")
		expect.soft(atTop.hits, `${tab}: the hidden bar lies over the hero`).toEqual(["hero", "hero", "hero", "hero", "hero"])
		expect.soft(Math.abs(shown.bar.top - shown.wrapper.top), `${tab}: the shown bar's top`).toBeLessThanOrEqual(1)
		expect.soft(Math.abs(shown.bar.width - shown.wrapper.clientWidth), `${tab}: the shown bar's width`).toBeLessThanOrEqual(1)
	}

	// One lap of Tab from Settings' first row: every row in order, then the rest of the popup, never the bar.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
	const walk = await tabAround(page, 50)
	const start = walk.indexOf("setting-nav-profile")
	const end = walk.indexOf("setting-nav-profile", start + 1)
	expect(start >= 0 && end > start, `a full lap in ${walk.join(" → ")}`).toBe(true)
	const lap = walk.slice(start, end)
	console.log(`[titles] Settings' Tab lap: ${lap.join(" → ")}`)
	expect(lap.filter((stop) => stop.startsWith("page-"))).toEqual([])
	const rows = await page.$$eval(HUB_ROWS, (els) => els.map((el) => el.getAttribute("data-testid")))
	expect(lap.filter((stop) => stop.startsWith("setting-nav-") || HUB_ROWS_OUTSIDE_PREFIX.includes(stop))).toEqual(rows)

	const below = await clickBelowBar(page)
	console.log(`[titles] a click 2px under the shown bar met ${below.hit} and led to ${below.hash}`)
	expect.soft(below, "a click just under the shown bar opens the row there").toEqual({
		hit: SETTINGS_ROW,
		hash: "#/popup/settings/networks",
	})

	expect(registeredExtensionPerTest.pageErrors).toEqual([])
}, 120_000)
