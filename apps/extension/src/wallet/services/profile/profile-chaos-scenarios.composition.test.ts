/** Composition test: the profile chaos scenarios whose window sits inside one service call, as planned
 *  sequences on `tests/helpers/profile-chaos-in-process.ts` (`apps/extension/tests/COMPOSITION-TESTS.md`). */
import { randomBytes, randomUUID } from "node:crypto"
import { PasskeyNotOpenedError, StaleUnlockCredentialError } from "@nulo/extension-messaging/errors"
import { afterEach, describe, expect, test, vi } from "vitest"
import { bindProfile, type OracleId } from "../../../../tests/e2e/helpers/profile-chaos/checkers"
import {
	type ListedStep,
	type ModelProfile,
	type Outcome,
	type Plan,
	type PlannedStep,
	planFrom,
	profileOf,
	startWorld,
	type World,
} from "../../../../tests/e2e/helpers/profile-chaos/model"
import { freshPrfSalt } from "../../../../tests/helpers/fake-passkey"
import {
	answer,
	answerAt,
	attempt,
	boundId,
	describeRed,
	IN_PROCESS_CAPS,
	type InProcessAllowed,
	type InProcessRun,
	is,
	learnWords,
	made,
	newPasskey,
	plant,
	type RunReport,
	restart,
	runPlan,
	type ScenarioDrive,
	type StepHooks,
	says,
	type Worker,
} from "../../../../tests/helpers/profile-chaos-in-process"

const RUN_MS = 60_000
const PROFILE_ROW = "nulo:core:profiles@"

// ── plans ───────────────────────────────────────────────────────────────

/** Model steps whose effects a scenario step makes in its own schedule: the step reads as `as`
 *  (the first by default), may write what any of them may, and leaves the last one's world. */
interface Span {
	steps: ListedStep[]
	as?: number
	outcomes?: Outcome[]
	/** The world before the steps, where a harness write added a row no action makes. */
	before?: (w: World) => World
	/** The world after them, where the schedule ends otherwise than the steps in order. */
	after?: (w: World) => World
	/** The named step writes nothing, whatever its catalog action may: only the others' writes are allowed. */
	silent?: boolean
}

function build(parts: readonly (ListedStep | Span)[]): Plan {
	let w = startWorld("empty")
	const steps: PlannedStep[] = []
	for (const part of parts) {
		const span: Span = "steps" in part ? part : { steps: [part] }
		const planned = planFrom(span.before ? span.before(w) : w, span.steps, IN_PROCESS_CAPS, steps.length)
		const named = planned[span.as ?? 0]
		const last = planned[planned.length - 1]
		const next = span.after ? span.after(last.expect.next) : last.expect.next
		steps.push({
			...named,
			index: steps.length,
			expect: {
				...last.expect,
				outcomes: span.outcomes ?? named.expect.outcomes,
				next,
				writes: planned.flatMap((s, i) => (span.silent && i === (span.as ?? 0) ? [] : s.expect.writes)),
				sources: planned.flatMap((s) => s.expect.sources),
			},
		} as PlannedStep)
		w = next
	}
	return { seed: Number.NaN, start: "empty", caps: IN_PROCESS_CAPS, steps }
}

const run = (parts: readonly (ListedStep | Span)[], hooks: StepHooks) => runPlan(build(parts), hooks)

function green(report: RunReport): void {
	expect(report.red, describeRed(report)).toBeUndefined()
}

/** Red at step `index` with an `oracle` violation whose message, then its detail in brackets,
 *  matches `message`. */
function redAt(report: RunReport, index: number, oracle: OracleId, message: RegExp): void {
	expect(report.red?.index, describeRed(report)).toBe(index)
	const full = (v: { message: string; detail?: string }) => (v.detail === undefined ? v.message : `${v.message} [${v.detail}]`)
	expect(
		report.red?.violations.some((v) => v.oracle === oracle && message.test(full(v))),
		describeRed(report),
	).toBe(true)
}

const CREATE_PK: ListedStep = { action: "createPasskey", params: { ref: "P1", name: "Chaos 1", credential: "K1", double: false } }
const LOCK: ListedStep = { action: "lock", params: {} }
const UNLOCK: ListedStep = { action: "unlockPasskey", params: { target: "P1", variant: "approve" } }
const TOGGLE_STRICT: ListedStep = { action: "toggleStrict", params: {} }
const RESTART: ListedStep = { action: "backgroundRestart", params: {} }
const REVEAL: ListedStep = { action: "revealPhrase", params: { variant: "approve" } }
const DELETE: ListedStep = { action: "deleteProfile", params: { via: "settings" } }
const NEW_PASSKEY = (credential: `K${number}`): ListedStep => ({
	action: "changeUnlockMethod",
	params: { change: "new-passkey", current: "approve", credential },
})
/** Strict mode is on at a fresh install; this leaves a bearer session open on P1. */
const BEARER: ListedStep[] = [CREATE_PK, TOGGLE_STRICT, LOCK, UNLOCK]

const locked = (w: World): World => ({ ...w, session: { kind: "locked" } })
const noBearer = (w: World): World => (w.session.kind === "open" ? { ...w, session: { ...w.session, bearer: false } } : w)
/** A credential the authenticator minted at a prompt whose change never landed. */
const mintedAside = (w: World): World => ({ ...w, next: { ...w.next, credential: w.next.credential + 1 } })
const withProfile =
	(p: ModelProfile) =>
	(w: World): World => ({ ...w, profiles: [...w.profiles, p], next: { ...w.next, profile: w.next.profile + 1 } })

// ── holds and faults ────────────────────────────────────────────────────

/** A one-shot hold at the `nth` passkey answer a service call takes once armed; a scenario that
 *  arms it fails unless the hold was reached. */
function hold(nth: number, meanwhile: (run: InProcessRun) => Promise<void>) {
	let armed = false
	let seen = 0
	let reached = false
	return {
		onAnswer: async (r: InProcessRun) => {
			if (!armed || ++seen < nth) return
			armed = false
			reached = true
			await meanwhile(r)
		},
		arm: () => {
			armed = true
			seen = 0
		},
		reached: () => {
			if (!reached) throw new Error("the hold was never reached")
		},
	}
}

const rowKey = (r: InProcessRun, ref: `P${number}`) => `${PROFILE_ROW}${boundId(r, ref)}`

async function storedRow(r: InProcessRun, ref: `P${number}`): Promise<Record<string, unknown>> {
	const key = rowKey(r, ref)
	return JSON.parse((await r.worker.raw.storage.local.get(key))[key] as string)
}

/** Rewrites `ref`'s stored row around the log; the returned function puts it back where the
 *  rewrite still holds. */
async function rewriteRow(r: InProcessRun, ref: `P${number}`, change: (row: Record<string, unknown>) => void) {
	const key = rowKey(r, ref)
	const original = (await r.worker.raw.storage.local.get(key))[key] as string
	const row = JSON.parse(original)
	change(row)
	const wrote = JSON.stringify(row)
	await r.worker.raw.storage.local.set({ [key]: wrote })
	return async () => {
		if ((await r.worker.raw.storage.local.get(key))[key] === wrote) await r.worker.raw.storage.local.set({ [key]: original })
	}
}

const flipLast = (b64: string): string => {
	const bytes = Buffer.from(b64, "base64")
	bytes[bytes.length - 1] ^= 0x01
	return bytes.toString("base64")
}

/** Replaces `method` on this instance only, so the rest of the graph keeps its own. */
function replace(target: object, method: string, body: (original: (...args: never[]) => Promise<unknown>) => unknown): void {
	const own = target as Record<string, unknown>
	const original = (own[method] as (...args: unknown[]) => Promise<unknown>).bind(target)
	own[method] = body(original as never)
}

type SessionManagerView = { strictSecurityMode: boolean; isActive: (id: string) => boolean }
const sessionManagerOf = (r: InProcessRun | Worker): SessionManagerView =>
	(r.profiles as unknown as { sessionManager: SessionManagerView }).sessionManager

/** The first HMAC verify after the call, whichever call makes it, replaced by `body`. */
function onMacVerify(body: (verify: () => Promise<boolean>) => Promise<boolean>): { reached: () => void } {
	const subtle = globalThis.crypto.subtle
	const verify = subtle.verify.bind(subtle)
	let reached = false
	vi.spyOn(subtle, "verify").mockImplementation(async (...args: Parameters<SubtleCrypto["verify"]>) => {
		const hmac = (typeof args[0] === "string" ? args[0] : args[0].name) === "HMAC"
		if (!hmac || reached) return verify(...args)
		reached = true
		return body(() => verify(...args))
	})
	return {
		reached: () => {
			if (!reached) throw new Error("no HMAC verify was reached")
		},
	}
}

/** A warn or error log a sequence's step accepts. */
const accept = (pattern: RegExp, action: InProcessAllowed["during"][number]["action"], reason: string): InProcessAllowed => ({
	pattern,
	during: [{ action }],
	source: "src/wallet/services/profile",
	reason,
})

afterEach(() => {
	vi.restoreAllMocks()
})

// ── the unlock's re-read ────────────────────────────────────────────────

/** `auth.vue`'s unlock of P1 with `meanwhile` run at the service's answer. */
function heldUnlock(meanwhile: (r: InProcessRun) => Promise<void>, refusals = [says("Invalid profile id")]) {
	let undo: (() => Promise<void>) | undefined
	const h = hold(1, async (r) => {
		await meanwhile(r)
	})
	const drive: ScenarioDrive = async (r, _step, before) => {
		const p1 = profileOf(before, "P1") as ModelProfile
		const data = await answerAt(r, p1, p1.credential)
		h.arm()
		try {
			return await attempt(() => r.profiles.unlockPasskeyProfile(boundId(r, "P1"), data), refusals)
		} finally {
			await undo?.()
			h.reached()
		}
	}
	return { h, drive, setUndo: (u: () => Promise<void>) => (undo = u) }
}

describe("a prfSalt rewritten between the answer and the row's re-read", () => {
	const EDIT_DURING: ListedStep = { action: "editRowDuringUnlock", params: { field: "prfSalt" } }

	const scenario = (onTop?: (r: InProcessRun) => void) => {
		const u = heldUnlock(async (r) => {
			u.setUndo(await rewriteRow(r, "P1", (row) => (row.prfSalt = freshPrfSalt())))
			onTop?.(r)
		})
		return run([CREATE_PK, LOCK, EDIT_DURING], { onAnswer: u.h.onAnswer, drive: { 2: u.drive } })
	}

	test("the unlock is refused and writes nothing", async () => green(await scenario()), RUN_MS)

	test(
		"control: the same hold with the row untouched opens",
		async () => {
			const u = heldUnlock(async () => {})
			green(await run([CREATE_PK, LOCK, UNLOCK], { onAnswer: u.h.onAnswer, drive: { 2: u.drive } }))
		},
		RUN_MS,
	)

	test(
		"break: with the re-read skipped, the unlock opens on the rewritten row",
		async () =>
			redAt(
				await scenario((r) =>
					replace(r.profiles, "revalidatePasskeyRowHoldingLock", (original) => async (id: string) => {
						void original
						return (r.profiles as unknown as { repo: { get: (id: string) => Promise<unknown> } }).repo.get(id)
					}),
				),
				2,
				"O5",
				/ended committed/,
			),
		RUN_MS,
	)
})

// ── the reveal's fence ──────────────────────────────────────────────────

/** `export/seed.vue`'s reveal on the open P1 with `meanwhile` run at the service's answer. */
function heldReveal(meanwhile: (r: InProcessRun) => Promise<void>, refusals: ReturnType<typeof says>[] = []) {
	let undo: (() => Promise<void>) | undefined
	const h = hold(1, meanwhile)
	const drive: ScenarioDrive = async (r, _step, before) => {
		const open = profileOf(before, "P1") as ModelProfile
		const id = boundId(r, "P1")
		const data = await answerAt(r, open, open.credential)
		h.arm()
		try {
			return await attempt(async () => learnWords(r, open.phrase, await r.profiles.exportMnemonic(id, undefined, data)), refusals)
		} finally {
			await undo?.()
			h.reached()
		}
	}
	return { h, drive, setUndo: (u: () => Promise<void>) => (undo = u) }
}

const fenceBroken = (r: InProcessRun, broken: boolean) => replace(r.profiles, "profileFenceBroken", () => async () => broken)

/** A write of `ref`'s row and its restore, both through the worker's logged storage. */
async function writeBack(r: InProcessRun, ref: `P${number}`): Promise<void> {
	const key = rowKey(r, ref)
	const was = (await r.worker.raw.storage.local.get(key))[key] as string
	await r.worker.api.storage.local.set({ [key]: JSON.stringify({ ...JSON.parse(was), name: "Rewritten" }) })
	await r.worker.api.storage.local.set({ [key]: was })
}

describe("a reveal's fence after its prompt answered", () => {
	const REVEAL_ONLY: Span = { steps: [REVEAL], silent: true }

	test(
		"control: the same hold with nothing else happening returns the words",
		async () => {
			const v = heldReveal(async () => {})
			green(await run([CREATE_PK, REVEAL_ONLY], { onAnswer: v.h.onAnswer, drive: { 1: v.drive } }))
		},
		RUN_MS,
	)

	test(
		"a prfSalt rewritten there: the words the answer opened are returned and nothing is written",
		async () => {
			const v = heldReveal(async (r) => {
				v.setUndo(await rewriteRow(r, "P1", (row) => (row.prfSalt = freshPrfSalt())))
			})
			green(await run([CREATE_PK, REVEAL_ONLY], { onAnswer: v.h.onAnswer, drive: { 1: v.drive } }))
		},
		RUN_MS,
	)

	const lockThere = (onTop?: (r: InProcessRun) => Promise<void> | void) => {
		const v = heldReveal(async (r) => {
			await r.profiles.lockActiveProfile()
			await onTop?.(r)
		})
		return run([CREATE_PK, { steps: [REVEAL, LOCK], outcomes: ["committed"], silent: true }], {
			onAnswer: v.h.onAnswer,
			drive: { 1: v.drive },
		})
	}

	test("a lock there: the wallet stays locked, nothing is written, the words are returned", async () => green(await lockThere()), RUN_MS)

	test(
		"break: a reveal gated on the open session is refused after the lock",
		async () => redAt(await lockThere((r) => fenceBroken(r, true)), 1, "O5", /lists for no variant: Error \[Invalid profile id\]/),
		RUN_MS,
	)

	test(
		"break: a reveal that writes its row and restores it",
		async () => redAt(await lockThere((r) => writeBack(r, "P1")), 1, "O3", /changed for \S+, outside the action's contract/),
		RUN_MS,
	)

	const deleteThere = (onTop?: (r: InProcessRun) => void) => {
		const v = heldReveal(
			async (r) => {
				await r.profiles.deleteProfile(boundId(r, "P1"))
				onTop?.(r)
			},
			[says("Invalid profile id")],
		)
		return run([CREATE_PK, { steps: [REVEAL, DELETE], outcomes: ["refused"] }], { onAnswer: v.h.onAnswer, drive: { 1: v.drive } })
	}

	test("a delete there: the reveal is refused", async () => green(await deleteThere()), RUN_MS)

	test(
		"break: with the fence spied away, a deleted profile's words are returned",
		async () => redAt(await deleteThere((r) => fenceBroken(r, false)), 1, "O5", /ended committed/),
		RUN_MS,
	)
})

// ── a flipped dekSealed byte ────────────────────────────────────────────

describe("a flipped dekSealed byte", () => {
	const MAC_CLOSES = accept(/Sealed-envelope MAC mismatch/, "backgroundRestart", "the restore refuses the flipped row's envelope")
	const DERIVED_ONLY = accept(/DEK\/MAC failed at passkey unlock/, "unlockPasskey", "the unlock opens the flipped row derived-only")

	const restartFlipped =
		(flip: boolean, before?: () => void): ScenarioDrive =>
		async (r) => {
			if (flip) await rewriteRow(r, "P1", (row) => (row.dekSealed = flipLast(row.dekSealed as string)))
			before?.()
			await restart(r)
			return "committed"
		}

	const parts = [...BEARER, { steps: [RESTART], after: locked }, { steps: [UNLOCK], after: noBearer }]

	test(
		"under a bearer session: the restart's restore closes the session, and the next unlock opens it with no bearer",
		async () => green(await run(parts, { drive: { 4: restartFlipped(true) }, allowed: [MAC_CLOSES, DERIVED_ONLY] })),
		RUN_MS,
	)

	test(
		"control: the row unflipped, the restore keeps the session",
		async () => green(await run([...BEARER, RESTART], { drive: { 4: restartFlipped(false) } })),
		RUN_MS,
	)

	test(
		"break: the envelope MAC passed, the restore keeps a session on the flipped row",
		async () => {
			let mac: { reached: () => void } | undefined
			const report = await run(parts, {
				drive: { 4: restartFlipped(true, () => (mac = onMacVerify(async () => true))) },
				allowed: [MAC_CLOSES, DERIVED_ONLY],
			})
			mac?.reached()
			redAt(report, 4, "O1", /reports \S+ active/)
		},
		RUN_MS,
	)

	test(
		"break: a DEK trusted on the flipped row persists a bearer",
		async () =>
			redAt(
				await run(parts, {
					drive: { 4: restartFlipped(true) },
					onWorker: (w) => {
						if (w.n > 1) replace(w.profiles, "unsealTrustedDekHoldingLock", () => async () => new Uint8Array(randomBytes(32)))
					},
					allowed: [MAC_CLOSES, DERIVED_ONLY],
				}),
				5,
				"O1",
				/holds a bearer/,
			),
		RUN_MS,
	)
})

// ── retired rows ────────────────────────────────────────────────────────

const RETIRED_FIELDS = ["id", "name", "pxeGeneration", "dekSealed", "walletFingerprint", "type", "credentialId"]

/** P2 planted from P1's row: the fields a retired row keeps under a new id and name, then `slots` of P1's. */
async function plantP2(r: InProcessRun, slots: readonly string[]): Promise<string> {
	const p1 = await storedRow(r, "P1")
	const id = randomUUID()
	const row: Record<string, unknown> = { ...Object.fromEntries(RETIRED_FIELDS.map((f) => [f, p1[f]])), id, name: "Chaos 2" }
	for (const slot of slots) row[slot] = p1[slot]
	await plant(r, `${PROFILE_ROW}${id}`, JSON.stringify(row))
	return id
}

describe("a retired row naming a live row's credential", () => {
	const RETIRED_P2: ModelProfile = {
		ref: "P2",
		method: "passkey",
		name: "Chaos 2",
		retired: true,
		derived: 1,
		imported: [],
		deleted: false,
	}

	const scenario = (onTop?: (r: InProcessRun, retiredId: string) => void) =>
		run([CREATE_PK, LOCK, { steps: [UNLOCK], before: withProfile(RETIRED_P2) }], {
			drive: {
				2: async (r, _step, before) => {
					const retiredId = await plantP2(r, [])
					bindProfile(r.bindings, "P2", retiredId)
					r.knownIds.add(retiredId)
					const p1 = profileOf(before, "P1") as ModelProfile
					const data = await answerAt(r, p1, p1.credential)
					onTop?.(r, retiredId)
					return attempt(() => r.profiles.unlockPasskeyProfile(boundId(r, "P1"), data))
				},
			},
		})

	test("the live profile opens and both rows stay as they were", async () => green(await scenario()), RUN_MS)

	test(
		"break: an unlock that found its row by credential reaches the retired one",
		async () => {
			let redirected = false
			const report = await scenario((r, retiredId) =>
				replace(r.profiles, "snapshotForUnlock", (original) => async (_id: string, kind: "passkey") => {
					redirected = true
					return original(retiredId as never, kind as never)
				}),
			)
			expect(redirected).toBe(true)
			redAt(report, 2, "O5", /lists for no variant: RetiredProfileError/)
		},
		RUN_MS,
	)
})

describe("a retired row given the slots only the live row holds", () => {
	const DERIVED_ONLY = accept(/DEK\/MAC failed at passkey unlock/, "unlockPasskey", "the transplant's MAC binds another id")
	const TRANSPLANT: ModelProfile = {
		ref: "P2",
		method: "passkey",
		name: "Chaos 2",
		credential: "K1",
		phrase: "W1",
		derived: 1,
		imported: [],
		deleted: false,
	}
	const UNLOCK_P2: ListedStep = { action: "unlockPasskey", params: { target: "P2", variant: "approve" } }

	const scenario = (hooks: StepHooks = {}, afterPlant?: (r: InProcessRun, id: string) => Promise<void>) =>
		run([CREATE_PK, TOGGLE_STRICT, LOCK, { steps: [UNLOCK_P2], before: withProfile(TRANSPLANT), after: noBearer }], {
			...hooks,
			allowed: [DERIVED_ONLY],
			drive: {
				3: async (r, step, before) => {
					const id = await plantP2(r, ["guard", "secret", "entropy", "envelopeMac", "prfSalt"])
					await afterPlant?.(r, id)
					const data = await answer(r, "K1", (await storedRow(r, "P1")).prfSalt as string)
					made(r, step, before, "P2", id, { data })
					return attempt(async () => r.profiles.unlockPasskeyProfile(id, await answerAt(r, TRANSPLANT, "K1")))
				},
			},
		})

	test(
		"it opens to the live row's master with no trusted DEK and no bearer, the live row unchanged",
		async () => green(await scenario()),
		RUN_MS,
	)

	test(
		"break: a wallet write that keeps the planted row's salt is a leak, though a plant put it there first",
		async () =>
			redAt(
				await scenario({}, async (r, id) => {
					const key = `${PROFILE_ROW}${id}`
					const row = JSON.parse((await r.worker.raw.storage.local.get(key))[key] as string)
					await r.worker.api.storage.local.set({ [key]: JSON.stringify({ ...row, name: "Rewritten" }) })
				}),
				3,
				"O7",
				/P1\/prf-salt-\d+ found in local:/,
			),
		RUN_MS,
	)

	test(
		"break: a DEK trusted without its MAC persists a bearer for the transplant",
		async () =>
			redAt(
				await scenario({
					onWorker: (w) =>
						replace(
							w.profiles,
							"unsealTrustedDekHoldingLock",
							() => async (_id: string, row: { dekSealed: string }, opened: { openDek: (s: string) => Promise<unknown> }) =>
								opened.openDek(row.dekSealed),
						),
				}),
				3,
				"O1",
				/holds a bearer/,
			),
		RUN_MS,
	)
})

// ── two profiles on one credential ──────────────────────────────────────

describe("two profiles on one credential with their prfSalt values swapped", () => {
	const CREATE_P2: ListedStep = { action: "createPasskey", params: { ref: "P2", name: "Chaos 2", credential: "K1", double: false } }
	const TAMPERED = (target: `P${number}`): ListedStep => ({ action: "tamperedUnlock", params: { target, slot: "secret" } })

	const swapped =
		(target: `P${number}`, swap: boolean): ScenarioDrive =>
		async (r, _step, before) => {
			const [a, b] = [await storedRow(r, "P1"), await storedRow(r, "P2")]
			const undo = swap
				? [
						await rewriteRow(r, "P1", (row) => (row.prfSalt = b.prfSalt)),
						await rewriteRow(r, "P2", (row) => (row.prfSalt = a.prfSalt)),
					]
				: []
			try {
				const p = profileOf(before, target) as ModelProfile
				return await attempt(
					async () => r.profiles.unlockPasskeyProfile(boundId(r, target), await answerAt(r, p, p.credential)),
					[is(PasskeyNotOpenedError)],
				)
			} finally {
				for (const u of undo) await u()
			}
		}

	const parts = [CREATE_PK, CREATE_P2, LOCK, TAMPERED("P1"), TAMPERED("P2")]

	test(
		"neither opens with the other's input",
		async () => green(await run(parts, { drive: { 3: swapped("P1", true), 4: swapped("P2", true) } })),
		RUN_MS,
	)

	test(
		"control: unswapped, the unlock opens",
		async () =>
			green(
				await run([CREATE_PK, CREATE_P2, LOCK, { action: "unlockPasskey", params: { target: "P1", variant: "approve" } }], {
					drive: { 3: swapped("P1", false) },
				}),
			),
		RUN_MS,
	)

	test(
		"break: an unlock that falls back to the other row on its credential opens it with the swapped input",
		async () => {
			let fellBack = false
			const report = await run(parts, {
				drive: {
					3: async (r, step, before) => {
						const sibling = await storedRow(r, "P2")
						replace(r.profiles, "openSlots", (original) => async (row: { prfSalt: string }, key: unknown) => {
							const own = await original(row as never, key as never)
							if (own) return own
							fellBack = true
							return original({ ...sibling, prfSalt: row.prfSalt } as never, key as never)
						})
						return swapped("P1", true)(r, step, before)
					},
				},
				allowed: [accept(/DEK\/MAC failed at passkey unlock/, "tamperedUnlock", "the sibling's slots under P1's MAC")],
			})
			expect(fellBack).toBe(true)
			redAt(report, 3, "O5", /ended committed/)
		},
		RUN_MS,
	)
})

// ── strict mode turned on mid-flight ────────────────────────────────────

describe("strict mode turned on during a passkey unlock and during a bearer restore", () => {
	const strictAt = (onTop?: (r: InProcessRun) => void) =>
		heldUnlock(async (r) => {
			await r.worker.config.set("strictSecurityMode", true)
			onTop?.(r)
		}, [])

	test(
		"at the unlock's answer: the session opens with no bearer persisted",
		async () => {
			const u = strictAt()
			green(
				await run([CREATE_PK, TOGGLE_STRICT, LOCK, { steps: [UNLOCK, TOGGLE_STRICT] }], {
					onAnswer: u.h.onAnswer,
					drive: { 3: u.drive },
				}),
			)
		},
		RUN_MS,
	)

	test(
		"control: the same hold with strict mode left off persists a bearer",
		async () => {
			const u = heldUnlock(async () => {}, [])
			green(await run([CREATE_PK, TOGGLE_STRICT, LOCK, UNLOCK], { onAnswer: u.h.onAnswer, drive: { 3: u.drive } }))
		},
		RUN_MS,
	)

	test(
		"break: an open that read strict mode before the toggle persists a bearer",
		async () => {
			const u = strictAt((r) => {
				sessionManagerOf(r).strictSecurityMode = false
			})
			redAt(
				await run([CREATE_PK, TOGGLE_STRICT, LOCK, { steps: [UNLOCK, TOGGLE_STRICT] }], {
					onAnswer: u.h.onAnswer,
					drive: { 3: u.drive },
				}),
				3,
				"O1",
				/bearer under strict mode/,
			)
		},
		RUN_MS,
	)

	/** A restart whose restore meets `atMac` at its envelope MAC check, on the booting worker. */
	const restartWith = (atMac?: (booting: Worker) => Promise<void>) => {
		let booting: Worker | undefined
		let mac: { reached: () => void } | undefined
		const hooks: StepHooks = {
			onBoot: (w) => {
				booting = w
			},
			drive: {
				4: async (r) => {
					mac = onMacVerify(async (verify) => {
						if (atMac && booting) await atMac(booting)
						return verify()
					})
					await restart(r)
					mac.reached()
					return "committed"
				},
			},
		}
		return hooks
	}

	test(
		"at the restore's MAC check: the session closes",
		async () =>
			green(
				await run(
					[...BEARER, { steps: [RESTART, TOGGLE_STRICT], after: locked }],
					restartWith((w) => w.config.set("strictSecurityMode", true)),
				),
			),
		RUN_MS,
	)

	test(
		"control: the same check with strict mode left off restores the session",
		async () => green(await run([...BEARER, RESTART], restartWith())),
		RUN_MS,
	)

	test(
		"break: a restore that read strict mode before the toggle keeps the session",
		async () =>
			redAt(
				await run(
					[...BEARER, { steps: [RESTART, TOGGLE_STRICT], after: locked }],
					restartWith(async (w) => {
						await w.config.set("strictSecurityMode", true)
						sessionManagerOf(w).strictSecurityMode = false
					}),
				),
				4,
				"O1",
				/reports \S+ active/,
			),
		RUN_MS,
	)
})

// ── a stop between a method change's write and its reopen ───────────────

/** Parks the worker's next write of `key` for good, as a stop there would: after it lands when `landed`. */
function parkAfterWrite(r: InProcessRun, key: string, landed: boolean): Promise<void> {
	const area = r.worker.api.storage.local
	const set = area.set
	return new Promise((reached) => {
		area.set = async (entries) => {
			if (!(key in entries)) return set(entries)
			area.set = set
			if (landed) await set(entries)
			reached()
			await new Promise(() => {})
		}
	})
}

/** `unlock-method.vue`'s change of P1 to a new passkey `k`, stopped by a restart after its row write;
 *  `beforeRestart` runs once the change is parked. */
const stoppedChange =
	(k: `K${number}`, landed = true, beforeRestart?: () => void): ScenarioDrive =>
	async (r, _step, before) => {
		const open = profileOf(before, "P1") as ModelProfile
		const id = boundId(r, "P1")
		const current = await answerAt(r, open, open.credential)
		await r.profiles.verifyUnlockCredential(id, { passkey: current })
		const next = await newPasskey(r, before, k)
		const parked = parkAfterWrite(r, rowKey(r, "P1"), landed)
		void r.profiles.changeUnlockMethod(id, { passkey: current }, { passkey: next }).catch(() => {})
		await parked
		beforeRestart?.()
		await restart(r)
		return "committed"
	}

describe("the background stopped between a method change's row write and its reopen", () => {
	const UNLOCK_OLD: ListedStep = { action: "unlockPasskey", params: { target: "P1", variant: "other", other: "K1" } }
	const STRICT = [CREATE_PK, { steps: [NEW_PASSKEY("K2"), RESTART] }, UNLOCK_OLD, UNLOCK]

	test(
		"under strict mode: the wallet is locked and only the new passkey opens it",
		async () => green(await run(STRICT, { drive: { 1: stoppedChange("K2") } })),
		RUN_MS,
	)

	test(
		"break: a stop before the write lands leaves the old passkey opening it",
		async () => redAt(await run(STRICT, { drive: { 1: stoppedChange("K2", false) } }), 1, "O2", /K2/),
		RUN_MS,
	)

	const LENIENT = [...BEARER, { steps: [NEW_PASSKEY("K2"), RESTART] }, LOCK, UNLOCK_OLD]

	test(
		"with strict mode off: the restore reopens the session on the new row",
		async () => green(await run(LENIENT, { drive: { 4: stoppedChange("K2") } })),
		RUN_MS,
	)

	test(
		"break: a restore that refused the new row's envelope leaves the wallet locked",
		async () => {
			let mac: { reached: () => void } | undefined
			const report = await run(LENIENT, {
				drive: { 4: stoppedChange("K2", true, () => (mac = onMacVerify(async () => false))) },
				allowed: [accept(/Sealed-envelope MAC mismatch/, "changeUnlockMethod", "the break fixture fails the MAC")],
			})
			mac?.reached()
			redAt(report, 4, "O1", /active profile is none/)
		},
		RUN_MS,
	)
})

// ── a method change held at its new passkey's answer ────────────────────

/** `unlock-method.vue`'s change of P1 to a new passkey `k`, held at its new passkey's answer (the
 *  change's second) while `meanwhile` runs. */
function heldChange(
	k: `K${number}`,
	mint: "now" | "aside",
	meanwhile: (r: InProcessRun, before: World) => Promise<void>,
	refusals: ReturnType<typeof says>[],
) {
	let at: World | undefined
	const h = hold(2, (r) => meanwhile(r, at as World))
	const drive: ScenarioDrive = async (r, _step, before) => {
		at = before
		const open = profileOf(before, "P1") as ModelProfile
		const id = boundId(r, "P1")
		const current = await answerAt(r, open, open.credential)
		await r.profiles.verifyUnlockCredential(id, { passkey: current })
		if (mint === "aside") r.bindings.credentials.set(k, randomBytes(16).toString("base64"))
		const next = mint === "aside" ? await answer(r, k, freshPrfSalt()) : await newPasskey(r, before, k)
		h.arm()
		try {
			return await attempt(() => r.profiles.changeUnlockMethod(id, { passkey: current }, { passkey: next }), refusals)
		} finally {
			h.reached()
		}
	}
	return { onAnswer: h.onAnswer, drive: { 1: drive } }
}

const unchangedRow = (r: InProcessRun) => replace(r.profiles, "rowUnchangedHoldingLock", () => async () => true)

describe("a method change held at its new passkey's answer", () => {
	/** Another window's whole change to `k` lands during the hold; the held one is stale. */
	const secondChange = (onTop?: (r: InProcessRun) => void) => {
		const c = heldChange(
			"K2",
			"aside",
			async (r, before) => {
				const open = profileOf(before, "P1") as ModelProfile
				const id = boundId(r, "P1")
				const current = await answerAt(r, open, open.credential)
				await r.profiles.verifyUnlockCredential(id, { passkey: current })
				await r.profiles.changeUnlockMethod(id, { passkey: current }, { passkey: await newPasskey(r, before, "K3") })
				onTop?.(r)
			},
			[is(StaleUnlockCredentialError)],
		)
		return run([CREATE_PK, { steps: [NEW_PASSKEY("K3")], before: mintedAside, outcomes: ["refused"] }], c)
	}

	test(
		"control: the same hold with nothing else happening commits the change",
		async () =>
			green(
				await run(
					[CREATE_PK, NEW_PASSKEY("K2")],
					heldChange("K2", "now", async () => {}, []),
				),
			),
		RUN_MS,
	)

	test(
		"a second window's change lands: the held change is stale and the second one stands",
		async () => green(await secondChange()),
		RUN_MS,
	)

	test(
		"break: with the commit's row check spied away, the held change overwrites the second",
		async () => redAt(await secondChange(unchangedRow), 1, "O5", /ended committed/),
		RUN_MS,
	)

	const lockThere = (onTop?: (r: InProcessRun) => void) =>
		run(
			[CREATE_PK, { steps: [NEW_PASSKEY("K2"), LOCK] }],
			heldChange(
				"K2",
				"now",
				async (r) => {
					await r.profiles.lockActiveProfile()
					onTop?.(r)
				},
				[],
			),
		)

	test("a lock lands: the change commits and the wallet stays locked", async () => green(await lockThere()), RUN_MS)

	test(
		"break: a change that reopens a session the lock closed",
		async () =>
			redAt(
				await lockThere((r) => {
					const manager = sessionManagerOf(r)
					const isActive = manager.isActive.bind(manager)
					let once = true
					manager.isActive = (id) => {
						if (!once) return isActive(id)
						once = false
						return true
					}
				}),
				1,
				"O1",
				/active profile|locked, but/,
			),
		RUN_MS,
	)

	const deleteThere = (onTop?: (r: InProcessRun) => void) =>
		run(
			[CREATE_PK, { steps: [NEW_PASSKEY("K2"), DELETE], outcomes: ["refused"] }],
			heldChange(
				"K2",
				"now",
				async (r) => {
					await r.profiles.deleteProfile(boundId(r, "P1"))
					onTop?.(r)
				},
				[says("Invalid profile id")],
			),
		)

	test("a delete lands: the change is refused and writes no row back", async () => green(await deleteThere()), RUN_MS)

	test(
		"break: with the commit's row check spied away, the change writes the deleted profile's row back",
		async () => redAt(await deleteThere(unchangedRow), 1, "O5", /ended committed/),
		RUN_MS,
	)
})
