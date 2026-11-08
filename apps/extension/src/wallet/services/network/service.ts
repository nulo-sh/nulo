// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { runSealing, type SealWarn, sealOnRowKeysReady } from "@/wallet/services/seal-on-unlock"
import { type AnyUnlockConversion, type RelayOffers, runUnlockConversions, UNLOCK_CONVERSIONS } from "@/wallet/services/unlock-conversions"
import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { assertRestoreEpoch, captureRestoreEpochs } from "@/wallet/services/restore-fence"
import { commitFencedCreate, type DeletionFence } from "@/wallet/services/create-fence"
import { type ProfileDeletionState, profileDeletedError } from "@/wallet/services/profile/profile-deletion-state"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { validateParams } from "@nulo/extension-messaging/zod"
import { NodeUnreachableError } from "@nulo/extension-messaging/errors"
import type { NodeFactory } from "@nulo/aztec-runtime/ports"
import type { RoutedNode } from "@nulo/aztec-runtime/routing"
import { DEFAULT_REQUEST_TIMEOUT_MS } from "@nulo/aztec-runtime/utils"
import type { ILogger } from "@/wallet/logger"
import { ProfileService } from "@/wallet/services/profile/service"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { requireOwnedRow } from "@/wallet/services/require-owned-row"
import { nextRandomId, randomIdNotIn } from "@/wallet/services/id-allocators"
import { purgeMalformedRows } from "@/wallet/services/purge-rows"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import type { SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { Lock } from "@/wallet/utils"
import { EventHandler, isLoopbackHost } from "@nulo/wallet-core/utils"
import { getErrorMessage } from "@nulo/wallet-core/utils"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import { LOCAL_L1_CHAIN_ID, walletChainId } from "@/utils/chain-ids"
import { hasNetworkCause } from "@/wallet/services/stale-network/classify"
import { quarantinedBy, StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import { ERR_NOT_RESETTABLE, ERR_RESET_PENDING, ERR_STALE_CHANGED, type ProbedEndpoint } from "@/wallet/services/stale-network/types"
import type { RawRowState } from "@/wallet/utils/raw-row"
import {
	DEFAULT_SEEDS,
	type DefaultSeed,
	isSeedChain,
	isSeedEndpointUrl,
	LOCAL_NETWORK_RPC_URL,
	normalizeRpcUrl,
	PRIMARY_SEED,
	relayEndpointOf,
	relayHolders,
	SEED_L1_BY_KIND,
	sameEndpointUrl,
	seedForKind,
} from "./seeds"
import {
	KINDS_SEEDED_BEFORE_RECORD,
	readSeedOffers,
	type SeedOffers,
	sameSeedOffers,
	seedOffersKey,
	seedsToOffer,
	writeSeedOffers,
} from "./seed-offers"
import {
	type ChainKind,
	ERR_ACTIVE_NETWORK,
	ERR_CHAIN_QUARANTINED,
	ERR_DUPLICATE_CHAIN,
	ERR_DUPLICATE_ENDPOINT,
	ERR_ENDPOINT_CHAIN_MISMATCH,
	ERR_LAST_ENDPOINT,
	ERR_PRIMARY_ENDPOINT,
	ERR_RESET_RUNNING,
	ERR_UNATTENDED_LIVE_CHECK,
	type Events,
	IDENTITY_PROBE_MS,
	findPrimaryEndpoint,
	type Methods,
	type Network,
	type NetworkEndpoint,
	type NetworkInfo,
	NETWORK_SERVICE_NAME,
	NetworkMethodSchemas,
	endpointsInOrder,
	networkInfoFrom,
	NodeStatus,
	type RouteEndpoint,
	type RouteSnapshot,
	routeEndpoints,
	ACTIVE_NETWORK_STORAGE_ROOT,
	decodeActiveNetworkId,
} from "./spec"

export * from "./spec"
export { isSeedEndpointUrl, LOCAL_NETWORK_RPC_URL } from "./seeds"

/**
 * Per-profile active-network pointer. The service owns this state (vs. v0
 * which left it to UI / chrome.storage.local). UI reads via
 * `getActiveNetwork()`. Stored as a single value per profile.
 */
const activeKey = (profileId: string) => `${ACTIVE_NETWORK_STORAGE_ROOT}@${profileId}`

/** Whether `rpcUrl`'s host is this machine (`isLoopbackHost`); a URL that does not parse is not. */
function isLoopbackRpcUrl(rpcUrl: string): boolean {
	try {
		return isLoopbackHost(new URL(rpcUrl).hostname)
	} catch {
		return false
	}
}

/** A node whose composite chain id the wallet reads as 0, the local development chain: a loopback
 *  node the caller says is local, or one at the Local Network seed's URL. */
function isLocalNetworkTarget(rpcUrl: string, kindHint: ChainKind | undefined): boolean {
	return isLoopbackRpcUrl(rpcUrl) && (kindHint === "local" || sameEndpointUrl(rpcUrl, LOCAL_NETWORK_RPC_URL))
}

/** The wallet chain id of the node at `rpcUrl` whose answer computes to `composite`. 0 belongs to the
 *  local development chain alone, so a composite of 0 from any other node is refused. */
function nodeChainId(rpcUrl: string, kindHint: ChainKind | undefined, composite: number): number {
	if (isLocalNetworkTarget(rpcUrl, kindHint)) return 0
	if (composite === 0) {
		throw new Error(`${ERR_ENDPOINT_CHAIN_MISMATCH}: This RPC reports chain 0, which only the Local Network on this machine serves.`)
	}
	return composite
}

/** Refuses a node that is not `network`'s chain. The XOR composite alone is collision-prone: a
 *  different (l1ChainId, rollupVersion) pair can XOR to the same value, and l1ChainId feeds key
 *  derivation, so the L1 must match exactly too. */
function assertSameChainIdentity(probed: { chainId: number; l1ChainId: number }, network: Network): void {
	if (probed.chainId !== network.chainId) {
		throw new Error(
			`${ERR_ENDPOINT_CHAIN_MISMATCH}: This RPC reports chainId ${probed.chainId}, but this network is chain ${network.chainId}.`,
		)
	}
	if (probed.l1ChainId !== network.l1ChainId) {
		throw new Error(
			`${ERR_ENDPOINT_CHAIN_MISMATCH}: This RPC reports L1 chain ${probed.l1ChainId}, but this network is L1 chain ${network.l1ChainId}.`,
		)
	}
}

/** Whether the row's primary is no longer the one the reset's view decided on. A view that probed
 *  nothing saw the seed's endpoint primary, or none; a user primary set since was never checked
 *  against the new chain, and the rewrite would replace it with the seed's unannounced. */
function primaryMoved(row: Network, check: { chainId: number; toChainId: number; primary: ProbedEndpoint | null }): boolean {
	const primary = findPrimaryEndpoint(row)
	if (check.primary) return primary?.id !== check.primary.id || primary.rpcUrl !== check.primary.url
	if (check.chainId === check.toChainId || !primary) return false
	const seed = seedForKind(row.kind)
	return !seed || !isSeedEndpointUrl(seed, primary.rpcUrl)
}

/** One in-place reset of a network row, as the reset journal names it. */
export type ChainResetRequest = {
	profileId: string
	networkId: string
	fromChainId: number
	toChainId: number
	purged: boolean
	switchToSeedNode: boolean
	probedEndpoint: ProbedEndpoint | null
}

/** The reset's own steps around the chain purge. */
export type ChainResetHooks = {
	/** Under the reservation, before anything is deleted. */
	beforePurge(): Promise<void>
	/** Under the reservation, after `purgeChain`: the caller's chain-scoped purges. */
	afterPurge(): Promise<void>
	/** After the reservation is released and before the rewrite: makes the purge durable. */
	onPurged(): Promise<void>
}

const notResettable = (why: string) => new Error(`${ERR_NOT_RESETTABLE}: ${why}`)

type DefaultsOffer = { rows: Network[]; added: Network[]; primaryId: string | undefined }

function trimmedLabel(label: string | undefined): string | undefined {
	return label?.trim() || undefined
}

export class NetworkService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getOrInitNetworks",
		"seedDefaultsForProfile",
		"getNetworks",
		"getNetwork",
		"addNetwork",
		"renameNetwork",
		"deleteNetwork",
		"setActiveNetwork",
		"getActiveNetwork",
		"getNetworkArrival",
		"answerNetworkArrival",
		"getPrimaryNetwork",
		"setActiveForProfile",
		"addEndpoint",
		"updateEndpoint",
		"deleteEndpoint",
		"setPrimaryEndpoint",
		"reorderEndpoints",
		"getRouteSnapshot",
		"getNodeStatus",
		"probeNodeStatus",
	)
	public static name = NETWORK_SERVICE_NAME

	public readonly onNetworkAdded = new EventHandler<Network>()
	public readonly onNetworkUpdated = new EventHandler<Network>()
	public readonly onNetworkDeleted = new EventHandler<Network>()
	public readonly onActiveNetworkChanged = new EventHandler<Network>()
	public readonly onPrimaryEndpointChanged = new EventHandler<{ networkId: string; endpointId: string }>()
	public readonly onChainPurged = new EventHandler<{ profileId: string; chainId: number }>()
	public readonly onRouteChanged = new EventHandler<{ profileId: string; chainId: number }>()

	private readonly storage: SealedEntityStorage<Network>
	private readonly staleNetworks: StaleNetworkRepository
	/** One routed node per network row, with the endpoint list it was built for. */
	private readonly routes = new Map<string, { key: string; node: RoutedNode }>()
	/** The retrying client of each endpoint a transaction was submitted through: the send, its dApp
	 *  `wait` and the registry's receipt reads. */
	private readonly transientNodes = new Map<string, AztecNode>()
	/** Never evicted: the keys are only endpoints a transaction was recorded on. */
	private readonly singleAttemptNodes = new Map<string, AztecNode>()
	private readonly lock: Lock
	private readonly nodeFactory: NodeFactory

	private profileService: ProfileService = null!
	private pxeServiceClient: PxeServiceClient = null!

	public constructor(
		logger: ILogger,
		private readonly browserApi: BrowserApi,
		nodeFactory: NodeFactory,
	) {
		super(NETWORK_SERVICE_NAME, logger)
		this.storage = sealedEntityStorage("networks", browserApi.storage.local, (profileId) => this.profileService?.rowKeys(profileId))
		this.staleNetworks = new StaleNetworkRepository(browserApi.storage.local)
		// Watchdog DISABLED: deleteNetwork legitimately holds this lock across
		// purgeChain → clearChainState, which rides the 30-minute prove-tx
		// envelope (it drains behind an in-flight proof). A force-release would
		// admit a concurrent network mutator into the middle of that cascade;
		// queueing behind it is the correct semantic.
		this.lock = new Lock("network", logger, null)
		this.nodeFactory = nodeFactory
	}

	protected async init(services: ServiceCollection) {
		this.profileService = services.get(ProfileService.name)
		this.profileService.onActiveProfileChanged.add(this.onActiveProfileChanged)
		const warn: SealWarn = (...data) => this.logWarn(...data)
		sealOnRowKeysReady(
			this.profileService,
			warn,
			"sealing the profile's plaintext networks failed; the next worker retries",
			async (profileId) => {
				await this.sealLegacyRows(profileId)
				await runSealing(warn, "converting the profile's networks failed; the next worker retries", () =>
					this.convertRows(profileId),
				)
			},
		)
		// Profile-delete cleanup is now the coordinator's awaited `purgeForProfile` (D).
		this.pxeServiceClient = new PxeServiceClient(this.logger)
		this.listenToRoutes(this.pxeServiceClient)
	}

	/** Relays the account engine's route changes to the endpoint list. An offscreen client hears
	 *  events only once connected, which otherwise waits for its first request. */
	private listenToRoutes(client: Pick<PxeServiceClient, "onRouteChanged" | "connect">): void {
		client.onRouteChanged.add((change) => this.emit("onRouteChanged", change))
		client.connect()
	}

	/** Seals the profile's plaintext networks under the lock every network writer holds, so no write
	 *  lands between a row's read and its sealed commit. */
	private async sealLegacyRows(profileId: string): Promise<void> {
		await this.storage.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
	}

	/** A network a reset journal holds is left as captured: the reset's resume matches its primary
	 *  against the captured URL. */
	private async convertRows(profileId: string, conversions: readonly AnyUnlockConversion[] = UNLOCK_CONVERSIONS): Promise<void> {
		await this.lock.withLock(async () => {
			const held = (await this.staleNetworks.getJournal(profileId))?.networkId
			// Read once: a profile holds at most one row per seeded kind, so no rename here meets another.
			const rows = (await this.storage.getValues()).filter((network) => network.profileId === profileId)
			const relayOffers = await this.relayOffersLocked(profileId)
			await runUnlockConversions("networks", rows, {
				conversions,
				context: { relayOffers },
				skip: (network) => network.id === held,
				log: (level, message, record) => (level === "warn" ? this.logWarn(message, record) : this.logDebug(message, record)),
				commit: async (network, next) => {
					await this.storage.set(next.id, next)
					let moved = network.endpoints.length !== next.endpoints.length
					network.endpoints.forEach((endpoint, i) => {
						if (endpoint.rpcUrl === next.endpoints[i]?.rpcUrl) return
						this.transientNodes.delete(endpoint.rpcUrl)
						moved = true
					})
					if (moved) this.routes.delete(next.id)
					this.emit("onNetworkUpdated", next)
				},
			})
		})
	}

	/** The profile's relay offers as its record reads now; each take rewrites the record at once. A
	 *  record that does not read offers nothing: a guess could give back a relay the person removed.
	 *  With no record, a profile with rows stands for every default seeded before it. Caller holds the
	 *  lock, as the profile's purge does. */
	private async relayOffersLocked(profileId: string): Promise<RelayOffers> {
		const record = await readSeedOffers(this.browserApi.storage.local, profileId)
		if (record.kind === "corrupt") return { pending: () => false, take: async () => {} }
		let current: SeedOffers = record.kind === "valid" ? record.value : { offered: [...KINDS_SEEDED_BEFORE_RECORD] }
		return {
			pending: (kind) => !current.relay?.includes(kind),
			take: async (kind) => {
				// Kept only once written: the next take writes from it, and must not record an offer whose
				// row never converted.
				const next = { ...current, relay: [...(current.relay ?? []), kind] }
				await writeSeedOffers(this.browserApi.storage.local, profileId, next)
				current = next
			},
		}
	}

	// ── Read paths ───────────────────────────────────────────────────────

	public async getOrInitNetworks(): Promise<Network[]> {
		await this.ensureInitialized()
		// Atomic read+capture: the lock wait + per-seed id allocation below can
		// span the profile's deletion; seeding rows (and the active pointer) for
		// a deleted profile creates orphans the cascade's snapshot predates.
		const fence = await this.profileService.captureExecutionFence()
		const deletion = this.profileService.getDeletionState()
		const profileId = fence.profileId
		return await this.lock.withLock(async () => {
			const rows = (await this.storage.getValues()).filter((n) => n.profileId === profileId)
			if (rows.length > 0) return (await this.offerDefaultsLocked(profileId, rows, fence, deletion)).rows
			this.seedingProfiles.add(profileId)
			let offer: DefaultsOffer
			try {
				offer = await this.offerDefaultsLocked(profileId, rows, fence, deletion)
			} finally {
				this.seedingProfiles.delete(profileId)
			}
			await this.activateSeededLocked(profileId, offer.added, offer.primaryId, fence, deletion)
			return offer.rows
		})
	}

	/**
	 * Adds every default the profile was never offered (all of them to an empty profile) and records
	 * the offer. Rows are written before the record, so a worker killed between them leaves a row the
	 * next pass finds by kind and records. Never touches the active pointer. Caller holds the lock.
	 */
	private async offerDefaultsLocked(
		profileId: string,
		rows: Network[],
		fence: DeletionFence,
		deletion: ProfileDeletionState,
	): Promise<DefaultsOffer> {
		const record = await readSeedOffers(this.browserApi.storage.local, profileId)
		const offer = seedsToOffer(DEFAULT_SEEDS, record, rows)
		if (!offer) {
			this.logDebug("network seed record unreadable")
			return { rows, added: [], primaryId: undefined }
		}
		const offered = new Set(offer.offered)
		const relay = new Set([...(record.kind === "valid" ? (record.value.relay ?? []) : []), ...relayHolders(rows)])
		const added: Network[] = []
		let primaryId: string | undefined
		for (const seed of offer.add) {
			// Left unrecorded, so the next open adds it once no reset is moving to its chain.
			if (await this.isChainQuarantined(profileId, seed.chainId)) continue
			try {
				const network = await this.seedOneNetworkLocked(profileId, seed, fence, deletion)
				added.push(network)
				offered.add(seed.kind)
				if (seed.relay) relay.add(seed.kind)
				if (seed.isPrimaryActive) primaryId = network.id
			} catch (error) {
				this.logError(`Failed to seed default '${seed.name}'`, error)
			}
		}
		// The per-seed catch above (soft-fail is right for one bad seed) also swallows the deletion
		// compensate's throw: without this re-assert a deleted profile would read as seeded.
		deletion.assertCurrent(fence.profileId, fence.epoch)
		const next = { offered: [...offered], announce: offer.announce.filter((kind) => offered.has(kind)), relay: [...relay] }
		await this.recordOffersLocked(profileId, record, next, fence, deletion)
		return { rows: [...rows, ...added], added, primaryId }
	}

	/** A write a deletion overtook restores a valid prior record: removing it would re-offer a default
	 *  the person deleted. */
	private async recordOffersLocked(
		profileId: string,
		record: RawRowState<SeedOffers>,
		next: SeedOffers,
		fence: DeletionFence,
		deletion: ProfileDeletionState,
	): Promise<void> {
		if (record.kind === "valid" && sameSeedOffers(record.value, next)) return
		await writeSeedOffers(this.browserApi.storage.local, profileId, next)
		if (!deletion.isCurrent(fence.profileId, fence.epoch)) {
			if (record.kind === "valid") await writeSeedOffers(this.browserApi.storage.local, profileId, record.value)
			else await this.browserApi.storage.local.remove(seedOffersKey(profileId))
			throw profileDeletedError(fence.profileId)
		}
	}

	/** Profiles whose first activation is writing their default networks — see `servesChain`. */
	private readonly seedingProfiles = new Set<string>()

	/**
	 * Full-backup import restores into a profile before activating it, so the fresh session
	 * seeding above cannot serve it. Existence is checked through the profile list — a
	 * deletion epoch alone would also admit an unknown or already-deleted id — and the fence
	 * is re-asserted under the lock before every write. Only the target's own active pointer
	 * is written, and only when the target had no rows: `this.nodes` is keyed by `chainId` alone
	 * and belongs to the active profile. A target with rows gets only the defaults it was never offered.
	 */
	public async seedDefaultsForProfile(profileId: string): Promise<Network[]> {
		validateParams(NetworkMethodSchemas.seedDefaultsForProfile.params, [profileId], "seedDefaultsForProfile")
		await this.ensureInitialized()
		const deletion = this.profileService.getDeletionState()
		const epochs = captureRestoreEpochs(deletion, [profileId])
		if (!(await this.profileService.getProfiles()).some((p) => p.id === profileId)) {
			throw new Error(`profile ${profileId} does not exist`)
		}
		return await this.lock.withLock(async () => {
			assertRestoreEpoch(deletion, epochs, profileId)
			const rows = (await this.storage.getValues()).filter((n) => n.profileId === profileId)
			const fence = { profileId, epoch: epochs.get(profileId) as number }
			const offer = await this.offerDefaultsLocked(profileId, rows, fence, deletion)
			const primary = rows.length > 0 ? undefined : (offer.primaryId ?? offer.added[0]?.id)
			if (primary !== undefined) await this._writeActive(profileId, primary)
			return offer.rows
		})
	}

	/** Build + persist one default seed, deletion-fenced on both sides of the write:
	 *  a profile deleted mid-seed gets its just-written row compensated away. Caller
	 *  holds the network lock. */
	private async seedOneNetworkLocked(
		profileId: string,
		seed: (typeof DEFAULT_SEEDS)[number],
		fence: DeletionFence,
		deletion: ProfileDeletionState,
	): Promise<Network> {
		const network = await this._buildNetwork(
			profileId,
			seed.name,
			seed.rpcUrl,
			seed.chainId,
			seed.l1ChainId,
			seed.kind,
			seed.endpointLabel,
		)
		if (seed.relay) network.endpoints.push(relayEndpointOf(network, seed.relay))
		const write = await this.storage.prepare(network.id, network)
		await commitFencedCreate(deletion, fence, write, () => this.storage.delete(network.id))
		return network
	}

	/** Point the active-network pointer at the primary seed (or the first seeded) and
	 *  warm its node. Caller holds the network lock. */
	private async activateSeededLocked(
		profileId: string,
		seeded: Network[],
		primaryActiveId: string | undefined,
		fence: DeletionFence,
		deletion: ProfileDeletionState,
	): Promise<void> {
		const activeId = primaryActiveId ?? (seeded.length ? seeded[0]!.id : undefined)
		if (!activeId) return
		deletion.assertCurrent(fence.profileId, fence.epoch)
		await this._writeActive(profileId, activeId)
	}

	public async getNetworks(chainId?: number): Promise<Network[]> {
		validateParams(NetworkMethodSchemas.getNetworks.params, [chainId], "getNetworks")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return (await this.storage.getValues()).filter(
			(n) => n.profileId === profile.id && (chainId === undefined || n.chainId === chainId),
		)
	}

	/**
	 * Lock-free, profileId-parameterized network read. Does NOT go through
	 * `requireActiveProfile`, so it's safe to call under the profile facade lock
	 * (the deletion coordinator's snapshot) AND from profile-scoped cleanup
	 * consumers (e.g. `IncomingTransfer.onTokenDeleted`) that must scope to the
	 * DELETED token's profile, never the active one.
	 */
	public async getNetworksRaw(profileId: string, chainId?: number): Promise<Network[]> {
		await this.ensureInitialized()
		return (await this.storage.getValues()).filter((n) => n.profileId === profileId && (chainId === undefined || n.chainId === chainId))
	}

	/**
	 * The stored, seeded-constant-validated `l1ChainId` for `(profileId, chainId)` — the
	 * key-derivation chain input. NO network probe (safe for restore-time cross-checks and
	 * offline reads). For seeded kinds the row value must equal the immutable in-code constant:
	 * `DEFAULT_SEEDS` only INITIALIZES a mutable row, so a tampered seeded row must fail here
	 * rather than mint a self-consistent poisoned account. Lock-free, no requireActiveProfile.
	 */
	public async getL1ChainIdStored(profileId: string, chainId: number): Promise<number> {
		await this.ensureInitialized()
		const network = (await this.storage.getValues()).find((n) => n.profileId === profileId && n.chainId === chainId)
		if (!network) throw new Error(`No network for chain ${chainId} in this profile`)
		return NetworkService.assertCanonicalStoredL1(network)
	}

	/** Seeded-constant + canonical-range validation of a row's `l1ChainId` (sync — see
	 *  `getL1ChainIdStored` for why the seeded row value must equal the in-code constant). */
	private static assertCanonicalStoredL1(network: Network): number {
		const seeded = SEED_L1_BY_KIND[network.kind ?? "custom"]
		if (seeded !== undefined && network.l1ChainId !== seeded) {
			throw new Error(`Seeded network L1 identity mismatch: stored ${network.l1ChainId}, expected ${seeded}`)
		}
		if (network.chainId === 0 && network.l1ChainId !== LOCAL_L1_CHAIN_ID) {
			throw new Error(`Chain 0 is the local development chain: stored l1ChainId ${network.l1ChainId}, expected ${LOCAL_L1_CHAIN_ID}`)
		}
		if (!Number.isSafeInteger(network.l1ChainId) || network.l1ChainId < 0 || network.l1ChainId > 0xffffffff) {
			throw new Error(`Non-canonical stored l1ChainId: ${network.l1ChainId}`)
		}
		return network.l1ChainId
	}

	/**
	 * `getL1ChainIdStored` plus, for NON-seeded kinds (custom/devnet), a live-probe confirmation
	 * that the node still reports the stored L1 identity — required at ACCOUNT CREATION so a
	 * poisoned custom-network row cannot mint a wrong-chain account. Seeded kinds are already
	 * bound to in-code constants and stay offline-creatable; custom networks are online-configured
	 * by nature, so a node that does not answer one bounded read fails creation with
	 * `NodeUnreachableError`, which callers may tolerate, while a mismatch stays a plain refusal.
	 *
	 * ONE row read: the probe target and the returned l1ChainId must come from the same
	 * snapshot — two independent reads could validate one row and return another's value.
	 *
	 * `unattended` refuses (`ERR_UNATTENDED_LIVE_CHECK`) instead of probing, so a caller acting on
	 * a dApp's request — not the user's — can never make the wallet contact an endpoint. The
	 * refusal is decided on the SAME row read the derivation uses: a preflight on a separate read
	 * could be invalidated by a delete-and-re-add landing in between.
	 */
	public async resolveVerifiedL1ChainId(profileId: string, chainId: number, opts?: { unattended?: boolean }): Promise<number> {
		await this.ensureInitialized()
		const network = (await this.storage.getValues()).find((n) => n.profileId === profileId && n.chainId === chainId)
		if (!network) throw new Error(`No network for chain ${chainId} in this profile`)
		const stored = NetworkService.assertCanonicalStoredL1(network)
		const kind = network.kind ?? "custom"
		if (SEED_L1_BY_KIND[kind] === undefined) {
			if (opts?.unattended) throw new Error(`${ERR_UNATTENDED_LIVE_CHECK}: network ${chainId} needs a live L1 identity check`)
			const primary = findPrimaryEndpoint(network) ?? network.endpoints[0]
			if (!primary) throw new Error("Network has no endpoint to verify its L1 identity against")
			const probed = await this.probeIdentityOnce(primary.rpcUrl, kind, IDENTITY_PROBE_MS).catch((error: unknown) => {
				// A node that answered chain 0 answered: only a read that got no answer is tolerable.
				if (error instanceof Error && error.message.startsWith(ERR_ENDPOINT_CHAIN_MISMATCH)) throw error
				this.logDebug("custom network's node did not answer its identity read")
				throw new NodeUnreachableError()
			})
			if (probed.l1ChainId !== stored) {
				throw new Error(`Custom network L1 identity mismatch: stored ${stored}, node reports ${probed.l1ChainId}`)
			}
		}
		return stored
	}

	public async getNetwork(id: string): Promise<Network> {
		validateParams(NetworkMethodSchemas.getNetwork.params, [id], "getNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const network = requireOwnedRow(await this.storage.get(id), profile.id)
		return network
	}

	public async getActiveNetwork(): Promise<Network | null> {
		validateParams(NetworkMethodSchemas.getActiveNetwork.params, [], "getActiveNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const id = await this._readActive(profile.id)
		if (!id) return null
		const network = await this.storage.get(id)
		if (network?.profileId !== profile.id) return null
		return network
	}

	public async getPrimaryNetwork(): Promise<Network | null> {
		validateParams(NetworkMethodSchemas.getPrimaryNetwork.params, [], "getPrimaryNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const primary = PRIMARY_SEED
		if (!primary) return null
		const rows = (await this.storage.getValues()).filter((n) => n.profileId === profile.id)
		return rows.find((n) => n.chainId === primary.chainId) ?? null
	}

	public async setActiveForProfile(profileId: string, networkId: string): Promise<string> {
		validateParams(NetworkMethodSchemas.setActiveForProfile.params, [profileId, networkId], "setActiveForProfile")
		await this.ensureInitialized()
		return await this.lock.withLock(async () => {
			// `requireOwnedRow` rejects a networkId that isn't a row of THIS profile — the id comes from
			// an attacker-controlled backup, so it must resolve only within the profile's restored rows.
			requireOwnedRow(await this.storage.get(networkId), profileId)
			await this._writeActive(profileId, networkId)
			return networkId
		})
	}

	// ── Network mutations ────────────────────────────────────────────────

	public async addNetwork(name: string, rawRpcUrl: string): Promise<Network> {
		const [, rpcUrl] = validateParams(NetworkMethodSchemas.addNetwork.params, [name, rawRpcUrl], "addNetwork")
		await this.ensureInitialized()
		// Atomic read+capture: the RPC probe below can span the profile's
		// deletion — the commit asserts flush against the write.
		const fence = await this.profileService.captureExecutionFence()
		const deletion = this.profileService.getDeletionState()
		const { chainId, l1ChainId } = await this._probeChainIdentity(rpcUrl)
		return await this.lock.withLock(async () => {
			const existingForProfile = (await this.storage.getValues()).filter((n) => n.profileId === fence.profileId)
			const sameChain = existingForProfile.find((n) => n.chainId === chainId)
			if (sameChain) {
				throw new Error(`${ERR_DUPLICATE_CHAIN}: A network for chain ${chainId} already exists in this profile.`)
			}
			if (await this.isChainQuarantined(fence.profileId, chainId)) {
				throw new Error(`${ERR_CHAIN_QUARANTINED}: A reset of another network is moving to chain ${chainId}.`)
			}
			if (existingForProfile.some((n) => n.name === name)) {
				throw new Error(`Name '${name}' already in use.`)
			}
			const network = await this._buildNetwork(fence.profileId, name, rpcUrl, chainId, l1ChainId, "custom")
			const write = await this.storage.prepare(network.id, network)
			await commitFencedCreate(deletion, fence, write, () => this.storage.delete(network.id), {
				landed: () => this.emit("onNetworkAdded", network),
			})
			return network
		})
	}

	public async renameNetwork(id: string, name: string): Promise<Network> {
		validateParams(NetworkMethodSchemas.renameNetwork.params, [id, name], "renameNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(id), profile.id)
			if (network.name === name) return network
			const collision = (await this.storage.getValues()).find((n) => n.profileId === profile.id && n.id !== id && n.name === name)
			if (collision) throw new Error(`Name '${name}' already in use.`)
			network.name = name
			await this.storage.set(id, network)
			this.emit("onNetworkUpdated", network)
			return network
		})
	}

	public async deleteNetwork(id: string): Promise<Network> {
		validateParams(NetworkMethodSchemas.deleteNetwork.params, [id], "deleteNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(id), profile.id)
			const activeId = await this._readActive(profile.id)
			if (activeId === id) {
				throw new Error(`${ERR_ACTIVE_NETWORK}: Cannot delete the active network. Switch to another chain first.`)
			}
			if (this.resetRunning(id)) {
				throw new Error(`${ERR_RESET_RUNNING}: This network is being reset. Try again when the reset ends.`)
			}
			// Reserve BEFORE the cascade: the network row deliberately survives
			// until the cascade finishes, so "row exists" alone would admit a
			// journal create landing between its sweep and the row delete. The
			// reservation makes `isNetworkLive` refuse for the whole window.
			this.deletingNetworks.add(id)
			this.reservations.set(id, (this.reservations.get(id) ?? 0) + 1)
			try {
				await this.purgeChain(profile.id, network.chainId, network.id)
				// The way out of a reset that cannot finish: its journal and verdict go with the row, and
				// only after the purge, so a failed purge leaves the chain quarantined for the retry.
				await this.staleNetworks.withLock(profile.id, async () => {
					if ((await this.staleNetworks.getJournal(profile.id))?.networkId === id) {
						await this.staleNetworks.deleteJournalLocked(profile.id)
					}
					await this.staleNetworks.removeEntryLocked(profile.id, id)
				})
				await this.storage.delete(id)
			} finally {
				this.deletingNetworks.delete(id)
			}
			this.routes.delete(network.id)
			this.emit("onNetworkDeleted", network)
			return network
		})
	}

	/** Network ids whose delete cascade is in progress — see `isNetworkLive`. */
	private readonly deletingNetworks = new Set<string>()
	/** Reservations ever made per network id, never decremented: a reservation that began and ended
	 *  during a liveness read still moves its count. */
	private readonly reservations = new Map<string, number>()

	/** A reservation is open now, or one began since `countBefore` was read. */
	private reservedSince(networkId: string, countBefore: number): boolean {
		return this.deletingNetworks.has(networkId) || (this.reservations.get(networkId) ?? 0) !== countBefore
	}

	/**
	 * Whether a network row exists AND is not mid-deletion. In-memory only:
	 * a SW restart kills both the flag and any stale creator closure that
	 * captured the network, so cross-restart staleness cannot occur. A read
	 * that a reservation overlapped answers false: its cascade may already have
	 * swept what the caller is about to treat as live. With `since`, a mark from
	 * {@link captureLiveness}, a reservation begun after the mark answers false too.
	 */
	public async isNetworkLive(networkId: string, since?: number): Promise<boolean> {
		await this.ensureInitialized()
		const countBefore = since ?? this.reservations.get(networkId) ?? 0
		if (this.deletingNetworks.has(networkId)) return false
		const row = await this.storage.get(networkId)
		return row !== undefined && !this.reservedSince(networkId, countBefore)
	}

	/**
	 * A mark for {@link isNetworkLive}, for work that spans awaits before its write: undefined
	 * unless the network is live now. Never taken while a reservation is open, since one that
	 * closes before the write would leave the count the mark holds.
	 */
	public async captureLiveness(networkId: string): Promise<number | undefined> {
		const mark = this.reservations.get(networkId) ?? 0
		return (await this.isNetworkLive(networkId, mark)) ? mark : undefined
	}

	/** Chain-keyed variant of {@link isNetworkLive} for writers that carry only
	 *  (profileId, chainId) — false when no network row exists for the pair OR
	 *  the row is reserved-deleting. Deliberately lock-free: liveness checks run
	 *  inside OTHER services' critical sections (see TokenService.clearChainState
	 *  on why the sweep/create ordering depends on that). */
	public async isChainLive(profileId: string, chainId: number): Promise<boolean> {
		await this.ensureInitialized()
		// Copied before the read: the network it resolves is known only after.
		const countsBefore = new Map(this.reservations)
		const network = (await this.storage.getValues()).find((n) => n.profileId === profileId && n.chainId === chainId)
		return network !== undefined && !this.reservedSince(network.id, countsBefore.get(network.id) ?? 0)
	}

	/** {@link isChainLive} for a dApp asking to connect, where a profile counts as having every default
	 *  it was never offered, and one whose first defaults are being written as having them all: the
	 *  shell's bootstrap writes them, which the activation's drain of queued discoveries can outrun.
	 *  Lock-free, like `isChainLive`. */
	public async servesChain(profileId: string, chainId: number): Promise<boolean> {
		await this.ensureInitialized()
		// Before the rows: a pass writes its rows before the record, so a record that names a seed is
		// never read beside rows from before that seed's row.
		const record = await readSeedOffers(this.browserApi.storage.local, profileId)
		const rows = (await this.storage.getValues()).filter((n) => n.profileId === profileId)
		if (this.seedingProfiles.has(profileId) && isSeedChain(chainId)) return true
		const network = rows.find((n) => n.chainId === chainId)
		if (network) return !this.deletingNetworks.has(network.id)
		return seedsToOffer(DEFAULT_SEEDS, record, rows)?.add.some((seed) => seed.chainId === chainId) ?? false
	}

	/**
	 * The network the active profile's arrival names: the first announced kind, in kind order, that a
	 * row of the profile holds. Null while nothing is announced or the record does not read. Lock-free.
	 */
	public async getNetworkArrival(): Promise<Network | null> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const record = await readSeedOffers(this.browserApi.storage.local, profile.id)
		if (record.kind !== "valid" || !record.value.announce?.length) return null
		const rows = (await this.storage.getValues()).filter((n) => n.profileId === profile.id)
		for (const kind of [...record.value.announce].sort()) {
			const row = rows.find((n) => n.kind === kind)
			if (row) return row
		}
		return null
	}

	/** Answers the arrival of `networkId` without switching to it. */
	public async answerNetworkArrival(networkId: string): Promise<void> {
		validateParams(NetworkMethodSchemas.answerNetworkArrival.params, [networkId], "answerNetworkArrival")
		await this.ensureInitialized()
		const fence = await this.profileService.captureExecutionFence()
		const deletion = this.profileService.getDeletionState()
		await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(networkId), fence.profileId)
			await this.answerArrivalLocked(network, fence, deletion)
		})
	}

	/** Drops the network's kind from the announced ones, fenced and compensated as the pass writes
	 *  the record. Caller holds the network lock. */
	private async answerArrivalLocked(network: Network, fence: DeletionFence, deletion: ProfileDeletionState): Promise<void> {
		const record = await readSeedOffers(this.browserApi.storage.local, network.profileId)
		if (record.kind !== "valid" || network.kind === undefined || !record.value.announce?.includes(network.kind)) return
		const announce = record.value.announce.filter((kind) => kind !== network.kind)
		await this.recordOffersLocked(network.profileId, record, { ...record.value, announce }, fence, deletion)
	}

	/** {@link servesChain} for a chain the dApp may also use now: a quarantined chain keeps its row
	 *  (so its sessions are not dropped) but serves no new connection. */
	public async servesLiveChain(profileId: string, chainId: number): Promise<boolean> {
		return (await this.servesChain(profileId, chainId)) && !(await this.isChainQuarantined(profileId, chainId))
	}

	/**
	 * Whether `chainId` must not be used in `profileId`: a stale-network record entry names it, a
	 * reset journal starts or ends on it, or a seeded row on it is behind this build's seed. The
	 * last is read from the row, so it holds before any classification lands. Lock-free.
	 */
	public async isChainQuarantined(profileId: string, chainId: number): Promise<boolean> {
		await this.ensureInitialized()
		const [state, rows] = await Promise.all([this.staleNetworks.readQuarantineState(profileId), this.storage.getValues()])
		if (quarantinedBy(state, chainId)) return true
		return rows.some((n) => n.profileId === profileId && n.chainId === chainId && hasNetworkCause(n))
	}

	public async setActiveNetwork(id: string): Promise<Network> {
		validateParams(NetworkMethodSchemas.setActiveNetwork.params, [id], "setActiveNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const deletion = this.profileService.getDeletionState()
		const fence = { profileId: profile.id, epoch: deletion.capture(profile.id) }
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(id), profile.id)
			const previousId = await this._readActive(profile.id)
			const previous = previousId === undefined || previousId === id ? undefined : await this.storage.get(previousId)
			await this._writeActive(profile.id, id)
			// A switch from another live network answers the arrival of the one it switches to, whichever
			// screen made it. Re-asserting the pointer, or falling back from a missing one, is no answer.
			if (previous?.profileId === profile.id) {
				try {
					await this.answerArrivalLocked(network, fence, deletion)
				} catch (error) {
					this.logError("Failed to answer a network arrival", { error })
				}
			}
			// The route is built at the first read, so a stored URL the transport rule refuses fails where
			// an unreachable node fails, never popup start before Settings could fix it.
			this.routes.delete(network.id)
			this.emit("onActiveNetworkChanged", network)
			return network
		})
	}

	// ── Endpoint mutations ───────────────────────────────────────────────

	public async addEndpoint(networkId: string, label: string | undefined, rawRpcUrl: string): Promise<NetworkEndpoint> {
		const [, , rpcUrl] = validateParams(NetworkMethodSchemas.addEndpoint.params, [networkId, label, rawRpcUrl], "addEndpoint")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		// Peek the network's kind unlocked so a loopback endpoint of a `local` row reads as chain 0
		// whatever its URL. The lock-guarded re-read below handles the (rare) deletion race.
		const peek = requireOwnedRow(await this.storage.get(networkId), profile.id)
		const probed = await this._probeChainIdentity(rpcUrl, peek.kind)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
			await this.refuseWhileResetHolds(profile.id, networkId)
			assertSameChainIdentity(probed, network)
			const normalized = normalizeRpcUrl(rpcUrl)
			if (network.endpoints.some((e) => e.rpcUrl === normalized)) {
				throw new Error(`${ERR_DUPLICATE_ENDPOINT}: This URL is already an endpoint of this network.`)
			}
			const endpoint: NetworkEndpoint = {
				id: this._fresh8(network.endpoints.map((e) => e.id)),
				rpcUrl: normalized,
				label: trimmedLabel(label),
			}
			network.endpoints.push(endpoint)
			await this.storage.set(network.id, network)
			this.routes.delete(network.id)
			this.emit("onNetworkUpdated", network)
			return endpoint
		})
	}

	public async updateEndpoint(
		networkId: string,
		endpointId: string,
		label: string | undefined,
		rawRpcUrl: string,
	): Promise<NetworkEndpoint> {
		const [, , , rpcUrl] = validateParams(
			NetworkMethodSchemas.updateEndpoint.params,
			[networkId, endpointId, label, rawRpcUrl],
			"updateEndpoint",
		)
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const normalized = normalizeRpcUrl(rpcUrl)
		// Peek the network's kind so a loopback endpoint of a `local` row reads as chain 0 whatever its URL.
		const peek = requireOwnedRow(await this.storage.get(networkId), profile.id)
		// Probe outside the lock even for an unchanged URL: the node's chain identity may have drifted.
		const probed = await this._probeChainIdentity(rpcUrl, peek.kind)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
			await this.refuseWhileResetHolds(profile.id, networkId)
			assertSameChainIdentity(probed, network)
			const idx = network.endpoints.findIndex((e) => e.id === endpointId)
			if (idx < 0) throw new Error("Invalid endpoint id")
			const collision = network.endpoints.find((e, i) => i !== idx && e.rpcUrl === normalized)
			if (collision) throw new Error(`${ERR_DUPLICATE_ENDPOINT}: Another endpoint of this network uses that URL.`)
			const oldUrl = network.endpoints[idx]!.rpcUrl
			const updated: NetworkEndpoint = {
				id: endpointId,
				rpcUrl: normalized,
				label: trimmedLabel(label),
			}
			network.endpoints[idx] = updated
			await this.storage.set(network.id, network)
			this.transientNodes.delete(oldUrl)
			this.routes.delete(network.id)
			this.emit("onNetworkUpdated", network)
			return updated
		})
	}

	public async deleteEndpoint(networkId: string, endpointId: string): Promise<NetworkEndpoint> {
		validateParams(NetworkMethodSchemas.deleteEndpoint.params, [networkId, endpointId], "deleteEndpoint")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
			await this.refuseWhileResetHolds(profile.id, networkId)
			const idx = network.endpoints.findIndex((e) => e.id === endpointId)
			if (idx < 0) throw new Error("Invalid endpoint id")
			if (network.endpoints.length === 1) {
				throw new Error(`${ERR_LAST_ENDPOINT}: Cannot delete the last endpoint. Delete the network instead.`)
			}
			if (network.primaryEndpointId === endpointId) {
				throw new Error(`${ERR_PRIMARY_ENDPOINT}: Cannot delete the primary endpoint. Make another endpoint primary first.`)
			}
			const removed = network.endpoints.splice(idx, 1)[0]!
			await this.storage.set(network.id, network)
			this.transientNodes.delete(removed.rpcUrl)
			this.routes.delete(network.id)
			this.emit("onNetworkUpdated", network)
			return removed
		})
	}

	public async setPrimaryEndpoint(networkId: string, endpointId: string): Promise<Network> {
		validateParams(NetworkMethodSchemas.setPrimaryEndpoint.params, [networkId, endpointId], "setPrimaryEndpoint")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
			await this.refuseWhileResetHolds(profile.id, networkId)
			const endpoint = network.endpoints.find((e) => e.id === endpointId)
			if (!endpoint) throw new Error("Invalid endpoint id")
			if (network.chainId === 0 && !isLocalNetworkTarget(endpoint.rpcUrl, network.kind)) {
				throw new Error(`${ERR_ENDPOINT_CHAIN_MISMATCH}: Only a node on this machine can serve chain 0.`)
			}
			if (network.primaryEndpointId === endpointId) return network
			network.primaryEndpointId = endpointId
			await this.storage.set(network.id, network)
			this.routes.delete(network.id)
			this.emit("onPrimaryEndpointChanged", { networkId: network.id, endpointId })
			this.emit("onNetworkUpdated", network)
			return network
		})
	}

	public async reorderEndpoints(networkId: string, endpointIds: string[]): Promise<Network> {
		validateParams(NetworkMethodSchemas.reorderEndpoints.params, [networkId, endpointIds], "reorderEndpoints")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return await this.lock.withLock(async () => {
			const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
			await this.refuseWhileResetHolds(profile.id, networkId)
			const endpoints = endpointsInOrder(network, endpointIds)
			const first = endpoints[0]!
			if (network.chainId === 0 && !isLocalNetworkTarget(first.rpcUrl, network.kind)) {
				throw new Error(`${ERR_ENDPOINT_CHAIN_MISMATCH}: Only a node on this machine can serve chain 0.`)
			}
			if (routeEndpoints(network).every((e, i) => e.id === endpointIds[i])) return network
			const primaryMoved = network.primaryEndpointId !== first.id
			network.endpoints = endpoints
			network.primaryEndpointId = first.id
			await this.storage.set(network.id, network)
			this.routes.delete(network.id)
			if (primaryMoved) this.emit("onPrimaryEndpointChanged", { networkId: network.id, endpointId: first.id })
			this.emit("onNetworkUpdated", network)
			return network
		})
	}

	public async getRouteSnapshot(networkId: string, shown: readonly RouteEndpoint[]): Promise<RouteSnapshot | null> {
		validateParams(NetworkMethodSchemas.getRouteSnapshot.params, [networkId, shown], "getRouteSnapshot")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
		const info = networkInfoFrom(network)
		// A list another window has since edited is answered for no route: ids outlive a URL edit.
		const same =
			info.endpoints.length === shown.length && info.endpoints.every((e, i) => e.id === shown[i]?.id && e.rpcUrl === shown[i]?.rpcUrl)
		return same ? this.pxeServiceClient.getRouteSnapshot(info) : null
	}

	/** A reset's resume keeps the primary endpoint only while it is the one the capture probed, and
	 *  otherwise adds the seed's, so a network a journal names keeps its endpoints as captured. Runs
	 *  under `this.lock`, which the capture holds while it writes the journal. */
	private async refuseWhileResetHolds(profileId: string, networkId: string): Promise<void> {
		if ((await this.staleNetworks.getJournal(profileId))?.networkId === networkId) {
			throw new Error(`${ERR_RESET_PENDING}: Finish the network reset before editing its endpoints.`)
		}
	}

	// ── Status / node accessors ──────────────────────────────────────────

	/** `Active` while any endpoint of the network answers for its chain, read through its route;
	 *  `InvalidChain` when every endpoint that answered serves another chain. */
	public async getNodeStatus(networkId: string): Promise<NodeStatus> {
		validateParams(NetworkMethodSchemas.getNodeStatus.params, [networkId], "getNodeStatus")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
		if (!findPrimaryEndpoint(network)) return NodeStatus.Inactive
		let node: RoutedNode | undefined
		try {
			node = await this.getNodeFor(network)
			const info = await node.getNodeInfo()
			const url = network.endpoints.find((e) => e.id === node?.route.active()?.id)?.rpcUrl ?? ""
			return nodeChainId(url, network.kind, walletChainId(info.l1ChainId, info.rollupVersion)) === network.chainId
				? NodeStatus.Active
				: NodeStatus.InvalidChain
		} catch {
			const states = node?.route.snapshot().map((e) => e.state) ?? []
			const served = states.some((state) => state === "ready" || state === "behind")
			return states.includes("wrong-chain") && !served ? NodeStatus.InvalidChain : NodeStatus.Inactive
		}
	}

	/**
	 * `getNodeStatus` within `timeoutMs`: one bounded identity probe per endpoint, the route's active
	 * endpoint first, then the rest in preference order, stopping at the first that serves the chain.
	 * While the active endpoint answers, nothing else is asked. Each probe gets at most an equal share
	 * of the time left among the endpoints still to ask, so a hanging one cannot spend the next one's.
	 */
	public async probeNodeStatus(networkId: string, timeoutMs: number): Promise<NodeStatus> {
		validateParams(NetworkMethodSchemas.probeNodeStatus.params, [networkId, timeoutMs], "probeNodeStatus")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		const network = requireOwnedRow(await this.storage.get(networkId), profile.id)
		if (!findPrimaryEndpoint(network)) return NodeStatus.Inactive
		const deadline = Date.now() + timeoutMs
		const active = this.routes.get(network.id)?.node.route.active()?.id
		const endpoints = routeEndpoints(network).sort((a, b) => Number(b.id === active) - Number(a.id === active))
		let otherChain = false
		for (const [index, endpoint] of endpoints.entries()) {
			const left = deadline - Date.now()
			if (left <= 0) break
			try {
				const probed = await this.nodeFactory.probeChainId(endpoint.rpcUrl, Math.floor(left / (endpoints.length - index)))
				if (nodeChainId(endpoint.rpcUrl, network.kind, probed) === network.chainId) return NodeStatus.Active
				otherChain = true
			} catch {
				// Unreachable within the budget: the next endpoint may serve.
			}
		}
		return otherChain ? NodeStatus.InvalidChain : NodeStatus.Inactive
	}

	/** The active profile's network on `chainId`, routed across its endpoints. */
	public async getNode(chainId: number): Promise<AztecNode> {
		await this.ensureInitialized()
		const network = await this.lock.withLock(async () => {
			const profile = await requireActiveProfile(this.profileService)
			const row = (await this.storage.getValues()).find((n) => n.profileId === profile.id && n.chainId === chainId)
			if (!row) throw new Error(`No network configured for chainId ${chainId}`)
			return row
		})
		return this.getNodeFor(network)
	}

	/**
	 * The routed node of `network`'s own row, never the active profile's: a profile switch mid-call
	 * must not send this row's reads to a provider the other profile chose. Rebuilt when the row's
	 * chain identity or endpoint list differs from the one the cached route was built for.
	 */
	public async getNodeFor(network: Network): Promise<RoutedNode> {
		await this.ensureInitialized()
		const endpoints = routeEndpoints(network)
		const key = JSON.stringify([network.chainId, network.l1ChainId, endpoints])
		const cached = this.routes.get(network.id)
		if (cached?.key === key) return cached.node
		const node = this.nodeFactory.createRoutedNode({ chainId: network.chainId, l1ChainId: network.l1ChainId, endpoints })
		this.routes.set(network.id, { key, node })
		return node
	}

	/** One attempt at `network`'s active endpoint within the caller's own budget, fed into its
	 *  route's health and never moved. */
	public async getSingleAttemptNodeFor(network: Network, timeoutMs: number): Promise<AztecNode> {
		return (await this.getNodeFor(network)).route.singleAttempt(timeoutMs)
	}

	/** One bounded, silent storage read at the latest block of `network`'s active endpoint.
	 *  Background-only: not an RPC method. Throws on a timeout, a refusal or no value. */
	public async readPublicStorageOnce(network: Network, contract: AztecAddress, slot: Fr, timeoutMs: number): Promise<Fr> {
		const node = await this.getSingleAttemptNodeFor(network, timeoutMs)
		const value = await node.getPublicStorageAt("latest", contract, slot)
		// The SDK resolves a `null` result as `undefined` rather than rejecting it.
		if (value === undefined) throw new Error(`Network ${network.id} read no value`)
		return value
	}

	/**
	 * The retrying client for `url` alone, never the active profile's node: a submission and the
	 * receipts read on its recorded endpoint stay there through a primary swap, a failover or a
	 * profile switch. `url` is wallet-written, captured from an allowlisted endpoint at submit time.
	 */
	public async getNodeForUrl(url: string): Promise<AztecNode> {
		await this.ensureInitialized()
		const cached = this.transientNodes.get(url)
		if (cached) return cached
		const created = this.nodeFactory.createNode(url)
		this.transientNodes.set(url, created)
		return created
	}

	/**
	 * {@link getNodeForUrl}'s pinning for a caller that retries on its own schedule: every call
	 * through the returned client is one attempt, so nothing leaves after the caller stops.
	 */
	public async getSingleAttemptNodeForUrl(url: string): Promise<AztecNode> {
		await this.ensureInitialized()
		const cached = this.singleAttemptNodes.get(url)
		if (cached) return cached
		const created = this.nodeFactory.createSingleAttemptNode(url, DEFAULT_REQUEST_TIMEOUT_MS)
		this.singleAttemptNodes.set(url, created)
		return created
	}

	/** The proposed tip of the network's active endpoint, read past the PXE's chain guard, which would
	 *  wait behind a proof, in one silent attempt. Background-only: not an RPC method. */
	public async readChainTip(networkId: string): Promise<number> {
		const node = await this.getSingleAttemptNodeFor(await this.getNetwork(networkId), DEFAULT_REQUEST_TIMEOUT_MS)
		return Number(await node.getBlockNumber())
	}

	/** The network as the offscreen PXE takes it: its identity and its endpoints in preference order. */
	public async getNetworkInfo(networkId: string): Promise<NetworkInfo> {
		await this.ensureInitialized()
		return networkInfoFrom(await this.getNetwork(networkId))
	}

	// ── Stale-network reset ──────────────────────────────────────────────

	private resetRunning: (networkId: string) => boolean = () => false

	/** Set by the reset service, which owns the run lock: `deleteNetwork` refuses a network it names. */
	public setResetRunProbe(probe: (networkId: string) => boolean): void {
		this.resetRunning = probe
	}

	/** One identity read of `rpcUrl` whose request dies with `timeoutMs` and is never retried. */
	public async probeIdentityOnce(
		rpcUrl: string,
		kind: ChainKind | undefined,
		timeoutMs: number,
	): Promise<{ chainId: number; l1ChainId: number }> {
		const info = await this.nodeFactory.createSingleAttemptNode(rpcUrl, timeoutMs).getNodeInfo()
		return { chainId: nodeChainId(rpcUrl, kind, walletChainId(info.l1ChainId, info.rollupVersion)), l1ChainId: info.l1ChainId }
	}

	/**
	 * Runs `write` under the network lock while the row is still on `chainId`, not being deleted,
	 * no other row holds `toChainId`, and, when `primary` is given, its primary endpoint still has
	 * that id and URL. A reset's capture commits its journal here, so a change that landed after the
	 * popup's view refuses; once the journal exists, `addNetwork` refuses `toChainId` itself.
	 */
	public async commitResetCapture(
		profileId: string,
		networkId: string,
		check: { chainId: number; toChainId: number; primary: ProbedEndpoint | null },
		write: () => Promise<void>,
	): Promise<void> {
		await this.ensureInitialized()
		await this.lock.withLock(async () => {
			const row = await this.storage.get(networkId)
			if (row?.profileId !== profileId || row.chainId !== check.chainId || this.deletingNetworks.has(networkId)) {
				throw notResettable("the network changed before the reset began")
			}
			const rows = await this.storage.getValues()
			if (rows.some((n) => n.profileId === profileId && n.id !== networkId && n.chainId === check.toChainId)) {
				throw notResettable("another network holds the new chain")
			}
			if (primaryMoved(row, check)) throw new Error(`${ERR_STALE_CHANGED}: the network's node changed before the reset began`)
			await write()
		})
	}

	/**
	 * The network half of an in-place reset. Unless `purged`, reserves the row as `deleteNetwork`
	 * does, releases the lock, and purges under the reservation, so other chains' `getNode` never
	 * waits on this chain's PXE drain. Then, when the row is not on `toChainId`, rewrites its chain
	 * identity from the build's seed under the lock, keeping its id, name and active pointer. A
	 * failed purge step throws with the row untouched.
	 */
	public async resetChainInPlace(req: ChainResetRequest, hooks: ChainResetHooks): Promise<Network> {
		await this.ensureInitialized()
		if (!req.purged) {
			await this.lock.withLock(async () => {
				const row = await this.storage.get(req.networkId)
				if (row?.profileId !== req.profileId || row.chainId !== req.fromChainId) {
					throw notResettable("the network is not on the chain the reset purges")
				}
				this.deletingNetworks.add(req.networkId)
				this.reservations.set(req.networkId, (this.reservations.get(req.networkId) ?? 0) + 1)
			})
			try {
				await hooks.beforePurge()
				await this.purgeChain(req.profileId, req.fromChainId, req.networkId)
				await hooks.afterPurge()
			} finally {
				this.deletingNetworks.delete(req.networkId)
			}
			await hooks.onPurged()
		}
		return await this.lock.withLock(() => this.rewriteForResetLocked(req))
	}

	/** Caller holds the network lock. Idempotent: a row already on `toChainId` is returned as is. */
	private async rewriteForResetLocked(req: ChainResetRequest): Promise<Network> {
		const row = await this.storage.get(req.networkId)
		if (row?.profileId !== req.profileId) throw notResettable("the network is gone")
		if (row.chainId === req.toChainId) return row
		const seed = seedForKind(row.kind)
		if (row.chainId !== req.fromChainId || seed?.chainId !== req.toChainId) {
			throw notResettable("the network's chain is not the reset's")
		}
		const rows = await this.storage.getValues()
		if (rows.some((n) => n.profileId === req.profileId && n.id !== row.id && n.chainId === req.toChainId)) {
			throw notResettable("another network holds the new chain")
		}
		const primaryBefore = row.primaryEndpointId
		row.chainId = seed.chainId
		row.l1ChainId = seed.l1ChainId
		this.applyResetEndpoint(row, seed, req)
		await this.storage.set(row.id, row)
		this.routes.delete(row.id)
		if (row.primaryEndpointId !== primaryBefore) {
			this.emit("onPrimaryEndpointChanged", { networkId: row.id, endpointId: row.primaryEndpointId })
		}
		this.emit("onNetworkUpdated", row)
		return row
	}

	/** The user's primary survives only while it is the endpoint the popup probed and found serving
	 *  the new chain; otherwise the seed's endpoint, added if missing, becomes primary. */
	private applyResetEndpoint(row: Network, seed: DefaultSeed, req: ChainResetRequest): void {
		const primary = findPrimaryEndpoint(row)
		const probed = req.probedEndpoint
		if (!req.switchToSeedNode && probed && primary?.id === probed.id && primary.rpcUrl === probed.url) return
		let endpoint = row.endpoints.find((e) => isSeedEndpointUrl(seed, e.rpcUrl))
		if (!endpoint) {
			endpoint = {
				id: this._fresh8(row.endpoints.map((e) => e.id)),
				rpcUrl: normalizeRpcUrl(seed.rpcUrl),
				label: trimmedLabel(seed.endpointLabel),
			}
			row.endpoints.push(endpoint)
		}
		row.primaryEndpointId = endpoint.id
	}

	// ── Cascade coordinator ──────────────────────────────────────────────

	/**
	 * Awaited purge of all chain-scoped state for `(profileId, chainId)`.
	 * Called by `deleteNetwork` and `purgeForProfile` under the network lock, and by
	 * `resetChainInPlace` under a reservation only.
	 *
	 * Pipeline:
	 *  1. SW-side subscribers (registered via `registerChainPurgeSubscriber`
	 *     from each chain-keyed peer service's `init`). Run in registration
	 *     order. Expected peers + dependency order:
	 *       - TransactionService (stops polling first; no stale reads)
	 *       - TokenService (emits onTokenDeleted → TokenBalance reacts)
	 *       - FpcService
	 *       - AccountService (emits onAccountDeleted → AuthRegistry reacts)
	 *       - OperationJournalService (wipes journal by networkId)
	 *  2. Offscreen PXE clear via PxeServiceClient — ALWAYS last, hardcoded
	 *     here (not a subscriber) because peer-state must be wiped before
	 *     PXE resets, otherwise SW services could read against a fresh,
	 *     empty PXE store and get inconsistent state.
	 *
	 * Every step runs even when an earlier one fails, and any failure then
	 * rejects the purge, so no caller treats a partial purge as complete. The
	 * Network row is deleted by the caller (`deleteNetwork`) only after this
	 * method resolves.
	 */
	public async purgeChain(profileId: string, chainId: number, networkId: string): Promise<void> {
		// The deletion coordinator keeps its tombstone and retries (idempotent) on a rejection.
		const errors: unknown[] = []
		for (const subscriber of this.chainPurgeSubscribers) {
			try {
				await subscriber(profileId, chainId, networkId)
			} catch (error) {
				this.logError(`purgeChain subscriber failed for (${profileId}, ${chainId})`, error)
				errors.push(error)
			}
		}
		try {
			await this.pxeServiceClient.clearChainState(profileId, chainId)
		} catch (error) {
			this.logError("PxeServiceClient.clearChainState failed", error)
			errors.push(error)
		}
		this.emit("onChainPurged", { profileId, chainId })
		if (errors.length) {
			throw new Error(`purgeChain failed for (${profileId}, ${chainId}): ${errors.map(getErrorMessage).join("; ")}`)
		}
	}

	private readonly chainPurgeSubscribers: Array<(profileId: string, chainId: number, networkId: string) => Promise<void>> = []

	/**
	 * Register an awaited cleanup for chain-purge events. Peer services call
	 * this from their `init()`. Order matters — register in dependency order.
	 */
	public registerChainPurgeSubscriber(fn: (profileId: string, chainId: number, networkId: string) => Promise<void>): void {
		this.chainPurgeSubscribers.push(fn)
	}

	// ── Profile lifecycle ────────────────────────────────────────────────

	private readonly onActiveProfileChanged = async () => {
		await this.lock.withLock(async () => {
			this.routes.clear()
			this.transientNodes.clear()
		})
	}

	/** Awaited profile-scoped network purge, called by the deletion coordinator
	 *  (relocated from the removed fire-and-forget `onProfileDeleted` sub — D).
	 *  FAIL-FAST: a `purgeChain`/PXE failure now PROPAGATES (was log-and-continue)
	 *  so the coordinator keeps the tombstone + retries rather than reporting a
	 *  false "deleted". */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		this.logDebug(`purgeForProfile ${profileId}: purge chains + remove networks`)
		await this.lock.withLock(async () => {
			this.routes.clear()
			this.transientNodes.clear()
			const networks = (await this.storage.getValues()).filter((n) => n.profileId === profileId)
			for (const network of networks) {
				await this.purgeChain(profileId, network.chainId, network.id)
				await this.storage.delete(network.id)
				this.emit("onNetworkDeleted", network)
			}
			// Raw second pass — a validation-failed row this profile owns is
			// invisible to getValues() and would otherwise survive the purge forever.
			await purgeMalformedRows(
				this.storage,
				(raw) => raw.profileId === profileId,
				(id) => this.logDebug(`purged malformed network row ${id}`),
			)
			await this.browserApi.storage.local.remove([activeKey(profileId), seedOffersKey(profileId)])
		})
	}

	// ── Internals ────────────────────────────────────────────────────────

	private async _buildNetwork(
		profileId: string,
		name: string,
		rpcUrl: string,
		chainId: number,
		l1ChainId: number,
		kind: ChainKind,
		endpointLabel?: string,
	): Promise<Network> {
		if (chainId === 0 && (l1ChainId !== LOCAL_L1_CHAIN_ID || !isLoopbackRpcUrl(rpcUrl))) {
			throw new Error(`${ERR_ENDPOINT_CHAIN_MISMATCH}: Chain 0 is the Local Network: L1 ${LOCAL_L1_CHAIN_ID} on this machine.`)
		}
		const networkId = await this._freshStored8()
		const endpointId = `${networkId}-ep0`
		const endpoint: NetworkEndpoint = {
			id: endpointId,
			rpcUrl: normalizeRpcUrl(rpcUrl),
			label: trimmedLabel(endpointLabel),
		}
		return {
			id: networkId,
			profileId,
			chainId,
			l1ChainId,
			name,
			primaryEndpointId: endpointId,
			endpoints: [endpoint],
			kind,
		}
	}

	private async _freshStored8(): Promise<string> {
		return nextRandomId(this.storage)
	}

	private _fresh8(taken: string[]): string {
		const seen = new Set(taken)
		return randomIdNotIn((id) => seen.has(id))
	}

	/** One probe, both identities: the XOR composite (storage scoping) AND the exact `l1ChainId`
	 *  (key derivation). A caller that knows the network is local passes `kindHint`, so a Local
	 *  Network endpoint edited to another loopback URL still reads as chain 0. The local carve-outs zero only the COMPOSITE — the probed l1ChainId is
	 *  reported as-is, because derivation must never receive a synthetic 0. */
	private async _probeChainIdentity(rpcUrl: string, kindHint?: ChainKind): Promise<{ chainId: number; l1ChainId: number }> {
		let info: Awaited<ReturnType<AztecNode["getNodeInfo"]>>
		try {
			info = await this.nodeFactory.createNode(rpcUrl).getNodeInfo()
		} catch (error) {
			this.logError("Failed to fetch node info", error)
			throw new Error("Failed to fetch node info")
		}
		return { chainId: nodeChainId(rpcUrl, kindHint, walletChainId(info.l1ChainId, info.rollupVersion)), l1ChainId: info.l1ChainId }
	}

	private async _readActive(profileId: string): Promise<string | undefined> {
		const r = await this.browserApi.storage.local.get(activeKey(profileId))
		return decodeActiveNetworkId(r[activeKey(profileId)])
	}

	private async _writeActive(profileId: string, networkId: string): Promise<void> {
		await this.browserApi.storage.local.set({ [activeKey(profileId)]: networkId })
	}
}
