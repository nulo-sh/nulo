// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `DappSendEstimation` — a dApp send's fee estimate and authorization preview, and the only writer
 * of what they leave for its confirm: the reuse entry and the preview snapshot. Its deps name no
 * lane, journal, coordinator or recorder, so it takes no slot, writes no record, proves nothing and
 * sends nothing.
 *
 * The confirm (`DappSendExecutor`) consumes both, and asks this class for what it must build exactly
 * as the estimate or the preview did: the reuse snapshot, the re-stash after a fee re-ask, and the
 * NO_FROM request and its discovery.
 */

import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { collectOffchainEffects } from "@aztec-labs/stdlib/tx"
import { liveChainInfo } from "@nulo/aztec-runtime/utils"
import { feeDisplay } from "@/utils/fee-estimation"
import { findPrimaryEndpoint } from "@/wallet/services/network/spec"
import type { Network } from "@/wallet/services/network/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { WrappedTask } from "@/wallet/services/task/service"
import type { ChainTipGate } from "./chain-tip-gate"
import { carriedHashes, decodeAuthwitEffects, type DecodedAuthwits } from "./decode-authwit-effects"
import { listedKey } from "./discovered-authwit"
import type { DiscoveryAwareEstimator, DiscoveryProbe } from "./discovery-aware-estimator"
import { CollectingDiscoveryProbe } from "./discovery-probe"
import { builtCapOf } from "./estimate-reuse-shared"
import { applyEmbeddedFpcGasCap } from "./fee/embedded-fpc-cap"
import { type FeeEstimate, type OnBuilt, suggestGasLimits } from "./fee/fee-strategy"
import type { OperationEstimateReuse, OperationEstimateReuseEntry } from "./operation-estimate-reuse"
import { fingerprintNoFromInputs, fingerprintOperation, type OperationFingerprintInput } from "./operation-fingerprint"
import { gasFeeOptionsOf, type OperationPlanner } from "./operation-planner"
import type { PreviewSnapshots } from "./preview-snapshots"
import { throwIfAborted } from "./rpc-cancel"
import type { SharedSendDeps } from "./shared-send-deps"
import type {
	Action,
	AztecSendTxOperation,
	DiscoveredAuthwit,
	FeeOptions,
	FeeSettings,
	Operation,
	OperationAuthwitPreview,
	PreviewContext,
	SendTransactionOperation,
	TransferFeeEstimate,
} from "./spec"
import { ownFeeJuiceShortfall, probeAppPayerFunding, probeSponsorFunding } from "./sponsor-funding"
import { getEstimatedFee, getGasDetails, priorityFeeOf } from "./tx-fee-details"
import type { TxRequestBuilder } from "./tx-request-builder"
import { detectEmbeddedFeePayment } from "./utils/fee-detection"

export interface DappSendEstimationDeps
	extends Pick<
		SharedSendDeps,
		| "getActiveProfile"
		| "captureExecutionFence"
		| "getNetwork"
		| "getPendingForAccount"
		| "readPublicStorageOnce"
		| "peekPublicFeeJuice"
		| "rereadPublicFeeJuice"
	> {
	planner: Pick<OperationPlanner, "processAztecJsPayload">
	txBuilder: Pick<TxRequestBuilder, "buildNoFrom">
	/** Discover-then-estimate, the only route to the folded pipeline, whose first run is stubbed. */
	estimateWithDiscovery: Pick<DiscoveryAwareEstimator, "estimate">
	/** The validated pipeline (the service's strategy map). An `observer` reads an app-paid send's
	 *  one validated run; it is never the fold's probe, so it cannot make a run stubbed. */
	buildAndEstimateValidated(
		inputOp: { networkId: string; accountAddress: string; actions: Action[]; fee?: FeeOptions },
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		onBuilt?: OnBuilt,
		observer?: DiscoveryProbe,
	): Promise<FeeEstimate>
	/** The account's send epoch (`SendSequencer.epoch`). */
	sequenceEpoch(chainId: number, account: string): number
	chainTip: Pick<ChainTipGate, "unconfirmed">
	operationEstimateReuse: Pick<OperationEstimateReuse, "stash">
	previewSnapshots: Pick<PreviewSnapshots, "stash">
	logDebug(msg: string, ...rest: unknown[]): void
}

/** What a build's reuse entry is bound to, read before the build. */
export type ReuseSnapshot = { sequenceEpoch: number; pendingHashes: readonly string[]; lagging: boolean }

/** What a reuse entry keeps of a build. */
type StashableBuild = Pick<
	FeeEstimate,
	| "network"
	| "txRequest"
	| "chainIdentity"
	| "fpcIdentity"
	| "initializesAccount"
	| "feePaymentMethod"
	| "txCalls"
	| "pendingPublicAuthwits"
> & { nonce: { toString(): string } }

export class DappSendEstimation {
	public constructor(private readonly deps: DappSendEstimationDeps) {}

	/** `preview` names the popup interaction this estimate belongs to; when set,
	 *  the discovered authorizations are snapshotted under the returned
	 *  `previewId` so the confirm of THAT operation can be held to them. */
	public async estimateOperationFee(
		operation: Operation,
		feeSettings: FeeSettings,
		signal?: AbortSignal,
		preview?: PreviewContext,
	): Promise<TransferFeeEstimate> {
		if (operation.kind !== "send_transaction" && operation.kind !== "aztec_sendTx") {
			throw new Error("Only send_transaction and aztec_sendTx operations support fee estimation")
		}
		// Stage-boundary cancellation — see TransferExecutor.estimateFee.
		throwIfAborted(signal)
		const fence = await this.deps.captureExecutionFence()

		let actions: Action[]
		let detectedFee: FeeOptions | undefined
		if (operation.kind === "aztec_sendTx") {
			const { actions: processedActions, feeOptions: fee } = await this.deps.planner.processAztecJsPayload(
				(operation as AztecSendTxOperation).exec,
				(operation as AztecSendTxOperation).opts ?? {},
			)
			actions = [...processedActions]
			detectedFee = fee
		} else {
			actions = [...(operation as SendTransactionOperation).actions]
		}
		// Reuse fingerprints bind the POST-PLANNER, PRE-DISCOVERY action set —
		// the consume side re-derives the same normalization point.
		const preDiscoveryActions = [...actions]
		const { sequenceEpoch, pendingHashes, lagging } = await this.reuseSnapshot(operation.networkId, operation.accountAddress)

		// Discover-then-estimate via the decorator (the single owner of that
		// choreography for dApp sends; stage-boundary cancellation preserved
		// inside it).
		throwIfAborted(signal)
		const { built, discovered } = await this.buildForEstimate(operation, actions, detectedFee, feeSettings, fence, signal)
		const { txRequest } = built
		throwIfAborted(signal)
		const log = (msg: string, data: object) => this.deps.logDebug(msg, data)
		const sponsorFunding = await probeSponsorFunding(built, this.deps.readPublicStorageOnce, log)
		const appPayerFunding = await probeAppPayerFunding(built, this.deps.readPublicStorageOnce, log)
		const feeJuiceShortfall = await ownFeeJuiceShortfall(built, this.deps, log)
		throwIfAborted(signal)

		const identity = fingerprintInputFor(operation, feeSettings, detectedFee, preDiscoveryActions)
		const discoveredHashes = discovered.map(listedKey)
		const estimateId = lagging
			? undefined
			: await this.stashOperationEstimate(operation, identity, detectedFee, built, discoveredHashes, { sequenceEpoch, pendingHashes })
		// `send_transaction`'s confirm skips discovery, so listing what THIS estimate
		// found would show authorizations confirm never adds.
		const bound = operation.kind === "aztec_sendTx"
		const previewId =
			bound && preview
				? this.writePreview(preview, fingerprintOperation(identity), discoveredHashes, estimateId, discovered)
				: undefined

		const maxFeeRaw = BigInt(getEstimatedFee(txRequest))
		const priorityFee = priorityFeeOf(txRequest)
		return {
			maxFee: maxFeeRaw.toString(),
			...(feeDisplay(priorityFee, undefined).amount !== "0" ? { priorityFee: priorityFee.toString() } : {}),
			gasDetails: getGasDetails(txRequest),
			estimateId,
			previewId,
			...(bound ? { discoveredAuthwits: discovered } : {}),
			...(sponsorFunding ? { sponsorFunding } : {}),
			...(appPayerFunding ? { appPayerFunding } : {}),
			...(feeJuiceShortfall ? { feeJuiceShortfall } : {}),
		}
	}

	/** Read before a build: a send that reaches the node, or settles, during it may hold this build's
	 *  notes. A settled predecessor's block the node lacks changes neither the epoch nor the pending
	 *  set once it lands, so a build simulated while it `lagging` must not be reused. */
	public async reuseSnapshot(networkId: string, account: string): Promise<ReuseSnapshot> {
		const { chainId } = await this.deps.getNetwork(networkId)
		return {
			sequenceEpoch: this.deps.sequenceEpoch(chainId, account),
			pendingHashes: this.deps.getPendingForAccount(account).map((tx) => tx.hash),
			lagging: this.deps.chainTip.unconfirmed({ chainId, account }, undefined, networkId),
		}
	}

	/** An embedded fee payment skips discovery, as its confirm does: the app's own fee calls conflict
	 *  with the discovery simulation's dummy fee method. Its validated run lists each authorization
	 *  whose witness the request carries, the account's own included. */
	private async buildForEstimate(
		operation: Operation,
		actions: Action[],
		detectedFee: FeeOptions | undefined,
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		signal?: AbortSignal,
	): Promise<{ built: FeeEstimate; discovered: readonly DiscoveredAuthwit[] }> {
		const fee = detectedFee ?? (operation as SendTransactionOperation).fee
		if (!fee?.embeddedFeePayment) {
			return this.deps.estimateWithDiscovery.estimate(operation, actions, detectedFee, feeSettings, fence, undefined, signal)
		}
		const op = { ...(operation as SendTransactionOperation), actions: [...actions], fee }
		const probe = new CollectingDiscoveryProbe()
		const built = await this.deps.buildAndEstimateValidated(op, feeSettings, fence, undefined, signal, undefined, probe)
		return { built, discovered: attachedOf(probe, built) }
	}

	/**
	 * Discover, without signing, the private authorizations a NO_FROM
	 * (`default_entrypoint`) operation would need — the confirm path signs at
	 * send and has no estimate, so this is the only preview it gets. Built from
	 * the same canonical inputs and pre-discovery preparation confirm uses.
	 */
	public async previewOperationAuthwits(op: Operation, preview: PreviewContext, signal?: AbortSignal): Promise<OperationAuthwitPreview> {
		if (op.kind !== "aztec_sendTx" || op.executionMode !== "default_entrypoint") {
			throw new Error("Only default_entrypoint aztec_sendTx operations support an authorization preview")
		}
		throwIfAborted(signal)
		const fence = await this.deps.captureExecutionFence()
		const prepared = await this.prepareNoFrom(op, fence)
		throwIfAborted(signal)
		const records = listedRecords(await this.discoverNoFromAuthwits(prepared))
		throwIfAborted(signal)
		const previewId = this.writePreview(preview, noFromFingerprint(op), records.map(listedKey), undefined)
		return { previewId, discoveredAuthwits: records }
	}

	private writePreview(
		preview: PreviewContext,
		fingerprint: string | null,
		discoveredHashes: readonly string[],
		estimateId: string | undefined,
		discoveredAuthwits?: readonly DiscoveredAuthwit[],
	): string {
		const previewId = estimateId ?? crypto.randomUUID()
		this.deps.previewSnapshots.stash(previewId, { ...preview, fingerprint, discoveredHashes, discoveredAuthwits })
		return previewId
	}

	/** Best-effort reuse stash. Eligibility mirrors the Send-page cache's
	 *  fj/fpc rule, narrowed to standard-mode `aztec_sendTx`:
	 *  `send_transaction`'s confirm path skips authwit discovery today, so
	 *  reusing a discovery-inclusive estimate there would CHANGE its
	 *  behavior — it stays carve-out. Embedded fee payments keep their
	 *  divergent-path exclusion. A non-fingerprintable op (exotic arg
	 *  values) is silently ineligible — the estimate itself still returns. */
	private async stashOperationEstimate(
		operation: Operation,
		identity: OperationFingerprintInput,
		detectedFee: FeeOptions | undefined,
		built: StashableBuild,
		discoveredHashes: readonly string[],
		before: { sequenceEpoch: number; pendingHashes: readonly string[] },
		/** The profile the build answered to; the active one when absent. */
		profileId?: string,
	): Promise<string | undefined> {
		const { feeSettings } = identity
		const kind = feeSettings.paymentMethod.kind
		const eligible =
			operation.kind === "aztec_sendTx" &&
			((operation as AztecSendTxOperation).executionMode ?? "standard") !== "default_entrypoint" &&
			!detectedFee?.embeddedFeePayment &&
			// A dApp-supplied fee cap or priority fee makes the built request's
			// maxFees diverge from the predicted-worst basis the consume ladder
			// re-derives, which carries neither.
			!detectedFee?.maxFeesPerGas &&
			!detectedFee?.maxPriorityFeesPerGas &&
			(kind === "fj" || kind === "fpc")
		if (!eligible) return undefined
		try {
			const fingerprint = fingerprintOperation(identity)
			if (fingerprint === null) return undefined
			const primary = findPrimaryEndpoint(built.network)
			if (!primary) return undefined
			const owner = profileId ?? (await this.deps.getActiveProfile())?.id
			if (!owner) return undefined
			const builtCap = builtCapOf(built.txRequest)
			const estimateId = crypto.randomUUID()
			this.deps.operationEstimateReuse.stash(estimateId, {
				fingerprint,
				accountAddress: operation.accountAddress,
				networkId: operation.networkId,
				feeSettings,
				profileId: owner,
				// The BUILDER's asserted pair, never a refetch — a refetch after
				// an endpoint flip would snapshot a chain this request was not
				// signed under (consume would then compare live-vs-live).
				chainIdentity: built.chainIdentity,
				builtCap,
				primaryEndpointId: primary.id,
				primaryEndpointUrl: primary.rpcUrl,
				sequenceEpoch: before.sequenceEpoch,
				pendingHashes: before.pendingHashes,
				fpcIdentity: built.fpcIdentity,
				txRequest: built.txRequest,
				initializesAccount: built.initializesAccount,
				nonce: built.nonce,
				feePaymentMethod: built.feePaymentMethod,
				txCalls: built.txCalls,
				pendingPublicAuthwits: built.pendingPublicAuthwits,
				discoveredHashes,
				builtAt: Date.now(),
			})
			return estimateId
		} catch (error) {
			// Cache write is best-effort — the estimate result still goes out.
			this.deps.logDebug("estimateOperationFee: cache write skipped", error)
			return undefined
		}
	}

	/** A consumed entry goes back as it was, so its `builtAt` still bounds how long the signed request
	 *  stays in memory; a fresh build is stashed as an estimate's would be. */
	public async restash(
		op: AztecSendTxOperation,
		identity: OperationFingerprintInput,
		built: StashableBuild & { discoveredHashes: readonly string[]; reused?: OperationEstimateReuseEntry },
		before: ReuseSnapshot,
		profileId: string,
	): Promise<string | undefined> {
		if (built.reused) {
			const stashId = crypto.randomUUID()
			this.deps.operationEstimateReuse.stash(stashId, built.reused)
			return stashId
		}
		if (before.lagging) return undefined
		return this.stashOperationEstimate(op, identity, identity.fee, built, built.discoveredHashes, before, profileId)
	}

	/**
	 * The pre-discovery NO_FROM build: the request, its fee options and the
	 * de-duplicated scope sets — shared by the authorization preview and the
	 * confirm so both discover against the same request.
	 */
	public async prepareNoFrom(op: AztecSendTxOperation, fence: ExecutionFence, parentTask?: WrappedTask): Promise<PreparedNoFrom> {
		const { txRequest, node, pxe, account, network, txCalls, txsLimits } = await this.deps.txBuilder.buildNoFrom(op, fence, parentTask)
		this.deps.logDebug(
			`executeNoFromSendTx: buildNoFromTxRequest completed, txCalls=${txCalls.length}, account=${account.address.toString()}`,
		)

		// NO_FROM is enforced to use embedded payment, so `embeddedFeePayment` is
		// set explicitly here (the planner-built path infers it) — that is what
		// gates `applyEmbeddedFpcGasCap`; see the helper's JSDoc for the cap rationale.
		const feeOpts: FeeOptions = {
			embeddedFeePayment: detectEmbeddedFeePayment(op.exec?.feePayer, op.opts.from, op.exec?.calls) ?? "fpc",
			...gasFeeOptionsOf(op.opts.fee?.gasSettings),
		}
		suggestGasLimits(txRequest, feeOpts)
		await applyEmbeddedFpcGasCap(txRequest, feeOpts, node)

		const { dappScopesCount, additionalScopes, scopesWithAccount } = dedupNoFromScopes(op.opts.additionalScopes, account.address)
		// Counts, not the arrays: these are viewing-key scopes — the set of addresses whose
		// private state this dApp can see — and pre-stringifying them would put them beyond
		// the logger's reach.
		this.deps.logDebug(
			`executeNoFromSendTx: dappScopes=${dappScopesCount}, additionalScopes=${additionalScopes.length}, scopesWithAccount=${scopesWithAccount.length}`,
		)
		return { txRequest, node, pxe, account, network, txCalls, txsLimits, feeOpts, additionalScopes, scopesWithAccount }
	}

	/**
	 * Kernelless auth witness discovery for the NO_FROM path: stub the user's account and every
	 * additional scope account so verify_private_authwit doesn't fail on missing witnesses (the stub
	 * accepts any authwit during simulation), then decode each CallAuthorizationRequest the run
	 * emitted: the account's to sign, another scope account's to list or refuse. The discovery
	 * result is ONLY used to read offchain effects — never for proving or gas estimation.
	 * `chainInfo` derives from the LIVE node, rebound to the selected network, before constructing
	 * the authwit message hash.
	 */
	public async discoverNoFromAuthwits(
		d: Pick<PreparedNoFrom, "pxe" | "node" | "network" | "account" | "txRequest" | "additionalScopes" | "scopesWithAccount">,
	): Promise<Pick<DecodedAuthwits, "signable" | "consumed">> {
		this.deps.logDebug(`executeNoFromSendTx: starting kernelless discovery simulation`)
		const discoveryResult = await d.pxe.simulateTx(
			d.txRequest,
			{ simulatePublic: true, skipTxValidation: true, skipFeeEnforcement: true, scopes: d.additionalScopes },
			d.scopesWithAccount.map((scope) => scope.toString()),
		)

		this.deps.logDebug(`executeNoFromSendTx: kernelless discovery completed`)
		const effects = collectOffchainEffects(discoveryResult.privateExecutionResult)
		this.deps.logDebug(`executeNoFromSendTx: offchain effects found: ${effects.length}`)
		if (!effects.length) return { signable: [], consumed: [] }
		const nodeInfo2 = await d.node.getNodeInfo()
		return decodeAuthwitEffects(effects, liveChainInfo(d.network, nodeInfo2), {
			signer: d.account.address,
			scopes: d.scopesWithAccount,
			carried: carriedHashes(d.txRequest),
		})
	}
}

/** What a NO_FROM window lists: the account's requests, then those another account already gave. */
export function listedRecords(decoded: Pick<DecodedAuthwits, "signable" | "consumed">): DiscoveredAuthwit[] {
	return [...decoded.signable.map(({ record }) => record), ...decoded.consumed]
}

/** What an app-paid send lists, and holds its confirm to: the send signs nothing, so each request
 *  whose witness it carries, the account's own named as given by the account. A carried hash is not
 *  a checked signature: only a contract that checks the request makes the validated run check it. */
export function attachedOf(probe: CollectingDiscoveryProbe, built: Pick<FeeEstimate, "account" | "txRequest">): DiscoveredAuthwit[] {
	const carried = carriedHashes(built.txRequest)
	const account = built.account.address.toString()
	return probe.discovered.flatMap((record) => {
		if (record.onBehalfOf !== undefined) return [record]
		return carried.has(record.messageHash) ? [{ ...record, onBehalfOf: account }] : []
	})
}

/** Everything the NO_FROM path holds between its build and its discovery. */
export interface PreparedNoFrom {
	txRequest: FeeEstimate["txRequest"]
	node: FeeEstimate["node"]
	pxe: FeeEstimate["pxe"]
	account: FeeEstimate["account"]
	network: Network
	txCalls: FeeEstimate["txCalls"]
	txsLimits: Awaited<ReturnType<TxRequestBuilder["buildNoFrom"]>>["txsLimits"]
	feeOpts: FeeOptions
	additionalScopes: AztecAddress[]
	scopesWithAccount: AztecAddress[]
}

/** The reuse-fingerprint identity of a standard-mode dApp send: post-planner,
 *  pre-discovery actions with the wallet fee settings. Stash and consume MUST
 *  derive it at this same normalization point. */
export function fingerprintInputFor(
	operation: SendTransactionOperation | AztecSendTxOperation,
	feeSettings: FeeSettings,
	detectedFee: FeeOptions | undefined,
	preDiscoveryActions: readonly Action[],
): OperationFingerprintInput {
	return {
		networkId: operation.networkId,
		accountAddress: operation.accountAddress,
		executionMode: (operation as AztecSendTxOperation).executionMode ?? "standard",
		from: (operation as AztecSendTxOperation).opts?.from?.toString() ?? "",
		actions: preDiscoveryActions,
		fee: detectedFee,
		feeSettings,
	}
}

export function noFromFingerprint(op: AztecSendTxOperation): string | null {
	return fingerprintNoFromInputs({
		networkId: op.networkId,
		accountAddress: op.accountAddress,
		from: op.opts?.from?.toString() ?? "",
		calls: op.exec?.calls ?? [],
		authWitnesses: [...(op.exec?.authWitnesses ?? []), ...(op.opts?.authWitnesses ?? [])],
		capsules: [...(op.exec?.capsules ?? []), ...(op.opts?.capsules ?? [])],
		extraHashedArgs: op.exec?.extraHashedArgs ?? [],
		gasSettings: op.opts?.fee?.gasSettings,
		additionalScopes: op.opts?.additionalScopes ?? [],
	})
}

/** Viewing-key scope sets for the NO_FROM path, de-duped by hex (AztecAddress is a
 *  class — Set de-dups by ref, not value). */
function dedupNoFromScopes(
	rawScopes: unknown,
	accountAddress: AztecAddress,
): { dappScopesCount: number; additionalScopes: AztecAddress[]; scopesWithAccount: AztecAddress[] } {
	const dappScopes: AztecAddress[] = Array.isArray(rawScopes) ? rawScopes : []
	const scopeByHex = new Map<string, AztecAddress>()
	for (const s of dappScopes) scopeByHex.set(s.toString(), s)
	const scopeWithAccountByHex = new Map<string, AztecAddress>()
	scopeWithAccountByHex.set(accountAddress.toString(), accountAddress)
	for (const s of dappScopes) scopeWithAccountByHex.set(s.toString(), s)
	return {
		dappScopesCount: dappScopes.length,
		additionalScopes: [...scopeByHex.values()],
		scopesWithAccount: [...scopeWithAccountByHex.values()],
	}
}
