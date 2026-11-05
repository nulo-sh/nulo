/**
 * An `AztecNode` over one network's endpoints: each call goes to the active endpoint and moves to
 * the next when the one before fails for a reason that is the endpoint's fault (`callFailureOf`),
 * and the active role returns to a more preferred endpoint once it answers again.
 *
 * Invariants:
 * - A submission never passes through routing: `sendTx` throws. The caller sends through the
 *   endpoint `route.pickForSend` returned, and the pinned hash's receipts go only there.
 * - The PXE block stream's reads by number go to the active endpoint only, so one sync pass never
 *   mixes one endpoint's tips with another's blocks.
 * - No call moves to an endpoint seen below the floor (the proposed tip the active endpoint last
 *   served, or the caller's seeded sync height), so a lagging endpoint cannot prune the PXE.
 * - With one endpoint a call makes exactly the requests, sleeps and attempts the node fetch alone
 *   made, and nothing is probed. A pinned receipt is the one exception, on any route: while its
 *   endpoint is down it reads `PENDING` and asks once per hold-down.
 */

import { BlockHash } from "@aztec-labs/stdlib/block"
import { type AztecNode, AztecNodeApiSchema } from "@aztec-labs/stdlib/interfaces/client"
import { PendingTxReceipt, type TxReceipt } from "@aztec-labs/stdlib/tx"
import { isLoopbackHost } from "@nulo/wallet-core/utils"
import { assertLiveChainIdentity } from "../utils/chain-identity"
import { isReservedRpcCode, type TransportFailure, transportFailureOf, withTransportFailure } from "../utils/fetch"
import {
	countsTowardDown,
	type EndpointHealth,
	type EndpointState,
	type HealthChange,
	newEndpointHealth,
	type ProbeAnswer,
	ROUTE_TIMING,
	RouteHealth,
	recordFailure,
	recordSuccess,
} from "./endpoint-health"

/** `rpcUrl` is the key the log redactor reduces to its origin. */
export interface RouteEndpoint {
	readonly id: string
	readonly rpcUrl: string
}

/** A network's endpoints in preference order, the primary first, and the identity each must serve. */
export interface RouteSpec {
	readonly chainId: number
	readonly l1ChainId: number
	readonly endpoints: readonly RouteEndpoint[]
	/** The rollup the caller's store was stamped with; a candidate on another rollup is refused. */
	readonly rollupAddress?: string
}

/** Which endpoint carried each submitted transaction, held by the caller across the routed nodes it builds. */
export interface SubmissionPins {
	/** Lower-case transaction hash → the endpoint that carried it, until it reports the transaction finalized. */
	readonly byTxHash: Map<string, RouteEndpoint>
	/** The health of pinned endpoints a route no longer lists, by URL. */
	readonly detached: Map<string, EndpointHealth>
}

export function createSubmissionPins(): SubmissionPins {
	return { byTxHash: new Map(), detached: new Map() }
}

export interface Route {
	active(): RouteEndpoint | undefined
	/** A node whose every call is one attempt at the active endpoint, fed into the same health and
	 *  never moved. With no active endpoint, admission runs first; it and the attempt share `timeoutMs`. */
	singleAttempt(timeoutMs: number): AztecNode
	/** Raises the floor to a block number the caller has already synced. */
	seedFloor(proposedBlockNumber: number): void
	/**
	 * The endpoint to submit `txHash` through, pinned for its receipts: the active endpoint while
	 * it is ready and its latest call answered (no request), else the first endpoint in preference
	 * order serving this chain and knowing `anchorHash`, else the active one. Refuses when every
	 * answer is another chain, and when there is no active endpoint and none answers.
	 */
	pickForSend(txHash: string, anchorHash: string): Promise<RouteEndpoint>
	snapshot(): readonly { readonly id: string; readonly state: EndpointState; readonly since: number }[]
}

export type RoutedNode = AztecNode & { readonly route: Route }

/** One router event: the endpoint's id, never its URL. */
export type RouteLogEvent =
	| {
			readonly event: "state"
			readonly chainId: number
			readonly endpointId: string
			readonly state: EndpointState
			readonly failure?: TransportFailure
	  }
	| { readonly event: "active"; readonly chainId: number; readonly endpointId: string | undefined }
	| {
			readonly event: "move"
			readonly chainId: number
			readonly endpointId: string
			readonly failure: TransportFailure
			readonly method: string
	  }

/** A deadline that settles `expired` once `ms` pass, unless cancelled first. */
export interface RouteTimer {
	readonly expired: Promise<void>
	cancel(): void
}

export interface RouteDeps {
	now(): number
	sleep(ms: number): Promise<void>
	/** Bounds a caller's wait on work it shares with other callers, which keeps running past it. */
	timer(ms: number): RouteTimer
	log(event: RouteLogEvent): void
	/** Asked before every move, before every sleep and after it; `false` ends the call with its last error. */
	retryWhile?: () => boolean
	pins?: SubmissionPins
}

/** {@link RouteDeps.timer} on the platform clock. */
export function realTimer(ms: number): RouteTimer {
	let handle: ReturnType<typeof setTimeout> | undefined
	const expired = new Promise<void>((resolve) => {
		handle = setTimeout(resolve, ms)
	})
	return { expired, cancel: () => clearTimeout(handle) }
}

/** Builds a client for one URL whose every call is a single attempt aborted at `timeoutMs`. */
export type ConnectEndpoint = (rpcUrl: string, timeoutMs: number) => AztecNode

/**
 * The kind of a failed call: the transport's, or `refused` for one entry a gateway refused with a
 * non-reserved code. `undefined` is the node's own answer, which no other endpoint would change.
 */
export function callFailureOf(error: unknown): TransportFailure | undefined {
	const kind = transportFailureOf(error)
	if (kind !== undefined) return kind
	const cause = typeof error === "object" && error !== null ? (error as { cause?: { code?: unknown } }).cause : undefined
	const code = typeof cause === "object" && cause !== null ? cause.code : undefined
	return typeof code === "number" && !isReservedRpcCode(code) ? "refused" : undefined
}

/** The fetch error a failed call shares with the other callers of its batch. */
function sharedCause(error: unknown): object {
	const cause = typeof error === "object" && error !== null ? (error as { cause?: { data?: unknown } }).cause : undefined
	const data = typeof cause === "object" && cause !== null ? cause.data : undefined
	if (typeof data === "object" && data !== null) return data
	return typeof error === "object" && error !== null ? error : {}
}

function isLoopbackRpcUrl(rpcUrl: string): boolean {
	try {
		return isLoopbackHost(new URL(rpcUrl).hostname)
	} catch {
		return false
	}
}

/** The block stream's reads relative to an endpoint's own tip or by number (`block_stream_source.js`, `PXE.create`). */
function isSyncRead(method: string, args: readonly unknown[]): boolean {
	if (method === "getChainTips" || method === "getBlocks") return true
	if (method === "getBlockNumber") return args[0] === undefined
	if (method !== "getBlock") return false
	const query = args[0]
	if (typeof query === "number") return true
	return typeof query === "object" && query !== null && Object.keys(query).length === 1 && "number" in query
}

function servedProposedTip(method: string, args: readonly unknown[], value: unknown): number | undefined {
	if (method === "getBlockNumber" && args[0] === undefined && typeof value === "number") return value
	if (method !== "getChainTips" || typeof value !== "object" || value === null) return undefined
	const proposed = (value as { proposed?: { number?: unknown } }).proposed?.number
	return typeof proposed === "number" ? proposed : undefined
}

const pinKey = (txHash: unknown) => String(txHash).toLowerCase()

/** A transport failure is retried where it happened; a 429 or a refusal is not (today's `NoRetryError`). */
function retriesOnSameEndpoint(error: unknown): boolean {
	const failure = callFailureOf(error)
	return failure !== undefined && countsTowardDown(failure)
}

const noEndpoint = (what: string) => withTransportFailure(new Error(`No endpoint of this network can take ${what}`), "unreachable")

/** What one dispatched request came back with. */
type Dispatched =
	| { readonly kind: "ok"; readonly value: unknown }
	| { readonly kind: "answer"; readonly error: unknown }
	| { readonly kind: "failed"; readonly error: unknown; readonly spent: boolean }

type Attempt = Dispatched | { readonly kind: "skipped" } | { readonly kind: "stopped" }

type RoundOutcome =
	| { readonly kind: "ok"; readonly value: unknown }
	| { readonly kind: "answer"; readonly error: unknown }
	| { readonly kind: "failed"; readonly error: unknown; readonly index: number }
	| { readonly kind: "skipped" }

/** The client calls a method of a node by name. */
type Callable = Record<string, (...args: unknown[]) => Promise<unknown>>

class Router implements Route {
	public readonly health: RouteHealth
	private readonly clients = new Map<string, AztecNode>()
	private readonly probes = new Map<number, Promise<void>>()
	private readonly pins: SubmissionPins
	private readonly singleAttempts = new Map<number, AztecNode>()

	public constructor(
		private readonly connect: ConnectEndpoint,
		private readonly spec: RouteSpec,
		private readonly endpoints: readonly RouteEndpoint[],
		private readonly deps: RouteDeps,
	) {
		this.pins = deps.pins ?? createSubmissionPins()
		this.health = new RouteHealth(endpoints.length, deps.now(), (change) => this.logChange(change))
	}

	public active(): RouteEndpoint | undefined {
		const index = this.health.active()
		return index === undefined ? undefined : this.endpoints[index]
	}

	public seedFloor(proposedBlockNumber: number): void {
		this.health.seedFloor(proposedBlockNumber, this.deps.now())
	}

	public snapshot(): readonly { id: string; state: EndpointState; since: number }[] {
		return this.endpoints.map((endpoint, index) => ({
			id: endpoint.id,
			state: this.health.state(index),
			since: this.health.since(index),
		}))
	}

	public singleAttempt(timeoutMs: number): AztecNode {
		const cached = this.singleAttempts.get(timeoutMs)
		if (cached) return cached
		const node = nodeOf(async (method, args) => {
			const pinned = method === "getTxReceipt" ? this.pins.byTxHash.get(pinKey(args[0])) : undefined
			if (pinned) return this.pinnedReceipt(pinned, args, timeoutMs, 1)
			const start = this.deps.now()
			if (this.health.active() === undefined) await this.admitWithin(start + timeoutMs, timeoutMs)
			const index = this.health.active()
			const endpoint = index === undefined ? undefined : this.endpoints[index]
			const left = timeoutMs - (this.deps.now() - start)
			if (index === undefined || !endpoint || left <= 0) throw noEndpoint("the call")
			// A budget cut by admission gets its own client; the full one is shared.
			const client = left === timeoutMs ? this.client(endpoint.rpcUrl, timeoutMs) : this.connect(endpoint.rpcUrl, left)
			const out = await this.attemptOn(index, client, method, args, left)
			if (out.kind === "ok") return out.value
			throw out.error
		})
		this.singleAttempts.set(timeoutMs, node)
		return node
	}

	public async pickForSend(txHash: string, anchorHash: string): Promise<RouteEndpoint> {
		const key = pinKey(txHash)
		const pinned = this.pins.byTxHash.get(key)
		if (pinned) return pinned
		const active = this.health.active()
		// The active endpoint is the proof's own only while its latest call answered: a failure that
		// leaves it `ready` (a 429, a refusal, one failed batch) still moved the proof's later reads.
		const trusted = active !== undefined && this.health.state(active) === "ready" && this.health.answeredLast(active)
		const picked = trusted ? this.endpoints[active] : await this.pickByAnchor(active, anchorHash)
		if (!picked) throw noEndpoint("the transaction")
		const raced = this.pins.byTxHash.get(key)
		if (raced) return raced
		this.pins.byTxHash.set(key, picked)
		return picked
	}

	public async call(method: string, args: unknown[]): Promise<unknown> {
		const now = this.deps.now()
		this.health.tick(now)
		this.startReturnProbes(now)
		const pinned = method === "getTxReceipt" ? this.pins.byTxHash.get(pinKey(args[0])) : undefined
		if (pinned) return this.pinnedReceipt(pinned, args, ROUTE_TIMING.callTimeoutMs, ROUTE_TIMING.backoffMs.length + 1)
		if (this.health.active() === undefined) await this.admitFirst()
		return this.walk(method, args, isSyncRead(method, args))
	}

	/** Rounds over the endpoints, a move within a round needing no sleep; today's sleeps between rounds. */
	private async walk(method: string, args: unknown[], sync: boolean): Promise<unknown> {
		const spent = new Set<number>()
		let last: unknown
		for (let round = 0; round <= ROUTE_TIMING.backoffMs.length; round++) {
			const order = this.candidates(spent, sync)
			if (order.length === 0) break
			if (round > 0) await this.pause(round, last)
			const out = await this.round(order, spent, method, args, { sync, retrying: round > 0, last })
			if (out.kind === "ok") return out.value
			if (out.kind === "answer") throw out.error
			if (out.kind !== "failed") continue
			last = out.error
			if (sync) return await this.resendSync(out.index, method, args, out.error)
		}
		throw last ?? noEndpoint("the call")
	}

	/** Tries each endpoint of `order` once, moving at once on a failure that moves; a sync read stops at its first failure. */
	private async round(
		order: readonly number[],
		spent: Set<number>,
		method: string,
		args: unknown[],
		{ sync, retrying, last }: { sync: boolean; retrying: boolean; last: unknown },
	): Promise<RoundOutcome> {
		let lastError = last
		let failedAt: number | undefined
		for (const index of order) {
			const out = await this.attempt(index, method, args, retrying || failedAt !== undefined, sync)
			if (out.kind === "stopped") throw lastError
			if (out.kind === "skipped") continue
			if (out.kind !== "failed") return out
			lastError = out.error
			failedAt = index
			if (out.spent) spent.add(index)
			if (sync) break
		}
		return failedAt === undefined ? { kind: "skipped" } : { kind: "failed", error: lastError, index: failedAt }
	}

	/** The active endpoint failed a sync read: the read is re-sent once to the endpoint that holds the
	 *  role next, the failure's own hand-off or the next qualifying one. With none, the read keeps
	 *  today's rounds on the endpoint that failed. */
	private async resendSync(failed: number, method: string, args: unknown[], error: unknown): Promise<unknown> {
		if (!this.retryWhile()) throw error
		const next = this.health.lone ? undefined : await this.successor(failed)
		if (next === undefined) return this.walkRest(failed, method, args, error)
		const out = await this.attempt(next, method, args, true, true)
		if (out.kind === "ok") return out.value
		throw out.kind === "failed" || out.kind === "answer" ? out.error : error
	}

	/** The endpoint other than `failed` holding the role once `failed` gives it up, if any. */
	private async successor(failed: number): Promise<number | undefined> {
		const holder = this.health.active()
		if (holder !== undefined && holder !== failed) return holder
		const next = await this.nextQualifying(failed)
		if (next !== undefined) this.health.passRole(failed, next, this.deps.now())
		const active = this.health.active()
		return active === undefined || active === failed ? undefined : active
	}

	/** Today's remaining rounds on the one endpoint whose first attempt failed with `error`, while no
	 *  other endpoint holds the role: a sync read never reaches an endpoint the floor moved past. */
	private async walkRest(index: number, method: string, args: unknown[], error: unknown): Promise<unknown> {
		let last = error
		for (let round = 1; round <= ROUTE_TIMING.backoffMs.length && retriesOnSameEndpoint(last); round++) {
			await this.pause(round, last)
			const active = this.health.active()
			if (active !== undefined && active !== index) break
			const out = await this.attempt(index, method, args, true, true)
			if (out.kind === "ok") return out.value
			if (out.kind !== "failed") throw out.kind === "answer" ? out.error : last
			last = out.error
		}
		throw last
	}

	/** The endpoints a round tries, the active one first: down ones skipped while another can take
	 *  the call; with none left, only the most preferred that was ever admitted and is not below the floor. */
	private candidates(spent: ReadonlySet<number>, sync: boolean): number[] {
		const active = this.health.active()
		if (this.health.lone) return spent.has(0) ? [] : [0]
		const open = this.preference(active).filter((i) => !spent.has(i) && this.health.state(i) !== "wrong-chain")
		const now = this.deps.now()
		const usable = sync
			? open.filter((i) => i === active)
			: open.filter((i) => this.health.state(i) !== "down" && (!this.health.needsProbe(i) || this.health.mayProbe(i, now)))
		if (usable.length > 0) return usable
		const fallback = open.find((i) => this.health.isAdmitted(i) && this.health.atFloor(i))
		return fallback === undefined ? [] : [fallback]
	}

	private preference(active: number | undefined): number[] {
		const order = this.endpoints.map((_, i) => i)
		return active === undefined ? order : [active, ...order.filter((i) => i !== active)]
	}

	private async pause(round: number, last: unknown): Promise<void> {
		if (!this.retryWhile()) throw last
		await this.deps.sleep(ROUTE_TIMING.backoffMs[round - 1] ?? 0)
		if (!this.retryWhile()) throw last
	}

	private retryWhile(): boolean {
		return this.deps.retryWhile?.() ?? true
	}

	/** One attempt on `index`, probing it first when it must answer one. A `retrying` attempt (any but a
	 *  call's first) asks `retryWhile` before it moves and again after the probe. The last check, of the
	 *  stop, the floor and a sync read's holder, runs with no await before the dispatch. */
	private async attempt(index: number, method: string, args: unknown[], retrying: boolean, sync = false): Promise<Attempt> {
		if (retrying && !this.retryWhile()) return { kind: "stopped" }
		if (this.health.needsProbe(index) && this.health.state(index) !== "down") {
			if (!this.health.mayProbe(index, this.deps.now())) return { kind: "skipped" }
			const failure = await this.probe(index)
			if (failure !== undefined) return { kind: "failed", error: failure, spent: false }
			if (retrying && !this.retryWhile()) return { kind: "stopped" }
		}
		const endpoint = this.endpoints[index]
		if (!endpoint || !this.mayDispatch(index, sync)) return { kind: "skipped" }
		return this.attemptOn(index, this.client(endpoint.rpcUrl, ROUTE_TIMING.callTimeoutMs), method, args)
	}

	/** A down endpoint only while still at the floor, any other only while it qualifies; a sync read
	 *  only on the active endpoint, or with none active on the one it already reads. */
	private mayDispatch(index: number, sync: boolean): boolean {
		const active = this.health.active()
		if (sync && active !== undefined && active !== index) return false
		return this.health.state(index) === "down" ? this.health.atFloor(index) : this.health.qualifies(index)
	}

	private async attemptOn(
		index: number,
		client: AztecNode,
		method: string,
		args: unknown[],
		attemptMs: number = ROUTE_TIMING.callTimeoutMs,
	): Promise<Dispatched> {
		try {
			const value = await (client as unknown as Callable)[method]?.(...args)
			const tip = servedProposedTip(method, args, value)
			if (tip !== undefined) this.health.servedTip(index, tip, this.deps.now())
			this.health.succeeded(index, this.deps.now())
			return { kind: "ok", value }
		} catch (error) {
			const failure = callFailureOf(error)
			if (failure === undefined) {
				this.health.succeeded(index, this.deps.now())
				return { kind: "answer", error }
			}
			this.health.failed(index, failure, sharedCause(error), this.deps.now(), attemptMs)
			const endpointId = this.endpoints[index]?.id ?? String(index)
			if (!this.health.lone) this.deps.log({ event: "move", chainId: this.spec.chainId, endpointId, failure, method })
			return { kind: "failed", error, spent: !countsTowardDown(failure) }
		}
	}

	/** {@link admitFirst} for one caller's budget: the caller stops waiting once `budgetMs` pass,
	 *  while a probe it joined runs on for the callers still waiting on it. */
	private async admitWithin(deadline: number, budgetMs: number): Promise<void> {
		const timer = this.deps.timer(budgetMs)
		try {
			await Promise.race([this.admitFirst(deadline), timer.expired])
		} finally {
			timer.cancel()
		}
	}

	/** With no active endpoint, probes every endpoint not on another chain in preference order until
	 *  one takes the role; no probe starts at or past `deadline`. */
	private async admitFirst(deadline = Number.POSITIVE_INFINITY): Promise<void> {
		for (let index = 0; index < this.endpoints.length; index++) {
			if (this.health.active() !== undefined || this.deps.now() >= deadline) return
			if (this.health.state(index) === "wrong-chain" && !this.health.mayProbe(index, this.deps.now())) continue
			if (this.health.mayProbe(index, this.deps.now()) || this.probes.has(index)) await this.probe(index)
		}
	}

	/** The most preferred endpoint other than `failed` that qualifies, probing one not seen at the floor. */
	private async nextQualifying(failed: number): Promise<number | undefined> {
		for (let index = 0; index < this.endpoints.length; index++) {
			if (index === failed || this.health.state(index) === "wrong-chain") continue
			if (this.health.needsProbe(index) && this.health.mayProbe(index, this.deps.now())) await this.probe(index)
			if (this.health.qualifies(index)) return index
		}
		return undefined
	}

	/** One shared probe per endpoint in flight; resolves to the probe's error when it failed in transport. */
	private probe(index: number): Promise<unknown> {
		const running = this.probes.get(index)
		if (running) return running.then(() => undefined)
		let failure: unknown
		const probing = this.runProbe(index)
			.then((error) => {
				failure = error
			})
			.finally(() => this.probes.delete(index))
		this.probes.set(index, probing)
		return probing.then(() => failure)
	}

	private async runProbe(index: number): Promise<unknown> {
		const endpoint = this.endpoints[index]
		if (!endpoint) return undefined
		const client = this.client(endpoint.rpcUrl, ROUTE_TIMING.probeTimeoutMs)
		let answer: ProbeAnswer
		let failure: unknown
		try {
			const [info, tips] = await Promise.all([client.getNodeInfo(), client.getChainTips()])
			answer = { answered: true, sameChain: this.identityMismatch(info) === undefined, tip: tips.proposed.number }
		} catch (error) {
			const kind = callFailureOf(error)
			answer = { answered: false, failure: kind, cause: sharedCause(error) }
			failure = kind === undefined ? undefined : error
		}
		this.health.probed(index, answer, this.deps.now())
		return failure
	}

	private startReturnProbes(now: number): void {
		for (const index of this.health.returnProbesDue(now)) {
			if (!this.probes.has(index)) void this.probe(index)
		}
	}

	private identityMismatch(info: Awaited<ReturnType<AztecNode["getNodeInfo"]>>): Error | undefined {
		try {
			assertLiveChainIdentity({ chainId: this.spec.chainId, l1ChainId: this.spec.l1ChainId }, info)
		} catch (error) {
			return error instanceof Error ? error : new Error(String(error))
		}
		const expected = this.spec.rollupAddress?.toLowerCase()
		const served = info.l1ContractAddresses?.rollupAddress?.toString().toLowerCase()
		if (expected === undefined || served === expected) return undefined
		return new Error("Chain identity mismatch: the live node reports another rollup than this network's store. Refusing to use it.")
	}

	/** Asks the endpoints other than `active`, in order, for their identity and the anchor block. */
	private async pickByAnchor(active: number | undefined, anchorHash: string): Promise<RouteEndpoint | undefined> {
		let mismatch: Error | undefined
		let sameChain = false
		for (let index = 0; index < this.endpoints.length; index++) {
			if (index === active || this.health.state(index) === "wrong-chain") continue
			const answer = await this.askForAnchor(index, anchorHash)
			if (answer instanceof Error) mismatch = answer
			else if (answer !== "silent") sameChain = true
			if (answer === "knows") return this.endpoints[index]
		}
		if (mismatch && !sameChain) throw mismatch
		return active === undefined ? undefined : this.endpoints[active]
	}

	/** One batch `[getNodeInfo, getBlockData(anchor)]`: whether `index` serves this chain and knows the
	 *  anchor. Identity is judged from its own answer even when the block read fails. */
	private async askForAnchor(index: number, anchorHash: string): Promise<"knows" | "lacks" | "silent" | Error> {
		const endpoint = this.endpoints[index]
		if (!endpoint) return "silent"
		const client = this.client(endpoint.rpcUrl, ROUTE_TIMING.probeTimeoutMs)
		const [info, block] = await Promise.allSettled([client.getNodeInfo(), client.getBlockData(BlockHash.fromString(anchorHash))])
		if (info.status === "rejected") return this.silentAnswer(index, info.reason)
		const mismatch = this.identityMismatch(info.value)
		if (mismatch) {
			this.health.probed(index, { answered: true, sameChain: false, tip: 0 }, this.deps.now())
			return mismatch
		}
		this.health.succeeded(index, this.deps.now())
		if (block.status === "rejected") return callFailureOf(block.reason) === undefined ? "lacks" : this.silentAnswer(index, block.reason)
		return block.value === undefined ? "lacks" : "knows"
	}

	private silentAnswer(index: number, error: unknown): "silent" {
		const kind = callFailureOf(error)
		if (kind !== undefined) this.health.failed(index, kind, sharedCause(error), this.deps.now(), ROUTE_TIMING.probeTimeoutMs)
		return "silent"
	}

	/** A pinned hash's receipt, read only where it was sent: `PENDING` while that endpoint fails. */
	private async pinnedReceipt(endpoint: RouteEndpoint, args: unknown[], timeoutMs: number, maxRounds: number): Promise<TxReceipt> {
		const index = this.endpoints.findIndex((e) => e.rpcUrl === endpoint.rpcUrl)
		const detached = index >= 0 ? undefined : this.detachedHealth(endpoint.rpcUrl)
		const down = (detached ? detached.state : this.health.state(index)) === "down"
		const dueAt = detached ? detached.nextProbeAt : this.health.nextProbeAt(index)
		if (down && this.deps.now() < dueAt) return new PendingTxReceipt(args[0] as never, undefined as never)
		const receipt = await this.readPinned({ endpoint, index, detached, timeoutMs }, args, down ? 1 : maxRounds)
		if (receipt?.status === "finalized") this.pins.byTxHash.delete(pinKey(args[0]))
		if (receipt) return receipt
		this.deferPinnedProbe(index, detached)
		return new PendingTxReceipt(args[0] as never, undefined as never)
	}

	/** Today's rounds on the pinned URL alone; `undefined` once they all failed in transport. */
	private async readPinned(
		{
			endpoint,
			index,
			detached,
			timeoutMs,
		}: { endpoint: RouteEndpoint; index: number; detached: EndpointHealth | undefined; timeoutMs: number },
		args: unknown[],
		rounds: number,
	): Promise<TxReceipt | undefined> {
		const client = this.client(endpoint.rpcUrl, timeoutMs) as unknown as Callable
		let last: unknown
		for (let round = 0; round < rounds; round++) {
			if (round > 0) {
				await this.pause(round, last)
				if (!this.retryWhile()) throw last
			}
			try {
				const receipt = (await client.getTxReceipt?.(...args)) as TxReceipt
				this.pinAnswered(index, detached)
				return receipt
			} catch (error) {
				const failure = callFailureOf(error)
				if (failure === undefined) throw error
				last = error
				this.pinFailed({ index, detached, timeoutMs }, failure, sharedCause(error))
				if (!countsTowardDown(failure)) return undefined
			}
		}
		return undefined
	}

	private detachedHealth(rpcUrl: string): EndpointHealth {
		const known = this.pins.detached.get(rpcUrl)
		if (known) return known
		const fresh = newEndpointHealth("ready", this.deps.now())
		this.pins.detached.set(rpcUrl, fresh)
		return fresh
	}

	private pinAnswered(index: number, detached: EndpointHealth | undefined): void {
		if (detached) recordSuccess(detached, this.deps.now())
		else this.health.succeeded(index, this.deps.now())
	}

	private pinFailed(
		{ index, detached, timeoutMs }: { index: number; detached: EndpointHealth | undefined; timeoutMs: number },
		failure: TransportFailure,
		cause: object,
	): void {
		if (detached) recordFailure(detached, failure, cause, this.deps.now(), timeoutMs)
		else this.health.failed(index, failure, cause, this.deps.now(), timeoutMs)
	}

	/** A down pinned endpoint is asked again only once its next probe is due. */
	private deferPinnedProbe(index: number, detached: EndpointHealth | undefined): void {
		const now = this.deps.now()
		if (detached) {
			if (detached.state === "down") detached.nextProbeAt = now + detached.holdDownMs
		} else if (this.health.state(index) === "down") {
			this.health.deferProbe(index, now)
		}
	}

	private client(rpcUrl: string, timeoutMs: number): AztecNode {
		const key = `${timeoutMs} ${rpcUrl}`
		const known = this.clients.get(key)
		if (known) return known
		const client = this.connect(rpcUrl, timeoutMs)
		this.clients.set(key, client)
		return client
	}

	private logChange(change: HealthChange): void {
		const chainId = this.spec.chainId
		if (change.kind === "active") {
			const endpointId = change.index === undefined ? undefined : this.endpoints[change.index]?.id
			this.deps.log({ event: "active", chainId, endpointId })
			return
		}
		const endpointId = this.endpoints[change.index]?.id ?? String(change.index)
		this.deps.log({ event: "state", chainId, endpointId, state: change.state, failure: change.failure })
	}
}

/** An object with every `AztecNode` method, each forwarded to `call`; not thenable. */
function nodeOf(call: (method: string, args: unknown[]) => Promise<unknown>): AztecNode {
	const node: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
	for (const method of Object.keys(AztecNodeApiSchema)) node[method] = (...args) => call(method, args)
	node.sendTx = async () => {
		throw new Error("A routed node takes no submission: send through the endpoint pickForSend returned")
	}
	return node as unknown as AztecNode
}

/**
 * Routes one network's node calls across its endpoints. Chain 0, the local development chain,
 * keeps only its loopback endpoints. Throws when no endpoint remains.
 */
export function routeNode(connect: ConnectEndpoint, spec: RouteSpec, deps: RouteDeps): RoutedNode {
	const endpoints = spec.chainId === 0 ? spec.endpoints.filter((e) => isLoopbackRpcUrl(e.rpcUrl)) : spec.endpoints
	if (endpoints.length === 0) throw new Error("A routed node needs at least one endpoint it may use")
	const router = new Router(connect, spec, endpoints, deps)
	const node = nodeOf((method, args) => router.call(method, args))
	Object.defineProperty(node, "route", { value: router, enumerable: false })
	return node as RoutedNode
}
