import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import {
	type AnsweredRequests,
	extensionUrl,
	gotoExtensionPage,
	isFirefox,
	newPage,
	openScratchPage,
	prepareKeys,
	reloadExtensionPage,
	setViewport,
	viewportOf,
} from "./fixtures/browser"
import {
	actionPopupShows,
	clickInActionPopup,
	evaluateInActionPopup,
	openActionPopup,
	waitForOpenPanel,
} from "./fixtures/browser/firefox-action-popup"
import {
	clickByTestId,
	type ExtensionContext,
	expectNoNameField,
	openOnboarding,
	openPopup,
	replaceInputValue,
	test,
	waitForHash,
} from "./fixtures/extension"
import { passPhraseCheck, readProfileNames, readRecoveryWords, revealSeedPhrase, selectedAccount } from "./fixtures/helpers"
import { setupPasskeyVirtualAuth } from "./fixtures/passkey"
import { pollUntil } from "./fixtures/poll"
import { waitForPopupClosed } from "./fixtures/popups"
import { shotSend } from "./fixtures/send-page"
import { focusRing, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"
import {
	interceptHealth,
	PRESTO_DETAILED_HEALTH,
	PRESTO_HTTP_HEALTH_URL,
	PRESTO_HTTPS_HEALTH_URL,
	PRESTO_MINIMAL_HEALTH,
} from "./fixtures/presto"

const TEST_PASSWORD = "OnboardingTest_!23"

const tabsInWindow = (page: Page) =>
	page.evaluate(async () => (await chrome.tabs.query({ windowId: (await chrome.windows.getCurrent()).id })).length)

const phraseSavedFlags = (page: Page) =>
	page.evaluate(async () =>
		Object.entries(await chrome.storage.local.get(null))
			.filter(([key]) => key.startsWith("nulo:ui:getStartedPhraseSaved@"))
			.map(([, value]) => value),
	)

async function readyPhraseLine(page: Page): Promise<{ unsaved: string; line: string | null }> {
	const settled = await page.waitForFunction(
		() => document.querySelector('[data-testid="onboarding-done-page"]')?.getAttribute("data-phrase-unsaved") ?? null,
		{ timeout: 10_000, polling: 100 },
	)
	const line = await page.evaluate(
		() => document.querySelector('[data-testid="onboarding-done-phrase-unsaved"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null,
	)
	return { unsaved: (await settled.jsonValue()) as string, line }
}

const onboardingCompleted = (control: Page) =>
	control.evaluate(async () => (await chrome.storage.local.get("nulo:onboarding:completed"))["nulo:onboarding:completed"])

/** The popup over a wallet whose setup waits in its tab, its sentence and button shown: a tab on
 *  Chrome, the toolbar panel on Firefox. */
async function openSetupPopup(extension: ExtensionContext) {
	const button = "register-setup-tab-btn"
	if (isFirefox) {
		await openActionPopup(extension.browser)
		await pollUntil(
			() =>
				evaluateInActionPopup<boolean>(extension.browser, `return !!content.document.querySelector('[data-testid="${button}"]');`),
			(shown) => shown,
			{ label: "the panel's Go to the tab", timeoutMs: 15_000, intervalMs: 200 },
		)
		return {
			isOpen: () => actionPopupShows(extension.browser),
			press: () => clickInActionPopup(extension.browser, button),
			closed: () =>
				pollUntil(
					() => actionPopupShows(extension.browser),
					(open) => !open,
					{
						label: "the panel closed",
						timeoutMs: 10_000,
						intervalMs: 100,
					},
				),
		}
	}
	const page = await newPage(extension.browser)
	await gotoExtensionPage(page, extensionUrl(extension.extensionId, "/src/popup/index.html"))
	await page.waitForSelector(`[data-testid="${button}"]`, { visible: true, timeout: 15_000 })
	return {
		isOpen: async () => !page.isClosed(),
		press: () => clickByTestId(page, button),
		closed: () => waitForPopupClosed(page, 10_000),
	}
}

describe("onboarding tab", () => {
	test("welcome screen renders both CTAs", async ({ freshExtensionPerTest: extension }) => {
		const page = await openOnboarding(extension)
		await page.waitForSelector('[data-testid="onboarding-welcome-create"]', { visible: true })
		await page.waitForSelector('[data-testid="onboarding-welcome-import"]', { visible: true })

		// Pins the a11y decision: app.vue#shell is the page's single `<main>` landmark;
		// OnboardingPage renders a `<div>` to avoid nesting. A future refactor swapping
		// the wrapper to `<main>` / `<section>` would fail this assertion immediately.
		const mainCount = await page.evaluate(() => document.querySelectorAll("main").length)
		expect(mainCount).toBe(1)

		await page.close()
	})

	test("the focused method tab shows a ring in the page colour inside its fill, and ArrowRight carries it to Password", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)
		await clickByTestId(page, "onboarding-welcome-create")
		await waitForHash(page, "#/onboarding/create", 10_000)
		await page.waitForSelector('[data-testid="onboarding-method-passkey"]', { visible: true })

		// Passkey comes first and is selected, so it holds the tablist's one tab stop.
		await prepareKeys(page)
		await tabTo(page, "onboarding-method-passkey")
		await shotSend(page, "onboarding-method-passkey-focused", "onboarding-method-passkey")
		const ring = { ring: "solid 2px -5px", color: await tokenColor(page, "--app-bg") }
		expect(await focusRing(page, "onboarding-method-passkey")).toEqual(ring)

		await page.keyboard.press("ArrowRight")
		await waitForFocus(page, "onboarding-method-password")
		await shotSend(page, "onboarding-method-password-focused", "onboarding-method-password")
		expect(await focusRing(page, "onboarding-method-password")).toEqual(ring)

		await page.close()
	})

	test("create + password happy path walks to done, and Open wallet closes the tab for the popup", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)
		// Short enough that the create step scrolls, so a step that kept its offset would show it.
		const viewport = viewportOf(page)
		await setViewport(page, { width: 1280, height: 480 })

		// Click create on welcome
		await clickByTestId(page, "onboarding-welcome-create")
		await waitForHash(page, "#/onboarding/create", 10_000)

		// A first run asks only how to unlock: no name field.
		await expectNoNameField(page, "onboarding-create-page", "onboarding-name-input")
		await clickByTestId(page, "onboarding-method-password")
		await replaceInputValue(page, '[data-testid="onboarding-password-input"]', TEST_PASSWORD)
		await replaceInputValue(page, '[data-testid="onboarding-password-confirm"]', TEST_PASSWORD)
		const scrolled = await page.evaluate(() => {
			const doc = document.scrollingElement as Element
			doc.scrollTop = doc.scrollHeight
			return doc.scrollTop
		})
		expect(scrolled).toBeGreaterThan(0)

		// The hint row hides in place while the wallet is created: the confirm field keeps its place in the
		// document (read with the scroll, which clamps at the bottom and would hide a shift on screen). The
		// observer reads it when the button first says so, before the key derivation can finish.
		const confirmTop = await page.$eval(
			'[data-testid="onboarding-password-confirm"]',
			(el) => el.getBoundingClientRect().top + (document.scrollingElement?.scrollTop ?? 0),
		)
		await page.evaluate(() => {
			const button = document.querySelector('[data-testid="onboarding-submit-create"]')
			const field = document.querySelector('[data-testid="onboarding-password-confirm"]')
			const atCreating = new Promise<number>((resolve, reject) => {
				setTimeout(() => reject(new Error("the create button never read Creating...")), 15_000)
				new MutationObserver((_, observer) => {
					if (!button?.textContent?.includes("Creating...") || !field) return
					observer.disconnect()
					resolve(field.getBoundingClientRect().top + (document.scrollingElement?.scrollTop ?? 0))
				}).observe(document.body, { childList: true, subtree: true, characterData: true })
			})
			Object.assign(window, { __confirmTopAtCreating: atCreating })
		})
		await clickByTestId(page, "onboarding-submit-create")
		expect(await page.evaluate(() => (window as unknown as { __confirmTopAtCreating: Promise<number> }).__confirmTopAtCreating)).toBe(
			confirmTop,
		)

		// A password wallet sees its words before Ready, from the top of the step.
		await page.waitForSelector('[data-testid="onboarding-phrase-saved"]', { visible: true, timeout: 30_000 })
		expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0)
		await setViewport(page, viewport)
		expect(await readProfileNames(page)).toEqual(["Main"])
		const words = await readRecoveryWords(page, "onboarding-phrase")
		expect(words).toHaveLength(24)

		// I saved it opens the check, which asks three of those words by their position.
		await clickByTestId(page, "onboarding-phrase-saved")
		await page.waitForSelector('[data-testid="onboarding-phrase-check-page"]', { visible: true, timeout: 10_000 })
		expect(await page.$('[data-testid="onboarding-phrase-word"]')).toBeNull()
		expect(await phraseSavedFlags(page)).toEqual([])
		await passPhraseCheck(page, words)
		await waitForHash(page, "#/onboarding/done", 10_000)
		await page.waitForSelector('[data-testid="onboarding-done-open"]', { visible: true, timeout: 10_000 })
		// Read before any Settings reveal, which sets the same flag.
		expect(await phraseSavedFlags(page)).toEqual([true])
		expect(await readyPhraseLine(page)).toEqual({ unsaved: "false", line: null })

		// Back on Ready stays there: Create would offer a second profile.
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					window.addEventListener("popstate", () => resolve(), { once: true })
					history.back()
				}),
		)
		await waitForHash(page, "#/onboarding/done", 10_000)
		await page.waitForSelector('[data-testid="onboarding-done-open"]', { visible: true, timeout: 10_000 })
		expect(await page.$('[data-testid="onboarding-create-page"]')).toBeNull()
		expect(await readProfileNames(page)).toEqual(["Main"])

		// Onboarding opens beside a person's own tabs, so Open wallet closes it, then opens the popup.
		const control = await openScratchPage(extension.browser, extension.extensionId)
		if ((await tabsInWindow(page)) === 1) {
			await page.evaluate(async () => {
				await chrome.tabs.create({ windowId: (await chrome.windows.getCurrent()).id, url: "about:blank", active: false })
			})
		}
		expect(await onboardingCompleted(control)).toBeFalsy()

		await clickByTestId(page, "onboarding-done-open")
		await waitForPopupClosed(page, 15_000)
		expect(await onboardingCompleted(control)).toBe(true)
		// A toolbar popup in headless Chrome is beyond what a test can find.
		if (isFirefox) await waitForOpenPanel(control)

		// The passed check reached Home: its card opens with the phrase step checked.
		const popup = await openPopup(extension)
		await waitForHash(popup, "#/popup/general", 15_000)
		await popup.waitForSelector('[data-testid="get-started-aztec"]', { visible: true, timeout: 30_000 })
		expect(await popup.$eval('[data-testid="get-started-phrase"]', (el) => el.getAttribute("data-done"))).toBe("true")

		// The step showed the wallet's own words: Settings reveals the same ones.
		expect(await revealSeedPhrase(popup, TEST_PASSWORD)).toEqual(words)
	})

	// A real reload must keep the mark the flow wrote on its history entry, or the tab would offer
	// Create again over the wallet it just made; the reloaded Ready then reads the stored flags afresh.
	// jsdom cannot reload a document.
	test("a reload on the phrase step resumes at Ready with the one wallet and its phrase unsaved", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)
		await clickByTestId(page, "onboarding-welcome-create")
		await waitForHash(page, "#/onboarding/create", 10_000)
		await clickByTestId(page, "onboarding-method-password")
		await replaceInputValue(page, '[data-testid="onboarding-password-input"]', TEST_PASSWORD)
		await replaceInputValue(page, '[data-testid="onboarding-password-confirm"]', TEST_PASSWORD)
		await clickByTestId(page, "onboarding-submit-create")
		await page.waitForSelector('[data-testid="onboarding-phrase-saved"]', { visible: true, timeout: 30_000 })

		await reloadExtensionPage(page)
		await waitForHash(page, "#/onboarding/done")
		await page.waitForSelector('[data-testid="onboarding-done-open"]', { visible: true, timeout: 10_000 })
		expect(await readProfileNames(page)).toEqual(["Main"])
		expect(await readyPhraseLine(page)).toEqual({
			unsaved: "true",
			line: "Your recovery phrase is not saved yet. Save it from Get started on Home.",
		})
	})

	test("create + passkey shows the phrase stage, and the passkey unlocks the same wallet after a lock", async ({
		freshExtensionPerTest: extension,
	}) => {
		// Chrome keeps a virtual credential for the life of the page it was added on, so the onboarding
		// and the popup run in this one page.
		const page = await openPopup(extension)
		const auth = await setupPasskeyVirtualAuth(extension.browser, page)
		try {
			await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": false }))
			await gotoExtensionPage(page, extensionUrl(extension.extensionId, "/src/onboarding/index.html#/onboarding/welcome"))
			await clickByTestId(page, "onboarding-welcome-create")
			await waitForHash(page, "#/onboarding/create", 10_000)
			await clickByTestId(page, "onboarding-method-passkey")
			await clickByTestId(page, "onboarding-submit-create")

			await page.waitForSelector('[data-testid="onboarding-phrase-saved"]', { visible: true, timeout: 60_000 })
			const words = await readRecoveryWords(page, "onboarding-phrase")
			expect(words).toHaveLength(24)
			await clickByTestId(page, "onboarding-phrase-saved")
			await passPhraseCheck(page, words)
			await waitForHash(page, "#/onboarding/done", 10_000)
			expect(await phraseSavedFlags(page)).toEqual([true])

			// Open wallet's own write, without the tab close that would take the credential with it.
			await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": true }))
			await gotoExtensionPage(page, extensionUrl(extension.extensionId, "/src/popup/index.html#/popup/general"))
			await waitForHash(page, "#/popup/general", 15_000)
			const address = (await selectedAccount(page)) as string
			expect(address).toMatch(/^0x[0-9a-f]+$/)

			await clickByTestId(page, "header-lock")
			await waitForHash(page, "#/popup/auth", 15_000)
			await page.waitForFunction(
				() => {
					const submit = document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')
					return !!submit && !submit.disabled
				},
				{ timeout: 15_000 },
			)
			await clickByTestId(page, "auth-submit")
			await waitForHash(page, "#/popup/general", 60_000)
			expect(await selectedAccount(page)).toBe(address)
		} finally {
			await auth.cleanup()
		}
	}, 120_000)

	test("Open wallet keeps a tab that is its window's last, and opens the popup over it", async ({ freshExtensionPerTest: extension }) => {
		const control = await openScratchPage(extension.browser, extension.extensionId)
		const page = await openOnboarding(extension)
		// Firefox opens each page in a window of its own; Chrome's pages share one.
		if ((await tabsInWindow(page)) > 1) {
			await page.evaluate(async () => {
				await chrome.windows.create({ tabId: (await chrome.tabs.getCurrent())?.id, focused: true })
			})
		}
		expect(await tabsInWindow(page)).toBe(1)
		await page.evaluate(() => {
			window.location.hash = "#/onboarding/done"
		})
		await waitForHash(page, "#/onboarding/done", 10_000)

		await clickByTestId(page, "onboarding-done-open")
		await control.waitForFunction(
			async () => (await chrome.storage.local.get("nulo:onboarding:completed"))["nulo:onboarding:completed"] === true,
			{ timeout: 10_000, polling: 100 },
		)
		if (isFirefox) await waitForOpenPanel(control)
		// A page that closes itself does so 50 ms after the background's answer.
		await new Promise((resolve) => setTimeout(resolve, 1_000))
		expect(page.isClosed()).toBe(false)
	})

	test("the harness answers each page's health probes as that page armed them, before any TLS handshake", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)
		const other = await openScratchPage(extension.browser, extension.extensionId)
		const answered = await interceptHealth(page, { https: { status: 200, body: PRESTO_MINIMAL_HEALTH }, http: "refused" })
		// A body outside ASCII proves both drivers send the bytes `JSON.stringify` names, as UTF-8.
		const otherBody = { ...PRESTO_DETAILED_HEALTH, note: "präsent ✓" }
		const otherAnswered = await interceptHealth(other, { https: { status: 200, body: otherBody }, http: "refused" })
		const bodyOf = (from: Page) => from.evaluate(async (url) => (await fetch(url)).json(), PRESTO_HTTPS_HEALTH_URL)

		expect(await bodyOf(page)).toEqual(PRESTO_MINIMAL_HEALTH)
		expect(await bodyOf(other)).toEqual(otherBody)
		const refused = await page.evaluate(
			async (url) =>
				fetch(url).then(
					() => "answered",
					(err: unknown) => (err instanceof TypeError ? "rejected" : String(err)),
				),
			PRESTO_HTTP_HEALTH_URL,
		)
		expect(refused).toBe("rejected")
		const hitsOf = async (of: AnsweredRequests) => [await of.hits(PRESTO_HTTPS_HEALTH_URL), await of.hits(PRESTO_HTTP_HEALTH_URL)]
		expect(await hitsOf(answered)).toEqual([1, 1])
		expect(await hitsOf(otherAnswered)).toEqual([1, 0])
		await other.close()
		await page.close()
	})

	// Only a real browser closes a popup and moves tab focus: the component layer stubs both. The first
	// press finds no setup tab and opens one; the second, with another tab active in the setup tab's
	// window and the setup tab away from the closing popup's neighbour, brings that tab forward. Chrome
	// keeps the popup document in a tab; Firefox drives the toolbar panel itself.
	test("before setup is finished the popup stays open on the setup tab's button, which brings that tab forward", async ({
		freshExtensionPerTest: extension,
	}) => {
		const control = await openScratchPage(extension.browser, extension.extensionId)
		await control.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": false }))
		const trackedTab = () =>
			control.evaluate(async () => {
				const id = (await chrome.storage.session.get("nulo:onboarding:tab-id"))["nulo:onboarding:tab-id"]
				return typeof id === "number" ? { id, active: (await chrome.tabs.get(id)).active } : null
			})
		// The browser's own tab list: Firefox's BiDi can leave a tab, or its URL, unannounced for good.
		const oneSetupTab = () =>
			pollUntil(
				() =>
					control.evaluate(async () => {
						const setupDocument = chrome.runtime.getURL("src/onboarding/index.html")
						return (await chrome.tabs.query({})).filter((tab) => tab.url?.startsWith(setupDocument)).length
					}),
				(count) => count === 1,
				{ label: "one setup tab", timeoutMs: 10_000, intervalMs: 100 },
			)
		const press = async (what: string) => {
			const popup = await openSetupPopup(extension)
			// A popup that closes itself as it renders reads as a crash.
			await new Promise((resolve) => setTimeout(resolve, 1_000))
			expect(await popup.isOpen(), `the popup closed by itself before the press that ${what}`).toBe(true)
			await popup.press()
			await popup.closed()
			return pollUntil(trackedTab, (tab) => tab?.active === true, {
				label: `the setup tab the press ${what}, active`,
				timeoutMs: 10_000,
				intervalMs: 100,
			})
		}

		const opened = await press("opens the tab")
		await oneSetupTab()

		const activeBefore = await control.evaluate(async (id: number) => {
			await chrome.tabs.move(id, { index: 0 })
			// Firefox opens the setup tab in a window of its own, where the control page's tab is not.
			const { windowId } = await chrome.tabs.get(id)
			await chrome.tabs.create({ windowId, url: "about:blank", active: true })
			return (await chrome.tabs.get(id)).active
		}, opened?.id as number)
		expect(activeBefore).toBe(false)
		const focused = await press("brings it forward")
		expect(focused?.id).toBe(opened?.id)
		await oneSetupTab()
	})
})
