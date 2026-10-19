// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { Restored, ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { ContractNotFoundError } from "@nulo/extension-messaging/errors"
import { normalizeError } from "@nulo/wallet-core/jobs"
import type { ILogger } from "@/wallet/logger"
import { NetworkService, networkInfoFrom } from "@/wallet/services/network/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import type { OperationContext, OperationOrigin } from "@/wallet/services/operation-journal/spec"
import { ProfileService, type ProfileInfo } from "@/wallet/services/profile/service"
import type { RunFence } from "@/wallet/services/profile/spec"
import { type ExecutionFence, type ProfileDeletionState, profileDeletedError } from "@/wallet/services/profile/profile-deletion-state"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { requireOwnedRow } from "@/wallet/services/require-owned-row"
import { nextNumericId } from "@/wallet/services/id-allocators"
import { assertRestoreEpoch, captureRestoreEpochs, restoreRowProfileId } from "@/wallet/services/restore-fence"
import { restoreRows } from "@/wallet/services/restore-rows"
import { AccountService } from "@/wallet/services/account/service"
import { DEFAULT_SHALLOW_PXE_CLIENT_FACTORY, type ShallowPxeClient, type ShallowPxeClientFactory } from "@/wallet/services/pxe/shallow-port"
import { TaskService, StepContent, type WrappedTask } from "@/wallet/services/task/service"
import { canonicalNumericStorageId, purgeMalformedRows, purgeRows } from "@/wallet/services/purge-rows"
import { ContractResolver, ensureRegistered } from "@/wallet/services/execution/contract-resolver"
import { batchedViewSimulation } from "@/wallet/services/execution/helpers/batched-view-simulation"
import { EntityStorage } from "@/wallet/storage"
import { Lock } from "@/wallet/utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import { feeJuiceAddress, feeJuiceName, feeJuiceSymbol } from "@/wallet/utils/fee-juice"
import { buildViewCall, type ViewFn } from "@/wallet/utils/fn"
import { TokenListService } from "@/wallet/services/token-list/service"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"
import { type DefaultTokenSeed, seedsFromList } from "./default-tokens"
import { NAME_MAX_LENGTH, PinMismatchError, SYMBOL_MAX_LENGTH, TokenSeeder } from "./seeder"
import {
	type Token,
	type TokenAdded,
	type TokenInfo,
	type TokenDeleted,
	type TokenUpdated,
	type SeedScope,
	type SeedStatusSnapshot,
	TOKEN_SERVICE_NAME,
	TOKEN_STORAGE_ROOT,
	TokenSchema,
	type TokenInterface,
	type Methods,
	type Events,
} from "./spec"
import {
	createViewTokenFn,
	getDefaultTokenFn,
	getTokenFnCandidates,
	TOKEN_FN_DESCRIPTORS,
	type TokenArtifact,
	type TokenFnKind,
} from "./functions"

/** Every token-function kind resolved against one artifact, keyed by each descriptor's own `kind`. */
function resolveTokenFns(artifact: TokenArtifact) {
	const out = {} as Record<TokenFnKind, { candidates: ReturnType<typeof getTokenFnCandidates>; fn: ReturnType<typeof getDefaultTokenFn> }>
	for (const descriptor of Object.values(TOKEN_FN_DESCRIPTORS)) {
		const candidates = getTokenFnCandidates(descriptor, artifact)
		out[descriptor.kind] = { candidates, fn: getDefaultTokenFn(descriptor, candidates) }
	}
	return out
}
import { getTokenInfo, isTokenComplete } from "./utils"

type TokenMetadata = { name: string; symbol: string; decimals: number }

/** What a token-import record shows when the commit's read differs from what the approval window showed. */
export const TOKEN_DETAILS_CHANGED = "Token details changed after you approved them."

type PersistTokenInput = {
	/** Deletion fence captured at the AUTHORIZING entry (addToken /
	 *  addSeededToken), never minted here — a post-deletion mint would
	 *  observe the successor incarnation's settled epoch and pass. */
	fence: ExecutionFence
	profileId: string
	networkId: string
	tokenInterface: TokenInterface
	journal: { origin: OperationOrigin; accountAddress: string; title: string | undefined; subtitle: string }
	metadata:
		| ({ kind: "seeded" } & TokenMetadata)
		| { kind: "live"; fetch: () => Promise<[string, string, number]>; expected?: TokenMetadata }
}

/** How far a token add got under the tickets it held; the next attempt resumes from it. */
type AddProgress =
	| { stage: "start" }
	| { stage: "started" }
	| { stage: "fetched"; metadata: TokenMetadata }
	| { stage: "written"; token: Token }
	| { stage: "done"; info: TokenInfo }
type ResumableProgress = Exclude<AddProgress, { stage: "done" }>

type AddAttempt = {
	input: PersistTokenInput
	opId: string
	ownsLock: () => boolean
	/** Tracks one of the add's writes; a rejection journals the add's failure before the write settles. */
	track: <T>(write: Promise<T>) => Promise<T>
}

/** A restore, deletion or purge the lock's watchdog released refuses its next write with this. */
const tokenLockLost = () => new Error("token lock lost")

export * from "./functions"
export * from "./spec"

/** Seeder seams the composition root may replace. `getSeeds` is the only one a
 *  real build ever passes (armed e2e builds swap in the storage-backed list);
 *  the other two are unit-test levers. */
type SeederOverrides = {
	getVersion?: () => string
	enabled?: boolean
	/** `undefined` falls through to the signed list: an armed e2e build whose test wrote no seeds. */
	getSeeds?: () => Promise<readonly DefaultTokenSeed[] | undefined>
}

export class TokenService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getTokens",
		"getToken",
		"addToken",
		"deleteToken",
		"parseTokenInterface",
		"previewTokenMetadata",
		"getSeedStatus",
		"ensureSeeding",
		"retrySeed",
		"refreshRestoredTokens",
	)
	public static name = TOKEN_SERVICE_NAME

	/** The list's stored copy must be loaded before the first seed pass reads it. */
	public readonly dependencies = [TokenListService.name] as const

	public readonly onTokenAdded = new EventHandler<TokenAdded>()
	public readonly onTokenDeleted = new EventHandler<TokenDeleted>()
	public readonly onTokenUpdated = new EventHandler<TokenUpdated>()
	public readonly onSeedStatusChanged = new EventHandler<SeedScope>()

	private readonly tokens: EntityStorage<Token>
	private readonly lock = new Lock()
	/** Token-row writes, and a token add's journal writes, not yet settled. A holder the lock's
	 *  watchdog released keeps running, so every admission waits for these before it reads. */
	private readonly pendingWrites = new Set<Promise<unknown>>()
	private readonly browserApi: BrowserApi
	private readonly seederOverrides?: SeederOverrides
	private seeder: TokenSeeder = null!

	private pxeService: ShallowPxeClient = null!
	private profiles: ProfileService = null!
	private networks: NetworkService = null!
	private accounts: AccountService = null!
	private tasks: TaskService = null!
	private journal: OperationJournalService = null!
	private tokenList: TokenListService = null!
	/** Stateless; the execution service owns another. Depending on that service for it would be a cycle. */
	private readonly contractResolver: ContractResolver

	public constructor(
		logger: ILogger,
		browserApi: BrowserApi,
		private readonly pxeClientFactory: ShallowPxeClientFactory = DEFAULT_SHALLOW_PXE_CLIENT_FACTORY,
		seederOverrides?: SeederOverrides,
	) {
		super(TOKEN_SERVICE_NAME, logger)
		this.browserApi = browserApi
		this.seederOverrides = seederOverrides
		this.contractResolver = new ContractResolver(logger)
		this.tokens = new EntityStorage<Token>(TOKEN_STORAGE_ROOT, browserApi.storage.local, (raw) => TokenSchema.parse(raw))
	}

	protected async init(services: ServiceCollection) {
		this.pxeService = this.pxeClientFactory(this.logger)
		this.profiles = services.get(ProfileService.name)
		this.networks = services.get(NetworkService.name)
		this.accounts = services.get(AccountService.name)
		this.tasks = services.get(TaskService.name)
		this.journal = services.get(OperationJournalService.name)
		this.tokenList = services.get(TokenListService.name)
		// Profile-delete cleanup is now the coordinator's awaited `purgeForProfile` (D).
		this.networks.registerChainPurgeSubscriber(async (profileId, chainId) => this.clearChainState(profileId, chainId))

		// Default-token seeding: lazy, single-flight, TOFU-pinned (see
		// default-tokens.ts + seeder.ts). Triggered on unlock, on active-network
		// change, and on account creation; all three coalesce through
		// `seeder.run()`.
		this.seeder = new TokenSeeder(
			{
				getActiveProfile: () => this.profiles.getActiveProfile(),
				getActiveNetwork: () => this.networks.getActiveNetwork(),
				getSeeds: async () => (await this.seederOverrides?.getSeeds?.()) ?? seedsFromList(this.tokenList.getSnapshot()),
				// A quarantined scope reads as one with no accounts: the seeder then burns no attempt.
				getAccounts: async (profileId, chainId) =>
					(await this.networks.isChainQuarantined(profileId, chainId)) ? [] : await this.accounts.getAccounts(profileId, chainId),
				preview: async (networkId, accountAddress, contract, expectedClassId) =>
					await this.previewTokenMetadata(networkId, accountAddress, contract, expectedClassId),
				isTokenPresent: async (profileId, chainId, contract) => (await this.findToken(profileId, chainId, contract)) !== undefined,
				persist: async (input) => {
					await this.addSeededToken(input)
				},
				onStatusChanged: (scope) => this.emit("onSeedStatusChanged", scope),
			},
			this.browserApi.storage.local,
			this.logger,
			// A new list is a new version, so a default it re-pinned gets a fresh round.
			this.seederOverrides?.getVersion ??
				(() => `${chrome.runtime.getManifest().version}+${this.tokenList.getSnapshot()?.sequence ?? 0}`),
		)
		if (this.seederOverrides?.enabled !== false) {
			this.tokenList.onListChanged.add(this.onListChangedSeed)
			this.profiles.onActiveProfileChanged.add(this.onActiveProfileChangedSeed)
			this.networks.onActiveNetworkChanged.add(this.onActiveNetworkChangedSeed)
			this.accounts.onAccountAdded.add(this.onAccountAddedSeed)
		}
	}

	private readonly onActiveProfileChangedSeed = (profile: ProfileInfo | undefined): void => {
		if (!profile) return
		void this.seeder.run()
	}

	private readonly onActiveNetworkChangedSeed = (): void => {
		void this.seeder.run()
	}

	private readonly onListChangedSeed = (): void => {
		void this.seeder.listChanged()
	}

	/**
	 * The profile- and network-change triggers both fire BEFORE a chain's first
	 * account row exists — the popup creates networks, then accounts — so on a
	 * fresh profile (and on every switch to a chain with no accounts) those
	 * passes skip every seed at the zero-accounts guard. Without this third
	 * trigger nothing re-runs them and the defaults never land.
	 *
	 * Unguarded on purpose: `doRun` re-derives the active profile/network per
	 * pass and re-checks the purge epoch before committing, and the marker lock
	 * orders that commit against a purge. `run` single-flights.
	 */
	private readonly onAccountAddedSeed = (): void => {
		void this.seeder.run()
	}

	/**
	 * Wipe tokens for `(profileId, chainId)`. Emits `onTokenDeleted` per
	 * token so `TokenBalanceService` (already listening) cascades the
	 * matching token-balance rows. Called by `NetworkService.purgeChain`.
	 */
	public async clearChainState(profileId: string, chainId: number): Promise<void> {
		await this.ensureInitialized()
		// Seeder fence FIRST, and OUTSIDE the token lock: it bumps the seeder's
		// purge epoch and waits on the marker lock, so an in-flight seed pass
		// either aborts or fully commits BEFORE the row purge below. (Taking it
		// inside the lock would invert the seeder-commit's markerLock→tokenLock
		// order into a deadlock.)
		await this.seeder.onChainPurged(profileId, chainId)
		// NO token lock here — the caller (purgeChain) may hold the NETWORK lock
		// (watchdog-disabled by design), and persistToken's in-token-lock
		// metadata fetch takes the network lock via getNode: a sweep under the
		// token lock closes that pair into an ABBA deadlock broken only by the
		// token watchdog (5-minute freeze, then a displaced writer). Create-vs-
		// sweep atomicity is held by the CREATE side instead: every create
		// commits under the token lock with an isNetworkLive assert (false for
		// the whole purge — deletingNetworks reservation precedes the sweep) and
		// a POST-set isNetworkLive compensate for a reservation landing during
		// the set — so any row a purge could miss self-compensates, and any row
		// committed before the reservation is in this snapshot, once a displaced
		// holder's write in flight has landed.
		while (this.pendingWrites.size > 0) await Promise.allSettled(this.pendingWrites)
		const tokens = (await this.tokens.getValues()).filter((t) => t.profileId === profileId && t.chainId === chainId)
		await purgeRows(
			tokens,
			(token) => this.track(this.tokens.delete(`${token.id}`)),
			(token) => this.emit("onTokenDeleted", { ...getTokenInfo(token), profileId: token.profileId }),
		)
	}

	public async getTokens(profileId?: string, chainId?: number): Promise<TokenInfo[]> {
		return (await this.tokens.getValues())
			.filter(
				(token) =>
					(profileId === undefined || token.profileId === profileId) && (chainId === undefined || token.chainId === chainId),
			)
			.map(getTokenInfo)
	}

	public async getTokensRaw(profileId?: string, chainId?: number): Promise<Token[]> {
		return (await this.tokens.getValues()).filter(
			(token) => (profileId === undefined || token.profileId === profileId) && (chainId === undefined || token.chainId === chainId),
		)
	}

	public async getToken(id: number): Promise<TokenInfo> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles)
		const token = requireOwnedRow(await this.tokens.get(`${id}`), profile.id, "unknown token id")
		return getTokenInfo(token)
	}

	public async getTokenRaw(id: number): Promise<Token> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles)
		return requireOwnedRow(await this.tokens.get(`${id}`), profile.id, "unknown token id")
	}

	public async addToken(
		profileId: string,
		networkId: string,
		accountAddress: string,
		tokenInterface: TokenInterface,
		opContext: OperationContext,
	): Promise<TokenInfo> {
		await this.ensureInitialized()
		// The popup's authorizing entry IS this method — mint the fence here,
		// atomically (read + capture under the profile facade lock).
		const fence = await this.profiles.captureExecutionFence()
		return await this.addTokenWithFence(fence, profileId, networkId, accountAddress, tokenInterface, opContext)
	}

	/**
	 * Fence-threaded token creation for in-process callers whose AUTHORIZATION
	 * happened earlier (the dApp register_token dispatch): the commit asserts
	 * the CALLER's capture — a fresh mint here would bless a profile deleted
	 * and re-imported since that authorization (the successor's settled epoch
	 * passes every assert). Deliberately NOT in `rpcMethods`: a threaded fence
	 * is structural authority, and the wire surface must not accept one.
	 */
	public async addTokenAuthorized(
		fence: ExecutionFence,
		profileId: string,
		networkId: string,
		accountAddress: string,
		tokenInterface: TokenInterface,
		opContext: OperationContext,
		/** The details the approval window showed: the add stores only a read equal to them. */
		expected?: TokenMetadata,
	): Promise<TokenInfo> {
		await this.ensureInitialized()
		return await this.addTokenWithFence(fence, profileId, networkId, accountAddress, tokenInterface, opContext, expected)
	}

	private async addTokenWithFence(
		fence: ExecutionFence,
		profileId: string,
		networkId: string,
		accountAddress: string,
		tokenInterface: TokenInterface,
		opContext: OperationContext,
		expected?: TokenMetadata,
	): Promise<TokenInfo> {
		// A caller-supplied profileId that isn't the fence's fails closed.
		if (fence.profileId !== profileId) throw new Error("unauthorized profile")
		// The journal entry is created up-front (title=undefined) so
		// the tokens-view TokenImportRow pops in immediately after approval,
		// carrying the "Requested by <origin>" subtitle; `persistToken` backfills
		// the title once the live fetch resolves the symbol.
		return await this.persistToken({
			fence,
			profileId,
			networkId,
			tokenInterface,
			journal: {
				origin: opContext.origin,
				accountAddress,
				title: undefined,
				subtitle: opContext.origin === "dapp" ? `Requested by ${opContext.dappOrigin}` : "Adding token…",
			},
			metadata: {
				kind: "live",
				fetch: () => this.fetchTokenMetadata(profileId, networkId, accountAddress, tokenInterface),
				expected,
			},
		})
	}

	/**
	 * The shared token-persist machine behind `addToken` (live) and
	 * `addSeededToken` (seeded). The metadata source is a DISCRIMINATED value,
	 * not an open callback: the seeded arm carries only already-validated data
	 * and structurally cannot fetch — preserving the seeder's no-refetch TOCTOU
	 * fix by construction. The live arm's fetch (and its title backfill) runs
	 * INSIDE the token lock, in the not-yet-persisted branch only.
	 */
	private async persistToken(input: PersistTokenInput): Promise<TokenInfo> {
		const { fence, profileId, networkId, tokenInterface } = input

		// A stale authorization must not pass through ANY exit — the idempotent
		// short-circuit below would otherwise hand a deleted incarnation's flow a
		// successor's row as its own success.
		this.profiles.getDeletionState().assertCurrent(fence.profileId, fence.epoch)

		// Fast idempotency short-circuit.
		// If the token is already on this profile+chain, return without
		// creating a new journal entry or running a live metadata fetch.
		// Without this guard, a malicious or buggy dApp could spam
		// registerToken with the same contract address and force a PXE
		// round-trip + journal write per attempt. The lock still protects
		// the write path against concurrent imports of NEW addresses.
		const existing = await this.findToken(profileId, tokenInterface.chainId, tokenInterface.contract)
		if (existing) {
			// findToken parked: a delete + same-id re-import completing during it
			// makes `existing` the SUCCESSOR's row — re-assert so the stale flow
			// cannot exit success through the read path either.
			this.profiles.getDeletionState().assertCurrent(fence.profileId, fence.epoch)
			return getTokenInfo(existing)
		}

		const journalOp = await this.journal.createOperation({
			kind: "token_import",
			origin: input.journal.origin,
			profileId,
			accountAddress: input.journal.accountAddress,
			networkId,
			contractAddress: tokenInterface.contract,
			title: input.journal.title,
			subtitle: input.journal.subtitle,
		})

		// The lock's watchdog can release an attempt parked in the fetch or a liveness read; the
		// next attempt resumes its progress under a fresh ticket. Only one fetches, so a second
		// release needs a five-minute storage stall, and a bound would fail a slow add.
		let progress: ResumableProgress = { stage: "start" }
		for (;;) {
			const next = await this.withTokenLock((ownsLock) => this.persistAttempt(input, journalOp.id, progress, ownsLock))
			if (next.stage === "done") return next.info
			progress = next
		}
	}

	/**
	 * One attempt under one ticket. A by-id row write or delete is issued only right after a
	 * synchronous `ownsLock()`, and an emit or `succeeded` right after the deletion fence too: a
	 * released attempt returns its progress instead. A failure journals `failed` at once, owned or
	 * not, and a successor admitted after that waits for it.
	 */
	private async persistAttempt(
		input: PersistTokenInput,
		opId: string,
		progress: ResumableProgress,
		ownsLock: () => boolean,
	): Promise<AddProgress> {
		let failure: Promise<unknown> | undefined
		const fail = (error: unknown) =>
			(failure ??= this.track(
				this.journal.transitionOperation(opId, { stage: "failed" }, normalizeError(error, classifyTokenImportError(error))),
			))
		const attempt: AddAttempt = { input, opId, ownsLock, track: (write) => this.track(write, (error) => void fail(error)) }
		try {
			return await this.advanceAdd(attempt, progress)
		} catch (error) {
			await fail(error)
			throw error
		}
	}

	private async advanceAdd(attempt: AddAttempt, progress: ResumableProgress): Promise<AddProgress> {
		if (progress.stage === "written") return await this.resumeWritten(attempt, progress.token)
		const { input } = attempt
		if (progress.stage === "start") await attempt.track(this.journal.transitionOperation(attempt.opId, { stage: "simulating" }))
		const carried: ResumableProgress = progress.stage === "start" ? { stage: "started" } : progress
		// A same-contract add or restore that landed while an earlier attempt was released is this
		// add's result, as is the idempotent re-add: no write and no emit.
		const existing = await this.findToken(input.profileId, input.tokenInterface.chainId, input.tokenInterface.contract)
		if (existing) return attempt.ownsLock() ? await this.journalSucceeded(attempt, existing) : carried
		const metadata = carried.stage === "fetched" ? carried.metadata : await this.addMetadata(attempt)
		const token = buildToken(input.profileId, input.tokenInterface, metadata, await nextNumericId(this.tokens))
		// Assert authority flush against the write: the metadata fetch
		// can span a profile deletion or the network's purge cascade —
		// landing the row afterwards creates an orphan the cascade's own
		// snapshot predates.
		this.profiles.getDeletionState().assertCurrent(input.fence.profileId, input.fence.epoch)
		if (!(await this.networks.isNetworkLive(input.networkId))) {
			throw new Error("network deleted")
		}
		if (!attempt.ownsLock()) return { stage: "fetched", metadata }
		await attempt.track(this.tokens.set(`${token.id}`, token))
		// The set itself awaits — re-check before making the row observable. Released during it,
		// the add leaves the row to the purge, which drains this set before its snapshot.
		const { fence } = input
		if (!this.profiles.getDeletionState().isCurrent(fence.profileId, fence.epoch)) {
			if (attempt.ownsLock()) await attempt.track(this.tokens.delete(`${token.id}`))
			throw profileDeletedError(fence.profileId)
		}
		return await this.finishAdd(attempt, token)
	}

	private async addMetadata({ input, opId, track }: AddAttempt): Promise<TokenMetadata> {
		const { metadata } = input
		if (metadata.kind === "seeded") return { name: metadata.name, symbol: metadata.symbol, decimals: metadata.decimals }
		const [name, symbol, decimals] = await metadata.fetch()
		// Compared raw and before the title shows any of it; a resumed attempt reuses this read.
		const { expected } = metadata
		if (expected && (expected.name !== name || expected.symbol !== symbol || expected.decimals !== decimals)) {
			throw new Error(TOKEN_DETAILS_CHANGED)
		}
		// Backfill the title with the resolved symbol so the in-flight
		// TokenImportRow stops falling back to the short contract
		// address. Safe to call even if the row has already vanished
		// (setOperationMeta tolerates terminal records).
		await track(this.journal.setOperationMeta(opId, { title: cleanSymbol(symbol) }))
		return { name, symbol, decimals }
	}

	/**
	 * The add's own row is in place. The network leg of the compensate: the sweep runs WITHOUT the
	 * token lock (deadlock avoidance — see clearChainState), so a purge whose reservation landed
	 * during the set may have snapshotted before this row existed. Self-compensating here is what
	 * makes the lockless sweep complete.
	 */
	private async finishAdd(attempt: AddAttempt, token: Token): Promise<AddProgress> {
		const { fence, networkId } = attempt.input
		if (!(await this.networks.isNetworkLive(networkId))) return await this.dropOnDeadChain(attempt, token)
		if (!attempt.ownsLock()) return { stage: "written", token }
		// A deletion that began meanwhile: the add's handlers would act for the successor incarnation.
		if (!this.profiles.getDeletionState().isCurrent(fence.profileId, fence.epoch)) {
			await attempt.track(this.tokens.delete(`${token.id}`))
			throw profileDeletedError(fence.profileId)
		}
		this.emit("onTokenAdded", { ...getTokenInfo(token), profileId: token.profileId })
		return await this.journalSucceeded(attempt, token)
	}

	/** Deletes only under an owned ticket and only when no live network holds the chain: a
	 *  replacement network's restore can hold a row byte-identical to the add's own. */
	private async dropOnDeadChain(attempt: AddAttempt, token: Token): Promise<AddProgress> {
		const chainLive = await this.networks.isChainLive(token.profileId, token.chainId)
		if (!attempt.ownsLock()) return { stage: "written", token }
		if (!chainLive) await attempt.track(this.tokens.delete(`${token.id}`))
		throw new Error("network deleted")
	}

	/** A fresh ticket after a release that followed the set: a sweep or the person may have removed
	 *  the row since, and its id may hold a successor's token. */
	private async resumeWritten(attempt: AddAttempt, token: Token): Promise<AddProgress> {
		const { fence, networkId } = attempt.input
		// The purge owns a deleted profile's rows.
		if (!this.profiles.getDeletionState().isCurrent(fence.profileId, fence.epoch)) throw profileDeletedError(fence.profileId)
		const [own] = Object.values(this.tokens.item(`${token.id}`, token))
		if ((await this.tokens.rawValue(`${token.id}`)) === own) return await this.finishAdd(attempt, token)
		// The add completed and whatever removed its row announced that itself.
		if (!(await this.networks.isNetworkLive(networkId))) throw new Error("network deleted")
		return attempt.ownsLock() ? await this.journalSucceeded(attempt, token) : { stage: "written", token }
	}

	/** Success means "token added to watchlist"; the balance load is the caller's (NewTokenPopup's
	 *  balanceWait, TokenCard's initial-sync spinner on `updatedAt === 0`). The caller checked
	 *  the ticket in this same turn. */
	private async journalSucceeded(attempt: AddAttempt, token: Token): Promise<AddProgress> {
		const { fence } = attempt.input
		if (!this.profiles.getDeletionState().isCurrent(fence.profileId, fence.epoch)) throw profileDeletedError(fence.profileId)
		await attempt.track(this.journal.transitionOperation(attempt.opId, { stage: "succeeded" }))
		return { stage: "done", info: getTokenInfo(token) }
	}

	/**
	 * `withLock` for every token-row writer. The callback starts in the same turn that finds no
	 * tracked write in flight, and only while the ticket is owned; a ticket lost while draining
	 * queues again. So a write a released holder issued lands before any successor reads.
	 */
	private async withTokenLock<T>(fn: (ownsLock: () => boolean) => Promise<T>): Promise<T> {
		for (;;) {
			const admitted = await this.lock.withLock(async (ownsLock) => {
				while (this.pendingWrites.size > 0) await Promise.allSettled(this.pendingWrites)
				return ownsLock() ? { value: await fn(ownsLock) } : undefined
			})
			if (admitted) return admitted.value
		}
	}

	/** `onReject` runs before the write leaves the tracker, so what it issues is drained too. */
	private track<T>(write: Promise<T>, onReject?: (error: unknown) => void): Promise<T> {
		const tracked =
			onReject === undefined
				? write
				: write.catch((error: unknown) => {
						onReject(error)
						throw error
					})
		this.pendingWrites.add(tracked)
		const settled = () => this.pendingWrites.delete(tracked)
		void tracked.then(settled, settled)
		return tracked
	}

	/** Test/SW-internal trigger for a seed pass (also driven by the unlock and
	 *  network-change subscriptions wired in `init`). */
	public seedDefaultTokens(): Promise<void> {
		return this.seeder.run()
	}

	public async getSeedStatus(chainId: number): Promise<SeedStatusSnapshot> {
		await this.ensureInitialized()
		if (!Number.isSafeInteger(chainId)) return { scope: undefined, entries: [] }
		return await this.seeder.getStatus(chainId)
	}

	public async ensureSeeding(): Promise<void> {
		await this.ensureInitialized()
		if (this.seederOverrides?.enabled === false) return
		await this.seeder.ensureSeeding()
	}

	public async retrySeed(chainId: number, contract: string): Promise<boolean> {
		await this.ensureInitialized()
		return await this.seeder.retry(chainId, contract)
	}

	/** Listed defaults on `chainId` whose current pins `profileId`'s seeding verified on chain. SW-internal. */
	public async getVerifiedDefaults(profileId: string, chainId: number): Promise<DefaultTokenSeed[]> {
		await this.ensureInitialized()
		return await this.seeder.verifiedSeeds(profileId, chainId)
	}

	/** Re-arms a retry the previous service worker persisted but did not live to
	 *  run. SW-internal (the composition root calls it once the services are up). */
	public async resumeSeeding(): Promise<void> {
		await this.ensureInitialized()
		if (this.seederOverrides?.enabled === false) return
		await this.seeder.resume()
	}

	/**
	 * Seed-only persist path: writes the EXACT snapshot the seeder validated —
	 * no internal metadata re-fetch, closing the validate-then-refetch TOCTOU a
	 * hostile RPC could exploit (`addToken` re-simulates metadata; this must
	 * not). Same lock, same idempotency, same journal machinery as `addToken`,
	 * with `origin: "seed"` / "Default token" labeling. NOT on the RPC surface.
	 */
	public async addSeededToken(input: {
		profileId: string
		networkId: string
		accountAddress: string
		tokenInterface: TokenInterface
		name: string
		symbol: string
		decimals: number
	}): Promise<TokenInfo> {
		await this.ensureInitialized()
		const { profileId, networkId, accountAddress, tokenInterface, name, symbol, decimals } = input
		const fence = await this.profiles.captureExecutionFence()
		if (fence.profileId !== profileId) throw new Error("unauthorized profile")
		return await this.persistToken({
			fence,
			profileId,
			networkId,
			tokenInterface,
			journal: { origin: "seed", accountAddress, title: cleanSymbol(symbol), subtitle: "Default token" },
			metadata: { kind: "seeded", name, symbol, decimals },
		})
	}

	public async deleteToken(id: number): Promise<TokenInfo> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles)
		const token = requireOwnedRow(await this.tokens.get(`${id}`), profile.id, "unknown token id")
		// Every explicit user delete writes a permanent tombstone, listed or not: the
		// list can name the token later, and the seeder must never resurrect it — not on
		// the next unlock, and not after a network remove/re-add (tombstones survive
		// chain purges; only the attempt bookkeeping resets there).
		await this.seeder.markDeletedByUser(profile.id, token.chainId, token.contract)
		return this._deleteTokenById(id)
	}

	/**
	 * Delete a token row by id with NO active-profile ownership guard — the
	 * profile-delete cascade calls this for an explicit, possibly-INACTIVE
	 * profile's tokens (an active-profile guard here would throw and orphan
	 * them). The public `deleteToken` RPC does the ownership check first.
	 */
	private async _deleteTokenById(id: number, emit = true): Promise<TokenInfo> {
		return await this.withTokenLock((ownsLock) => this._deleteTokenByIdHoldingLock(id, ownsLock, emit))
	}

	/** Body of `_deleteTokenById`. The caller MUST already hold `this.lock`
	 *  (the lock is not reentrant — taking it again here would deadlock).
	 *  Released before it issues the remove, it refuses: the id may hold a successor's row by then. */
	private async _deleteTokenByIdHoldingLock(id: number, ownsLock: () => boolean, emit = true): Promise<TokenInfo> {
		const token = await this.tokens.get(`${id}`)
		if (!token) {
			throw new Error("unknown token id")
		}
		if (!ownsLock()) throw tokenLockLost()
		await this.track(this.tokens.delete(`${id}`))
		// Owned or not: this runs in the turn the delete lands, before a successor that drains it.
		if (emit) this.emit("onTokenDeleted", { ...getTokenInfo(token), profileId: token.profileId })
		return getTokenInfo(token)
	}

	/**
	 * `expectedClassId` is the seeder's TOFU pin: when provided, the FETCHED
	 * instance must present exactly that `currentContractClassId` (and echo
	 * the requested address) BEFORE the artifact is fetched or anything is
	 * registered in the PXE — a rejected seed leaves no artifact behind, and
	 * the returned interface derives from the SAME fetch that passed the pin
	 * (no refetch window for a hostile RPC to substitute). Mismatch throws
	 * `PinMismatchError`. Callers without a pin are unaffected.
	 */
	public async parseTokenInterface(
		networkId: string,
		contract: string,
		parentTask?: WrappedTask,
		expectedClassId?: string,
	): Promise<TokenInterface> {
		await this.ensureInitialized()
		const stepContent = new StepContent("Parsing token interface")
		const task = parentTask ? parentTask.startSubtask(stepContent) : this.tasks.startNewTask(stepContent)

		try {
			const network = await this.networks.getNetwork(networkId)
			if (!network) {
				throw new Error("unknown network id")
			}

			const pxe = this.pxeService.getPXE(networkInfoFrom(network))

			const address = AztecAddress.fromStringUnsafe(contract)
			// Every add stores the lower-case spelling a dApp call records, so exact comparisons match.
			const canonical = address.toString()
			const instance = await pxe.getContractInstance(address)
			if (!instance) {
				throw new ContractNotFoundError()
			}

			if (expectedClassId !== undefined) {
				if (instance.address.toString().toLowerCase() !== canonical) {
					throw new PinMismatchError(`instance address ${instance.address.toString()} ≠ requested ${contract}`)
				}
				if (instance.currentContractClassId.toString() !== expectedClassId) {
					throw new PinMismatchError(`class id ${instance.currentContractClassId.toString()} ≠ pinned ${expectedClassId}`)
				}
			}

			const artifact = await pxe.getContractArtifact(instance.currentContractClassId)
			if (!artifact) {
				throw new Error("contract artifact not found")
			}

			await ensureRegistered(pxe, canonical, instance, artifact)

			const fns = resolveTokenFns(artifact)

			const result: TokenInterface = {
				chainId: network.chainId,
				contract: canonical,
				classId: instance.currentContractClassId.toString(),
				getNameFn: fns.getName.fn?.getImpl(),
				getNameFnCandidates: fns.getName.candidates.map((x) => x.getImpl()),
				getSymbolFn: fns.getSymbol.fn?.getImpl(),
				getSymbolFnCandidates: fns.getSymbol.candidates.map((x) => x.getImpl()),
				getDecimalsFn: fns.getDecimals.fn?.getImpl(),
				getDecimalsFnCandidates: fns.getDecimals.candidates.map((x) => x.getImpl()),
				balanceOfPublicFn: fns.balanceOfPublic.fn?.getImpl(),
				balanceOfPublicFnCandidates: fns.balanceOfPublic.candidates.map((x) => x.getImpl()),
				balanceOfPrivateFn: fns.balanceOfPrivate.fn?.getImpl(),
				balanceOfPrivateFnCandidates: fns.balanceOfPrivate.candidates.map((x) => x.getImpl()),
				transferPublicFn: fns.transferPublic.fn?.getImpl(),
				transferPublicFnCandidates: fns.transferPublic.candidates.map((x) => x.getImpl()),
				transferPrivateFn: fns.transferPrivate.fn?.getImpl(),
				transferPrivateFnCandidates: fns.transferPrivate.candidates.map((x) => x.getImpl()),
				transferPublicToPrivateFn: fns.transferPublicToPrivate.fn?.getImpl(),
				transferPublicToPrivateFnCandidates: fns.transferPublicToPrivate.candidates.map((x) => x.getImpl()),
				transferPrivateToPublicFn: fns.transferPrivateToPublic.fn?.getImpl(),
				transferPrivateToPublicFnCandidates: fns.transferPrivateToPublic.candidates.map((x) => x.getImpl()),
				isComplete: false,
			}
			result.isComplete = isTokenComplete(result)
			task.complete()
			return result
		} catch (error) {
			task.fail(error)
			throw error
		}
	}

	/**
	 * Resolve a token's user-facing metadata (name, symbol, decimals) WITHOUT
	 * persisting anything. Wraps `parseTokenInterface` + the private
	 * `fetchTokenMetadata`. Used by the `register_token` popup pre-fetch so the
	 * user sees what they're approving before pressing Allow.
	 *
	 * The returned strings come from the on-chain contract — a malicious contract
	 * can return any name/symbol. UI MUST render the contract address alongside.
	 */
	public async previewTokenMetadata(
		networkId: string,
		accountAddress: string,
		contract: string,
		expectedClassId?: string,
	): Promise<{ name: string; symbol: string; decimals: number; interface: TokenInterface }> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles, "Wallet locked")
		const tokenInterface = await this.parseTokenInterface(networkId, contract, undefined, expectedClassId)
		const [name, symbol, decimals] = await this.fetchTokenMetadata(profile.id, networkId, accountAddress, tokenInterface)
		return { name, symbol, decimals, interface: tokenInterface }
	}

	private async fetchTokenMetadata(
		profileId: string,
		networkId: string,
		address: string,
		ti: TokenInterface,
	): Promise<[string, string, number]> {
		const network = await this.networks.getNetwork(networkId)
		if (!network) {
			throw new Error("unknown network id")
		}

		const account = await this.accounts.getAccountContract(profileId, network.chainId, address)

		const node = await this.networks.getNode(network.chainId)
		const pxe = this.pxeService.getPXE(networkInfoFrom(network))

		const getNameFn = ti.getNameFn ? createViewTokenFn(TOKEN_FN_DESCRIPTORS.getName, ti.getNameFn.name, ti.getNameFn.impl) : undefined
		const getSymbolFn = ti.getSymbolFn
			? createViewTokenFn(TOKEN_FN_DESCRIPTORS.getSymbol, ti.getSymbolFn.name, ti.getSymbolFn.impl)
			: undefined
		const getDecimalsFn = ti.getDecimalsFn
			? createViewTokenFn(TOKEN_FN_DESCRIPTORS.getDecimals, ti.getDecimalsFn.name, ti.getDecimalsFn.impl)
			: undefined

		// ONE batched read for whichever getters the interface has: three sequential simulations each
		// paid a node round-trip and a turn in the PXE's serial queue, on the path a fresh wallet waits on.
		const fns = [getNameFn, getSymbolFn, getDecimalsFn].filter((fn) => fn !== undefined)
		const calls = await Promise.all(fns.map((fn) => buildViewCall(ti.contract, fn, fn.buildArgs())))
		const { encoded } = await batchedViewSimulation(calls, {
			pxe,
			node,
			network,
			account,
			contractResolver: this.contractResolver,
			logger: this.logger,
		})
		// The direct-to-node arm leaves an empty slot for a return the node did not send; decoding it would
		// fail by accident rather than by rule.
		const read = (fn: ViewFn): unknown => {
			const values = encoded[fns.indexOf(fn)]
			if (!values?.length) throw new Error("token metadata read returned no value")
			return fn.unpackResult(values)
		}

		return [
			getNameFn ? (read(getNameFn) as string) : ti.contract === feeJuiceAddress ? feeJuiceName : "<name>",
			getSymbolFn ? (read(getSymbolFn) as string) : ti.contract === feeJuiceAddress ? feeJuiceSymbol : "<symbol>",
			getDecimalsFn ? (read(getDecimalsFn) as number) : 0,
		]
	}

	private async findToken(profileId: string, chainId: number, contract: string): Promise<Token | undefined> {
		const tokens = await this.tokens.getValues()
		// A row stored or restored in another spelling is still this contract.
		const key = contract.toLowerCase()
		return tokens.find((token) => token.profileId === profileId && token.chainId === chainId && token.contract.toLowerCase() === key)
	}

	/** Token ids harvested from RAW rows (codec-hidden included) owned by
	 *  `profileId` — feeds the deletion snapshot so a malformed parent's dependent
	 *  balance rows still cascade. The id comes from the TRUE storage key, never
	 *  the row's self-reported field, and only when the key CANONICALLY encodes
	 *  it: `Number("01") === 1`, so a non-canonical alias key must not donate a
	 *  DIFFERENT valid token's id to the cascade — and no balance
	 *  row can reference a non-canonical key anyway (its `token` field is a
	 *  number). Read-only. */
	public async rawTokenIdsForProfile(profileId: string): Promise<number[]> {
		const out = new Set<number>()
		for (const [id, raw] of await this.tokens.rawEntries()) {
			if (typeof raw !== "object" || raw === null) continue
			const r = raw as Record<string, unknown>
			if (r.profileId !== profileId) continue
			const n = canonicalNumericStorageId(id)
			if (n !== undefined) out.add(n)
		}
		return [...out]
	}

	/** Awaited profile-scoped token purge, called by the deletion coordinator
	 *  (relocated from the removed fire-and-forget `onProfileDeleted` sub — D).
	 *  Idempotent. `_deleteTokenById` emits `onTokenDeleted` with the authoritative
	 *  profileId, so token-balance/incoming cleanup stays profile-accurate. */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		this.logDebug(`purgeForProfile ${profileId}: remove related tokens`)
		await this.seeder.purgeForProfile(profileId)
		// The coordinator purged journals BEFORE this method runs, but a seed
		// commit landing in between creates a fresh `token_import` journal row
		// that nothing later sweeps. The seeder fence above guarantees no
		// further commits, so an idempotent journal re-purge here catches
		// exactly that window.
		await this.journal.purgeForProfile(profileId)
		// ONE lock hold across snapshot + typed deletes + raw pass: restore()
		// writes under this same lock, so it can neither land a row between the
		// two passes nor after either snapshot was taken. A purge the watchdog
		// released throws instead, and the coordinator keeps the tombstone.
		await this.withTokenLock(async (ownsLock) => {
			for (const token of (await this.tokens.getValues()).filter((x) => x.profileId === profileId)) {
				// SILENT (emit=false): the deletion coordinator awaits token-balance +
				// incoming-transfer purges DIRECTLY, so re-emitting onTokenDeleted here is
				// redundant and its fire-and-forget consumer could clobber a successor
				// that reuses the highest token id.
				await this._deleteTokenByIdHoldingLock(token.id, ownsLock, false)
			}
			// Raw second pass — a validation-failed row this profile owns is
			// invisible to getValues() and would otherwise survive the purge forever.
			await purgeMalformedRows(
				this.ownedRawTokens(ownsLock),
				(raw) => raw.profileId === profileId,
				(id) => this.logDebug(`purged malformed token row ${id}`),
			)
		})
	}

	/** The raw store a purge's second pass deletes through: each delete is tracked and refused,
	 *  in the turn it would be issued, once the ticket is lost. */
	private ownedRawTokens(ownsLock: () => boolean): Parameters<typeof purgeMalformedRows>[0] {
		return {
			rawStringEntries: () => this.tokens.rawStringEntries(),
			rawValue: (id) => this.tokens.rawValue(id),
			delete: (id) => {
				if (!ownsLock()) throw tokenLockLost()
				return this.track(this.tokens.delete(id))
			},
		}
	}

	public async refreshRestoredTokens(fence: RunFence, deadlineAt: number): Promise<void> {
		await this.ensureInitialized()
		await this.profiles.assertRunFence(fence)
		if (!(deadlineAt > Date.now())) return
		const rows = (await this.tokens.getValues()).filter((token) => token.profileId === fence.profileId)
		await Promise.all(rows.map((row) => this.refreshRestoredToken(fence, row, deadlineAt)))
	}

	/** Unpinned: a restored row holds no class, so its class comes from this read alone. */
	private async refreshRestoredToken(fence: RunFence, row: Token, deadlineAt: number): Promise<void> {
		const read = await settleBy(this.readChainToken(fence, row), deadlineAt)
		if (read.kind !== "read") {
			this.logDebug("a restored token kept its backup metadata", { category: read.kind })
			return
		}
		await this.withTokenLock(async (ownsLock) => {
			const current = await this.tokens.get(`${row.id}`)
			// Deleted, or its id given to another token, during the read.
			if (!current || current.profileId !== row.profileId || current.chainId !== row.chainId || current.contract !== row.contract)
				return
			const next = { ...current, ...read.value }
			if (!refreshedFieldsDiffer(current, next) || !(await this.networks.isChainLive(row.profileId, row.chainId))) return
			// A read that landed after the deadline, or a session that ended since, writes nothing.
			if (!ownsLock() || Date.now() >= deadlineAt || !this.profiles.isFenceLive(fence)) return
			await this.track(this.tokens.set(`${row.id}`, next))
			// The chain sweep takes no token lock, so its delete can land before this set.
			if (!(await this.networks.isChainLive(row.profileId, row.chainId))) {
				if (ownsLock()) await this.track(this.tokens.delete(`${row.id}`))
				return
			}
			this.emit("onTokenUpdated", { ...getTokenInfo(next), profileId: next.profileId })
		})
	}

	private async readChainToken(fence: RunFence, row: Token): Promise<RefreshedFields> {
		const network = (await this.networks.getNetworksRaw(fence.profileId, row.chainId))[0]
		const account = (await this.accounts.getAccounts(fence.profileId, row.chainId, true))[0]
		if (!network || !account) throw new Error("no network or account on the token's chain")
		const { interface: ti, ...metadata } = await this.previewTokenMetadata(network.id, account.address, row.contract)
		const {
			id: _id,
			profileId: _profileId,
			chainId: _chainId,
			contract: _contract,
			...fields
		} = buildToken(fence.profileId, ti, metadata, row.id)
		return fields
	}

	public async backup(): Promise<Token[]> {
		const profile = await requireActiveProfile(this.profiles)

		return await this.getTokensRaw(profile.id)
	}

	public async restore(tokens: Token[]): Promise<Restored<Token>[]> {
		await this.ensureInitialized()
		// Deletion fence captured at entry (see restore-fence.ts): rows written
		// after a mid-restore deleteProfile must reject, not orphan.
		const deletion = this.profiles.getDeletionState()
		const epochs = captureRestoreEpochs(deletion, tokens.map(restoreRowProfileId))

		return await this.withTokenLock(
			async (ownsLock) => await restoreRows(tokens, (token) => this.restoreRow(token, deletion, epochs, ownsLock)),
		)
	}

	/** Released, every later step refuses: the id this row allocated may hold another writer's row. */
	private async restoreRow(
		token: Token,
		deletion: ProfileDeletionState,
		epochs: Map<string, number>,
		ownsLock: () => boolean,
	): Promise<Token> {
		if (!ownsLock()) throw tokenLockLost()
		// Per-row allocation through the hardened allocator: a shared
		// `id++` cursor assumed a forward-contiguous free space, which the
		// allocator's hostile-boundary gap-fill deliberately does not
		// guarantee — incrementing past it could land on (and overwrite)
		// an occupied key. Each successful write is visible to the next
		// row's allocation, so the batch still sequences.
		const id = await nextNumericId(this.tokens)
		// Validate the persisted shape BEFORE writing: a token with e.g.
		// `chainId: "1:"` would otherwise "succeed", have a balance
		// relinked to it, then be rejected by the read codec — leaving an
		// orphaned balance. Parsing here records it as a restoreError instead.
		// A backup's class is only its claim; the row holds none until the refresh reads one from the chain.
		const { classId: _claimed, ...parsed } = TokenSchema.parse({ ...token, id })
		const row: Token = { ...parsed, name: cleanName(parsed.name), symbol: cleanSymbol(parsed.symbol) }
		assertRestoreEpoch(deletion, epochs, row.profileId)
		// The chain sweep is LOCKLESS (see clearChainState), so a purge can
		// interleave this batch despite the token lock — a row written after
		// the sweep's snapshot would survive it. Per-row liveness makes the
		// row fail visibly (restoreError) instead; this also rejects rows for
		// a chain with NO network row, which a well-formed backup (networks
		// restore before tokens) never produces.
		if (!(await this.networks.isChainLive(row.profileId, row.chainId))) {
			throw new Error("network deleted")
		}
		if (!ownsLock()) throw tokenLockLost()
		await this.track(this.tokens.set(`${id}`, row))
		// The set awaits — a purge whose reservation + snapshot landed during
		// it would miss this row; self-compensate, mirroring persistToken. A
		// released restore leaves it: listed again if its chain comes back.
		if (await this.networks.isChainLive(row.profileId, row.chainId)) return row
		if (!ownsLock()) throw tokenLockLost()
		await this.track(this.tokens.delete(`${id}`))
		throw new Error("network deleted")
	}
}

/** The fields a restored row takes from its chain; its identity stays the row's. */
type RefreshedFields = Omit<Token, "id" | "profileId" | "chainId" | "contract">

function refreshedFieldsDiffer(row: Token, next: Token): boolean {
	const keys = new Set([...Object.keys(row), ...Object.keys(next)] as Array<keyof Token>)
	return [...keys].some((key) => JSON.stringify(row[key]) !== JSON.stringify(next[key]))
}

/** `read`'s value; `failed` once it rejects, `late` once `deadlineAt` passes first. Its rejection
 *  is contained either way. */
async function settleBy<T>(
	read: Promise<T>,
	deadlineAt: number,
): Promise<{ kind: "read"; value: T } | { kind: "failed" } | { kind: "late" }> {
	const outcome = read.then(
		(value) => ({ kind: "read" as const, value }),
		() => ({ kind: "failed" as const }),
	)
	const remaining = deadlineAt - Date.now()
	if (!(remaining > 0)) return { kind: "late" }
	let timer: ReturnType<typeof setTimeout> | undefined
	const late = new Promise<{ kind: "late" }>((resolve) => {
		timer = setTimeout(() => resolve({ kind: "late" }), remaining)
	})
	return await Promise.race([outcome, late]).finally(() => clearTimeout(timer))
}

/** A token's name and symbol are contract or backup text: every row and import title stores them
 *  with no control, format or bidirectional character, within the seeder's bounds. */
const cleanName = (name: string): string => sanitizeWireString(name, NAME_MAX_LENGTH)
const cleanSymbol = (symbol: string): string => sanitizeWireString(symbol, SYMBOL_MAX_LENGTH)

function buildToken(profileId: string, tokenInterface: TokenInterface, metadata: TokenMetadata, id: number): Token {
	return {
		id,
		profileId,
		chainId: tokenInterface.chainId,
		contract: tokenInterface.contract,
		classId: tokenInterface.classId,
		name: cleanName(metadata.name),
		symbol: cleanSymbol(metadata.symbol),
		decimals: metadata.decimals,
		getNameFn: tokenInterface.getNameFn,
		getSymbolFn: tokenInterface.getSymbolFn,
		getDecimalsFn: tokenInterface.getDecimalsFn,
		balanceOfPublicFn: tokenInterface.balanceOfPublicFn,
		balanceOfPrivateFn: tokenInterface.balanceOfPrivateFn,
		transferPublicFn: tokenInterface.transferPublicFn,
		transferPrivateFn: tokenInterface.transferPrivateFn,
		transferPublicToPrivateFn: tokenInterface.transferPublicToPrivateFn,
		transferPrivateToPublicFn: tokenInterface.transferPrivateToPublicFn,
	}
}

/**
 * Categorize a token-import error for `JobError.kind`. Categories drive
 * future per-kind UX; today they're purely observational.
 */
function classifyTokenImportError(err: unknown): string {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase()
		if (msg.includes("unknown network")) return "network_unreachable"
		if (msg.includes("necessary methods") || msg.includes("interface")) return "contract_invalid"
		if (msg.includes("simulate") || msg.includes("metadata")) return "metadata_fetch"
	}
	return "unknown"
}
