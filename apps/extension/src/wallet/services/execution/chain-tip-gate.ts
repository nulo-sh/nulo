/**
 * Holds a send for a moment after an earlier send of its account settles, until the node the PXE
 * syncs from reports that send's block: a receipt read through one upstream can run ahead of what
 * the next simulation sees, and a send built on the older state collides with its predecessor.
 *
 * This limits replica lag; it proves nothing about canonical inclusion. An observation lapses
 * {@link CHAIN_LAG_MAX_MS} after it was made, and a tip that cannot be read lets the send run: both
 * fall back to the degraded mode in which the chain still refuses a real conflict.
 *
 * Observations are this worker's own: the first update it saw placing a tx in a given block. Restore
 * emits no update, so a backup can never hold a send.
 */

import type { Tx } from "@/wallet/services/transaction/spec"
import { scopeId, type SequenceScope } from "./send-sequencer"
import { keysIntersect, recordedTxKeys, type SequenceKey } from "./transfer-sequence-keys"

/** How long a settled send holds its successors for the tip, from when this worker saw it settle. */
export const CHAIN_LAG_MAX_MS = 60_000
const TIP_READ_TIMEOUT_MS = 3_000
const RECHECK_MS = 1_000

export interface ChainTipGateDeps {
	/** The proposed tip of the node the network's PXE syncs from, in one attempt. */
	readTip(networkId: string): Promise<number>
	/** Resolves early when `signal` aborts. */
	sleep(ms: number, signal: AbortSignal): Promise<void>
	now(): number
	logDebug(msg: string): void
}

type Observation = { scope: string; keys: ReadonlySet<SequenceKey>; block: number; observedAt: number }

export class ChainTipGate {
	private observations: Observation[] = []
	/** `hash|block hash` of each placement observed, so a later update of the same row (its finality)
	 *  never restarts a lapsed hold. */
	private readonly observed = new Set<string>()
	/** The last tip read per network id. */
	private readonly tips = new Map<string, number>()
	/** When a read of the network last failed: what was observed by then no longer holds. */
	private readonly failedAt = new Map<string, number>()
	private readonly reads = new Map<string, Promise<void>>()

	public constructor(private readonly deps: ChainTipGateDeps) {}

	/** A row this worker watched left Pending; one in a block holds the sends sharing its keys. */
	public observe(row: Pick<Tx, "hash" | "chainId" | "account" | "calls" | "feeSpender" | "block" | "networkId">): void {
		const { block, networkId } = row
		if (!block || !networkId) return
		const placement = `${row.hash.toLowerCase()}|${block.hash.toLowerCase()}`
		if (this.observed.has(placement)) return
		this.observed.add(placement)
		const tip = this.tips.get(networkId)
		if (tip !== undefined && tip >= block.number) return
		this.observations.push({ scope: scopeId(row), keys: recordedTxKeys(row), block: block.number, observedAt: this.deps.now() })
		void this.refresh(networkId)
	}

	/**
	 * Whether a live observation in `scope` that shares a key with `keys` names a block above the last
	 * tip read for `networkId`. With `keys` undefined every observation in scope counts.
	 */
	public unconfirmed(scope: SequenceScope, keys: ReadonlySet<SequenceKey> | undefined, networkId: string): boolean {
		const now = this.deps.now()
		this.observations = this.observations.filter((o) => o.observedAt <= now && now - o.observedAt < CHAIN_LAG_MAX_MS)
		const id = scopeId(scope)
		const tip = this.tips.get(networkId)
		const failedAt = this.failedAt.get(networkId)
		return this.observations.some(
			(o) =>
				o.scope === id &&
				(keys === undefined || keysIntersect(o.keys, keys)) &&
				(failedAt === undefined || o.observedAt > failedAt) &&
				(tip === undefined || o.block > tip),
		)
	}

	/** One tip read for `networkId`, bounded and shared with any read already running. */
	public refresh(networkId: string): Promise<void> {
		const running = this.reads.get(networkId)
		if (running) return running
		const read = this.readWithin(networkId)
			.then((tip) => {
				if (tip === undefined) throw new Error("tip read timed out")
				this.tips.set(networkId, tip)
			})
			.catch(() => {
				this.failedAt.set(networkId, this.deps.now())
				// The error is not logged: the node client's messages can carry the endpoint URL.
				this.deps.logDebug("Chain tip unreadable; sends waiting on it run")
			})
			.finally(() => this.reads.delete(networkId))
		this.reads.set(networkId, read)
		return read
	}

	/** Waits while {@link unconfirmed}, reading the tip every second, for at most `maxMs`. Never throws. */
	public async wait(
		scope: SequenceScope,
		keys: ReadonlySet<SequenceKey> | undefined,
		networkId: string,
		signal: AbortSignal,
		maxMs: number,
	): Promise<"confirmed" | "aborted" | "expired"> {
		const until = this.deps.now() + maxMs
		for (;;) {
			if (signal.aborted) return "aborted"
			if (!this.unconfirmed(scope, keys, networkId)) return "confirmed"
			if (this.deps.now() >= until) return "expired"
			await settledOrAborted(this.refresh(networkId), signal)
			if (signal.aborted) continue
			if (this.unconfirmed(scope, keys, networkId))
				await this.deps.sleep(Math.min(RECHECK_MS, Math.max(0, until - this.deps.now())), signal)
		}
	}

	/** `undefined` when the read outlasts its bound. */
	private async readWithin(networkId: string): Promise<number | undefined> {
		const timer = new AbortController()
		try {
			return await Promise.race([
				this.deps.readTip(networkId),
				this.deps.sleep(TIP_READ_TIMEOUT_MS, timer.signal).then(() => undefined),
			])
		} finally {
			timer.abort()
		}
	}
}

/** Resolves once `promise` settles or `signal` aborts; a cancel never waits out a tip read. */
function settledOrAborted(promise: Promise<void>, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return Promise.resolve()
	return new Promise((resolve) => {
		const done = () => {
			signal.removeEventListener("abort", done)
			resolve()
		}
		signal.addEventListener("abort", done, { once: true })
		void promise.finally(done)
	})
}
