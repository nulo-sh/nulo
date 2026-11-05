/**
 * Firefox's sidebar loads the popup shell as a `sidebar` view, not as the toolbar panel a Mac closes
 * under the OS passkey prompt, so a passkey step started there runs in place. The ceremony needs the
 * sidebar focused, and any privileged read would take that focus: until the session lands, outcomes
 * are read from a control page opened beforehand. Both sidebars Firefox draws are driven, since a
 * profile may come up with either. With "Open as Side Panel" on, the toolbar button opens the
 * sidebar instead of the popup.
 */
import type { Browser, Page } from "puppeteer"
import { describe, expect } from "vitest"
import { extensionUrl, FIREFOX_ONLY, gotoExtensionPage, isFirefox, newPage, stopBackground } from "./fixtures/browser"
import { inPageRealm, sessionAuthenticator } from "./fixtures/browser/firefox"
import { CONFIG_STORAGE_KEY } from "@/wallet/config/config"
import {
	actionPopupShows,
	clickInActionPopup,
	evaluateInActionPopup,
	openActionPopup,
	triggerToolbarAction,
	waitForOpenPanel,
} from "./fixtures/browser/firefox-action-popup"
import {
	clickInSidebar,
	closeSidebar,
	evaluateInSidebar,
	openSidebar,
	type SidebarKind,
	setSidebarKind,
	sidebarShows,
} from "./fixtures/browser/firefox-sidebar"
import { ensureUnlocked } from "./fixtures/auth"
import { clickByTestId, openPopup, test, waitForHash } from "./fixtures/extension"
import { readPasskeySurface, registerPasskeyProfile, watchPasskeySurface } from "./fixtures/passkey"
import { pollUntil } from "./fixtures/poll"
import { readSessionRow, waitForSessionRow } from "./fixtures/session"

const GETS = "__nuloE2eCredentialGets"
const DISPLAY = "#/popup/settings/display"
const TOGGLE = "side-panel-toggle"

/** The side-panel setting as the worker stored it. */
const storedSidePanel = (control: Page) =>
	control.evaluate(async (key: string) => {
		const raw = (await chrome.storage.local.get(key))[key]
		return typeof raw === "string" ? (JSON.parse(raw) as { sidePanel?: boolean }).sidePanel : undefined
	}, CONFIG_STORAGE_KEY)

const until = <T>(read: () => Promise<T>, done: (value: T) => boolean, label: string) =>
	pollUntil(read, done, { label, timeoutMs: 15_000, intervalMs: 250 })

/** The popup Firefox's toolbar button opens: `""` for none, so the click goes to the background. */
const toolbarPopup = (control: Page) => control.evaluate(() => chrome.action.getPopup({}))
const MANIFEST_POPUP = "/src/popup/index.html#/popup/general"

/** What the toolbar button opened: both surfaces, read as soon as either shows. */
const toolbarOpened = (browser: Browser) =>
	until(
		async () => ({ sidebar: await sidebarShows(browser), popup: await actionPopupShows(browser) }),
		(shown) => shown.sidebar || shown.popup,
		"a surface the toolbar button opened",
	)

type Evaluate = <T>(body: string) => Promise<T>

/** Opens Display in a document reached by frame script: once its services answer, since a page still
 *  starting routes itself to Home, and from its own realm, as the app's links do. */
async function openDisplay(evaluate: Evaluate, where: string): Promise<void> {
	const ready = `return !!content.document.querySelector('[data-session-checked="true"]') && !!content.document.querySelector('[data-service-ready="true"]');`
	await until(
		() => evaluate<boolean>(ready).catch(() => false),
		(on) => on,
		`${where} ready`,
	)
	await evaluate(inPageRealm(`location.hash = ${JSON.stringify(DISPLAY)}; return true;`))
	const row = `return !!content.document.querySelector('[data-testid="${TOGGLE}"]');`
	await until(
		() => evaluate<boolean>(row).catch(() => false),
		(shown) => shown,
		`the side-panel row in ${where}`,
	)
}

/** On `hash` with the session checked and the services ready, so its controls answer. */
const sidebarOn = (browser: Browser, hash: string) =>
	pollUntil(
		() =>
			evaluateInSidebar<boolean>(
				browser,
				`const doc = content.document;
				return content.location.hash === ${JSON.stringify(hash)} && !!doc.querySelector('[data-session-checked="true"]') && !!doc.querySelector('[data-service-ready="true"]');`,
			).catch(() => false),
		(on) => on,
		{ label: `the sidebar on ${hash}`, timeoutMs: 30_000, intervalMs: 250 },
	)

describe.skipIf(!isFirefox)(FIREFOX_ONLY.sidebar, () => {
	test.for(["default", "revamped"] satisfies SidebarKind[])(
		"a passkey unlock started in the %s sidebar runs in place",
		async (kind, { freshExtensionPerTest: ctx }) => {
			const { browser } = ctx
			const control = await openPopup(ctx)
			const authenticator = await sessionAuthenticator(browser)
			try {
				await registerPasskeyProfile(control)
				const { profile } = await waitForSessionRow(control, () => true)
				await clickByTestId(control, "header-lock")
				await waitForHash(control, "#/popup/auth", 15_000)

				await openSidebar(browser, kind)
				await sidebarOn(browser, "#/popup/auth")
				await evaluateInSidebar(
					browser,
					inPageRealm(`
					const credentials = navigator.credentials;
					const get = credentials.get;
					window.${GETS} = 0;
					credentials.get = function (options) {
						window.${GETS}++;
						return get.call(credentials, options);
					};`),
				)
				expect(await readSessionRow(control)).toBeUndefined()
				await watchPasskeySurface(control)

				await clickInSidebar(browser, "auth-submit")
				await waitForSessionRow(control, (row) => row.profile === profile)
				expect((await readPasskeySurface(control))?.windowsOpened).toBe(0)

				await sidebarOn(browser, "#/popup/general")
				expect(await evaluateInSidebar<number>(browser, inPageRealm(`return window.${GETS};`))).toBe(1)
			} finally {
				await authenticator.cleanup()
			}
		},
	)

	test.for(["default", "revamped"] satisfies SidebarKind[])(
		"in the %s sidebar, with the side-panel setting on the toolbar button toggles the sidebar, and with it off opens the popup",
		async (kind, { registeredExtensionPerTest: ctx }) => {
			const { browser } = ctx
			await setSidebarKind(browser, kind)
			let control = await openPopup(ctx)

			await openActionPopup(browser)
			await openDisplay((body) => evaluateInActionPopup(browser, body), "the toolbar panel")
			await clickInActionPopup(browser, TOGGLE)
			await until(
				() => sidebarShows(browser),
				(open) => open,
				"the sidebar the row opened",
			)
			await until(
				() => storedSidePanel(control),
				(on) => on === true,
				"the setting stored on",
			)
			await until(
				() => actionPopupShows(browser),
				(open) => !open,
				"the toolbar panel closing once stored",
			)
			await until(
				() => toolbarPopup(control),
				(popup) => popup === "",
				"the toolbar popup cleared",
			)

			// Firefox keeps the cleared popup while it runs, not the background: the click has to wake one.
			await closeSidebar(browser)
			await control.close()
			await stopBackground(ctx)
			await triggerToolbarAction(browser)
			expect(await toolbarOpened(browser)).toEqual({ sidebar: true, popup: false })
			await triggerToolbarAction(browser)
			await until(
				() => sidebarShows(browser),
				(open) => !open,
				"the sidebar a second click closed",
			)
			expect(await actionPopupShows(browser)).toBe(false)

			// Onboarding's Open wallet has the background open its popup, with the setting on as after a
			// restored backup: Firefox opens none while the button points at the sidebar, so the manifest's
			// comes back first, and the popup's boot points the button at the sidebar again. A background
			// that died locks the wallet, and pages follow the unlock.
			control = await openPopup(ctx)
			await ensureUnlocked(control)
			// With onboarding not yet complete, the shell keeps a known profile on the Ready route it opens on.
			await control.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": false }))
			const onboarding = await newPage(browser)
			await gotoExtensionPage(onboarding, extensionUrl(ctx.extensionId, "/src/onboarding/index.html#/onboarding/done"))
			await waitForHash(onboarding, "#/onboarding/done", 10_000)
			// Alone in its window, the page stays, and the background opens the panel over it.
			await onboarding.evaluate(async () => {
				const { id } = await chrome.windows.getCurrent()
				if ((await chrome.tabs.query({ windowId: id })).length > 1)
					await chrome.windows.create({ tabId: (await chrome.tabs.getCurrent())?.id, focused: true })
			})
			await clickByTestId(onboarding, "onboarding-done-open")
			await waitForOpenPanel(control)
			await until(
				() => toolbarPopup(control),
				(popup) => popup === "",
				"the popup pointing the button at the sidebar again",
			)
			await onboarding.close()
			await until(
				() => control.evaluate(() => chrome.extension.getViews({ type: "popup" }).length),
				(panels) => panels === 0,
				"the panel closing with its window",
			)
			await triggerToolbarAction(browser)
			expect(await toolbarOpened(browser)).toEqual({ sidebar: true, popup: false })

			await openDisplay((body) => evaluateInSidebar(browser, body), "the sidebar")
			await clickInSidebar(browser, TOGGLE)
			await until(
				() => sidebarShows(browser),
				(open) => !open,
				"the sidebar closing itself as the row turns off",
			)
			await until(
				() => storedSidePanel(control),
				(on) => on === false,
				"the setting stored off",
			)
			await until(
				() => toolbarPopup(control),
				(popup) => popup.endsWith(MANIFEST_POPUP),
				"the manifest's toolbar popup back",
			)

			await triggerToolbarAction(browser)
			expect(await toolbarOpened(browser)).toEqual({ sidebar: false, popup: true })
		},
	)
})
