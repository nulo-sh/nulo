/**
 * Composition test: the profile chaos catalog driven in process over the real profile service graph
 * (`tests/helpers/profile-chaos-in-process.ts`), each step judged by the e2e runner's oracles. Hand
 * lists replay through `planFromList`; each reader has a break fixture that turns a run red on the
 * oracle it reads for. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { PasskeyNotOpenedError } from "@nulo/extension-messaging/errors"
import { LogLevel } from "@nulo/wallet-core/logger"
import { describe, expect, test, vi } from "vitest"
import type { OracleId } from "../../../../tests/e2e/helpers/profile-chaos/checkers"
import {
	type ListedStep,
	type PhraseRef,
	plan,
	planFromList,
	type ProfileRef,
	startWorld,
	type World,
} from "../../../../tests/e2e/helpers/profile-chaos/model"
import { fakePasskeyAnswer } from "../../../../tests/helpers/fake-passkey"
import {
	checkMasters,
	describeRed,
	type FirstSighting,
	IN_PROCESS_ACTIONS,
	IN_PROCESS_CAPS,
	type InProcessRun,
	type MasterReading,
	runPlan,
	type StepHooks,
	type Worker,
} from "../../../../tests/helpers/profile-chaos-in-process"

const RUN_MS = 120_000

const planOf = (list: ListedStep[]) => planFromList(list, "empty", IN_PROCESS_CAPS)

async function green(list: ListedStep[]): Promise<void> {
	const report = await runPlan(planOf(list))
	expect(report.red, describeRed(report)).toBeUndefined()
	expect(report.steps.map((s) => s.action)).toEqual(list.map((s) => s.action))
}

/** The run is red at `action`, on `oracle` alone, with a violation whose message, then its detail in
 *  brackets, matches `message`. */
async function redAt(list: ListedStep[], action: ListedStep["action"], oracle: OracleId, message: RegExp, hooks: StepHooks) {
	const report = await runPlan(planOf(list), hooks)
	expect(report.red?.action, describeRed(report)).toBe(action)
	expect(new Set(report.red?.violations.map((v) => v.oracle)), describeRed(report)).toEqual(new Set([oracle]))
	expect(
		report.red?.violations.some((v) => message.test(v.detail === undefined ? v.message : `${v.message} [${v.detail}]`)),
		describeRed(report),
	).toBe(true)
}

/** Runs `fault` once, after the driver of the first step named `action`. */
const faultAfter = (action: ListedStep["action"], fault: (run: InProcessRun) => Promise<void>): StepHooks => {
	let done = false
	return {
		afterDriver: async (run, step) => {
			if (step.action !== action || done) return
			done = true
			await fault(run)
		},
	}
}

const PROFILE_ROW = "nulo:core:profiles@"
const SESSION_ROW = "nulo:core:session"

const idOf = (run: InProcessRun, ref: `P${number}`): string => run.bindings.profiles.get(ref) as string

async function storedRow(run: InProcessRun, ref: `P${number}`): Promise<Record<string, unknown>> {
	const key = `${PROFILE_ROW}${idOf(run, ref)}`
	return JSON.parse((await run.worker.raw.storage.local.get(key))[key] as string)
}

const CREATE: ListedStep = { action: "createPassword", params: { ref: "P1", name: "Chaos 1", password: "S1", double: false } }
/** A passkey profile: no password derivation, so a fixture costs little. */
const CREATE_PK: ListedStep = { action: "createPasskey", params: { ref: "P1", name: "Chaos 1", credential: "K1", double: false } }
const RENAME: ListedStep = { action: "rename", params: { name: "Chaos 9" } }
const LOCK: ListedStep = { action: "lock", params: {} }
const RESTART: ListedStep = { action: "backgroundRestart", params: {} }
const LEAK_KEY = "nulo:ui:loggerWindowId"

/** Writes `value` through the worker and removes it, so only the write log still holds it; a
 *  session-area key, so no write contract answers. */
async function writeAndRemove(run: InProcessRun, value: string): Promise<void> {
	await run.worker.api.storage.session.set({ "nulo:chaos-session": value })
	await run.worker.api.storage.session.remove("nulo:chaos-session")
}

/** Short lists for what a seed rarely draws: each race, each row edit, a duplicate import, the
 *  strict toggle around restarts. */
const HAND_LISTS: Record<string, ListedStep[]> = {
	"a passkey profile is created, unlocked, edited under its prompt, changed to a new passkey, restarted and changed to a password": [
		{ action: "createPasskey", params: { ref: "P1", name: "Chaos 1", credential: "K1", double: false } },
		{ action: "lock", params: {} },
		{ action: "unlockPasskey", params: { target: "P1", variant: "refuse" } },
		{ action: "unlockPasskey", params: { target: "P1", variant: "no-prf" } },
		{ action: "editRowDuringUnlock", params: { field: "prfSalt" } },
		{ action: "editRowDuringUnlock", params: { field: "type" } },
		{ action: "unlockPasskey", params: { target: "P1", variant: "approve" } },
		{ action: "changeUnlockMethod", params: { change: "new-passkey", current: "refuse", credential: "K2" } },
		{ action: "changeUnlockMethod", params: { change: "new-passkey", current: "approve", credential: "K2" } },
		{ action: "backgroundRestart", params: {} },
		{ action: "unlockPasskey", params: { target: "P1", variant: "other", other: "K1" } },
		{ action: "unlockPasskey", params: { target: "P1", variant: "approve" } },
		{ action: "revealPhrase", params: { variant: "other", other: "K1" } },
		{ action: "revealPhrase", params: { variant: "approve" } },
		{ action: "changeUnlockMethod", params: { change: "password", current: "other", password: "S1", other: "K1" } },
		{ action: "changeUnlockMethod", params: { change: "password", current: "approve", password: "S1" } },
		{ action: "revealPhrase", params: { variant: "right" } },
		{ action: "verifyAll", params: {} },
	],
	"a lock and a restart each meet a held passkey unlock, two windows unlock one password profile, and stored rows change under unlocks": [
		{ action: "createPasskey", params: { ref: "P1", name: "Chaos 1", credential: "K1", double: true } },
		{ action: "lock", params: {} },
		{ action: "raceLockDuringUnlock", params: {} },
		{ action: "raceRestartDuringUnlock", params: {} },
		{ action: "editRowDuringUnlock", params: { field: "credentialId" } },
		{ action: "editRowDuringUnlock", params: { field: "secret" } },
		{ action: "tamperedUnlock", params: { target: "P1", slot: "entropy" } },
		{ action: "createPassword", params: { ref: "P2", name: "Chaos 2", password: "S1", double: false } },
		{ action: "lock", params: {} },
		{ action: "raceDoubleUnlock", params: {} },
		{ action: "verifyAll", params: {} },
	],
	"a phrase imported over its own profile warns, declined then confirmed, and deletes from Settings and from the lock screen": [
		CREATE,
		{ action: "revealPhrase", params: { variant: "wrong" } },
		{ action: "revealPhrase", params: { variant: "right" } },
		{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "Chaos 2", password: "S2", duplicate: "decline" } },
		{ action: "importPhrase", params: { ref: "P2", phrase: "W1", name: "Chaos 2", password: "S2", duplicate: "confirm" } },
		{
			action: "importPhrase",
			params: { ref: "P3", phrase: "W1", name: "Chaos 3", method: "passkey", credential: "K1", duplicate: "confirm" },
		},
		{ action: "deleteProfile", params: { via: "settings" } },
		{ action: "switchProfile", params: { to: "P1" } },
		{ action: "deleteProfile", params: { via: "forgot" } },
		{ action: "verifyAll", params: {} },
	],
	"strict mode turned off and on around restarts keeps a bearer only while lenient, and a stopped worker's row stays for the lock screen":
		[
			{ action: "onboardingCreate", params: { ref: "P1", method: "passkey", credential: "K1", answer: "later" } },
			{ action: "toggleStrict", params: {} },
			{ action: "lock", params: {} },
			{ action: "unlockPasskey", params: { target: "P1", variant: "approve" } },
			{ action: "backgroundRestart", params: {} },
			{ action: "toggleStrict", params: {} },
			{ action: "backgroundRestart", params: {} },
			{ action: "unlockPasskey", params: { target: "P1", variant: "approve" } },
			RENAME,
			{ action: "verifyAll", params: {} },
		],
}

/** The fixed set: the fewest seeds from 8001 upward that, with the hand lists, drive every
 *  action of the surface. */
const FIXED_SEEDS = [8001]

describe("the profile chaos catalog in process", () => {
	test.each(Object.entries(HAND_LISTS))("%s", (_, list) => green(list), RUN_MS)

	test.each(FIXED_SEEDS)(
		"seed %i",
		async (seed) => {
			const report = await runPlan(plan(seed, "empty", IN_PROCESS_CAPS))
			expect(report.red, describeRed(report)).toBeUndefined()
		},
		RUN_MS,
	)

	test("the fixed seeds and the hand lists drive every action of the surface", () => {
		const driven = new Set([
			...Object.values(HAND_LISTS).flatMap((list) => planOf(list).steps.map((s) => s.action)),
			...FIXED_SEEDS.flatMap((seed) => plan(seed, "empty", IN_PROCESS_CAPS).steps.map((s) => s.action)),
		])
		expect(IN_PROCESS_ACTIONS.filter((a) => !driven.has(a))).toEqual([])
	})
})

describe("each reader can fail — break fixtures", () => {
	test(
		"O1: a bearer stored under strict mode",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O1",
				/holds a bearer/,
				faultAfter("createPasskey", async (run) => {
					const row = JSON.parse((await run.worker.raw.storage.session.get(SESSION_ROW))[SESSION_ROW] as string)
					await run.worker.raw.storage.session.set({ [SESSION_ROW]: JSON.stringify({ ...row, bearer: "planted" }) })
				}),
			),
		RUN_MS,
	)

	test(
		"O1: a call that needs a session served while the model holds the wallet locked",
		() =>
			redAt(
				[CREATE_PK, { action: "lock", params: {} }],
				"lock",
				"O1",
				/a call that needs an open session was served/,
				faultAfter("lock", async (run) => {
					const id = idOf(run, "P1")
					const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
					await run.profiles.unlockPasskeyProfile(
						id,
						await fakePasskeyAnswer(run.bindings.credentials.get("K1") as string, prfSalt),
					)
				}),
			),
		RUN_MS,
	)

	test(
		"O1: a bearer written under strict mode and replaced in the same step",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O1",
				/wrote a session row holding a bearer under strict mode/,
				faultAfter("createPasskey", async (run) => {
					const original = (await run.worker.raw.storage.session.get(SESSION_ROW))[SESSION_ROW] as string
					await run.worker.api.storage.session.set({
						[SESSION_ROW]: JSON.stringify({ ...JSON.parse(original), bearer: "planted" }),
					})
					await run.worker.api.storage.session.set({ [SESSION_ROW]: original })
				}),
			),
		RUN_MS,
	)

	test(
		"O2: a profile row the model never made",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O2",
				/stored but the model holds no such live profile/,
				faultAfter("createPasskey", async (run) => {
					// Shaped as a retired row, so no slot and no `prfSalt` makes another oracle answer first.
					const { guard: _g, secret: _s, entropy: _e, envelopeMac: _m, prfSalt: _p, ...row } = await storedRow(run, "P1")
					await run.worker.raw.storage.local.set({ [`${PROFILE_ROW}strayrow`]: JSON.stringify({ ...row, id: "strayrow" }) })
				}),
			),
		RUN_MS,
	)

	test(
		"O2: a profile row missing a field",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O2",
				/holds the fields/,
				faultAfter("createPasskey", async (run) => {
					const { walletFingerprint: _dropped, ...row } = await storedRow(run, "P1")
					await run.worker.raw.storage.local.set({ [`${PROFILE_ROW}${idOf(run, "P1")}`]: JSON.stringify(row) })
				}),
			),
		RUN_MS,
	)

	test(
		"O3: a write outside the step's contract, reverted before the step ends",
		() =>
			redAt(
				[CREATE_PK, { action: "lock", params: {} }],
				"lock",
				"O3",
				/outside the action's contract/,
				faultAfter("lock", async (run) => {
					const key = `${PROFILE_ROW}${idOf(run, "P1")}`
					const original = (await run.worker.raw.storage.local.get(key))[key] as string
					await run.worker.api.storage.local.set({ [key]: JSON.stringify({ ...JSON.parse(original), name: "Planted" }) })
					await run.worker.api.storage.local.set({ [key]: original })
				}),
			),
		RUN_MS,
	)

	test(
		"O3: an unregistered storage.local key, written and removed",
		() =>
			redAt(
				[CREATE_PK, RENAME],
				"rename",
				"O3",
				/changed under no registered family/,
				faultAfter("rename", async (run) => {
					await run.worker.api.storage.local.set({ "nulo:chaos-unregistered": "1" })
					await run.worker.api.storage.local.remove("nulo:chaos-unregistered")
				}),
			),
		RUN_MS,
	)

	test(
		"O3 control: a session-area record written and removed passes",
		async () => {
			const report = await runPlan(
				planOf([CREATE_PK, RENAME]),
				faultAfter("rename", async (run) => {
					await run.worker.api.storage.session.set({ "nulo:chaos-session": "{}" })
					await run.worker.api.storage.session.remove("nulo:chaos-session")
				}),
			)
			expect(report.red, describeRed(report)).toBeUndefined()
		},
		RUN_MS,
	)

	test(
		"O7: a PRF output written to storage and removed in the same step",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O7",
				/prf-0\/b64 found in local:nulo:ui:loggerWindowId/,
				faultAfter("createPasskey", async (run) => {
					await run.worker.api.storage.local.set({ [LEAK_KEY]: [...run.prf][0] })
					await run.worker.api.storage.local.remove(LEAK_KEY)
				}),
			),
		RUN_MS,
	)

	test(
		"O7: a phrase's words written as a JSON array",
		() =>
			redAt(
				[CREATE_PK, RENAME],
				"rename",
				"O7",
				/\/words-json found in session:nulo:chaos-session/,
				faultAfter("rename", (run) => writeAndRemove(run, JSON.stringify([...run.phrases.values()][0].words))),
			),
		RUN_MS,
	)

	test(
		"O7: a wrong password the person typed",
		() =>
			redAt(
				[CREATE, LOCK, { action: "unlockPassword", params: { target: "P1", variant: "wrong" } }],
				"unlockPassword",
				"O7",
				/wrong-0\/password found in session:nulo:chaos-session/,
				faultAfter("unlockPassword", (run) => writeAndRemove(run, run.wrong[0])),
			),
		RUN_MS,
	)

	test(
		"O7: a PRF output in an info log",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O7",
				/prf-0\/b64 found in log:/,
				faultAfter("createPasskey", async (run) => {
					run.worker.logger.log("chaos-fixture", LogLevel.Info, { note: [...run.prf][0] })
				}),
			),
		RUN_MS,
	)

	test(
		"O4: an error log no entry accepts",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O4",
				/Error log from chaos-fixture/,
				faultAfter("createPasskey", async (run) => {
					run.worker.logger.log("chaos-fixture", LogLevel.Error, "a planted failure")
				}),
			),
		RUN_MS,
	)

	test(
		"O4: a console error the worker's hook routes to its logger",
		() =>
			redAt(
				[CREATE_PK],
				"createPasskey",
				"O4",
				/Error log from wallet/,
				faultAfter("createPasskey", async () => {
					console.error("a planted failure")
				}),
			),
		RUN_MS,
	)

	test(
		"O6: an open session whose secret changed under it",
		() =>
			redAt(
				[CREATE_PK, RENAME],
				"rename",
				"O6",
				/^P1's session secret is not the one it showed at first sighting$/,
				faultAfter("rename", async (run) => {
					const { sessionManager } = run.profiles as unknown as { sessionManager: { activeSession: { secret: Fr } } }
					sessionManager.activeSession.secret = Fr.ZERO
				}),
			),
		RUN_MS,
	)
})

const NEW_PASSKEY: ListedStep = { action: "changeUnlockMethod", params: { change: "new-passkey", current: "approve", credential: "K2" } }
type Snapshot = (id: string, kind: string) => Promise<unknown>

describe("the harness reads what it drives — break fixtures", () => {
	test.each([
		["prfSalt", "Invalid profile id"],
		["secret", "Invalid profile id"],
		["credentialId", "Invalid profile id"],
		["type", "Profile requires password"],
	] as const)(
		"an unlock that reads the row its parameters read, not the row with its %s edited, fails the step",
		(field, detail) =>
			redAt(
				[CREATE_PK, LOCK, { action: "editRowDuringUnlock", params: { field } }],
				"editRowDuringUnlock",
				"O5",
				new RegExp(`lists for no variant: Error \\[${detail}\\]$`),
				{
					onWorker: (worker) => {
						const profiles = worker.profiles as unknown as { snapshotForUnlock: Snapshot }
						const read = profiles.snapshotForUnlock.bind(worker.profiles)
						let held: Promise<unknown> | undefined
						vi.spyOn(profiles, "snapshotForUnlock").mockImplementation((id, kind) => {
							const snapshot = held ?? read(id, kind)
							held = held ? undefined : snapshot
							return snapshot
						})
					},
				},
			),
		RUN_MS,
	)

	test(
		"a rejection its driver lists for no variant fails the step instead of reading as a refusal",
		() =>
			redAt(
				[CREATE_PK, NEW_PASSKEY, LOCK, { action: "unlockPasskey", params: { target: "P1", variant: "other", other: "K1" } }],
				"unlockPasskey",
				"O5",
				/lists for no variant: PasskeyNotOpenedError/,
				{
					onWorker: (worker) =>
						void vi.spyOn(worker.profiles, "unlockPasskeyProfile").mockRejectedValue(new PasskeyNotOpenedError()),
				},
			),
		RUN_MS,
	)

	test(
		"a stopped worker's write that lands between two steps is reported at the next",
		() =>
			redAt(
				[CREATE_PK, RESTART, { action: "unlockPasskey", params: { target: "P1", variant: "approve" } }],
				"unlockPasskey",
				"O3",
				/^worker 1 wrote local:nulo:ui:loggerWindowId after its restart$/,
				faultAfter("backgroundRestart", async (run) => {
					const begin = run.beginStep.bind(run)
					vi.spyOn(run, "beginStep").mockImplementationOnce(() => {
						// As the logged area records it once the stopped worker's read returns.
						run.strays.push({ worker: 1, area: "local", key: LEAK_KEY, before: undefined, after: "1", strict: true })
						begin()
					})
				}),
			),
		RUN_MS,
	)

	test(
		"a worker that writes after its restart is refused and reported",
		() => {
			const workers: Worker[] = []
			return redAt([CREATE_PK, RESTART], "backgroundRestart", "O3", /worker 1 wrote local:\S+ after its restart/, {
				onWorker: (worker) => void workers.push(worker),
				afterDriver: async (_run, step) => {
					if (step.action === "backgroundRestart")
						await expect(workers[0].api.storage.local.set({ [LEAK_KEY]: "1" })).rejects.toThrow()
				},
			})
		},
		RUN_MS,
	)
})

describe("O6 reads each clause of a master — break fixtures", () => {
	const A = Buffer.alloc(32, 0x0a).toString("base64")
	const B = Buffer.alloc(32, 0x0b).toString("base64")
	const fieldOf = (master: string) => Fr.fromBuffer(Buffer.from(master, "base64")).toString()
	const world = (...profiles: [ProfileRef, PhraseRef][]): World => ({
		...startWorld("empty"),
		profiles: profiles.map(([ref, phrase]) => ({
			ref,
			method: "password",
			password: "S1",
			phrase,
			derived: 1,
			imported: [],
			deleted: false,
		})),
	})
	const opened = (ref: ProfileRef, master: string, sessionSecret = fieldOf(master)): MasterReading => ({
		ref,
		wrongRefused: true,
		wrongWrote: [],
		opened: true,
		master,
		sessionSecret,
	})
	const firstSeen = (...entries: [ProfileRef, string][]): FirstSighting => ({
		masters: new Map(entries),
		sessionSecrets: new Map(entries.map(([ref, master]) => [ref, fieldOf(master)])),
	})

	test("control: siblings share a master, strangers differ, each as first seen", () => {
		const w = world(["P1", "W1"], ["P2", "W1"], ["P3", "W2"])
		expect(checkMasters(w, [opened("P1", A), opened("P2", A), opened("P3", B)], firstSeen(["P1", A], ["P2", A], ["P3", B]))).toEqual([])
	})

	test.each<[string, World, MasterReading[], FirstSighting, RegExp]>([
		["a lone profile's master replaced", world(["P1", "W1"]), [opened("P1", B)], firstSeen(["P1", A]), /^P1's master is not the one/],
		[
			"a sibling with another master",
			world(["P1", "W1"], ["P2", "W1"]),
			[opened("P1", A), opened("P2", B)],
			firstSeen(["P1", A], ["P2", B]),
			/^P1 and P2 share W1 but hold different masters$/,
		],
		[
			"a stranger with the same master",
			world(["P1", "W1"], ["P2", "W2"]),
			[opened("P1", A), opened("P2", A)],
			firstSeen(["P1", A], ["P2", A]),
			/^P1 and P2 hold different phrases but one master$/,
		],
		["a profile not verified", world(["P1", "W1"]), [], firstSeen(["P1", A]), /^P1 was not verified$/],
		[
			"a profile opened with a wrong secret",
			world(["P1", "W1"]),
			[{ ...opened("P1", A), wrongRefused: false }],
			firstSeen(["P1", A]),
			/^P1 opened with a wrong secret$/,
		],
		[
			"a refused unlock that wrote",
			world(["P1", "W1"]),
			[{ ...opened("P1", A), wrongWrote: [`local:${SESSION_ROW}`] }],
			firstSeen(["P1", A]),
			/^P1's refused unlock wrote local:nulo:core:session$/,
		],
		[
			"a profile that did not open with its own secret",
			world(["P1", "W1"]),
			[{ ref: "P1", wrongRefused: true, wrongWrote: [], opened: false }],
			firstSeen(["P1", A]),
			/^P1 did not open with its own secret$/,
		],
		[
			"a session secret other than at first sighting",
			world(["P1", "W1"]),
			[opened("P1", A)],
			{ masters: new Map([["P1", A]]), sessionSecrets: new Map([["P1", fieldOf(B)]]) },
			/^P1's session secret is not the one it showed at first sighting$/,
		],
		[
			"a session secret off its master",
			world(["P1", "W1"]),
			[opened("P1", A, fieldOf(B))],
			{ masters: new Map([["P1", A]]), sessionSecrets: new Map([["P1", fieldOf(B)]]) },
			/^P1's session secret is not its master$/,
		],
	])("%s", (_, w, readings, seen, message) => {
		const out = checkMasters(w, readings, seen)
		expect(out.length).toBeGreaterThan(0)
		expect(out.every((v) => v.oracle === "O6")).toBe(true)
		expect(
			out.some((v) => message.test(v.message)),
			JSON.stringify(out),
		).toBe(true)
	})
})

/** How many seeds `NULO_PROFILE_CHAOS_RUNS` asks for: none when unset or empty. */
function runsOf(raw: string | undefined): number {
	if (!raw) return 0
	if (!/^[1-9]\d*$/.test(raw)) throw new Error(`NULO_PROFILE_CHAOS_RUNS=${JSON.stringify(raw)} is not a positive integer`)
	return Number(raw)
}

/** The long mode's first seed from `NULO_PROFILE_CHAOS_SEED`: a random draw when unset or empty, else
 *  a nonnegative decimal safe integer, so the seed the test's name logs replays that very run. */
function firstSeed(raw: string | undefined): number {
	if (!raw) return Math.floor(Math.random() * 2 ** 31)
	if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
		throw new Error(`NULO_PROFILE_CHAOS_SEED=${JSON.stringify(raw)} is not a decimal integer seed`)
	return Number(raw)
}

const RUNS = runsOf(process.env.NULO_PROFILE_CHAOS_RUNS)

describe.skipIf(RUNS === 0)("the profile chaos catalog in process — long mode", () => {
	const first = firstSeed(process.env.NULO_PROFILE_CHAOS_SEED)
	test(
		`${RUNS} seed(s) from ${first}`,
		async () => {
			for (let seed = first; seed < first + RUNS; seed++) {
				const report = await runPlan(plan(seed, "empty", IN_PROCESS_CAPS))
				expect(report.red, describeRed(report)).toBeUndefined()
			}
		},
		Math.max(1, RUNS) * RUN_MS,
	)
})
