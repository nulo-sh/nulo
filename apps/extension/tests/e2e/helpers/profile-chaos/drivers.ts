/**
 * One driver per catalog action: it drives the popup by testid from wherever the last step left
 * it, binds every symbol the action introduces, and reports the outcome it saw. A driver never
 * decides what the wallet should have done; the runner compares what it saw with the model.
 */
import type { Page } from "puppeteer"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { openProfileChooser, waitForLockScreen } from "../../fixtures/auth"
import { extensionUrl, gotoExtensionPage, stopBackground } from "../../fixtures/browser"
import { clickByTestId, replaceInputValue } from "../../fixtures/dom"
import { answerWithCredential, holdNextGet, withholdGetPrf } from "../../fixtures/passkey"
import { confirmProfileReset, readRecoveryWords } from "../../fixtures/profiles"
import { lockFromAnotherWindow } from "../../fixtures/session"
import { settleClosedPopup } from "../../fixtures/popup-leave"
import { waitForPopupClosed } from "../../fixtures/popups"
import { openPopup, waitForServiceReady } from "../../fixtures/wallet-pages"
import { setInputs } from "../import-drivers"
import { exportAccount, importAccountFile } from "./accounts-io"
import {
	type ActionName,
	type CredentialRef,
	deleteTarget,
	isMinted,
	type ModelFile,
	type ModelProfile,
	type ParamsMap,
	type PhraseRef,
	type PlannedStep,
	profileOf,
	type World,
	live,
} from "./model"
import { drainBeforeStop, restartBackground } from "./restart"
import { bindProfile, type Ceremony } from "./checkers"
import { credentialId, type Driven, profileId, type RunState, secretFor, wrongSecret } from "./state"
import {
	activeProfileId,
	answerConfirm,
	authSubmitReady,
	backgroundServing,
	firstSignal,
	HOME,
	isLocked,
	openRoute,
	PASSKEY_REFUSAL,
	pressUntilGone,
	pickOnLockScreen,
	pressTwice,
	raceEnd,
	REGISTER,
	settle,
	timed,
	toLockScreen,
	typePasswordAndSubmit,
	unlockAttemptEnded,
	waitForRoute,
	anchorAdvanced,
	dismissNotices,
	watchPromptAbort,
} from "./ui"
import { verifyAll } from "./verify"
import { answeredCredentials, capturePrf, checkAnswers, drainPrf, minted, pickDiscovered } from "./prf-capture"
import { changeUnlockMethod, raceLockDuringMethodChange } from "./unlock-method"
import { exportFullBackup, pickEarlierBackup, restoreFile } from "./backups"
import { editRowDuringUnlock as editRow, tamperedUnlock as tamperSlot } from "./tamper"

type Drivers = { [N in ActionName]: (s: RunState, p: ParamsMap[N], step: PlannedStep, before: World) => Promise<Driven> }

const CREATE_MS = 90_000
const UNLOCK_MS = 60_000
const LOCK_MS = 30_000
const EDIT_MS = 30_000

const nextOf = (step: PlannedStep): World => step.expect.next

/** What every driver may assume of the anchor, so every caller runs it first: no notice an earlier
 *  step left, whose text a settle would take for this step's, and the passkey's answers captured. */
export async function beforeDriver(s: RunState): Promise<void> {
	await dismissNotices(s.anchor)
	await capturePrf(s.anchor)
}

/** The profile the model holds open before the step. */
function openBefore(before: World): ModelProfile {
	const ref = before.session.kind === "open" ? before.session.ref : undefined
	const p = ref && profileOf(before, ref)
	if (!p) throw new Error("the step needs an open profile and the model holds none")
	return p
}

// ── create ──────────────────────────────────────────────────────────────

/** Presses one of the lock screen's profile-picker buttons and waits for the picker to leave, so
 *  its dimmer never takes the next page's first press. */
async function fromProfilePicker(page: Page, button: "select-profile-new-btn" | "select-profile-import-btn"): Promise<void> {
	await toLockScreen(page)
	await openProfileChooser(page)
	await clickByTestId(page, button)
	await settleClosedPopup(page, button)
}

/** Brings the anchor to a create form: the register page while no profile is live, else the lock
 *  screen's New profile, the only entry once one is. */
async function openCreateForm(s: RunState, before: World): Promise<void> {
	const page = s.anchor
	if (!live(before).length) {
		await openRoute(page, "#/popup/register")
		await page.waitForSelector('[data-service-ready="true"]', { timeout: 30_000 })
		await clickByTestId(page, "register-create-btn")
		return
	}
	await fromProfilePicker(page, "select-profile-new-btn")
	await page.waitForSelector('[data-testid="register-name-input"]', { visible: true, timeout: 10_000 })
}

/** Home, or a refusal the create form shows: an inline error or a passkey notice. */
async function submitCreate(s: RunState, double: boolean, button = "register-submit-btn"): Promise<Driven> {
	if (double) await pressTwice(s.anchor, button)
	else await clickByTestId(s.anchor, button)
	const refusals = [...PASSKEY_REFUSAL.map((r) => ({ label: "refused", text: r.text })), { label: "refused", testid: "error-text" }]
	return settle(s.anchor, [HOME, ...refusals], { home: "committed", refused: "refused" }, CREATE_MS)
}

/** A new passkey profile's ceremonies: a mint's create, or the browser's pick of `credential`. */
const ceremoniesFor = (before: World, credential: CredentialRef): Ceremony[] =>
	isMinted(before, credential) ? [{ kind: "get", credential }] : minted(credential)

/** Arms the browser's pick of `credential` when the step reuses it, and names the link that asks
 *  for it; a mint presses `submit`. */
async function passkeyPress(
	s: RunState,
	page: Page,
	before: World,
	credential: CredentialRef,
	links: { submit: string; reuse: string },
): Promise<string> {
	if (!isMinted(before, credential)) return links.submit
	await pickDiscovered(page, credentialId(s, credential))
	return links.reuse
}

async function bindOpened(s: RunState, ref: ModelProfile["ref"], before?: World): Promise<void> {
	const id = await activeProfileId(s.anchor)
	const deleted = new Set(before?.profiles.filter((p) => p.deleted).map((p) => p.ref))
	if (id) bindProfile(s.bindings, ref, id, deleted)
}

const createPassword: Drivers["createPassword"] = async (s, p, _step, before) => {
	await openCreateForm(s, before)
	const page = s.anchor
	if (live(before).length) await replaceInputValue(page, '[data-testid="register-name-input"]', p.name)
	await clickByTestId(page, "register-method-password")
	const password = secretFor(s, p.password)
	await page.waitForSelector('[data-testid="register-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="register-password-input"]', password)
	await replaceInputValue(page, '[data-testid="register-password-confirm-input"]', password)
	const driven = await submitCreate(s, p.double)
	await bindOpened(s, p.ref)
	return driven
}

/** Records the words a screen showed for `phrase`; a second reading must show the same ones. */
function learnWords(s: RunState, phrase: PhraseRef | undefined, words: string[]): void {
	if (!phrase) return
	const learnt = s.phrases.get(phrase)
	if (learnt && learnt.join(" ") !== words.join(" ")) throw new Error(`a screen shows another phrase than ${phrase}'s`)
	s.phrases.set(phrase, words)
}

const createPasskey: Drivers["createPasskey"] = async (s, p, step, before) => {
	await openCreateForm(s, before)
	const page = s.anchor
	if (live(before).length) await replaceInputValue(page, '[data-testid="register-name-input"]', p.name)
	await clickByTestId(page, "register-method-passkey")
	const press = await passkeyPress(s, page, before, p.credential, { submit: "register-submit-btn", reuse: "register-passkey-reuse" })
	const driven = await submitCreate(s, p.double, press)
	await checkAnswers(s, page, step, driven, ceremoniesFor(before, p.credential))
	await bindOpened(s, p.ref)
	return driven
}

/** Onboarding in the anchor's own tab, as a wallet with no profile runs it again, so a passkey it
 *  makes stays with the page that holds every other. Open wallet's own write stands in for its
 *  press, which would close the tab. */
const onboardingCreate: Drivers["onboardingCreate"] = async (s, p, step, before) => {
	const page = s.anchor
	const t0 = Date.now()
	await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": false }))
	await gotoExtensionPage(page, extensionUrl(s.ctx.extensionId, "/src/onboarding/index.html#/onboarding/welcome"))
	await page.waitForSelector('[data-testid="onboarding-welcome-create"]', { visible: true, timeout: 30_000 })
	await capturePrf(page)
	await clickByTestId(page, "onboarding-welcome-create")
	await waitForRoute(page, "#/onboarding/create", 10_000)
	await clickByTestId(page, `onboarding-method-${p.method}`)
	if (p.method === "password") {
		const password = secretFor(s, p.password as never)
		await replaceInputValue(page, '[data-testid="onboarding-password-input"]', password)
		await replaceInputValue(page, '[data-testid="onboarding-password-confirm"]', password)
	}
	const credential = p.credential as CredentialRef
	const press =
		p.method === "password"
			? "onboarding-submit-create"
			: await passkeyPress(s, page, before, credential, { submit: "onboarding-submit-create", reuse: "onboarding-passkey-reuse" })
	await clickByTestId(page, press)
	const refusals = [...PASSKEY_REFUSAL.map((r) => ({ label: "refused", text: r.text })), { label: "refused", testid: "error-text" }]
	const shown = await settle(
		page,
		[{ label: "phrase", testid: "onboarding-phrase-saved" }, ...refusals],
		{ phrase: "committed", refused: "refused" },
		CREATE_MS,
	)
	if (shown.outcome !== "committed" || !shown.settle.reached) return shown
	if (p.method === "passkey") await answeredCredentials(s, page, ceremoniesFor(before, credential))
	learnWords(s, profileOf(nextOf(step), p.ref)?.phrase, await readRecoveryWords(page, "onboarding-phrase"))
	await clickByTestId(page, p.answer === "saved" ? "onboarding-phrase-saved" : "onboarding-phrase-later")
	await waitForRoute(page, "#/onboarding/done", 10_000)
	await page.waitForSelector('[data-testid="onboarding-done-open"]', { visible: true, timeout: 10_000 })
	await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": true }))
	await drainPrf(s, page)
	await gotoExtensionPage(page, extensionUrl(s.ctx.extensionId, "/src/popup/index.html#/popup/general"))
	await capturePrf(page)
	// A fresh document boots through the lock screen and advances once it finds the session.
	const driven = await settle(page, [{ ...HOME, testid: "account-selector" }], { home: "committed" }, CREATE_MS)
	await bindOpened(s, p.ref)
	driven.settle.elapsedMs = Date.now() - t0
	return driven
}

// ── lock, unlock, switch ────────────────────────────────────────────────

const lock: Drivers["lock"] = async (s) => {
	const t0 = Date.now()
	await toLockScreen(s.anchor)
	return timed(t0, LOCK_MS, "committed")
}

/** The lock screen pointed at `target`, whatever route the last step left. */
async function lockScreenOn(s: RunState, target: ModelProfile["ref"]): Promise<void> {
	await openRoute(s.anchor, "#/popup/auth")
	await pickOnLockScreen(s.anchor, profileId(s, target))
}

const unlockPassword: Drivers["unlockPassword"] = async (s, p, _step, before) => {
	await lockScreenOn(s, p.target)
	const target = profileOf(before, p.target) as ModelProfile
	await typePasswordAndSubmit(s.anchor, p.variant === "right" ? secretFor(s, target.password as never) : wrongSecret())
	return settle(s.anchor, [HOME, { label: "refused", testid: "error-text" }], { home: "committed", refused: "refused" }, UNLOCK_MS)
}

const unlockPasskey: Drivers["unlockPasskey"] = async (s, p) => {
	await lockScreenOn(s, p.target)
	await authSubmitReady(s.anchor)
	if (p.variant === "refuse" && s.auth) {
		const allow = await s.auth.refuseNextStep(s.anchor)
		try {
			return await pressAndSettle(s)
		} finally {
			await allow()
		}
	}
	if (p.variant === "no-prf") await withholdGetPrf(s.anchor)
	if (p.variant === "other") await answerWithCredential(s.anchor, credentialId(s, p.other))
	return pressAndSettle(s)
}

async function pressAndSettle(s: RunState): Promise<Driven> {
	await clickByTestId(s.anchor, "auth-submit")
	const signals = [
		HOME,
		...PASSKEY_REFUSAL.map((r) => ({ label: r.label, text: r.text, hash: "/popup/auth" })),
		{ label: "refused", testid: "error-text" },
	]
	return settle(s.anchor, signals, { home: "committed", cancelled: "cancelled", refused: "refused" }, UNLOCK_MS)
}

const switchProfile: Drivers["switchProfile"] = async (s, p) => {
	const t0 = Date.now()
	await lockScreenOn(s, p.to)
	return timed(t0, EDIT_MS, "committed")
}

// ── phrase ──────────────────────────────────────────────────────────────

const WORDS: { label: string; testid: string } = { label: "committed", testid: "reveal-content-word" }

/** The reveal's passkey failures, by the toast each one shows. */
const REVEAL_REFUSAL = [
	{ label: "cancelled", text: PASSKEY_COPY.notConfirmed },
	{ label: "refused", text: PASSKEY_COPY.noPrf },
	{ label: "refused", text: PASSKEY_COPY.revealFailed },
]

async function revealWithPassword(s: RunState, open: ModelProfile, variant: ParamsMap["revealPhrase"]["variant"]): Promise<Driven> {
	const page = s.anchor
	await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(
		page,
		'[data-testid="unlock-password-input"]',
		variant === "right" ? secretFor(s, open.password as never) : wrongSecret(),
	)
	await clickByTestId(page, "unlock-submit-btn")
	return settle(page, [WORDS, { label: "refused", testid: "unlock-error-text" }], { committed: "committed", refused: "refused" }, EDIT_MS)
}

/** The passkey answers as `p` says, through the same hooks as the lock screen's. */
async function revealWithPasskey(s: RunState, p: ParamsMap["revealPhrase"]): Promise<Driven> {
	const page = s.anchor
	await page.waitForSelector('[data-testid="reveal-passkey-btn"]', { visible: true, timeout: 10_000 })
	const press = async (): Promise<Driven> => {
		await clickByTestId(page, "reveal-passkey-btn")
		return settle(page, [WORDS, ...REVEAL_REFUSAL], { committed: "committed", cancelled: "cancelled", refused: "refused" }, UNLOCK_MS)
	}
	if (p.variant === "refuse") {
		if (!s.auth) throw new Error("a refused passkey needs the run's authenticator")
		const allow = await s.auth.refuseNextStep(page)
		try {
			return await press()
		} finally {
			await allow()
		}
	}
	if (p.variant === "no-prf") await withholdGetPrf(page)
	if (p.variant === "other") await answerWithCredential(page, credentialId(s, p.other))
	return press()
}

const revealPhrase: Drivers["revealPhrase"] = async (s, p, _step, before) => {
	const open = openBefore(before)
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, "#/popup/settings/security/export/seed")
	await pressUntilGone(page, "agree-continue-btn")
	const driven = open.method === "password" ? await revealWithPassword(s, open, p.variant) : await revealWithPasskey(s, p)
	if (driven.outcome === "committed") learnWords(s, open.phrase, await readRecoveryWords(page))
	driven.settle.elapsedMs = Date.now() - t0
	return driven
}

/** The reveal's passkey held at its prompt while another window locks: the lock takes the page, and
 *  the prompt must end with it. A prompt that outlives its page is let through, and reported as the
 *  ceremony going on. */
const raceLockDuringReveal: Drivers["raceLockDuringReveal"] = async (s) => {
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, "#/popup/settings/security/export/seed")
	await pressUntilGone(page, "agree-continue-btn")
	await page.waitForSelector('[data-testid="reveal-passkey-btn"]', { visible: true, timeout: 10_000 })
	const hold = await holdNextGet(page)
	const aborted = await watchPromptAbort(page)
	await clickByTestId(page, "reveal-passkey-btn")
	await hold.reached()
	await lockFromAnotherWindow(page)
	await waitForLockScreen(page, LOCK_MS)
	const ended = await aborted()
	await hold.release()
	if (!ended) await unlockAttemptEnded(page, UNLOCK_MS)
	return timed(t0, UNLOCK_MS + LOCK_MS, ended ? "cancelled" : "committed")
}

/** Brings the anchor to the import page: from the register page while no profile is live, else the
 *  lock screen's Import. */
export async function openImport(s: RunState, before: World): Promise<void> {
	const page = s.anchor
	if (!live(before).length) {
		await openRoute(page, "#/popup/register")
		await page.waitForSelector('[data-service-ready="true"]', { timeout: 30_000 })
		await clickByTestId(page, "register-import-btn")
	} else {
		await fromProfilePicker(page, "select-profile-import-btn")
	}
	await waitForRoute(page, "#/popup/import", 10_000)
	await waitForServiceReady(page, 15_000)
}

/** After a submit that may warn of a duplicate wallet: answers it as `answer` says, then settles. */
async function answerDuplicate(
	s: RunState,
	answer: "confirm" | "decline" | undefined,
	done: Parameters<typeof settle>[1],
	boundMs: number,
): Promise<Driven> {
	const page = s.anchor
	const warn = { label: "warned", testid: "confirm-submit" }
	const first = await firstSignal(page, [warn, ...done], boundMs)
	if (first.label !== "warned") return settle(page, done, { home: "committed", refused: "refused" }, 1_000)
	if (answer === "decline") {
		await answerConfirm(page, "cancel")
		return { outcome: "cancelled", settle: { reached: true, elapsedMs: first.elapsedMs, boundMs } }
	}
	if (answer === undefined)
		return {
			outcome: "refused",
			settle: { reached: false, elapsedMs: first.elapsedMs, boundMs, loading: ["an unexpected duplicate warning"] },
		}
	await answerConfirm(page, "submit")
	return settle(page, done, { home: "committed", refused: "refused" }, boundMs)
}

function passwordInputs(s: RunState, p: ParamsMap["importPhrase"]): Record<string, string> {
	const password = secretFor(s, p.password as never)
	return {
		'[data-testid="import-password-input"] input': password,
		'[data-testid="import-password-confirm-input"] input': password,
	}
}

const importPhrase: Drivers["importPhrase"] = async (s, p, step, before) => {
	await openImport(s, before)
	const page = s.anchor
	await clickByTestId(page, "import-option-seed")
	await page.waitForSelector('[data-testid="import-seed-input"] input', { visible: true, timeout: 10_000 })
	const passkey = p.method === "passkey"
	await clickByTestId(page, passkey ? "import-method-passkey" : "import-method-password")
	if (!passkey) await page.waitForSelector('[data-testid="import-password-input"] input', { visible: true, timeout: 10_000 })
	const words = s.phrases.get(p.phrase)
	if (!words) throw new Error(`${p.phrase} was never read`)
	await setInputs(page, {
		...(live(before).length ? { '[data-testid="import-name-input"] input': p.name } : {}),
		'[data-testid="import-seed-input"] input': words.join(" "),
		...(passkey ? {} : passwordInputs(s, p)),
	})
	const credential = p.credential as CredentialRef
	const links = { submit: "import-seed-submit-btn", reuse: "import-seed-passkey-reuse" }
	await clickByTestId(page, passkey ? await passkeyPress(s, page, before, credential, links) : links.submit)
	const done = [HOME, { label: "refused", testid: "error-text" }, ...PASSKEY_REFUSAL.map((r) => ({ label: "refused", text: r.text }))]
	const driven = await answerDuplicate(s, p.duplicate, done, CREATE_MS)
	if (passkey) await checkAnswers(s, page, step, driven, ceremoniesFor(before, credential))
	if (driven.outcome === "committed") await bindOpened(s, p.ref)
	return driven
}

// ── accounts ────────────────────────────────────────────────────────────

const addAccount: Drivers["addAccount"] = async (s, _p, step) => {
	const page = s.anchor
	const t0 = Date.now()
	const open = openBefore(step.expect.next)
	const name = `Chaos account ${open.derived}`
	await openRoute(page, "#/popup/settings/accounts")
	await clickByTestId(page, "accounts-new-btn")
	await page.waitForSelector('[data-testid="account-name-input"] input', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="account-name-input"] input', name)
	await clickByTestId(page, "new-account-submit")
	await page.waitForSelector(`[data-testid="manage-accounts-row"][data-account-name="${name}"]`, { visible: true, timeout: CREATE_MS })
	return timed(t0, CREATE_MS, "committed")
}

// ── backups and account files ───────────────────────────────────────────

const exportBackup: Drivers["exportBackup"] = async (s, p, _step, before) => exportFullBackup(s, openBefore(before), p)

const importEarlierBackup: Drivers["importEarlierBackup"] = async (s, _p, _step, before) => {
	await openImport(s, before)
	return pickEarlierBackup(s)
}

const importBackup: Drivers["importBackup"] = async (s, p, step, before) => {
	const file = before.files.find((f) => f.ref === p.file) as ModelFile
	await openImport(s, before)
	const credential = p.credential as CredentialRef
	const passkey = p.method === "passkey"
	const reused = passkey && isMinted(before, credential) ? credentialId(s, credential) : undefined
	const driven = await restoreFile(s, file, p, reused)
	if (passkey) await checkAnswers(s, s.anchor, step, driven, ceremoniesFor(before, credential))
	if (driven.outcome === "committed") await bindOpened(s, p.ref, before)
	return driven
}

/** A passkey profile's file asks one passkey: its own, the other one the step answers with, or
 *  none the authenticator refused. */
function fileCeremonies(open: ModelProfile, p: ParamsMap["exportAccountFile"]): Ceremony[] {
	if (p.variant === "refuse") return []
	const credential = p.variant === "other" ? p.other : open.credential
	return [{ kind: "get", credential: credential as CredentialRef }]
}

const exportAccountFile: Drivers["exportAccountFile"] = async (s, p, step, before) => {
	const open = openBefore(before)
	const driven = await exportAccount(s, open, p)
	if (open.method === "passkey") await checkAnswers(s, s.anchor, step, driven, fileCeremonies(open, p))
	return driven
}

const importAccountFileDriver: Drivers["importAccountFile"] = async (s, p, _step, before) =>
	importAccountFile(s, before.files.find((f) => f.ref === p.file) as ModelFile)

// ── profile edits and deletion ──────────────────────────────────────────

const changePassword: Drivers["changePassword"] = async (s, p, _step, before) => {
	const open = openBefore(before)
	const page = s.anchor
	await openRoute(page, "#/popup/settings/security/change-password")
	await page.waitForSelector('[data-testid="current-password-input"]', { visible: true, timeout: 10_000 })
	const next = secretFor(s, p.password)
	await replaceInputValue(
		page,
		'[data-testid="current-password-input"]',
		p.variant === "right" ? secretFor(s, open.password as never) : wrongSecret(),
	)
	await replaceInputValue(page, '[data-testid="new-password-input"]', next)
	await replaceInputValue(page, '[data-testid="new-password-repeat-input"]', next)
	await clickByTestId(page, "change-password-submit-btn")
	const driven = await settle(
		page,
		[
			{ label: "committed", text: "Profile password changed" },
			{ label: "refused", testid: "error-text" },
		],
		{ committed: "committed", refused: "refused" },
		EDIT_MS,
	)
	// The page goes back once it has changed it; a hash written before that lands is undone by it.
	if (driven.outcome === "committed")
		await page.waitForFunction(() => !location.hash.includes("/change-password"), { timeout: EDIT_MS, polling: 100 })
	return driven
}

const rename: Drivers["rename"] = async (s, p) => {
	const page = s.anchor
	await openRoute(page, "#/popup/settings/profile")
	await clickByTestId(page, "identity-name-row")
	await page.waitForSelector('[data-testid="profile-name-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="profile-name-input"]', p.name)
	await clickByTestId(page, "edit-profile-submit")
	return settle(page, [{ label: "committed", text: "Profile is updated" }], { committed: "committed" }, EDIT_MS)
}

const deleteProfile: Drivers["deleteProfile"] = async (s, p, step, before) => {
	const page = s.anchor
	const target = deleteTarget(before, p.via) as ModelProfile
	if (p.via === "settings") await openRoute(page, "#/popup/settings/security/reset")
	else {
		await openRoute(page, "#/popup/auth")
		// A retired profile's lock screen offers Delete in the unlock's place.
		if (target.retired) await clickByTestId(page, "auth-delete-retired")
		else {
			await clickByTestId(page, "auth-reset")
			await clickByTestId(page, "forgot-reset-btn")
		}
	}
	const tombstone = `nulo:core:profile-tombstones@${profileId(s, target.ref)}`
	await confirmProfileReset(page, 15_000)
	// The session closes before the purge, so the lock screen shows first; the delete is done once
	// its tombstone clears. Another passkey profile's row a restart left may stay, which O1 judges.
	const end = { ...(live(nextOf(step)).length ? { label: "lock", hash: "/popup/auth" } : REGISTER), noLocalKey: tombstone }
	return settle(page, [end], { [end.label]: "committed" }, LOCK_MS)
}

// ── device, background, windows ─────────────────────────────────────────

const toggleStrict: Drivers["toggleStrict"] = async (s, _p, step) => {
	const page = s.anchor
	const t0 = Date.now()
	const on = nextOf(step).device.strict
	await openRoute(page, "#/popup/settings/lock")
	await clickByTestId(page, "strict-security-toggle")
	if (!on) await answerConfirm(page, "submit")
	await page.waitForFunction(
		(want: string) => document.querySelector('[data-testid="strict-security-toggle"]')?.getAttribute("data-toggle-active") === want,
		{ timeout: 10_000, polling: 100 },
		String(on),
	)
	// Turning it on must drop a stored bearer at once: wait for the row to hold none.
	if (on && !(await isLocked(page))) {
		await page
			.waitForFunction(
				async () => {
					const raw = (await chrome.storage.session.get("nulo:core:session"))["nulo:core:session"]
					return typeof raw === "string" && JSON.parse(raw).bearer == null
				},
				{ timeout: 10_000, polling: 100 },
			)
			.catch(() => {})
	}
	return timed(t0, EDIT_MS, "committed")
}

const backgroundRestart: Drivers["backgroundRestart"] = async (s, _p, step) => restartBackground(s, nextOf(step))

const secondWindow: Drivers["secondWindow"] = async (s, p, _step, before) => {
	const t0 = Date.now()
	const page = await openPopup(s.ctx)
	s.errors.watch(page, "second")
	await capturePrf(page)
	try {
		if (p.op === "lock") {
			await lockFromAnotherWindow(page)
			await waitForLockScreen(s.anchor, LOCK_MS)
			return timed(t0, LOCK_MS, "committed")
		}
		const target = profileOf(before, before.selected as never) as ModelProfile
		await waitForRoute(page, "#/popup/auth", 15_000)
		if (target.method === "password") await typePasswordAndSubmit(page, secretFor(s, target.password as never))
		else {
			await authSubmitReady(page)
			await clickByTestId(page, "auth-submit")
		}
		await waitForRoute(page, "#/popup/general", UNLOCK_MS)
		await anchorAdvanced(s.anchor, UNLOCK_MS)
		return timed(t0, UNLOCK_MS, "committed")
	} finally {
		await drainPrf(s, page)
		await page.close().catch(() => {})
	}
}

/** A passkey request held on another page, acknowledged, then that page closed: the anchor keeps
 *  the authenticator, so closing it would lose every credential. */
const abandonCeremony: Drivers["abandonCeremony"] = async (s) => {
	const other = await openPopup(s.ctx)
	s.errors.watch(other, "abandon")
	await capturePrf(other)
	try {
		await waitForRoute(other, "#/popup/auth", 15_000)
		await authSubmitReady(other)
		const hold = await holdNextGet(other)
		await clickByTestId(other, "auth-submit")
		await hold.reached()
	} finally {
		await drainPrf(s, other)
		await other.close().catch(() => {})
	}
	// Closing the page is the abandon itself: one that survived still holds the request.
	await waitForPopupClosed(other).catch(() => {
		throw new Error("the page holding the passkey request did not close")
	})
	await openRoute(s.anchor, "#/popup/auth")
	return settle(s.anchor, [{ label: "cancelled", testid: "auth-submit", hash: "/popup/auth" }], { cancelled: "cancelled" }, EDIT_MS)
}

// ── races ───────────────────────────────────────────────────────────────

/** Holds the lock screen's passkey request, runs `compete` once the page is inside it, releases it,
 *  then locks through the service, which also clears a row no session holds, so every schedule ends
 *  on one state. */
async function heldUnlockRace(s: RunState, compete: () => Promise<void>): Promise<Driven> {
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, "#/popup/auth")
	await authSubmitReady(page)
	const hold = await holdNextGet(page)
	await clickByTestId(page, "auth-submit")
	await hold.reached()
	await compete()
	await hold.release()
	await unlockAttemptEnded(page, UNLOCK_MS)
	// Short: a session held behind the lock screen for longer is the failure, not a slow router.
	const seen = await raceEnd(page, 10_000)
	// The cleanup lock below would wipe a session the race left open behind the lock screen, and
	// would put a page that reached neither end back on it.
	if (seen === "lock over a session") throw new Error("the lock screen shows while the service holds a session")
	if (seen === undefined) throw new Error("the race reached neither Home nor the lock screen")
	const outcome = seen === "home" ? "committed-then-locked" : "cancelled"
	await lockFromAnotherWindow(s.anchor)
	await waitForLockScreen(s.anchor, LOCK_MS)
	return timed(t0, UNLOCK_MS + LOCK_MS, outcome)
}

const raceLockDuringUnlock: Drivers["raceLockDuringUnlock"] = async (s) => heldUnlockRace(s, () => lockFromAnotherWindow(s.anchor))

const raceRestartDuringUnlock: Drivers["raceRestartDuringUnlock"] = async (s) =>
	heldUnlockRace(s, async () => {
		await drainBeforeStop(s)
		await stopBackground(s.ctx)
		await backgroundServing(s.anchor, UNLOCK_MS)
	})

const raceDoubleUnlock: Drivers["raceDoubleUnlock"] = async (s, _p, _step, before) => {
	const target = profileOf(before, before.selected as never) as ModelProfile
	const page = s.anchor
	await openRoute(page, "#/popup/auth")
	await page.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="auth-password-input"]', secretFor(s, target.password as never))
	await pressTwice(page, "auth-submit")
	return settle(page, [HOME, { label: "refused", testid: "error-text" }], { home: "committed", refused: "refused" }, UNLOCK_MS)
}

// ── the network file's families ─────────────────────────────────────────

const networkOnly = async (): Promise<Driven> => {
	throw new Error("this action runs only in the network file, which binds its own driver")
}

export const DRIVERS: Drivers = {
	createPassword,
	createPasskey,
	lock,
	unlockPassword,
	unlockPasskey,
	switchProfile,
	revealPhrase,
	importPhrase,
	addAccount,
	exportBackup,
	importBackup,
	exportAccountFile,
	importAccountFile: importAccountFileDriver,
	changePassword,
	rename,
	deleteProfile,
	toggleStrict,
	backgroundRestart,
	secondWindow,
	abandonCeremony,
	raceLockDuringUnlock,
	raceDoubleUnlock,
	raceRestartDuringUnlock,
	onboardingCreate,
	importEarlierBackup,
	editRowDuringUnlock: async (s, p, _step, before) => editRow(s, p, profileOf(before, before.selected as never) as ModelProfile),
	tamperedUnlock: async (s, p, _step, before) => tamperSlot(s, p, profileOf(before, p.target) as ModelProfile),
	raceLockDuringReveal,
	changeUnlockMethod: async (s, p, step, before) => changeUnlockMethod(s, openBefore(before), p, step),
	raceLockDuringMethodChange: async (s) => raceLockDuringMethodChange(s),
	dappWhileLocked: networkOnly,
	dappDuringHeldUnlock: networkOnly,
	restoreHeld: networkOnly,
	verifyAll: (s, _p, step, before) => verifyAll(s, before, nextOf(step)),
}
