// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { SimulateTxOpts, ExecuteUtilityOpts, ProfileTxOpts } from "@aztec-labs/pxe/client/bundle"
import type { ContractArtifact, EventSelector, FunctionCall } from "@aztec-labs/stdlib/abi"
import { ContractArtifactSchema } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import {
	CompleteAddress,
	type ContractInstanceWithAddress,
	type PartialAddress,
	ContractInstanceWithAddressSchema,
} from "@aztec-labs/stdlib/contract"
import type { NoteDao } from "@aztec-labs/stdlib/note"
import {
	BlockHeader,
	type TxExecutionRequest,
	TxProfileResult,
	TxProvingResult,
	TxSimulationResult,
	UtilityExecutionResult,
} from "@aztec-labs/stdlib/tx"
import type { PrivateEventFilter } from "@aztec-labs/aztec.js/wallet"
import type { PackedPrivateEvent } from "@aztec-labs/pxe/client/bundle"
import z from "zod"
import type { ILogger } from "@nulo/wallet-core/logger"
import { toBase64 } from "@nulo/wallet-core/utils"
import type { ServiceSpec } from "@nulo/wallet-core/base"
import { type RequestErrorMeta, type ResponseContentLike, ServiceClient, type TerminalRecord } from "@nulo/extension-messaging/offscreen"
import type { NetworkInfo } from "./chain-runtime"
import type { IPXE } from "./ipxe"
import type { Methods, NotesFilter, NoteSchema, PxeEvents } from "./spec"
import type { ProvePhaseEvent } from "./chain-runtime"
import { EventHandler } from "@nulo/wallet-core/utils"
import { PXE_SERVICE_NAME } from "./spec"
import { NoteDaoSchema, PackedPrivateEventSchema } from "./schemas"
import {
	type PublicScanTips,
	type PublicTokenClassStatus,
	type PublicTransferFetchArgs,
	type PublicTransferPage,
	PublicScanTipsSchema,
	PublicTokenClassStatusSchema,
	PublicTransferPageSchema,
} from "./public-events"
import { PXEProxy } from "./proxy"
import { PxeScopeUnregisteredError, PxeStoreKeyMissingError } from "@nulo/extension-messaging/errors"

/**
 * Base PXE service client. Chrome-agnostic: does no offscreen
 * bootstrap — that belongs to the embedder (extension subclass
 * overrides `onReady` to call `ensureOffscreenRunning`).
 *
 * Callers in aztec-runtime should accept this type; callers in the
 * extension should use the concrete `PxeServiceClient` subclass which
 * wires up the Chrome offscreen transport.
 */
/**
 * Per-method timeout overrides for the PXE transport.
 *
 * `proveTx` runs BB.wasm proving, which is uninterruptible and can take
 * many minutes (10+ on slow hardware for circuit-heavy txs). The default
 * 90s ceiling would fire mid-proof on those, surfacing a misleading
 * "timeout" error instead of letting the prove complete.
 *
 * The durable-job `cancelJob` is the user-facing cancel path (lossy: SW journal
 * transitions to `cancelled` immediately; the in-flight offscreen prove
 * keeps running, but the result is silently dropped on arrival). With
 * that in place, the offscreen timeout no longer needs to act as a cancel
 * mechanism — it only needs to be a sanity ceiling for a *stuck* worker.
 *
 * 30 minutes is comfortably above any realistic prove duration while
 * still bounded.
 */
const PROVE_TX_TIMEOUT_MS = 30 * 60_000

/** What the SW-side store-key provider yields: the derived 32-byte key PLUS the
 *  profile row's current incarnation generation, both read under the facade lock
 *  at SEND time — a provision can never pair a fresh key with a stale generation
 *  (or vice versa), which is what lets the offscreen lifecycle fence reject
 *  resurrection attempts. */
export interface StoreKeyProvision {
	key: Uint8Array
	generation: string
}

/**
 * Registers the profile's own accounts among `scopes` in the PXE behind `pxe`. Throws for an
 * address that is not one of the profile's accounts on that chain.
 */
export type ScopeRegistrar = (pxe: IPXE, network: NetworkInfo, scopes: string[]) => Promise<void>

/** Where each scope-taking method carries the scopes it hands the PXE. */
const SCOPES_OF: Partial<Record<keyof Methods, (args: unknown[]) => unknown>> = {
	getNotes: (args) => (args[1] as { scopes?: unknown } | undefined)?.scopes,
	proveTx: (args) => args[2],
	simulateTx: (args) => (args[2] as { scopes?: unknown } | undefined)?.scopes,
	profileTx: (args) => (args[2] as { scopes?: unknown } | undefined)?.scopes,
	executeUtility: (args) => (args[2] as { scopes?: unknown } | undefined)?.scopes,
	getPrivateEvents: (args) => (args[2] as { scopes?: unknown } | undefined)?.scopes,
}

/** A `simulateTx` this client stopped waiting for while the document it was sent to still runs it. */
interface AbandonedSimulation {
	readonly epoch: number
	readonly done: Promise<void>
	readonly end: () => void
	readonly expiry: ReturnType<typeof setTimeout>
}

export class PxeServiceClientBase extends ServiceClient<Methods, PxeEvents> implements ServiceSpec<Methods, PxeEvents> {
	/** Prove-phase events from the offscreen prover, already sender-gated by the
	 *  transport; the payload is still untrusted until the consumer validates it. */
	public readonly onProvePhase = new EventHandler<ProvePhaseEvent>()
	/** SW-side derivation hook for the per-profile store encryption key (see
	 *  `setStoreKeyProvider`). Undefined until the embedder wires it at boot. */
	private storeKeyProvider?: (profileId: string) => Promise<StoreKeyProvision | undefined>
	/** SW-side lookup of the profile row's CURRENT incarnation generation, used to
	 *  stamp `pxeGeneration` onto outgoing ops' NetworkInfo (see `request`). Kept
	 *  separate from the key provider so op capture doesn't pay an HKDF per call. */
	private generationProvider?: (profileId: string) => Promise<string | undefined>
	private scopeRegistrar?: ScopeRegistrar
	private documentEpoch?: () => number
	private abandonedLifetimeMs = 0
	private readonly abandoned = new Map<number, AbandonedSimulation>()
	/** The timeout error this client raised for a `simulateTx`, to its request id. */
	private readonly simulationTimeouts = new WeakMap<object, number>()

	public constructor(logger: ILogger) {
		super(PXE_SERVICE_NAME, logger)
	}

	protected override getRequestTimeoutMs(method: keyof Methods): number {
		// `proveTx` and the profile-destructive clears all DRAIN behind a proof: a delete
		// acquires the profile WRITE barrier, which waits for an in-flight ~30-minute proof
		// on that profile to finish. At the default ~90s these clears timed out behind a
		// legitimate proof, the deletion coordinator rejected, tombstone phase-3 never ran,
		// and the id stayed reserved forever. Give them the same
		// envelope as the proof they wait on.
		if (method === "proveTx" || method === "clearChainState" || method === "clearProfileState") return PROVE_TX_TIMEOUT_MS
		return super.getRequestTimeoutMs(method)
	}

	/**
	 * Register the SW-side store-key derivation hook (typically `derivePxeStoreKey(master,
	 * profileId)` against the in-memory session, paired with the row's `pxeGeneration`, all
	 * under the facade lock). The offscreen holds provisioned keys in memory only, so an
	 * offscreen-document restart drops them; when a request then fails with a
	 * `PxeStoreKeyMissingError`, this client derives + re-provisions + retries ONCE. The
	 * provider returning `undefined` (profile locked / row gone / tombstoned) lets the original
	 * error propagate — a locked or deleted profile cannot open its encrypted PXE store.
	 */
	public setStoreKeyProvider(provider: (profileId: string) => Promise<StoreKeyProvision | undefined>): void {
		this.storeKeyProvider = provider
	}

	/** Register the generation lookup for op capture. Optional: without it, ops go
	 *  out uncaptured and only the provision-time fence applies. */
	public setGenerationProvider(provider: (profileId: string) => Promise<string | undefined>): void {
		this.generationProvider = provider
	}

	/**
	 * Track `simulateTx` requests that time out after their send, until the offscreen document ends
	 * them: the offscreen service has no abort, so a timed-out simulation keeps its place in the
	 * PXE's queue. `epoch` names the current document; each record also ends `lifetimeMs` after it
	 * was made, so none outlives that bound. Without a provider nothing is tracked.
	 */
	public setDocumentEpochProvider(epoch: () => number, lifetimeMs: number): void {
		this.documentEpoch = epoch
		this.abandonedLifetimeMs = lifetimeMs
	}

	/** Pending while the timed-out simulation behind `error` (itself or along its `cause` chain) may
	 *  still run offscreen; undefined when this client tracks no such simulation. */
	public offscreenSettled(error: unknown): Promise<void> | undefined {
		let current: unknown = error
		for (let depth = 0; depth < 8 && typeof current === "object" && current !== null; depth++) {
			const requestId = this.simulationTimeouts.get(current)
			if (requestId !== undefined) return this.abandoned.get(requestId)?.done
			current = (current as { cause?: unknown }).cause
		}
		return undefined
	}

	/** Every simulation sent at or before `epoch` ended with its document. */
	public retireEpochsThrough(epoch: number): void {
		for (const [requestId, record] of this.abandoned) if (record.epoch <= epoch) this.endAbandoned(requestId)
	}

	protected override requestTag(method: string): unknown {
		return method === "simulateTx" ? this.documentEpoch?.() : undefined
	}

	protected override makeTimeoutError(meta: RequestErrorMeta): unknown {
		const error = super.makeTimeoutError(meta)
		if (meta.methodName === "simulateTx" && typeof error === "object" && error !== null) {
			this.simulationTimeouts.set(error, meta.requestId)
		}
		return error
	}

	protected override onTerminal(record: TerminalRecord, tag?: unknown): void {
		super.onTerminal(record)
		// A tag from an older epoch went to a document already retired: its work is gone.
		if (record.status !== "timeout" || record.detail !== "timeout_fired" || tag === undefined || tag !== this.documentEpoch?.()) return
		let end = () => {}
		const done = new Promise<void>((resolve) => {
			end = resolve
		})
		const expiry = setTimeout(() => this.endAbandoned(record.requestId), this.abandonedLifetimeMs)
		this.abandoned.set(record.requestId, { epoch: tag as number, done, end, expiry })
	}

	protected override onUnmatchedResponse(content: ResponseContentLike): void {
		if (this.endAbandoned(content.requestId)) {
			this.logDebug("Late answer to a timed-out simulation")
			return
		}
		super.onUnmatchedResponse(content)
	}

	protected override onLateSendFailure(requestId: number): void {
		this.endAbandoned(requestId)
	}

	private endAbandoned(requestId: number): boolean {
		const record = this.abandoned.get(requestId)
		if (!record) return false
		this.abandoned.delete(requestId)
		clearTimeout(record.expiry)
		record.end()
		return true
	}

	/** Register the hook that loads the profile's accounts into the PXE when an op is refused for
	 *  naming one the PXE holds no keys for; the op is then retried once. */
	public setScopeRegistrar(registrar: ScopeRegistrar): void {
		this.scopeRegistrar = registrar
	}

	protected override async request<T extends keyof Methods>(
		method: T,
		...args: Parameters<Methods[T]>
	): Promise<Awaited<ReturnType<Methods[T]>>> {
		// Capture the incarnation generation ONCE per logical op, before the first
		// send: the missing-key retry below re-sends the SAME args, so the retry
		// REUSES the capture — an op that outlived a delete + same-id re-import
		// carries its original generation and is rejected offscreen-side instead
		// of silently running against the successor's store.
		const netArg = args[0] as (NetworkInfo & { pxeGeneration?: string }) | undefined
		if (netArg && needsGenerationStamp(netArg) && this.generationProvider) {
			const generation = await this.generationProvider(netArg.profileId)
			// A registered provider returning undefined means the profile row is GONE or
			// tombstoned — exactly the deletion window the fence exists for. Failing here
			// beats silently sending the op UNCAPTURED (which would bypass the op-level
			// fence and rely solely on the store-key fail-close).
			if (!generation) {
				throw new Error(`pxe op rejected: profile ${netArg.profileId} has no current incarnation (deleted or tombstoned)`)
			}
			args = [...args] as Parameters<Methods[T]>
			args[0] = { ...netArg, pxeGeneration: generation }
		}
		try {
			return await this.sendRecoveringStoreKey(method, args)
		} catch (err) {
			const scopes = err instanceof PxeScopeUnregisteredError ? this.ownScopes(method, args) : undefined
			if (!scopes || !this.scopeRegistrar) throw err
			// The stamped network: registration and retry both run against the incarnation the op
			// captured, so a delete + same-id re-import in between refuses them offscreen.
			const network = args[0] as NetworkInfo
			await this.scopeRegistrar(this.getPXE(network), network, scopes)
			return this.sendRecoveringStoreKey(method, args)
		}
	}

	/** The scopes the op itself sent, never the offscreen's account of them. */
	private ownScopes(method: keyof Methods, args: unknown[]): string[] | undefined {
		const scopes = SCOPES_OF[method]?.(args)
		if (!Array.isArray(scopes) || scopes.length === 0) return undefined
		return [...new Set(scopes.map((scope) => String(scope)))]
	}

	private async sendRecoveringStoreKey<T extends keyof Methods>(
		method: T,
		args: Parameters<Methods[T]>,
	): Promise<Awaited<ReturnType<Methods[T]>>> {
		try {
			return await super.request(method, ...args)
		} catch (err) {
			// The class, not the message: the service attaches a typed payload only to errors it
			// throws itself, and the one legitimate site runs before any PXE op — so an op-internal
			// error whose text happens to carry the marker (a hostile node can put anything in a
			// message) arrives as a plain Error and can never start a re-provision.
			const profileId = (args[0] as NetworkInfo | undefined)?.profileId
			if (method === "provisionChainStoreKey" || !(err instanceof PxeStoreKeyMissingError) || !profileId || !this.storeKeyProvider) {
				throw err
			}
			// Tail-returned: the recovery helper owns the ENTIRE hardened
			// sequence (readiness → authority → guarded provision → single retry)
			// including the key-zeroizing finally.
			return this.recoverMissingStoreKey(method, args, err, profileId)
		}
	}

	/** Invariant: the recovery sequence is readiness ONCE, then
	 *  authority ONCE, then already-ready sends — no `onReady` (which can
	 *  recreate the offscreen document and reset its lifecycle map) may run
	 *  between the authority read and the wire, or a concurrent delete +
	 *  recreation could let a stale provision land on an empty map. */
	private async recoverMissingStoreKey<T extends keyof Methods>(
		method: T,
		args: Parameters<Methods[T]>,
		originalErr: unknown,
		profileId: string,
	): Promise<Awaited<ReturnType<Methods[T]>>> {
		await this.onReady()
		const provision = await this.storeKeyProvider?.(profileId)
		if (!provision) throw originalErr
		try {
			// Capture-equality guard, POST-STAMP (the capture block above mutated
			// args[0]) and capture-conditional: an UNCAPTURED op keeps the
			// documented provision-then-retry contract, but a captured op whose
			// generation differs from the provider's current row must not
			// side-effect-install a newer key from its own error path — the
			// original error propagates untouched.
			const captured = (args[0] as { pxeGeneration?: string } | undefined)?.pxeGeneration
			if (captured && provision.generation !== captured) throw originalErr
			// Revalidate the incarnation immediately before the wire: `onReady`
			// above can have REPLACED the offscreen document, and a deletion that
			// completed against the OLD document leaves the replacement's
			// lifecycle map empty — this stale provision would install the erased
			// generation as live (ghost profile; a later same-id re-import is
			// then wedged behind the live-under-different-generation rejection).
			// A gone or superseded row aborts with the original error.
			if (this.generationProvider) {
				const liveGeneration = await this.generationProvider(profileId)
				if (liveGeneration !== provision.generation) throw originalErr
			}
			// The base64 wire copy cannot be zeroized (JS strings are
			// immutable); the key bytes below are, in every exit path.
			await this.requestAlreadyReady(
				"provisionChainStoreKey" as T,
				...([profileId, toBase64(provision.key), provision.generation] as unknown as Parameters<Methods[T]>),
			)
			// A provision/retry send failure propagates AS ITSELF (more
			// diagnostic than the original marker error), and the retry runs
			// exactly once — a second missing-key rejection is terminal.
			return await this.requestAlreadyReady(method, ...args)
		} finally {
			provision.key.fill(0)
		}
	}

	public getPXE(network: NetworkInfo): IPXE {
		return new PXEProxy(this, network)
	}

	public async getContractInstance(
		network: NetworkInfo,
		address: AztecAddress,
		opts?: { pxeOnly?: boolean; nodeBestEffort?: boolean },
	): Promise<ContractInstanceWithAddress | undefined> {
		const result = await this.request("getContractInstance", network, address, opts)
		return await ContractInstanceWithAddressSchema.optional().parseAsync(result)
	}

	public async getContractArtifact(network: NetworkInfo, id: Fr, opts?: { pxeOnly?: boolean }): Promise<ContractArtifact | undefined> {
		const result = await this.request("getContractArtifact", network, id, opts)
		return await ContractArtifactSchema.optional().parseAsync(result)
	}

	public async getNoteSchemas(): Promise<Record<string, Record<string, NoteSchema>>> {
		const result = await this.request("getNoteSchemas")
		return (result ?? {}) as Record<string, Record<string, NoteSchema>>
	}

	public async registerAccount(network: NetworkInfo, secretKey: Fr, partialAddress: PartialAddress): Promise<CompleteAddress> {
		const result = await this.request("registerAccount", network, secretKey, partialAddress)
		return await CompleteAddress.schema.parseAsync(result)
	}

	public async registerSender(network: NetworkInfo, address: AztecAddress): Promise<AztecAddress> {
		const result = await this.request("registerSender", network, address)
		return await AztecAddress.schema.parseAsync(result)
	}

	public async getSenders(network: NetworkInfo): Promise<AztecAddress[]> {
		const result = await this.request("getSenders", network)
		return await z.array(AztecAddress.schema).parseAsync(result)
	}

	public async removeSender(network: NetworkInfo, address: AztecAddress): Promise<void> {
		await this.request("removeSender", network, address)
	}

	public async getRegisteredAccounts(network: NetworkInfo): Promise<CompleteAddress[]> {
		const result = await this.request("getRegisteredAccounts", network)
		return await z.array(CompleteAddress.schema).parseAsync(result)
	}

	public async registerContractClass(network: NetworkInfo, artifact: ContractArtifact): Promise<void> {
		await this.request("registerContractClass", network, artifact)
	}

	public async registerContract(
		network: NetworkInfo,
		contract: { instance: ContractInstanceWithAddress; artifact?: ContractArtifact },
	): Promise<void> {
		await this.request("registerContract", network, contract)
	}

	public async getContracts(network: NetworkInfo): Promise<AztecAddress[]> {
		const result = await this.request("getContracts", network)
		return await z.array(AztecAddress.schema).parseAsync(result)
	}

	public async getNotes(network: NetworkInfo, filter: NotesFilter): Promise<NoteDao[]> {
		const result = await this.request("getNotes", network, filter)
		// Schema rehydrates data fields (Fr, AztecAddress, etc.) after JSON round-trip from offscreen,
		// but produces plain objects, not NoteDao class instances. Cast is safe because consumers
		// (NoteService) only access data properties, never class methods like toBuffer/equals.
		return (await z.array(NoteDaoSchema).parseAsync(result)) as unknown as NoteDao[]
	}

	public async proveTx(
		network: NetworkInfo,
		txRequest: TxExecutionRequest,
		scopes: AztecAddress[],
		proveId?: string,
	): Promise<TxProvingResult> {
		const result = await this.request("proveTx", network, txRequest, scopes, proveId)
		return await TxProvingResult.schema.parseAsync(result)
	}

	public async profileTx(network: NetworkInfo, txRequest: TxExecutionRequest, opts: ProfileTxOpts): Promise<TxProfileResult> {
		const result = await this.request("profileTx", network, txRequest, opts)
		return await TxProfileResult.schema.parseAsync(result)
	}

	public async simulateTx(
		network: NetworkInfo,
		txRequest: TxExecutionRequest,
		opts: SimulateTxOpts,
		stubAccountAddresses?: string[],
	): Promise<TxSimulationResult> {
		const result = await this.request("simulateTx", network, txRequest, opts, stubAccountAddresses)
		return await TxSimulationResult.schema.parseAsync(result)
	}

	public async executeUtility(network: NetworkInfo, call: FunctionCall, opts: ExecuteUtilityOpts): Promise<UtilityExecutionResult> {
		const result = await this.request("executeUtility", network, call, opts)
		return await UtilityExecutionResult.schema.parseAsync(result)
	}

	public async getPrivateEvents(
		network: NetworkInfo,
		eventSelector: EventSelector,
		filter: PrivateEventFilter,
	): Promise<PackedPrivateEvent[]> {
		const result = await this.request("getPrivateEvents", network, eventSelector, filter)
		return await z.array(PackedPrivateEventSchema).parseAsync(result)
	}

	/** PXE's latest synchronized block header. Used as the fast-path
	 *  anchor for tx construction. */
	public async getSyncedBlockHeader(network: NetworkInfo): Promise<BlockHeader> {
		const result = await this.request("getSyncedBlockHeader", network)
		return await BlockHeader.schema.parseAsync(result)
	}

	/** Chain-derived UTC seconds for a specific L2 block. Returns
	 *  `undefined` when the node can't resolve it. Activity-feed consumers
	 *  use this to sort/render chronologically across remove+re-add cycles. */
	public async getBlockTimestamp(network: NetworkInfo, blockNumber: number): Promise<number | undefined> {
		const result = await this.request("getBlockTimestamp", network, blockNumber)
		if (result === undefined || result === null) return undefined
		return Number(result)
	}

	/** One page of decoded public `Transfer` events for `(network, contract)`. */
	public async getPublicTokenTransferEvents(
		network: NetworkInfo,
		contract: string,
		args: PublicTransferFetchArgs,
	): Promise<PublicTransferPage> {
		const result = await this.request("getPublicTokenTransferEvents", network, contract, args)
		return await PublicTransferPageSchema.parseAsync(result)
	}

	/** The checkpointed + finalized tips for the index bound + rewind floor. */
	public async getPublicScanTips(network: NetworkInfo): Promise<PublicScanTips> {
		const result = await this.request("getPublicScanTips", network)
		return await PublicScanTipsSchema.parseAsync(result)
	}

	/** The latest proposed block number; a value that is not a non-negative safe integer throws. */
	public async getLatestBlockNumber(network: NetworkInfo): Promise<number> {
		const result = await this.request("getLatestBlockNumber", network)
		return await z.number().int().nonnegative().parseAsync(result)
	}

	/** Node-direct class gate: whether `contract` is the bundled Token at the finalized anchor. */
	public async getPublicTokenClassStatus(
		network: NetworkInfo,
		contract: string,
		checkpointHash: string,
	): Promise<PublicTokenClassStatus> {
		const result = await this.request("getPublicTokenClassStatus", network, contract, checkpointHash)
		return await PublicTokenClassStatusSchema.parseAsync(result)
	}

	/** Dispose the offscreen runtime for `(profileId, chainId)` and delete
	 *  its IndexedDB. SW-side cascade entry-point for `NetworkService.purgeChain`. */
	public async clearChainState(profileId: string, chainId: number): Promise<void> {
		await this.request("clearChainState", profileId, chainId)
	}

	/** `generation` is the incarnation being erased, read from the tombstone carry —
	 *  NOT the row (the row is already gone by deletion time). */
	public async clearProfileState(profileId: string, generation: string): Promise<void> {
		await this.request("clearProfileState", profileId, generation)
	}

	/** Provision the per-profile PXE store encryption key (32 bytes, base64-encoded) under the
	 *  profile's current incarnation generation. Fired by the missing-key retry path. */
	public async provisionChainStoreKey(profileId: string, storeKeyBase64: string, generation: string): Promise<void> {
		await this.request("provisionChainStoreKey", profileId, storeKeyBase64, generation)
	}
}

/** An op carries a stampable NetworkInfo when its first argument names a
 *  profile + chain and no generation was stamped yet. */
function needsGenerationStamp(netArg: NetworkInfo & { pxeGeneration?: string }): boolean {
	return typeof netArg === "object" && "profileId" in netArg && "chainId" in netArg && !netArg.pxeGeneration
}
