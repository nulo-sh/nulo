/**
 * The health of a network's endpoints and which one holds the active role, as a deterministic
 * state machine: no I/O, time passed in. The routed node feeds it every answer and acts on it.
 *
 * Per endpoint: `unknown` (not yet admitted) → `ready` ↔ `down`, plus `behind` (last seen below
 * the floor) and `wrong-chain`. A lone endpoint is admitted by the caller's own checks, holds the
 * role whatever its state and is never probed.
 */

import type { TransportFailure } from "../utils/fetch"

/** Every timing and threshold the router uses. */
export const ROUTE_TIMING = {
	/** One call attempt, as the node fetch's own per-request abort. */
	callTimeoutMs: 60_000,
	/** One probe or send-pick batch. */
	probeTimeoutMs: 5_000,
	/** The sleeps between a call's rounds; one more round than sleeps. */
	backoffMs: [1_000, 2_000, 3_000],
	downAfterFailures: 3,
	/** The least time between two on-demand probes of one endpoint. */
	probeSpacingMs: 5_000,
	holdDownMinMs: 30_000,
	holdDownMaxMs: 30 * 60_000,
	/** Holding the role this long resets an endpoint's hold-down. */
	holdResetMs: 30 * 60_000,
	wrongChainRetryMs: 30 * 60_000,
} as const

export type EndpointState = "unknown" | "ready" | "down" | "behind" | "wrong-chain"

/** The health a pinned endpoint keeps once the route no longer lists it: plain data, so it can
 *  outlive the routed node that made it. */
export interface EndpointHealth {
	state: EndpointState
	since: number
	failures: number
	/** The fetch errors already counted: the callers of one failed batch share one, which counts once. */
	readonly counted: WeakSet<object>
	nextProbeAt: number
	holdDownMs: number
}

export function newEndpointHealth(state: EndpointState, now: number): EndpointHealth {
	return { state, since: now, failures: 0, counted: new WeakSet(), nextProbeAt: 0, holdDownMs: ROUTE_TIMING.holdDownMinMs }
}

/** Whether a failure of this kind is the endpoint's transport failing, which counts toward `down`;
 *  a 429 or a gateway refusal moves one call and leaves the endpoint serving the rest. */
export function countsTowardDown(failure: TransportFailure): boolean {
	return failure !== "overloaded" && failure !== "refused"
}

/**
 * Counts one failure; returns whether it took the endpoint down. `cause` is the fetch's error object;
 * `attemptMs` the abort of the attempt that failed: only a full call attempt timing out takes the
 * endpoint down at once, since a probe's or a caller's shorter budget says nothing of a 60 s read.
 */
export function recordFailure(
	health: EndpointHealth,
	failure: TransportFailure,
	cause: object,
	now: number,
	attemptMs: number = ROUTE_TIMING.callTimeoutMs,
): boolean {
	if (!countsTowardDown(failure) || health.counted.has(cause)) return false
	health.counted.add(cause)
	health.failures++
	if (health.state === "down") return false
	const atOnce = failure === "timeout" && attemptMs >= ROUTE_TIMING.callTimeoutMs
	if (!atOnce && health.failures < ROUTE_TIMING.downAfterFailures) return false
	setState(health, "down", now)
	health.nextProbeAt = now + health.holdDownMs
	return true
}

/** Returns whether the success brought a down endpoint back. */
export function recordSuccess(health: EndpointHealth, now: number): boolean {
	health.failures = 0
	if (health.state !== "down") return false
	setState(health, "ready", now)
	return true
}

function setState(health: EndpointHealth, state: EndpointState, now: number): boolean {
	if (health.state === state) return false
	health.state = state
	health.since = now
	return true
}

interface RouteEndpointHealth extends EndpointHealth {
	admitted: boolean
	/** The last proposed block number this endpoint was seen at. */
	tip: number | undefined
	lastProbeAt: number | undefined
	/** When the first of the two passing probes a return needs passed. */
	returnPassAt: number | undefined
	/** Lost the role since its hold-down last reset: its next fall doubles the hold-down. */
	hasFallen: boolean
	/** Lost the role after a return; doubles once another endpoint serves in its place. */
	fellAfterReturn: boolean
	heldSince: number | undefined
	/** Its latest call or probe failed in transport, a 429 or a refusal included. */
	unanswered: boolean
}

export type ProbeAnswer =
	| { readonly answered: true; readonly sameChain: boolean; readonly tip: number }
	| { readonly answered: false; readonly failure: TransportFailure | undefined; readonly cause: object }

export type HealthChange =
	| { readonly kind: "state"; readonly index: number; readonly state: EndpointState; readonly failure?: TransportFailure }
	| { readonly kind: "active"; readonly index: number | undefined }

export class RouteHealth {
	public readonly lone: boolean
	private readonly endpoints: RouteEndpointHealth[]
	private activeIndex: number | undefined
	private floorValue = 0

	public constructor(
		count: number,
		now: number,
		private readonly onChange: (change: HealthChange) => void = () => {},
	) {
		if (count < 1) throw new Error("A route needs at least one endpoint")
		this.lone = count === 1
		this.endpoints = Array.from({ length: count }, () => ({
			...newEndpointHealth(this.lone ? "ready" : "unknown", now),
			admitted: this.lone,
			tip: undefined,
			lastProbeAt: undefined,
			returnPassAt: undefined,
			hasFallen: false,
			fellAfterReturn: false,
			heldSince: undefined,
			unanswered: false,
		}))
		if (this.lone) this.activeIndex = 0
	}

	public active(): number | undefined {
		return this.activeIndex
	}

	/** The proposed block number no moved call or change of active endpoint may go below. */
	public floor(): number {
		return this.floorValue
	}

	public state(index: number): EndpointState {
		return this.at(index).state
	}

	public since(index: number): number {
		return this.at(index).since
	}

	public nextProbeAt(index: number): number {
		return this.at(index).nextProbeAt
	}

	public holdDownMs(index: number): number {
		return this.at(index).holdDownMs
	}

	/** Its latest call or probe answered. */
	public answeredLast(index: number): boolean {
		return !this.at(index).unanswered
	}

	public isAdmitted(index: number): boolean {
		return this.at(index).admitted
	}

	/** Seen at or above the floor, admitted and serving. */
	public atFloor(index: number): boolean {
		const health = this.at(index)
		return this.lone || (health.admitted && health.tip !== undefined && health.tip >= this.floorValue)
	}

	public qualifies(index: number): boolean {
		return this.lone || (this.at(index).state === "ready" && this.atFloor(index))
	}

	/** Must answer a probe before it takes a call: never admitted, not serving, or not seen at the floor since it last rose. */
	public needsProbe(index: number): boolean {
		return !this.lone && !this.qualifies(index)
	}

	/** Whether an on-demand probe may go out now. */
	public mayProbe(index: number, now: number): boolean {
		if (this.lone) return false
		const health = this.at(index)
		if (health.state === "wrong-chain" && now < health.nextProbeAt) return false
		return health.lastProbeAt === undefined || now - health.lastProbeAt >= ROUTE_TIMING.probeSpacingMs
	}

	/** Endpoints more preferred than the active one whose next return probe is due. */
	public returnProbesDue(now: number): number[] {
		const active = this.activeIndex
		if (this.lone || active === undefined) return []
		const due: number[] = []
		for (let index = 0; index < active; index++) if (this.at(index).nextProbeAt <= now) due.push(index)
		return due
	}

	/** A call answered on `index`, the node's own error answers included. */
	public succeeded(index: number, now: number): void {
		const health = this.at(index)
		health.unanswered = false
		if (recordSuccess(health, now)) this.onChange({ kind: "state", index, state: "ready" })
		if (this.activeIndex === undefined && this.qualifies(index)) this.setActive(index, now)
		if (index === this.activeIndex) this.settleFalls(index)
	}

	public failed(index: number, failure: TransportFailure, cause: object, now: number, attemptMs?: number): void {
		const health = this.at(index)
		health.unanswered = true
		if (!recordFailure(health, failure, cause, now, attemptMs)) return
		this.onChange({ kind: "state", index, state: "down", failure })
		if (index === this.activeIndex && !this.lone) this.loseRole(index, now, undefined)
		health.nextProbeAt = now + health.holdDownMs
	}

	/** `index` served a proposed tip through a tip read or a probe; the active endpoint's sets the floor, up or down. */
	public servedTip(index: number, proposed: number, now: number): void {
		const health = this.at(index)
		health.tip = proposed
		if (index === this.activeIndex) this.floorValue = proposed
		else if (!this.lone && health.state === "ready" && proposed < this.floorValue) this.markBehind(index, now)
	}

	public probed(index: number, answer: ProbeAnswer, now: number): void {
		this.at(index).lastProbeAt = now
		if (!answer.answered) this.probeFailed(index, answer, now)
		else if (!answer.sameChain) this.markWrongChain(index, now)
		else this.probeAnswered(index, answer.tip, now)
	}

	/** A sync read failed on the active endpoint `from`, and `to` qualifies to take the role. */
	public passRole(from: number, to: number, now: number): void {
		if (from !== this.activeIndex || this.lone || !this.qualifies(to)) return
		this.loseRole(from, now, to)
	}

	/** Raises the floor to what the caller has already synced; an active endpoint below it loses the role. */
	public seedFloor(proposed: number, now: number): void {
		if (proposed <= this.floorValue) return
		this.floorValue = proposed
		const active = this.activeIndex
		if (this.lone || active === undefined || this.atFloor(active)) return
		this.markBehind(active, now)
		this.loseRole(active, now, undefined)
	}

	/** Holds the next request to a down endpoint until a hold-down from now. */
	public deferProbe(index: number, now: number): void {
		const health = this.at(index)
		health.nextProbeAt = now + health.holdDownMs
	}

	/** Resets the hold-down of an endpoint that has held the role long enough. */
	public tick(now: number): void {
		const active = this.activeIndex
		if (active === undefined) return
		const health = this.at(active)
		if (health.heldSince === undefined || now - health.heldSince < ROUTE_TIMING.holdResetMs) return
		health.holdDownMs = ROUTE_TIMING.holdDownMinMs
		health.hasFallen = false
	}

	private probeAnswered(index: number, tip: number, now: number): void {
		const health = this.at(index)
		health.admitted = true
		health.failures = 0
		health.unanswered = false
		if (index === this.activeIndex) {
			this.servedTip(index, tip, now)
			return
		}
		health.tip = tip
		if (tip < this.floorValue) {
			this.markBehind(index, now)
			this.restartReturn(health, now)
			return
		}
		if (setState(health, "ready", now)) this.onChange({ kind: "state", index, state: "ready" })
		if (this.activeIndex === undefined) this.setActive(index, now)
		else if (index < this.activeIndex) this.returnProbePassed(index, now)
	}

	private probeFailed(index: number, answer: { failure: TransportFailure | undefined; cause: object }, now: number): void {
		const health = this.at(index)
		if (answer.failure !== undefined) this.failed(index, answer.failure, answer.cause, now, ROUTE_TIMING.probeTimeoutMs)
		this.restartReturn(health, now)
	}

	private markWrongChain(index: number, now: number): void {
		const health = this.at(index)
		health.admitted = false
		health.returnPassAt = undefined
		health.nextProbeAt = now + ROUTE_TIMING.wrongChainRetryMs
		if (setState(health, "wrong-chain", now)) this.onChange({ kind: "state", index, state: "wrong-chain" })
		if (index === this.activeIndex && !this.lone) this.loseRole(index, now, undefined)
	}

	private markBehind(index: number, now: number): void {
		if (setState(this.at(index), "behind", now)) this.onChange({ kind: "state", index, state: "behind" })
	}

	private restartReturn(health: RouteEndpointHealth, now: number): void {
		health.returnPassAt = undefined
		health.nextProbeAt = now + health.holdDownMs
	}

	/** Two passing probes at least a hold-down apart return the role to a more preferred endpoint. */
	private returnProbePassed(index: number, now: number): void {
		const health = this.at(index)
		if (health.returnPassAt === undefined) {
			health.returnPassAt = now
			health.nextProbeAt = now + health.holdDownMs
		} else if (now - health.returnPassAt >= health.holdDownMs) {
			this.setActive(index, now)
		}
	}

	private loseRole(index: number, now: number, next: number | undefined): void {
		const health = this.at(index)
		health.fellAfterReturn = health.hasFallen
		health.hasFallen = true
		health.returnPassAt = undefined
		health.nextProbeAt = now
		this.activeIndex = undefined
		this.setActive(next ?? this.mostPreferredQualifying(), now)
		if (this.activeIndex !== undefined) return
		// Nobody left to serve: a shared outage (the person's own connection) is no endpoint's flap.
		for (const other of this.endpoints) other.fellAfterReturn = false
		this.onChange({ kind: "active", index: undefined })
	}

	private mostPreferredQualifying(): number | undefined {
		const index = this.endpoints.findIndex((_, i) => this.qualifies(i))
		return index < 0 ? undefined : index
	}

	/** The endpoint taking the role brings the tip it was last seen serving: a route built moments ago
	 *  has a floor of 0, and a call moved off it must not reach an endpoint behind what it served. */
	private setActive(index: number | undefined, now: number): void {
		if (index === undefined || index === this.activeIndex) return
		this.activeIndex = index
		const health = this.at(index)
		if (health.tip !== undefined && health.tip > this.floorValue) this.floorValue = health.tip
		health.heldSince = now
		health.returnPassAt = undefined
		health.fellAfterReturn = false
		this.onChange({ kind: "active", index })
	}

	/** The active endpoint `server` answered a call: each endpoint that fell after a return doubles its
	 *  hold-down. Doubling waits for a served call, and the role left with no holder clears every
	 *  pending fall, so every endpoint failing together (the person's own connection dropping)
	 *  doubles nothing, whatever order the failures arrive in. */
	private settleFalls(server: number): void {
		this.endpoints.forEach((other, index) => {
			if (index === server || !other.fellAfterReturn) return
			other.holdDownMs = Math.min(other.holdDownMs * 2, ROUTE_TIMING.holdDownMaxMs)
			other.fellAfterReturn = false
		})
	}

	private at(index: number): RouteEndpointHealth {
		const health = this.endpoints[index]
		if (!health) throw new Error(`No endpoint at index ${index}`)
		return health
	}
}
