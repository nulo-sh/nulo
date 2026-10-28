/**
 * The popup moves the profile chaos drivers share. Every press is by testid; a settle is a named
 * state reached within a bound, and a miss reports the route and the loading testids on screen.
 */
import type { Page } from "puppeteer"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { openProfileChooser, pressHeaderLock, waitForLockScreen } from "../../fixtures/auth"
import { clickByTestId, clickSelector, replaceInputValue } from "../../fixtures/dom"
import { navigateByHash } from "../../fixtures/navigation"
import { settleClosedPopup } from "../../fixtures/popup-leave"
import { pollUntil } from "../../fixtures/poll"
import { callService } from "../../fixtures/session"
import { ADVANCES_ON_OPEN } from "./checkers"
import type { Driven } from "./state"

/** A state a driver waits for: every given condition holds at once. */
export interface Signal {
	label: string
	/** `location.hash` includes this. */
	hash?: string
	/** A visible element with this testid. */
	testid?: string
	/** The page's text includes this: toasts and inline errors only. */
	text?: string
	/** The session row is gone from `storage.session`. */
	noSession?: true
	/** `storage.local` holds no such key. */
	noLocalKey?: string
}

/** A passkey prompt's failures, by the toast each one shows (`passkeyFailureCopy`). */
export const PASSKEY_REFUSAL: Signal[] = [
	{ label: "cancelled", text: PASSKEY_COPY.notConfirmed },
	{ label: "refused", text: PASSKEY_COPY.noPrf },
	{ label: "refused", text: PASSKEY_COPY.unlockFailed },
]

export async function firstSignal(page: Page, signals: readonly Signal[], boundMs: number): Promise<{ label?: string; elapsedMs: number }> {
	const t0 = Date.now()
	const handle = await page
		.waitForFunction(
			async (list: Signal[]) => {
				const visible = (id: string) => {
					const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
					return !!el && el.getClientRects().length > 0
				}
				const sessionGone = async () => !(await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
				const keyGone = async (key: string) => !(await chrome.storage.local.get(key))[key]
				const stored = async (s: Signal) =>
					(!s.noSession || (await sessionGone())) && (!s.noLocalKey || (await keyGone(s.noLocalKey)))
				const onScreen = (s: Signal) =>
					(!s.hash || location.hash.includes(s.hash)) &&
					(!s.testid || visible(s.testid)) &&
					(!s.text || (document.body.textContent ?? "").includes(s.text))
				for (const s of list) if (onScreen(s) && (await stored(s))) return s.label
				return false
			},
			{ timeout: boundMs, polling: 200 },
			[...signals],
		)
		.catch(() => undefined)
	const label = handle ? ((await handle.jsonValue()) as string) : undefined
	return { label, elapsedMs: Date.now() - t0 }
}

/** Where a driver stood when it gave up: the route and the testids on screen, which name no value. */
export async function whereStuck(page: Page): Promise<string> {
	const seen = await page
		.evaluate(() => ({
			route: location.hash,
			visible: [...document.querySelectorAll<HTMLElement>("[data-testid]")]
				.filter((el) => el.getClientRects().length > 0)
				.map((el) => el.dataset.testid ?? "")
				.slice(0, 60),
		}))
		.catch(() => ({ route: "<unreadable>", visible: [] as string[] }))
	return `at ${seen.route}; visible ${[...new Set(seen.visible)].join(",")}`
}

/** What is on screen when a bound runs out: the route, every loading testid and every testid
 *  visible, which name no value. */
async function stalledOn(page: Page): Promise<{ route?: string; loading: string[]; visible: string[] }> {
	return page
		.evaluate(() => {
			const ids = [...document.querySelectorAll<HTMLElement>("[data-testid]")]
				.filter((el) => el.getClientRects().length > 0)
				.map((el) => el.dataset.testid ?? "")
			const notices = [...document.querySelectorAll<HTMLElement>('[data-testid^="snackbar-"], [data-testid^="toast-"]')]
				.filter((el) => el.getClientRects().length > 0 && el.children.length === 0)
				.map((el) => `${el.dataset.testid}="${(el.textContent ?? "").trim().slice(0, 160)}"`)
			return {
				route: location.hash,
				loading: ids.filter((id) => /pending|loading|spinner|progress/.test(id)),
				visible: [...new Set(ids)].slice(0, 60).concat(notices),
			}
		})
		.catch(() => ({ route: undefined, loading: [], visible: [] }))
}

export const HOME: Signal = { label: "home", hash: "/popup/general" }
export const LOCKED: Signal = { label: "lock", hash: "/popup/auth", noSession: true }
export const REGISTER: Signal = { label: "register", hash: "/popup/register" }

/**
 * Waits for one of `signals`; `outcomes` maps each label to the outcome it means. A miss settles as
 * not reached with the first signal's outcome, so the runner reports the bound and what loaded.
 */
export async function settle(
	page: Page,
	signals: readonly Signal[],
	outcomes: Readonly<Record<string, Driven["outcome"]>>,
	boundMs: number,
): Promise<Driven> {
	const { label, elapsedMs } = await firstSignal(page, signals, boundMs)
	if (label !== undefined) return { outcome: outcomes[label] ?? "committed", settle: { reached: true, elapsedMs, boundMs } }
	const stall = await stalledOn(page)
	return { outcome: outcomes[signals[0].label] ?? "committed", settle: { reached: false, elapsedMs, boundMs, ...stall } }
}

/** A driver's settle that has no screen to wait for: its own work returned within the bound. */
export function timed(t0: number, boundMs: number, outcome: Driven["outcome"]): Driven {
	const elapsedMs = Date.now() - t0
	return { outcome, settle: { reached: elapsedMs <= boundMs, elapsedMs, boundMs } }
}

export async function isLocked(page: Page, timeoutMs?: number): Promise<boolean> {
	return !(await callService<{ id: string } | undefined>(page, "profile", "getActiveProfile", [], timeoutMs))
}

/** Locks through Home's header when a session is open, since a settings page has none; else opens
 *  the lock screen from wherever a locked page stands, Import or Register included. */
export async function toLockScreen(page: Page): Promise<void> {
	if (await isLocked(page)) {
		await navigateByHash(page, "#/popup/auth", 15_000).catch(async (error) => {
			// The router keeps a page that believes a session is open off the lock screen.
			if ((await isLocked(page)) && page.url().includes("#/popup/general"))
				throw new Error("the popup holds Home while the worker holds no session")
			throw error
		})
		return
	}
	await navigateByHash(page, "#/popup/general", 15_000)
	await pressHeaderLock(page)
	await waitForLockScreen(page)
}

export async function storedSelection(page: Page): Promise<string | undefined> {
	return page.evaluate(
		async () => (await chrome.storage.local.get("nulo:ui:lastActiveProfile"))["nulo:ui:lastActiveProfile"] as string | undefined,
	)
}

/** Points the lock screen at `profileId` through the picker, unless it is stored there already. */
export async function pickOnLockScreen(page: Page, profileId: string): Promise<void> {
	if ((await storedSelection(page)) === profileId) return
	await openProfileChooser(page)
	const row = `[data-testid="select-profile-row"][data-profile-id="${profileId}"]`
	await page.waitForSelector(row, { visible: true, timeout: 10_000 })
	await clickSelector(page, row)
	await page.waitForFunction(() => !document.querySelector('[data-testid="select-profile-row"]'), { timeout: 10_000 })
	await page.waitForFunction(
		async (id: string) => (await chrome.storage.local.get("nulo:ui:lastActiveProfile"))["nulo:ui:lastActiveProfile"] === id,
		{ timeout: 10_000, polling: 100 },
		profileId,
	)
}

/** Waits until `auth-submit` is enabled: after a lock the page refetches its profile first. */
export async function authSubmitReady(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const btn = document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')
			return !!btn && !btn.disabled
		},
		{ timeout: 15_000, polling: 100 },
	)
}

/** Waits for the lock screen's unlock attempt to end: Home, or the submit shown and idle with no
 *  passkey prompt. The route cannot tell, since a pending attempt stays on it, and a page that shows
 *  neither control is still between states. */
export async function unlockAttemptEnded(page: Page, ms: number): Promise<void> {
	await page.waitForFunction(
		() => {
			if (location.hash.includes("/popup/general")) return true
			const submit = document.querySelector('[data-testid="auth-submit"]')
			return (
				!!submit &&
				submit.getAttribute("aria-busy") !== "true" &&
				!document.querySelector('[data-testid="passkey-ceremony-dialog"]')
			)
		},
		{ timeout: ms, polling: 100 },
	)
}

/** Where a held unlock's race ended within `boundMs`; an answer past it throws. A committed
 *  attempt holds its session before its submit goes idle and leaves the lock screen only once the
 *  router resolves Home. */
export async function raceEnd(page: Page, boundMs: number): Promise<"home" | "lock" | "lock over a session" | undefined> {
	const lock: Signal = { label: "lock", hash: "/popup/auth" }
	const deadline = Date.now() + boundMs
	// An answer counts only if it arrived inside the bound, whatever the read's own timeout.
	const left = () => {
		const ms = deadline - Date.now()
		if (ms <= 0) throw new Error("the race did not end within its bound")
		return ms
	}
	for (;;) {
		const { label } = await firstSignal(page, [HOME, lock], left())
		left()
		if (label !== "lock") return label === "home" ? "home" : undefined
		const locked = await isLocked(page, left())
		const ms = left()
		if (locked) return "lock"
		// A shorter read than this could time out on a screen that still shows the lock.
		if (ms < 500) return "lock over a session"
		await new Promise((r) => setTimeout(r, 200))
	}
}

export async function typePasswordAndSubmit(page: Page, password: string): Promise<void> {
	await page.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="auth-password-input"]', password)
	await clickByTestId(page, "auth-submit")
}

/** Presses `testid` twice in one task, as an impatient double click does: the second press meets
 *  whatever the first left, a disabled control included. */
export async function pressTwice(page: Page, testid: string): Promise<void> {
	await page.evaluate((id: string) => {
		const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
		if (!el) throw new Error(`no ${id} to press`)
		el.click()
		el.click()
	}, testid)
}

/**
 * Opens `hash` on a fresh mount. The popup's router view is unkeyed, so a route the page already
 * shows is not remounted and its last error would read as this step's: the page leaves it first,
 * for Home or Settings while a session is open, for Import or the lock screen while locked.
 */
type StillProbe = Window & { __chaosStill?: { node: Element | null; since: number }; __chaosGone?: number }

/** Waits until `testid` is one node for 250 ms: a route the router replaces just after it mounts
 *  swaps the node within milliseconds, so a press before then lands on the copy it discards. */
async function holdStill(page: Page, testid: string): Promise<void> {
	await page.evaluate(() => {
		;(window as StillProbe).__chaosStill = undefined
	})
	await page.waitForFunction(
		(t: string) => {
			const probe = window as StillProbe
			const node = document.querySelector(`[data-testid="${t}"]`)
			if (!node || probe.__chaosStill?.node !== node) {
				probe.__chaosStill = { node, since: Date.now() }
				return false
			}
			return Date.now() - probe.__chaosStill.since >= 250
		},
		{ timeout: 10_000, polling: 50 },
		testid,
	)
}

/** Whether `testid` leaves the page and stays gone for 300 ms within 2 s. */
async function staysGone(page: Page, testid: string): Promise<boolean> {
	await page.evaluate(() => {
		;(window as StillProbe).__chaosGone = undefined
	})
	return page
		.waitForFunction(
			(t: string) => {
				const probe = window as StillProbe
				if (document.querySelector(`[data-testid="${t}"]`)?.getClientRects().length) {
					probe.__chaosGone = undefined
					return false
				}
				probe.__chaosGone ??= Date.now()
				return Date.now() - probe.__chaosGone >= 300
			},
			{ timeout: 2_000, polling: 50 },
			testid,
		)
		.then(
			() => true,
			() => false,
		)
}

/** Presses `testid` once it holds still, until it leaves the page for good, at most three times:
 *  a control a press never removes throws. */
export async function pressUntilGone(page: Page, testid: string): Promise<void> {
	for (let press = 0; press < 3; press++) {
		await holdStill(page, testid)
		await clickByTestId(page, testid)
		if (await staysGone(page, testid)) return
	}
	throw new Error(`${testid} stayed on the page through three presses`)
}

export async function openRoute(page: Page, hash: string): Promise<void> {
	const here = await page.evaluate(() => location.hash.split("?")[0])
	if (here === hash) {
		const [first, second] = (await isLocked(page)) ? ["#/popup/import", "#/popup/auth"] : ["#/popup/general", "#/popup/settings"]
		const away = hash === first ? second : first
		await page.evaluate((h: string) => {
			location.hash = h
		}, away)
		await page.waitForFunction((t: string) => location.hash.split("?")[0] !== t, { timeout: 15_000, polling: 100 }, hash)
	}
	await navigateByHash(page, hash, 15_000)
}

export async function activeProfileId(page: Page): Promise<string | undefined> {
	return (await callService<{ id: string } | undefined>(page, "profile", "getActiveProfile"))?.id
}

/** Waits for the confirmation popup to leave; a leave headless Chrome never finishes is removed, so
 *  a later step never presses a stale `confirm-submit`. */
export async function confirmLeft(page: Page): Promise<void> {
	await settleClosedPopup(page, "confirm-submit")
}

export async function answerConfirm(page: Page, answer: "submit" | "cancel"): Promise<void> {
	await page.waitForSelector(`[data-testid="confirm-${answer}"]`, { visible: true, timeout: 10_000 })
	await clickByTestId(page, `confirm-${answer}`)
	await confirmLeft(page)
}

export async function waitForRoute(page: Page, route: string, timeout: number): Promise<void> {
	await page.waitForFunction((want: string) => location.hash.split("?")[0] === want, { timeout, polling: 200 }, route)
}

/** Waits until the anchor has left the routes the popup leaves once a profile is active; a miss
 *  is left to O1. */
export async function anchorAdvanced(page: Page, timeout: number): Promise<void> {
	await page
		.waitForFunction(
			(routes: readonly string[]) => !routes.includes(location.hash.slice(1).split("?")[0]),
			{ timeout, polling: 200 },
			ADVANCES_ON_OPEN,
		)
		.catch(() => {})
}

/** Waits until a fresh port to the background is answered: a successor still booting closes one
 *  unanswered. */
export async function backgroundServing(page: Page, timeoutMs: number): Promise<void> {
	await pollUntil(
		() =>
			callService(page, "profile", "getActiveProfile").then(
				() => true,
				() => false,
			),
		(served) => served,
		{ label: "a background that answers", timeoutMs, intervalMs: 250 },
	)
}

/** Closes every snackbar the last step left: an error one stays until closed, and its text would
 *  read as the next step's own. Waits until none is left in the page, its leave included. */
export async function dismissNotices(page: Page): Promise<void> {
	await page.evaluate(() => {
		for (const close of document.querySelectorAll<HTMLElement>('[data-testid="snackbar-close"]')) close.click()
	})
	await page.waitForFunction(() => !document.querySelector('[data-testid="snackbar"]'), { timeout: 5_000, polling: 100 }).catch(() => {})
}

type AbortProbe = Window & { __chaosPromptAborted?: boolean }

/** Marks the page once the next passkey request's own signal aborts. Installed over a hold, so the
 *  page's call meets it first. */
export async function watchPromptAbort(page: Page): Promise<() => Promise<boolean>> {
	await page.evaluate(() => {
		const probe = window as AbortProbe
		probe.__chaosPromptAborted = false
		const credentials = navigator.credentials
		const get = credentials.get.bind(credentials)
		credentials.get = (options) => {
			credentials.get = get
			options?.signal?.addEventListener("abort", () => {
				probe.__chaosPromptAborted = true
			})
			return get(options)
		}
	})
	return () =>
		page
			.waitForFunction(() => (window as AbortProbe).__chaosPromptAborted === true, { timeout: 15_000, polling: 100 })
			.then(() => true)
			.catch(() => false)
}
