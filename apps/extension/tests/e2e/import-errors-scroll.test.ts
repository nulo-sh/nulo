/**
 * The full-backup import's errors screen opens with its warning whole in view, and never rests with
 * the popup hero's title cut by the sticky bar: where the scroller's end carries the title past the
 * bar, the screen lands there; otherwise it scrolls only as far as the warning needs. Real layout,
 * so both browsers: the popup at its 360x600 size, onboarding at the launcher's window. Both shells
 * then name the unrestored network where they report it: the line a failed Retry leaves, the popup's
 * error viewer and onboarding's notice.
 *
 * A synthetic backup. Its local-chain item names a sender and the local seed is refused, so a
 * Retry is offered (four footer buttons, a three-line warning); an item on a chain no seed serves
 * is dropped and recorded, which beside it adds the "review the details" clause (four lines) and
 * alone leaves no Retry (three buttons).
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { restoreNoticeText, restoreWarningText, retryResultText } from "@/components/composite/import/restore-warning"
import { LOCAL_L1_CHAIN_ID } from "@/utils/chain-ids"
import { interceptRpc, prepareClick, prepareKeys } from "./fixtures/browser"
import { editorText, readEditorStyles } from "./fixtures/code-editor"
import { clickByTestId, launchExtension, test } from "./fixtures/extension"
import {
	buildSyntheticBackup,
	deriveNuloAccountAddress,
	gotoOnboardingImport,
	gotoPopupImport,
	makeRecoveryTriple,
	ONBOARDING_IMPORT_SHELL,
	POPUP_IMPORT_SHELL,
	submitFullBackupImport,
	TEST_PASSWORD,
	writeBackupToTemp,
} from "./helpers/import-drivers"

const LOCAL_RPC = process.env.VITE_LOCAL_NETWORK_RPC_URL ?? "http://localhost:8080"

type Items = "local" | "custom" | "both"

async function backupFile(items: Items): Promise<string> {
	const { masterBase64, entropyBase64 } = await makeRecoveryTriple()
	const address = await deriveNuloAccountAddress(masterBase64, LOCAL_L1_CHAIN_ID)
	const local = { networkId: "syn-local", chainId: 0, senders: [{ address }], contracts: [] }
	const custom = { networkId: "syn-custom", chainId: 424242, senders: [{ address }], contracts: [] }
	const accountState = items === "local" ? [local] : items === "custom" ? [custom] : [custom, local]
	const backup = buildSyntheticBackup({
		masterBase64,
		entropyBase64,
		accountAddress: address,
		extraData: { "account-state": accountState },
	})
	return writeBackupToTemp(backup, `${items}.json`)
}

async function onErrorsScreen(items: Items, surface: "popup" | "onboarding", fn: (page: Page) => Promise<void>): Promise<void> {
	const file = await backupFile(items)
	const profileDir = mkdtempSync(join(tmpdir(), "nulo-errors-scroll-"))
	const ctx = await launchExtension({ userDataDir: profileDir })
	let armed: Awaited<ReturnType<typeof interceptRpc>> | undefined
	try {
		armed = await interceptRpc(ctx.browser, ctx.extensionId, LOCAL_RPC, { kind: "refuse" })
		const page = surface === "popup" ? await gotoPopupImport(ctx) : await gotoOnboardingImport(ctx)
		await submitFullBackupImport(page, file, TEST_PASSWORD, surface === "popup" ? POPUP_IMPORT_SHELL : ONBOARDING_IMPORT_SHELL)
		await page.waitForSelector('[data-testid="import-full-backup-continue-btn"]', { visible: true, timeout: 90_000 })
		await fn(page)
	} finally {
		await armed?.stop()
		try {
			await ctx.close()
		} finally {
			rmSync(profileDir, { recursive: true, force: true })
		}
	}
}

/** Reads until the scroll position holds still, so a measurement sees where the open landed. */
async function settledScrollTop(page: Page): Promise<number> {
	const read = () =>
		page.evaluate(() => {
			const scroller = document.querySelector('[data-testid="collapsing-hero-scroller"]')
			return scroller ? scroller.scrollTop : (document.scrollingElement?.scrollTop ?? 0)
		})
	let last = await read()
	for (let i = 0; i < 20; i++) {
		await new Promise((r) => setTimeout(r, 100))
		const now = await read()
		if (now === last) return now
		last = now
	}
	return last
}

/** Edges in viewport px on the popup's errors screen. */
async function popupLanding(page: Page) {
	const scrollTop = await settledScrollTop(page)
	return {
		scrollTop,
		...(await page.evaluate(() => {
			const edges = (testId: string) => {
				const r = (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement).getBoundingClientRect()
				return { top: r.top, bottom: r.bottom }
			}
			const scroller = document.querySelector('[data-testid="collapsing-hero-scroller"]') as HTMLElement
			return {
				barBottom: edges("collapsing-hero-header").bottom,
				viewBottom: scroller.getBoundingClientRect().top + scroller.clientHeight,
				title: edges("collapsing-hero-title"),
				accent: edges("collapsing-hero-accent"),
				warning: edges("import-full-backup-warning"),
				warningText: document.querySelector('[data-testid="import-full-backup-warning"]')?.textContent ?? "",
				retryShown: !!document.querySelector('[data-testid="import-full-backup-retry-btn"]'),
			}
		})),
	}
}

type Landing = Awaited<ReturnType<typeof popupLanding>>

async function textOf(page: Page, testId: string, timeout = 10_000): Promise<string> {
	const shown = await page.waitForFunction(
		(id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.trim() || false,
		{ timeout, polling: 100 },
		testId,
	)
	return (await shown.jsonValue()) as string
}

/** The editor element focus rests on, through the shadow roots it crosses. */
const deepFocus = (page: Page) =>
	page.evaluate(() => {
		let el = document.activeElement
		while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
		return el?.classList.contains("cm-content") ? "editor" : (el?.getAttribute("data-testid") ?? el?.tagName ?? "none")
	})

/**
 * The inline JSON viewer, in its shadow root: styled; a token the mouse selects is exactly what a
 * copy carries (a selection CodeMirror failed to read would copy nothing, or the whole line); and the popup's
 * focus trap keeps the editor in its Tab cycle.
 */
async function expectViewerUsable(page: Page): Promise<void> {
	expect(await readEditorStyles(page, "json-editor")).toEqual({ display: "flex", fontSize: "14px", scrollbarWidth: "none" })
	// The popup animates in, and a drag measured mid-motion ends lines below where it aimed.
	await page.waitForFunction(
		() => {
			const box = document.querySelector('[data-testid="json-editor"]')?.getBoundingClientRect()
			if (!box) return false
			const w = window as unknown as { __viewerBox?: string; __viewerStill?: number }
			const key = `${box.left},${box.top},${box.width},${box.height}`
			w.__viewerStill = key === w.__viewerBox ? (w.__viewerStill ?? 0) + 1 : 0
			w.__viewerBox = key
			return w.__viewerStill >= 5
		},
		{ timeout: 10_000, polling: "raf" },
	)
	const token = await page.evaluate(() => {
		const lines = document.querySelector('[data-testid="json-editor"]')?.shadowRoot?.querySelectorAll(".cm-line") ?? []
		for (const line of lines) {
			const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const text = node.textContent ?? ""
				if (text.length < 4 || text !== text.trim() || text === (line.textContent ?? "").trim()) continue
				const range = document.createRange()
				range.setStart(node, 0)
				range.setEnd(node, 1)
				const first = range.getBoundingClientRect()
				range.setStart(node, text.length - 1)
				range.setEnd(node, text.length)
				const last = range.getBoundingClientRect()
				return { text, y: first.top + first.height / 2, from: first.left + 1, to: last.right - 1 }
			}
		}
		return null
	})
	if (!token) throw new Error("the viewer rendered no token to select")
	await prepareClick(page)
	await page.mouse.move(token.from, token.y)
	await page.mouse.down()
	await page.mouse.move(token.to, token.y, { steps: 5 })
	await page.mouse.up()
	// A dispatched copy needs no user activation or clipboard permission; CodeMirror fills its data
	// from the selection it read, as on a real copy.
	const copied = await page.evaluate(() => {
		const content = document.querySelector('[data-testid="json-editor"]')?.shadowRoot?.querySelector(".cm-content")
		if (!content) return null
		const copy = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, composed: true, cancelable: true })
		content.dispatchEvent(copy)
		return copy.clipboardData?.getData("text/plain") ?? null
	})
	expect(copied).toBe(token.text)

	await prepareKeys(page)
	expect(await deepFocus(page)).toBe("editor")
	await page.keyboard.press("Tab")
	const stops = [await deepFocus(page)]
	// The popup's controls, and a snack's, if one is up, come before the cycle closes.
	while (stops.length < 4 && stops.at(-1) !== "editor") {
		await page.keyboard.press("Tab")
		stops.push(await deepFocus(page))
	}
	expect(stops[0]).not.toBe("editor")
	expect(stops.at(-1), `Tab comes back round to the editor: ${stops.join(" → ")}`).toBe("editor")
}

/** Presses Retry with the local node still refused and returns the line the failed Retry leaves. */
async function failedRetryLine(page: Page): Promise<string> {
	await clickByTestId(page, "import-full-backup-retry-btn")
	// A Retry is one more tail: 45 s at most, plus margin.
	return textOf(page, "import-full-backup-retry-result", 90_000)
}

/** Scroll offsets snap to whole device pixels, so a nearest scroll can leave an edge up to half a
 *  pixel past the view (a four-line warning at 96.2 lands at 96). */
function expectWarningWhole(l: Landing): void {
	expect(l.warning.top).toBeGreaterThanOrEqual(l.barBottom - 0.5)
	expect(l.warning.bottom).toBeLessThanOrEqual(l.viewBottom + 0.5)
}

test("one network to retry: the open lands at the scroller's end, the title above the bar's bottom edge", {
	timeout: 180_000,
	retry: 0,
}, async () => {
	await onErrorsScreen("local", "popup", async (page) => {
		const l = await popupLanding(page)
		expect(l.retryShown).toBe(true)
		expect(l.warningText).toContain(restoreWarningText(["Local Network"], false))
		expectWarningWhole(l)
		// `scrollHeight` is a whole pixel and the end need not be: the end is where the browser stops a
		// scroll past it.
		const end = await page.evaluate(() => {
			const scroller = document.querySelector('[data-testid="collapsing-hero-scroller"]') as HTMLElement
			scroller.scrollTop = scroller.scrollHeight
			return scroller.scrollTop
		})
		expect(l.scrollTop).toBe(end)
		expect(l.title.bottom).toBeLessThanOrEqual(l.barBottom)

		expect(await failedRetryLine(page)).toBe(retryResultText(["Local Network"]))
		await clickByTestId(page, "import-full-backup-view-errors-btn")
		expect(await editorText(page, "json-editor")).toMatch(/"network": "Local Network",\s*"networkId": "[0-9a-f]{8}"/)
		await expectViewerUsable(page)
	})
})

test("a network to retry beside another error: the title and the accent bar both land under the bar", {
	timeout: 180_000,
	retry: 0,
}, async () => {
	await onErrorsScreen("both", "popup", async (page) => {
		const l = await popupLanding(page)
		expect(l.retryShown).toBe(true)
		expect(l.warningText).toContain(restoreWarningText(["Local Network"], true))
		expectWarningWhole(l)
		expect(l.title.bottom).toBeLessThanOrEqual(l.barBottom)
		expect(l.accent.bottom).toBeLessThanOrEqual(l.barBottom)
	})
})

test("another error only, no Retry: the hero stays whole", { timeout: 180_000, retry: 0 }, async () => {
	await onErrorsScreen("custom", "popup", async (page) => {
		const l = await popupLanding(page)
		expect(l.retryShown).toBe(false)
		expect(l.warningText).toContain(restoreWarningText([], true))
		expectWarningWhole(l)
		expect(l.title.top).toBeGreaterThanOrEqual(l.barBottom)
	})
})

test("onboarding: the page does not scroll, the warning already in view", { timeout: 180_000, retry: 0 }, async () => {
	await onErrorsScreen("local", "onboarding", async (page) => {
		expect(await settledScrollTop(page)).toBe(0)
		const warning = await page.evaluate(() => {
			const r = (document.querySelector('[data-testid="import-full-backup-warning"]') as HTMLElement).getBoundingClientRect()
			return { top: r.top, bottom: r.bottom, viewport: window.innerHeight }
		})
		expect(warning.top).toBeGreaterThanOrEqual(0)
		expect(warning.bottom).toBeLessThanOrEqual(warning.viewport)

		expect(await failedRetryLine(page)).toBe(retryResultText(["Local Network"]))
		await clickByTestId(page, "import-full-backup-view-errors-btn")
		expect(await textOf(page, "notification-description")).toBe(restoreNoticeText(["Local Network"]))
	})
})
