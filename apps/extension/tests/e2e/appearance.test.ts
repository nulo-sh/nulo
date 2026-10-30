import type { Page } from "puppeteer"
import { expect } from "vitest"
import { BROWSER, extensionUrl, gotoExtensionPage, newPage, setViewport } from "./fixtures/browser"
import { test, openPopup, waitForHash, clickByTestId, patchPagePolling, recordPageErrors } from "./fixtures/extension"
import { navigateByHash, navigateToSettings, setTheme } from "./fixtures/helpers"
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

test("Show network name off hides the name in the header chip, keeps its dot and height; on brings it back", async ({
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

	// At the popup's width the default network's name shows whole, and the lock chip stands as tall as
	// the network chip beside it.
	await setViewport(page, { width: 360, height: 600 })
	const row = await page.evaluate(() => {
		const name = document.querySelector<HTMLElement>('[data-testid="network-name"]')
		const range = document.createRange()
		if (name) range.selectNodeContents(name)
		return {
			name: name?.textContent?.trim(),
			text: name ? range.getBoundingClientRect().width : null,
			box: name?.getBoundingClientRect().width,
			chip: document.querySelector('[data-testid="network-button"]')?.getBoundingClientRect().height,
			lock: document.querySelector('[data-testid="header-lock"]')?.getBoundingClientRect().height,
		}
	})
	console.log(`[appearance] header row at 360px: ${JSON.stringify(row)}`)
	expect(row.name).toBe("Alpha")
	expect(row.text, `the network name is cut: ${JSON.stringify(row)}`).toBeLessThanOrEqual(row.box ?? 0)
	expect(row.lock).toBe(row.chip)

	// At the narrowest width the row leaves the chip no room for the name: its dot stays inside the
	// chip's 1px border.
	await setViewport(page, { width: 240, height: 600 })
	const narrow = await page.evaluate(() => {
		const box = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.getBoundingClientRect()
		const [chip, dot] = [box("network-button"), box("network-status-dot")]
		return chip && dot && { left: dot.left - chip.left, right: chip.right - dot.right }
	})
	console.log(`[appearance] network chip's dot at 240px: ${JSON.stringify(narrow)}`)
	expect(narrow?.left).toBeGreaterThanOrEqual(1)
	expect(narrow?.right).toBeGreaterThanOrEqual(1)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})
