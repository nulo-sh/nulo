/**
 * `verifyAll`: every live profile in model order is refused a wrong secret with no write, opens with
 * its own, and shows its accounts; a password profile also re-exports each imported account. The
 * lock screen then goes back to the model's selection.
 */
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { lockFromAnotherWindow } from "../../fixtures/session"
import { answerWithCredential } from "../../fixtures/passkey"
import { derivedAddresses, reexportImported } from "./accounts-io"
import type { VerifyReading } from "./checkers"
import { readCensus } from "./collect"
import { live, type ModelProfile, type World } from "./model"
import { type Driven, profileId, type RunState, secretFor, wrongSecret } from "./state"
import { authSubmitReady, firstSignal, HOME, openRoute, pickOnLockScreen, timed, typePasswordAndSubmit } from "./ui"
import { waitForLockScreen } from "../../fixtures/auth"
import { clickByTestId } from "../../fixtures/dom"

const STEP_MS = 60_000

/** A wrong secret for `p`: another password, or another live profile's passkey, else a refused
 *  prompt. Resolves whether the lock screen refused it. */
async function wrongAttempt(s: RunState, p: ModelProfile, w: World): Promise<boolean> {
	const page = s.anchor
	if (p.method === "password") {
		await typePasswordAndSubmit(page, wrongSecret())
		return (
			(await firstSignal(page, [{ label: "refused", testid: "error-text", hash: "/popup/auth" }, HOME], STEP_MS)).label === "refused"
		)
	}
	await authSubmitReady(page)
	const other = live(w).find((x) => x.ref !== p.ref && x.credential && s.credentials.has(x.credential))
	if (other?.credential) {
		await answerWithCredential(page, s.credentials.get(other.credential) as string)
		await clickByTestId(page, "auth-submit")
	} else if (s.auth) {
		const allow = await s.auth.refuseNextStep(page)
		await clickByTestId(page, "auth-submit")
		await firstSignal(page, [{ label: "refused", text: PASSKEY_COPY.notConfirmed }], STEP_MS)
		await allow()
		return (await page.evaluate(() => location.hash)).includes("/popup/auth")
	}
	const refusals = [PASSKEY_COPY.unlockFailed, PASSKEY_COPY.noPrf, PASSKEY_COPY.notConfirmed].map((text) => ({
		label: "refused",
		text,
		hash: "/popup/auth",
	}))
	return (await firstSignal(page, [...refusals, HOME], STEP_MS)).label === "refused"
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

async function verifyOne(s: RunState, p: ModelProfile, w: World): Promise<VerifyReading> {
	const page = s.anchor
	const id = profileId(s, p.ref)
	await openRoute(page, "#/popup/auth")
	await pickOnLockScreen(page, id)
	const before = new Map((await readCensus(page)).map((e) => [e.key, e.digest]))
	const wrongRefused = await wrongAttempt(s, p, w)
	const after = await readCensus(page)
	const wrongWrote = after.filter((e) => before.get(e.key) !== e.digest && !e.key.startsWith("nulo:e2e:")).map((e) => e.key)
	for (const key of before.keys()) if (!after.some((e) => e.key === key)) wrongWrote.push(key)
	const opened = await rightAttempt(s, p)
	const addresses = opened ? await derivedAddresses(page, id) : []
	const sentinels: VerifyReading["sentinels"] = []
	if (opened && p.method === "password") {
		for (const file of p.imported) {
			sentinels.push({ file, now: await reexportImported(s, p, file), imported: s.files.get(file)?.signingKey ?? "" })
		}
	}
	await lockFromAnotherWindow(page)
	await waitForLockScreen(page, STEP_MS)
	return { ref: p.ref, wrongRefused, wrongWrote, opened, addresses, sentinels }
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
