/**
 * `verifyAll`: every live profile in model order is refused a wrong secret with no write, opens with
 * its own, shows its accounts and re-exports each imported account. The lock screen then goes back
 * to the model's selection.
 */
import { RetiredProfileError } from "@nulo/extension-messaging/errors"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { callService, lockFromAnotherWindow, type ServiceAnswer, serviceAnswer } from "../../fixtures/session"
import { answerWithCredential } from "../../fixtures/passkey"
import { derivedAddresses, reexportImported } from "./accounts-io"
import type { RETIRED_REFUSALS, VerifyReading } from "./checkers"
import { readCensus } from "./collect"
import { type CredentialRef, live, type ModelFile, type ModelProfile, otherCredentials, type World } from "./model"
import { expireRelease } from "./pre-update"
import { credentialId, type Driven, profileId, type RunState, secretFor, wrongSecret } from "./state"
import { authSubmitReady, dismissNotices, firstSignal, HOME, openRoute, pickOnLockScreen, timed, typePasswordAndSubmit } from "./ui"
import { waitForLockScreen } from "../../fixtures/auth"
import { clickByTestId } from "../../fixtures/dom"

const STEP_MS = 60_000

const REFUSED = [PASSKEY_COPY.unlockFailed, PASSKEY_COPY.noPrf, PASSKEY_COPY.notConfirmed].map((text) => ({
	label: "refused",
	text,
	hash: "/popup/auth",
}))

/** Whether the lock screen refuses `p` answered by `other`. */
async function otherRefused(s: RunState, other: CredentialRef): Promise<boolean> {
	const page = s.anchor
	// The last attempt's refusal toast would read as this one's.
	await dismissNotices(page)
	await authSubmitReady(page)
	await answerWithCredential(page, credentialId(s, other))
	await clickByTestId(page, "auth-submit")
	return (await firstSignal(page, [...REFUSED, HOME], STEP_MS)).label === "refused"
}

/** Wrong secrets for `p`: another password, or each passkey the authenticator holds other than
 *  `p`'s own, a replaced or a declined one included, else a refused prompt. Resolves whether the
 *  lock screen refused every one. */
async function wrongAttempt(s: RunState, p: ModelProfile, w: World): Promise<boolean> {
	const page = s.anchor
	if (p.method === "password") {
		await typePasswordAndSubmit(page, wrongSecret())
		return (
			(await firstSignal(page, [{ label: "refused", testid: "error-text", hash: "/popup/auth" }, HOME], STEP_MS)).label === "refused"
		)
	}
	const others = otherCredentials(w, p.ref)
	for (const other of others) if (!(await otherRefused(s, other))) return false
	if (others.length || !s.auth) return true
	await authSubmitReady(page)
	const allow = await s.auth.refuseNextStep(page)
	await clickByTestId(page, "auth-submit")
	await firstSignal(page, [{ label: "refused", text: PASSKEY_COPY.notConfirmed }], STEP_MS)
	await allow()
	return (await page.evaluate(() => location.hash)).includes("/popup/auth")
}

async function rightAttempt(s: RunState, p: ModelProfile): Promise<boolean> {
	const page = s.anchor
	if (p.method === "password") await typePasswordAndSubmit(page, secretFor(s, p.password as never))
	else {
		await authSubmitReady(page)
		await clickByTestId(page, "auth-submit")
	}
	return (await firstSignal(page, [HOME], STEP_MS)).label === "home"
}

/** Each call's arguments: a password the run never set, and no credential, so a call that skipped
 *  the retired gate would fail on its own refusal instead, which the probe reports by name. */
function retiredArgs(id: string): Record<(typeof RETIRED_REFUSALS)[number], unknown[]> {
	const pw = wrongSecret()
	return {
		getPasskeyUnlockParams: [id],
		unlockProfile: [id, pw],
		unlockPasskeyProfile: [id],
		exportMnemonic: [id, pw],
		exportPlain: [id, pw],
		changeProfilePassword: [id, pw, wrongSecret()],
		changeUnlockMethod: [id, { password: pw }, { password: wrongSecret() }],
		finalizeRestore: [id, pw],
	}
}

/** `retired` only for the typed refusal, its code and its text; any other answer by its code alone,
 *  so an error's free text, which may carry a secret, never reaches the record. */
function retiredAnswer(answer: ServiceAnswer): string {
	if (!("error" in answer)) return "answered"
	if (answer.code === RetiredProfileError.CODE && answer.error.includes(RetiredProfileError.MESSAGE)) return "retired"
	return `refused: ${answer.code ?? "untyped"}`
}

/** A retired profile's lock screen, then every call of the refusal matrix against it: `retired`
 *  where the wallet answered with its retired refusal, else how the call ended. */
async function probeRetired(s: RunState, p: ModelProfile): Promise<VerifyReading> {
	const page = s.anchor
	const id = profileId(s, p.ref)
	await openRoute(page, "#/popup/auth")
	await pickOnLockScreen(page, id)
	const shown = (testid: string) =>
		page
			.waitForSelector(`[data-testid="${testid}"]`, { visible: true, timeout: testid === "auth-setup-again" ? 15_000 : 1_000 })
			.then(() => true)
			.catch(() => false)
	const screen = { setupAgain: await shown("auth-setup-again"), unlockOffered: await shown("auth-submit") }
	const before = new Map((await readCensus(page)).map((e) => [e.key, e.digest]))
	const calls: Record<string, string> = {}
	for (const [method, params] of Object.entries(retiredArgs(id)))
		calls[method] = await serviceAnswer(page, "profile", method, params, 30_000).then(retiredAnswer, () => "no answer")
	const after = await readCensus(page)
	const wrote = after.filter((e) => before.get(e.key) !== e.digest && !e.key.startsWith("nulo:e2e:")).map((e) => e.key)
	for (const key of before.keys()) if (!after.some((e) => e.key === key)) wrote.push(key)
	const opened = (await callService<{ id: string } | undefined>(page, "profile", "getActiveProfile"))?.id === id
	return {
		ref: p.ref,
		wrongRefused: true,
		wrongWrote: wrote,
		opened,
		addresses: [],
		chainId: 0,
		sentinels: [],
		retired: { ...screen, calls },
	}
}

async function verifyOne(s: RunState, p: ModelProfile, w: World): Promise<VerifyReading> {
	if (p.retired) return probeRetired(s, p)
	const page = s.anchor
	const id = profileId(s, p.ref)
	await openRoute(page, "#/popup/auth")
	await pickOnLockScreen(page, id)
	const census = await readCensus(page)
	const before = new Map(census.map((e) => [e.key, e.digest]))
	const wrongRefused = await wrongAttempt(s, p, w)
	const after = await readCensus(page)
	const wrongWrote = after.filter((e) => before.get(e.key) !== e.digest && !e.key.startsWith("nulo:e2e:")).map((e) => e.key)
	for (const key of before.keys()) if (!after.some((e) => e.key === key)) wrongWrote.push(key)
	const opened = await rightAttempt(s, p)
	const lost = opened ? await expireRelease(s, id, census) : []
	const { addresses, chainId } = opened ? await derivedAddresses(page, id) : { addresses: [], chainId: 0 }
	const sentinels: VerifyReading["sentinels"] = []
	if (opened) {
		for (const file of p.imported) {
			const held = w.files.find((f) => f.ref === file) as ModelFile
			sentinels.push({ file, now: await reexportImported(s, p, held), imported: s.files.get(file)?.signingKey ?? "" })
		}
	}
	await lockFromAnotherWindow(page)
	await waitForLockScreen(page, STEP_MS)
	return { ref: p.ref, wrongRefused, wrongWrote, opened, addresses, chainId, lost, sentinels }
}

export async function verifyAll(s: RunState, before: World, next: World): Promise<Driven> {
	const t0 = Date.now()
	if (before.session.kind === "open") {
		await lockFromAnotherWindow(s.anchor)
		await waitForLockScreen(s.anchor, STEP_MS)
	}
	s.verified = []
	for (const p of live(before)) s.verified.push(await verifyOne(s, p, before))
	if (next.selected) await pickOnLockScreen(s.anchor, profileId(s, next.selected))
	return timed(t0, STEP_MS * Math.max(1, live(before).length) * 3, "committed")
}
