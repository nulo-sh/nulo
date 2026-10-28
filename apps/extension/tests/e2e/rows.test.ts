/** In a real browser: a row's Tab stop, its ring, the native Enter/Space activation of a link and a
 *  button, a modified click's new tab, the measured 24px box, what sits on top of a titled span
 *  and of the row's icon, and how far apart rows sit and whether anything leaves one. */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { TOKEN_LIST_SOURCE_KEY } from "@/e2e/chrome-storage-token-list"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import {
	bringToFront,
	extensionUrl,
	interceptRpc,
	openScratchPage,
	prepareKeys,
	setViewport,
	stopBackground,
	waitForNewTab,
} from "./fixtures/browser"
import { type ExtensionContext, openPopup, test, waitForHash } from "./fixtures/extension"
import {
	addContact,
	clickNavTab,
	contactRow,
	navigateByHash,
	navigateToSettings,
	openNetworkDetail,
	seedUsdQuoteAndReload,
	setDeveloperMode,
	setTheme,
	switchToNetwork,
	unlockAfterBackgroundDeath,
	waitForHomeReminders,
} from "./fixtures/helpers"
import { settleClosedPopup } from "./fixtures/popup-leave"
import { shotSend } from "./fixtures/send-page"
import { waitForPopup } from "./fixtures/popups"
import { e2eSigner, serveTokenList, signTestList, skipUnlessListPrices } from "./fixtures/token-list"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { readActivityScope, seedJournalRecord, seedReceipt, seedTokenRow, seedTransaction } from "./helpers/activity-seeds"
import { createProfileAcceptingTerms, pointerClick } from "./helpers/legal-drivers"
import { coveredAt, pressEscape, SPACE, tabAround, waitForFocus } from "./helpers/pointer-probes"
import { startStub } from "./helpers/rpc-stub"

const sel = (testid: string) => `[data-testid="${testid}"]`
const TX_HASH = `0x${"5e".repeat(32)}`

type Probe = {
	__pushes?: number
	__origPush?: History["pushState"]
	__scrolls?: number
	__spacePrevented?: boolean | null
	__clicks?: string[]
	__rowClicks?: number
	__logsClicks?: number
	__linkClick?: { modified: boolean; href: string | null; prevented: boolean } | null
	__copies?: string[]
	__cardLink?: { prevented: boolean } | null
}

const TOKEN_ROWS = `${sel("tokens-card")}, ${sel("token-seed-row")}`
/** A default token's placeholder in any status but a terminal one. */
const SEED_WORKING = `${sel("token-seed-row")}:not([data-status="failed"]):not([data-status="rejected"])`
/** A token row still on its way in: a balance's first sync, a ghost row, an import's row (it leaves
 *  when the import ends), a working default's placeholder. */
const TOKEN_LOADING = [sel("token-balance-loading"), sel("tokens-skeleton-row"), sel("token-import-row"), SEED_WORKING].join(", ")

/** A release artifact seeds the default tokens against the launch's stand-in node, which fails them
 *  only after the seeder's two retry waits (15 s, then 60 s) and three attempts. The tests that open
 *  Home add it to their own timeouts. */
const TOKENS_LAND_MS = 150_000

/** Home's token card settles after the activity row shows and then pushes the row down: a point
 *  measured before it lands can miss the row. Settled is the list's own `data-settled` (its balance
 *  and seed snapshots have both answered, and every default token, shown or not, has landed or
 *  stopped) with no row in it still loading. */
async function waitForSettledTokens(page: Page, timeout = 15_000): Promise<void> {
	await page
		.waitForFunction(
			(settled: string, loading: string) => document.querySelector(settled) !== null && document.querySelector(loading) === null,
			{ timeout, polling: 100 },
			`${sel("tokens-list")}[data-settled="true"]`,
			TOKEN_LOADING,
		)
		.catch(async (error: unknown) => {
			const held = await page.evaluate(
				(rows: string, loading: string) =>
					[...document.querySelectorAll(`${rows}, ${loading}`)].map((el) => {
						const status = el.getAttribute("data-status")
						return `${el.getAttribute("data-testid")}${status ? `[${status}]` : ""}`
					}),
				TOKEN_ROWS,
				TOKEN_LOADING,
			)
			throw new Error(`Home's token card never settled: ${held.join(", ") || "no rows"}; ${String(error)}`)
		})
}

/** A 1.5-unit transfer, of the held list's priced token when `priced`, quoted at $1. Returns once the
 *  token card has settled, which in a release build waits for its default tokens to stop. */
async function openHomeWithRow(ctx: ExtensionContext, { priced = true } = {}): Promise<Page> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page, { priced })
	await seedTransaction(page, scope, { hash: TX_HASH, amount: "1500000" })
	await seedUsdQuoteAndReload(page, scope.token.priceId)
	await page.waitForSelector(sel("tx-card"), { visible: true, timeout: 15_000 })
	await waitForSettledTokens(page, TOKENS_LAND_MS)
	await waitForHomeReminders(page)
	await bringToFront(page)
	return page
}

/** Presses Tab until focus is in the named control, reporting the walk. */
async function tabTo(page: Page, testid: string, limit = 40): Promise<string[]> {
	const visited: string[] = []
	while (visited.length < limit) {
		visited.push(...(await tabAround(page, 1)))
		if (visited.at(-1) === testid) return visited
	}
	throw new Error(`Tab never reached ${testid}: ${visited.join(" → ")}`)
}

async function shiftTab(page: Page): Promise<void> {
	await page.keyboard.down("Shift")
	await page.keyboard.press("Tab")
	await page.keyboard.up("Shift")
}

/** Counts `history.pushState` calls, scroll events until the row acts (its push), and reads whether
 *  the next Space keydown was handled — a handled keydown has no default action, so no page scroll.
 *  All on the page, armed before the key or click that is measured. */
async function armNavigationProbe(page: Page): Promise<void> {
	// Tab scrolls a row below the fold into view, and that scroll's event is dispatched on the next
	// frame: let it pass, so the probe counts only scrolls the pressed key causes.
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
	await page.evaluate(() => {
		const w = window as unknown as Probe
		w.__pushes = 0
		w.__scrolls = 0
		w.__spacePrevented = null
		if (!w.__origPush) w.__origPush = history.pushState
		const orig = w.__origPush
		const onScroll = () => {
			w.__scrolls = (w.__scrolls ?? 0) + 1
		}
		window.addEventListener("scroll", onScroll, true)
		history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
			w.__pushes = (w.__pushes ?? 0) + 1
			window.removeEventListener("scroll", onScroll, true)
			return orig.apply(this, args)
		}
		window.addEventListener(
			"keydown",
			(e) => {
				if (e.key !== " ") return
				setTimeout(() => {
					w.__spacePrevented = e.defaultPrevented
				}, 0)
			},
			{ capture: true, once: true },
		)
	})
}

/** Reads the next click once every handler has run: its modifier, the link it landed on, and
 *  whether the page left the default to the browser, which for a modified click opens the link in a
 *  new tab. */
async function armLinkClickProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as unknown as Probe
		w.__linkClick = null
		window.addEventListener(
			"click",
			(e) => {
				const href = (e.target as Element | null)?.closest("a")?.getAttribute("href") ?? null
				setTimeout(() => {
					w.__linkClick = { modified: e.ctrlKey || e.metaKey, href, prevented: e.defaultPrevented }
				}, 0)
			},
			{ capture: true, once: true },
		)
	})
}

const probe = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as Probe
		return { pushes: w.__pushes ?? -1, scrolls: w.__scrolls ?? -1, spacePrevented: w.__spacePrevented ?? null }
	})

const hash = (page: Page) => page.evaluate(() => window.location.hash)
const historyLength = (page: Page) => page.evaluate(() => history.length)

async function waitForHashPrefix(page: Page, prefix: string): Promise<void> {
	await page.waitForFunction((p: string) => window.location.hash.startsWith(p), { timeout: 10_000, polling: 50 }, prefix)
}

async function backToHome(page: Page): Promise<void> {
	await page.evaluate(() => history.back())
	await waitForHash(page, "#/popup/general", 10_000)
	await page.waitForSelector(sel("tx-card"), { visible: true, timeout: 15_000 })
	await waitForSettledTokens(page)
	await waitForHomeReminders(page)
}

/** Records the named control each click lands in, at `window` capture, and how many clicks bubble up
 *  to the endpoint row's root (where its handler listens) — without touching the event. */
async function recordClicks(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as unknown as Probe
		w.__clicks = []
		w.__rowClicks = 0
		window.addEventListener(
			"click",
			(e) => {
				const target = e.target instanceof Element ? e.target : null
				w.__clicks?.push(target?.closest("[data-testid]")?.getAttribute("data-testid") ?? target?.tagName ?? "none")
			},
			true,
		)
		document.querySelector('[data-testid="endpoint-row"]')?.addEventListener("click", () => {
			w.__rowClicks = (w.__rowClicks ?? 0) + 1
		})
	})
}

const clicks = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as Probe
		return { window: w.__clicks ?? [], row: w.__rowClicks ?? -1 }
	})

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
	await page.waitForSelector(selector, { visible: true, timeout: 10_000 })
	return page.evaluate((s: string) => {
		const el = document.querySelector(s)
		if (!el) throw new Error(`${s} not found`)
		el.scrollIntoView({ block: "center" })
		const box = el.getBoundingClientRect()
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
	}, selector)
}

/** Closes the popup holding the control with one Escape; returns whether the page handled the key. */
async function closeTopPopup(page: Page, innerTestId: string): Promise<boolean> {
	const handled = await pressEscape(page)
	try {
		await settleClosedPopup(page, innerTestId)
		return handled
	} catch (error) {
		const state = await page.evaluate((s: string) => {
			const el = document.querySelector(s)
			const wrapper = el && [...document.querySelectorAll("#popup > *")].find((w) => w.contains(el))
			const active = document.activeElement
			return {
				present: el !== null,
				wrapper: wrapper?.className ?? null,
				layers: document.querySelectorAll("#popup > *").length,
				active: active?.closest("[data-testid]")?.getAttribute("data-testid") ?? active?.tagName ?? "none",
			}
		}, sel(innerTestId))
		throw new Error(`Escape (handled=${handled}) left the popup holding ${innerTestId}: ${JSON.stringify(state)}; ${String(error)}`)
	}
}

/** The page's one contact: the one already there (a retry keeps the earlier attempt's), else a new one. */
async function ensureContact(page: Page): Promise<string> {
	const existing = await page.evaluate(
		() => document.querySelector('[data-testid="contact-row"]')?.getAttribute("data-contact-name") ?? null,
	)
	if (existing) return existing
	const name = `Row-${Math.random().toString(36).slice(2, 8)}`
	await addContact(page, name, `0x2${"a".repeat(63)}`)
	return name
}

test("Home's first activity row: a Tab stop with the ring, Enter and Space each open it with one pushState, the priced span is on top, a press on the icon opens it", async ({
	listedExtension,
	skip,
}) => {
	skipUnlessListPrices(skip)
	const page = await openHomeWithRow(listedExtension)

	const walk = await tabTo(page, "tx-card")
	console.log(`[rows] the Tab walk to the row: ${walk.join(" → ")}`)
	const focused = await page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null
		const row = el?.closest('[data-testid="tx-card"]')
		return { tag: el?.tagName, href: el?.getAttribute("href"), outline: row ? getComputedStyle(row).outlineWidth : null }
	})
	expect(focused.tag).toBe("A")
	expect(focused.href).toContain(`#/popup/tx/${TX_HASH}`)
	expect(focused.outline).toBe("2px")

	await armNavigationProbe(page)
	const entriesBefore = await historyLength(page)
	await page.keyboard.press("Enter")
	await waitForHashPrefix(page, "#/popup/tx/")
	expect(await probe(page)).toMatchObject({ pushes: 1 })
	expect(await historyLength(page)).toBe(entriesBefore + 1)

	await backToHome(page)
	await tabTo(page, "tx-card")
	await armNavigationProbe(page)
	await page.keyboard.press(SPACE)
	await waitForHashPrefix(page, "#/popup/tx/")
	await page.waitForFunction(() => (window as unknown as Probe).__spacePrevented !== null, { timeout: 5_000, polling: 50 })
	expect(await probe(page)).toEqual({ pushes: 1, scrolls: 0, spacePrevented: true })

	await backToHome(page)
	// Default tokens above it can push the row under the bottom nav.
	await page.$eval(sel("activity-fiat"), (el) => el.scrollIntoView({ block: "center" }))
	expect(await coveredAt(page, "activity-fiat")).toBeNull()
	expect(await page.$eval(sel("activity-fiat"), (el) => el.getAttribute("title"))).toBe("At today's price")
	await armNavigationProbe(page)
	await pointerClick(page, "activity-fiat")
	await waitForHashPrefix(page, "#/popup/tx/")
	expect(await probe(page)).toMatchObject({ pushes: 1 })

	// The icon box is positioned for its badge, so it paints above the row's link unless it lets the
	// pointer through: the press at its centre must land on the row.
	await backToHome(page)
	const onIcon = await centreOf(page, `${sel("tx-card")} ${sel("activity-icon")}`)
	const hit = await page.evaluate(
		({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid") ?? "nothing",
		onIcon,
	)
	expect(hit).toBe("tx-card")
	await armNavigationProbe(page)
	await page.mouse.click(onIcon.x, onIcon.y)
	await waitForHashPrefix(page, "#/popup/tx/")
	expect(await probe(page)).toMatchObject({ pushes: 1 })

	expect(listedExtension.consoleErrors).toEqual([])
	expect(listedExtension.pageErrors).toEqual([])
}, 240_000)

test("a contact row: its edit action is a 24px box whose real press stays on Contacts; a Ctrl-click opens the row's link in a new tab", async ({
	listedExtension,
}) => {
	const page = await openPopup(listedExtension)
	await waitForHash(page, "#/popup/general")
	await navigateToSettings(page, "contacts")
	await page.waitForSelector(`${sel("contacts-new-btn")}, ${sel("contact-row")}`, { visible: true, timeout: 10_000 })
	const name = await ensureContact(page)
	const row = contactRow(name)

	const href = await page.$eval(`${row} a[data-row-target]`, (a) => a.getAttribute("href") ?? "")
	expect(href).toContain("#/popup/send?contact=")
	const box = await page.$eval(`${row} ${sel("contact-edit")}`, (el) => {
		const { width, height } = el.getBoundingClientRect()
		return { width, height }
	})
	expect(box.width).toBeGreaterThanOrEqual(24)
	expect(box.height).toBeGreaterThanOrEqual(24)

	await armNavigationProbe(page)
	await pointerClick(page, "contact-edit")
	await page.waitForSelector(sel("edit-contact-submit"), { visible: true, timeout: 5_000 })
	expect(await hash(page)).toBe("#/popup/settings/contacts")
	expect(await probe(page)).toMatchObject({ pushes: 0 })
	await closeTopPopup(page, "edit-contact-submit")

	const point = await centreOf(page, row)
	await armLinkClickProbe(page)
	const tab = await waitForNewTab(
		listedExtension.browser,
		async () => {
			await page.keyboard.down("Control")
			try {
				await page.mouse.click(point.x, point.y)
			} finally {
				await page.keyboard.up("Control")
			}
		},
		10_000,
	)
	try {
		// The new tab's own URL is no witness to where it opened: the wallet's cold boot routes it on at
		// once, and Firefox reports the tab only as about:blank. What opened it is the browser's default
		// for a modified click the page left alone, on the row's link.
		await page.waitForFunction(() => (window as unknown as Probe).__linkClick != null, { timeout: 5_000, polling: 50 })
		expect(await page.evaluate(() => (window as unknown as Probe).__linkClick)).toEqual({ modified: true, href, prevented: false })
		expect(await hash(page)).toBe("#/popup/settings/contacts")
	} finally {
		await tab.close()
	}

	expect(listedExtension.consoleErrors).toEqual([])
	expect(listedExtension.pageErrors).toEqual([])
}, 90_000)

test("a receipt's To card: its explorer link is a Tab stop with the ring and a 24px box on top of the card; Enter activates it and copies nothing, a press elsewhere on the card copies", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	await seedTokenRow(page, scope, 1)
	await seedReceipt(page, scope, { tokenId: 1, amount: "1500000", uniqueNoteHash: `0x${"3d".repeat(32)}` })
	await seedUsdQuoteAndReload(page)
	const row = `${sel("tx-incoming-card")} a[data-row-target]`
	await page.waitForSelector(row, { visible: true, timeout: 15_000 })
	await page.$eval(row, (a) => (a as HTMLElement).click())
	const link = "received-to-explorer-link"
	await page.waitForSelector(sel(link), { visible: true, timeout: 15_000 })

	const box = await page.$eval(sel(link), (el) => {
		const { width, height } = el.getBoundingClientRect()
		return { width, height }
	})
	expect(box.width).toBeGreaterThanOrEqual(24)
	expect(box.height).toBeGreaterThanOrEqual(24)
	expect(await coveredAt(page, link)).toBeNull()

	await page.evaluate((s: string) => {
		const w = window as unknown as Probe
		w.__copies = []
		w.__cardLink = null
		navigator.clipboard.writeText = async (text: string) => {
			w.__copies?.push(text)
		}
		// Registered after the page's own handler, so it reads whether the page left the browser's new
		// tab alone; it then cancels the tab, since smoke refuses every outside host.
		document.querySelector(s)?.addEventListener("click", (e) => {
			w.__cardLink = { prevented: e.defaultPrevented }
			e.preventDefault()
		})
	}, sel(link))
	const copies = () => page.evaluate(() => (window as unknown as Probe).__copies ?? [])

	const walk = await tabTo(page, link)
	console.log(`[rows] the Tab walk to the To card's link: ${walk.join(" → ")}`)
	const focused = await page.evaluate(() => {
		const el = document.activeElement as HTMLElement
		const { outlineStyle, outlineWidth } = getComputedStyle(el)
		return { tag: el.tagName, outlineStyle, outlineWidth }
	})
	expect(focused).toEqual({ tag: "A", outlineStyle: "solid", outlineWidth: "2px" })
	await page.keyboard.press("Enter")
	await page.waitForFunction(() => (window as unknown as Probe).__cardLink != null, { timeout: 5_000, polling: 50 })
	expect(await page.evaluate(() => (window as unknown as Probe).__cardLink)).toEqual({ prevented: false })
	expect(await copies()).toEqual([])

	await pointerClick(page, "received-to-address")
	await page.waitForFunction(() => ((window as unknown as Probe).__copies?.length ?? 0) > 0, { timeout: 5_000, polling: 50 })
	expect(await copies()).toEqual([scope.account])

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
}, 90_000)

test("a click-mode Settings row opens on Enter and on Space; an action inside a Tooltip runs once per key and never activates its row; inert rows are skipped", async ({
	listedExtension,
}) => {
	const page = await openPopup(listedExtension)
	await waitForHash(page, "#/popup/general")
	await navigateToSettings(page, "networks")
	const firstName = await page.$eval(sel("network-row"), (el) => el.getAttribute("data-network-name"))
	await openNetworkDetail(page, firstName ?? "")
	await bringToFront(page)

	await tabTo(page, "network-detail-rename", 12)
	for (const key of ["Enter", SPACE] as const) {
		await page.keyboard.press(key)
		await page.waitForSelector(sel("network-name-input"), { visible: true, timeout: 5_000 })
		await closeTopPopup(page, "network-name-input")
		await waitForFocus(page, "network-detail-rename")
	}

	// The disabled active-network row above and the raw Chain ID row below the rename row hold no
	// stop: the next two are the endpoint row's target and its first action.
	await recordClicks(page)
	expect(await tabAround(page, 2)).toEqual(["endpoint-row", "endpoint-edit-btn"])
	for (const [i, key] of (["Enter", SPACE] as const).entries()) {
		await page.keyboard.press(key)
		await page.waitForSelector(sel("endpoint-rpc-input"), { visible: true, timeout: 5_000 })
		// The action's click stops at the action: none reaches the row root, where the row's handler is.
		expect(await clicks(page)).toEqual({ window: Array(i + 1).fill("endpoint-edit-btn"), row: 0 })
		expect(await hash(page)).toContain("/popup/settings/networks/")
		// The press dismissed the action's tooltip, so the one Escape is the popup's.
		await page.waitForFunction(() => !document.querySelector('[data-testid="tooltip-bubble"]'), { timeout: 2_000, polling: 50 })
		expect(await closeTopPopup(page, "endpoint-rpc-input")).toBe(true)
		await waitForFocus(page, "endpoint-edit-btn")
	}

	expect(listedExtension.consoleErrors).toEqual([])
	expect(listedExtension.pageErrors).toEqual([])
}, 90_000)

test("Settings → Developer's Logs row: one Tab stop with the ring; Enter opens the log window and Space runs the same handler", async ({
	listedExtension,
}) => {
	const page = await openPopup(listedExtension)
	await waitForHash(page, "#/popup/general")
	await setDeveloperMode(page, true)
	await navigateByHash(page, "#/popup/settings/developer")
	await page.waitForSelector(sel("settings-logs-row"), { visible: true, timeout: 10_000 })
	await page.evaluate(() => {
		const w = window as unknown as Probe
		w.__logsClicks = 0
		document.querySelector('[data-testid="settings-logs-row"]')?.addEventListener("click", () => {
			w.__logsClicks = (w.__logsClicks ?? 0) + 1
		})
	})
	await bringToFront(page)

	await tabTo(page, "settings-logs-open", 20)
	const ring = await page.$eval(sel("settings-logs-row"), (el) => {
		const style = getComputedStyle(el)
		return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`
	})
	expect(ring).toBe("solid 2px -2px")
	// Checked before Enter, while no window the wallet opened can take focus from the popup.
	expect(await tabAround(page, 1)).not.toContain("settings-logs-open")
	await shiftTab(page)
	await waitForFocus(page, "settings-logs-open")

	const before = new Set(listedExtension.browser.targets())
	const logsP = waitForPopup(listedExtension, "logger", { timeout: 10_000 })
	await page.keyboard.press("Enter")
	const logs = await logsP
	try {
		// The window is open, so Space brings it forward instead of opening a second one.
		await prepareKeys(page)
		await waitForFocus(page, "settings-logs-open")
		await page.keyboard.press(SPACE)
		await page.waitForFunction(() => (window as unknown as Probe).__logsClicks === 2, { timeout: 5_000, polling: 50 })
		expect(listedExtension.browser.targets().filter((t) => t.type() === "page" && !before.has(t))).toHaveLength(1)
	} finally {
		await logs.close().catch(() => undefined)
	}

	expect(listedExtension.consoleErrors).toEqual([])
	expect(listedExtension.pageErrors).toEqual([])
}, 90_000)

test("History's list keeps the −8px row box inside the page: nothing scrolls sideways", async ({ listedExtension }) => {
	const page = await openHomeWithRow(listedExtension, { priced: false })
	await clickNavTab(page, "activity")
	await waitForHash(page, "#/popup/activity")
	await page.waitForSelector(`${sel("activity-feed-root")} ${sel("tx-card")}`, { visible: true, timeout: 15_000 })

	// The row's box bleeds 8px into the page padding by design; what must not happen is a scroll
	// container or the document gaining width, or the row leaving the viewport.
	const layout = await page.evaluate(() => {
		const overflowing: string[] = []
		const row = document.querySelector('[data-testid="tx-card"]')
		let el: Element | null = row
		while (el && el !== document.body) {
			const clips = getComputedStyle(el).overflowX !== "visible"
			if (clips && el.scrollWidth > el.clientWidth)
				overflowing.push(`${el.getAttribute("data-testid") ?? el.tagName} ${el.scrollWidth}>${el.clientWidth}`)
			el = el.parentElement
		}
		if (document.documentElement.scrollWidth > window.innerWidth) overflowing.push("html")
		const box = row?.getBoundingClientRect()
		return { overflowing, left: box?.left ?? -1, right: box?.right ?? -1, width: window.innerWidth }
	})
	expect(layout.overflowing).toEqual([])
	expect(layout.left).toBeGreaterThanOrEqual(0)
	expect(layout.right).toBeLessThanOrEqual(layout.width)

	expect(listedExtension.consoleErrors).toEqual([])
	expect(listedExtension.pageErrors).toEqual([])
}, 210_000)

const ROWS = `${sel("tx-card")}, ${sel("tx-incoming-card")}`
const RECEIPT_TOKEN_ID = 1
/** A dApp's own name: at 360px its chip is cut beside the transfer's direction. */
const DAPP_NAME = "Shielded Payroll Portal"
/** A dApp's transfer whose dollar figure leaves its app chip no room past its floor. */
const LARGE_DAPP_HASH = `0x${"6e".repeat(32)}`
/** The floor of a two-chip row's app chip: its border, padding and one "…" at the chip's 10px. */
const APP_CHIP_FLOOR = 19
/** The two chips' gap when the app chip drops under the direction chip. */
const CHIP_ROW_GAP = 4

type RowLayout = {
	row: string
	top: number
	bottom: number
	amount: string | null
	fiat: string | null
	/** Descendants whose box leaves the row's. */
	escapes: string[]
	/** Descendants outside the amount column whose box enters it. */
	intrudes: string[]
	/** The amount's text is wider than its box. */
	cut: boolean
	/** The title's text is wider than its box: a send's or a receipt's symbol must never be. */
	titleCut: boolean
}

function readRows(page: Page): Promise<RowLayout[]> {
	return page.evaluate((rowsSel: string) => {
		const EDGE = 0.5
		const name = (el: Element) => el.getAttribute("data-testid") ?? el.tagName.toLowerCase()
		const within = (b: DOMRect, box: DOMRect) =>
			b.left >= box.left - EDGE && b.right <= box.right + EDGE && b.top >= box.top - EDGE && b.bottom <= box.bottom + EDGE
		const meets = (b: DOMRect, box: DOMRect) =>
			b.left < box.right - EDGE && b.right > box.left + EDGE && b.top < box.bottom - EDGE && b.bottom > box.top + EDGE
		const drawn = (row: Element) =>
			[...row.querySelectorAll("*")].filter((el) => {
				const b = el.getBoundingClientRect()
				return b.width > 0 && b.height > 0
			})
		const intruders = (row: Element, col: Element | null) => {
			if (!col) return []
			const colBox = col.getBoundingClientRect()
			// The row's link is stretched under the whole row by design.
			const outside = drawn(row).filter((el) => !col.contains(el) && !el.closest("[data-row-target]"))
			return outside.filter((el) => meets(el.getBoundingClientRect(), colBox)).map(name)
		}
		return [...document.querySelectorAll(rowsSel)].map((row) => {
			const box = row.getBoundingClientRect()
			const amount = row.querySelector<HTMLElement>('[data-testid="activity-amount"]')
			return {
				row: `${name(row)} ${row.getAttribute("data-tx-hash")?.slice(0, 6) ?? ""}`.trim(),
				top: box.top,
				bottom: box.bottom,
				amount: amount?.textContent?.trim() ?? null,
				fiat: row.querySelector('[data-testid="activity-fiat"]')?.textContent?.trim() ?? null,
				escapes: drawn(row)
					.filter((el) => !within(el.getBoundingClientRect(), box))
					.map(name),
				intrudes: intruders(row, row.querySelector('[data-testid="activity-amount-col"]')),
				cut: amount !== null && amount.scrollWidth > amount.clientWidth,
				titleCut: (() => {
					const title = row.querySelector('[data-testid="activity-title"]')
					return title === null || title.scrollWidth > title.clientWidth
				})(),
			}
		})
	}, ROWS)
}

/** The page's rows once `count` of them show their dollar figure and hold still across two polls: a
 *  receipt, a token lookup or a quote that lands late moves them. */
async function settledRows(page: Page, count: number): Promise<RowLayout[]> {
	await page
		.waitForFunction(
			(rowsSel: string, n: number) => {
				const w = window as unknown as { __rowsKey?: string }
				const rows = [...document.querySelectorAll(rowsSel)]
				const priced = rows.every((row) => row.querySelector('[data-testid="activity-fiat"]')?.textContent?.includes("$"))
				const boxes = rows.map((el) => {
					const b = el.getBoundingClientRect()
					return `${b.top},${b.bottom}`
				})
				const key = boxes.join("|")
				const still = boxes.length === n && priced && key === w.__rowsKey
				w.__rowsKey = key
				return still
			},
			{ timeout: 15_000, polling: 100 },
			ROWS,
			count,
		)
		.catch(async (error: unknown) => {
			throw new Error(`${count} rows never held still: ${JSON.stringify(await readRows(page))}; ${String(error)}`)
		})
	return readRows(page)
}

const gapsOf = (rows: RowLayout[]) => rows.slice(1).map((row, i) => row.top - rows[i].bottom)

type TwoChipRow = {
	directionLines: number
	/** `lead` is the chip's `::before`: an empty inline-block lets the "…" replace the first letter.
	 *  `gap` runs from the direction chip's bottom to the app chip's top, `left` between their left edges. */
	chip: { width: number; cut: boolean; name: string; gap: number; left: number; lead: { content: string; display: string } }
}

function readTwoChipRow(page: Page, hash: string): Promise<TwoChipRow> {
	return page.evaluate((h: string) => {
		const row = document.querySelector(`[data-testid="tx-card"][data-tx-hash="${h}"]`)
		const direction = row?.querySelector<HTMLElement>('[data-testid="activity-direction-chip"]')
		const chip = row?.querySelector<HTMLElement>('[data-testid="activity-app-chip"]')
		if (!direction || !chip) throw new Error(`row ${h.slice(0, 6)} has no two chips`)
		const range = document.createRange()
		range.selectNodeContents(direction)
		const below = direction.getBoundingClientRect()
		const box = chip.getBoundingClientRect()
		return {
			directionLines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
			chip: {
				width: box.width,
				cut: chip.scrollWidth > chip.clientWidth,
				name: chip.textContent ?? "",
				gap: box.top - below.bottom,
				left: box.left - below.left,
				lead: (({ content, display }) => ({ content, display }))(getComputedStyle(chip, "::before")),
			},
		}
	}, hash)
}

type ReceiptChip = {
	/** The title, separator and chip on one line, with their two 6px gaps. */
	need: number
	/** From the text column's left edge to 10px short of the amount column. */
	space: number
	wrapped: boolean
	gaps: { titleToSep: number; sepToChip: number }
	/** The chip's left edge and the separator's right edge, each from the title row's clipping edge. */
	chipLeft: number
	sepRight: number
	/** From the title's bottom to the wrapped chip's top. */
	rowGap: number
}

/** The page's one receipt: its kind chip beside its title, or under it where the line has no room. */
function readReceiptChip(page: Page): Promise<ReceiptChip> {
	return page.evaluate(() => {
		const row = document.querySelector('[data-testid="tx-incoming-card"]')
		const ids = [
			"activity-title",
			"tx-incoming-kind-chip",
			"tx-incoming-kind-sep",
			"activity-title-row",
			"activity-text",
			"activity-amount-col",
		]
		const els = ids.map((id) => row?.querySelector(`[data-testid="${id}"]`))
		if (els.some((el) => !el)) throw new Error("the receipt row is incomplete")
		const [title, chip, sep, clip, text, amountCol] = els.map((el) => (el as Element).getBoundingClientRect())
		return {
			need: title.width + 6 + sep.width + 6 + chip.width,
			space: amountCol.left - 10 - text.left,
			wrapped: chip.top >= title.bottom - 0.5,
			gaps: { titleToSep: sep.left - title.right, sepToChip: chip.left - sep.right },
			chipLeft: chip.left - clip.left,
			sepRight: sep.right - clip.left,
			rowGap: chip.top - title.bottom,
		}
	})
}

function expectReceiptWrapped(chip: ReceiptChip, where: string): void {
	expect(chip.wrapped, where).toBe(true)
	expect(chip.need, where).toBeGreaterThan(chip.space)
	expect(Math.abs(chip.chipLeft), where).toBeLessThanOrEqual(0.5)
	expect(chip.sepRight, where).toBeLessThanOrEqual(0)
	expect(chip.rowGap, where).toBeCloseTo(4, 0)
}

/** A row that fits stays as it was: the receipt keeps its one line from the first popup width that holds
 *  it, and wraps a pixel short of it. The popup's body is `--base-width` wide whatever the viewport. */
async function expectReceiptFitsFromItsWidth(page: Page): Promise<void> {
	const short = await readReceiptChip(page)
	const fits = 360 + Math.ceil(short.need - short.space)
	for (const width of [fits, fits - 1]) {
		await setViewport(page, { width, height: 600 })
		await page.evaluate((w: number) => document.documentElement.style.setProperty("--base-width", `${w}px`), width)
		await settledRows(page, 5)
		const receipt = await readReceiptChip(page)
		console.log(`[rows] History at ${width}px: the receipt ${JSON.stringify(receipt)}`)
		if (width === fits - 1) {
			expectReceiptWrapped(receipt, `${width}px`)
			continue
		}
		expect(receipt.wrapped).toBe(false)
		expect(receipt.need).toBeLessThanOrEqual(receipt.space)
		expect(receipt.gaps.titleToSep).toBeCloseTo(6, 1)
		expect(receipt.gaps.sepToChip).toBeCloseTo(6, 1)
	}
	await page.evaluate(() => document.documentElement.style.removeProperty("--base-width"))
	await setViewport(page, { width: 360, height: 600 })
}

/** Opens a surface by its hash and waits for the rows on screen to leave: the hash changes before
 *  the router swaps the page, so the old page's rows could pass for the new page's. */
async function openSurface(page: Page, hash: string): Promise<void> {
	const leaving = await page.$$(ROWS)
	await navigateByHash(page, hash)
	await page.waitForFunction((...rows: Element[]) => rows.every((row) => !row.isConnected), { timeout: 15_000, polling: 100 }, ...leaving)
	await Promise.all(leaving.map((row) => row.dispose()))
}

/** Each opened by its hash: Appearance, where the theme is set, has no bottom nav. */
const SURFACES = [
	{ name: "Home", hash: "#/popup/general" },
	{ name: "the token page", hash: `#/popup/tokens/${RECEIPT_TOKEN_ID}` },
	{ name: "History", hash: "#/popup/activity" },
]

test("rows sit 10px apart on Home, a token's page and History, the date heading 12px above the first; a dApp's long title, a nine-digit amount, a dApp's large transfer with its app chip under its direction and a priced receipt stay inside their rows and never cover an amount, the receipt's chip under its title only where it does not fit, dark and light", async ({
	listedExtensionPerTest,
	skip,
}) => {
	skipUnlessListPrices(skip)
	const page = await openPopup(listedExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page, { priced: true })
	const now = Date.now()
	await seedTransaction(page, scope, { hash: TX_HASH, amount: "1500000", at: now })
	await seedTransaction(page, scope, { hash: `0x${"6a".repeat(32)}`, amount: "123456789123456", at: now - 1_000 })
	await seedTransaction(page, scope, {
		hash: `0x${"6b".repeat(32)}`,
		amount: "2500000",
		at: now - 2_000,
		transferType: 2,
		dapp: DAPP_NAME,
	})
	await seedTransaction(page, scope, {
		hash: LARGE_DAPP_HASH,
		amount: (1_250n * 10n ** BigInt(scope.token.decimals)).toString(),
		at: now - 2_500,
		transferType: 2,
		dapp: DAPP_NAME,
	})
	await seedTokenRow(page, scope, RECEIPT_TOKEN_ID)
	// "Received privately" beside "+28.43950" has no room at 360px.
	await seedReceipt(page, scope, {
		tokenId: RECEIPT_TOKEN_ID,
		amount: "28439501",
		uniqueNoteHash: `0x${"5c".repeat(32)}`,
		at: now - 3_000,
	})
	await seedUsdQuoteAndReload(page, scope.token.priceId)
	await bringToFront(page)

	for (const theme of ["dark", "light"] as const) {
		await navigateToSettings(page, "display")
		await setTheme(page, theme)
		for (const surface of SURFACES) {
			await openSurface(page, surface.hash)
			const rows = await settledRows(page, 5)
			const large = await readTwoChipRow(page, LARGE_DAPP_HASH)
			const gaps = gapsOf(rows)
			console.log(
				`[rows] ${theme}, ${surface.name}: heights ${rows.map((r) => (r.bottom - r.top).toFixed(1)).join(", ")}; gaps ${gaps.map((g) => g.toFixed(1)).join(", ")}; amounts ${rows.map((r) => r.amount).join(", ")}`,
			)
			expect(rows.filter((r) => r.amount === null || r.cut || r.titleCut || r.escapes.length > 0 || r.intrudes.length > 0)).toEqual(
				[],
			)
			for (const gap of gaps) expect.soft(gap, `${surface.name}'s row gap`).toBeCloseTo(10, 0)
			console.log(`[rows] ${theme}, ${surface.name}: the large dApp transfer ${JSON.stringify(large)}`)
			// Past the app chip's floor it drops under the whole direction chip and keeps its name, cut at its cap.
			expect(large.directionLines, surface.name).toBe(1)
			expect(large.chip).toMatchObject({ cut: true, name: DAPP_NAME, lead: { content: '""', display: "inline-block" } })
			expect(large.chip.gap).toBeCloseTo(CHIP_ROW_GAP, 0)
			expect(large.chip.left).toBeCloseTo(0, 0)
			expect(large.chip.width).toBeCloseTo(APP_CHIP_CAP, 0)
			const receipt = await readReceiptChip(page)
			console.log(`[rows] ${theme}, ${surface.name}: the receipt ${JSON.stringify(receipt)}`)
			expectReceiptWrapped(receipt, `${theme}, ${surface.name}`)
			if (surface.name === "History" && theme === "dark") await shotSend(page, "dapp-transfer-rows", "activity-app-chip")
			if (surface.name !== "History") continue
			const clearance = await page.evaluate((rowsSel: string) => {
				const label = document.querySelector('[data-testid="activity-date-label"]')
				const first = document.querySelector(rowsSel)
				return label && first ? first.getBoundingClientRect().top - label.getBoundingClientRect().bottom : null
			}, ROWS)
			console.log(`[rows] ${theme}, History: date label to first row ${clearance?.toFixed(1)}`)
			expect(clearance).toBeCloseTo(12, 0)
		}
	}

	await expectReceiptFitsFromItsWidth(page)

	expect(listedExtensionPerTest.consoleErrors).toEqual([])
	expect(listedExtensionPerTest.pageErrors).toEqual([])
}, 180_000)

/** A dApp's function name and host, 62 and 43 characters: the host breaks only at its hyphens. */
const LONG_METHOD = "swap_exact_tokens_for_tokens_supporting_fee_on_transfer_tokens"
/** A dApp that names itself nothing gets the "dApp" chip, and this name humanizes to one unbreakable word. */
const UNBREAKABLE_METHOD = "swapexacttokensfortokenssupportingfeeontransfertokens"
const NAMED_RECORD = "d1".repeat(8)
const NAMELESS_RECORD = "d2".repeat(8)
/** A name one line holds beside its app chip at the popup's width, and a 240 px row does not. */
const MEDIUM_RECORD = "d3".repeat(8)
const MEDIUM_METHOD = "transfer_in_private_now"
const LONG_HOST = "staging-nemi-interface.nemi-e65.workers.dev"
/** A dApp's name with no break opportunity anywhere, 42 characters. */
const JOURNAL_HOST = "verylongsubdomainwithoutbreaks.example.com"
const SHORT_APP = "NEMI"
const APP_CHIP_CAP = 96
const DAPP_CALL_HASH = `0x${"6c".repeat(32)}`
const DAPP_TRANSFER_HASH = `0x${"6d".repeat(32)}`

type NamedRows = {
	/** Scroll containers and the document that came out wider than their box. */
	overflowing: string[]
	/** Per row: its title's line count, whether its text is cut and shown with an ellipsis, its direction
	 *  chip's line count, its app chip and whether that chip sits below the direction chip, or below the
	 *  title where the row has no direction. */
	rows: Record<
		string,
		{
			lines: number
			cut: boolean
			ellipsis: boolean
			direction: { lines: number } | null
			chip: { text: string; width: number; cut: boolean; below: boolean } | null
			/** Each chip's computed size, weight and tracking. */
			type: { direction: string | null; chip: string | null }
		}
	>
}

/** Reads the four dApp rows once each is drawn and the fonts are in. */
async function readDappRows(page: Page): Promise<NamedRows> {
	const journalRow = (id: string) => `${sel("tx-terminal-card")}:has([href$="${id}"])`
	const rows = {
		terminal: journalRow(NAMED_RECORD),
		nameless: journalRow(NAMELESS_RECORD),
		medium: journalRow(MEDIUM_RECORD),
		call: `${sel("tx-card")}[data-tx-hash="${DAPP_CALL_HASH}"]`,
		transfer: `${sel("tx-card")}[data-tx-hash="${DAPP_TRANSFER_HASH}"]`,
	}
	await page.waitForFunction(
		(all: string[]) => document.fonts.status === "loaded" && all.every((s) => document.querySelector(s) !== null),
		{ timeout: 15_000, polling: 100 },
		Object.values(rows),
	)
	return page.evaluate((named: Record<string, string>) => {
		const lineCount = (el: Element) => {
			const range = document.createRange()
			range.selectNodeContents(el)
			return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
		}
		const widened = (row: Element) => {
			const found: string[] = []
			for (let el = row.parentElement; el && el !== document.body; el = el.parentElement) {
				if (getComputedStyle(el).overflowX !== "visible" && el.scrollWidth > el.clientWidth)
					found.push(`${el.getAttribute("data-testid") ?? el.tagName} ${el.scrollWidth}>${el.clientWidth}`)
			}
			return found
		}
		const typeOf = (el: Element | null) => {
			if (!el) return null
			const { fontSize, fontWeight, letterSpacing } = getComputedStyle(el)
			return `${fontSize} ${fontWeight} ${letterSpacing}`
		}
		const readRow = (row: Element) => {
			const title = row.querySelector<HTMLElement>('[data-testid="activity-title"]')
			if (!title) throw new Error("a row has no title")
			const direction = row.querySelector('[data-testid="activity-direction-chip"]')
			const chip = row.querySelector<HTMLElement>('[data-testid="activity-app-chip"]')
			const before = (direction ?? title).getBoundingClientRect()
			return {
				lines: lineCount(title),
				cut: title.scrollWidth > title.clientWidth,
				ellipsis: getComputedStyle(title).textOverflow === "ellipsis",
				direction: direction && { lines: lineCount(direction) },
				chip: chip && {
					text: chip.textContent?.trim() ?? "",
					width: chip.getBoundingClientRect().width,
					cut: chip.scrollWidth > chip.clientWidth,
					below: chip.getBoundingClientRect().top >= before.bottom - 0.5,
				},
				type: { direction: typeOf(direction), chip: typeOf(chip) },
			}
		}
		const overflowing = new Set<string>()
		const out: NamedRows["rows"] = {}
		for (const [key, s] of Object.entries(named)) {
			const row = document.querySelector(s)
			if (!row) throw new Error(`${key} row missing`)
			for (const el of widened(row)) overflowing.add(el)
			out[key] = readRow(row)
		}
		if (document.documentElement.scrollWidth > window.innerWidth) overflowing.add("html")
		return { overflowing: [...overflowing], rows: out }
	}, rows)
}

async function expectAppValueBreaksAnywhere(page: Page, ids: { value: string; label: string; box: string }, host: string): Promise<void> {
	await page.waitForSelector(sel(ids.value), { visible: true, timeout: 15_000 })
	await shotSend(page, ids.value, ids.value)
	const app = await page.evaluate(
		(valueSel: string, labelSel: string, boxSel: string) => {
			const value = document.querySelector(valueSel) as HTMLElement
			const label = document.querySelector(labelSel) as HTMLElement
			const box = document.querySelector(boxSel) as HTMLElement
			const style = getComputedStyle(box)
			const inner = box.getBoundingClientRect().right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
			const range = document.createRange()
			range.selectNodeContents(value)
			const lines = [...range.getClientRects()]
			const text = value.firstChild as Text
			range.setStart(text, text.data.indexOf("s"))
			range.setEnd(text, text.data.indexOf("s") + 1)
			const glyph = range.getBoundingClientRect().width
			return {
				text: value.textContent?.trim(),
				lines: new Set(lines.map((r) => Math.round(r.top))).size,
				lineRights: lines.map((r) => r.right - inner),
				// Breaking anywhere fills the first line to within a glyph; at a hyphen it would end far short.
				firstLineSlack: Math.min(...lines.map((r) => r.left)) - value.getBoundingClientRect().left,
				glyph,
				right: value.getBoundingClientRect().right - inner,
				gap: value.getBoundingClientRect().left - label.getBoundingClientRect().right,
			}
		},
		sel(ids.value),
		sel(ids.label),
		sel(ids.box),
	)
	console.log(`[rows] ${ids.value}: ${JSON.stringify(app)}`)
	expect(app.text).toBe(host)
	expect(app.lines).toBe(2)
	expect(Math.abs(app.right)).toBeLessThanOrEqual(0.5)
	for (const right of app.lineRights) expect(Math.abs(right)).toBeLessThanOrEqual(0.5)
	expect(app.firstLineSlack).toBeLessThan(app.glyph)
	expect(app.gap).toBeGreaterThanOrEqual(16 - 0.5)
}

type MethodRow = { lines: number; overflow: number; gap: number }

/** The journal page's Method row once it reads `text`: its value's line count, how far its widest line
 *  passes the box's inner right edge, and the space between label and value. */
async function readMethodRow(page: Page, shot: string, text: string): Promise<MethodRow> {
	await page.waitForFunction(
		(s: string, t: string) => document.querySelector(s)?.textContent?.trim() === t,
		{ timeout: 15_000 },
		sel("journal-detail-method"),
		text,
	)
	await shotSend(page, shot, "journal-detail-method")
	const row = await page.evaluate(
		(valueSel: string, labelSel: string, boxSel: string) => {
			const value = document.querySelector(valueSel) as HTMLElement
			const label = document.querySelector(labelSel) as HTMLElement
			const box = document.querySelector(boxSel) as HTMLElement
			const style = getComputedStyle(box)
			const inner = box.getBoundingClientRect().right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
			const range = document.createRange()
			range.selectNodeContents(value)
			const lines = [...range.getClientRects()]
			return {
				lines: new Set(lines.map((r) => Math.round(r.top))).size,
				overflow: Math.max(value.getBoundingClientRect().right, ...lines.map((r) => r.right)) - inner,
				gap: value.getBoundingClientRect().left - label.getBoundingClientRect().right,
			}
		},
		sel("journal-detail-method"),
		sel("journal-detail-method-label"),
		sel("journal-detail-box"),
	)
	console.log(`[rows] ${shot}: ${JSON.stringify(row)}`)
	return row
}

test("a dApp's long function name and host never widen Home or History, named or not: the title is cut on one line, the app chip at 96px with a short one whole, a transfer's symbol and direction whole with its app chip cut beside them, and at 240px no row's text is hidden or newly cut; the App value of the transaction and journal pages breaks anywhere against the box's right edge; the journal page's Method value wraps 16px clear of its label", async ({
	listedExtensionPerTest,
}) => {
	const page = await openPopup(listedExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	const now = Date.now()
	await seedJournalRecord(page, scope, {
		id: NAMED_RECORD,
		kind: "dapp_execute",
		title: LONG_METHOD,
		subtitle: JOURNAL_HOST,
		progress: { stage: "cancelled" },
		at: now,
	})
	await seedJournalRecord(page, scope, {
		id: NAMELESS_RECORD,
		kind: "dapp_execute",
		title: UNBREAKABLE_METHOD,
		subtitle: "",
		progress: { stage: "cancelled" },
		at: now - 500,
	})
	await seedJournalRecord(page, scope, {
		id: MEDIUM_RECORD,
		kind: "dapp_execute",
		title: MEDIUM_METHOD,
		subtitle: "a.io",
		progress: { stage: "cancelled" },
		at: now - 750,
	})
	await seedTransaction(page, scope, { hash: DAPP_CALL_HASH, amount: "0", method: LONG_METHOD, dapp: SHORT_APP, at: now - 1_000 })
	await seedTransaction(page, scope, { hash: DAPP_TRANSFER_HASH, amount: "2500000", transferType: 2, dapp: LONG_HOST, at: now - 2_000 })
	await seedUsdQuoteAndReload(page)
	await bringToFront(page)

	// The reload's start-up navigation lands on Home and overrides a hash set before it settles, and
	// a hash Home is already on remounts nothing: Home is read where the reload lands, its rows awaited.
	for (const surface of SURFACES.filter((s) => s.name !== "the token page")) {
		if (surface.name !== "Home") await openSurface(page, surface.hash)
		const { overflowing, rows } = await readDappRows(page)
		console.log(`[rows] ${surface.name}, dApp rows: ${JSON.stringify(rows)}`)
		await shotSend(page, `dapp-rows-${surface.name.toLowerCase()}`, "tx-terminal-card")
		expect(overflowing, surface.name).toEqual([])
		for (const key of ["terminal", "nameless", "call"])
			expect(rows[key], `${surface.name}, ${key}`).toMatchObject({ lines: 1, cut: true, ellipsis: true })
		expect(rows.medium, `${surface.name}, medium`).toMatchObject({ lines: 1, cut: false })
		expect(rows.nameless.chip).toMatchObject({ text: "dApp", cut: false, below: false })
		expect(rows.terminal.chip).toMatchObject({ cut: true, width: expect.closeTo(APP_CHIP_CAP, 0) })
		expect(rows.call.chip).toMatchObject({ cut: false, below: false })
		expect(rows.transfer.cut).toBe(false)
		expect(rows.transfer.direction).toEqual({ lines: 1 })
		expect(rows.transfer.chip).toMatchObject({ cut: true, below: false })
		expect(rows.transfer.chip?.width).toBeGreaterThan(APP_CHIP_FLOOR + 0.5)
		expect(rows.transfer.chip?.width).toBeLessThan(APP_CHIP_CAP - 0.5)
		// A dApp transfer's two chips keep 10px semibold; a lone app chip takes the caps role's 11px bold.
		expect(rows.transfer.type).toEqual({ direction: "10px 600 0.8px", chip: "10px 600 0.8px" })
		expect(rows.call.type).toEqual({ direction: null, chip: "11px 700 1.1px" })
		expect(rows.nameless.type).toEqual(rows.call.type)
		// Below the popup's width a function's name takes a second line, so one whole here stays whole.
		await expectFitsNarrow(page, `${surface.name}, dApp rows`)
	}

	await navigateByHash(page, `#/popup/tx/${DAPP_TRANSFER_HASH}`)
	await expectAppValueBreaksAnywhere(page, { value: "tx-detail-app", label: "tx-detail-app-label", box: "tx-detail-box" }, LONG_HOST)
	await navigateByHash(page, `#/popup/journal/${NAMED_RECORD}`)
	await expectAppValueBreaksAnywhere(
		page,
		{ value: "journal-detail-origin", label: "journal-detail-app-label", box: "journal-detail-box" },
		JOURNAL_HOST,
	)
	const named = await readMethodRow(page, "journal-method-named", "Swap Exact Tokens For Tokens Supporting Fee On Transfer Tokens")
	// The page reads its record when it mounts, so the second record is opened from another page.
	await navigateByHash(page, "#/popup/activity")
	await page.waitForSelector(sel("journal-detail-page"), { hidden: true, timeout: 15_000 })
	await navigateByHash(page, `#/popup/journal/${NAMELESS_RECORD}`)
	const nameless = await readMethodRow(page, "journal-method-nameless", "Swapexacttokensfortokenssupportingfeeontransfertokens")
	expect(named.lines).toBeGreaterThanOrEqual(2)
	for (const row of [named, nameless]) {
		expect(row.overflow).toBeLessThanOrEqual(0.5)
		expect(row.gap).toBeGreaterThanOrEqual(16 - 0.5)
	}

	expect(listedExtensionPerTest.consoleErrors).toEqual([])
	expect(listedExtensionPerTest.pageErrors).toEqual([])
}, 180_000)

const rowHeight = (page: Page, selector: string) => page.$eval(selector, (row) => row.getBoundingClientRect().height)

test.skipIf(inject("liveLeg") === true)(
	"a default token's placeholder row, still working, stands as tall as a loaded token row",
	{ timeout: 120_000 },
	async ({ freshExtensionPerTest: ctx }) => {
		const host = await serveTokenList()
		// A node that never answers keeps the defaults working, and fails no balance read.
		const node = await startStub(() => undefined)
		const held = await interceptRpc(ctx.browser, ctx.extensionId, new URL(TESTNET_RPC_URL).origin, { kind: "redirect", to: node.url })
		try {
			host.serve(await signTestList())
			const control = await openScratchPage(ctx.browser, ctx.extensionId)
			const { pinned } = await e2eSigner()
			await control.evaluate((key: string, source: unknown) => chrome.storage.session.set({ [key]: source }), TOKEN_LIST_SOURCE_KEY, {
				url: host.url,
				publicKey: pinned.publicKey,
			})
			await createProfileAcceptingTerms(ctx)
			const seeder = await openPopup(ctx)
			await waitForHash(seeder, "#/popup/general", 30_000)
			// The list names Testnet tokens only, and a new profile starts on Mainnet.
			await switchToNetwork(seeder, "Testnet")
			await seeder.waitForSelector(SEED_WORKING, { visible: true, timeout: 30_000 })
			const loading = await rowHeight(seeder, SEED_WORKING)
			await shotSend(seeder, "home-token-rows-loading", "tokens-list")

			const scope = await readActivityScope(seeder)
			await seedTokenRow(seeder, scope, 1)
			await seeder.evaluate(
				(key: string, row: string) => chrome.storage.local.set({ [key]: row }),
				"nulo:core:token-balances@1",
				JSON.stringify({
					id: 1,
					token: 1,
					account: scope.account,
					profileId: scope.profileId,
					chainId: scope.chainId,
					contract: scope.token.contract,
					publicBalance: "2500000",
					privateBalance: "1500000",
					updatedAt: Date.now(),
				}),
			)
			// The balance service reads its token map only as it starts.
			for (const open of await ctx.browser.pages()) {
				if (open.url().startsWith(extensionUrl(ctx.extensionId, "/"))) await open.close()
			}
			await stopBackground(ctx)
			const page = await openPopup(ctx)
			await unlockAfterBackgroundDeath(page)
			await page.waitForSelector(`${sel("tokens-card")} ${sel("token-amount")}`, { visible: true, timeout: 30_000 })
			expect(await rowHeight(page, sel("tokens-card"))).toBeCloseTo(loading, 1)
			await shotSend(page, "home-token-rows-loaded", "tokens-list")
		} finally {
			await held.stop()
			await node.close()
			await host.stop()
		}
	},
)

/** Five priced sends: more than Home's middle shows at 360 × 600 and in the 900px-tall panels. */
const HOME_ROWS = Array.from({ length: 5 }, (_, i) => `0x${(0x71 + i).toString(16).repeat(32)}`)

/** The two pages whose hero stays over a scrolling middle; each names its parts `<page>-hero`, `-scroller`, `-scroll-shadow`. */
type PinnedPage = "home" | "token"
/** The token row the token page opens on: the scope's token, which every seeded row moves. */
const TOKEN_PAGE_ID = 1

type PinnedLayout = {
	heroTop: number
	scrollTop: number
	maxScroll: number
	shadow: string
	navBottom: number
	viewport: number
}

function readPinned(page: Page, kind: PinnedPage): Promise<PinnedLayout> {
	return page.evaluate((k: string) => {
		const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement
		const scroller = q(`${k}-scroller`)
		return {
			heroTop: q("balance-amount").getBoundingClientRect().top,
			scrollTop: scroller.scrollTop,
			maxScroll: scroller.scrollHeight - scroller.clientHeight,
			shadow: getComputedStyle(q(`${k}-scroll-shadow`)).opacity,
			navBottom: q("bottom-nav").getBoundingClientRect().bottom,
			viewport: window.innerHeight,
		}
	}, kind)
}

/** Scrolls the page's middle and waits for the scroll to land and the shadow's fade to finish. */
async function scrollPinned(page: Page, kind: PinnedPage, top: number, shadow: "0" | "1"): Promise<PinnedLayout> {
	await page.$eval(sel(`${kind}-scroller`), (el, y) => el.scrollTo(0, y as number), top)
	await page
		.waitForFunction(
			(s: string, o: string) => getComputedStyle(document.querySelector(s) as Element).opacity === o,
			{ timeout: 5_000, polling: 50 },
			sel(`${kind}-scroll-shadow`),
			shadow,
		)
		.catch(async (error: unknown) => {
			throw new Error(`the shadow never read ${shadow} at ${top}: ${JSON.stringify(await readPinned(page, kind))}; ${String(error)}`)
		})
	return readPinned(page, kind)
}

/** A popup draws its scrim where it is mounted, and a row's review sheet mounts in the middle: the
 *  scrim must still cover the hero and the nav, as it does on every other page. */
function scrimCovers(page: Page, kind: PinnedPage): Promise<{ hero: boolean; nav: boolean }> {
	return page.$eval(sel(`${kind}-scroller`), (scroller) => {
		const scrim = document.createElement("div")
		scrim.style.cssText = "position: absolute; inset: 0; z-index: 400"
		scroller.firstElementChild?.append(scrim)
		const on = (testid: string) => {
			const box = document.querySelector(`[data-testid="${testid}"]`)?.getBoundingClientRect()
			return box !== undefined && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === scrim
		}
		const covers = { hero: on("balance-amount"), nav: on("bottom-nav") }
		scrim.remove()
		return covers
	})
}

test("Home's hero stays fixed over a scrolling middle: a scrim drawn in the middle still covers it; the shadow shows only once the middle has scrolled and lets a press through to the row under it; a tall panel keeps the nav at its bottom; PageDown on a row scrolls the middle", async ({
	listedExtensionPerTest,
	skip,
}) => {
	skipUnlessListPrices(skip)
	const page = await openPopup(listedExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page, { priced: true })
	const now = Date.now()
	for (const [i, hash] of HOME_ROWS.entries()) await seedTransaction(page, scope, { hash, amount: "1500000", at: now - i * 1_000 })
	await seedTokenRow(page, scope, TOKEN_PAGE_ID)
	await seedUsdQuoteAndReload(page, scope.token.priceId)
	await bringToFront(page)
	await waitForHomeReminders(page)
	await settledRows(page, HOME_ROWS.length)

	const rest = await scrollPinned(page, "home", 0, "0")
	console.log(`[rows] Home at rest: ${JSON.stringify(rest)}`)
	expect(await scrimCovers(page, "home")).toEqual({ hero: true, nav: true })
	await shotSend(page, "home-rest", "home-hero")
	const scrolled = await scrollPinned(page, "home", 200, "1")
	console.log(`[rows] Home scrolled: ${JSON.stringify(scrolled)}`)
	expect(scrolled.scrollTop).toBe(Math.min(200, rest.maxScroll))
	expect(scrolled.scrollTop).toBeGreaterThan(0)
	expect(Math.abs(scrolled.heroTop - rest.heroTop)).toBeLessThanOrEqual(0.5)

	// A row centred in the shadow's band: the band draws over it, and a press there still opens it.
	const band = await page.$eval(sel("home-scroll-shadow"), (el) => {
		const b = el.getBoundingClientRect()
		return { top: b.top, bottom: b.bottom }
	})
	const target = await page.$eval(
		sel("home-scroller"),
		(scroller, y) => {
			const row = scroller.querySelector('[data-testid="tx-card"]') as HTMLElement
			const box = row.getBoundingClientRect()
			scroller.scrollTop += box.top + box.height / 2 - (y as number)
			const after = row.getBoundingClientRect()
			const x = after.left + 72
			const hit = document.elementFromPoint(x, y as number)?.closest('[data-testid="tx-card"]')
			return { x, hash: row.getAttribute("data-tx-hash"), hit: hit === row }
		},
		(band.top + band.bottom) / 2,
	)
	expect(target.hit).toBe(true)
	await scrollPinned(page, "home", await page.$eval(sel("home-scroller"), (el) => el.scrollTop), "1")
	await shotSend(page, "home-scrolled", "home-hero")
	await page.mouse.click(target.x, (band.top + band.bottom) / 2)
	await waitForHashPrefix(page, `#/popup/tx/${target.hash}`)

	await page.evaluate(() => history.back())
	await waitForHash(page, "#/popup/general", 10_000)
	for (const width of [360, 480]) {
		await setViewport(page, { width, height: 900 })
		await settledRows(page, HOME_ROWS.length)
		const top = await scrollPinned(page, "home", 0, "0")
		const end = await scrollPinned(page, "home", top.maxScroll, "1")
		console.log(`[rows] Home at ${width} × 900: ${JSON.stringify({ top, end })}`)
		expect(end.scrollTop).toBeGreaterThan(0)
		expect(Math.abs(end.heroTop - top.heroTop)).toBeLessThanOrEqual(0.5)
		expect(Math.abs(end.navBottom - end.viewport)).toBeLessThanOrEqual(0.5)
	}

	await setViewport(page, { width: 360, height: 600 })
	await settledRows(page, HOME_ROWS.length)
	await scrollPinned(page, "home", 0, "0")
	await page.$eval(`${sel("tx-card")} [data-row-target]`, (el) => (el as HTMLElement).focus())
	const before = await page.$eval(sel("home-scroller"), (el) => el.scrollTop)
	await page.keyboard.press("PageDown")
	await page
		.waitForFunction(
			(s: string, b: number) => (document.querySelector(s) as HTMLElement).scrollTop > b,
			{ timeout: 5_000, polling: 50 },
			sel("home-scroller"),
			before,
		)
		.catch(async (error: unknown) => {
			throw new Error(
				`PageDown from a row left the middle at ${before}: ${JSON.stringify(await readPinned(page, "home"))}; ${String(error)}`,
			)
		})

	await navigateByHash(page, `#/popup/tokens/${TOKEN_PAGE_ID}`)
	await page.waitForSelector(sel("token-scroller"), { visible: true, timeout: 15_000 })
	await settledRows(page, HOME_ROWS.length)
	const tokenTop = await scrollPinned(page, "token", 0, "0")
	expect(tokenTop.maxScroll, `the activity must overflow at 360 × 600: ${JSON.stringify(tokenTop)}`).toBeGreaterThan(0)
	expect(await scrimCovers(page, "token")).toEqual({ hero: true, nav: true })
	const tokenEnd = await scrollPinned(page, "token", tokenTop.maxScroll, "1")
	console.log(`[rows] the token page at 360 × 600: ${JSON.stringify({ tokenTop, tokenEnd })}`)
	expect(tokenEnd.scrollTop).toBeGreaterThan(0)
	expect(Math.abs(tokenEnd.heroTop - tokenTop.heroTop)).toBeLessThanOrEqual(0.5)

	expect(listedExtensionPerTest.consoleErrors).toEqual([])
	expect(listedExtensionPerTest.pageErrors).toEqual([])
}, 240_000)
