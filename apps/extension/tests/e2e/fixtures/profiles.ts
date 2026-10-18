import type { Page } from "puppeteer"
import { defaultProfileName } from "@/utils/profile-name"
import { clickByTestId, expectNameFieldPrefill, replaceInputValue, waitForHash } from "./dom"
import { navigateByHash } from "./navigation"
import { readSessionRow, waitForSessionRow } from "./session"

/** Create a profile from the lock screen's picker and land on its home screen: creating a profile
 *  activates it. Starts unlocked with no approved send running, so the lock button locks without
 *  asking. The name field must open prefilled with the default the stored profiles give before
 *  `name` replaces it. Returns the new profile's id. */
export async function createAndActivateProfile(page: Page, name: string, password: string): Promise<string> {
	const previous = (await readSessionRow(page))?.profile
	await clickByTestId(page, "header-lock")
	await page.waitForSelector('[data-testid="auth-profile"]', { visible: true, timeout: 15_000 })
	await clickByTestId(page, "auth-profile")
	await page.waitForSelector('[data-testid="select-profile-new-btn"]', { visible: true, timeout: 10_000 })
	// Read from storage: the picker draws its button before its rows arrive.
	const before = await readProfileNames(page)
	await clickByTestId(page, "select-profile-new-btn")

	await expectNameFieldPrefill(page, "register-page", "register-name-input", defaultProfileName(before))
	await replaceInputValue(page, '[data-testid="register-name-input"]', name)
	await replaceInputValue(page, '[data-testid="register-password-input"]', password)
	await replaceInputValue(page, '[data-testid="register-password-confirm-input"]', password)
	await clickByTestId(page, "register-submit-btn")
	await waitForHash(page, "#/popup/general", 90_000)
	await expectNewProfileNamed(page, before, name)
	return (await waitForSessionRow(page, (row) => row.profile !== previous)).profile
}

/** Every stored profile's name, in storage order. EntityStorage rows live under
 *  `nulo:core:profiles@<id>`. */
export async function readProfileNames(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		return Object.entries(all)
			.filter(([key, raw]) => key.startsWith("nulo:core:profiles@") && typeof raw === "string")
			.map(([, raw]) => (JSON.parse(raw as string) as { name: string }).name)
	})
}

/** Waits for the stored profile names to become `before` plus `expected`, and fails on any other
 *  outcome, a profile lost or renamed included. */
export async function expectNewProfileNamed(page: Page, before: readonly string[], expected: string, timeoutMs = 10_000): Promise<void> {
	const want = [...before, expected].sort()
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const stored = (await readProfileNames(page)).sort()
		if (stored.length === want.length && stored.every((name, i) => name === want[i])) return
		if (stored.length > before.length || Date.now() > deadline)
			throw new Error(`expected the profiles ${JSON.stringify(want)}, got ${JSON.stringify(stored)}`)
		await new Promise((resolve) => setTimeout(resolve, 200))
	}
}

/** Read the active profile's display name from the reset-profile page root,
 *  which exposes it via `data-profile-name`. The reset flow requires typing
 *  the exact name to confirm; tests must read it dynamically because the
 *  default is auto-generated (`Profile 1`, `Profile 2`, …). */
export async function getActiveProfileName(page: Page): Promise<string> {
	const name = await page.evaluate(() => {
		const root = document.querySelector("[data-profile-name]") as HTMLElement | null
		return root?.getAttribute("data-profile-name") ?? ""
	})
	if (!name) throw new Error("getActiveProfileName: no element with data-profile-name on the current page")
	return name
}

/** Drive the reset-profile flow: tick all 3 checkboxes, type the active
 *  profile's name into the confirm input, and submit. Profile name is read
 *  from `data-profile-name` on the page root because it's auto-generated.
 *
 *  Navigation is SETTLE-STABLE, not one-shot: setting `location.hash` updates the
 *  URL before vue-router commits, so a hash-equality wait passes while a competing
 *  `router.push("/popup/general")` (SW-reconnect `loadProfile` re-run, post-unlock
 *  bootstrap churn) can still supersede the in-flight navigation and revert the
 *  route — the checkbox then never mounts. Observed live: the 5s checkbox wait
 *  parked with the app fully back on general. The awaited signal here is "the
 *  reset route COMMITTED (checkbox mounted) and STUCK"; a reverted hash triggers
 *  a re-navigate, not a longer clock.
 *
 *  After submit the router redirects to either `/popup/auth` (if other
 *  profiles remain) or `/popup/register` (if it was the last profile). The
 *  caller asserts the redirect; this helper does not. */
export async function resetProfile(page: Page): Promise<void> {
	const RESET_HASH = "#/popup/settings/security/reset"
	// One re-navigation covers the single characterized race (a competing push
	// already in flight when the hash was set supersedes our navigation). A SECOND
	// revert would mean the app is repeatedly redirecting away from reset — a
	// product-level condition this helper must surface, never normalize.
	const ATTEMPTS = 2
	// The dwell must be monotonic: the route+checkbox condition has to hold
	// CONTINUOUSLY for the window, tracked in-page — a plain waitForFunction
	// resolves on its first truthy poll and proves nothing about stability.
	const DWELL_MS = 1_500

	// Poll-based hash trajectory (vue-router hash nav is pushState-based — no
	// hashchange/popstate fires), dumped into every failure for race forensics.
	// Re-armed per call (a prior call's timer is cleared) so a second
	// resetProfile on the same page never reports a frozen call-1 trace.
	await page.evaluate(() => {
		const w = window as unknown as { __nuloResetNavTrace?: Array<{ t: number; hash: string }>; __nuloResetNavTraceTimer?: number }
		if (w.__nuloResetNavTraceTimer) window.clearInterval(w.__nuloResetNavTraceTimer)
		w.__nuloResetNavTrace = [{ t: Date.now(), hash: window.location.hash }]
		w.__nuloResetNavTraceTimer = window.setInterval(() => {
			const trace = w.__nuloResetNavTrace as Array<{ t: number; hash: string }>
			if (window.location.hash !== trace[trace.length - 1].hash) trace.push({ t: Date.now(), hash: window.location.hash })
		}, 100)
	})

	let lastDiag = ""
	let settled = false
	for (let attempt = 0; attempt < ATTEMPTS && !settled; attempt++) {
		try {
			// INSIDE the try: the competing-push race can also land between
			// navigateByHash's hash-set and its equality poll — that throw must
			// count as a failed attempt (retry + diagnostics), never escape the
			// envelope uncaught with the trace interval still running.
			await navigateByHash(page, RESET_HASH)
			await page.waitForSelector('[data-testid="reset-checkbox-permanent"]', { visible: true, timeout: 5_000 })
			await page.evaluate(() => {
				;(window as unknown as { __resetStableSince: number | null }).__resetStableSince = null
			})
			await page.waitForFunction(
				({ h, dwellMs }: { h: string; dwellMs: number }) => {
					const w = window as unknown as { __resetStableSince: number | null }
					const ok = window.location.hash === h && !!document.querySelector('[data-testid="reset-checkbox-permanent"]')
					if (!ok) {
						w.__resetStableSince = null
						return false
					}
					// performance.now() — the dwell must be monotonic; a wall-clock
					// adjustment could silently shorten or stretch it.
					if (w.__resetStableSince == null) w.__resetStableSince = performance.now()
					return performance.now() - w.__resetStableSince >= dwellMs
				},
				{ timeout: 8_000, polling: 150 },
				{ h: RESET_HASH, dwellMs: DWELL_MS },
			)
			settled = true
		} catch {
			lastDiag = JSON.stringify(
				await page
					.evaluate(() => ({
						hash: window.location.hash,
						pageRootMounted: !!document.querySelector("[data-profile-name]"),
						checkboxInDom: !!document.querySelector('[data-testid="reset-checkbox-permanent"]'),
						navTrace: (window as unknown as { __nuloResetNavTrace?: Array<{ t: number; hash: string }> }).__nuloResetNavTrace,
						testidsOnPage: [...document.querySelectorAll("[data-testid]")]
							.slice(0, 12)
							.map((el) => el.getAttribute("data-testid")),
						readyState: document.readyState,
					}))
					.catch((e) => ({ evalFailed: String(e) })),
			)
		}
	}
	await page
		.evaluate(() => {
			const w = window as unknown as { __nuloResetNavTraceTimer?: number }
			if (w.__nuloResetNavTraceTimer) window.clearInterval(w.__nuloResetNavTraceTimer)
		})
		.catch(() => {})
	if (!settled) {
		throw new Error(
			`resetProfile: reset route never held for ${DWELL_MS}ms across ${ATTEMPTS} navigations; last parked state: ${lastDiag}`,
		)
	}
	await confirmProfileReset(page, 10_000)
}

/** The reset page's deliberate-delete ritual: the three acknowledgements, the active profile's
 *  name typed back, and submit, which enables only then. The page must already be at the reset
 *  route; `timeoutMs` bounds the first checkbox's mount and the submit's enable. The caller
 *  asserts where the app lands. */
export async function confirmProfileReset(page: Page, timeoutMs: number): Promise<void> {
	await page.waitForSelector('[data-testid="reset-checkbox-permanent"]', { visible: true, timeout: timeoutMs })
	await clickByTestId(page, "reset-checkbox-permanent")
	await clickByTestId(page, "reset-checkbox-undone")
	await clickByTestId(page, "reset-checkbox-sure")
	await replaceInputValue(page, '[data-testid="reset-confirm-input"]', await getActiveProfileName(page))
	await clickByTestId(page, "reset-submit-btn", timeoutMs)
}

/** Capture the sole profile's id from raw storage and PROVE its row exists — the
 *  pre-condition that makes a later "row absent" read mean DELETED rather than
 *  never-created. Expects exactly one profile row (the shape of every reset-flow
 *  e2e); throws otherwise so a multi-profile drift can't silently weaken the
 *  purge assertion. */
export async function captureSoleProfileId(page: Page): Promise<string> {
	const ids = await page.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		return Object.keys(all)
			.filter((k) => k.startsWith("nulo:core:profiles@"))
			.map((k) => k.slice("nulo:core:profiles@".length))
	})
	if (ids.length !== 1) throw new Error(`captureSoleProfileId: expected exactly 1 profile row, found ${ids.length}`)
	return ids[0]
}

/** Wait until profile deletion COMPLETED for `profileId`: its row gone, its exact
 *  tombstone (`nulo:core:profile-tombstones@<id>`) gone, and every given owned
 *  root emptied. The tombstone is written BEFORE the row delete and cleared only
 *  after the coordinator's full awaited purge resolves, so this combined
 *  predicate — anchored on a row proven to exist beforehand — is the same
 *  completion fact the reset page's awaited `deleteProfile` observes. Tombstone
 *  absence ALONE would also be true before deletion ever started, which is why
 *  callers must capture the id via `captureSoleProfileId` first. On timeout the
 *  remaining keys are dumped: a persisting tombstone+row means a rejected or
 *  wedged purge; owned-root leftovers mean a partial cascade. */
export async function waitForProfilePurged(
	page: Page,
	profileId: string,
	opts: { ownedRoots?: string[]; timeoutMs?: number } = {},
): Promise<void> {
	const { ownedRoots = [], timeoutMs = 75_000 } = opts
	const deadline = Date.now() + timeoutMs
	let last: Record<string, boolean> = {}
	while (Date.now() < deadline) {
		last = await page.evaluate(
			async ({ id, roots }: { id: string; roots: string[] }) => {
				const all = await chrome.storage.local.get(null)
				const keys = Object.keys(all)
				const state: Record<string, boolean> = {
					profileRow: keys.includes(`nulo:core:profiles@${id}`),
					tombstone: keys.includes(`nulo:core:profile-tombstones@${id}`),
				}
				for (const r of roots) state[r] = keys.some((k) => k.startsWith(`${r}@`))
				return state
			},
			{ id: profileId, roots: ownedRoots },
		)
		if (!Object.values(last).some(Boolean)) return
		await new Promise((r) => setTimeout(r, 500))
	}
	// The persisting tombstone+row combination IS the rejected-or-wedged signature.
	// Session presence distinguishes "delete never started (still logged in,
	// nothing changed)" from "mid-purge wedge".
	const sessionPresent = await page
		.evaluate(async () => {
			const r = await chrome.storage.session.get("nulo:core:session")
			return !!r["nulo:core:session"]
		})
		.catch(() => "unreadable")
	throw new Error(
		`waitForProfilePurged: purge incomplete after ${timeoutMs}ms for profile ${profileId}: ${JSON.stringify(last)}; sessionPresent=${sessionPresent}`,
	)
}

/** The words a recovery phrase grid shows, in order: Settings' grid is `reveal-content`, the
 *  onboarding step's `onboarding-phrase`. */
export async function readRecoveryWords(page: Page, grid = "reveal-content"): Promise<string[]> {
	await page.waitForSelector(`[data-testid="${grid}-word"]`, { visible: true, timeout: 15_000 })
	return page.$$eval(`[data-testid="${grid}-word"]`, (words) => words.map((word) => word.textContent?.trim() ?? ""))
}

/** Drive the seed-phrase reveal flow on `/popup/settings/security/export/seed` and return its words. */
export async function revealSeedPhrase(page: Page, password: string): Promise<string[]> {
	await navigateByHash(page, "#/popup/settings/security/export/seed")
	await clickByTestId(page, "agree-continue-btn")
	await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="unlock-password-input"]', password)
	await clickByTestId(page, "unlock-submit-btn")
	return readRecoveryWords(page)
}

/** A password wallet's Home without the Get started card: the phrase revealed, then Hide. The card
 *  sits above Home's lists, so a spec that reads a row where Home rests needs it gone first. */
export async function clearGetStarted(page: Page, password: string): Promise<void> {
	await revealSeedPhrase(page, password)
	await navigateByHash(page, "#/popup/general")
	await page.waitForSelector('[data-testid="get-started-hide"]', { visible: true, timeout: 60_000 })
	await clickByTestId(page, "get-started-hide")
	await page.waitForFunction(() => !document.querySelector('[data-testid="get-started"]'), { timeout: 15_000, polling: 100 })
}

/** Open EditProfilePopup from /popup/settings/profile, replace the name,
 *  submit. Caller asserts on the new name elsewhere (toast / settings row /
 *  auth pill). */
export async function renameProfile(page: Page, newName: string): Promise<void> {
	await navigateByHash(page, "#/popup/settings/profile")
	await clickByTestId(page, "identity-name-row")
	await page.waitForSelector('[data-testid="profile-name-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="profile-name-input"]', newName)
	await clickByTestId(page, "edit-profile-submit")
}
