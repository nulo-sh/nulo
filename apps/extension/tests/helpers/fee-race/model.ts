/**
 * The fee-race catalog: what a person can do to a fee estimate, the execution queue and Confirm, as
 * weighted actions over a world computed from a seed alone, before anything runs. A seed names a
 * whole run, and a run replays from it on the same commit.
 *
 * The world is what the person did, not what the wallet holds: whether an estimate runs, queues or
 * waits behind another is the wallet's answer, so an action lists every outcome it may end in and
 * the driver reports the one it met. The oracles judge the wallet (`fee-race-in-process.ts`).
 *
 * Imports nothing from Vitest or the wallet, so any driver can run the same catalog.
 */
import { prng } from "../../e2e/fixtures/chaos-seed"

/** How an operation pays. `app` pays through the app's own fee contract; `no_from` is a
 *  default-entrypoint request, which the app pays and the wallet previews but never estimates. */
export type Method = "sponsor" | "fee_juice" | "private_fpc" | "app" | "no_from"
/** The methods a person picks on a fee card. */
export type PickedMethod = Extract<Method, "sponsor" | "fee_juice" | "private_fpc">
export type Surface = "window" | "send"
/** A Send's transfer: a private one delivers change to its sender, so any two share a sequence. */
export type TransferKind = "public" | "private"
export type OpRef = `op${number}`
export type Timing = "now" | "first-offer" | "repeat"
export type ClockStep = "past-reuse" | "past-window"

export interface ModelOp {
	ref: OpRef
	surface: Surface
	method: Method
	transfer?: TransferKind
	/** `pressed` once pressed: the popup may have refused the press and kept the surface open, so
	 *  it can be pressed again; `closed` once rejected, left, locked or timed out before a press. */
	phase: "open" | "pressed" | "closed"
}

export interface World {
	ops: ModelOp[]
	/** The operation the step before pressed: a repeat presses it again. */
	lastPress?: OpRef
}

export const startWorld = (): World => ({ ops: [] })

/** Surfaces open at once: a dApp's windows and the Send page, below the worker's estimate cap. */
export const MAX_OPEN = 3
/** Operations in one run. */
export const MAX_OPS = 8
export const ACTIONS_PER_RUN = 28

export type ActionParams = {
	openWindow: { method: Method }
	openSend: { method: PickedMethod; transfer: TransferKind }
	landEstimate: Record<string, never>
	failEstimate: Record<string, never>
	askAgain: { target: OpRef }
	press: { target: OpRef; timing: Timing }
	switchMethod: { target: OpRef; method: PickedMethod }
	cancel: { target: OpRef }
	lock: Record<string, never>
	finishProof: Record<string, never>
	mineBlock: Record<string, never>
	advanceClock: { by: ClockStep }
}
export type ActionName = keyof ActionParams

/**
 * Every outcome a step may report:
 * - `estimating` / `queued`: the operation's estimate runs or waits its turn, or the wallet answered
 *   it queued; `granted` a queued estimate that the wallet then ran.
 * - `landed` / `failed` / `idle`: the run the wallet held ended, or none was running.
 * - `submitted` / `refused` / `armed` / `gone`: the press went to the wallet, the popup's rule held
 *   it, a first-offer press waits for Confirm, or the surface had already left.
 * - `closed` / `cancelled` / `too-late`: a surface left before its press; a pressed send ended by
 *   its cancel, or already past the point a cancel can stop.
 * - `released` / `mined` / `locked` / `advanced`.
 */
export type Outcome =
	| "estimating"
	| "queued"
	| "granted"
	| "landed"
	| "failed"
	| "idle"
	| "submitted"
	| "refused"
	| "armed"
	| "gone"
	| "closed"
	| "cancelled"
	| "too-late"
	| "released"
	| "mined"
	| "locked"
	| "advanced"

type Rng = () => number

export interface ActionSpec<N extends ActionName> {
	name: N
	/** Relative draw weight; opening is drawn more while nothing is open. */
	weight: number | ((w: World) => number)
	/** Why the action cannot run in `w`, or undefined when it can. */
	invalid(w: World, p: ActionParams[N]): string | undefined
	params(rng: Rng, w: World): ActionParams[N]
	outcomes: readonly Outcome[]
	next(w: World, p: ActionParams[N]): World
}

const PICKED: readonly PickedMethod[] = ["sponsor", "fee_juice", "private_fpc"]
const METHODS: readonly Method[] = [...PICKED, "app", "no_from"]

const open = (w: World) => w.ops.filter((o) => o.phase === "open")
const opOf = (w: World, ref: OpRef) => w.ops.find((o) => o.ref === ref)
const choose = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]
const nextRef = (w: World): OpRef => `op${w.ops.length + 1}`
const withOp = (w: World, ref: OpRef, edit: Partial<ModelOp>): World => ({
	...w,
	ops: w.ops.map((o) => (o.ref === ref ? { ...o, ...edit } : o)),
})
const opening = (base: number) => (w: World) => (open(w).length === 0 ? base * 3 : base)
const unchanged = (w: World) => w
const none = () => ({}) as Record<string, never>
const anyOp = (w: World) => (w.ops.length === 0 ? "no operation opened yet" : undefined)
/** The person picks the method on these; an app's own payment and a default entrypoint have none. */
const switchable = (o: ModelOp) => o.phase === "open" && (o.method === "sponsor" || o.method === "fee_juice" || o.method === "private_fpc")

const roomToOpen = (w: World): string | undefined => {
	if (w.ops.length >= MAX_OPS) return `the run already opened ${MAX_OPS} operations`
	if (open(w).length >= MAX_OPEN) return `${MAX_OPEN} surfaces are already open`
	return undefined
}

const targetIs =
	(phases: readonly ModelOp["phase"][], extra?: (o: ModelOp) => string | undefined) =>
	(w: World, p: { target: OpRef }): string | undefined => {
		const op = opOf(w, p.target)
		if (!op) return `${p.target} was never opened`
		if (!phases.includes(op.phase)) return `${p.target} is ${op.phase}`
		return extra?.(op)
	}

export const ACTIONS: { [N in ActionName]: ActionSpec<N> } = {
	openWindow: {
		name: "openWindow",
		weight: opening(3),
		invalid: roomToOpen,
		params: (rng) => ({ method: choose(rng, METHODS) }),
		outcomes: ["estimating", "queued", "failed"],
		next: (w, p) => ({ ...w, ops: [...w.ops, { ref: nextRef(w), surface: "window", method: p.method, phase: "open" }] }),
	},
	openSend: {
		name: "openSend",
		weight: opening(2),
		invalid: (w) => roomToOpen(w) ?? (open(w).some((o) => o.surface === "send") ? "the Send page is already open" : undefined),
		params: (rng) => ({ method: choose(rng, PICKED), transfer: rng() < 0.5 ? "public" : "private" }),
		outcomes: ["estimating", "queued", "failed"],
		next: (w, p) => ({
			...w,
			ops: [...w.ops, { ref: nextRef(w), surface: "send", method: p.method, transfer: p.transfer, phase: "open" }],
		}),
	},
	landEstimate: { name: "landEstimate", weight: 4, invalid: anyOp, params: none, outcomes: ["landed", "idle"], next: unchanged },
	failEstimate: { name: "failEstimate", weight: 1, invalid: anyOp, params: none, outcomes: ["failed", "idle"], next: unchanged },
	askAgain: {
		name: "askAgain",
		weight: 1,
		invalid: (w, p) => targetIs(["open"])(w, p),
		params: (rng, w) => ({ target: choose(rng, open(w)).ref }),
		outcomes: ["queued", "granted", "estimating", "landed", "failed"],
		next: unchanged,
	},
	press: {
		name: "press",
		weight: 4,
		invalid: (w, p) => {
			if (p.timing !== "repeat") return targetIs(["open", "pressed"])(w, p)
			return w.lastPress === p.target ? undefined : `the step before did not press ${p.target}`
		},
		params: (rng, w) => {
			const roll = rng()
			if (w.lastPress && roll < 0.3) return { target: w.lastPress, timing: "repeat" }
			const pressable = w.ops.filter((o) => o.phase !== "closed")
			return {
				target: choose(rng, open(w).length > 0 && roll < 0.8 ? open(w) : pressable).ref,
				timing: roll < 0.65 ? "now" : "first-offer",
			}
		},
		outcomes: ["submitted", "refused", "armed", "gone"],
		next: (w, p) => withOp(w, p.target, { phase: "pressed" }),
	},
	switchMethod: {
		name: "switchMethod",
		weight: 1,
		invalid: (w, p) =>
			targetIs(["open"], (o) => {
				if (!switchable(o)) return `${o.ref} pays by ${o.method}, which the person does not pick`
				return o.method === p.method ? `${o.ref} already pays by ${p.method}` : undefined
			})(w, p),
		params: (rng, w) => {
			const target = choose(rng, w.ops.filter(switchable))
			return {
				target: target.ref,
				method: choose(
					rng,
					PICKED.filter((m) => m !== target.method),
				),
			}
		},
		outcomes: ["estimating", "queued", "failed"],
		next: (w, p) => withOp(w, p.target, { method: p.method }),
	},
	cancel: {
		name: "cancel",
		weight: 1,
		invalid: (w, p) => targetIs(["open", "pressed"])(w, p),
		params: (rng, w) => ({
			target: choose(
				rng,
				w.ops.filter((o) => o.phase !== "closed"),
			).ref,
		}),
		outcomes: ["closed", "cancelled", "too-late", "gone"],
		next: (w, p) => (opOf(w, p.target)?.phase === "open" ? withOp(w, p.target, { phase: "closed" }) : w),
	},
	lock: {
		name: "lock",
		weight: 0.5,
		invalid: anyOp,
		params: none,
		outcomes: ["locked"],
		next: (w) => ({ ...w, ops: w.ops.map((o) => (o.phase === "open" ? { ...o, phase: "closed" } : o)) }),
	},
	finishProof: { name: "finishProof", weight: 3, invalid: anyOp, params: none, outcomes: ["released", "idle"], next: unchanged },
	mineBlock: { name: "mineBlock", weight: 2, invalid: anyOp, params: none, outcomes: ["mined", "idle"], next: unchanged },
	advanceClock: {
		name: "advanceClock",
		weight: 0.5,
		invalid: anyOp,
		params: (rng) => ({ by: rng() < 0.7 ? "past-reuse" : "past-window" }),
		outcomes: ["advanced"],
		// A window left open past its interaction's lifetime times out; the Send page has none.
		next: (w, p) =>
			p.by === "past-window"
				? { ...w, ops: w.ops.map((o) => (o.phase === "open" && o.surface === "window" ? { ...o, phase: "closed" } : o)) }
				: w,
	},
}

export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[]

/** Actions whose params name an operation, which `params` can only draw while one qualifies. */
const DRAWABLE: { [N in ActionName]?: (w: World) => boolean } = {
	askAgain: (w) => open(w).length > 0,
	press: (w) => w.ops.some((o) => o.phase !== "closed"),
	switchMethod: (w) => w.ops.some(switchable),
	cancel: (w) => w.ops.some((o) => o.phase !== "closed"),
}

export type ListedStep = { [N in ActionName]: { action: N; params: ActionParams[N] } }[ActionName]
export type PlannedStep = ListedStep & { index: number; outcomes: readonly Outcome[]; before: World }
export interface Plan {
	seed: number
	steps: PlannedStep[]
}

function stepOf(index: number, listed: ListedStep, w: World): { step: PlannedStep; next: World } {
	const spec = ACTIONS[listed.action] as ActionSpec<ActionName>
	const next = spec.next(w, listed.params as never)
	return {
		step: { ...listed, index, outcomes: spec.outcomes, before: w } as PlannedStep,
		next: { ...next, lastPress: listed.action === "press" ? listed.params.target : undefined },
	}
}

function draw(rng: Rng, w: World): ListedStep | undefined {
	const candidates = ACTION_NAMES.filter((name) => DRAWABLE[name]?.(w) ?? !ACTIONS[name].invalid(w, {} as never))
	const weightOf = (name: ActionName) => {
		const weight = ACTIONS[name].weight
		return typeof weight === "number" ? weight : weight(w)
	}
	const total = candidates.reduce((sum, name) => sum + weightOf(name), 0)
	let roll = rng() * total
	for (const name of candidates) {
		roll -= weightOf(name)
		if (roll > 0) continue
		const params = ACTIONS[name].params(rng, w)
		const listed = { action: name, params } as ListedStep
		return ACTIONS[name].invalid(w, params as never) ? undefined : listed
	}
	return undefined
}

/** `length` steps drawn from `seed`; a draw whose params cannot run is drawn again. */
export function plan(seed: number, length = ACTIONS_PER_RUN): Plan {
	const rng = prng(seed)
	let w = startWorld()
	const steps: PlannedStep[] = []
	for (let attempts = 0; steps.length < length; attempts++) {
		if (attempts > length * 50) throw new Error(`seed ${seed}: no action can run at step ${steps.length}`)
		const listed = draw(rng, w)
		if (!listed) continue
		const { step, next } = stepOf(steps.length, listed, w)
		steps.push(step)
		w = next
	}
	return { seed, steps }
}

/** A hand-written list as a plan; the first step that cannot run where the steps before it leave
 *  the world is refused by name. */
export function planFromList(list: readonly ListedStep[], seed = Number.NaN): Plan {
	let w = startWorld()
	const steps = list.map((listed, index) => {
		const spec = ACTIONS[listed.action] as ActionSpec<ActionName> | undefined
		if (!spec) throw new Error(`step ${index}: unknown action ${String(listed.action)}`)
		const why = spec.invalid(w, listed.params as never)
		if (why) throw new Error(`step ${index} (${listed.action}) cannot run here: ${why}`)
		const { step, next } = stepOf(index, listed, w)
		w = next
		return step
	})
	return { seed, steps }
}

export function describePlan(p: Plan): string[] {
	return p.steps.map((s) => `${s.index} ${s.action} ${JSON.stringify(s.params)}`)
}
