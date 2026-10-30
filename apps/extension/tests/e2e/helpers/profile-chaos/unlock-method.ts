/** Settings → Unlock method for the profile chaos drivers: every change the page offers, its
 *  current unlock answered as the step says, and a lock that meets its current passkey's prompt. */
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { waitForLockScreen } from "../../fixtures/auth"
import { bringToFront } from "../../fixtures/browser"
import { clickByTestId, replaceInputValue } from "../../fixtures/dom"
import { answerWithCredential, holdNextGet } from "../../fixtures/passkey"
import { lockFromAnotherWindow } from "../../fixtures/session"
import { openPopup } from "../../fixtures/wallet-pages"
import type { CredentialRef, ModelProfile, ParamsMap, PlannedStep } from "./model"
import type { Ceremony } from "./checkers"
import { capturePrf, checkAnswers, drainPrf, minted } from "./prf-capture"
import { credentialId, type Driven, type RunState, secretFor, wrongSecret } from "./state"
import { firstSignal, openRoute, promptEnded, type Signal, settle, timed, unlockAttemptEnded, waitForRoute, watchPromptAbort } from "./ui"

type Change = ParamsMap["changeUnlockMethod"]

const ROUTE = "#/popup/settings/security/unlock-method"
const CHANGE_MS = 90_000
const LOCK_MS = 30_000

const DONE: Record<Change["change"], string> = {
	passkey: "Now unlocks with your passkey",
	"new-passkey": "Now unlocks with your new passkey",
	password: "Now unlocks with your password",
}

/** The page's failures, by the toast or the line each one shows. */
const REFUSALS: Signal[] = [
	{ label: "cancelled", text: PASSKEY_COPY.notConfirmed },
	{ label: "refused", text: PASSKEY_COPY.noPrf },
	{ label: "refused", text: "Couldn't change the unlock method. Try again." },
	{ label: "refused", testid: "unlock-method-error-text" },
]

const OUTCOMES = { committed: "committed", cancelled: "cancelled", refused: "refused" } as const

/** Everything a run of the page can show once its card ends: after a reset, any one means the run
 *  outlived it. */
const RUN_SHOWS: Signal[] = [
	...REFUSALS,
	{ label: "refused", text: "Unlock method changed in another window." },
	{ label: "refused", text: "Unlock method changed. Unlock Nulo again to continue." },
]
/** A run that outlived the reset shows its toast in the task the abort ran in. */
const SHOWS_MS = 2_000

/** The answers a change's page must show, each by the credential it names. */
function ceremoniesOf(p: Change, current: CredentialRef | undefined): Ceremony[] {
	const asked: Ceremony[] = current && p.change !== "passkey" ? [{ kind: "get", credential: current }] : []
	if (p.current === "other") return [{ kind: "get", credential: p.other as CredentialRef }]
	if (p.current === "wrong" || p.current === "refuse") return []
	return p.change === "password" ? asked : [...asked, ...minted(p.credential as CredentialRef)]
}

/** Presses `button` with the current passkey's prompt answered as `p` says, then settles on `signals`. */
async function pressAnswered(s: RunState, p: Change, button: string, signals: Signal[]): Promise<Driven> {
	const page = s.anchor
	const press = async (): Promise<Driven> => {
		await clickByTestId(page, button)
		return settle(page, signals, OUTCOMES, CHANGE_MS)
	}
	if (p.current === "refuse") {
		if (!s.auth) throw new Error("a refused passkey needs the run's authenticator")
		const allow = await s.auth.refuseNextStep(page)
		try {
			return await press()
		} finally {
			await allow()
		}
	}
	if (p.current === "other") await answerWithCredential(page, credentialId(s, p.other))
	return press()
}

const committed = (p: Change): Signal => ({ label: "committed", text: DONE[p.change] })

async function toPassword(s: RunState, p: Change): Promise<Driven> {
	const page = s.anchor
	const asked = { label: "committed", testid: "unlock-method-new-password-input" }
	const checked = await pressAnswered(s, p, "unlock-method-use-password", [asked, ...REFUSALS])
	if (checked.outcome !== "committed" || !checked.settle.reached) return checked
	const password = secretFor(s, p.password as never)
	await replaceInputValue(page, '[data-testid="unlock-method-new-password-input"]', password)
	await replaceInputValue(page, '[data-testid="unlock-method-new-password-confirm-input"]', password)
	await clickByTestId(page, "unlock-method-save")
	return settle(page, [committed(p), ...REFUSALS], OUTCOMES, CHANGE_MS)
}

async function toPasskey(s: RunState, open: ModelProfile, p: Change): Promise<Driven> {
	const page = s.anchor
	await clickByTestId(page, "unlock-method-use-passkey")
	await page.waitForSelector('[data-testid="unlock-method-password-input"]', { visible: true, timeout: 10_000 })
	const typed = p.current === "right" ? secretFor(s, open.password as never) : wrongSecret()
	await replaceInputValue(page, '[data-testid="unlock-method-password-input"]', typed)
	await clickByTestId(page, "unlock-method-continue")
	return settle(page, [committed(p), ...REFUSALS], OUTCOMES, CHANGE_MS)
}

/** One change from the page, from wherever the last step left the anchor; a change made leaves for
 *  Settings, and the step waits until it has. */
export async function changeUnlockMethod(s: RunState, open: ModelProfile, p: Change, step: PlannedStep): Promise<Driven> {
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, ROUTE)
	const first = p.change === "passkey" ? "unlock-method-use-passkey" : "unlock-method-new-passkey"
	await page.waitForSelector(`[data-testid="${first}"]`, { visible: true, timeout: 15_000 })
	let driven: Driven
	if (p.change === "passkey") driven = await toPasskey(s, open, p)
	else if (p.change === "password") driven = await toPassword(s, p)
	else driven = await pressAnswered(s, p, "unlock-method-new-passkey", [committed(p), ...REFUSALS])
	await checkAnswers(s, page, step, driven, ceremoniesOf(p, open.credential))
	if (driven.outcome === "committed" && driven.settle.reached)
		await page.waitForFunction(() => !location.hash.includes("/unlock-method"), { timeout: CHANGE_MS, polling: 100 })
	driven.settle.elapsedMs = Date.now() - t0
	return driven
}

/** The current passkey's prompt held while another window locks: the lock takes the page, and the
 *  prompt must end with it. A prompt that outlives its page is let through, and reported as the
 *  change going on. */
export async function raceLockDuringMethodChange(s: RunState): Promise<Driven> {
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, ROUTE)
	await page.waitForSelector('[data-testid="unlock-method-use-password"]', { visible: true, timeout: 15_000 })
	const hold = await holdNextGet(page)
	const aborted = await watchPromptAbort(page)
	await clickByTestId(page, "unlock-method-use-password")
	await hold.reached()
	await lockFromAnotherWindow(page)
	await waitForLockScreen(page, LOCK_MS)
	const ended = await aborted()
	await hold.release()
	if (!ended) await unlockAttemptEnded(page, CHANGE_MS)
	return timed(t0, CHANGE_MS + LOCK_MS, ended ? "cancelled" : "committed")
}

/** The current passkey's prompt held on a second page while `compete` runs the anchor's own step:
 *  the page must start over, its prompt ended and nothing shown. A prompt that outlives the
 *  competitor is reported as the change going on. The page closes with the prompt still held: on a
 *  page with no authenticator a released one would wait out WebAuthn's own timeout. */
export async function raceMethodChangeElsewhere(s: RunState, compete: () => Promise<void>): Promise<Driven> {
	const t0 = Date.now()
	const page = await openPopup(s.ctx)
	s.errors.watch(page, "elsewhere")
	try {
		await capturePrf(page)
		// A new page lands on Home once its bootstrap ends, over any route set before that.
		await waitForRoute(page, "#/popup/general", 15_000)
		await openRoute(page, ROUTE)
		await page.waitForSelector('[data-testid="unlock-method-use-password"]', { visible: true, timeout: 15_000 })
		const hold = await holdNextGet(page)
		const aborted = await watchPromptAbort(page)
		await clickByTestId(page, "unlock-method-use-password")
		await hold.reached()
		// The competitor's prompts ask from a focused document, and the page just opened took focus.
		await bringToFront(s.anchor)
		if (await promptEnded(page)) throw new Error("the prompt ended before the competitor ran")
		await compete()
		if (!(await aborted())) return timed(t0, CHANGE_MS + LOCK_MS, "committed")
		const shown = await firstSignal(page, RUN_SHOWS, SHOWS_MS)
		return timed(t0, CHANGE_MS + LOCK_MS, shown.label === undefined ? "cancelled" : "refused")
	} finally {
		await drainPrf(s, page)
		await page.close().catch(() => {})
	}
}
