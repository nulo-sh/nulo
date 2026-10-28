// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { ILogger } from "@/wallet/logger"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import { ProfileService } from "@/wallet/services/profile/service"
import { type ExecutionFence, profileDeletedError } from "@/wallet/services/profile/profile-deletion-state"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { NetworkService, networkInfoFrom } from "@/wallet/services/network/service"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import { purgeMalformedRows, purgeRows } from "@/wallet/services/purge-rows"
import { nextRandomId } from "@/wallet/services/id-allocators"
import { requireOwnedRow } from "@/wallet/services/require-owned-row"
import { ensureRegistered } from "@/wallet/services/execution/contract-resolver"
import type { SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { Lock } from "@/wallet/utils"
import { resolveNetworkByChainId } from "@/wallet/utils/caip"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import { Fpc } from "./fpc"
import { getFpcHandler } from "./handlers"
import { type Events, FPC_SERVICE_NAME, type FpcInfo, FpcType, type Methods } from "./spec"
import { derivePrivateFpc, deriveSponsoredFpc, type ProtocolFpc } from "./protocol-fpcs"

export * from "./fpc"
export * from "./spec"

/** Names seeded onto auto-discovered protocol FPCs. */
const SPONSORED_FPC_DEFAULT_NAME = "Sponsored"
const PRIVATE_FPC_DEFAULT_NAME = "Private Fee Juice"

export type ProtocolAddresses = { sponsored: string; private: string }

/** Stored shape strips the in-memory `isProtocol` decoration. */
type StoredFpc = Omit<FpcInfo, "isProtocol">

/** What a row write is fenced against: the profile's deletion epoch, the network's reservations
 *  since the liveness mark `since`, and for a write no user action asked for, the session. */
type WriteScope = {
	fence: ExecutionFence
	deletion: ReturnType<ProfileService["getDeletionState"]>
	networkId: string
	since: number
	background: boolean
}

const hasRow = (rows: readonly StoredFpc[], type: FpcType, address: string) => rows.some((f) => f.type === type && f.address === address)

export class FpcService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("getFpcs", "getFpc", "addFpc", "updateFpc", "updateFpcAddress", "deleteFpc")
	public static name = FPC_SERVICE_NAME

	public readonly onFpcAdded = new EventHandler<FpcInfo>()
	public readonly onFpcUpdated = new EventHandler<FpcInfo>()
	public readonly onFpcDeleted = new EventHandler<FpcInfo>()

	private readonly storage: SealedEntityStorage<StoredFpc>
	private readonly lock = new Lock("fpc", this.logger)

	/** Per-chain cache of deterministic protocol addresses. Populated lazily
	 * inside `getFpcs(chainId)` so we don't pay the derivation cost in the
	 * service constructor. Used to recompute `isProtocol` at read time. */
	private readonly protocolAddresses = new Map<number, ProtocolAddresses>()

	private pxeService: PxeServiceClient = null!
	private profileService: ProfileService = null!
	private networkService: NetworkService = null!

	public constructor(logger: ILogger, browserApi: BrowserApi) {
		super(FPC_SERVICE_NAME, logger)
		this.storage = sealedEntityStorage("fpcs", browserApi.storage.local, (profileId) => this.profileService?.rowKeys(profileId))
	}

	protected async init(services: ServiceCollection) {
		this.pxeService = new PxeServiceClient(this.logger)
		this.profileService = services.get(ProfileService.name)
		this.networkService = services.get(NetworkService.name)
		// Profile-delete cleanup is now the coordinator's awaited `purgeForProfile` (D).
		this.networkService.registerChainPurgeSubscriber(async (profileId, chainId) => this.clearChainState(profileId, chainId))
		this.profileService.onRowKeysReady.add((profileId) => void this.sealLegacyRows(profileId))
	}

	/** Seals the profile's plaintext fee payers under the lock every fee-payer writer holds, so no
	 *  write lands between a row's read and its sealed commit. */
	private async sealLegacyRows(profileId: string): Promise<void> {
		try {
			await this.storage.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
		} catch (error) {
			this.logWarn("sealing the profile's plaintext fee payers failed; the next worker retries", { error })
		}
	}

	/**
	 * Wipe FPC entries for `(profileId, chainId)`. Emits `onFpcDeleted` per
	 * fpc. Called by `NetworkService.purgeChain`.
	 */
	public async clearChainState(profileId: string, chainId: number): Promise<void> {
		await this.ensureInitialized()
		// Under the same lock the create/discovery writers commit with, so the
		// sweep and a create are atomic — a create either lands before the
		// snapshot (and is purged) or runs after and fails its in-lock asserts.
		await this.lock.withLock(async () => {
			const fpcs = (await this.storage.getValues()).filter((f) => f.profileId === profileId && f.chainId === chainId)
			await purgeRows(
				fpcs,
				(fpc) => this.storage.delete(fpc.id),
				(fpc) => this.emit("onFpcDeleted", this.decorate(fpc, this.protocolAddresses.get(chainId))),
			)
			// Drop the cached addresses for this chain so a later re-add re-derives.
			this.protocolAddresses.delete(chainId)
		})
	}

	/** Derived, never read from a stored row, so a renamed or re-pointed row cannot move them. */
	public async getOrComputeProtocolAddresses(chainId: number): Promise<ProtocolAddresses> {
		const cached = this.protocolAddresses.get(chainId)
		if (cached) return cached

		const { instance: sponsoredInstance } = await deriveSponsoredFpc()
		const { instance: privateInstance } = await derivePrivateFpc()
		const addresses: ProtocolAddresses = {
			sponsored: sponsoredInstance.address.toString(),
			private: privateInstance.address.toString(),
		}
		this.protocolAddresses.set(chainId, addresses)
		return addresses
	}

	/** Decorate the on-disk shape with `isProtocol` based on whether the
	 * address matches a deterministic protocol address for the row's chain.
	 * `protocols` may be undefined when we haven't yet derived for that chain. */
	private decorate(fpc: StoredFpc, protocols: ProtocolAddresses | undefined): FpcInfo {
		const isProtocol =
			!!protocols &&
			((fpc.type === FpcType.DefaultSponsoredFpc && fpc.address === protocols.sponsored) ||
				(fpc.type === FpcType.PrivateFpc && fpc.address === protocols.private))
		return { ...fpc, isProtocol }
	}

	public async getFpcs(chainId?: number): Promise<FpcInfo[]> {
		await this.ensureInitialized()
		// Atomic read+capture: this read path DISCOVERS (writes protocol rows), so
		// its writes need the same deletion fence as addFpc.
		const fence = await this.profileService.captureExecutionFence()
		const deletion = this.profileService.getDeletionState()
		const allFpcs = await this.storage.getValues()
		const result = allFpcs.filter((fpc) => fpc.profileId === fence.profileId && (chainId === undefined || fpc.chainId === chainId))
		this.logDebug(
			`getFpcs: chainId=${chainId}, allFpcs=${allFpcs.length}, filtered=${result.length}, types=${result.map((f) => `${f.type}:${f.name}`).join(", ")}`,
		)
		if (chainId === undefined) {
			// No chain context → return without isProtocol decoration; callers
			// asking across chains shouldn't reason about protocol-row
			// permissions. backup() uses this branch.
			return result.map((f) => ({ ...f, isProtocol: false }))
		}

		const protocols = await this.getOrComputeProtocolAddresses(chainId)
		const hasSponsoredFpc = hasRow(result, FpcType.DefaultSponsoredFpc, protocols.sponsored)
		const hasPrivateFpc = hasRow(result, FpcType.PrivateFpc, protocols.private)
		if (hasSponsoredFpc && hasPrivateFpc) return result.map((f) => this.decorate(f, protocols))

		this.logInfo("Discovering missing protocol FPCs...")
		await this.discoverProtocolFpcs(chainId, hasSponsoredFpc, hasPrivateFpc, fence, deletion)
		// Re-read: a purge may have swept a row stored here, or a concurrent discovery stored one.
		return (await this.rowsOn(fence.profileId, chainId)).map((f) => this.decorate(f, protocols))
	}

	/** Registers with no lock held: a cold runtime's registration waits on the node, and the
	 *  profile purge takes this service's lock before it stops the PXE's retries. Each row is
	 *  stored right after its own registration, so a purge between items sweeps or refuses it. */
	private async discoverProtocolFpcs(
		chainId: number,
		hasSponsoredFpc: boolean,
		hasPrivateFpc: boolean,
		fence: ExecutionFence,
		deletion: ReturnType<ProfileService["getDeletionState"]>,
	): Promise<void> {
		const network = await resolveNetworkByChainId(this.networkService, chainId)
		const since = await this.networkService.captureLiveness(network.id)
		if (since === undefined) return
		const scope: WriteScope = { fence, deletion, networkId: network.id, since, background: true }
		const pxe = this.pxeService.getPXE(networkInfoFrom(network))
		for (const item of await this.collectMissingProtocolInstances(hasSponsoredFpc, hasPrivateFpc)) {
			try {
				const type = this.detectFpcType(item.artifact)
				getFpcHandler(type).validateArtifact(item.artifact)
				// A purge since the mark wiped the PXE: a registration would serve no row.
				if (!(await this.networkService.isNetworkLive(network.id, since))) return
				await pxe.registerContract({ instance: item.instance, artifact: item.artifact })
				this.logInfo(`Registered protocol FPC: ${item.instance.address.toString()}`)
				await this.lock.withLock(() => this.storeProtocolFpc(item, type, chainId, scope))
			} catch (err) {
				// A lock, a switch or a deletion since the discovery began makes the rest of it moot.
				if (!this.profileService.isFenceLive(fence)) {
					this.logDebug("Protocol FPC discovery stopped: its session ended")
					return
				}
				// So does a reset or a removal of its network since the mark; a failed read leaves the failure logged.
				if (!(await this.networkService.isNetworkLive(network.id, since).catch(() => true))) {
					this.logDebug("Protocol FPC discovery stopped: its network was reset or removed")
					return
				}
				this.logWarn(`getFpcs: Failed to discover FPC ${item.instance.address.toString()}:`, err)
				this.logError(`Failed to discover FPC ${item.instance.address.toString()}`, err)
			}
		}
	}

	/** Must derive through the same helpers as getOrComputeProtocolAddresses, or the
	 *  registered FPC never matches `protocols.*` and every read rediscovers it. */
	private async collectMissingProtocolInstances(hasSponsoredFpc: boolean, hasPrivateFpc: boolean): Promise<ProtocolFpc[]> {
		const toDiscover: ProtocolFpc[] = []
		if (!hasSponsoredFpc) {
			const { instance, artifact } = await deriveSponsoredFpc()
			this.logDebug(`getFpcs: SponsoredFPC instance address=${instance.address.toString()}`)
			toDiscover.push({ instance, artifact })
		}
		if (!hasPrivateFpc) {
			const { instance, artifact } = await derivePrivateFpc()
			this.logDebug(`getFpcs: PrivateFPC instance address=${instance.address.toString()}`)
			toDiscover.push({ instance, artifact })
		}
		return toDiscover
	}

	/** Caller holds the lock. Two discoveries can both register; the second finds the row here. */
	private async storeProtocolFpc(item: ProtocolFpc, type: FpcType, chainId: number, scope: WriteScope): Promise<void> {
		const address = item.instance.address.toString()
		if (hasRow(await this.rowsOn(scope.fence.profileId, chainId), type, address)) {
			this.logDebug("Discovery skipped: a concurrent discovery stored the row")
			return
		}
		const fpc: StoredFpc = {
			id: await nextRandomId(this.storage),
			profileId: scope.fence.profileId,
			chainId,
			type,
			address,
			name: type === FpcType.PrivateFpc ? PRIVATE_FPC_DEFAULT_NAME : SPONSORED_FPC_DEFAULT_NAME,
		}
		await this.writeFencedRow(fpc, scope)
	}

	/** Caller holds the lock the sweeps take, so a row lands before a sweep or is refused: the
	 *  epoch covers a profile deletion, the mark a network delete or reset since it was taken,
	 *  and a background write's session a lock or a switch, which leave the row keys in the worker. */
	private async writeFencedRow(fpc: StoredFpc, scope: WriteScope): Promise<void> {
		const { fence, deletion } = scope
		const assertLive = () => {
			deletion.assertCurrent(fence.profileId, fence.epoch)
			if (scope.background && !this.profileService.isFenceLive(fence)) throw new SessionEndedError()
		}
		assertLive()
		const write = await this.storage.prepare(fpc.id, fpc)
		if (!(await this.networkService.isNetworkLive(scope.networkId, scope.since))) {
			throw new Error("network deleted")
		}
		assertLive()
		await write.commit()
		// The set awaits — compensate before the row becomes observable.
		if (!deletion.isCurrent(fence.profileId, fence.epoch)) {
			await this.storage.delete(fpc.id)
			throw profileDeletedError(fence.profileId)
		}
	}

	private async rowsOn(profileId: string, chainId: number): Promise<StoredFpc[]> {
		return (await this.storage.getValues()).filter((fpc) => fpc.profileId === profileId && fpc.chainId === chainId)
	}

	public async getFpc(id: string): Promise<FpcInfo> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const fpcInfo = requireOwnedRow(await this.storage.get(id), profile.id)
		const protocols = this.protocolAddresses.get(fpcInfo.chainId)
		return this.decorate(fpcInfo, protocols)
	}

	public async addFpc(networkId: string, type: FpcType, address: string, name?: string): Promise<FpcInfo> {
		await this.ensureInitialized()
		// Defense in depth: stale popups posting `type: 0` (the deprecated
		// DefaultFpc / Token FPC slot) hit the handler-switch default and
		// throw "Invalid FPC type". We surface a clearer error here.
		if (type !== FpcType.DefaultSponsoredFpc && type !== FpcType.PrivateFpc) {
			throw new Error("Unsupported FPC type")
		}
		// Atomic read+capture at the authorizing entry: the PXE fetches below can
		// span the profile's deletion or the chain's purge — the commit asserts
		// both flush against the write.
		const fence = await this.profileService.captureExecutionFence()
		const deletion = this.profileService.getDeletionState()
		const network = await this.networkService.getNetwork(networkId)
		const since = await this.networkService.captureLiveness(networkId)
		if (since === undefined) {
			throw new Error("network deleted")
		}
		const pxe = this.pxeService.getPXE(networkInfoFrom(network))

		const fpcInstance = await pxe.getContractInstance(AztecAddress.fromStringUnsafe(address))
		if (!fpcInstance) {
			throw new Error("Contract instance not found")
		}

		const fpcArtifact = await pxe.getContractArtifact(fpcInstance.currentContractClassId)
		if (!fpcArtifact) {
			throw new Error("Contract artifact not found")
		}

		await ensureRegistered(pxe, address, fpcInstance, fpcArtifact)

		const fpcHandler = getFpcHandler(type)
		fpcHandler.validateArtifact(fpcArtifact)

		const protocols = await this.getOrComputeProtocolAddresses(network.chainId)

		return await this.lock.withLock(async () => {
			const fpc: StoredFpc = {
				id: await nextRandomId(this.storage),
				profileId: fence.profileId,
				chainId: network.chainId,
				type,
				address,
				name,
			}
			await this.writeFencedRow(fpc, { fence, deletion, networkId, since, background: false })
			const decorated = this.decorate(fpc, protocols)
			this.emit("onFpcAdded", decorated)
			return decorated
		})
	}

	public async updateFpc(id: string, name: string): Promise<FpcInfo> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const fpc = requireOwnedRow(await this.storage.get(id), profile.id)
			const protocols = await this.getOrComputeProtocolAddresses(fpc.chainId)
			if (this.decorate(fpc, protocols).isProtocol) {
				throw new Error("Cannot rename protocol FPC")
			}
			fpc.name = name
			await this.storage.set(id, fpc)
			const decorated = this.decorate(fpc, protocols)
			this.emit("onFpcUpdated", decorated)
			return decorated
		})
	}

	public async updateFpcAddress(id: string, address: string): Promise<FpcInfo> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		// Snapshot the row first so we know which network's PXE to query.
		const existing = requireOwnedRow(await this.storage.get(id), profile.id)
		if (existing.address === address) {
			// No-op. Preserve the existing entry without going to PXE.
			const protocols = await this.getOrComputeProtocolAddresses(existing.chainId)
			return this.decorate(existing, protocols)
		}
		// PrivateFPC address-edit is permanently disallowed. Custom-salt
		// PrivateFPC instances aren't publicly deployed and the wallet
		// bundles a single artifact version, so we cannot validate an
		// arbitrary address as a PrivateFPC. The UI hides the affordance;
		// this is the service-layer backstop.
		if (existing.type === FpcType.PrivateFpc) {
			throw new Error("Private Fee Juice FPC address cannot be changed.")
		}

		// Type-narrowed: existing.type === FpcType.DefaultSponsoredFpc here
		// (the PrivateFPC early-return above eliminated the other variant).
		const network = await resolveNetworkByChainId(this.networkService, existing.chainId)
		const pxe = this.pxeService.getPXE(networkInfoFrom(network))

		const fpcInstance = await pxe.getContractInstance(AztecAddress.fromStringUnsafe(address))
		if (!fpcInstance) {
			throw new Error("No contract found at this address. Make sure it's deployed and is a Sponsored FPC.")
		}
		const fpcArtifact = await pxe.getContractArtifact(fpcInstance.currentContractClassId)
		if (!fpcArtifact) {
			throw new Error("Couldn't load the contract artifact. This address is not a Sponsored FPC.")
		}
		await ensureRegistered(pxe, address, fpcInstance, fpcArtifact)

		// Hard-validate that the new address still implements the same FPC type.
		const handler = getFpcHandler(existing.type)
		try {
			handler.validateArtifact(fpcArtifact)
		} catch {
			throw new Error("This address is not a Sponsored FPC.")
		}

		const protocols = await this.getOrComputeProtocolAddresses(existing.chainId)
		// Reject promoting a user row to the deterministic Sponsored protocol
		// slot. The auto-discovery path is the canonical way to acquire that row.
		if (!this.decorate(existing, protocols).isProtocol && address === protocols.sponsored) {
			throw new Error("Cannot promote user FPC to protocol slot")
		}

		return await this.lock.withLock(async () => {
			// The row's writers take this lock, and a profile's last keyless sweep follows its locked
			// purge: a rename since the checks stays, and a row removed since them is not written back.
			const current = requireOwnedRow(await this.storage.get(id), profile.id)
			const next: StoredFpc = { ...current, address }
			await this.storage.set(id, next)
			const decorated = this.decorate(next, protocols)
			this.emit("onFpcUpdated", decorated)
			return decorated
		})
	}

	public async deleteFpc(id: string): Promise<FpcInfo> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const fpc = requireOwnedRow(await this.storage.get(id), profile.id)
			const protocols = await this.getOrComputeProtocolAddresses(fpc.chainId)
			const decorated = this.decorate(fpc, protocols)
			if (decorated.isProtocol) {
				throw new Error("Cannot delete protocol FPC")
			}
			await this.storage.delete(id)
			this.emit("onFpcDeleted", decorated)
			return decorated
		})
	}

	public async getFpcImpl(id: string): Promise<Fpc> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const fpcInfo = requireOwnedRow(await this.storage.get(id), profile.id)
		const fpcHandler = getFpcHandler(fpcInfo.type)
		// Derive (not just read the cache): after a worker restart the cache is empty and the
		// genuine row would otherwise look non-protocol.
		const decorated = this.decorate(fpcInfo, await this.getOrComputeProtocolAddresses(fpcInfo.chainId))
		// A PrivateFPC row that is not the protocol-derived one can never be a payer — its
		// `pay_fee` would run inside the user's private execution against a foreign contract.
		if (decorated.type === FpcType.PrivateFpc && !decorated.isProtocol) {
			throw new Error("PrivateFPC row is not the protocol contract")
		}
		return new Fpc(decorated, fpcHandler)
	}

	/**
	 * Detect FPC type from contract artifact by inspecting function signatures.
	 * - `sponsor_unconditionally` → DefaultSponsoredFpc
	 * - `pay_fee` + `balance_of` → PrivateFpc
	 */
	private detectFpcType(artifact: { name: string; functions: { name: string }[] }): FpcType {
		const hasSponsorUnconditionally = artifact.functions.some((f) => f.name === "sponsor_unconditionally")
		if (hasSponsorUnconditionally) {
			return FpcType.DefaultSponsoredFpc
		}

		const hasPayFee = artifact.functions.some((f) => f.name === "pay_fee")
		const hasBalanceOf = artifact.functions.some((f) => f.name === "balance_of")
		if (hasPayFee && hasBalanceOf) {
			return FpcType.PrivateFpc
		}

		throw new Error("Unsupported FPC artifact")
	}

	/** Awaited profile-scoped purge, called by the deletion coordinator (relocated
	 *  from the removed fire-and-forget `onProfileDeleted` sub). */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		this.logDebug(`purgeForProfile ${profileId}: remove related FPCs`)
		await this.lock.withLock(async () => {
			const fpcs = (await this.storage.getValues()).filter((fpc) => fpc.profileId === profileId)
			await purgeRows(
				fpcs,
				(fpc) => {
					this.logDebug(`Remove fpc #${fpc.id}`)
					return this.storage.delete(fpc.id)
				},
				(fpc) => this.emit("onFpcDeleted", this.decorate(fpc, this.protocolAddresses.get(fpc.chainId))),
			)
			// Raw second pass — a validation-failed row this profile owns is
			// invisible to getValues() and would otherwise survive the purge forever.
			await purgeMalformedRows(
				this.storage,
				(raw) => raw.profileId === profileId,
				(id) => this.logDebug(`purged malformed fpc row ${id}`),
			)
		})
	}
}
