/**
 * Helpers for driving the extension's approval popup windows from e2e tests.
 *
 * Each window is at `chrome-extension://<id>/src/popup/index.html#/windows/{kind}?requestId=...`.
 * The `requestId` query param is set by `DappInteractionService.interaction()`
 * and lets us match popup targets by ID instead of by substring (which races
 * on Linux Xvfb where windows can stack).
 */
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { Page, Target } from "puppeteer"
import { waitForTarget } from "./browser"
import { clickByTestId, clickSelector, patchPagePolling, waitForHash } from "./dom"
import { pollUntil } from "./poll"
import type { ExtensionContext } from "./extension"
import { selectFeeMethod, type FeeMethodSubtitle } from "./transfers"
import { recordPageErrors } from "./wallet-pages"

export type PopupKind =
	| "discover"
	| "verify"
	| "capabilities"
	| "execute"
	/** A held dApp send's question: its fee came out above the approved figure. */
	| "fee"
	| "json"
	| "network-unavailable"
	/** Arm the wait before the open: a logger window's URL can repeat, and a URL already open never
	 *  matches. */
	| "logger"

/**
 * Wait for a popup window of the given kind to open. If `requestId` is given,
 * match the popup whose URL contains that ID; otherwise match the first popup
 * of the kind that appears.
 */
export async function waitForPopup(
	ctx: ExtensionContext,
	kind: PopupKind,
	opts: { requestId?: string; timeout?: number } = {},
): Promise<Page> {
	// CI CPU pressure pushes popup-mount latency up against the 15s cliff. 30s gives
	// 2× margin without changing the steady state, since fast machines resolve in ms.
	const timeout = opts.timeout ?? 30_000
	// Snapshot existing matching target URLs so we only resolve a NEW popup,
	// not a stale one left by a prior interaction. URL contains a unique
	// requestId set by DappInteractionService.interaction(), so URL novelty
	// is the right discriminator when the caller doesn't already have the id.
	const preExisting = new Set(
		ctx.browser
			.targets()
			.filter((t) => t.type() === "page" && t.url().includes(`#/windows/${kind}`))
			.map((t) => t.url()),
	)
	const target: Target = await waitForTarget(
		ctx.browser,
		(t) => {
			if (t.type() !== "page") return false
			const url = t.url()
			if (!url.includes(`#/windows/${kind}`)) return false
			if (opts.requestId && !url.includes(`requestId=${opts.requestId}`)) return false
			if (preExisting.has(url)) return false
			return true
		},
		timeout,
	)
	const page = await target.asPage()
	// An error the window raised before this line, module evaluation first of all, can be in neither
	// array: Firefox's launch prints the add-on's latest exceptions at its close; Chrome reports
	// nothing.
	recordPageErrors(ctx, page)
	// Puppeteer can resolve waitForTarget before the page's main frame is wired
	// up — calling waitForFunction immediately throws "Requesting main frame too
	// early!" Poll until mainFrame() succeeds before doing any further waits.
	// Tolerate transient frame-detach errors here: under load the CDP connection
	// can transiently flap between target-creation and main-frame readiness.
	try {
		await waitForMainFrame(page)
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		if (!/frame got detached|Session closed|Target closed|Connection closed/i.test(msg)) throw err
		// Re-wait for main frame after the detach — the browser usually
		// recreates the frame within a few hundred ms.
		await waitForMainFrame(page, 8_000)
	}
	// Apply the same waitForFunction/waitForSelector polling patch as openPopup
	// — without it, every wait on this approval popup uses Puppeteer's default
	// 'raf' polling which is throttled in offscreen tabs (this popup
	// definitely is offscreen — it's a separate browser target).
	patchPagePolling(page)
	// Wait for SW liveness so the page can render. Wrap in detach recovery:
	// under full-suite load the freshly-created popup target can transiently
	// detach DURING this wait (puppeteer-core FrameManager#onClientDisconnect),
	// yielding `Error: waitForFunction failed: frame got detached` even when
	// openPopup + waitForMainFrame already passed cleanly. One re-wait on the
	// same target consistently recovers; the failure is the FrameManager
	// disposing isolated worlds before the target stabilizes, not a real SW
	// readiness problem.
	const livenessFn = () =>
		page.waitForFunction(
			async () => {
				try {
					const r = await chrome.storage.session.get("nulo:liveness")
					return !!r["nulo:liveness"]
				} catch {
					return false
				}
			},
			{ timeout: 30_000, polling: 250 },
		)
	try {
		await livenessFn()
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		if (!/frame got detached|Session closed|Target closed|Connection closed/i.test(msg)) throw err
		// Re-stabilize main frame then retry once.
		await waitForMainFrame(page, 8_000)
		await livenessFn()
	}
	return page
}

export async function waitForMainFrame(page: Page, timeout = 5_000): Promise<void> {
	const ready = async () => {
		try {
			page.mainFrame()
			return true
		} catch {
			return false
		}
	}
	await pollUntil(ready, (ok) => ok, { label: "waitForMainFrame: the page's main frame ready", timeoutMs: timeout, intervalMs: 50 })
}

export type CreatedWindow = { id?: number; type?: string }
/** A window the browser created or removed, stamped with the extension page's `Date.now()`. */
export type WindowChange = CreatedWindow & { change: "created" | "removed"; at: number }

/** Every window the browser creates or removes from now on, as an extension page's listeners see it. */
export async function recordWindowChanges(control: Page): Promise<() => Promise<WindowChange[]>> {
	await control.evaluate(() => {
		const w = window as unknown as { __windowChanges: WindowChange[] }
		w.__windowChanges = []
		chrome.windows.onCreated.addListener((win) =>
			w.__windowChanges.push({ change: "created", id: win.id, type: win.type, at: Date.now() }),
		)
		chrome.windows.onRemoved.addListener((id) => w.__windowChanges.push({ change: "removed", id, at: Date.now() }))
	})
	return () => control.evaluate(() => (window as unknown as { __windowChanges: WindowChange[] }).__windowChanges)
}

/** Every window the browser creates from now on, as an extension page's listener sees it. */
export async function recordCreatedWindows(control: Page): Promise<() => Promise<CreatedWindow[]>> {
	const changes = await recordWindowChanges(control)
	return async () => (await changes()).filter((c) => c.change === "created").map(({ id, type }) => ({ id, type }))
}

/** Wait for a popup page to be fully closed (target removed). Use before
 *  opening a second popup of the same kind so waitForTarget doesn't match
 *  the still-closing first popup. */
export async function waitForPopupClosed(page: Page, timeout = 5_000): Promise<void> {
	await pollUntil(
		async () => page.isClosed(),
		(closed) => closed,
		{
			label: "waitForPopupClosed: the popup closed",
			timeoutMs: timeout,
			intervalMs: 50,
		},
	)
}

export async function approveDiscover(page: Page): Promise<void> {
	await clickByTestId(page, "discover-allow-btn")
}

/** Read inside the page: BiDi has no window handles, so Puppeteer cannot name a window on Firefox. */
function readPopupWindows(page: Page): Promise<{ id: number | undefined; popups: number[] }> {
	return page.evaluate(async () => ({
		id: (await chrome.windows.getCurrent()).id,
		popups: (await chrome.windows.getAll({ windowTypes: ["popup"] }))
			.filter((w) => w.type === "popup")
			.map((w) => w.id as number)
			.sort((a, b) => a - b),
	}))
}

/**
 * Allow a new connection and resolve with its emoji check's page once the connect window has closed:
 * the popup windows after are those before, with the check in the connect window's place. A window
 * that opens and closes in between escapes this. `allow` defaults to `approveDiscover`.
 */
export async function approveConnect(
	ctx: ExtensionContext,
	discoverPage: Page,
	allow: () => Promise<void> = () => approveDiscover(discoverPage),
): Promise<Page> {
	const before = await readPopupWindows(discoverPage)
	// Armed before Allow: the wait ignores every check page already open when it starts.
	const checkP = waitForPopup(ctx, "verify")
	await allow()
	const check = await checkP.catch((err) => {
		const where = discoverPage.isClosed() ? "the connect window closed" : "the connect window stayed open"
		throw new Error(`approveConnect: no check window opened; ${where} (verify windows open: ${countVerifyWindows(ctx)})`, {
			cause: err,
		})
	})
	await check.waitForSelector('[data-testid="verify-emoji-grid"]', { visible: true, timeout: 30_000 })
	await waitForPopupClosed(discoverPage, 10_000).catch((err) => {
		throw new Error("approveConnect: the connect window stayed open beside the check", { cause: err })
	})
	const after = await readPopupWindows(check)
	const expected = [...before.popups.filter((id) => id !== before.id), after.id].sort((a, b) => (a ?? 0) - (b ?? 0))
	if (after.id === before.id || JSON.stringify(after.popups) !== JSON.stringify(expected)) {
		throw new Error(`approveConnect: the check did not replace the connect window: ${JSON.stringify({ before, after })}`)
	}
	return check
}

export async function denyDiscover(page: Page): Promise<void> {
	await clickByTestId(page, "discover-deny-btn")
}

export async function approveVerify(page: Page): Promise<void> {
	await clickByTestId(page, "verify-confirm-btn")
	// `handleConfirm` closes the window only after the worker answers the confirmation.
	if (!page.isClosed()) {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error("approveVerify: popup did not close within 10s"))
			}, 10_000)
			page.once("close", () => {
				clearTimeout(timer)
				resolve()
			})
		})
	}
}

/**
 * Approve a /windows/capabilities popup.
 *
 * - `switches`: the state each new row's switch must be in before approving, by row key
 *   (`data-cap-row`: "authorizations", "address-book", "private-events", "unknown"). A row not
 *   named keeps its default.
 * - `accounts`: account ids to select for the accounts capability. Selects
 *   each row by data-account-id.
 * - `aliases`: per-account alias overrides. Each presses the row's "Rename for this app" unless
 *   its field is already open, then writes the field.
 */
export async function approveCapabilities(
	page: Page,
	opts: { switches?: Record<string, boolean>; accounts?: string[]; aliases?: Record<string, string> } = {},
): Promise<void> {
	// The popup's `init()` is async — wait for at least one cap-item OR
	// cap-account-item to render before manipulating. Either signals the
	// payload has been fetched and rendered.
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="cap-item"]') !== null ||
			document.querySelector('[data-testid="cap-account-item"]') !== null,
		{ timeout: 30_000, polling: 200 },
	)
	for (const [rowKey, on] of Object.entries(opts.switches ?? {})) await setCapabilitySwitch(page, rowKey, on)
	for (const accountId of opts.accounts ?? []) {
		await page.waitForSelector(`[data-testid="cap-account-item"][data-account-id="${accountId}"]`, {
			visible: true,
			timeout: 5_000,
		})
		// Idempotent select: only click if the row isn't already selected.
		// Necessary because the wallet auto-selects the single-account case
		// — clicking again would de-select and fail the "Select at least one
		// account" approval guard.
		await page.evaluate((id: string) => {
			const row = document.querySelector<HTMLElement>(`[data-testid="cap-account-item"][data-account-id="${id}"]`)
			if (row && !row.dataset.selected) row.click()
		}, accountId)
	}
	for (const [accountId, alias] of Object.entries(opts.aliases ?? {})) {
		const row = `[data-testid="cap-account-item"][data-account-id="${accountId}"]`
		const field = `${row} [data-testid="cap-account-alias-input"]`
		if (!(await page.$(field))) await clickSelector(page, `${row} [data-testid="cap-account-rename-btn"]`, { timeout: 5_000 })
		await page.waitForSelector(field, { visible: true, timeout: 5_000 })
		await page.evaluate(
			({ sel, alias }: { sel: string; alias: string }) => {
				const input = document.querySelector<HTMLInputElement>(sel)
				if (!input) throw new Error(`${sel} left before its alias was written`)
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
				setter?.call(input, alias)
				input.dispatchEvent(new Event("input", { bubbles: true }))
			},
			{ sel: field, alias },
		)
	}
	await clickByTestId(page, "cap-approve-btn")
}

/** A new row's switch; the "Already granted" copy of a row has none. */
const capSwitchSelector = (rowKey: string) =>
	`[data-testid="cap-item"][data-cap-row="${rowKey}"]:not([data-cap-granted]) [data-testid="cap-toggle"]`

/** Flip a new row's switch to `on` if it is not already, then wait for the window to show it. */
export async function setCapabilitySwitch(page: Page, rowKey: string, on: boolean): Promise<void> {
	const selector = capSwitchSelector(rowKey)
	await page.waitForSelector(selector, { visible: true, timeout: 5_000 })
	await page.evaluate(
		({ sel, want }: { sel: string; want: boolean }) => {
			const el = document.querySelector<HTMLElement>(sel)
			if (el && (el.getAttribute("aria-checked") === "true") !== want) el.click()
		},
		{ sel: selector, want: on },
	)
	await page.waitForFunction(
		(sel: string, want: boolean) => document.querySelector(sel)?.getAttribute("aria-checked") === String(want),
		{ timeout: 5_000, polling: 100 },
		selector,
		on,
	)
}

/** A new row's switch state, or `undefined` when the row shows no switch. */
export async function readCapabilitySwitch(page: Page, rowKey: string): Promise<boolean | undefined> {
	await waitCapabilitiesReady(page)
	return page.evaluate((sel: string) => {
		const checked = document.querySelector(sel)?.getAttribute("aria-checked")
		return checked === undefined || checked === null ? undefined : checked === "true"
	}, capSwitchSelector(rowKey))
}

const APP_SWITCH = '[data-testid="connected-app-authorizations-toggle"]'

/**
 * Open Settings → Connected apps → the app served from `host`, ready once `ready` shows: the
 * authorizations switch by default, which a grant with no call scope does not render. A miss names
 * the hosts listed.
 */
export async function openConnectedApp(page: Page, host: string, ready = APP_SWITCH): Promise<void> {
	await page.evaluate(() => {
		window.location.hash = "#/popup/settings/connected-apps"
	})
	await waitForHash(page, "#/popup/settings/connected-apps")
	await clickSelector(page, `[data-testid="connected-app-row"][data-app-host="${host}"]`, { timeout: 15_000 }).catch(async (err) => {
		const hosts = await page.$$eval('[data-testid="connected-app-row"]', (rows) => rows.map((r) => r.getAttribute("data-app-host")))
		throw new Error(`no connected-app row for ${host}; rows: ${JSON.stringify(hosts)}`, { cause: err })
	})
	await page.waitForSelector(ready, { visible: true, timeout: 15_000 })
}

const switchIs = (page: Page, on: boolean) =>
	page.waitForFunction(
		(sel: string, want: boolean) => document.querySelector(sel)?.getAttribute("aria-checked") === String(want),
		{ timeout: 10_000, polling: 100 },
		APP_SWITCH,
		on,
	)

/**
 * Set a connected app's authorizations switch in Settings, then reopen the app's page, which reads
 * the session again, so the state proved is the stored one and not the switch's pending value.
 * `page` must have finished its start-up navigation (`waitForHash(page, "#/popup/general")` after
 * `openPopup`), or that navigation can land after this one and take the page back home.
 */
export async function setConnectedAppAuthorizations(page: Page, host: string, on: boolean): Promise<void> {
	await openConnectedApp(page, host)
	await page.evaluate(
		({ sel, want }: { sel: string; want: boolean }) => {
			const el = document.querySelector<HTMLElement>(sel)
			if (el && (el.getAttribute("aria-checked") === "true") !== want) el.click()
		},
		{ sel: APP_SWITCH, want: on },
	)
	await switchIs(page, on)
	await openConnectedApp(page, host)
	await switchIs(page, on)
}

export async function rejectCapabilities(page: Page): Promise<void> {
	await clickByTestId(page, "cap-reject-btn")
}

const EXECUTE_APPROVABLE_TIMEOUT_MS = 120_000

/**
 * Wait for the execute popup to be APPROVABLE: the confirm button's native
 * `disabled` aggregates ALL its gates (`windows/execute/index.vue` — payload
 * init, register_token metadata, fee selection, and every operation's fee
 * estimate and authorization preview, which must settle first), so reading the
 * live attribute is drift-proof; the pointer-events clause additionally covers
 * the CSS-only `loading` state the design Button never reflects into `disabled`.
 *
 * `waitForExecuteContent` (op rows rendered) is a strictly weaker signal: the
 * fee-selection settle happens after rows render, and on a cold shard that gap
 * alone historically blew the generic 10s click wait (see implementations-plan/archive/e2e-deflake/plan.md, Flake ledger).
 * Budget rationale: every popup now waits for an estimate, so the default is
 * the 120s budget the cold-path callers and the sibling Send flow already use
 * for an estimate-gated button.
 *
 * Every wait appends `content_ready→approvable` timing to
 * `.e2e-state/exec-approvable-timings.log` (worktree-local; uploaded with the CI
 * failure artifact) — passing runs produce evidence too, since vitest swallows
 * console output for passing tests.
 */
export async function waitForExecuteApprovable(page: Page, timeout = EXECUTE_APPROVABLE_TIMEOUT_MS): Promise<void> {
	const t0 = Date.now()
	try {
		await page.waitForFunction(
			() => {
				const btn = document.querySelector('[data-testid="execute-confirm-btn"]') as HTMLButtonElement | null
				return !!btn && !btn.disabled && getComputedStyle(btn).pointerEvents !== "none"
			},
			{ timeout, polling: 200 },
		)
	} catch (err) {
		const diag = await page
			.evaluate(() => {
				const btn = document.querySelector('[data-testid="execute-confirm-btn"]') as HTMLButtonElement | null
				return {
					btnInDom: !!btn,
					btnDisabled: btn?.disabled ?? null,
					btnPointerEvents: btn ? getComputedStyle(btn).pointerEvents : null,
					errorText: document.querySelector('[data-testid="error-text"]')?.textContent?.slice(0, 200) ?? null,
					feeMethod: document.querySelector('[data-testid="send-fee-method-trigger"]')?.getAttribute("data-fee-method") ?? null,
					opCount: document.querySelectorAll('[data-testid="execute-op-item"]').length,
				}
			})
			.catch((e) => ({ evalFailed: String(e) }))
		recordApprovableTiming(`TIMEOUT after=${timeout}ms diag=${JSON.stringify(diag)}`)
		throw new Error(
			`waitForExecuteApprovable: not approvable after ${timeout}ms: ${JSON.stringify(diag)}; original: ${(err as Error).message}`,
		)
	}
	recordApprovableTiming(`ok elapsed_ms=${Date.now() - t0}`)
}

function recordApprovableTiming(line: string): void {
	try {
		const dir = join(process.cwd(), ".e2e-state")
		mkdirSync(dir, { recursive: true })
		appendFileSync(join(dir, "exec-approvable-timings.log"), `${new Date().toISOString()} ${line}\n`)
	} catch {
		// Telemetry only — never fail a test over it.
	}
}

/**
 * Approve a /windows/execute popup, optionally overriding the fee method.
 *
 * FeeSettingsCard is shared with the wallet's own send flow; its testids stay
 * `send-fee-method-trigger` / `send-fee-method-{kind}`. Two-step override:
 * first click trigger, then click the chosen method.
 *
 * `approvableTimeoutMs` overrides the approvable wait's 120s default.
 */
export async function approveExecute(
	page: Page,
	opts: { feeMethod?: FeeMethodSubtitle; approvableTimeoutMs?: number } = {},
): Promise<void> {
	if (opts.feeMethod) {
		await selectFeeMethod(page, opts.feeMethod)
	}
	// Gate on the real approvable signal BEFORE the click — clickByTestId's
	// generic 10s assumed the button was already (about to be) enabled, which is
	// exactly what a cold shard breaks. The final click stays delegated to
	// clickByTestId for its target-detach swallow (the popup self-closes on the
	// click that resolves the interaction).
	await waitForExecuteApprovable(page, opts.approvableTimeoutMs)
	await clickByTestId(page, "execute-confirm-btn")
}

/** Pick a fee method + submit one of the authwit settings popups
 *  (RevokeAuthwitsPopup / ChangeAuthwitsRegistryPopup). Both embed the
 *  shared FeeSettingsCard (`send-fee-method-*` testids) and carry a
 *  distinct submit testid. Mirrors approveExecute's fee-pick step.
 *  `submitTestId`: "revoke-authwits-submit" | "registry-toggle-submit". */
export async function pickFeeAndSubmitAuthwitPopup(
	page: Page,
	submitTestId: string,
	feeMethod: FeeMethodSubtitle = "sponsored",
): Promise<void> {
	await selectFeeMethod(page, feeMethod)
	await page.waitForFunction(
		(id: string) => {
			const b = document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null
			return !!b && !b.disabled
		},
		{ timeout: 30_000, polling: 200 },
		submitTestId,
	)
	await page.evaluate((id: string) => {
		;(document.querySelector(`[data-testid="${id}"]`) as HTMLElement)?.click()
	}, submitTestId)
}

export async function rejectExecute(page: Page): Promise<void> {
	await clickByTestId(page, "execute-reject-btn")
}

/**
 * Wait for the /windows/execute popup to finish its async render before
 * tests read op rows / fee badges. `waitForPopup("execute")` only blocks
 * on target+SW liveness; the Vue tree (operations.value, FeeSettingsCard)
 * mounts later. Calling this right after `waitForPopup("execute")` avoids
 * the "execute-op-item read returns []" race that previously skipped the
 * tx-sendTx-* suite.
 */
export async function waitForExecuteContent(page: Page, timeout = 30_000): Promise<void> {
	await page.waitForSelector('[data-testid="execute-op-item"]', { visible: true, timeout })
}

/** Opens a send card's value rows under its summary ("Show all details"), closed at rest. */
export async function openExecuteDetails(page: Page, timeout = 10_000): Promise<void> {
	await clickByTestId(page, "execute-op-details-toggle")
	await page.waitForSelector('[data-testid="execute-op-details"]', { visible: true, timeout })
}

/** Read the visible op cards: returns `{ id, kind }[]`. Waits for at least one
 *  op-item to render — the popup's mount is async. */
export async function getExecuteOps(page: Page): Promise<Array<{ id: string; kind: string }>> {
	await waitForExecuteContent(page).catch(() => undefined)
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-testid="execute-op-item"]')].map((el) => ({
			id: el.getAttribute("data-op-id") ?? "",
			kind: el.getAttribute("data-op-kind") ?? "",
		})),
	)
}

/**
 * Wait for the capabilities popup to finish its async render before tests
 * read cap rows / select accounts. The popup mounts the Vue tree only after
 * `init()` completes (DappInteractionService payload fetch + manifest resolve).
 *
 * Symmetric with `waitForExecuteContent`. Resolves as soon as EITHER a
 * `cap-item` (capability row) OR a `cap-account-item` (account picker row)
 * is visible — different bundles mount different surfaces and a strict
 * cap-item-only wait silently times out via `.catch(() => undefined)` on
 * the accounts-only path, leaving downstream selectors racing.
 */
export async function waitCapabilitiesReady(page: Page, timeout = 30_000): Promise<void> {
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="cap-item"]') !== null ||
			document.querySelector('[data-testid="cap-account-item"]') !== null,
		{ timeout, polling: 200 },
	)
}

export type CapItem = { id: string; row: string; granted: boolean; flagged: boolean; rerequested: boolean }

/** Read the rendered permission rows in window order: `id` is the capability type (`data-cap-id`,
 *  absent on the unknown row) and `row` the row key (`data-cap-row`), since one type can draw several
 *  rows. The "Already allowed" fold mounts its rows only while open. Waits for at least one cap-item
 *  to render — the popup's init() is async. */
export async function getCapItems(page: Page): Promise<CapItem[]> {
	// Wait for popup readiness (cap-item OR cap-account-item) instead of
	// only cap-item — the bundle under test might be accounts-only.
	await waitCapabilitiesReady(page).catch(() => undefined)
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-testid="cap-item"]')].map((el) => ({
			id: el.getAttribute("data-cap-id") ?? "",
			row: el.getAttribute("data-cap-row") ?? "",
			granted: el.getAttribute("data-cap-granted") === "true",
			flagged: el.getAttribute("data-cap-flagged") === "true",
			rerequested: !!el.querySelector('[data-testid="cap-rerequested-badge"]'),
		})),
	)
}

/** Verify windows currently open in this browser (closed windows drop out of `targets()`). */
export function countVerifyWindows(ctx: ExtensionContext): number {
	return ctx.browser.targets().filter((t) => t.type() === "page" && t.url().includes("#/windows/verify")).length
}
