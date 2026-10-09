/**
 * Firefox's toolbar panel as it behaves on a Mac: it closes as soon as anything else takes focus, the
 * passkey prompt included. Every passkey step started there must therefore run in a window of its
 * own and leave nothing behind in the panel. Headless Firefox keeps the panel open, so
 * `armPanelDeath` closes it the way that focus loss would, and a WebAuthn call made in the panel is
 * recorded and fails the case. Outcomes are read from a control page opened beforehand, which moves
 * no focus.
 */
import type { Browser, Page, Target } from "puppeteer"
import { describe, expect } from "vitest"
import { FIREFOX_ONLY, isFirefox, waitForTarget } from "./fixtures/browser"
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
	registerProfile,
	test,
	waitForHash,
	withTimeoutMessage,
} from "./fixtures/extension"
import { navigateByHash, readProfileNames, readSessionRow } from "./fixtures/helpers"
import { waitForMainFrame, waitForPopupClosed } from "./fixtures/popups"
import { refusePasskeyStep, registerPasskeyProfile } from "./fixtures/passkey"
import { downloadPlainPasskeyBackup } from "./helpers/backup-export"
import { completeResetRitual } from "./helpers/crash-truth"
import {
	buildSyntheticPasskeyBackup,
	readActiveAccount,
	readRegisteredPasskey,
	refusePasskeyRestore,
	submitPasskeyFullBackup,
	waitForActiveAccount,
	writeBackupToTemp,
} from "./helpers/import-drivers"
import { POPUP_RETURN_FOCUS_MS } from "@/wallet/utils/toolbar-popup"

const EXPORT = "#/popup/settings/security/export/full"
const sel = (testid: string) => `[data-testid="${testid}"]`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Where the panel is and what it says, for a failure message. */
const PANEL_STATE = `return content.location.hash + " — " + (content.document.body?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 200);`

/** Retries `body` in the panel until it returns something other than null: the panel boots and
 *  routes on its own clock. Each read is privileged and focuses a browser window, which fails a
 *  passkey prompt that opens at that moment: none may run while a passkey window is up. */
async function untilInPanel<T>(browser: Browser, body: string, what: string, timeoutMs = 30_000): Promise<T> {
	const deadline = Date.now() + timeoutMs
	let failure = ""
	for (;;) {
		try {
			const value = await evaluateInActionPopup<T | null>(browser, body)
			if (value !== null) return value
		} catch (err) {
			failure = `: ${err instanceof Error ? err.message : String(err)}`
		}
		if (Date.now() > deadline) {
			const seen = await evaluateInActionPopup<string>(browser, PANEL_STATE).catch(() => "unreadable")
			throw new Error(`the panel never ${what}${failure} (it shows ${seen})`)
		}
		await sleep(200)
	}
}

/** On `hash` once the boot has decided, and not given up: before that, the boot can still move the
 *  panel, and a boot that gave up withholds the page's controls behind its RETRY banner. */
const panelOn = (browser: Browser, hash: string, timeoutMs?: number) =>
	untilInPanel<true>(
		browser,
		`const doc = content.document;
		return content.location.hash === ${JSON.stringify(hash)} && doc.querySelector('[data-session-checked="true"]') && !doc.querySelector('${sel("boot-outcome-banner")}') && !doc.querySelector('${sel("global-loader")}') ? true : null;`,
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
		expect(record.calls, "WebAuthn calls made in the panel").toEqual([])
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
		expect((await death.record()).calls, "WebAuthn calls made in the panel").toEqual([])
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
	const handle = await page.waitForFunction(
		async (previous: string) => {
			const account = (await chrome.storage.local.get("nulo:ui:activeAccount"))["nulo:ui:activeAccount"]
			return typeof account === "string" && account !== previous ? account : null
		},
		{ timeout: 30_000, polling: 250 },
		before,
	)
	return (await handle.jsonValue()) as string
}

async function waitForEnabled(page: Page, testid: string, timeoutMs: number): Promise<void> {
	await page.waitForFunction(
		(id: string) => {
			const button = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
			return !!button && !button.disabled
		},
		{ timeout: timeoutMs, polling: 250 },
		testid,
	)
}

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

	test("import from the dying panel: a duplicate fails in the window, a deleted profile comes back", async ({
		freshExtensionPerTest: ctx,
	}) => {
		const { browser } = ctx
		const auth = await sessionAuthenticator(browser)
		try {
			await registerProfile(ctx)
			const control = await openPopup(ctx)
			await waitForHash(control, "#/popup/general")
			const address = await createPasskeyProfile(control)

			// The passkey's profile still exists, so the window fails the import after its prompt.
			await clickByTestId(control, "header-lock")
			await waitForHash(control, "#/popup/auth", 15_000)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			for (const testid of IMPORT_FROM_LOCK_SCREEN) await clickInPanel(browser, testid)
			const before = new Set(browser.targets())
			await withDyingPanel(browser, async (death) => {
				await clickInPanel(browser, "import-option-passkey")
				const win = await openedWindow(ctx, before, "#/windows/passkey")
				await win.waitForSelector('[data-testid="passkey-window"][data-state="step-failed"]', { timeout: 60_000 })
				await win.waitForSelector(sel("passkey-window-error"), { visible: true, timeout: 5_000 })
				const record = await death.record()
				expect(record.calls, "WebAuthn calls made in the panel").toEqual([])
				expect(record.windowActiveAt, "a window took focus from the panel").toBeDefined()
				await clickByTestId(win, "passkey-window-close")
				await waitForPopupClosed(win, 10_000)
			})
			await sleep(POPUP_RETURN_FOCUS_MS)
			expect(await control.evaluate(() => chrome.extension.getViews({ type: "popup" }).length)).toBe(0)
			expect((await readProfileNames(control)).sort()).toEqual(["Main", "Profile 2"])

			// Deleted, it comes back from the panel with its address. The page unlocks it first: only the
			// profile in use can be deleted.
			await clickByTestId(control, "auth-submit")
			await waitForHash(control, "#/popup/general", 60_000)
			await navigateByHash(control, "#/popup/settings/security/reset")
			await completeResetRitual(control, "#/popup/auth")
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			for (const testid of IMPORT_FROM_LOCK_SCREEN) await clickInPanel(browser, testid)
			const restored = await stepFromDyingPanel(
				ctx,
				control,
				undefined,
				() => clickInPanel(browser, "import-option-passkey"),
				await refuseInWindow(auth),
			)
			await waitForActiveAccount(control, address, 60_000)
			expect((await readProfileNames(control)).sort()).toEqual(["Main", "Profile 2"])
			// The popup comes back by itself. It must finish booting before the page locks, or its boot
			// sees the session close under it.
			await panelOn(browser, "#/popup/general")
			await closeActionPopup(browser)

			// A panel that outlives the prompt, as headless Firefox's does, unlocks in place. The
			// session is read from the page until the window is done: a read in the panel moves focus.
			await clickByTestId(control, "header-lock")
			await waitForHash(control, "#/popup/auth", 15_000)
			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			await watchSessionWrites(control)
			await clickInPanel(browser, "auth-submit")
			expect((await sessionOpened(control, undefined)).profile).toBe(restored.profile)
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

	test("export and restore leave the dying panel for windows of their own", async ({ freshExtensionPerTest: ctx }) => {
		const { browser } = ctx
		const control = await openPopup(ctx)
		const auth = await sessionAuthenticator(browser)
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
			await waitForEnabled(exportWindow, "download-backup-btn", 240_000)
			expect(await readCredentialGets(exportWindow)).toEqual([{ prf: true }])

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
			await auth.cleanup()
		}
	}, 360_000)

	test("a restore window whose passkey is refused restores on the second try", async ({ freshExtensionPerTest: ctx }) => {
		const { browser } = ctx
		const auth = await sessionAuthenticator(browser)
		try {
			await registerProfile(ctx)
			const control = await openPopup(ctx)
			await waitForHash(control, "#/popup/general")
			const address = await createPasskeyProfile(control)
			const file = writeBackupToTemp(buildSyntheticPasskeyBackup(await readRegisteredPasskey(control)), "passkey-backup.json")
			await navigateByHash(control, "#/popup/settings/security/reset")
			await completeResetRitual(control, "#/popup/auth")

			await openActionPopup(browser)
			await panelOn(browser, "#/popup/auth")
			for (const testid of IMPORT_FROM_LOCK_SCREEN) await clickInPanel(browser, testid)
			const restoreWindow = await toOwnWindow(ctx, control, () => clickInPanel(browser, "import-option-full-backup"))
			await restoreWindow.waitForSelector('[data-session-checked="true"]', { timeout: 60_000 })
			await refusePasskeyRestore(restoreWindow, auth, "import-full-backup-submit-btn", file)
			await clickByTestId(restoreWindow, "import-full-backup-submit-btn")
			// The deletion leaves the active-account pointer on this address, so only the window's
			// landing says the restore finished.
			await waitForHash(restoreWindow, "#/popup/general", 120_000)
			expect((await readRegisteredPasskey(control)).account.address).toBe(address)
			expect((await readProfileNames(control)).sort()).toEqual(["Imported PK", "Main"])
		} finally {
			await auth.cleanup()
		}
	}, 300_000)

	// The backup chain takes 96–180 s per attempt on hosted runners, so the PR lanes skip this; it runs
	// locally and in every artifact smoke (nightly and release).
	test.skipIf(process.env.CI === "true" && process.env.NULO_E2E_ARTIFACT_RUN !== "1")(
		"a backup exported from the panel restores in its own window to the same address",
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
					await downloadPlainPasskeyBackup(exportWindow, clickByTestId, 300_000),
					"passkey-backup.json",
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
				await submitPasskeyFullBackup(restoreWindow, file, 300_000)
				await waitForActiveAccount(control, address, 60_000)
				expect((await readProfileNames(control)).sort()).toEqual(["Main", "Profile 2"])
			} finally {
				await auth.cleanup()
			}
		},
	)
})
