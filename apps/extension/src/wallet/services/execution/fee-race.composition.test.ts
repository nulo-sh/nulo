/**
 * Composition test: the fee-race catalog (`tests/helpers/fee-race/model.ts`) driven in process over
 * the popup's estimate code and the real execution graph (`tests/helpers/fee-race-in-process.ts`),
 * every step judged by four oracles. Fixed seeds and hand lists run in the unit suite; each oracle
 * has a break fixture that injects one fault at a seam and turns that oracle alone red. See
 * `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { describe, expect, test } from "vitest"
import { ACTION_NAMES, type ListedStep, type Method, plan, planFromList } from "../../../../tests/helpers/fee-race/model"
import {
	describeRed,
	type Faults,
	type OracleId,
	type PressFact,
	type RaceReport,
	runPlan,
} from "../../../../tests/helpers/fee-race-in-process"

const RUN_MS = 30_000

const openWindow = (method: Method): ListedStep => ({ action: "openWindow", params: { method } })
const openSend = (method: "sponsor" | "fee_juice" | "private_fpc", transfer: "public" | "private" = "public"): ListedStep => ({
	action: "openSend",
	params: { method, transfer },
})
const press = (target: `op${number}`, timing: "now" | "first-offer" | "repeat" = "now"): ListedStep => ({
	action: "press",
	params: { target, timing },
})
const askAgain = (target: `op${number}`): ListedStep => ({ action: "askAgain", params: { target } })
const LAND: ListedStep = { action: "landEstimate", params: {} }
const FAIL: ListedStep = { action: "failEstimate", params: {} }
const PROOF: ListedStep = { action: "finishProof", params: {} }
const MINE: ListedStep = { action: "mineBlock", params: {} }
const LOCK: ListedStep = { action: "lock", params: {} }
const PAST_REUSE: ListedStep = { action: "advanceClock", params: { by: "past-reuse" } }
const PAST_WINDOW: ListedStep = { action: "advanceClock", params: { by: "past-window" } }

/** Every run's report, read by the coverage test at the end of the file. */
const reports: RaceReport[] = []

async function green(list: ListedStep[]): Promise<RaceReport> {
	const report = await runPlan(planFromList(list))
	reports.push(report)
	expect(report.red, describeRed(report)).toBeUndefined()
	return report
}

/** The run is red on `oracle` alone, with a message matching `message`. */
async function redOn(list: ListedStep[], faults: Faults, oracle: OracleId, message: RegExp): Promise<void> {
	const report = await runPlan(planFromList(list), faults)
	expect(new Set(report.red?.violations.map((v) => v.oracle)), describeRed(report)).toEqual(new Set([oracle]))
	expect(
		report.red?.violations.some((v) => message.test(v.message)),
		describeRed(report),
	).toBe(true)
}

const outcomeAt = (report: RaceReport, index: number) => report.steps[index]?.outcome

/** A Send that proves, held at its proof gate. */
const SEND_PROVING: ListedStep[] = [openSend("fee_juice"), LAND, press("op1")]

const HAND_LISTS: Record<string, ListedStep[]> = {
	"a window opened while a send proves queues, then confirms on first offer once its estimate lands": [
		...SEND_PROVING,
		openWindow("sponsor"),
		askAgain("op2"),
		press("op2", "first-offer"),
		PROOF,
		LAND,
		PROOF,
		MINE,
	],
	"a Send queued behind a window's proof on Nulo's sponsor names no estimate, so it rebuilds at its turn": [
		openWindow("fee_juice"),
		LAND,
		press("op1"),
		openSend("sponsor", "private"),
		press("op2"),
		PROOF,
		PROOF,
		MINE,
	],
	"a method switch mid-estimate: Confirm holds until the new method's estimate lands": [
		openWindow("sponsor"),
		{ action: "switchMethod", params: { target: "op1", method: "fee_juice" } },
		LAND,
		press("op1"),
		press("op1", "repeat"),
		LAND,
		press("op1"),
		PROOF,
		MINE,
		openWindow("private_fpc"),
		{ action: "switchMethod", params: { target: "op2", method: "sponsor" } },
		press("op2", "first-offer"),
		LAND,
		LAND,
		PROOF,
	],
	"a failed estimate: a sponsored window confirms all the same, a window paying its own fee holds": [
		openWindow("sponsor"),
		FAIL,
		press("op1"),
		PROOF,
		openWindow("fee_juice"),
		FAIL,
		press("op2"),
		openSend("fee_juice"),
		FAIL,
		press("op3"),
	],
	"a window pressed behind a send waits past the reuse bound; its claimed snapshot is still there": [
		openWindow("fee_juice"),
		LAND,
		openSend("fee_juice"),
		LAND,
		press("op2"),
		press("op1"),
		PAST_REUSE,
		PROOF,
		PROOF,
		MINE,
	],
	"a cancel during a proof sends nothing; a lock ends the next send at its proof": [
		...SEND_PROVING,
		openWindow("sponsor"),
		press("op2", "first-offer"),
		{ action: "cancel", params: { target: "op1" } },
		PROOF,
		LAND,
		LOCK,
		PROOF,
		openWindow("no_from"),
		LAND,
		press("op3"),
		PROOF,
	],
	"a default-entrypoint preview and an app-paid estimate queue behind a send; a window past its lifetime closes": [
		...SEND_PROVING,
		openWindow("no_from"),
		openWindow("app"),
		PROOF,
		LAND,
		LAND,
		press("op2"),
		press("op3"),
		openWindow("fee_juice"),
		PAST_WINDOW,
		PROOF,
		PROOF,
		MINE,
	],
	"three windows deep go out in press order, the later ones rebuilding behind the first": [
		openWindow("sponsor"),
		openWindow("fee_juice"),
		openWindow("private_fpc"),
		LAND,
		LAND,
		LAND,
		press("op1"),
		press("op2"),
		press("op3"),
		PROOF,
		PROOF,
		MINE,
		PROOF,
		MINE,
	],
}

/** Seeded interleavings beside the hand lists; the file's runtime budget holds three. */
const FIXED_SEEDS = [8001, 8002, 8003]

describe("the fee-race catalog in process", () => {
	test.each(Object.entries(HAND_LISTS))(
		"%s",
		async (_, list) => {
			await green(list)
		},
		RUN_MS,
	)

	test.each(FIXED_SEEDS)(
		"seed %i",
		async (seed) => {
			const report = await runPlan(plan(seed))
			reports.push(report)
			expect(report.red, describeRed(report)).toBeUndefined()
		},
		RUN_MS,
	)
})

describe("a PrivateFPC send beside another that holds the contract's notes", () => {
	// Each spends the payer's notes through the PrivateFPC (`fpc:<address>` in
	// `transfer-sequence-keys.ts`), so the second one waits until the first is in a block.
	test(
		"a Send's estimate queues behind a PrivateFPC Send until that send's block, then runs",
		async () => {
			const report = await green([
				openSend("private_fpc", "private"),
				LAND,
				press("op1"),
				openSend("private_fpc", "public"),
				PROOF,
				askAgain("op2"),
				MINE,
				askAgain("op2"),
				LAND,
				press("op2"),
				PROOF,
				MINE,
			])
			expect([outcomeAt(report, 3), outcomeAt(report, 5)]).toEqual(["queued", "queued"])
			expect(["granted", "estimating"]).toContain(outcomeAt(report, 7))
			expect(report.presses.map((p) => [p.ref, p.end])).toEqual([
				["op1", "sent"],
				["op2", "sent"],
			])
		},
		RUN_MS,
	)

	test(
		"a Send's estimate queues behind a window's PrivateFPC send until that send's block",
		async () => {
			const report = await green([
				openWindow("private_fpc"),
				LAND,
				press("op1"),
				openSend("private_fpc", "public"),
				PROOF,
				askAgain("op2"),
				MINE,
				askAgain("op2"),
				LAND,
				press("op2"),
				PROOF,
				MINE,
			])
			expect([outcomeAt(report, 3), outcomeAt(report, 5)]).toEqual(["queued", "queued"])
			expect(report.presses.map((p) => [p.ref, p.end])).toEqual([
				["op1", "sent"],
				["op2", "sent"],
			])
		},
		RUN_MS,
	)

	test(
		"a window confirmed beside a pressed PrivateFPC Send waits for that send's block, then rebuilds",
		async () => {
			const report = await green([
				openSend("private_fpc", "private"),
				LAND,
				openWindow("private_fpc"),
				LAND,
				press("op1"),
				press("op2"),
				PROOF,
				PROOF,
				MINE,
			])
			expect(outcomeAt(report, 7)).toBe("idle")
			expect(report.presses.map((p) => [p.ref, p.end])).toEqual([
				["op1", "sent"],
				["op2", "rebuild"],
			])
		},
		RUN_MS,
	)
})

describe("each oracle can fail — break fixtures", () => {
	test(
		"O1: the window's rule reads an estimate in flight as settled",
		() => redOn([openWindow("sponsor"), press("op1")], { ruleIgnoresInFlight: true }, "O1", /pressed while its estimate was running/),
		RUN_MS,
	)

	test(
		"O1: a 120 s snapshot sweep leaves a window waiting behind a proof without its snapshot",
		() =>
			redOn(
				[openWindow("fee_juice"), LAND, openSend("fee_juice"), LAND, press("op2"), press("op1"), PAST_REUSE, PROOF, PROOF],
				{ snapshotSweepAt120s: true },
				"O1",
				/op1's snapshot was missing at its turn/,
			),
		RUN_MS,
	)

	test(
		"O2: the popup fails an estimate the worker answered queued",
		() =>
			redOn(
				[...SEND_PROVING, openWindow("sponsor")],
				{ popupFailsQueued: true },
				"O2",
				/failed in the popup while the worker answered it queued/,
			),
		RUN_MS,
	)

	test(
		"O3: the slot grants a request ahead of an earlier one",
		() =>
			redOn(
				[openWindow("sponsor"), LAND, openSend("fee_juice"), LAND, press("op2"), press("op1"), openSend("sponsor"), press("op3")],
				{ laneSkipsLine: true },
				"O3",
				/granted ahead of request/,
			),
		RUN_MS,
	)

	test(
		"O3: a journal row is reported past a stage it never took",
		() => redOn([openWindow("sponsor")], { journalSkipsStage: true }, "O3", /moved queued → submitting/),
		RUN_MS,
	)

	test(
		"O4: the strip loses a transaction the node took",
		() => redOn([...SEND_PROVING, PROOF], { stripDropsRow: true }, "O4", /the strip shows/),
		RUN_MS,
	)
})

describe("coverage", () => {
	const pressed = (): PressFact[] => reports.flatMap((r) => r.presses)

	test("the fixed seeds and the hand lists drive every action", () => {
		const driven = new Set([
			...Object.values(HAND_LISTS).flatMap((list) => planFromList(list).steps.map((s) => s.action)),
			...FIXED_SEEDS.flatMap((seed) => plan(seed).steps.map((s) => s.action)),
		])
		expect(ACTION_NAMES.filter((a) => !driven.has(a))).toEqual([])
	})

	// Reads the reports of the runs above: run the file whole.
	test("every surface and method, every timing and every estimate state is pressed, behind a send and not", () => {
		const facts = pressed()
		const seen = (key: (p: PressFact) => string) => new Set(facts.map(key))
		expect(seen((p) => `${p.surface}:${p.method}`)).toEqual(
			new Set([
				"window:sponsor",
				"window:fee_juice",
				"window:private_fpc",
				"window:app",
				"window:no_from",
				"send:sponsor",
				"send:fee_juice",
				"send:private_fpc",
			]),
		)
		expect(seen((p) => p.timing)).toEqual(new Set(["now", "first-offer"]))
		expect(seen((p) => p.estimate)).toEqual(new Set(["landed", "failed", "queued"]))
		expect(seen((p) => (p.ahead > 0 ? "behind" : "first"))).toEqual(new Set(["behind", "first"]))
		expect(seen((p) => p.end ?? "open")).toEqual(new Set(["sent", "rebuild", "ended"]))
	})
})

/** How many seeds `NULO_FEE_RACE_RUNS` asks for: none when unset or empty. */
function runsOf(raw: string | undefined): number {
	if (!raw) return 0
	if (!/^[1-9]\d*$/.test(raw)) throw new Error(`NULO_FEE_RACE_RUNS=${JSON.stringify(raw)} is not a positive integer`)
	return Number(raw)
}

/** The long mode's first seed from `NULO_FEE_RACE_SEED`: a random draw when unset or empty, else a
 *  nonnegative decimal safe integer, so the seed the test's name logs replays that very run. */
function firstSeed(raw: string | undefined): number {
	if (!raw) return Math.floor(Math.random() * 2 ** 31)
	if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
		throw new Error(`NULO_FEE_RACE_SEED=${JSON.stringify(raw)} is not a decimal integer seed`)
	return Number(raw)
}

const RUNS = runsOf(process.env.NULO_FEE_RACE_RUNS)

describe.skipIf(RUNS === 0)("the fee-race catalog in process — long mode", () => {
	const first = firstSeed(process.env.NULO_FEE_RACE_SEED)
	test(
		`${RUNS} seed(s) from ${first}`,
		async () => {
			for (let seed = first; seed < first + RUNS; seed++) {
				const report = await runPlan(plan(seed))
				expect(report.red, `seed ${seed}\n${describeRed(report)}`).toBeUndefined()
			}
		},
		Math.max(1, RUNS) * RUN_MS,
	)
})
