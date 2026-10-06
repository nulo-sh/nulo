import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { extensionUrl, gotoExtensionPage, isFirefox, newPage, openScratchPage, waitForTarget } from "./fixtures/browser"
import {
	withTimeoutMessage,
	clickByTestId,
	expectNoNameField,
	openOnboarding,
	replaceInputValue,
	test,
	waitForHash,
} from "./fixtures/extension"
import { readProfileNames } from "./fixtures/helpers"
import { waitForPopupClosed } from "./fixtures/popups"
import {
	interceptHealth,
	PRESTO_DETAILED_HEALTH,
	PRESTO_HTTP_HEALTH_URL,
	PRESTO_HTTPS_HEALTH_URL,
	PRESTO_MINIMAL_HEALTH,
} from "./fixtures/presto"

const TEST_PASSWORD = "OnboardingTest_!23"

async function gotoPrestoStep(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.location.hash = "#/onboarding/presto"
	})
	await waitForHash(page, "#/onboarding/presto", 10_000)
}

/** The step probes only on a click, so a test that wants a probe result has to ask for one. */
async function gotoPrestoStepAndCheck(page: Page): Promise<void> {
	await gotoPrestoStep(page)
	await clickByTestId(page, "onboarding-presto-retry")
}

const statusCardSelector = (status: string) => `[data-testid="onboarding-presto-status"][data-status="${status}"]`

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

	test("create + password happy path walks to done, and Open wallet closes the tab for the popup", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)

		// Click create on welcome
		await clickByTestId(page, "onboarding-welcome-create")
		await waitForHash(page, "#/onboarding/create", 10_000)

		// A first run asks only how to unlock: no name field.
		await expectNoNameField(page, "onboarding-create-page", "onboarding-name-input")
		await replaceInputValue(page, '[data-testid="onboarding-password-input"]', TEST_PASSWORD)
		await replaceInputValue(page, '[data-testid="onboarding-password-confirm"]', TEST_PASSWORD)

		await clickByTestId(page, "onboarding-submit-create")

		// Wait for the bootstrap to finish + route to /learn
		await waitForHash(page, "#/onboarding/learn", 30_000)
		expect(await readProfileNames(page)).toEqual(["Main"])

		// Continue from learn routes into the fee-juice explainer step. Skip on
		// learn routes straight to /presto — covered by the dedicated skip test below.
		await clickByTestId(page, "onboarding-learn-continue")
		await waitForHash(page, "#/onboarding/fees", 10_000)

		// Continue from /fees → /presto. Skip on /fees routes to the same
		// destination (the explainer is short; no value in a dedicated
		// skip-to-done shortcut).
		await clickByTestId(page, "onboarding-fees-continue")
		await waitForHash(page, "#/onboarding/presto", 10_000)

		// The step rests until asked. After the check it settles on a terminal status; Continue
		// only renders when proving can go native, otherwise Skip routes directly to /done.
		await clickByTestId(page, "onboarding-presto-retry")
		const settled = await withTimeoutMessage(
			page
				.waitForFunction(
					() => {
						const s = document.querySelector('[data-testid="onboarding-presto-status"]')?.getAttribute("data-status")
						return s && s !== "idle" && s !== "detecting" ? s : null
					},
					{ timeout: 20_000, polling: 200 },
				)
				.then((handle) => handle.jsonValue()),
			async () => {
				const seen = await page
					.evaluate(
						() => document.querySelector('[data-testid="onboarding-presto-status"]')?.getAttribute("data-status") ?? "<absent>",
					)
					.catch(() => "<unreadable>")
				return `onboarding presto step never settled within 20s (last: ${seen})`
			},
		)
		if (settled === "available" || settled === "downloading") {
			await clickByTestId(page, "onboarding-presto-continue")
		} else {
			await clickByTestId(page, "onboarding-presto-skip")
		}
		await waitForHash(page, "#/onboarding/done", 10_000)

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

	test("presto available renders the connected card and an enabled Continue", async ({ freshExtensionPerTest: extension }) => {
		const page = await openOnboarding(extension)
		// A healthy HTTPS Presto whose cached versions include the wallet's Aztec line.
		await interceptHealth(page, { https: { status: 200, body: PRESTO_DETAILED_HEALTH }, http: "refused" })
		await gotoPrestoStepAndCheck(page)

		await page.waitForSelector(statusCardSelector("available"), { visible: true, timeout: 10_000 })
		const state = await page.evaluate(() => {
			const btn = document.querySelector<HTMLButtonElement>('[data-testid="onboarding-presto-continue"]')
			return {
				rendered: !!btn,
				disabled: btn?.disabled ?? null,
				skip: !!document.querySelector('[data-testid="onboarding-presto-skip"]'),
			}
		})
		expect(state).toEqual({ rendered: true, disabled: false, skip: false })

		await page.close()
	})

	test("skip links on /learn and /fees both route to /presto (split-handler pin)", async ({ freshExtensionPerTest: extension }) => {
		// Drive the two skip buttons directly: each skip is its own handler routing to
		// /presto (not /done). Without this pin, a future refactor that consolidates
		// handlers could silently fan one of them to the wrong target.
		const page = await openOnboarding(extension)

		await page.evaluate(() => {
			window.location.hash = "#/onboarding/learn"
		})
		await waitForHash(page, "#/onboarding/learn", 10_000)
		await clickByTestId(page, "onboarding-learn-skip")
		await waitForHash(page, "#/onboarding/presto", 10_000)

		await page.evaluate(() => {
			window.location.hash = "#/onboarding/fees"
		})
		await waitForHash(page, "#/onboarding/fees", 10_000)
		await clickByTestId(page, "onboarding-fees-skip")
		await waitForHash(page, "#/onboarding/presto", 10_000)

		await page.close()
	})

	test("the step rests on the pitch without probing; a check that finds nothing keeps the pitch; Skip routes to /done", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)
		// Both probes refused is what an uninstalled Presto looks like to the page.
		await interceptHealth(page, { https: "refused", http: "refused" })
		let probes = 0
		page.on("request", (req) => {
			if (req.url() === PRESTO_HTTPS_HEALTH_URL || req.url() === PRESTO_HTTP_HEALTH_URL) probes++
		})
		// A pitch dismissed in an earlier onboarding outlives a reset; the step must show it again.
		await page.evaluate(() => localStorage.setItem("presto:banner:card:offline", JSON.stringify({ until: "never" })))
		await gotoPrestoStep(page)

		await page.waitForSelector('[data-testid="onboarding-presto-pitch"]', { visible: true, timeout: 10_000 })
		// The card reads `detecting` for the moment it takes to learn that no earlier check reached Presto.
		await page.waitForSelector(statusCardSelector("idle"), { visible: true, timeout: 10_000 })
		const readState = () =>
			page.evaluate(() => {
				const banner = document.querySelector('[data-testid="onboarding-presto-pitch"] presto-banner')
				return {
					// The element renders its default ribbon whenever the variant attribute is missing.
					variant: banner?.getAttribute("variant"),
					cardRendered: !!banner?.shadowRoot?.querySelector(".root-card .card"),
					status: document.querySelector('[data-testid="onboarding-presto-status"]')?.getAttribute("data-status"),
					continue: !!document.querySelector('[data-testid="onboarding-presto-continue"]'),
					skip: !!document.querySelector('[data-testid="onboarding-presto-skip"]'),
				}
			})
		// A probe can raise the browser's local-network prompt, so arriving must not send one.
		expect(await readState()).toEqual({ variant: "card", cardRendered: true, status: "idle", continue: false, skip: true })
		expect(probes).toBe(0)

		await clickByTestId(page, "onboarding-presto-retry")
		await page.waitForSelector(statusCardSelector("offline"), { visible: true, timeout: 10_000 })
		expect(probes).toBeGreaterThan(0)
		expect(await readState()).toEqual({ variant: "card", cardRendered: true, status: "offline", continue: false, skip: true })

		await clickByTestId(page, "onboarding-presto-skip")
		await waitForHash(page, "#/onboarding/done", 5_000)

		await page.close()
	})

	test("HTTPS refused + a detailed HTTP body without https_port is the encrypted-connection card (https-disabled)", async ({
		freshExtensionPerTest: extension,
	}) => {
		const page = await openOnboarding(extension)
		const { https_port: _omitted, ...withoutHttpsPort } = PRESTO_DETAILED_HEALTH
		await interceptHealth(page, { https: "refused", http: { status: 200, body: withoutHttpsPort } })
		await gotoPrestoStepAndCheck(page)

		await page.waitForSelector(statusCardSelector("secure-connection-unavailable"), { visible: true, timeout: 10_000 })
		const state = await page.evaluate(() => {
			const card = document.querySelector('[data-testid="onboarding-presto-status"]')
			return {
				diagnosis: card?.getAttribute("data-diagnosis"),
				steps: card?.querySelectorAll("li").length,
				continue: !!document.querySelector('[data-testid="onboarding-presto-continue"]'),
				skip: !!document.querySelector('[data-testid="onboarding-presto-skip"]'),
			}
		})
		expect(state).toEqual({ diagnosis: "https-disabled", steps: 3, continue: false, skip: true })

		await page.close()
	})

	test("HTTPS refused + the minimal HTTP body is the presto-reachable copy", async ({ freshExtensionPerTest: extension }) => {
		const page = await openOnboarding(extension)
		await interceptHealth(page, { https: "refused", http: { status: 200, body: PRESTO_MINIMAL_HEALTH } })
		await gotoPrestoStepAndCheck(page)

		await page.waitForSelector(statusCardSelector("secure-connection-unavailable"), { visible: true, timeout: 10_000 })
		const diagnosis = await page.evaluate(
			() => document.querySelector('[data-testid="onboarding-presto-status"]')?.getAttribute("data-diagnosis") ?? null,
		)
		expect(diagnosis).toBe("presto-reachable")

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
