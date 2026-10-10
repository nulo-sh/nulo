/**
 * What the two estimate-reuse caches (`transfer-estimate-reuse`,
 * `operation-estimate-reuse`) share: the cache mechanics, the snapshot vocabulary
 * and the pure comparisons. Each cache keeps its own validation ladder (order,
 * base-fee handling, and its operation-specific gates are load-bearing and pinned
 * by colocated tests).
 */

import type { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import { PRIORITY_MULTIPLIERS, type PriorityLevel } from "@nulo/wallet-bridge"
import type { FpcIdentitySnapshot, FpcInfo } from "@/wallet/services/fpc/spec"
import type { NetworkEndpoint } from "@/wallet/services/network/spec"
import { DEFAULT_FEE_MULTIPLIER } from "./fee/fee-strategy"
import type { FeeSettings } from "./spec"

// 120 s, owner-set: the retention bound on signed tx requests held in SW memory.
// Staleness itself is guarded by the consume ladder, not this TTL — past ~2 min
// entries mostly miss on base-fee drift anyway, so the shorter window costs
// almost no hit rate.
export const ESTIMATE_REUSE_TTL_MS = 120_000

/** Stable fingerprint for a fee basis so we can compare the snapshot
 *  taken at estimate time against the value at confirm.
 *  FORMAT IS BYTE-STABLE — cached entries depend on it. */
export function fingerprintBaseFee(min: { feePerDaGas: bigint; feePerL2Gas: bigint }): string {
	return `${min.feePerDaGas.toString()}:${min.feePerL2Gas.toString()}`
}

/** The fingerprint of the exact fee `txRequest` was built with, never a refetch: every strategy
 *  commits `maxFeesPerGas` as the node minimum × multiplier, so consume compares the same product. */
export function fingerprintBuiltFee(txRequest: TxExecutionRequest): string {
	const builtFees = txRequest.txContext.gasSettings.maxFeesPerGas
	return fingerprintBaseFee({ feePerDaGas: builtFees.feePerDaGas, feePerL2Gas: builtFees.feePerL2Gas })
}

/** The raw pair a node reports. The network row's stored chainId is an XOR composite — `(1,4)` and
 *  `(2,7)` collide — so a snapshot compares this pair, never the composite. */
export type ChainIdentity = { readonly l1ChainId: number; readonly rollupVersion: number }

/** The snapshot fields both entry types carry: what was true at estimate time, and the build reused on confirm. */
export type ReuseEntryBase = {
	/** Profile id at estimate time; consume refuses any other fence. */
	readonly profileId: string
	/** The pair the build asserted and signed under. A reused request skips that assert, so consume
	 *  re-reads the live pair and compares. */
	readonly chainIdentity: ChainIdentity
	/** The sponsor row the build paid with; set for every `fpc` payment. */
	readonly fpcIdentity?: FpcIdentitySnapshot
	readonly baseFeeFingerprint: string
	readonly primaryEndpointId: string
	readonly primaryEndpointUrl: string
	/** Pending-tx snapshot for the active account. If new pending txs
	 *  appear between estimate and confirm, the reused TxRequest may
	 *  conflict on private notes (private transfers select notes at
	 *  build time; concurrent in-flight txs can consume them). Reject
	 *  reuse in that case. */
	readonly pendingHashes: readonly string[]
	/** Built downstream state — reused on confirm. Live handles excluded. */
	readonly txRequest: TxExecutionRequest
	/** Provenance travels WITH the cached request: the entry retains the
	 *  exact build, so the confirm leg classifies an existing-nullifier
	 *  rejection with the same fidelity as a fresh build. */
	readonly initializesAccount: boolean
	readonly nonce: { toString(): string }
	readonly feePaymentMethod: AccountFeePaymentMethodOptions
	readonly builtAt: number
}

/** True when the live primary endpoint is missing or is not the one the snapshot was built against. */
export function primaryEndpointMoved(
	primary: NetworkEndpoint | undefined,
	snap: Pick<ReuseEntryBase, "primaryEndpointId" | "primaryEndpointUrl">,
): boolean {
	return !primary || primary.id !== snap.primaryEndpointId || primary.rpcUrl !== snap.primaryEndpointUrl
}

/** A fixed category when the live chain is not the pair the request was signed under, or cannot be
 *  read; the read's own message (a node text) never reaches the reason. */
export async function chainIdentityDrift(snapshot: ChainIdentity, readLive: () => Promise<ChainIdentity>): Promise<string | undefined> {
	let live: ChainIdentity
	try {
		live = await readLive()
	} catch {
		return "chain identity drift"
	}
	const same = live.l1ChainId === snapshot.l1ChainId && live.rollupVersion === snapshot.rollupVersion
	return same ? undefined : "chain identity drift (exact pair mismatch)"
}

/** A fixed category when an `fpc` payment's sponsor row is not the one the request was built
 *  against. An `fpc` entry without a snapshot misses: nothing would bind its signed fee payload. */
export async function fpcIdentityDrift(
	paymentMethod: FeeSettings["paymentMethod"],
	snapshot: FpcIdentitySnapshot | undefined,
	getFpcInfo: (fpcId: string) => Promise<FpcInfo>,
): Promise<string | undefined> {
	if (paymentMethod.kind !== "fpc") return undefined
	if (!snapshot) return "fpc identity missing"
	let fresh: FpcInfo
	try {
		fresh = await getFpcInfo(paymentMethod.fpcId)
	} catch {
		return "fpc row unavailable"
	}
	const drifted =
		fresh.id !== snapshot.id ||
		fresh.type !== snapshot.type ||
		fresh.address !== snapshot.address ||
		fresh.chainId !== snapshot.chainId ||
		(fresh.isProtocol ?? false) !== snapshot.isProtocol
	return drifted ? "fpc identity drift" : undefined
}

/** The fee multiplier for a known or absent priority. The popup RPC boundary refuses an unknown
 *  priority; the lookup stays unchecked here, so one that bypassed it still fails, never a default. */
export function reuseFeeMultiplier(priority: PriorityLevel | undefined): number {
	return priority ? PRIORITY_MULTIPLIERS[priority] : DEFAULT_FEE_MULTIPLIER
}

/**
 * A single-shot, TTL-bounded id→entry store. `stash` records an entry and
 * opportunistically sweeps expired ones (so the map can't grow unboundedly
 * when the popup re-estimates without consuming), plus a per-entry timer that
 * physically drops the entry AT the TTL. `consume` pops an entry on first read
 * (single-shot). Staleness is by `builtAt`; the caller still runs its own TTL
 * gate in the consume ladder (with its own diagnostics) — this store owns only
 * the background eviction.
 */
export class SingleShotTtlCache<E extends { builtAt: number }> {
	private readonly cache = new Map<string, E>()

	public constructor(private readonly ttlMs: number) {}

	/** Store an entry under a fresh id, then sweep expired entries. */
	public stash(id: string, entry: E): void {
		this.cache.set(id, entry)
		this.evictStale()
		// Per-entry timer so the entry is physically dropped AT the TTL
		// (idempotent vs consume/evict; dies with the SW, as does the map).
		setTimeout(() => this.cache.delete(id), this.ttlMs + 1)
	}

	/** Pop an entry, removing it (single-shot). Unknown id ⇒ undefined. */
	public consume(id: string): E | undefined {
		const entry = this.cache.get(id)
		this.cache.delete(id)
		return entry
	}

	/** Drop a stashed entry. Idempotent; unknown ids are a no-op. */
	public evict(id: string): void {
		this.cache.delete(id)
	}

	private evictStale(): void {
		const now = Date.now()
		for (const [id, entry] of this.cache) {
			if (now - entry.builtAt > this.ttlMs) {
				this.cache.delete(id)
			}
		}
	}
}

/**
 * True when the pending-tx-hash set changed between estimate and confirm
 * (order-insensitive set equality). Unifies the two prior implementations
 * (a `Set` size+membership compare and a sorted positional compare), which
 * agree for the unique tx-hash inputs both receive.
 */
export function pendingHashesChanged(current: readonly string[], cached: readonly string[]): boolean {
	const currentSet = new Set(current)
	const cachedSet = new Set(cached)
	return currentSet.size !== cachedSet.size || [...currentSet].some((h) => !cachedSet.has(h))
}
