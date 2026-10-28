/**
 * The `pre-update-*` starts: the release named by `NULO_E2E_UPDATE_FROM` makes a password profile
 * and then a passkey profile through its own popup, the candidate replaces it in place, and the run
 * starts on the candidate with the model's symbols bound to the rows the release wrote.
 */
import { randomBytes } from "node:crypto"
import type { Page } from "puppeteer"
import { readyToast } from "@/components/stale-network/copy"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { clickByTestId, replaceInputValue, waitForHash } from "../../fixtures/dom"
import type { ExtensionContext } from "../../fixtures/extension"
import { type PasskeyAuthSetup, setupPasskeyVirtualAuth } from "../../fixtures/passkey"
import { settleClosedPopup } from "../../fixtures/popup-leave"
import { readLocalStorage } from "../../fixtures/update/in-place"
import type { ReleaseTraits } from "../../fixtures/update/release"
import { shownOverlays } from "../../fixtures/update/verify"
import { openPopup, waitForServiceReady } from "../../fixtures/wallet-pages"
import { waitForToastGone } from "../../fixtures/widgets"
import { type NetworkRow, readNetworkRows } from "../identity-rows"
import { answerUpdatedTerms, expectNoTermsSheet } from "../legal-drivers"
import { answerArrival } from "../network-arrival"
import { readyToastSaysMoved, takeoverScreen } from "../stale-network"
import { pollUntil } from "../../fixtures/poll"
import {
	type Answer,
	bindCeremonies,
	bindProfile,
	checkPreUpdate,
	checkProfiles,
	checkSession,
	lostRelease,
	releaseRowOwner,
	type StoredEntry,
	type Violation,
} from "./checkers"
import { readCensus, readProfiles, readSession, SEALED_PREFIXES } from "./collect"
import { PRE_UPDATE_NAMES, type ProfileRef, type StartState, startWorld } from "./model"
import { capturePrf, minted, takeAll } from "./prf-capture"
import type { FirstOpen, RunState } from "./state"
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
	/** The credential ids the release's page received, so the run binds `K1` from the authenticator's
	 *  answer rather than from the row under test. */
	answers: Answer[]
	/** Everything the release stored, read once its profiles were made. */
	entries: Record<string, unknown>
	/** The Testnet chain the release's own network service served its password profile. */
	testnet: number
	/** The release's page, parked off the extension, and its authenticator, when the candidate still
	 *  opens the release's passkey: Chrome keeps a credential only on its page. */
	held?: { page: Page; auth: PasskeyAuthSetup }
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

function testnetOf(rows: readonly NetworkRow[]): number {
	const row = rows.find((r) => r.kind === "testnet")
	if (!row) throw new Error("the release serves no Testnet network")
	return row.chainId
}

/** On the release: the first profile with a password, then a passkey profile from the lock
 *  screen's New profile, then locked, the passkey profile selected. */
export async function populateRelease(ctx: ExtensionContext, passkey: ReleaseTraits["passkey"]): Promise<Released> {
	const password = `Chaos-S1-${randomBytes(9).toString("base64url")}`
	const page = await openPopup(ctx)
	const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
	let held: Released["held"]
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
		const testnet = testnetOf(await readNetworkRows(page))
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
		const { prf, answers } = await takeAll(page)
		if (passkey === "unlocks") {
			// The update closes every extension page, so the page waits off the extension until the
			// candidate runs.
			await page.goto("about:blank")
			held = { page, auth }
		}
		return { rows: profileRows(stored), plain: plainSealedRows(stored), password, prf, answers, entries: stored, testnet, held }
	} finally {
		if (!held) {
			await auth.cleanup().catch(() => {})
			await page.close().catch(() => {})
		}
	}
}

/**
 * The first open of each release profile the candidate opens, as `update-replay` drives it: the
 * reset's takeover when the release's Testnet is a chain this build no longer seeds, else no
 * overlay; then the Terms sheet and the Mainnet arrival the release's storage calls for. The Terms
 * acceptance is the device's, so only the first open answers it from the release; every later one
 * holds that no sheet shows. That test proves what each writes; the run only answers them, between
 * steps, so no step's census holds their writes.
 */
function firstOpens(released: Released, refs: readonly ProfileRef[]): Map<ProfileRef, FirstOpen> {
	let termsAnswered = false
	const answer: FirstOpen = async (s) => {
		const page = s.anchor
		if (released.testnet !== CHAIN_IDS.TESTNET) {
			await takeoverScreen(page, "network-reset", 30_000)
			await clickByTestId(page, "stale-network-reset")
			await page.waitForSelector('[data-testid="stale-confirm-submit"]', { visible: true, timeout: 10_000 })
			await clickByTestId(page, "stale-confirm-submit")
			const moved = await readyToastSaysMoved(page, "Testnet")
			await waitForHash(page, "#/popup/general", 30_000)
			await waitForToastGone(page, readyToast("Testnet", moved).sub, 15_000)
		} else {
			const shown = await shownOverlays(page)
			if (shown.length) throw new Error(`the update raised ${shown.join(", ")} over a Testnet this build seeds`)
		}
		if (termsAnswered) await expectNoTermsSheet(page)
		else await answerUpdatedTerms(page, released.entries)
		termsAnswered = true
		await answerArrival(page, released.entries)
	}
	return new Map(refs.map((ref) => [ref, answer]))
}

/** Binds the start's two profiles to the release's rows by name and type, and a passkey the
 *  candidate opens to the credential the release's page received; then checks the start: the rows
 *  the release wrote, byte for byte, each listed with its retired mark and its credential, and the
 *  wallet locked on the passkey profile, before any step could lock it. */
export async function bindPreUpdate(s: RunState, released: Released, start: StartState): Promise<Violation[]> {
	const world = startWorld(start)
	s.secrets.set("S1", released.password)
	s.legacyPlain = released.plain
	for (const value of released.prf) s.prf.add(value)
	const rows = Object.values(released.rows).map((raw) => JSON.parse(raw) as { id: string; name: string; type: string })
	const bound: Violation[] = []
	const opens: ProfileRef[] = []
	for (const p of world.profiles) {
		const type = p.method
		const row = rows.find((r) => r.name === PRE_UPDATE_NAMES[type] && r.type === type)
		if (row) bindProfile(s.bindings, p.ref, row.id, new Set())
		if (!row || p.retired) continue
		opens.push(p.ref)
		const wrong = p.credential && bindCeremonies(s.bindings, { answers: released.answers, picks: [] }, minted(p.credential))
		if (wrong) bound.push({ oracle: "O2", message: `the release's passkey answers bind no ${p.credential}`, detail: wrong })
	}
	s.afterUpdate = firstOpens(released, opens)
	const updated = profileRows(await readLocalStorage(s.ctx))
	const reading = await readProfiles(s.anchor)
	const onAuth = await waitForRoute(s.anchor, "#/popup/auth", 30_000).then(
		() => true,
		() => false,
	)
	const session = await readSession(s.anchor, [{ label: "anchor", page: s.anchor, anchor: true }], true)
	return [
		...bound,
		...checkPreUpdate(world, { released: released.rows, updated, listed: reading.listed, onAuth }, s.bindings),
		...checkProfiles(world, reading, s.bindings),
		...checkSession(world, session, s.bindings),
	]
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
