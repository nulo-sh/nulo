/**
 * Orders the popup sends of one account that share chain state (see `transfer-sequence-keys.ts`).
 *
 * A send takes a ticket and waits until no earlier ticket and no submitted tx that shares a key is
 * still in flight. A submitted tx stops holding when its receipt settles (in a block, or dropped),
 * not when it is submitted: before inclusion the next send's predecessor read names a nullifier the
 * chain does not have yet. Losing the local record is not a settlement. A submitted tx holds for at
 * most {@link SUBMITTED_HOLD_MS} after it reached the node; past that the successor runs unordered,
 * a deliberate degraded mode in which the chain still refuses any real conflict.
 *
 * An estimate holds no place in line and never waits. Between its check and the end of its
 * simulation it holds back sends that enter after it, so a proof can never slip between two of its
 * simulations.
 */

import type { Tx } from "@/wallet/services/transaction/spec"
import { keysIntersect, recordedTxKeys, type SequenceKey } from "./transfer-sequence-keys"

export const SUBMITTED_HOLD_MS = 10 * 60_000
/** A send's whole wait, from `enter`, for its dependencies and the slot together. Below the lane's
 *  90-minute heartbeat lease, so the reaper never fails a send that still waits. */
export const MAX_WAIT_MS = 60 * 60_000
/** The pending map changes on the TransactionService worker's 1 s tick. */
const POLL_MS = 500

export type SequenceScope = { chainId: number; account: string }

export interface SendSequencerDeps {
	/** Submitted txs of `account` no receipt has yet placed in a block or dropped. */
	pendingTxs(account: string): readonly Pick<Tx, "hash" | "chainId" | "account" | "calls" | "createdAt" | "feeSpender">[]
	/** Resolves early when `signal` aborts. */
	sleep(ms: number, signal: AbortSignal): Promise<void>
	now(): number
}

export interface SequenceTicket {
	/** When the ticket's wait runs out: the earlier of {@link MAX_WAIT_MS} after `enter` and the deadline it was entered with. */
	readonly deadline: number
	/** Whether an earlier ticket or estimate, or a pending tx, shares a key right now. */
	blocked(): boolean
	/** What is left until `deadline`, never below 0. */
	remainingMs(): number
	/** `turn` once no earlier ticket or estimate and no pending tx shares a key; `expired` past the deadline. */
	waitTurn(signal: AbortSignal): Promise<"turn" | "aborted" | "expired">
	/** `node.sendTx` accepted `txHash`. */
	sent(txHash: string): void
	/** The send is over, whatever happened. Idempotent. */
	release(): void
}

interface Holder {
	readonly seq: number
	/** An estimate's hold delays only sends, never another estimate. */
	readonly estimate: boolean
	/** A send this sequencer did not order (a dApp tx): it holds every ticket, whatever its place. */
	readonly external: boolean
	readonly deadline: number
	readonly scope: string
	readonly keys: ReadonlySet<SequenceKey>
	released: boolean
	sent?: { hash: string; at: number }
}

const scopeId = (scope: SequenceScope): string => `${scope.chainId}|${scope.account.toLowerCase()}`

export class SendSequencer {
	private readonly holders: Holder[] = []
	private readonly epochs = new Map<string, number>()
	/** Hash → when its receipt settled; kept for the hold bound, since a settle can precede `sent`. */
	private readonly settledAt = new Map<string, number>()
	private nextSeq = 0

	public constructor(private readonly deps: SendSequencerDeps) {}

	/**
	 * Synchronous, so the ticket's place in line is the call order. A send that enters again (its keys
	 * changed while it waited) passes its first ticket's `deadline`, so no re-entry extends its wait.
	 */
	public enter(scope: SequenceScope, keys: ReadonlySet<SequenceKey>, deadline?: number): SequenceTicket {
		const holder = this.hold(scope, keys, { estimate: false, external: false }, deadline)
		return {
			deadline: holder.deadline,
			blocked: () => this.blocked(scope, holder.keys, holder),
			remainingMs: () => Math.max(0, holder.deadline - this.deps.now()),
			waitTurn: (signal) => this.waitTurn(scope, holder, signal),
			sent: (hash) => {
				holder.sent = { hash: hash.toLowerCase(), at: this.deps.now() }
				this.bumpEpoch(scope)
			},
			release: () => {
				holder.released = true
			},
		}
	}

	/** Whether anything in flight in `scope` shares a key, whatever its place in line. */
	public isBlocked(scope: SequenceScope, keys: ReadonlySet<SequenceKey>): boolean {
		return this.blocked(scope, keys, undefined)
	}

	/**
	 * Checks and reserves in one step: `undefined` when something in flight shares a key; otherwise a
	 * hold that later sends wait behind until `end()`.
	 */
	public beginEstimate(scope: SequenceScope, keys: ReadonlySet<SequenceKey>): { end(): void } | undefined {
		if (this.isBlocked(scope, keys)) return undefined
		const holder = this.hold(scope, keys, { estimate: true, external: false })
		return {
			end: () => {
				holder.released = true
			},
		}
	}

	/** The receipt of `txHash` left Pending. */
	public settled(txHash: string): void {
		this.settledAt.set(txHash.toLowerCase(), this.deps.now())
	}

	/** Counts the scope's sends that reached the node; a build from before a bump may be stale. */
	public epoch(scope: SequenceScope): number {
		return this.epochs.get(scopeId(scope)) ?? 0
	}

	/**
	 * A send this sequencer did not order reached the node (a dApp tx): it holds every ticket that
	 * shares a key until its receipt settles, as a ticketed send does, even if its record never lands.
	 */
	public externalSent(scope: SequenceScope, txHash: string, keys: ReadonlySet<SequenceKey>): void {
		const holder = this.hold(scope, keys, { estimate: false, external: true })
		holder.sent = { hash: txHash.toLowerCase(), at: this.deps.now() }
		holder.released = true
		this.bumpEpoch(scope)
	}

	private bumpEpoch(scope: SequenceScope): void {
		const id = scopeId(scope)
		this.epochs.set(id, (this.epochs.get(id) ?? 0) + 1)
	}

	private hold(
		scope: SequenceScope,
		keys: ReadonlySet<SequenceKey>,
		kind: { estimate: boolean; external: boolean },
		deadline?: number,
	): Holder {
		const now = this.deps.now()
		this.prune(scopeId(scope), now)
		const limit = Math.min(deadline ?? Number.POSITIVE_INFINITY, now + MAX_WAIT_MS)
		const holder: Holder = { seq: this.nextSeq++, ...kind, deadline: limit, scope: scopeId(scope), keys, released: false }
		this.holders.push(holder)
		return holder
	}

	private async waitTurn(scope: SequenceScope, self: Holder, signal: AbortSignal): Promise<"turn" | "aborted" | "expired"> {
		for (;;) {
			if (signal.aborted) return "aborted"
			if (this.deps.now() >= self.deadline) return "expired"
			if (!this.blocked(scope, self.keys, self)) return "turn"
			await this.deps.sleep(POLL_MS, signal)
		}
	}

	private blocked(scope: SequenceScope, keys: ReadonlySet<SequenceKey>, self: Holder | undefined): boolean {
		if (keys.size === 0) return false
		const id = scopeId(scope)
		const now = this.deps.now()
		this.prune(id, now)
		const ticketed = new Set<string>()
		for (const h of this.holders) {
			if (h.scope !== id || h === self) continue
			if (h.sent) ticketed.add(h.sent.hash)
			if (!h.external && (self ? h.seq > self.seq : h.estimate)) continue
			if (keysIntersect(h.keys, keys)) return true
		}
		return this.deps.pendingTxs(scope.account).some(
			(tx) =>
				tx.chainId === scope.chainId &&
				!ticketed.has(tx.hash.toLowerCase()) &&
				// A row from the future (a clock set back) holds nothing rather than for ever.
				tx.createdAt <= now &&
				now - tx.createdAt < SUBMITTED_HOLD_MS &&
				keysIntersect(recordedTxKeys(tx), keys),
		)
	}

	private prune(id: string, now: number): void {
		for (let i = this.holders.length - 1; i >= 0; i--) {
			const h = this.holders[i]
			if (h.scope === id && !this.holds(h, now)) this.holders.splice(i, 1)
		}
		for (const [hash, at] of this.settledAt) {
			if (now - at >= SUBMITTED_HOLD_MS) this.settledAt.delete(hash)
		}
	}

	private holds(h: Holder, now: number): boolean {
		if (!h.released) return true
		if (!h.sent || now - h.sent.at >= SUBMITTED_HOLD_MS) return false
		return !this.settledAt.has(h.sent.hash)
	}
}
