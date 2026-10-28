import type { Page } from "puppeteer"
import { expect } from "vitest"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import {
	deleteNetworkRow,
	enableDeveloperMode,
	navigateToSettings,
	selectedAccount,
	setDeveloperMode,
	switchToNetwork,
	waitForSelectedAccount,
} from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"
import { waitForToast } from "./fixtures/widgets"
import { pointerClick } from "./helpers/legal-drivers"

// Scope note: `addNetwork` probes RPC, `addFpc` probes PXE, `addToken`
// fetches metadata — all require a live Aztec node. Persistence-style
// CRUD (add → reopen → delete) lives in the network suite. Here we
// cover what's reachable on a non-network harness: form validation,
// popup UX, and `deleteNetwork` (storage-only, no probing).

const switchNames = (page: Page) =>
	page.$$eval('[data-testid="network-row-switch"]', (els) => els.map((el) => el.getAttribute("data-network-name")))

/** Presses the named row's Switch with a real pointer, as `pick` picks it, and waits for the chip to name it. */
async function pressSwitch(page: Page, name: string, pick: { last?: boolean } = {}): Promise<void> {
	const names = await switchNames(page)
	expect(pick.last ? names.at(-1) : names[0]).toBe(name)
	await pointerClick(page, "network-row-switch", pick)
	await page.waitForFunction(
		(target: string) => document.querySelector('[data-testid="network-button"]')?.textContent?.trim() === target,
		{ timeout: 15_000, polling: 100 },
		name,
	)
}

/** The points of Testnet's row, on its midline and on its bottom hairline, that do not reach its link,
 *  outside its Switch; and its Switch's centre when that does not reach the Switch. */
const testnetRowMisses = (page: Page) =>
	page.evaluate(() => {
		const link = document.querySelector('[data-testid="network-row"][data-network-name="Testnet"]') as HTMLElement
		const control = document.querySelector('[data-testid="network-row-switch"][data-network-name="Testnet"]') as HTMLElement
		const row = link.getBoundingClientRect()
		const box = control.getBoundingClientRect()
		const name = (el: Element | null) => el?.getAttribute("data-testid") ?? el?.tagName ?? "nothing"
		const inSwitch = (x: number, y: number) => x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1
		// Whole pixels: Firefox lays out in 1/60 px, so a fractional edge is not a point to sample.
		const xs = Array.from({ length: Math.floor(row.right) - Math.ceil(row.left) - 1 }, (_, i) => Math.ceil(row.left) + 1 + i)
		const points = [Math.floor(row.top + row.height / 2), Math.ceil(row.bottom) - 1].flatMap((y) => xs.map((x) => [x, y] as const))
		const misses = points
			.filter(([x, y]) => !inSwitch(x, y) && document.elementFromPoint(x, y) !== link)
			.map(([x, y]) => `${x},${y} ${name(document.elementFromPoint(x, y))}`)
		const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
		return centre && control.contains(centre) ? misses : [...misses, `Switch centre ${name(centre)}`]
	})

test("networks page lists the default networks; an inactive row's Switch activates it in place", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	// A vitest retry reuses the profile a previous attempt may have left on another network.
	const chip = await page.waitForFunction(() => document.querySelector('[data-testid="network-button"]')?.textContent?.trim() || false, {
		timeout: 15_000,
		polling: 200,
	})
	if ((await chip.jsonValue()) !== "Alpha V6") await switchToNetwork(page, "Alpha V6")
	await navigateToSettings(page, "networks")
	await page.waitForSelector('[data-testid="network-row"]', { visible: true, timeout: 5_000 })

	const rows = await page.$$('[data-testid="network-row"]')
	expect(rows.length).toBeGreaterThanOrEqual(2)
	// Each row has both id and name attributes (the selector contract)
	for (const row of rows) {
		const id = await row.evaluate((el) => el.getAttribute("data-network-id"))
		const name = await row.evaluate((el) => el.getAttribute("data-network-name"))
		expect(id).toBeTruthy()
		expect(name).toBeTruthy()
	}

	// A new profile starts on Alpha V6; each other row carries a Switch, and every point of a row
	// outside its Switch still opens the row (a hit-test, which no component test can run).
	expect(await switchNames(page)).toEqual(["Testnet", "Local Network"])
	expect(await testnetRowMisses(page)).toEqual([])
	await shotSend(page, "networks-list-switch", "network-row-switch")

	const start = await selectedAccount(page)
	expect(start).toBeTruthy()
	await pressSwitch(page, "Testnet")
	await waitForToast(page, "Active network updated", 10_000, { kind: "success" })
	const testnet = await page.evaluate(() => {
		const row = document.querySelector('[data-testid="network-row"][data-network-name="Testnet"]')
		return [!!row?.querySelector('[data-testid="network-active-dot"]'), !!row?.querySelector('[data-testid="network-active-badge"]')]
	})
	expect(testnet).toEqual([true, true])
	expect(await switchNames(page)).toEqual(["Local Network", "Alpha V6"])
	expect(await page.evaluate(() => window.location.hash)).toBe("#/popup/settings/networks")
	await waitForSelectedAccount(page, (address) => !!address && address !== start, "the Switch: Testnet's account is selected", 30_000)

	await pressSwitch(page, "Alpha V6", { last: true })
	await waitForSelectedAccount(page, (address) => address === start, "the Switch back: the first account is selected again", 30_000)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("Add network is a Developer-Mode surface; endpoint management of a built-in network is not", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	// Explicit OFF: a vitest retry reuses the profile a previous attempt may have switched on.
	await setDeveloperMode(page, false)
	await navigateToSettings(page, "networks")
	await page.waitForSelector('[data-testid="network-row"]', { visible: true, timeout: 5_000 })
	expect(await page.$('[data-testid="network-new-btn"]')).toBeNull()
	// A built-in network's endpoints stay editable with Developer Mode off.
	await page.click('[data-testid="network-row"]')
	await page.waitForSelector('[data-testid="endpoint-add-btn"]', { visible: true, timeout: 5_000 })

	await enableDeveloperMode(page)
	await navigateToSettings(page, "networks")
	await page.waitForSelector('[data-testid="network-new-btn"]', { visible: true, timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewNetworkPopup keeps submit disabled with empty name", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await enableDeveloperMode(page)
	await navigateToSettings(page, "networks")
	await clickByTestId(page, "network-new-btn")
	await page.waitForSelector('[data-testid="new-network-submit"]', { visible: true, timeout: 5_000 })

	// Default RPC is prefilled, but name is empty → submit disabled
	const disabledBeforeName = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="new-network-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabledBeforeName).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewNetworkPopup flags a duplicate name", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await enableDeveloperMode(page)
	await navigateToSettings(page, "networks")

	// Read the first existing network's name from the row contract
	const existingName = await page.evaluate(() => {
		const row = document.querySelector('[data-testid="network-row"]') as HTMLElement | null
		return row?.getAttribute("data-network-name") ?? null
	})
	expect(existingName).toBeTruthy()

	await clickByTestId(page, "network-new-btn")
	await page.waitForSelector('[data-testid="network-name-input"]', { visible: true, timeout: 5_000 })

	await replaceInputValue(page, '[data-testid="network-name-input"]', existingName as string)

	// Submit must remain disabled because the duplicate-check trips
	const disabled = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="new-network-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabled).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("delete network row via confirm popup", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	// Read the active chain name from the header globe BEFORE we
	// navigate — the detail-page delete flow guards against deleting the
	// active network. Pick any other row.
	const activeName =
		(await page.evaluate(() => document.querySelector('[data-testid="network-button"]')?.textContent?.trim() ?? "")) || ""

	await navigateToSettings(page, "networks")
	await page.waitForSelector('[data-testid="network-row"]', { visible: true, timeout: 5_000 })

	const candidate = await page.evaluate((active: string) => {
		const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="network-row"]')]
		for (const row of rows) {
			const name = row.getAttribute("data-network-name") ?? ""
			if (name && name !== active) return { name }
		}
		return null
	}, activeName)
	expect(candidate).toBeTruthy()

	const beforeCount = (await page.$$('[data-testid="network-row"]')).length
	await deleteNetworkRow(page, candidate!.name)
	const afterCount = (await page.$$('[data-testid="network-row"]')).length
	expect(afterCount).toBe(beforeCount - 1)

	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewFpcPopup keeps submit disabled with no inputs", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "fpcs")
	// fpcs list may or may not be present; the new-btn always is on this page
	await page.waitForSelector('[data-testid="fpc-new-btn"]', { visible: true, timeout: 10_000 })
	await clickByTestId(page, "fpc-new-btn")
	await page.waitForSelector('[data-testid="new-fpc-submit"]', { visible: true, timeout: 5_000 })

	const disabled = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="new-fpc-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabled).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewFpcPopup invalid hex address surfaces inline warning", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "fpcs")
	await clickByTestId(page, "fpc-new-btn")
	await page.waitForSelector('[data-testid="fpc-address-input"]', { visible: true, timeout: 5_000 })

	await replaceInputValue(page, '[data-testid="fpc-name-input"]', "Test FPC")
	await replaceInputValue(page, '[data-testid="fpc-address-input"]', "not-a-hex-address")

	// Inline "Invalid FPC address" warning surfaces (no testid yet — assert
	// via the submit-disabled side effect, which is the actual contract).
	const disabled = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="new-fpc-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabled).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("manage-fpcs page renders the synthetic Public Fee Juice anchor row", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "fpcs")
	// On a non-network harness the protocol FPCs aren't auto-discovered (no
	// PXE), but the synthetic row is rendered in the page itself and must
	// always be present at the top.
	await page.waitForSelector('[data-fpc-id="public-fj"]', { visible: true, timeout: 5_000 })

	const synthetic = await page.evaluate(() => {
		const row = document.querySelector('[data-fpc-id="public-fj"]') as HTMLElement | null
		return {
			present: !!row,
			synthetic: row?.getAttribute("data-fpc-synthetic"),
			editBtn: !!row?.querySelector('[data-testid="fpc-edit-btn"]'),
			deleteBtn: !!row?.querySelector('[data-testid="fpc-delete-btn"]'),
		}
	})
	expect(synthetic.present).toBe(true)
	expect(synthetic.synthetic).toBe("public-fj")
	expect(synthetic.editBtn).toBe(false)
	expect(synthetic.deleteBtn).toBe(false)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewTokenPopup invalid contract surfaces error-text", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "tokens")
	await clickByTestId(page, "token-import-btn")
	await page.waitForSelector('[data-testid="token-address-input"]', { visible: true, timeout: 5_000 })

	await replaceInputValue(page, '[data-testid="token-address-input"]', "not-hex")
	await page.waitForSelector('[data-testid="error-text"]', { visible: true, timeout: 3_000 })
	const importDisabled = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="import-token-button"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(importDisabled).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})
