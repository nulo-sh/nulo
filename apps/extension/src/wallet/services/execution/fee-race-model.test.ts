import { describe, expect, test } from "vitest"
import {
	ACTION_NAMES,
	ACTIONS,
	describePlan,
	type ListedStep,
	MAX_OPEN,
	type OpRef,
	plan,
	planFromList,
	type World,
} from "../../../../tests/helpers/fee-race/model"

const OPEN_W: ListedStep = { action: "openWindow", params: { method: "sponsor" } }
const OPEN_S: ListedStep = { action: "openSend", params: { method: "fee_juice", transfer: "private" } }
const press = (target: OpRef, timing: "now" | "first-offer" | "repeat" = "now"): ListedStep => ({
	action: "press",
	params: { target, timing },
})

const worldAfter = (list: ListedStep[]): World => {
	const steps = planFromList(list).steps
	const last = steps.at(-1)
	if (!last) return { ops: [] }
	const next = ACTIONS[last.action].next(last.before, last.params as never)
	return { ...next, lastPress: last.action === "press" ? last.params.target : undefined }
}

describe("the fee-race catalog", () => {
	test("a seed names one plan, and another seed another", () => {
		expect(describePlan(plan(41))).toEqual(describePlan(plan(41)))
		expect(describePlan(plan(41))).not.toEqual(describePlan(plan(42)))
	})

	test("every planned step can run where it was planned, and lists its action's outcomes", () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const planned = plan(seed)
			const replayed = planFromList(planned.steps.map(({ action, params }) => ({ action, params }) as ListedStep))
			expect(describePlan(replayed)).toEqual(describePlan(planned))
			for (const step of planned.steps) expect(step.outcomes).toEqual(ACTIONS[step.action].outcomes)
		}
	})

	test("two hundred seeds draw every action", () => {
		const drawn = new Set(Array.from({ length: 200 }, (_, i) => plan(i).steps.map((s) => s.action)).flat())
		expect(ACTION_NAMES.filter((a) => !drawn.has(a))).toEqual([])
	})

	test("a list refuses its first step that cannot run, by name", () => {
		expect(() => planFromList([press("op1")])).toThrow("step 0 (press) cannot run here: op1 was never opened")
		expect(() => planFromList([OPEN_W, { action: "cancel", params: { target: "op1" } }, press("op1")])).toThrow(
			"step 2 (press) cannot run here: op1 is closed",
		)
		expect(() => planFromList([OPEN_W, press("op1"), OPEN_W, press("op1", "repeat")])).toThrow(
			"step 3 (press) cannot run here: the step before did not press op1",
		)
		expect(() => planFromList([{ action: "landEstimate", params: {} }])).toThrow("no operation opened yet")
	})

	test.each<[string, ListedStep[], ListedStep, string | undefined]>([
		["a surface past the open cap", Array(MAX_OPEN).fill(OPEN_W), OPEN_W, `${MAX_OPEN} surfaces are already open`],
		["a second Send page", [OPEN_S], OPEN_S, "the Send page is already open"],
		["a Send page beside a window", [OPEN_W], OPEN_S, undefined],
		["a repeat before any press", [OPEN_W], press("op1", "repeat"), "the step before did not press op1"],
		["a repeat after a press", [OPEN_W, press("op1")], press("op1", "repeat"), undefined],
		["a later press of a surface pressed before", [OPEN_W, press("op1"), OPEN_S], press("op1"), undefined],
		[
			"a method switch on an app's own payment",
			[{ action: "openWindow", params: { method: "app" } }],
			{ action: "switchMethod", params: { target: "op1", method: "sponsor" } },
			"op1 pays by app, which the person does not pick",
		],
		[
			"a switch to the method already picked",
			[OPEN_S],
			{ action: "switchMethod", params: { target: "op1", method: "fee_juice" } },
			"op1 already pays by fee_juice",
		],
		["a cancel of a pressed send", [OPEN_W, press("op1")], { action: "cancel", params: { target: "op1" } }, undefined],
		[
			"a cancel of a closed window",
			[OPEN_W, { action: "cancel", params: { target: "op1" } }],
			{ action: "cancel", params: { target: "op1" } },
			"op1 is closed",
		],
	])("%s", (_, before, step, why) => {
		expect(ACTIONS[step.action].invalid(worldAfter(before), step.params as never)).toBe(why)
	})

	test("a lock closes every open surface; a window's lifetime closes windows only; a press keeps its surface", () => {
		const w = worldAfter([OPEN_W, OPEN_S, { action: "openWindow", params: { method: "no_from" } }, press("op3")])
		const phases = (x: World) => x.ops.map((o) => o.phase)
		expect(phases(ACTIONS.lock.next(w, {}))).toEqual(["closed", "closed", "pressed"])
		expect(phases(ACTIONS.advanceClock.next(w, { by: "past-window" }))).toEqual(["closed", "open", "pressed"])
		expect(phases(ACTIONS.advanceClock.next(w, { by: "past-reuse" }))).toEqual(["open", "open", "pressed"])
	})
})
