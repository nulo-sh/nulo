import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { extensionUrl, gotoExtensionPage, isFirefox, newPage, openScratchPage, prepareKeys, waitForTarget } from "./fixtures/browser"
import { clickByTestId, expectNoNameField, openOnboarding, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { readProfileNames } from "./fixtures/helpers"
import { waitForPopupClosed } from "./fixtures/popups"
import { shotSend } from "./fixtures/send-page"
import { focusRing, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"
import { interceptHealth, PRESTO_HTTPS_HEALTH_URL, PRESTO_MINIMAL_HEALTH } from "./fixtures/presto"

const TEST_PASSWORD = "OnboardingTest_!23"

const tabsInWindow = (page: Page) =>
	page.evaluate(async () => (await chrome.tabs.query({ windowId: (await chrome.windows.getCurrent()).id })).length)

const onboardingCompleted = (control: Page) =>
	control.evaluate(async () => (await chrome.storage.local.get("nulo:onboarding:completed"))["nulo:onboarding:completed"])

/** Read from another extension page, which moves no focus, as reading inside the panel would. Firefox
 *  loads the popup's document before the panel opens, and only the open panel gives it focus. */
const waitForOpenPanel = (control: Page) =>
	control.waitForFunction(
		() => {
			const views = chrome.extension.getViews({ type: "popup" })
			return views.length === 1 && views[0].document.hasFocus()
		},
		{ timeout: 10_000, polling: 100 },
	)

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
		const viewport = page.viewport()
		await page.setViewport({ width: 1280, height: 480 })

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

		await clickByTestId(page, "onboarding-submit-create")

		await waitForHash(page, "#/onboarding/done", 30_000)
		await page.waitForSelector('[data-testid="onboarding-done-open"]', { visible: true, timeout: 10_000 })
		expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0)
		if (viewport) await page.setViewport(viewport)
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
	})

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

	test("the harness can answer the HTTPS health probe before any TLS handshake", async ({ freshExtensionPerTest: extension }) => {
		const page = await openOnboarding(extension)
		await interceptHealth(page, { https: { status: 200, body: PRESTO_MINIMAL_HEALTH }, http: "refused" })
		const body = await page.evaluate(async (url) => (await fetch(url)).json(), PRESTO_HTTPS_HEALTH_URL)
		expect(body).toEqual(PRESTO_MINIMAL_HEALTH)
		await page.close()
	})

	test("popup with onboardingCompleted=false redirects to tab", async ({ freshExtensionPerTest: extension }) => {
		// Reset the flag so the redirect predicate fires.
		const setupPage = await newPage(extension.browser)
		await gotoExtensionPage(setupPage, extensionUrl(extension.extensionId, "/src/popup/index.html"))
		await setupPage.evaluate(async () => {
			await chrome.storage.local.set({ "nulo:onboarding:completed": false })
		})
		await setupPage.close()
		// Open the popup explicitly — should trigger redirect to onboarding tab.
		const popup = await newPage(extension.browser)
		const tabPromise = waitForTarget(
			extension.browser,
			(target) => target.type() === "page" && target.url().includes("src/onboarding/index.html"),
			10_000,
		)
		await gotoExtensionPage(popup, extensionUrl(extension.extensionId, "/src/popup/index.html"))

		// The redirect in register.vue's onBeforeMount opens the onboarding tab, then closes this popup;
		// both browsers honour that close.
		const tabTarget = await tabPromise
		expect(tabTarget).toBeDefined()

		const tabPage = await tabTarget.page()
		await tabPage?.close()
		if (!popup.isClosed()) await popup.close()
	})
})
