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
	setViewport,
	viewportOf,
	waitForTarget,
} from "./fixtures/browser"
import { waitForOpenPanel } from "./fixtures/browser/firefox-action-popup"
import { clickByTestId, expectNoNameField, openOnboarding, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { readProfileNames, readRecoveryWords, revealSeedPhrase, selectedAccount } from "./fixtures/helpers"
import { setupPasskeyVirtualAuth } from "./fixtures/passkey"
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

const onboardingCompleted = (control: Page) =>
	control.evaluate(async () => (await chrome.storage.local.get("nulo:onboarding:completed"))["nulo:onboarding:completed"])

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

		await clickByTestId(page, "onboarding-submit-create")

		// A password wallet sees its words before Ready, from the top of the step.
		await page.waitForSelector('[data-testid="onboarding-phrase-saved"]', { visible: true, timeout: 30_000 })
		expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0)
		await setViewport(page, viewport)
		expect(await readProfileNames(page)).toEqual(["Main"])
		const words = await readRecoveryWords(page, "onboarding-phrase")
		expect(words).toHaveLength(24)

		await clickByTestId(page, "onboarding-phrase-saved")
		await waitForHash(page, "#/onboarding/done", 10_000)
		await page.waitForSelector('[data-testid="onboarding-done-open"]', { visible: true, timeout: 10_000 })
		// Read before any Settings reveal, which sets the same flag.
		expect(await phraseSavedFlags(page)).toEqual([true])

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

		// "I saved it" reached Home: its card opens with the phrase step checked.
		const popup = await openPopup(extension)
		await waitForHash(popup, "#/popup/general", 15_000)
		await popup.waitForSelector('[data-testid="get-started-aztec"]', { visible: true, timeout: 30_000 })
		expect(await popup.$eval('[data-testid="get-started-phrase"]', (el) => el.getAttribute("data-done"))).toBe("true")

		// The step showed the wallet's own words: Settings reveals the same ones.
		expect(await revealSeedPhrase(popup, TEST_PASSWORD)).toEqual(words)
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
			expect(await readRecoveryWords(page, "onboarding-phrase")).toHaveLength(24)
			await clickByTestId(page, "onboarding-phrase-saved")
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
		const otherAnswered = await interceptHealth(other, { https: { status: 200, body: PRESTO_DETAILED_HEALTH }, http: "refused" })
		const bodyOf = (from: Page) => from.evaluate(async (url) => (await fetch(url)).json(), PRESTO_HTTPS_HEALTH_URL)

		expect(await bodyOf(page)).toEqual(PRESTO_MINIMAL_HEALTH)
		expect(await bodyOf(other)).toEqual(PRESTO_DETAILED_HEALTH)
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
