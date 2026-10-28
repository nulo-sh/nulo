import type { Page } from "puppeteer"
import { E2E_WALLET_CLOCK_VALUES } from "@/e2e/wallet-clocks"
import { TEST_PASSWORD } from "./constants"
import { clickByTestId, clickSelector, replaceInputValue, waitForHash, withTimeoutMessage } from "./dom"
import { navigateByHash } from "./navigation"
import { pollUntil } from "./poll"
import { callService } from "./session"
import { acceptConfirmPopup } from "./widgets"

/** Lock the wallet via the Header lock button, then wait for the lock screen.
 *
 *  Only for a wallet with no approved send running: with one running, the
 *  button asks first, and the test drives that dialog itself.
 *
 *  The chip awaits the session handle and a read of the running sends, marks the popup locked and
 *  sends the lock without awaiting it; the background's lock event then routes the popup to
 *  `/popup/auth`. */
export async function lockWallet(page: Page): Promise<void> {
	await pressHeaderLock(page)
	await waitForLockScreen(page)
}

/** Press the Header lock button; resolves once the click is dispatched, not once the wallet locks. */
export async function pressHeaderLock(page: Page): Promise<void> {
	// Wait for the lock control to be mounted BEFORE clicking — a bare
	// `querySelector(...)?.click()` silently no-ops if the header hasn't
	// (re)mounted yet (e.g. right after a `router.back()`).
	await page.waitForSelector('[data-testid="header-lock"]', { visible: true, timeout: 15_000 })
	await page.evaluate(() => {
		;(document.querySelector('[data-testid="header-lock"]') as HTMLElement)?.click()
	})
}

/** A confirm dialog's copy, as rendered. */
export type ConfirmDialogCopy = { preTitle: string; title: string; description: string; confirm: string }

/** Lock the wallet while approved sends are running, when the lock button asks first: returns the
 *  dialog's copy, then confirms and waits for the lock screen. */
export async function lockThroughConfirmDialog(page: Page): Promise<ConfirmDialogCopy> {
	await clickByTestId(page, "header-lock")
	await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout: 15_000 })
	const copy = await page.evaluate(() => {
		const text = (testId: string) => document.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? ""
		return {
			preTitle: text("confirm-pre-title"),
			title: text("confirm-title"),
			description: text("confirm-description"),
			confirm: text("confirm-submit"),
		}
	})
	await clickByTestId(page, "confirm-submit")
	await waitForLockScreen(page)
	return copy
}

/** Wait for a lock, however it was triggered, to land: the session record gone, then the popup on `/popup/auth`. */
export async function waitForLockScreen(page: Page, timeoutMs = 60_000): Promise<void> {
	// The session record leaving chrome.storage.session is the authoritative lock; the popup lands
	// after it, routed by the lock event or, on a page opened after the lock, by its boot.
	// Observed, never forced: a reload would abandon that route's load in flight, which Firefox
	// rejects, and would pass a redirect that never lands.
	await page.waitForFunction(
		async () => {
			const r = await chrome.storage.session.get("nulo:core:session")
			return !r["nulo:core:session"]
		},
		{ timeout: timeoutMs },
	)
	await page.waitForFunction(() => window.location.hash.includes("/popup/auth"), { timeout: 15_000 })
}

/**
 * The lock a background death leaves behind, then the unlock. Strict mode drops the session on any
 * background death, on both browsers, so the lock is asserted first — `ensureUnlocked` alone passes
 * on a wallet that never locked, which is the regression the callers exist to catch. The budgets
 * cover a successor's cold boot.
 */
export async function unlockAfterBackgroundDeath(page: Page): Promise<void> {
	await waitForLockScreen(page, 60_000)
	await ensureUnlocked(page, TEST_PASSWORD, { decisionBudgetMs: 120_000 })
	await page.waitForFunction(() => window.location.hash.includes("/popup/general"), { timeout: 120_000 })
}

/** If the wallet is locked, re-enter the password; if it is already unlocked,
 *  do nothing. Defaults to the standard test password; pass a different one if
 *  a prior test rotated it via change-password.
 *
 *  Contract — this helper is authoritative only inside it:
 *  - **Password profiles only.** A locked passkey profile keeps its session
 *    record (`SessionManager.restore` returns early: WebAuthn needs a user
 *    gesture), so it cannot be told apart from an unlocked one except by the
 *    password field being absent on `/popup/auth`. On any other route it would
 *    read as unlocked. Passkey lock/unlock is not e2e-drivable today anyway —
 *    see `fixtures/passkey.ts`.
 *  - **One profile, or a trustworthy `nulo:ui:lastActiveProfile`.** The unlock
 *    proof is scoped to that id; `app.vue` can fall back to `profiles[0]`
 *    WITHOUT persisting it, so with several profiles and no persisted id the
 *    scope check degrades to "any newer well-formed record".
 *  - **Callers keep an authoritative postcondition.** The session record is
 *    persisted just before `activeSession` is assigned, so a success here can
 *    in principle observe a session that a concurrent deletion fence then
 *    closes. Every current caller follows with route convergence or an
 *    account/on-chain read, which is what actually pins the outcome. */
export async function ensureUnlocked(
	page: Page,
	password = TEST_PASSWORD,
	opts: {
		/** How long the app may take to DECIDE its lock state. The default covers a warm popup;
		 *  a caller that just restarted the service worker passes its own bootstrap envelope. */
		decisionBudgetMs?: number
		/** Internal: the product's boot RETRY has already been pressed once on this call. */
		retried?: boolean
	} = {},
): Promise<void> {
	const decisionBudgetMs = opts.decisionBudgetMs ?? 30_000
	const retried = opts.retried === true
	// Lock state comes from the session record, never from the route and never
	// from a lone DOM marker — each of those lies in one direction. `app.vue`
	// pushes `/popup/auth` BEFORE `initNetworks()`/`initAccount()` finish and
	// `openPopup` returns inside that window, so an UNLOCKED wallet transiently
	// renders the password field; `header-lock` tracks `isLogined`, which the
	// lock chip clears before the background drops the session.
	//
	// The record's mere PRESENCE is not enough either: `SessionManager.restore`
	// deliberately leaves it in place for a passkey profile (WebAuthn needs a
	// user gesture, so the lock screen handles it) and preserves an undecodable
	// one for repair. Presence therefore has to be paired with a shape check and
	// with the route, giving two states that cannot both hold:
	//   unlocked = a well-formed record AND the popup is not on /popup/auth
	//   locked   = the password field is mounted AND no usable record exists
	// Anything else — including a LOCKED passkey profile, which keeps its record
	// while showing no password field — stays unresolved and lands in the
	// timeout below, which names it.
	//
	// On the BUDGET, stated plainly because the arc bans raising bounds to paper
	// over flakes: the old 5s governed a different question ("has the password
	// field rendered"), which is answered in milliseconds. This wait asks "has the
	// app DECIDED whether it is locked", and the answer legitimately takes as long
	// as bootstrap does — the same transient window that makes a lone route or DOM
	// read unsafe. A caller right after a service-worker restart (the canary) hit
	// exactly that: record well-formed, hash still /popup/auth, field mounted, i.e.
	// mid-decision, and 5s was simply too short to observe the outcome. The 30s
	// default covers a warm popup. Right after a service-worker restart the
	// decision IS the activation bootstrap (`loadProfile` → `bootstrapActiveProfile`
	// → `/popup/general`, with the route guard parking the popup on `/popup/auth`
	// until `isSessionChecked` flips), and on a starved prover-ON runner that has
	// outlived 30s three times while the same test allows 120s for the very same
	// bootstrap to reach `/popup/general`. Such a caller passes `decisionBudgetMs`
	// equal to that envelope; the two waits then measure one thing with one clock.
	// Nothing here accepts a state it previously rejected.
	const readLiveness = () =>
		page.evaluate(async () => Number((await chrome.storage.session.get("nulo:liveness"))["nulo:liveness"] ?? 0)).catch(() => 0)
	const livenessAtStart = await readLiveness()
	const readSession = () =>
		page.evaluate(async () => {
			const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
			let rec: { profile?: unknown; since?: unknown } | undefined
			try {
				rec = typeof raw === "string" ? JSON.parse(raw) : undefined
			} catch {
				rec = undefined
			}
			const wellFormed = !!rec && typeof rec.profile === "string" && typeof rec.since === "number"
			return { wellFormed, present: raw !== undefined, since: wellFormed ? (rec?.since as number) : 0 }
		})

	const state = await withTimeoutMessage(
		page
			.waitForFunction(
				async () => {
					const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
					let rec: { profile?: unknown; since?: unknown } | undefined
					try {
						rec = typeof raw === "string" ? JSON.parse(raw) : undefined
					} catch {
						rec = undefined
					}
					const wellFormed = !!rec && typeof rec.profile === "string" && typeof rec.since === "number"
					// The shell saying its boot-time check GAVE UP (service unreachable across the
					// backoff, or the bootstrap threw over an OPEN session) wins over BOTH decisions
					// below: a missing record with the field mounted looks exactly like a lock, but
					// under the marker the record may be live and a reconnect may clear the marker
					// at any moment — so it is never typed against. The product's own RETRY is
					// pressed once, and the wait resumes for a real decision.
					const outcome = document.querySelector("[data-boot-outcome]")?.getAttribute("data-boot-outcome")
					if (outcome) return `boot:${outcome}`
					const field = !!document.querySelector('[data-testid="auth-password-input"]')
					if (wellFormed && !window.location.hash.includes("/popup/auth")) return "unlocked"
					if (!wellFormed && field) return "locked"
					return null
				},
				{ timeout: decisionBudgetMs, polling: 200 },
			)
			.then((handle) => handle.jsonValue() as Promise<string | null>),
		async () => {
			// Was the service worker alive and writing while we waited? A frozen heartbeat
			// means the worker died or never came back — a different bug from a slow bootstrap.
			const livenessAtEnd = await readLiveness()
			const heartbeat = livenessAtEnd > livenessAtStart ? "advanced" : livenessAtEnd === 0 ? "unreadable" : "frozen"
			const diag = await page
				.evaluate(async () => {
					const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
					let rec: { profile?: unknown; since?: unknown } | undefined
					try {
						rec = typeof raw === "string" ? JSON.parse(raw) : undefined
					} catch {
						rec = undefined
					}
					const shape =
						raw === undefined
							? "absent"
							: rec && typeof rec.profile === "string" && typeof rec.since === "number"
								? "well-formed"
								: "malformed"
					return {
						hash: window.location.hash,
						record: shape,
						field: !!document.querySelector('[data-testid="auth-password-input"]'),
					}
				})
				.catch(() => ({ hash: "<unreadable>", record: "<unreadable>", field: false }))
			return (
				`ensureUnlocked: lock state never settled within ${decisionBudgetMs / 1000}s (hash: ${diag.hash}, session record: ${diag.record}, ` +
				`password field: ${diag.field}, service-worker heartbeat during the wait: ${heartbeat}${retried ? ", boot RETRY pressed once" : ""}). ` +
				"A well-formed record on /popup/auth WITH the password field and no data-boot-outcome is the activation bootstrap " +
				"still deciding; a frozen heartbeat says the worker stopped writing. One with NO password field is a LOCKED PASSKEY " +
				"profile, which this helper cannot unlock — drive the passkey ceremony instead."
			)
		},
	)

	if (state === "unlocked") return
	if (typeof state === "string" && state.startsWith("boot:")) {
		// The one recovery a user has; taken exactly once so a product boot failure that
		// survives its own retry still fails the test with its name, never a typed password.
		if (retried)
			throw new Error(
				`ensureUnlocked: the popup's boot-time check gave up twice (${state.slice(5)}) — a product boot failure, not a slow bootstrap`,
			)
		await clickByTestId(page, "boot-retry")
		return ensureUnlocked(page, password, { ...opts, retried: true })
	}

	// Scope the proof below to THIS unlock: the profile the auth screen is about
	// to unlock, and the record generation preceding it.
	const before = await readSession()
	const expectedProfile = await page.evaluate(
		async () => (await chrome.storage.local.get("nulo:ui:lastActiveProfile"))["nulo:ui:lastActiveProfile"] as string | undefined,
	)

	await replaceInputValue(page, '[data-testid="auth-password-input"]', password)
	await clickByTestId(page, "auth-submit")

	// Prove the UNLOCK, not the navigation: leaving `/popup/auth` is also what
	// the bootstrap's own redirect does, and any session record would also be
	// written by a concurrent unlock of a different profile. Require a
	// well-formed record for the expected profile, newer than the one we
	// started from.
	await withTimeoutMessage(
		page.waitForFunction(
			async (want: string | undefined, priorSince: number) => {
				const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
				let rec: { profile?: unknown; since?: unknown } | undefined
				try {
					rec = typeof raw === "string" ? JSON.parse(raw) : undefined
				} catch {
					rec = undefined
				}
				if (!rec || typeof rec.profile !== "string" || typeof rec.since !== "number") return false
				if (want !== undefined && rec.profile !== want) return false
				return rec.since > priorSince
			},
			{ timeout: 10_000, polling: 200 },
			expectedProfile,
			before.since,
		),
		async () => {
			const wrong = await page.evaluate(() => !!document.querySelector('[data-testid="error-text"]')).catch(() => false)
			const now = await readSession().catch(() => undefined)
			return (
				`ensureUnlocked: submitted the password but no session for profile ${expectedProfile ?? "<unknown>"} newer than ` +
				`${before.since} appeared within 10s (wrong-password shown: ${wrong}; record now: ${JSON.stringify(now)})`
			)
		},
	)
}

/**
 * Model the realistic post-import recovery: an MV3 service worker restart mid-import
 * drops the in-memory master secret, so in strict mode (the default) the just-imported
 * profile is locked until the user reopens and unlocks. This reproduces that recovery
 * deterministically, in one document:
 *
 *   lock   — drops the session record from chrome.storage.session, exactly as a
 *            worker restart drops the in-memory master;
 *   unlock — on the auth screen the lock lands on: re-derives the master, which
 *            re-provisions the encrypted per-chain PXE store key and boots the chain runtime.
 *
 * Asserts the wallet lands back on /popup/general. Callers then do a
 * store-dependent read (account address / on-chain balance) to prove the
 * encrypted PXE store actually RE-OPENED under the re-derived key — never wiped
 * (refuse-and-preserve), never dead-ended.
 */
export async function reopenAndRecoverAfterImport(page: Page, password = TEST_PASSWORD): Promise<void> {
	await lockWallet(page)
	await ensureUnlocked(page, password)
	await page.waitForFunction(() => window.location.hash.includes("/popup/general"), { timeout: 30_000 })
}

/** Opens the lock screen's profile chooser once the screen names a profile the service still lists:
 *  right after a delete it can name the deleted one until it settles, and a chooser pressed open
 *  then is closed by the landing that follows. */
export async function openProfileChooser(page: Page): Promise<void> {
	await pollUntil(
		async () => {
			const shown = await page.$eval('[data-testid="auth-profile"]', (el) => el.getAttribute("data-profile-name")).catch(() => null)
			if (!shown) return false
			const listed = await callService<{ name: string }[]>(page, "profile", "getProfiles")
			return listed.some((p) => p.name === shown)
		},
		(settled) => settled,
		{ label: "the lock screen names a listed profile", timeoutMs: 15_000, intervalMs: 100 },
	)
	await clickByTestId(page, "auth-profile")
	await page.waitForSelector('[data-testid="select-profile-new-btn"]', { visible: true, timeout: 10_000 })
}

/** Pick `profileId` on the lock screen and unlock it. `diagnostic` adds the caller's context to the
 *  timeout raised when the picker never admits the switch. */
export async function unlockProfile(page: Page, profileId: string, password: string, diagnostic?: () => Promise<string>): Promise<void> {
	await openProfileChooser(page)
	const row = `[data-testid="select-profile-row"][data-profile-id="${profileId}"]`
	await page.waitForSelector(row, { visible: true, timeout: 10_000 })
	await clickSelector(page, row)
	// The picker empties once the switch is admitted and the profile to unlock is persisted.
	await withTimeoutMessage(
		page.waitForFunction(() => !document.querySelector('[data-testid="select-profile-row"]'), { timeout: 10_000 }),
		async () => `unlockProfile: the picker did not admit the switch to ${profileId}${diagnostic ? ` (${await diagnostic()})` : ""}`,
	)
	await ensureUnlocked(page, password)
	await waitForHash(page, "#/popup/general", 30_000)
}

/** The network e2e build's incoming tick. An unlock installs the schedulers with a scan of its own,
 *  so a receipt shown sooner than one tick after the unlock was found by that scan; on a build with
 *  the production tick the bound only tightens. */
export const INCOMING_SCAN_INTERVAL_MS = E2E_WALLET_CLOCK_VALUES.incomingPollMs

/** Unlock a locked wallet, then wait on History for an incoming row whose kind chip reads `label`
 *  and amount reads `amount`. Resolves the time from helper entry to the row. */
export async function unlockUntilIncomingRow(page: Page, label: string, amount: string, timeout = 180_000): Promise<number> {
	const unlockedFrom = Date.now()
	await ensureUnlocked(page, TEST_PASSWORD)
	await waitForHash(page, "#/popup/general", 60_000)
	await navigateByHash(page, "#/popup/activity")
	await page.waitForFunction(
		([lbl, amt]) =>
			[...document.querySelectorAll('[data-testid="tx-incoming-card"]')].some(
				(card) =>
					(card.querySelector('[data-testid="tx-incoming-kind-chip"]')?.textContent || "").trim() === lbl &&
					(card.querySelector('[data-testid="activity-amount"]')?.textContent || "").trim() === amt,
			),
		{ timeout, polling: 500 },
		[label, amount] as const,
	)
	return Date.now() - unlockedFrom
}

/** Drive the change-password form. Assumes you're on `/popup/settings/profile`
 *  or already on the change-password page; navigates explicitly to be
 *  idempotent. Submits and waits for the success toast. Caller is then on
 *  the auth or settings page (router.back()). */
export async function changePassword(page: Page, oldPwd: string, newPwd: string): Promise<void> {
	await navigateByHash(page, "#/popup/settings/security/change-password")
	await page.waitForSelector('[data-testid="current-password-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="current-password-input"]', oldPwd)
	await replaceInputValue(page, '[data-testid="new-password-input"]', newPwd)
	await replaceInputValue(page, '[data-testid="new-password-repeat-input"]', newPwd)
	await clickByTestId(page, "change-password-submit-btn")
}

/** From the auth screen, click "Reset Profile" to open the
 *  ForgotPasswordPopup. Resolves once the popup is mounted. */
export async function openForgotPasswordFromAuth(page: Page): Promise<void> {
	await clickByTestId(page, "auth-reset")
	await page.waitForSelector('[data-testid="forgot-reset-btn"]', { visible: true, timeout: 5_000 })
}

/**
 * Turns strict mode off through Settings → Lock and its confirmation, asserting the flag flipped, then
 * locks and unlocks so the next session persists its bearer. Hash navigation, not the nav tab:
 * clicking through the shell races the routing an unlock is still finishing.
 */
export async function optOutOfStrictMode(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/settings/lock")
	await page.waitForSelector('[data-testid="strict-security-toggle"]', { visible: true, timeout: 10_000 })
	await clickByTestId(page, "strict-security-toggle")
	await acceptConfirmPopup(page)
	await withTimeoutMessage(
		page.waitForFunction(
			() => document.querySelector('[data-testid="strict-security-toggle"]')?.getAttribute("data-toggle-active") === "false",
			{ timeout: 10_000, polling: 200 },
		),
		async () => {
			const seen = await page
				.evaluate(
					() =>
						document.querySelector('[data-testid="strict-security-toggle"]')?.getAttribute("data-toggle-active") ?? "<absent>",
				)
				.catch(() => "<unreadable>")
			return `strict-security-toggle never flipped off (still ${seen}) — the opt-out this test depends on did not happen`
		},
	)
	await navigateByHash(page, "#/popup/general")

	await lockWallet(page)
	await page.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="auth-password-input"]', TEST_PASSWORD)
	await clickByTestId(page, "auth-submit")
	await waitForHash(page, "#/popup/general", 10_000)
}
