/**
 * The `pre-update` start: the release named by `NULO_E2E_UPDATE_FROM` makes a password profile and
 * then a passkey profile through its own popup, the candidate replaces it in place, and the run
 * starts on the candidate with the model's symbols bound to the rows the release wrote.
 */
import { randomBytes } from "node:crypto"
import type { Page } from "puppeteer"
import { readyToast } from "@/components/stale-network/copy"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { clickByTestId, replaceInputValue, waitForHash } from "../../fixtures/dom"
import type { ExtensionContext } from "../../fixtures/extension"
import { setupPasskeyVirtualAuth } from "../../fixtures/passkey"
import { settleClosedPopup } from "../../fixtures/popup-leave"
import { readLocalStorage } from "../../fixtures/update/in-place"
import { openPopup, waitForServiceReady } from "../../fixtures/wallet-pages"
import { waitForToastGone } from "../../fixtures/widgets"
import { answerUpdatedTerms } from "../legal-drivers"
import { answerArrival } from "../network-arrival"
import { readyToastSaysMoved, takeoverScreen } from "../stale-network"
import { pollUntil } from "../../fixtures/poll"
import { bindProfile, checkPreUpdate, checkSession, lostRelease, releaseRowOwner, type StoredEntry, type Violation } from "./checkers"
import { readCensus, readProfiles, readSession, SEALED_PREFIXES } from "./collect"
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
	/** Everything the release stored, read once its profiles were made. */
	entries: Record<string, unknown>
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
		return { rows: profileRows(stored), plain: plainSealedRows(stored), password, prf: await takePrf(page), entries: stored }
	} finally {
		await auth.cleanup().catch(() => {})
		await page.close().catch(() => {})
	}
}

/** The Testnet chain the release's network row names. */
function releasedTestnet(released: Released): number | undefined {
	for (const [key, text] of Object.entries(released.plain)) {
		if (!key.startsWith("nulo:core:networks@")) continue
		const row = JSON.parse(text) as { kind?: unknown; chainId?: unknown }
		if (row.kind === "testnet" && typeof row.chainId === "number") return row.chainId
	}
	return undefined
}

/** The first open of the release's profile, as `update-replay` drives it: the reset's takeover when
 *  the release's Testnet row names a chain this build no longer seeds, then the Terms sheet and the
 *  Mainnet arrival the release's storage calls for. That test proves what each writes; the run only
 *  answers them, between steps, so no step's census holds their writes. */
function answerFirstOpen(released: Released): (s: RunState) => Promise<void> {
	return async (s) => {
		const page = s.anchor
		if (releasedTestnet(released) !== CHAIN_IDS.TESTNET) {
			await takeoverScreen(page, "network-reset", 30_000)
			await clickByTestId(page, "stale-network-reset")
			await page.waitForSelector('[data-testid="stale-confirm-submit"]', { visible: true, timeout: 10_000 })
			await clickByTestId(page, "stale-confirm-submit")
			const moved = await readyToastSaysMoved(page, "Testnet")
			await waitForHash(page, "#/popup/general", 30_000)
			await waitForToastGone(page, readyToast("Testnet", moved).sub, 15_000)
		}
		await answerUpdatedTerms(page, released.entries)
		await answerArrival(page, released.entries)
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
		if (row && !p.retired) s.afterUpdate = { ref: p.ref, answer: answerFirstOpen(released) }
	}
	const updated = profileRows(await readLocalStorage(s.ctx))
	const listed = (await readProfiles(s.anchor)).listed
	const onAuth = await waitForRoute(s.anchor, "#/popup/auth", 30_000).then(
		() => true,
		() => false,
	)
	const session = await readSession(s.anchor, [{ label: "anchor", page: s.anchor, anchor: true }], true)
	const start = checkPreUpdate(world, { released: released.rows, updated, listed, onAuth }, s.bindings)
	return [...start, ...checkSession(world, session, s.bindings)]
}

const RELEASE_SEAL_MS = 15_000

/**
 * Ends the exemption of the release rows `id` owns, now that it is open: the wallet seals them
 * asynchronously once the profile's row keys are ready, so each gets 15 s to leave the release's
 * text, then is judged by the sealed-root rule like any row. `before` is the census from before the
 * open; returns the roots where a row left its key with no sealed row taking its place.
 */
export async function expireRelease(s: RunState, id: string, before: readonly StoredEntry[]): Promise<string[]> {
	const ids = new Set(s.bindings.profiles.values())
	const due = Object.entries(s.legacyPlain).filter(([key, text]) => releaseRowOwner(key, text, ids) === id)
	if (!due.length) return []
	const left = () =>
		s.anchor
			.evaluate(async (rows: [string, string][]) => {
				const now = await chrome.storage.local.get(rows.map(([key]) => key))
				return rows.every(([key, text]) => now[key] !== text)
			}, due)
			.catch(() => false)
	await pollUntil(left, Boolean, { label: "release rows sealed", timeoutMs: RELEASE_SEAL_MS, intervalMs: 250 }).catch(() => {})
	for (const [key] of due) delete s.legacyPlain[key]
	return lostRelease(
		due.map(([key]) => key),
		before,
		await readCensus(s.anchor),
		id,
	)
}
