/**
 * The `pre-update` start: the release named by `NULO_E2E_UPDATE_FROM` makes a password profile and
 * then a passkey profile through its own popup, the candidate replaces it in place, and the run
 * starts on the candidate with the model's symbols bound to the rows the release wrote.
 */
import { randomBytes } from "node:crypto"
import type { Page } from "puppeteer"
import { clickByTestId, replaceInputValue, waitForHash } from "../../fixtures/dom"
import type { ExtensionContext } from "../../fixtures/extension"
import { setupPasskeyVirtualAuth } from "../../fixtures/passkey"
import { settleClosedPopup } from "../../fixtures/popup-leave"
import { readLocalStorage } from "../../fixtures/update/in-place"
import { openPopup, waitForServiceReady } from "../../fixtures/wallet-pages"
import { bindProfile, checkPreUpdate, checkSession, type Violation } from "./checkers"
import { readProfiles, readSession, SEALED_PREFIXES } from "./collect"
import { PRE_UPDATE_NAMES, startWorld } from "./model"
import { capturePrf, takePrf } from "./prf-capture"
import type { RunState } from "./state"
import { waitForRoute } from "./ui"

const PROFILE_ROOT = "nulo:core:profiles@"
const CREATE_MS = 90_000

/** What the release left: its profile rows as stored, its plaintext rows in roots sealed since, the
 *  password it set and the passkey's answers it received. */
export interface Released {
	rows: Record<string, string>
	plain: Record<string, string>
	password: string
	prf: string[]
}

const ENVELOPE = /^\{"profileId":"[^"]+","sealed":"[^"]+"\}$/

const plainSealedRows = (stored: Record<string, unknown>): Record<string, string> =>
	Object.fromEntries(
		Object.entries(stored).filter(
			(e): e is [string, string] =>
				typeof e[1] === "string" && SEALED_PREFIXES.some((p) => e[0].startsWith(p)) && !ENVELOPE.test(e[1]),
		),
	)

const profileRows = (stored: Record<string, unknown>): Record<string, string> =>
	Object.fromEntries(Object.entries(stored).filter(([k, v]) => k.startsWith(PROFILE_ROOT) && typeof v === "string")) as Record<
		string,
		string
	>

async function lockToAuth(page: Page): Promise<void> {
	await clickByTestId(page, "header-lock")
	await waitForHash(page, "#/popup/auth", 15_000)
}

/** On the release: the first profile with a password, then a passkey profile from the lock
 *  screen's New profile, then locked, the passkey profile selected. */
export async function populateRelease(ctx: ExtensionContext): Promise<Released> {
	const password = `Chaos-S1-${randomBytes(9).toString("base64url")}`
	const page = await openPopup(ctx)
	const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
	await capturePrf(page)
	try {
		await waitForHash(page, "#/popup/register", 15_000)
		await waitForServiceReady(page, 15_000)
		await clickByTestId(page, "register-create-btn")
		await page.waitForSelector('[data-testid="register-method-password"]', { visible: true, timeout: 10_000 })
		await clickByTestId(page, "register-method-password")
		await replaceInputValue(page, '[data-testid="register-password-input"]', password)
		await replaceInputValue(page, '[data-testid="register-password-confirm-input"]', password)
		await clickByTestId(page, "register-submit-btn")
		await waitForHash(page, "#/popup/general", CREATE_MS)
		await lockToAuth(page)
		await clickByTestId(page, "auth-profile")
		await clickByTestId(page, "select-profile-new-btn")
		await settleClosedPopup(page, "select-profile-new-btn")
		await page.waitForSelector('[data-testid="register-name-input"]', { visible: true, timeout: 10_000 })
		await replaceInputValue(page, '[data-testid="register-name-input"]', PRE_UPDATE_NAMES.passkey)
		await clickByTestId(page, "register-method-passkey")
		await clickByTestId(page, "register-submit-btn")
		await waitForHash(page, "#/popup/general", CREATE_MS)
		await lockToAuth(page)
		const stored = await readLocalStorage(ctx)
		return { rows: profileRows(stored), plain: plainSealedRows(stored), password, prf: await takePrf(page) }
	} finally {
		await auth.cleanup().catch(() => {})
		await page.close().catch(() => {})
	}
}

/** Binds the start's two profiles to the release's rows by name and type, then checks the start:
 *  the rows the release wrote, byte for byte, each listed, the retired one as retired, and the
 *  wallet locked on it, before any step could lock it. */
export async function bindPreUpdate(s: RunState, released: Released): Promise<Violation[]> {
	const world = startWorld("pre-update")
	s.secrets.set("S1", released.password)
	s.legacyPlain = released.plain
	for (const value of released.prf) s.prf.add(value)
	const rows = Object.values(released.rows).map((raw) => JSON.parse(raw) as { id: string; name: string; type: string })
	for (const p of world.profiles) {
		const type = p.method
		const row = rows.find((r) => r.name === PRE_UPDATE_NAMES[type] && r.type === type)
		if (row) bindProfile(s.bindings, p.ref, row.id, new Set())
	}
	const updated = profileRows(await readLocalStorage(s.ctx))
	const listed = (await readProfiles(s.anchor)).listed
	await waitForRoute(s.anchor, "#/popup/auth", 30_000).catch(() => {})
	const session = await readSession(s.anchor, [{ label: "anchor", page: s.anchor, anchor: true }], true)
	return [...checkPreUpdate(world, { released: released.rows, updated, listed }, s.bindings), ...checkSession(world, session, s.bindings)]
}
