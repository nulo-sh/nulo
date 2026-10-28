/**
 * Composition test: the profile chaos catalog driven in process over the real profile service graph
 * (`tests/helpers/profile-chaos-in-process.ts`), each step judged by the e2e runner's oracles. Hand
 * lists replay through `planFromList`; each reader has a break fixture that turns a run red on the
 * oracle it reads for. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { LogLevel } from "@nulo/wallet-core/logger"
import { describe, expect, test } from "vitest"
import type { OracleId } from "../../../../tests/e2e/helpers/profile-chaos/checkers"
import { type ListedStep, planFromList } from "../../../../tests/e2e/helpers/profile-chaos/model"
import { fakePasskeyAnswer } from "../../../../tests/helpers/fake-passkey"
import {
	describeRed,
	IN_PROCESS_CAPS,
	type InProcessRun,
	type RunReport,
	runPlan,
	type StepHooks,
} from "../../../../tests/helpers/profile-chaos-in-process"

const RUN_MS = 120_000

const planOf = (list: ListedStep[]) => planFromList(list, "empty", IN_PROCESS_CAPS)

async function green(list: ListedStep[]): Promise<RunReport> {
	const report = await runPlan(planOf(list))
	expect(report.red, describeRed(report)).toBeUndefined()
	expect(report.steps.map((s) => s.action)).toEqual(list.map((s) => s.action))
	return report
}

/** The run is red at `action`, on `oracle` alone, with a violation whose message matches `message`. */
async function redAt(list: ListedStep[], action: ListedStep["action"], oracle: OracleId, message: RegExp, hooks: StepHooks) {
	const report = await runPlan(planOf(list), hooks)
	expect(report.red?.action, describeRed(report)).toBe(action)
	expect(new Set(report.red?.violations.map((v) => v.oracle)), describeRed(report)).toEqual(new Set([oracle]))
	expect(
		report.red?.violations.some((v) => message.test(v.message)),
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

describe("the profile chaos catalog in process — hand lists", () => {
	test(
		"a passkey profile is created, unlocked, edited under its prompt, changed to a new passkey, restarted and changed to a password",
		() =>
			green([
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
			]),
		RUN_MS,
	)

	test(
		"a lock and a restart each meet a held passkey unlock, two windows unlock one password profile, and stored rows change under unlocks",
		() =>
			green([
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
			]),
		RUN_MS,
	)

	test(
		"a phrase imported over its own profile warns, declined then confirmed, and deletes from Settings and from the lock screen",
		() =>
			green([
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
			]),
		RUN_MS,
	)

	test(
		"strict mode turned off and on around restarts keeps a bearer only while lenient, and a stopped worker's row stays for the lock screen",
		() =>
			green([
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
			]),
		RUN_MS,
	)
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
					await run.worker.api.storage.local.set({ "nulo:ui:loggerWindowId": [...run.prf][0] })
					await run.worker.api.storage.local.remove("nulo:ui:loggerWindowId")
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
})
