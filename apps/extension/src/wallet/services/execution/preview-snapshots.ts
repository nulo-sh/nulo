/**
 * SW-owned baseline of what the approval card showed for one operation of one
 * dApp interaction: the private authorizations discovery found while
 * estimating or previewing it. Confirm compares what it would sign against
 * this baseline, so a rebuild can never add a witness the user never saw.
 *
 * Keyed by the preview id the popup hands back; identity is the
 * `(interactionId, index)` pair AND the operation's input fingerprint — a
 * snapshot minted for another interaction is refused even when its
 * fingerprint matches. Never consumed by the estimate-reuse cache: that cache
 * pops its entry before a miss, which is why it cannot be the baseline.
 */

import type { DiscoveredAuthwit } from "@nulo/wallet-bridge"
import { INTERACTION_TIMEOUT_MS } from "@/wallet/services/dapp-interaction/spec"
import { SingleShotTtlCache } from "./estimate-reuse-shared"

/** An unclaimed snapshot lives as long as its window can still approve: the window's clock starts
 *  at its opening, before any estimate lands. It holds hashes and the rows a card showed, never a
 *  signed request, so the reuse caches' shorter bound on signed requests does not apply. */
export const PREVIEW_SNAPSHOT_TTL_MS = INTERACTION_TIMEOUT_MS

export type PreviewIdentity = {
	readonly interactionId: string
	readonly index: number
	/** Null when the operation is not fingerprintable — the pair alone binds. */
	readonly fingerprint: string | null
}

export type PreviewSnapshot = PreviewIdentity & {
	readonly discoveredHashes: readonly string[]
	/** The rows the card listed for those hashes, so a later window can show the same disclosure. */
	readonly discoveredAuthwits?: readonly DiscoveredAuthwit[]
	readonly builtAt: number
}

export type PreviewLookup = { kind: "found"; snapshot: PreviewSnapshot } | { kind: "missing" } | { kind: "foreign" }

export class PreviewSnapshots {
	private readonly cache = new SingleShotTtlCache<PreviewSnapshot>(PREVIEW_SNAPSHOT_TTL_MS)
	/** Snapshots an accepted approval owns until its execution ends: no TTL and no evict reach them. */
	private readonly claimed = new Map<string, PreviewSnapshot>()

	public stash(previewId: string, snapshot: Omit<PreviewSnapshot, "builtAt">): void {
		this.cache.stash(previewId, { ...snapshot, builtAt: Date.now() })
	}

	/** Idempotent; unknown ids are a no-op. Reaches only unclaimed snapshots. */
	public evict(previewId: string): void {
		this.cache.evict(previewId)
	}

	/**
	 * Move the live snapshots `previewIds` name into the claimed set. The returned release drops
	 * exactly the snapshots this claim moved, once; `take` still checks their identity at the turn.
	 */
	public claim(previewIds: readonly (string | undefined)[]): () => void {
		const moved: Array<[string, PreviewSnapshot]> = []
		for (const id of previewIds) {
			if (!id || this.claimed.has(id)) continue
			const snapshot = this.cache.consume(id)
			if (!snapshot || Date.now() - snapshot.builtAt > PREVIEW_SNAPSHOT_TTL_MS) continue
			this.claimed.set(id, snapshot)
			moved.push([id, snapshot])
		}
		return () => {
			for (const [id, snapshot] of moved.splice(0)) {
				if (this.claimed.get(id) === snapshot) this.claimed.delete(id)
			}
		}
	}

	/**
	 * Pop the snapshot for `previewId` (single-shot: confirm validates once).
	 * `foreign` when it exists but names another `(interactionId, index)` or
	 * fingerprint — the caller aborts rather than falling through as if no
	 * estimate had run.
	 */
	public take(previewId: string | undefined, identity: PreviewIdentity): PreviewLookup {
		if (!previewId) return { kind: "missing" }
		const claimed = this.claimed.get(previewId)
		this.claimed.delete(previewId)
		const snapshot = claimed ?? this.cache.consume(previewId)
		if (!snapshot || (!claimed && Date.now() - snapshot.builtAt > PREVIEW_SNAPSHOT_TTL_MS)) return { kind: "missing" }
		const fingerprintMatches =
			snapshot.fingerprint === null || identity.fingerprint === null || snapshot.fingerprint === identity.fingerprint
		if (snapshot.interactionId !== identity.interactionId || snapshot.index !== identity.index || !fingerprintMatches) {
			return { kind: "foreign" }
		}
		return { kind: "found", snapshot }
	}
}

export const AUTHWITS_CHANGED_MESSAGE = "Authorizations changed since preview — re-open the request"
export const ESTIMATE_INCOMPLETE_MESSAGE = "Fee estimate did not complete — retry the estimate"
export const PREVIEW_FOREIGN_MESSAGE = "Estimate does not belong to this request — re-open the request"

/**
 * Enforce recomputed ⊆ snapshot. No snapshot: pass only when confirm found
 * nothing to sign (Confirm is reachable after a failed estimate, so the
 * message tells the user to retry it, not that something changed).
 */
export function assertWithinPreview(lookup: PreviewLookup, recomputedHashes: readonly string[]): void {
	if (lookup.kind === "foreign") throw new Error(PREVIEW_FOREIGN_MESSAGE)
	if (lookup.kind === "missing") {
		if (recomputedHashes.length) throw new Error(ESTIMATE_INCOMPLETE_MESSAGE)
		return
	}
	const allowed = new Set(lookup.snapshot.discoveredHashes)
	for (const hash of recomputedHashes) {
		if (!allowed.has(hash)) throw new Error(AUTHWITS_CHANGED_MESSAGE)
	}
}
