/**
 * Transfer estimate-reuse cache — the one-shot "estimate on the Send
 * popup, reuse the built TxRequest on Confirm" subsystem.
 *
 * The validation ladder in `tryConsume` is the contract: ANY drift between
 * estimate time and confirm time (inputs, endpoint, chain identity, sponsor
 * row, base fee, pending set, TTL) rejects
 * reuse and the caller falls back to a full rebuild. A profile other than
 * the executing fence's is not drift but a session that ended: it throws,
 * so no rebuild ever runs under whichever profile is active instead.
 * Rejection order and the byte-stable fingerprint formats are pinned by the
 * colocated tests — both are load-bearing (entries store fingerprints
 * computed at estimate time and compare against freshly-derived ones).
 *
 * Dependencies are injected as lazy lookups so the rejection ladder
 * keeps its laziness: branches that reject early never touch the later
 * dependencies (node lookup only after endpoint checks pass, etc.).
 */

import { GasFees } from "@aztec-labs/stdlib/gas"
import { type MinFeeNode, predictedWorstMinFees } from "@nulo/aztec-runtime/fee-juice"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import type { Fpc } from "@/wallet/services/fpc/fpc"
import type { FpcInfo } from "@/wallet/services/fpc/spec"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { TransferType } from "@/wallet/services/transaction/spec"
import type { Network } from "@/wallet/services/network/service"
import { findPrimaryEndpoint } from "@/wallet/services/network/spec"
import {
	type ChainIdentity,
	chainIdentityDrift,
	ESTIMATE_REUSE_TTL_MS,
	fingerprintBaseFee,
	fpcIdentityDrift,
	pendingHashesChanged,
	primaryEndpointMoved,
	type ReuseEntryBase,
	reuseFeeMultiplier,
	SingleShotTtlCache,
} from "./estimate-reuse-shared"
import type { TransferRequest } from "./operation-planner"
import type { FeeSettings } from "./spec"

/** Stable fingerprint for fee settings. Explicit per-variant — the
 *  previous JSON.stringify-with-key-array form silently dropped nested
 *  paymentMethod fields (the keys array is read as a recursive filter,
 *  so nested keys not in `Object.keys(fs)` got stripped). That made
 *  `{kind: "fj"}` and `{kind: "fpc", fpcId}` collide and could allow
 *  reuse to serve a TxRequest built for a different payment method. */
export function fingerprintFeeSettings(fs: FeeSettings): string {
	const pm = fs.paymentMethod
	let pmHash: string
	switch (pm.kind) {
		case "fj":
			pmHash = "fj"
			break
		case "fjwc":
			pmHash = `fjwc:${pm.claimAmount}:${pm.claimSecret}:${pm.messageLeafIndex}`
			break
		case "fpc":
			pmHash = `fpc:${pm.fpcId}`
			break
		case "embedded":
			pmHash = "embedded"
			break
	}
	return `${pmHash}|${fs.priorityLevel ?? "default"}`
}

/** Snapshot of the SW state at estimate time. Used by `executeTransfer` to
 *  validate that nothing relevant has drifted between estimate and confirm
 *  before reusing the prebuilt TxRequest. Each field is something the
 *  rebuilt request would have differed on. */
export type TransferEstimateReuseEntry = ReuseEntryBase & {
	/** Inputs identifying the transfer (rebuilt for cache-hit verification). */
	readonly networkId: string
	readonly accountAddress: string
	readonly tokenId: number
	readonly transferType: TransferType
	readonly recipientAddress: string
	readonly amount: bigint
	readonly feeSettingsHash: string
	/** The account's send epoch before the build (`SendSequencer.epoch`). */
	readonly sequenceEpoch: number | undefined
	/** Inputs for the activity-feed record. We persist a transfer-only
	 *  call shape (no FPC fee payload) so the card title stays the token
	 *  symbol regardless of payment method. */
	readonly token: { contract: string; name: string; symbol: string; decimals: number }
	readonly fnName: string
	readonly args: readonly unknown[]
}

/** Lazy dependency lookups — injected so the rejection ladder's laziness
 *  survives extraction (early rejects never touch later deps). */
export interface TransferEstimateReuseDeps {
	getNetwork(networkId: string): Promise<Network>
	getNode(chainId: number): Promise<MinFeeNode>
	/** Asserts the live chain against the network row and returns its raw pair. */
	getLiveChainIdentity(network: Network): Promise<ChainIdentity>
	getFpcInfo(fpcId: string): Promise<FpcInfo>
	getPendingForAccount(account: string): { hash: string }[]
	sequenceEpoch(chainId: number, account: string): number
	logDebug(msg: string): void
}

export class TransferEstimateReuse {
	private readonly cache = new SingleShotTtlCache<TransferEstimateReuseEntry>(ESTIMATE_REUSE_TTL_MS)

	public constructor(private readonly deps: TransferEstimateReuseDeps) {}

	/** Store an entry under a fresh id (the store sweeps expired entries so the
	 *  map doesn't grow when the popup re-estimates without ever consuming). */
	public stash(estimateId: string, entry: TransferEstimateReuseEntry): void {
		this.cache.stash(estimateId, entry)
	}

	/** Drop a stashed entry (cancelled estimate, rejected interaction).
	 *  Idempotent; unknown ids are a no-op. */
	public evict(estimateId: string): void {
		this.cache.evict(estimateId)
	}

	/** Pop a cached estimate if (a) the id exists, (b) inputs match
	 *  byte-for-byte, (c) the SW's current view of primary endpoint, chain
	 *  identity, sponsor row and base fee matches the snapshot, and (d) the
	 *  entry is fresh (TTL).
	 *  Any mismatch ⇒ delete + return undefined; caller falls back to a
	 *  full rebuild — except an entry stashed under another profile than
	 *  `fence`'s, which throws {@link SessionEndedError}. Single-shot: the
	 *  entry is consumed on first lookup. `fpc` is the row the send was
	 *  ordered against: given, the entry must have been built with exactly it. */
	public async tryConsume(
		estimateId: string,
		inputs: TransferRequest,
		fence: ExecutionFence,
		fpc?: Fpc,
	): Promise<TransferEstimateReuseEntry | undefined> {
		const entry = this.cache.consume(estimateId) // single-shot
		if (!entry) return undefined

		// TTL gate
		if (Date.now() - entry.builtAt > ESTIMATE_REUSE_TTL_MS) {
			return this.reject(estimateId, "stale (TTL)")
		}

		// Input byte-for-byte match
		if (
			entry.networkId !== inputs.networkId ||
			entry.accountAddress !== inputs.accountAddress ||
			entry.tokenId !== inputs.tokenId ||
			entry.transferType !== inputs.transferType ||
			entry.recipientAddress !== inputs.recipientAddress ||
			entry.amount !== inputs.amount ||
			entry.feeSettingsHash !== fingerprintFeeSettings(inputs.feeSettings)
		) {
			return this.reject(estimateId, "input drift")
		}

		if (entry.profileId !== fence.profileId) throw new SessionEndedError()

		// Endpoint identity: the primary can change at runtime.
		const network = await this.deps.getNetwork(inputs.networkId)
		const primary = findPrimaryEndpoint(network)
		if (!primary) {
			return this.reject(estimateId, "no primary endpoint")
		}
		if (primaryEndpointMoved(primary, entry)) {
			return this.reject(estimateId, "primary endpoint changed")
		}

		const chainDrift = await chainIdentityDrift(entry.chainIdentity, () => this.deps.getLiveChainIdentity(network))
		if (chainDrift) return this.reject(estimateId, chainDrift)
		const fpcDrift = await fpcIdentityDrift(inputs.feeSettings.paymentMethod, entry.fpcIdentity, async (id) =>
			fpc ? fpc.infoData : this.deps.getFpcInfo(id),
		)
		if (fpcDrift) return this.reject(estimateId, fpcDrift)

		const feeDrift = await this.baseFeeDrift(network, inputs, entry)
		if (feeDrift) return this.reject(estimateId, feeDrift)

		// Pending-tx drift. New same-account pending txs since estimate
		// can consume notes the cached private-transfer TxRequest selected.
		// Rebuild rather than risk a note-exhaustion failure mid-flight. PXE rebuild
		// detection stays deferred; the conservative TTL bounds that risk.
		const currentHashes = this.deps.getPendingForAccount(inputs.accountAddress).map((tx) => tx.hash)
		if (pendingHashesChanged(currentHashes, entry.pendingHashes)) {
			return this.reject(estimateId, "pending tx set changed")
		}

		// A send of the account that reached the node after the build may hold this request's sequence
		// index or notes even when it has already left the pending set.
		if (entry.sequenceEpoch !== this.deps.sequenceEpoch(network.chainId, inputs.accountAddress)) {
			return this.reject(estimateId, "a send reached the node since the estimate")
		}

		return entry
	}

	/** Compares the entry's fingerprint (derived from the txRequest's actual `maxFeesPerGas`) against
	 *  `predictedWorstMinFees * multiplier`, which is what a fresh build would finalize (same basis,
	 *  same `GasFees.mul` as `finalizeGasLimits`). A read that fails is a miss: unverifiable, not reused. */
	private async baseFeeDrift(network: Network, inputs: TransferRequest, entry: TransferEstimateReuseEntry): Promise<string | undefined> {
		const node = await this.deps.getNode(network.chainId)
		try {
			const basis = await predictedWorstMinFees(node)
			const multiplier = reuseFeeMultiplier(inputs.feeSettings.priorityLevel)
			// Re-wrap before multiplying: the basis components may arrive as a bare
			// `{feePerDaGas, feePerL2Gas}` from a minimal node, and the fingerprint
			// must reproduce the exact `GasFees.mul` product the build finalized.
			const expectedFingerprint = fingerprintBaseFee(new GasFees(basis.feePerDaGas, basis.feePerL2Gas).mul(multiplier))
			return expectedFingerprint === entry.baseFeeFingerprint ? undefined : "base fee changed"
		} catch {
			// A fixed category: the node's message never reaches the log.
			return "base fee fetch failed"
		}
	}

	private reject(estimateId: string, reason: string): undefined {
		this.deps.logDebug(`tryConsumeTransferEstimate ${estimateId}: ${reason}`)
		return undefined
	}
}
