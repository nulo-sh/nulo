/**
 * Firefox's sidebar loads the popup shell as a `sidebar` view, not as the toolbar panel a Mac closes
 * under the OS passkey prompt, so a passkey step started there runs in place. The ceremony needs the
 * sidebar focused, and any privileged read would take that focus: until the session lands, outcomes
 * are read from a control page opened beforehand. Both sidebars Firefox draws are driven, since a
 * profile may come up with either.
 */
import type { Browser } from "puppeteer"
import { describe, expect } from "vitest"
import { FIREFOX_ONLY, isFirefox } from "./fixtures/browser"
import { inPageRealm, sessionAuthenticator } from "./fixtures/browser/firefox"
import { clickInSidebar, evaluateInSidebar, openSidebar, type SidebarKind } from "./fixtures/browser/firefox-sidebar"
import { clickByTestId, openPopup, test, waitForHash } from "./fixtures/extension"
import { readPasskeySurface, registerPasskeyProfile, watchPasskeySurface } from "./fixtures/passkey"
import { pollUntil } from "./fixtures/poll"
import { readSessionRow, waitForSessionRow } from "./fixtures/session"

const GETS = "__nuloE2eCredentialGets"

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
})
