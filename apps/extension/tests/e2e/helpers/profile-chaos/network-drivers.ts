/**
 * The network file's drivers: a dApp that asks to connect while the wallet is locked or while a
 * passkey unlock is held, and a restore held at a named stage that a lock, a restart or a delete
 * meets. They need the playground and a proverless build's restore gate.
 */
import type { Page } from "puppeteer"
import { backgroundOrigin, prepareClick } from "../../fixtures/browser"
import { clickByTestId } from "../../fixtures/dom"
import { switchToLocalNetwork } from "../../fixtures/networks"
import { holdNextGet } from "../../fixtures/passkey"
import { openPlayground } from "../../fixtures/playground"
import { pollUntil } from "../../fixtures/poll"
import { approveConnect, approveVerify, waitForPopup } from "../../fixtures/popups"
import { armRestoreGate, clearRestoreGate, readRestoreGate, waitForRestoreGateHeld } from "../../fixtures/restore-gate"
import { callService, lockFromAnotherWindow } from "../../fixtures/session"
import { continuePastErrors, fillRestore } from "./backups"
import { bindProfile } from "./checkers"
import { drainLogs } from "./collect"
import { DRIVERS, openImport } from "./drivers"
import type { ModelFile, ParamsMap, PlannedStep, ProfileRef, World } from "./model"
import { restartBackground } from "./restart"
import type { Drive, Driven, NetworkRun, RunState } from "./state"
import { authSubmitReady, openRoute, toLockScreen, waitForRoute } from "./ui"

const QUEUE_MS = 1_500
const CONNECT_MS = 60_000
const UNLOCK_MS = 60_000
const HELD_MS = 60_000
const COMPETE_MS = 2_000
const RESTORE_MS = 300_000
const DRAINED_QUEUED = /^\["Processing queued discovery: request /
const RESTORE_ENDED = /^\["\[full-backup\] restore run ended",/

interface Ask {
	dapp: Page
	discover: Promise<Page | undefined>
}

const dappConnected = (dapp: Page): Promise<boolean> =>
	dapp.evaluate(() => document.querySelector('[data-testid="pg-status"]')?.getAttribute("data-status") === "connected")

/** A fresh playground page asks to connect; while the wallet is locked no window may open and the
 *  dApp may not read as connected. */
async function askWhileLocked(s: RunState): Promise<Ask> {
	const dapp = await openPlayground(s.ctx)
	const discover = waitForPopup(s.ctx, "discover", { timeout: CONNECT_MS + UNLOCK_MS }).catch(() => undefined)
	await clickByTestId(dapp, "pg-btn-connect")
	await new Promise((resolve) => setTimeout(resolve, QUEUE_MS))
	if (s.ctx.browser.targets().some((t) => t.url().includes("#/windows/discover")))
		throw new Error("a dApp connect window opened while the wallet was locked")
	if (await dappConnected(dapp)) throw new Error("the dApp read as connected while the wallet was locked")
	return { dapp, discover }
}

/** The background's own record that the unlock drained a request it queued while locked, since the
 *  step began: a request that reached it only after the unlock never met the locked queue. */
async function drainedQueued(s: RunState): Promise<void> {
	await pollUntil(
		() => drainLogs(s.anchor, s.logs.lastId),
		(lines) => lines.some((l) => l.source === "wallet-sdk" && DRAINED_QUEUED.test(l.text)),
		{ label: "the unlock draining the queued connect", timeoutMs: CONNECT_MS, intervalMs: 500 },
	)
}

/** After the unlock: answers the connect window the queued ask opens, or sees the dApp connected
 *  without one, and waits for the dApp to read as connected. */
async function finishConnect(s: RunState, ask: Ask): Promise<void> {
	const connected = ask.dapp
		.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: CONNECT_MS })
		.then(() => undefined)
	connected.catch(() => {})
	const window = await Promise.race([ask.discover, connected])
	if (window) await approveVerify(await approveConnect(s.ctx, window))
	await connected
}

async function connectAcrossUnlock(s: RunState, ask: Ask, t0: number, unlock: () => Promise<void>): Promise<Driven> {
	try {
		await unlock()
		await waitForRoute(s.anchor, "#/popup/general", UNLOCK_MS)
		await finishConnect(s, ask)
		await drainedQueued(s)
		const elapsedMs = Date.now() - t0
		return { outcome: "committed", settle: { reached: true, elapsedMs, boundMs: UNLOCK_MS + CONNECT_MS } }
	} finally {
		await ask.dapp.close().catch(() => {})
	}
}

const dappWhileLocked: Drive = async (s, _p, step, before) => {
	const t0 = Date.now()
	await openRoute(s.anchor, "#/popup/auth")
	const ask = await askWhileLocked(s)
	const unlock = () =>
		DRIVERS.unlockPassword(s, { target: before.selected as never, variant: "right" }, step, before).then(() => undefined)
	return connectAcrossUnlock(s, ask, t0, unlock)
}

const dappDuringHeldUnlock: Drive = async (s) => {
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, "#/popup/auth")
	await authSubmitReady(page)
	const hold = await holdNextGet(page)
	await clickByTestId(page, "auth-submit")
	await hold.reached()
	const ask = await askWhileLocked(s).catch(async (err) => {
		await hold.release()
		throw err
	})
	// A person goes back to the popup to answer the prompt; Firefox refuses one from an unfocused window.
	return connectAcrossUnlock(s, ask, t0, async () => {
		await prepareClick(page)
		await hold.release()
	})
}

// ── a held restore ──────────────────────────────────────────────────────

/** The gate releases itself after its safety timeout, so a hold read released around the competing
 *  step is a harness fault: the step never met a held restore. */
async function assertHeld(page: Page, at: string, when: string): Promise<void> {
	const record = await readRestoreGate(page)
	if (record?.at !== at || record.held !== true) throw new Error(`the restore gate was released ${when} the competing step`)
}

/** The profile id a restore brought: one no live symbol is bound to. A restore keeps the backed-up
 *  profile's id, so it may be a deleted symbol's. */
async function unboundProfileId(s: RunState, deleted: ReadonlySet<ProfileRef>): Promise<string | undefined> {
	const bound = new Set([...s.bindings.profiles].filter(([ref]) => !deleted.has(ref)).map(([, id]) => id))
	const listed = await callService<{ id: string }[]>(s.anchor, "profile", "getProfiles")
	return listed.map((p) => p.id).find((id) => !bound.has(id))
}

/** Starts the competing step and lets it run until it settles or `COMPETE_MS` passes, since a lock
 *  or a delete may wait for the restore the gate holds; resolves to the step's own completion. */
async function compete(
	s: RunState,
	p: ParamsMap["restoreHeld"],
	next: World,
	deleted: ReadonlySet<ProfileRef>,
): Promise<{ done: Promise<unknown> }> {
	if (p.competing === "restart") {
		// Finalize opened the restored profile's session before the account state.
		await restartBackground(s, next, p.stage === "account-state")
		return { done: Promise.resolve() }
	}
	let call: Promise<unknown>
	if (p.competing === "lock") call = lockFromAnotherWindow(s.anchor)
	else {
		const id = await unboundProfileId(s, deleted)
		if (!id) throw new Error("no restored profile to delete while the restore is held")
		bindProfile(s.bindings, p.ref, id, deleted)
		call = callService(s.anchor, "profile", "deleteProfile", [id], RESTORE_MS)
	}
	call.catch(() => {})
	await Promise.race([call, new Promise((resolve) => setTimeout(resolve, COMPETE_MS))]).catch(() => {})
	return { done: call }
}

/** The newest log id the background holds now: lines after it belong to what follows. */
async function logCursor(s: RunState): Promise<number> {
	return (await drainLogs(s.anchor, s.logs.lastId)).at(-1)?.id ?? s.logs.lastId
}

/** Waits for the import run's own end line after `from`. The run outlives its page once a lock
 *  routes the page away, so no page state proves it ended; one that never ends fails the step
 *  before the cleanup lock could hide it. */
async function restoreEnded(s: RunState, from: number): Promise<{ reached: boolean; elapsedMs: number }> {
	const t0 = Date.now()
	await pollUntil(
		() => drainLogs(s.anchor, from),
		(lines) => lines.some((l) => l.source === "ui" && RESTORE_ENDED.test(l.text)),
		{ label: "the restore run's end", timeoutMs: RESTORE_MS, intervalMs: 500 },
	)
	return { reached: true, elapsedMs: Date.now() - t0 }
}

/** The cleanup lock ends any session, so the one the restore left is judged first: only the
 *  restored profile, while it is listed, may hold it. */
async function assertRestoredSession(page: Page, restoredId: string | undefined): Promise<void> {
	const active = await callService<{ id: string } | undefined>(page, "profile", "getActiveProfile")
	if (!active) return
	const listed = await callService<{ id: string }[]>(page, "profile", "getProfiles")
	if (active.id !== restoredId || !listed.some((x) => x.id === active.id))
		throw new Error("the restore left a session open on a profile it did not keep")
}

async function runHeld(s: RunState, p: ParamsMap["restoreHeld"], step: PlannedStep, before: World): Promise<Driven> {
	const page = s.anchor
	const deleted = new Set(before.profiles.filter((x) => x.deleted).map((x) => x.ref))
	const origin = await backgroundOrigin(s.ctx)
	let from = await logCursor(s)
	await clickByTestId(page, "import-full-backup-submit-btn")
	await waitForRestoreGateHeld(page, p.stage, HELD_MS)
	await assertHeld(page, p.stage, "before")
	const competing = await compete(s, p, step.expect.next, deleted)
	await assertHeld(page, p.stage, "after")
	// A successor background numbers its lines afresh.
	if ((await backgroundOrigin(s.ctx)) !== origin) from = 0
	await clearRestoreGate(page)
	// The competing step's own refusal fails the step: the cleanup lock below would hide it.
	await competing.done
	const settled = await restoreEnded(s, from)
	await continuePastErrors(page)
	const kept = s.bindings.profiles.has(p.ref) ? undefined : await unboundProfileId(s, deleted)
	if (kept) bindProfile(s.bindings, p.ref, kept, deleted)
	await assertRestoredSession(page, s.bindings.profiles.get(p.ref))
	await toLockScreen(page)
	const id = s.bindings.profiles.get(p.ref)
	const listed = await callService<{ id: string }[]>(page, "profile", "getProfiles")
	const outcome = id && listed.some((x) => x.id === id) ? "committed-then-locked" : "cancelled"
	return { outcome, settle: { ...settled, boundMs: RESTORE_MS } }
}

const restoreHeld: Drive = async (s, params, step, before) => {
	const p = params as ParamsMap["restoreHeld"]
	const file = before.files.find((f) => f.ref === p.file) as ModelFile
	await openImport(s, before)
	const filled = await fillRestore(s, file, { file: p.file, variant: "right", ref: p.ref, password: p.password })
	if (!filled) throw new Error(`${p.file} was refused before its restore could be held`)
	await armRestoreGate(s.anchor, p.stage)
	try {
		return await runHeld(s, p, step, before)
	} finally {
		await clearRestoreGate(s.anchor)
	}
}

/** The network file's additions to a run: its drivers, and the Local Network for every profile a
 *  step opens for the first time, as a person would pick it before connecting the playground. */
export const NETWORK_RUN: NetworkRun = {
	drivers: { dappWhileLocked, dappDuringHeldUnlock, restoreHeld },
	placeOpened: (s) => switchToLocalNetwork(s.anchor),
}
