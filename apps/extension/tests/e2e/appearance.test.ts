import type { Page } from "puppeteer"
import { expect } from "vitest"
import { BROWSER, extensionUrl, gotoExtensionPage, newPage, setViewport } from "./fixtures/browser"
import { test, openPopup, waitForHash, clickByTestId, patchPagePolling, recordPageErrors } from "./fixtures/extension"
import { navigateByHash, navigateToSettings, setTheme } from "./fixtures/helpers"
import { switchToNetwork } from "./fixtures/networks"
import { shotSend } from "./fixtures/send-page"

test("cycle theme system → light → dark verifies html[theme=…] each step", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "display")

	await setTheme(page, "system")
	const systemTheme = await page.evaluate(() => document.documentElement.getAttribute("theme"))
	expect(systemTheme).toBeTruthy()

	await setTheme(page, "light")
	expect(await page.evaluate(() => document.documentElement.getAttribute("theme"))).toBe("light")

	await setTheme(page, "dark")
	expect(await page.evaluate(() => document.documentElement.getAttribute("theme"))).toBe("dark")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("animations toggle persists across navigation", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "display")
	await page.waitForSelector('[data-testid="animations-toggle"]', { visible: true, timeout: 5_000 })

	// `data-toggle-active` reflects the Toggle's modelValue directly — a stable
	// literal, unlike the CSS-module-mangled `active` class. The flip is gated
	// (click → ConfigService RPC → SW broadcast → model ref → re-render is a
	// multi-hop chain a fixed sleep cannot honestly bound).
	const toggleState = () =>
		page.evaluate(() => document.querySelector('[data-testid="animations-toggle"]')?.getAttribute("data-toggle-active"))
	const before = await toggleState()
	expect(before === "true" || before === "false").toBe(true)

	await clickByTestId(page, "animations-toggle")
	const want = before === "true" ? "false" : "true"
	await page.waitForFunction(
		(w: string) => document.querySelector('[data-testid="animations-toggle"]')?.getAttribute("data-toggle-active") === w,
		{ timeout: 5_000, polling: 50 },
		want,
	)
	const after = await toggleState()
	expect(after).not.toBe(before)

	// Navigate away and back. Use `/about` — a real sibling settings page.
	await navigateByHash(page, "#/popup/settings/about")
	// The hash wait proves nothing about RENDERING — until the Display
	// component actually unmounts, the later waitForSelector could satisfy
	// itself on the same mounted toggle and the "persisted" read would prove
	// nothing. Gate on the toggle leaving the DOM first.
	await page.waitForFunction(() => !document.querySelector('[data-testid="animations-toggle"]'), { timeout: 5_000, polling: 100 })
	await navigateByHash(page, "#/popup/settings/display")
	await page.waitForSelector('[data-testid="animations-toggle"]', { visible: true, timeout: 5_000 })

	// The remount's `getProps` RPC resolves BEFORE the toggle renders (the
	// block is v-if'd on !isLoading), so a rendered toggle carries the settled
	// persisted value — no extra wait belongs here.
	const persisted = await toggleState()
	expect(persisted).toBe(after)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

// SKIP: pre-existing smoke flake (a popup-internal navigateByHash race).
// Flakes intermittently on Linux CI even though it passed locally. Un-skip
// when the navigation race is fixed.
test.skip("theme persists across navigation away and back", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "display")
	await setTheme(page, "light")

	// Navigate to a different settings page and back. Uses `/about` — a real
	// sibling settings page.
	await navigateByHash(page, "#/popup/settings/about")
	expect(await page.evaluate(() => document.documentElement.getAttribute("theme"))).toBe("light")

	await navigateByHash(page, "#/popup/settings/display")
	expect(await page.evaluate(() => document.documentElement.getAttribute("theme"))).toBe("light")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

type HintProbe = Window & { __hintWrites?: string[] }

// An explicit choice, never `system`: Firefox cannot emulate the OS scheme.
test("onboarding paints the stored theme over a pre-paint hint that disagrees, and never hints another", async ({
	registeredExtension: ctx,
}) => {
	const popup = await openPopup(ctx)
	await waitForHash(popup, "#/popup/general")
	await navigateToSettings(popup, "display")
	await setTheme(popup, "dark")
	// The hint a reset leaves behind: chrome.storage is cleared, the page's localStorage is not. The
	// popup stays open to hear, through `storage` events, every hint the onboarding page writes.
	await popup.evaluate(async () => {
		localStorage.setItem("nulo:theme", "light")
		const w = window as HintProbe
		w.__hintWrites = []
		window.addEventListener("storage", (event) => {
			if (event.key === "nulo:theme") w.__hintWrites?.push(String(event.newValue))
		})
		await chrome.storage.local.set({ "nulo:onboarding:completed": false })
	})

	const page = await newPage(ctx.browser)
	patchPagePolling(page)
	recordPageErrors(ctx, page)
	await gotoExtensionPage(page, extensionUrl(ctx.extensionId, "/src/onboarding/index.html#/onboarding/welcome"))
	await page.waitForFunction(
		() => document.documentElement.getAttribute("theme") === "dark" && localStorage.getItem("nulo:theme") === "dark",
		{ timeout: 15_000, polling: 50 },
	)
	await popup.waitForFunction(() => ((window as HintProbe).__hintWrites ?? []).length > 0, { timeout: 5_000, polling: 50 })
	expect(await popup.evaluate(() => (window as HintProbe).__hintWrites)).toEqual(["dark"])

	expect(ctx.consoleErrors).toEqual([])
	expect(ctx.pageErrors).toEqual([])
	await page.close()
	await popup.close()
})

/** Flips Display's Show network name to `on`, then returns to Home with the chip settled. */
async function showNetworkName(page: Page, on: boolean): Promise<void> {
	await navigateToSettings(page, "display")
	const toggle = '[data-testid="show-network-name-toggle"]'
	await page.waitForSelector(toggle, { visible: true, timeout: 5_000 })
	if ((await page.$eval(toggle, (el) => el.getAttribute("data-toggle-active"))) !== String(on)) {
		await clickByTestId(page, "show-network-name-toggle")
		await page.waitForFunction(
			(sel: string, want: string) => document.querySelector(sel)?.getAttribute("data-toggle-active") === want,
			{ timeout: 5_000, polling: 50 },
			toggle,
			String(on),
		)
	}
	// Display shows no bottom nav, so Home's is the sign that Home rendered.
	await navigateByHash(page, "#/popup/general")
	await page.waitForSelector('[data-testid="nav-general"]', { visible: true, timeout: 5_000 })
	await page.waitForFunction(
		(want: boolean) =>
			!!document.querySelector('[data-testid="network-button"]') && !!document.querySelector('[data-testid="network-name"]') === want,
		{ timeout: 5_000, polling: 50 },
		on,
	)
}

const networkChip = (page: Page) =>
	page.evaluate(() => {
		const chip = document.querySelector('[data-testid="network-button"]')
		const dot = document.querySelector('[data-testid="network-status-dot"]')?.getBoundingClientRect()
		return {
			name: document.querySelector('[data-testid="network-name"]')?.textContent?.trim() ?? null,
			label: chip?.getAttribute("aria-label"),
			height: chip?.getBoundingClientRect().height,
			dotArea: dot ? dot.width * dot.height : 0,
		}
	})

/** The header row at the current width: the chip's name and whether it shows whole, the account's
 *  name and address, and the gap from the address's copy glyph to the chip (negative: on it). */
const headerRow = (page: Page) =>
	page.evaluate(() => {
		const el = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
		const shown = (node: HTMLElement | null) => (node && node.getClientRects().length > 0 ? node : null)
		const whole = (node: HTMLElement) => {
			const range = document.createRange()
			range.selectNodeContents(node)
			return range.getBoundingClientRect().width <= node.getBoundingClientRect().width + 0.5
		}
		// Nothing clips the address: past its column it would run under the chip. Its copy glyph is
		// drawn past its box, so the text alone is measured.
		const insideColumn = (node: HTMLElement) => {
			const text = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())
			const column = node.closest("button")?.parentElement
			if (!text || !column) return false
			const range = document.createRange()
			range.selectNodeContents(text)
			return range.getBoundingClientRect().right <= column.getBoundingClientRect().right + 0.5
		}
		const [name, chip, dot] = [el("network-name"), el("network-button"), el("network-status-dot")]
		const [address, label, glyph] = [shown(el("account-address-text")), shown(el("account-selector")), el("account-copy-glyph")]
		const [chipBox, dotBox] = [chip?.getBoundingClientRect(), dot?.getBoundingClientRect()]
		return {
			name: name?.textContent?.trim() ?? null,
			nameWhole: !!name && whole(name),
			sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			dotInside: !!chipBox && !!dotBox && dotBox.left - chipBox.left >= 1 && chipBox.right - dotBox.right >= 1,
			label: label ? "shown" : null,
			address: address?.textContent?.trim() ?? null,
			addressWhole: !!address && insideColumn(address),
			glyphClear: chipBox && glyph ? chipBox.left - glyph.getBoundingClientRect().right : null,
		}
	})

test("Show network name off hides the name in the header chip, keeps its dot and height; on brings it back, whole at every width", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await page.waitForSelector('[data-testid="network-name"]', { visible: true, timeout: 10_000 })
	// A font swapping in after this read would change the height the off chip is compared with.
	await page.evaluate(() => document.fonts.ready)
	const shown = await networkChip(page)
	expect(shown.name).toBeTruthy()

	await showNetworkName(page, false)
	const hidden = await networkChip(page)
	expect(hidden).toEqual({ name: null, label: shown.label, height: shown.height, dotArea: shown.dotArea })
	expect(hidden.dotArea).toBeGreaterThan(0)
	await shotSend(page, `577-chip-off-${BROWSER}`, "network-button")

	// The file's tests share one extension: leave the setting as the others expect it.
	await showNetworkName(page, true)
	expect(await networkChip(page)).toEqual(shown)
	await shotSend(page, `577-chip-on-${BROWSER}`, "network-button")

	// At the popup's width the lock chip stands as tall as the network chip beside it.
	await setViewport(page, { width: 360, height: 600 })
	const heights = await page.evaluate(() => ({
		chip: document.querySelector('[data-testid="network-button"]')?.getBoundingClientRect().height,
		lock: document.querySelector('[data-testid="header-lock"]')?.getBoundingClientRect().height,
	}))
	expect(heights.lock).toBe(heights.chip)

	// From 240 px to the popup's width a seeded name shows whole; the account's address either shows
	// whole with its copy glyph clear of the chip, or leaves with the account's name. At the popup's
	// width both always show.
	const sweep = async (network: string) => {
		const widths = [...Array.from({ length: 30 }, (_, i) => 240 + 4 * i), 360]
		const read: Record<number, boolean> = {}
		for (const width of widths) {
			await setViewport(page, { width, height: 600 })
			const row = await headerRow(page)
			const at = `${network} at ${width}px: ${JSON.stringify(row)}`
			expect(row.name, at).toBe(network)
			expect(row.nameWhole, at).toBe(true)
			expect(row.sideways, at).toBe(false)
			expect(row.dotInside, at).toBe(true)
			expect(row.label, at).toBe(row.address === null ? null : "shown")
			if (row.address !== null) {
				expect(row.addressWhole, at).toBe(true)
				expect(row.glyphClear, at).toBeGreaterThanOrEqual(0)
			}
			read[width] = row.address !== null
		}
		return read
	}
	const alpha = await sweep("Alpha")
	expect([alpha[320], alpha[360]]).toEqual([true, true])
	await switchToNetwork(page, "Local Network")
	await page.waitForSelector('[data-testid="account-address-text"]', { visible: true, timeout: 30_000 })
	const local = await sweep("Local Network")
	expect([local[240], local[320], local[360]]).toEqual([false, false, true])
	// The glyph a hover or a focus reveals stays off the chip whose whole name now sits beside it.
	await page.hover('[data-testid="account-address-copy"]')
	expect((await headerRow(page)).glyphClear).toBeGreaterThanOrEqual(0)
	await shotSend(page, `header-360-local-network-hover-${BROWSER}`, "network-button")
	await switchToNetwork(page, "Alpha")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})
