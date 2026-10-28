/**
 * Firefox's toolbar panel as it behaves on a Mac: it closes as soon as anything else takes focus, the
 * passkey prompt and the file picker included. Every passkey step or file pick started there must
 * therefore run in a window of its own and leave nothing behind in the panel. Headless Firefox keeps
 * the panel open, so `armPanelDeath` closes it the way that focus loss would, and a WebAuthn call or
 * a file picker opened in the panel is recorded and fails the case. Outcomes are read from a control page opened beforehand, which moves
 * no focus.
 */
import type { Browser, Page, Target } from "puppeteer"
import { describe, expect } from "vitest"
import { FIREFOX_ONLY, bringToFront, isFirefox, waitForTarget } from "./fixtures/browser"
import { type SessionAuthenticator, sessionAuthenticator } from "./fixtures/browser/firefox"
import {
	armPanelDeath,
	closeActionPopup,
	evaluateInActionPopup,
	openActionPopup,
	type PanelDeath,
} from "./fixtures/browser/firefox-action-popup"
import {
	clickByTestId,
	type ExtensionContext,
	openPopup,
	patchPagePolling,
	pickFileByTestId,
	registerProfile,
	test,
	waitForHash,
	withTimeoutMessage,
} from "./fixtures/extension"
import { navigateByHash, readProfileNames, readSessionRow, waitForSelectedAccount } from "./fixtures/helpers"
import { waitForMainFrame, waitForPopupClosed } from "./fixtures/popups"
import { PollTimeoutError, pollUntil } from "./fixtures/poll"
import { refusePasskeyStep, registerPasskeyProfile } from "./fixtures/passkey"
import { downloadPasskeyBackup, FILE_PASSWORD } from "./helpers/backup-export"
import { contactsFiles, LONG_IMPORT_ROWS, longImportContacts, storedContacts } from "./helpers/contacts"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { completeResetRitual } from "./helpers/crash-truth"
import { readActiveAccount, submitEncryptedFullBackup, waitForActiveAccount, writeBackupToTemp } from "./helpers/import-drivers"
import { HANDBACK_KEY } from "@/utils/panel-handback"
import { POPUP_RETURN_FOCUS_MS } from "@/wallet/utils/toolbar-popup"

const EXPORT = "#/popup/settings/security/export/full"
const CONTACTS = "#/popup/settings/contacts"
const EXPORT_KEY = "nulo:own-window:export"
const sel = (testid: string) => `[data-testid="${testid}"]`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Where the panel is and what it says, for a failure message. */
const PANEL_STATE = `return content.location.hash + " — " + (content.document.body?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 200);`

/** Retries `body` in the panel until it returns something other than null: the panel boots and
 *  routes on its own clock. Each read is privileged and focuses a browser window, which fails a
 *  passkey prompt that opens at that moment: none may run while a passkey window is up. */
async function untilInPanel<T>(browser: Browser, body: string, what: string, timeoutMs = 30_000): Promise<T> {
	let failure = ""
	const read = async () => {
		try {
			return await evaluateInActionPopup<T | null>(browser, body)
		} catch (err) {
			failure = `: ${err instanceof Error ? err.message : String(err)}`
			return null
		}
	}
	try {
		return (await pollUntil(read, (value) => value !== null, { label: `the panel ${what}`, timeoutMs, intervalMs: 200 })) as T
	} catch (error) {
		if (!(error instanceof PollTimeoutError)) throw error
		const seen = await evaluateInActionPopup<string>(browser, PANEL_STATE).catch(() => "unreadable")
		throw new Error(`the panel never ${what}${failure} (it shows ${seen})`)
	}
}

/** On `hash` once the boot has decided, and not given up: before that, the boot can still move the
 *  panel, and a boot that gave up withholds the page's controls behind its RETRY banner. */
const panelOn = (browser: Browser, hash: string, timeoutMs?: number) =>
	untilInPanel<true>(
		browser,
		`const doc = content.document;
		return content.location.hash === ${JSON.stringify(hash)} && doc.querySelector('[data-session-checked="true"]') && !doc.querySelector('${sel("boot-outcome-banner")}') && doc.querySelector('[data-service-ready="true"]') ? true : null;`,
		`reached ${hash}`,
		timeoutMs,
	)

const routePanel = (browser: Browser, hash: string) =>
	evaluateInActionPopup<null>(browser, `content.location.hash = ${JSON.stringify(hash)}; return null;`)

const clickInPanel = (browser: Browser, testid: string) =>
	untilInPanel<true>(
		browser,
		`const el = content.document.querySelector('${sel(testid)}');
		if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return null;
		el.click();
		return true;`,
		`offered ${testid}`,
	)

/** A session write the control page saw, with how many toolbar panels were alive at that moment. */
interface SessionWrite {
	profile?: string
	popupViews: number
}

type WriteProbe = Window & { __sessionWrites?: SessionWrite[] }

async function watchSessionWrites(control: Page): Promise<void> {
	await control.evaluate(() => {
		const w = window as WriteProbe
		const listening = w.__sessionWrites !== undefined
		w.__sessionWrites = []
		if (listening) return
		chrome.storage.onChanged.addListener((changes, area) => {
			const change = changes["nulo:core:session"]
			if (area !== "session" || !change) return
			let profile: string | undefined
			try {
				profile = JSON.parse(change.newValue).profile
			} catch {}
			w.__sessionWrites?.push({ profile, popupViews: chrome.extension.getViews({ type: "popup" }).length })
		})
	})
}

/** The first session written for a profile other than `previous`. */
async function sessionOpened(control: Page, previous: string | undefined): Promise<SessionWrite> {
	const handle = await control.waitForFunction(
		(other: string | null) => (window as WriteProbe).__sessionWrites?.find((write) => write.profile && write.profile !== other) ?? null,
		{ timeout: 90_000, polling: 100 },
		previous ?? null,
	)
	return (await handle.jsonValue()) as SessionWrite
}

/** Every wallet window's route, passkey state and text, for a failure message. */
async function walletWindows(ctx: ExtensionContext): Promise<string> {
	const seen: string[] = []
	for (const target of ctx.browser.targets()) {
		if (target.type() !== "page" || !target.url().includes("/src/popup/index.html")) continue
		const page = await target.asPage().catch(() => undefined)
		const state = await page
			?.evaluate(() => {
				const passkey = document.querySelector('[data-testid="passkey-window"]')?.getAttribute("data-state") ?? "-"
				return `${location.hash} [${passkey}] ${document.body.innerText.replace(/\s+/g, " ").slice(0, 160)}`
			})
			.catch(() => undefined)
		seen.push(state ?? "unreadable")
	}
	return seen.join(" | ")
}

async function openedWindow(ctx: ExtensionContext, before: Set<Target>, urlPart: string): Promise<Page> {
	const target = await waitForTarget(ctx.browser, (t) => t.type() === "page" && !before.has(t) && t.url().includes(urlPart), 30_000)
	const page = await target.asPage()
	await waitForMainFrame(page)
	patchPagePolling(page)
	return page
}

/** Runs `run` with the open panel armed to die; a failure carries what the panel saw. */
async function withDyingPanel<T>(browser: Browser, run: (death: PanelDeath) => Promise<T>): Promise<T> {
	const death = await armPanelDeath(browser)
	try {
		return await run(death)
	} catch (err) {
		const seen = await death.record().catch(() => undefined)
		const message = err instanceof Error ? err.message : String(err)
		throw new Error(`${message}\nthe panel saw ${JSON.stringify(seen)}`, { cause: err })
	} finally {
		await death.disarm()
	}
}

/**
 * Runs a passkey step from the panel, armed to die, and returns the session it opened. `inWindow`
 * drives the passkey window when the step needs more than its first try.
 */
async function stepFromDyingPanel(
	ctx: ExtensionContext,
	control: Page,
	previous: string | undefined,
	start: () => Promise<unknown>,
	inWindow?: (win: Page) => Promise<void>,
): Promise<SessionWrite> {
	await watchSessionWrites(control)
	const before = new Set(ctx.browser.targets())
	return withDyingPanel(ctx.browser, async (death) => {
		await start()
		if (inWindow) await inWindow(await openedWindow(ctx, before, "#/windows/passkey"))
		const opened = await withTimeoutMessage(
			sessionOpened(control, previous),
			async () => `no session opened; windows: ${await walletWindows(ctx)}`,
		)
		const record = await death.record()
		expect(record.calls, "passkey and file prompts opened in the panel").toEqual([])
		expect(record.windowActiveAt, "a window took focus from the panel").toBeDefined()
		expect(opened.popupViews, "panels alive when the session opened").toBe(0)
		return opened
	})
}

/** Runs `start` in a panel armed to die and returns the window of its own the page moved to. */
async function toOwnWindow(ctx: ExtensionContext, control: Page, start: () => Promise<unknown>): Promise<Page> {
	const before = new Set(ctx.browser.targets())
	return withDyingPanel(ctx.browser, async (death) => {
		await start()
		const win = await openedWindow(ctx, before, "/src/popup/index.html")
		await control.waitForFunction(() => chrome.extension.getViews({ type: "popup" }).length === 0, { timeout: 15_000, polling: 100 })
		expect((await death.record()).calls, "passkey and file prompts opened in the panel").toEqual([])
		return win
	})
}

/** A later profile is created or imported where a person starts one: the lock screen's profile picker. */
const NEW_PROFILE_FROM_LOCK_SCREEN = ["auth-profile", "select-profile-new-btn", "register-method-passkey"]
const IMPORT_FROM_LOCK_SCREEN = ["auth-profile", "select-profile-import-btn"]

/** A passkey profile created in `page`, a window, where the step runs in the page; returns its account. */
async function createPasskeyProfile(page: Page): Promise<string> {
	const before = await readActiveAccount(page)
	await clickByTestId(page, "header-lock")
	await waitForHash(page, "#/popup/auth", 15_000)
	for (const testid of NEW_PROFILE_FROM_LOCK_SCREEN) await clickByTestId(page, testid, 15_000)
	await clickByTestId(page, "register-submit-btn")
	await waitForHash(page, "#/popup/general", 60_000)
	const account = await waitForSelectedAccount(
		page,
		(address) => !!address && address !== before,
		"the new passkey profile's account is selected",
		30_000,
		250,
	)
	return account as string
}

const windowIdOf = (page: Page) => page.evaluate(async () => (await chrome.windows.getCurrent()).id ?? -1)

/** The focused window's id, read from `control` without moving focus. */
const focusedWindow = (control: Page) => control.evaluate(async () => (await chrome.windows.getAll()).find((win) => win.focused)?.id)

const popupWindowIds = (control: Page) =>
	control.evaluate(async () => (await chrome.windows.getAll()).filter((win) => win.type === "popup").map((win) => win.id))

async function untilFocused(control: Page, focused: (id: number | undefined) => boolean): Promise<void> {
	await pollUntil(() => focusedWindow(control), focused, {
		label: "the expected window focused",
		timeoutMs: 15_000,
		intervalMs: 100,
		show: (id) => `window ${id} focused`,
	})
}

/** Until the export flow's registered window is `id`, or none when `id` is null. */
async function untilRegistered(control: Page, id: number | null): Promise<void> {
	await control.waitForFunction(
		async (key: string, want: number | null) => ((await chrome.storage.session.get(key))[key] ?? null) === want,
		{ timeout: 15_000, polling: 100 },
		EXPORT_KEY,
		id,
	)
}

type InputClickProbe = Window & { __inputClicks?: Array<{ input: HTMLInputElement; active: boolean }> }

/** Records, in the window's own realm, each input the page clicks and whether the person's press was
 *  still active then: Firefox opens a file picker only for a click that carries one. */
async function recordInputClicks(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as InputClickProbe
		w.__inputClicks = []
		const click = HTMLInputElement.prototype.click
		HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
			w.__inputClicks?.push({ input: this, active: navigator.userActivation.isActive })
			click.call(this)
		}
	})
}

/** The first recorded click: its input's type, whether it is still in the page, and its activation. */
const firstInputClick = (page: Page) =>
	page.evaluate(() => {
		const first = (window as InputClickProbe).__inputClicks?.[0]
		return first ? { type: first.input.type, connected: first.input.isConnected, active: first.active } : null
	})

type HandbackProbe = Window & { __handbacks?: unknown[] }

/** Records each write of the hand-back record, `null` for its removal. */
async function watchHandback(control: Page): Promise<void> {
	await control.evaluate((key: string) => {
		const w = window as HandbackProbe
		w.__handbacks = []
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === "session" && changes[key]) w.__handbacks?.push(changes[key].newValue ?? null)
		})
	}, HANDBACK_KEY)
}

/** The card window's return as the control page sees it, without moving focus. */
const returnState = (control: Page, windowId: number) =>
	control.evaluate(
		async (key: string, id: number) => ({
			windowOpen: (await chrome.windows.getAll()).some((win) => win.id === id),
			record: (await chrome.storage.session.get(key))[key] ?? null,
			panels: chrome.extension.getViews({ type: "popup" }).length,
			handbacks: (window as HandbackProbe).__handbacks,
		}),
		HANDBACK_KEY,
		windowId,
	)

const sessionProfile = (control: Page) =>
	control.evaluate(async () => JSON.parse((await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]).profile as string)

/** The window's running import as it shows it: the progress line's count, or null when none shows,
 *  and whether each card button is off. */
const importInWindow = (page: Page) =>
	page.evaluate((rows: number) => {
		const line = document.querySelector('[data-testid="snackbar"][data-kind="info"] [data-testid="snackbar-title"]')
		const match = new RegExp(`^Importing contacts · (\\d+) of ${rows}$`).exec(line?.textContent ?? "")
		const off = (id: string) => (document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null)?.disabled ?? null
		return { written: match ? Number(match[1]) : null, choose: off("handoff-card-choose"), cancel: off("handoff-card-cancel") }
	}, LONG_IMPORT_ROWS)

type GetProbe = Window & { __credentialGets?: Array<{ prf: boolean }> }

/** Records, in the page's own realm, whether each `credentials.get` resolved with PRF output. */
async function recordCredentialGets(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as GetProbe
		w.__credentialGets = []
		const credentials = navigator.credentials
		const get = credentials.get.bind(credentials)
		credentials.get = async (options) => {
			const credential = await get(options)
			const outputs = (
				credential as { getClientExtensionResults?: () => { prf?: { results?: { first?: ArrayBuffer } } } } | null
			)?.getClientExtensionResults?.()
			w.__credentialGets?.push({ prf: (outputs?.prf?.results?.first?.byteLength ?? 0) > 0 })
			return credential
		}
	})
}

const readCredentialGets = (page: Page) => page.evaluate(() => (window as GetProbe).__credentialGets)

/** Refuses the passkey window's first prompt; the returned step checks the window shows its failure
 *  and finishes through Try again. */
async function refuseInWindow(auth: SessionAuthenticator): Promise<(win: Page) => Promise<void>> {
	await auth.setUserVerified(false)
	return async (win) => {
		await win.waitForSelector('[data-testid="passkey-window"][data-state="failed"]', { timeout: 30_000 })
		await win.waitForSelector(sel("passkey-window-error"), { visible: true, timeout: 5_000 })
		await auth.setUserVerified(true)
		await clickByTestId(win, "passkey-window-retry")
	}
}

describe.skipIf(!isFirefox)(FIREFOX_ONLY.toolbarPanel, () => {
	test("create and unlock from the dying panel run in the passkey window", async ({ freshExtensionPerTest: ctx }) => {
		const { browser } = ctx
		const control = await openPopup(ctx)
		const auth = await sessionAuthenticator(browser)
		try {
			await registerPasskeyProfile(control)
			await clickByTestId(control, "header-lock")
			await waitForHash(control, "#/popup/auth", 15_000)

			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			for (const testid of NEW_PROFILE_FROM_LOCK_SCREEN) await clickInPanel(browser, testid)
			// Each step's first prompt is refused: the window shows its failure, and Try again finishes it.
			const created = await stepFromDyingPanel(
				ctx,
				control,
				undefined,
				() => clickInPanel(browser, "register-submit-btn"),
				await refuseInWindow(auth),
			)
			expect((await readProfileNames(control)).sort()).toEqual(["Main", "Profile 2"])
			// The service marks the profile made beside another, whichever window ran its passkey step.
			const marked = await control.evaluate(async () =>
				Object.entries(await chrome.storage.local.get(null)).filter(([key]) => key.startsWith("nulo:ui:profileNotFirst@")),
			)
			expect(marked).toEqual([[`nulo:ui:profileNotFirst@${created.profile}`, true]])

			// The popup comes back by itself once the window is done.
			await panelOn(browser, "#/popup/general")
			expect((await readSessionRow(control))?.profile).toBe(created.profile)
			await closeActionPopup(browser)

			// Locked elsewhere, a fresh panel offers the profile the dead panel created.
			await clickByTestId(control, "header-lock")
			await waitForHash(control, "#/popup/auth", 15_000)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			const offered = await untilInPanel<string>(
				browser,
				`return content.document.querySelector('${sel("auth-profile")}')?.textContent?.trim() || null;`,
				"named a profile",
			)
			expect(offered).toContain("Profile 2")

			const unlocked = await stepFromDyingPanel(
				ctx,
				control,
				undefined,
				() => clickInPanel(browser, "auth-submit"),
				await refuseInWindow(auth),
			)
			expect(unlocked.profile).toBe(created.profile)
			await panelOn(browser, "#/popup/general")
		} finally {
			await auth.cleanup()
		}
	}, 240_000)

	test("a panel that outlives the passkey prompt unlocks in place and stays the only panel", async ({ freshExtensionPerTest: ctx }) => {
		const { browser } = ctx
		const auth = await sessionAuthenticator(browser)
		try {
			await registerProfile(ctx)
			const control = await openPopup(ctx)
			await waitForHash(control, "#/popup/general")
			await createPasskeyProfile(control)
			const created = await sessionProfile(control)

			// A panel that outlives the prompt, as headless Firefox's does, unlocks in place. The
			// session is read from the page until the window is done: a read in the panel moves focus.
			await clickByTestId(control, "header-lock")
			await waitForHash(control, "#/popup/auth", 15_000)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			await watchSessionWrites(control)
			await clickInPanel(browser, "auth-submit")
			expect((await sessionOpened(control, undefined)).profile).toBe(created)
			await panelOn(browser, "#/popup/general", 60_000)
			// Once the window is gone and the return has had its time, the panel is still the only one.
			await control.waitForFunction(async () => (await chrome.windows.getAll()).every((win) => win.type !== "popup"), {
				timeout: 15_000,
				polling: 100,
			})
			await sleep(POPUP_RETURN_FOCUS_MS)
			expect(await control.evaluate(() => chrome.extension.getViews({ type: "popup" }).length)).toBe(1)
			await panelOn(browser, "#/popup/general")
		} finally {
			await auth.cleanup()
		}
	}, 300_000)

	test("export, restore and the contacts import leave the dying panel for windows of their own", async ({
		freshExtensionPerTest: ctx,
	}) => {
		const { browser } = ctx
		const control = await openPopup(ctx)
		const auth = await sessionAuthenticator(browser)
		const files = contactsFiles()
		try {
			await registerPasskeyProfile(control)

			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			const exportWindow = await toOwnWindow(ctx, control, () => routePanel(browser, EXPORT))
			await waitForHash(exportWindow, EXPORT, 60_000)
			// "Creating your backup" shows before the prompt, so only the passkey's answer proves the step ran.
			await recordCredentialGets(exportWindow)
			await refusePasskeyStep(exportWindow, auth, "agree-continue-btn")
			await clickByTestId(exportWindow, "agree-continue-btn")
			await exportWindow.waitForSelector(sel("backup-encrypt-password-input"), { visible: true, timeout: 240_000 })
			expect(await readCredentialGets(exportWindow)).toEqual([{ prf: true }])

			// A file picker takes focus as a passkey prompt does, so Import contacts leaves the panel for a
			// window that shows only the pick and hands the result back to a panel that reopens on it.
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			await routePanel(browser, CONTACTS)
			await panelOn(browser, CONTACTS)
			await clickInPanel(browser, "contacts-menu-trigger")
			const contactsWindow = await toOwnWindow(ctx, control, () => clickInPanel(browser, "contacts-menu-import"))
			await waitForHash(contactsWindow, CONTACTS, 60_000)
			await contactsWindow.waitForSelector(sel("handoff-card"), { visible: true, timeout: 15_000 })
			expect(await contactsWindow.$(sel("contacts-menu-trigger")), "the page behind the card").toBeNull()
			// The longest of the three titles; a person can drag the window as narrow as the sidebar.
			await expectFitsNarrow(contactsWindow, "the contacts card")
			const cardWindowId = await windowIdOf(contactsWindow)

			// Only a press in this window opens the picker, so the input's click must still carry it.
			// Headless Firefox cancels that picker at once, which removes its input and keeps the card.
			await recordInputClicks(contactsWindow)
			await contactsWindow.click(sel("handoff-card-choose"))
			const firstClick = await pollUntil(
				() => firstInputClick(contactsWindow),
				(click) => click !== null && !click.connected,
				{ label: "the picker's input clicked and cancelled", timeoutMs: 10_000, intervalMs: 100, show: JSON.stringify },
			)
			expect(firstClick).toEqual({ type: "file", connected: false, active: true })
			await contactsWindow.waitForSelector(sel("handoff-card-choose"), { visible: true, timeout: 5_000 })

			await watchHandback(control)
			const profile = await sessionProfile(control)
			await pickFileByTestId(contactsWindow, "handoff-card-choose", files.write(longImportContacts()))
			await contactsWindow.waitForSelector(sel("import-contact-row"), { visible: true, timeout: 15_000 })
			expect(await contactsWindow.$(sel("header-lock")), "the header, with the session open").toBeNull()
			await clickByTestId(contactsWindow, "import-contacts-submit")

			// A long import is read and written in the window, which shows its progress with both buttons
			// off; nothing is handed back, and no panel opens, while the line still counts.
			const running = await pollUntil(
				() => importInWindow(contactsWindow),
				(state) => (state.written ?? 0) > 0,
				{ label: "the window's progress line counting", timeoutMs: 30_000, intervalMs: 50, show: JSON.stringify },
			)
			expect(running).toMatchObject({ choose: true, cancel: true })
			expect(await returnState(control, cardWindowId)).toMatchObject({ windowOpen: true, record: null, panels: 0, handbacks: [] })
			expect((await importInWindow(contactsWindow)).written, "still counting after the read").toBeLessThan(LONG_IMPORT_ROWS)

			// Read from the control page before any read in the panel, which would move focus.
			const returned = await pollUntil(
				() => returnState(control, cardWindowId),
				(state) => !state.windowOpen && state.record === null && state.panels === 1,
				{
					label: "the window closed, the record consumed, one panel open",
					timeoutMs: 120_000,
					intervalMs: 100,
					show: JSON.stringify,
				},
			)
			expect(returned.handbacks).toEqual([
				{
					route: "/popup/settings/contacts",
					snack: { kind: "success", label: "Import completed successfully", profileId: profile },
				},
				null,
			])
			await panelOn(browser, CONTACTS)
			await untilInPanel<true>(
				browser,
				`return [...content.document.querySelectorAll('${sel("snackbar-title")}')].some((el) => el.textContent.includes("Import completed successfully")) || null;`,
				"showed the import's snack",
			)
			await sleep(POPUP_RETURN_FOCUS_MS)
			expect(await control.evaluate(() => chrome.extension.getViews({ type: "popup" }).length), "panels after the return").toBe(1)
			expect(await storedContacts(control)).toHaveLength(LONG_IMPORT_ROWS)
			await closeActionPopup(browser)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			await closeActionPopup(browser)

			await clickByTestId(control, "header-lock")
			await waitForHash(control, "#/popup/auth", 15_000)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			for (const testid of IMPORT_FROM_LOCK_SCREEN) await clickInPanel(browser, testid)
			const restoreWindow = await toOwnWindow(ctx, control, () => clickInPanel(browser, "import-option-full-backup"))
			await restoreWindow.waitForSelector('[data-session-checked="true"]', { timeout: 60_000 })
			await restoreWindow.waitForSelector(sel("import-full-backup-pick-file"), { visible: true, timeout: 15_000 })
			expect(await restoreWindow.evaluate(() => window.location.hash)).toMatch(/^#\/popup\/import\?option=full_backup&.*window=own/)
		} finally {
			files.cleanup()
			await auth.cleanup()
		}
	}, 360_000)

	test("a second export from the panel focuses its open window; a window that left the flow is not reused", async ({
		freshExtensionPerTest: ctx,
	}) => {
		const { browser } = ctx
		const control = await openPopup(ctx)
		const auth = await sessionAuthenticator(browser)
		try {
			await registerPasskeyProfile(control)

			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			const first = await toOwnWindow(ctx, control, () => routePanel(browser, EXPORT))
			await waitForHash(first, EXPORT, 60_000)
			const firstId = await windowIdOf(first)
			await untilRegistered(control, firstId)

			// Focus elsewhere first, so that only the second start can bring the export window forward.
			await bringToFront(control)
			await untilFocused(control, (id) => id !== undefined && id !== firstId)
			const before = new Set(browser.targets())
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			await routePanel(browser, EXPORT)
			await control.waitForFunction(() => chrome.extension.getViews({ type: "popup" }).length === 0, {
				timeout: 15_000,
				polling: 100,
			})
			await untilFocused(control, (id) => id === firstId)
			expect(await popupWindowIds(control)).toEqual([firstId])
			expect(
				browser.targets().filter((t) => !before.has(t) && t.url().includes("/src/popup/index.html")),
				"wallet pages the second start opened",
			).toEqual([])

			// Locked from the panel, the window leaves the flow through the lock screen's profile picker.
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			await clickInPanel(browser, "header-lock")
			await panelOn(browser, "#/popup/auth")
			await closeActionPopup(browser)
			await waitForHash(first, "#/popup/auth", 15_000)
			await clickByTestId(first, "auth-profile", 15_000)
			await clickByTestId(first, "select-profile-new-btn", 15_000)
			await first.waitForSelector(sel("register-method-passkey"), { visible: true, timeout: 15_000 })
			await untilRegistered(control, null)

			// Unlocked, a new start opens a new window instead of focusing the one left on profile creation.
			await clickByTestId(control, "auth-submit")
			await waitForHash(control, "#/popup/general", 60_000)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/general")
			const second = await toOwnWindow(ctx, control, () => routePanel(browser, EXPORT))
			await waitForHash(second, EXPORT, 60_000)
			const secondId = await windowIdOf(second)
			await untilRegistered(control, secondId)
			expect(secondId).not.toBe(firstId)
			expect(await focusedWindow(control)).not.toBe(firstId)
			expect((await popupWindowIds(control)).sort()).toEqual([firstId, secondId].sort())
		} finally {
			await auth.cleanup()
		}
	}, 300_000)

	// The backup chain takes 96–180 s per attempt on hosted runners, so the PR lanes skip this; it runs
	// locally and in every artifact smoke (nightly and release).
	test.skipIf(process.env.CI === "true" && process.env.NULO_E2E_ARTIFACT_RUN !== "1")(
		"a passkey profile's backup exported from the panel restores in its own window to the same address",
		{ retry: 0, timeout: 600_000 },
		async ({ freshExtensionPerTest: ctx }) => {
			const { browser } = ctx
			const auth = await sessionAuthenticator(browser)
			try {
				await registerProfile(ctx)
				const control = await openPopup(ctx)
				await waitForHash(control, "#/popup/general")
				const address = await createPasskeyProfile(control)

				await openActionPopup(browser)
				await panelOn(browser, "#/popup/general")
				const exportWindow = await toOwnWindow(ctx, control, () => routePanel(browser, EXPORT))
				await waitForHash(exportWindow, EXPORT, 60_000)
				await clickByTestId(exportWindow, "agree-continue-btn")
				const file = writeBackupToTemp(
					await downloadPasskeyBackup(exportWindow, FILE_PASSWORD, clickByTestId, 300_000),
					"passkey-backup.txt",
				)
				await clickByTestId(exportWindow, "subpage-back")
				await waitForPopupClosed(exportWindow, 10_000)

				// The source profile goes; the unrelated password profile stays, locked.
				await navigateByHash(control, "#/popup/settings/security/reset")
				await completeResetRitual(control, "#/popup/auth")
				expect(await readProfileNames(control)).toEqual(["Main"])

				await openActionPopup(browser)
				await panelOn(browser, "#/popup/auth")
				for (const testid of IMPORT_FROM_LOCK_SCREEN) await clickInPanel(browser, testid)
				const restoreWindow = await toOwnWindow(ctx, control, () => clickInPanel(browser, "import-option-full-backup"))
				// The file opens with its own password, and restores under a new passkey in that window.
				await submitEncryptedFullBackup(restoreWindow, file, FILE_PASSWORD, 300_000, "passkey")
				await waitForActiveAccount(control, address, 60_000)
				expect((await readProfileNames(control)).sort()).toEqual(["Main", "Profile 2"])
			} finally {
				await auth.cleanup()
			}
		},
	)
})
