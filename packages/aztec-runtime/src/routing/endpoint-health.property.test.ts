/**
 * The health machine under random event sequences, as the routed node emits them: every call's
 * answer, probe and hand-off in any order and at any spacing, since calls run concurrently and one
 * can answer after its endpoint changed state. After every event the route is checked against a
 * small model of the routing contract: when an endpoint goes down, what a 429 or a refusal may
 * change, when the role may move and return, how the hold-down grows and resets, that another
 * chain never serves, and where the floor may go. `endpoint-health.test.ts` pins the worked examples.
 *
 * The sequences are generated, not fuzzed: seed `s` always replays the same events, and a failure
 * names its seed, step and the events before it. The coverage floor fails the file when a change to
 * the generator stops reaching a transition the invariants guard.
 */
import { describe, expect, test } from "vitest"
import type { TransportFailure } from "../utils/fetch"
import { type ProbeAnswer, ROUTE_TIMING, RouteHealth } from "./endpoint-health"

const { callTimeoutMs, probeTimeoutMs, holdDownMinMs, holdDownMaxMs, holdResetMs, downAfterFailures } = ROUTE_TIMING

const SEEDS = 400
const STEPS = 250
const FAILURES: readonly TransportFailure[] = ["unreachable", "timeout", "server", "malformed", "overloaded", "refused"]
const STEP_MS = [0, 1, 1_000, 5_000, 30_000, 60_000, 20 * 60_000, 30 * 60_000] as const

/** mulberry32: a logged seed replays the same sequence. */
function prng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

type Event =
	/** A routed call answered: a tip read serves its proposed tip first. */
	| { kind: "answered"; index: number; tip?: number }
	/** The send pick's anchor batch: the endpoint's identity matched before it answered. */
	| { kind: "identity-answered"; index: number }
	| { kind: "failed"; index: number; failure: TransportFailure; cause: number; attemptMs: number }
	| { kind: "probe"; index: number; answer: "same" | "other" | "silent" | TransportFailure; tip: number; cause: number }
	| { kind: "pass-role"; from: number; to: number }
	| { kind: "seed"; proposed: number }
	| { kind: "defer"; index: number }
	| { kind: "tick" }

type Timed = Event & { at: number }

const counting = (failure: TransportFailure) => failure !== "overloaded" && failure !== "refused"

interface Model {
	/** Counted causes per endpoint, ever: one batch's shared error counts once. */
	counted: Set<number>[]
	/** Counting failures since the endpoint last answered a call or a same-chain probe. */
	streak: number[]
	/** Its latest identity answer was another chain. */
	otherChain: boolean[]
	/** When each passing probe of the current uninterrupted run landed. */
	run: number[][]
	/** When it last took the role. */
	heldSince: (number | undefined)[]
	/** Role losses since its hold-down last reset. */
	falls: number[]
	/** A re-fall that doubles once another endpoint serves in its place. */
	pendingFall: boolean[]
}

interface Snapshot {
	active: number | undefined
	floor: number
	states: string[]
	holdDowns: number[]
	nextProbeAt: number[]
	qualifies: boolean[]
}

function snap(health: RouteHealth, n: number): Snapshot {
	const all = Array.from({ length: n }, (_, i) => i)
	return {
		active: health.active(),
		floor: health.floor(),
		states: all.map((i) => health.state(i)),
		holdDowns: all.map((i) => health.holdDownMs(i)),
		nextProbeAt: all.map((i) => health.nextProbeAt(i)),
		qualifies: all.map((i) => health.qualifies(i)),
	}
}

type Pick = <T>(xs: readonly T[]) => T

/** A routed call's outcome: `roll` below 0.5. */
function drawCall(next: () => number, pick: Pick, roll: number, n: number, at: { index: number; tip: number; cause: number }): Event {
	const { index, tip, cause } = at
	if (roll < 0.22) return { kind: "answered", index, tip: next() < 0.5 ? tip : undefined }
	// The router never probes a lone endpoint, nor asks it for the send's anchor.
	if (roll < 0.26 && n > 1) return { kind: "identity-answered", index }
	return { kind: "failed", index, failure: pick(FAILURES), cause, attemptMs: next() < 0.7 ? callTimeoutMs : probeTimeoutMs }
}

/** A probe, a hand-off or a clock event: `roll` from 0.5. */
function drawRoute(
	next: () => number,
	pick: Pick,
	roll: number,
	ctx: { n: number; height: number; health: RouteHealth },
	at: { index: number; tip: number; cause: number },
): Event {
	const { n, height, health } = ctx
	const { index, tip, cause } = at
	if (roll < 0.76 && n > 1) {
		const answer = pick(["same", "same", "same", "same", "same", "other", "silent", ...FAILURES] as const)
		return { kind: "probe", index, answer, tip, cause }
	}
	// The router hands a failed sync read's role to another endpoint, never back to the one that failed.
	if (roll < 0.81 && n > 1) return { kind: "pass-role", from: index, to: (index + 1 + Math.floor(next() * (n - 1))) % n }
	if (roll < 0.86) return { kind: "seed", proposed: Math.max(0, height - pick([0, 1, 2, 3])) }
	const down = Array.from({ length: n }, (_, i) => i).filter((i) => health.state(i) === "down")
	if (roll < 0.9 && down.length > 0) return { kind: "defer", index: pick(down) }
	return { kind: "tick" }
}

function draw(next: () => number, n: number, height: number, health: RouteHealth, causes: number[]): Event {
	const pick: Pick = (xs) => xs[Math.floor(next() * xs.length)] as (typeof xs)[number]
	const index = Math.floor(next() * n)
	const tip = Math.max(0, height - pick([0, 0, 0, 1, 2]))
	// A recent cause again is another caller of the same failed batch.
	const cause = next() < 0.3 && causes[index] !== undefined ? (causes[index] as number) : Math.floor(next() * 1e9)
	const roll = next()
	const at = { index, tip, cause }
	return roll < 0.5 ? drawCall(next, pick, roll, n, at) : drawRoute(next, pick, roll, { n, height, health }, at)
}

function apply(health: RouteHealth, event: Timed): void {
	const now = event.at
	switch (event.kind) {
		case "answered":
			if (event.tip !== undefined) health.servedTip(event.index, event.tip, now)
			health.succeeded(event.index, now)
			return
		case "identity-answered":
			health.succeeded(event.index, now)
			return
		case "failed":
			health.failed(event.index, event.failure, causeObject(event.index, event.cause), now, event.attemptMs)
			return
		case "probe":
			health.probed(event.index, probeAnswer(event), now)
			return
		case "pass-role":
			health.passRole(event.from, event.to, now)
			return
		case "seed":
			health.seedFloor(event.proposed, now)
			return
		case "defer":
			health.deferProbe(event.index, now)
			return
		case "tick":
			health.tick(now)
	}
}

/** One object per (endpoint, cause id), as one failed batch hands its callers one error object. */
const causeObjects = new Map<string, object>()
function causeObject(index: number, id: number): object {
	const key = `${index}:${id}`
	let cause = causeObjects.get(key)
	if (!cause) {
		cause = { id }
		causeObjects.set(key, cause)
	}
	return cause
}

function probeAnswer(event: Extract<Event, { kind: "probe" }>): ProbeAnswer {
	if (event.answer === "same") return { answered: true, sameChain: true, tip: event.tip }
	if (event.answer === "other") return { answered: true, sameChain: false, tip: event.tip }
	if (event.answer === "silent") return { answered: false, failure: undefined, cause: causeObject(event.index, event.cause) }
	return { answered: false, failure: event.answer, cause: causeObject(event.index, event.cause) }
}

/** The failure an event counts toward `down`, with the attempt it aborted. */
function countedFailure(event: Timed): { index: number; failure: TransportFailure; cause: number; attemptMs: number } | undefined {
	if (event.kind === "failed") return event
	if (event.kind === "probe" && event.answer !== "same" && event.answer !== "other" && event.answer !== "silent") {
		return { index: event.index, failure: event.answer, cause: event.cause, attemptMs: probeTimeoutMs }
	}
	return undefined
}

/** One event and the route around it, as each invariant reads them. */
interface Step {
	n: number
	all: number[]
	before: Snapshot
	after: Snapshot
	event: Timed
	model: Model
	health: RouteHealth
}

const servedBy = (event: Timed): number | undefined =>
	event.kind === "answered" || event.kind === "identity-answered" ? event.index : undefined

/** Down after three counting failures in a row or one full call attempt timing out, never otherwise. */
function downRule({ all, before, after, event, model }: Step): string[] {
	const fail = countedFailure(event)
	return all.flatMap((i) => {
		const wentDown = before.states[i] !== "down" && after.states[i] === "down"
		const fresh = fail?.index === i && counting(fail.failure) && !model.counted[i]?.has(fail.cause)
		const fullTimeout = fresh && fail?.failure === "timeout" && fail.attemptMs >= callTimeoutMs
		const due = fresh && ((model.streak[i] ?? 0) + 1 >= downAfterFailures || fullTimeout)
		if (wentDown && !due) return [`endpoint ${i} went down without three counting failures or a full timeout`]
		if (due && before.states[i] !== "down" && !wentDown)
			return [`endpoint ${i} stayed ${after.states[i]} past its third counting failure or a full timeout`]
		return []
	})
}

/** A 429 or a refusal moves one call: it changes no state, role, floor or hold-down. */
function refusalRule({ before, after, event }: Step): string[] {
	if (event.kind === "failed" && !counting(event.failure) && JSON.stringify(before) !== JSON.stringify(after)) {
		return [`a ${event.failure} changed the route`]
	}
	if (event.kind !== "probe" || (event.answer !== "overloaded" && event.answer !== "refused")) return []
	const problems: string[] = []
	if (after.states[event.index] !== before.states[event.index])
		problems.push(`a probe's ${event.answer} changed endpoint ${event.index}'s state`)
	if (after.active !== before.active || after.floor !== before.floor)
		problems.push(`a probe's ${event.answer} moved the role or the floor`)
	return problems
}

/** The role returns to a more preferred endpoint only on its own passing probe, the second of a run
 *  a hold-down apart, and otherwise leaves a holder that still qualifies only by a sync read's hand-off. */
function roleMoveRule({ before, after, event, model }: Step): string[] {
	if (isReturn(before, after, event)) {
		const back = after.active as number
		const first = model.run[back]?.[0]
		if (event.kind !== "probe" || event.answer !== "same" || event.tip < before.floor) {
			return [`endpoint ${back} took the role back on a probe that did not pass`]
		}
		if (first === undefined || event.at - first < (after.holdDowns[back] as number)) {
			return [`endpoint ${back} took the role back without two passing probes a hold-down apart`]
		}
		return []
	}
	const left = before.active !== undefined && after.active !== before.active && after.qualifies[before.active]
	return left && event.kind !== "pass-role" ? [`the role left qualifying endpoint ${before.active} on a ${event.kind}`] : []
}

/** One endpoint's hold-down: in range, reset only after 30 min held, doubled only on a re-fall
 *  another endpoint served through. */
function holdDownChange({ before, after, event, model }: Step, i: number): string | undefined {
	const was = before.holdDowns[i] as number
	const is = after.holdDowns[i] as number
	if (is < holdDownMinMs || is > holdDownMaxMs) return `endpoint ${i}'s hold-down ${is} is out of range`
	if (is === was) return undefined
	if (is === holdDownMinMs) {
		const held = model.heldSince[i]
		const earned = event.kind === "tick" && before.active === i && held !== undefined && event.at - held >= holdResetMs
		return earned ? undefined : `endpoint ${i}'s hold-down reset on a ${event.kind} without 30 min held`
	}
	if (is !== Math.min(was * 2, holdDownMaxMs)) return `endpoint ${i}'s hold-down went ${was} → ${is}`
	const other = servedBy(event)
	const servedThrough = other !== undefined && other !== i && after.active === other
	return servedThrough && model.pendingFall[i]
		? undefined
		: `endpoint ${i}'s hold-down doubled on a ${event.kind} with no re-fall served through`
}

function holdDownRule(step: Step): string[] {
	const { all, before, after, event, model } = step
	const changes = all.flatMap((i) => holdDownChange(step, i) ?? [])
	const other = servedBy(event)
	const missed = all.filter(
		(i) =>
			other !== undefined &&
			other !== i &&
			after.active === other &&
			model.pendingFall[i] &&
			before.holdDowns[i] !== holdDownMaxMs &&
			after.holdDowns[i] === before.holdDowns[i],
	)
	return [...changes, ...missed.map((i) => `endpoint ${i}'s hold-down did not double on a re-fall another endpoint served through`)]
}

/** Another chain never qualifies and never holds the role until a same-chain answer. Its label is
 *  not checked: a transport failure can take it down and a later answer label it ready again,
 *  which serves nothing, since only qualifying moves a call. */
function otherChainRule({ n, all, after, event, model }: Step): string[] {
	if (n === 1) return []
	return all
		.filter((i) => otherChainAfter(model, event, i))
		.flatMap((i) => [
			...(after.qualifies[i] ? [`endpoint ${i} on another chain qualifies`] : []),
			...(after.active === i ? [`endpoint ${i} on another chain holds the role`] : []),
		])
}

/** The floor falls only through the active endpoint's own served tip; a probe that hands no role
 *  never moves it. */
function floorRule({ before, after, event }: Step): string[] {
	const problems: string[] = []
	if (event.kind === "answered" && event.tip !== undefined && before.active === event.index) {
		if (after.floor !== event.tip) problems.push(`the active endpoint served ${event.tip} but the floor reads ${after.floor}`)
	} else if (after.floor < before.floor) {
		problems.push(`the floor fell ${before.floor} → ${after.floor} on a ${event.kind}`)
	}
	const quietProbe = event.kind === "probe" && event.index !== before.active && after.active !== event.index
	if (quietProbe && after.floor !== before.floor) problems.push(`a probe of endpoint ${event.index}, which took no role, moved the floor`)
	return problems
}

/** A lone endpoint always holds the role and is never probed; otherwise the holder qualifies, and
 *  with none, nothing does. */
function holderRule({ n, after, event, health }: Step): string[] {
	if (n === 1) {
		const kept = after.active === 0 && !health.needsProbe(0) && !health.mayProbe(0, event.at)
		return kept ? [] : ["a lone endpoint lost the role or was probed"]
	}
	if (after.active !== undefined) {
		return after.qualifies[after.active] ? [] : [`holder ${after.active} does not qualify (${after.states[after.active]})`]
	}
	return after.qualifies.some(Boolean) ? ["no endpoint holds the role while one qualifies"] : []
}

const RULES = [downRule, refusalRule, roleMoveRule, holdDownRule, otherChainRule, floorRule, holderRule]

/** A probe handing the role from its holder to that more preferred endpoint: a return. */
function isReturn(before: Snapshot, after: Snapshot, event: Timed): boolean {
	return event.kind === "probe" && before.active !== undefined && after.active === event.index && event.index < before.active
}

/** Whether `i`'s latest identity answer, this event's included, was another chain. */
function otherChainAfter(model: Model, event: Timed, i: number): boolean {
	if (event.kind === "identity-answered" && event.index === i) return false
	if (event.kind === "probe" && event.index === i && (event.answer === "same" || event.answer === "other"))
		return event.answer === "other"
	return model.otherChain[i] ?? false
}

function noteAnswers(model: Model, before: Snapshot, event: Timed): void {
	const fail = countedFailure(event)
	if (fail && counting(fail.failure) && !model.counted[fail.index]?.has(fail.cause)) {
		model.counted[fail.index]?.add(fail.cause)
		model.streak[fail.index] = (model.streak[fail.index] ?? 0) + 1
	}
	const served = servedBy(event)
	if (served !== undefined) model.streak[served] = 0
	if (event.kind === "identity-answered") model.otherChain[event.index] = false
	if (event.kind !== "probe") return
	const i = event.index
	if (event.answer === "same") model.streak[i] = 0
	if (event.answer === "same" || event.answer === "other") model.otherChain[i] = event.answer === "other"
	const passing = event.answer === "same" && event.tip >= before.floor
	model.run[i] = passing ? [...(model.run[i] ?? []), event.at] : []
}

function noteHoldDowns({ n, before, after, event, model }: Step): void {
	for (let i = 0; i < n; i++) {
		const [was, is] = [before.holdDowns[i] ?? 0, after.holdDowns[i] ?? 0]
		const held = model.heldSince[i]
		if (is === holdDownMinMs && was > holdDownMinMs) model.falls[i] = 0
		const earnedReset = event.kind === "tick" && before.active === i && is === holdDownMinMs && held !== undefined
		if (earnedReset && event.at - held >= holdResetMs) {
			model.falls[i] = 0
			model.pendingFall[i] = false
		}
		if (is > was) model.pendingFall[i] = false
	}
}

function noteRole({ before, after, event, model }: Step): void {
	if (before.active === after.active) return
	const lost = before.active
	// Giving the role back to a more preferred endpoint that returned is no fall.
	if (lost !== undefined && !isReturn(before, after, event)) {
		model.falls[lost] = (model.falls[lost] ?? 0) + 1
		model.pendingFall[lost] = (model.falls[lost] ?? 0) >= 2
	}
	if (lost !== undefined) model.run[lost] = []
	if (after.active === undefined) {
		model.pendingFall = model.pendingFall.map(() => false)
		return
	}
	model.heldSince[after.active] = event.at
	model.pendingFall[after.active] = false
	model.run[after.active] = []
}

/** About a third of what the generator reaches across every seed: a floor, not a target. */
const MIN_COVERAGE = {
	down: 1_000,
	recovered: 1_000,
	behind: 600,
	"wrong-chain": 350,
	returned: 50,
	doubled: 40,
	reset: 25,
	"floor fell": 500,
} as const
type Coverage = Record<keyof typeof MIN_COVERAGE, number>
const COVERED = Object.keys(MIN_COVERAGE) as (keyof Coverage)[]

const entered = (before: Snapshot, after: Snapshot, i: number, state: string): boolean =>
	before.states[i] !== state && after.states[i] === state

/** Which counted transitions endpoint `i` made on this event. */
function transitions(before: Snapshot, after: Snapshot, i: number): (keyof Coverage)[] {
	const change = Math.sign((after.holdDowns[i] as number) - (before.holdDowns[i] as number))
	const made: [keyof Coverage, boolean][] = [
		["down", entered(before, after, i, "down")],
		["recovered", before.states[i] === "down" && after.states[i] !== "down"],
		["behind", entered(before, after, i, "behind")],
		["wrong-chain", entered(before, after, i, "wrong-chain")],
		["doubled", change > 0],
		["reset", change < 0],
	]
	return made.filter(([, hit]) => hit).map(([key]) => key)
}

/** The transitions an event made, counted across every seed. */
function cover(coverage: Coverage, { all, before, after, event }: Step): void {
	for (const key of all.flatMap((i) => transitions(before, after, i))) coverage[key]++
	if (isReturn(before, after, event)) coverage.returned++
	if (after.floor < before.floor) coverage["floor fell"]++
}

function freshModel(n: number, now: number): Model {
	return {
		counted: Array.from({ length: n }, () => new Set()),
		streak: Array(n).fill(0),
		otherChain: Array(n).fill(false),
		run: Array.from({ length: n }, () => []),
		heldSince: Array.from({ length: n }, (_, i) => (n === 1 && i === 0 ? now : undefined)),
		falls: Array(n).fill(0),
		pendingFall: Array(n).fill(false),
	}
}

function runSeed(seed: number, coverage: Coverage): string | undefined {
	const next = prng(seed)
	const n = 1 + (seed % 3)
	let now = Math.floor(next() * 1e6)
	let height = 10
	const health = new RouteHealth(n, now, () => {})
	const model = freshModel(n, now)
	if (snap(health, n).holdDowns.some((h) => h !== holdDownMinMs)) return `seed ${seed}: a hold-down does not start at 30 s`
	const all = Array.from({ length: n }, (_, i) => i)
	const trail: Timed[] = []
	const causes: number[] = []
	for (let step = 0; step < STEPS; step++) {
		now += STEP_MS[Math.floor(next() * STEP_MS.length)] as number
		const r = next()
		if (r < 0.2) height++
		else if (r < 0.23) height = Math.max(1, height - 1 - Math.floor(next() * 2))
		const event: Timed = { ...draw(next, n, height, health, causes), at: now }
		if ("cause" in event) causes[event.index] = event.cause
		trail.push(event)
		const before = snap(health, n)
		apply(health, event)
		const checked: Step = { n, all, before, after: snap(health, n), event, model, health }
		const problems = RULES.flatMap((rule) => rule(checked))
		if (problems.length > 0) {
			const recent = trail.slice(-12).map((e) => JSON.stringify(e))
			return `seed ${seed} (${n} endpoints), step ${step}: ${problems.join("; ")}\n  ${recent.join("\n  ")}`
		}
		cover(coverage, checked)
		noteAnswers(model, before, event)
		noteHoldDowns(checked)
		noteRole(checked)
	}
	return undefined
}

describe("the health machine under random event sequences", () => {
	test(`${SEEDS} seeded sequences of ${STEPS} events keep every invariant`, () => {
		const failures: string[] = []
		const coverage = Object.fromEntries(COVERED.map((k) => [k, 0])) as Coverage
		for (let seed = 1; seed <= SEEDS; seed++) {
			const failure = runSeed(seed, coverage)
			if (failure) failures.push(failure)
		}
		expect(failures.slice(0, 5)).toEqual([])
		for (const key of COVERED) expect(coverage[key], `${key} transitions reached`).toBeGreaterThanOrEqual(MIN_COVERAGE[key])
	})
})
