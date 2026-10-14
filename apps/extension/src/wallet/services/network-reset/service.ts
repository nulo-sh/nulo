import { ImportedAccountUnusableError, RecoveryModeError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { validateParams } from "@nulo/extension-messaging/zod"
import type { BrowserApi, StorageChanges } from "@nulo/wallet-core/ports"
import { EventHandler } from "@nulo/wallet-core/utils"
import { MAINNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { NOOP_RESTORE_GATE, type RestoreGate } from "@/e2e/restore-gate"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import type { ILogger } from "@/wallet/logger"
import { ACCOUNT_INTEGRITY_COORDINATOR_NAME, type AccountIntegrityCoordinator } from "@/wallet/services/account-integrity/coordinator"
import { type Account, AccountService, AccountType } from "@/wallet/services/account/service"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { seedForKind, type DefaultSeed } from "@/wallet/services/network/seeds"
import { findPrimaryEndpoint, isSeedEndpointUrl, type Network, NetworkService } from "@/wallet/services/network/service"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { ProfileService } from "@/wallet/services/profile/service"
import type { RunFence } from "@/wallet/services/profile/spec"
import { hasNetworkCause } from "@/wallet/services/stale-network/classify"
import { decodeStaleRecord, StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import {
	ERR_NODE_UNREACHABLE,
	ERR_NOT_RESETTABLE,
	ERR_RESET_IN_PROGRESS,
	ERR_STALE_CHANGED,
	type JournalAccount,
	type ProbedEndpoint,
	type ResetJournal,
	type ResetNotice,
	STALE_NETWORKS_ROOT,
	type StaleNetworksRecord,
} from "@/wallet/services/stale-network/types"
import { TokenService } from "@/wallet/services/token/service"
import { TransactionService } from "@/wallet/services/transaction/service"
import {
	type Events,
	type Methods,
	NETWORK_RESET_SERVICE_NAME,
	NetworkResetMethodSchemas,
	type PendingReset,
	RESET_INGRESS_WAIT_MS,
	RESET_NODE_PROBE_MS,
	type ResetConfirmation,
	type ResetRunGate,
	type StaleNetworkChanged,
	type StaleNetworkView,
} from "./spec"

export * from "./spec"

type Step = "admit" | "validate" | "purge" | "rewrite" | "accounts" | "finish"

/** One reset run: the run lock. Memory only, so a worker death drops it with the run. */
class Flight {
	public step: Step = "admit"
	private release!: () => void
	public readonly ended = new Promise<void>((resolve) => {
		this.release = resolve
	})

	public constructor(
		public readonly profileId: string,
		public readonly networkId: string,
	) {}

	public end(): void {
		this.release()
	}
}

const notResettable = (why: string) => new Error(`${ERR_NOT_RESETTABLE}: ${why}`)

const byIndexThenAddress = (a: Account, b: Account) => a.index - b.index || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0)

/** An unusable imported key's message names its address, which no log line carries. */
const loggable = (error: unknown) => (error instanceof ImportedAccountUnusableError ? error.code : error)

/**
 * The journal is trusted for screens only: before anything runs, its targets and L1 must be the
 * build's seed or the row's own, and `resetChainInPlace` refuses a row not on its source chain, so
 * a forged one can purge only the chain of an existing non-Mainnet row.
 */
function validateJournal(journal: ResetJournal, row: Network | undefined): asserts row is Network {
	if (!row) throw notResettable("the network is gone")
	if (row.l1ChainId === MAINNET_L1_CHAIN_ID || journal.l1ChainId === MAINNET_L1_CHAIN_ID) throw notResettable("Mainnet is never reset")
	const seed = seedForKind(row.kind)
	if (journal.toChainId !== (seed?.chainId ?? journal.fromChainId)) throw notResettable("the target is not this build's")
	if (journal.l1ChainId !== (seed?.l1ChainId ?? row.l1ChainId)) throw notResettable("the L1 is not this network's")
}

/** An imported key that does not open is unmovable (a blocked network opens none); one that
 *  derives another address moves the addresses. */
function splitAccounts(onChain: Account[], imported: Map<string, string | null>, blocked: boolean) {
	const accounts: StaleNetworkView["accounts"] = []
	const unmovable: string[] = []
	let moved = false
	for (const account of onChain) {
		const derived = account.type === AccountType.Imported ? imported.get(account.address) : account.address
		if (!derived && !blocked) {
			unmovable.push(account.name)
			continue
		}
		if (derived && derived !== account.address) moved = true
		accounts.push({ name: account.name, address: account.address })
	}
	return { accounts, unmovable, moved }
}

/** Another row already on the reset's target chain, and another network's pending reset. */
function conflictsOf(row: Network, networks: Network[], target: number, journal: ResetJournal | undefined) {
	const holder = networks.find((n) => n.id !== row.id && n.chainId === target)
	const pending = journal && journal.networkId !== row.id ? journal.networkId : undefined
	const out: Pick<StaleNetworkView, "heldBy" | "otherPending"> = {}
	if (holder) out.heldBy = { name: holder.name }
	if (pending) out.otherPending = { networkId: pending, name: networks.find((n) => n.id === pending)?.name ?? "" }
	return out
}

function sameConfirmation(view: StaleNetworkView, confirmed: ResetConfirmation): boolean {
	const a = view.probedEndpoint
	const b = confirmed.probedEndpoint
	return (
		view.cause.networkReset === confirmed.networkReset &&
		view.cause.addressesMoved === confirmed.addressesMoved &&
		view.accounts.length === confirmed.accountCount &&
		view.unmovable.length === confirmed.unmovableCount &&
		view.switchToSeedNode === confirmed.switchToSeedNode &&
		(a === null ? b === null : b !== null && a.id === b.id && a.url === b.url)
	)
}

/** The record entries one storage change added, removed or altered, by network id. */
function changedNetworkIds(before: StaleNetworksRecord | undefined, after: StaleNetworksRecord | undefined): string[] {
	const key = (r: StaleNetworksRecord | undefined) => new Map((r?.entries ?? []).map((e) => [e.networkId, JSON.stringify(e)]))
	const a = key(before)
	const b = key(after)
	return [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id))
}

/**
 * Resets one stale network in place: purges its chain, rewrites the row to the build's seed when
 * the network itself was reset, and re-creates its accounts from a journal written before
 * anything is deleted. Popup-only (trusted internal ports); a dApp has no route here.
 *
 * Runs are single-flight per worker. While one runs, its flag is the run lock: every popup shows
 * its progress and new dApp requests wait for it, at most {@link RESET_INGRESS_WAIT_MS}. A run
 * that stops keeps its journal, which only its own two chains are quarantined by; the popup
 * resumes it at its next bootstrap.
 */
export class NetworkResetService extends Service<Methods, Events> implements ServiceSpec<Methods, Events>, ResetRunGate {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getStaleNetwork",
		"getPendingReset",
		"resetStaleNetwork",
		"takeResetNotice",
	)
	public static name = NETWORK_RESET_SERVICE_NAME
	public readonly dependencies = [
		ProfileService.name,
		AccountService.name,
		NetworkService.name,
		TransactionService.name,
		TokenService.name,
		DappSessionService.name,
		ACCOUNT_INTEGRITY_COORDINATOR_NAME,
	] as const

	public readonly onStaleNetworkChanged = new EventHandler<StaleNetworkChanged>()

	private profiles: ProfileService = null!
	private accounts: AccountService = null!
	private networks: NetworkService = null!
	private transactions: TransactionService = null!
	private dappSessions: DappSessionService = null!
	private tokens: TokenService = null!
	private integrity: Pick<AccountIntegrityCoordinator, "bootVerification"> = null!
	private readonly staleNetworks: StaleNetworkRepository
	/** The A6 decision per (network, primary endpoint id, its URL, target chain): a primary changed
	 *  after A1 misses it, so the fresh view of the confirmation probes again and disagrees. */
	private readonly probeCache = new Map<string, boolean>()
	private flight: Flight | null = null

	public constructor(
		logger: ILogger,
		private readonly browserApi: BrowserApi,
		private readonly gate: RestoreGate = NOOP_RESTORE_GATE,
	) {
		super(NETWORK_RESET_SERVICE_NAME, logger)
		this.staleNetworks = new StaleNetworkRepository(browserApi.storage.local)
	}

	protected async init(services: ServiceCollection): Promise<void> {
		this.profiles = services.get(ProfileService.name)
		this.accounts = services.get(AccountService.name)
		this.networks = services.get(NetworkService.name)
		this.transactions = services.get(TransactionService.name)
		this.dappSessions = services.get(DappSessionService.name)
		this.tokens = services.get(TokenService.name)
		this.integrity = services.get<AccountIntegrityCoordinator>(ACCOUNT_INTEGRITY_COORDINATOR_NAME)
		this.networks.setResetRunProbe((networkId) => this.flight?.networkId === networkId)
		this.browserApi.storage.local.onChange(this.onStorageChange)
	}

	// ── RPC ──────────────────────────────────────────────────────────────

	public async getStaleNetwork(networkId: string): Promise<StaleNetworkView | null> {
		validateParams(NetworkResetMethodSchemas.getStaleNetwork.params, [networkId], "getStaleNetwork")
		await this.ensureInitialized()
		// A verdict for a session the worker rehydrated may still be landing.
		await this.integrity.bootVerification
		const profile = await requireActiveProfile(this.profiles)
		return this.buildView(profile.id, networkId)
	}

	public async getPendingReset(): Promise<PendingReset | null> {
		validateParams(NetworkResetMethodSchemas.getPendingReset.params, [], "getPendingReset")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles)
		const journal = await this.staleNetworks.getJournal(profile.id)
		const flight = this.flight?.profileId === profile.id ? this.flight : null
		if (journal) return { networkId: journal.networkId, running: flight?.networkId === journal.networkId }
		return flight ? { networkId: flight.networkId, running: true } : null
	}

	/**
	 * Starts, joins or resumes the reset of `networkId` and returns at once; progress arrives as
	 * `onStaleNetworkChanged`. A first run needs `confirmed` to match a fresh view; a resume of this
	 * network's journal ignores it. Every refusal throws before anything changes.
	 */
	public async resetStaleNetwork(networkId: string, confirmed: ResetConfirmation): Promise<StaleNetworkView> {
		validateParams(NetworkResetMethodSchemas.resetStaleNetwork.params, [networkId, confirmed], "resetStaleNetwork")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles)
		const current = this.flight
		if (current) {
			if (current.profileId !== profile.id || current.networkId !== networkId) {
				throw new Error(`${ERR_RESET_IN_PROGRESS}: another reset is running`)
			}
			return this.requireView(profile.id, networkId)
		}
		const flight = new Flight(profile.id, networkId)
		this.flight = flight
		this.emitChanged(flight, { running: true })
		let fence: RunFence
		try {
			fence = await this.profiles.captureRunFence()
			if (fence.profileId !== profile.id) throw notResettable("the active profile changed")
			await this.admit(fence, networkId, confirmed)
		} catch (error) {
			this.endFlight(flight, { running: false })
			throw error
		}
		void this.runFlight(flight, fence)
		return this.requireView(profile.id, networkId)
	}

	public async takeResetNotice(): Promise<ResetNotice | null> {
		validateParams(NetworkResetMethodSchemas.takeResetNotice.params, [], "takeResetNotice")
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profiles)
		return this.staleNetworks.takeNotice(profile.id)
	}

	// ── Run lock ─────────────────────────────────────────────────────────

	public async waitForRunEnd(): Promise<void> {
		const flight = this.flight
		if (!flight) return
		let timer: ReturnType<typeof setTimeout> | undefined
		const cap = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, RESET_INGRESS_WAIT_MS)
		})
		await Promise.race([flight.ended, cap])
		clearTimeout(timer)
	}

	private endFlight(flight: Flight, outcome: Partial<StaleNetworkChanged>): void {
		if (this.flight === flight) this.flight = null
		flight.end()
		this.emitChanged(flight, outcome)
	}

	private emitChanged(flight: Flight, extra: Partial<StaleNetworkChanged>): void {
		this.emit("onStaleNetworkChanged", { profileId: flight.profileId, networkId: flight.networkId, ...extra })
	}

	private readonly onStorageChange = (changes: StorageChanges): void => {
		for (const [key, change] of Object.entries(changes)) {
			if (!key.startsWith(`${STALE_NETWORKS_ROOT}@`)) continue
			const profileId = key.slice(STALE_NETWORKS_ROOT.length + 1)
			for (const networkId of changedNetworkIds(decodeStaleRecord(change.oldValue), decodeStaleRecord(change.newValue))) {
				this.emit("onStaleNetworkChanged", { profileId, networkId })
			}
		}
	}

	// ── Views ────────────────────────────────────────────────────────────

	private async requireView(profileId: string, networkId: string): Promise<StaleNetworkView> {
		const view = await this.buildView(profileId, networkId)
		if (!view) throw notResettable("the network is not stale")
		return view
	}

	private async buildView(profileId: string, networkId: string): Promise<StaleNetworkView | null> {
		const networks = await this.networks.getNetworksRaw(profileId)
		const row = networks.find((n) => n.id === networkId)
		if (!row) return null
		const { record, journal } = await this.staleNetworks.readQuarantineState(profileId)
		const running = this.flight?.profileId === profileId && this.flight.networkId === networkId
		if (journal?.networkId === networkId) return this.journalView(row, journal, running)
		const view = await this.freshView(profileId, row, networks, record, journal)
		if (view && running) view.reset = { running: true, purged: false, doneCount: 0 }
		return view
	}

	/** A journal's view: what the run captured, never re-derived, so a paused reset keeps its list. */
	private journalView(row: Network, journal: ResetJournal, running: boolean): StaleNetworkView {
		return {
			networkId: row.id,
			name: row.name,
			cause: { networkReset: journal.fromChainId !== journal.toChainId, addressesMoved: journal.cause.addressesMoved },
			blocked: false,
			accounts: journal.accounts.map((a) => ({ name: a.name, address: a.newAddress ?? a.oldAddress })),
			unmovable: [],
			switchToSeedNode: journal.switchToSeedNode,
			probedEndpoint: journal.probedEndpoint,
			reset: { running, purged: journal.purged, doneCount: journal.accounts.filter((a) => a.done).length },
		}
	}

	/**
	 * The network cause is recomputed from the row and the build, never read from the record, so a
	 * forged record cannot start the unattended run of a network with no accounts. Each imported
	 * key on the chain is opened: one that does not open is `unmovable`, one that derives another
	 * address moves the addresses, so the screen never promises an address that will change.
	 */
	private async freshView(
		profileId: string,
		row: Network,
		networks: Network[],
		record: StaleNetworksRecord | undefined,
		journal: ResetJournal | undefined,
	): Promise<StaleNetworkView | null> {
		const entry = record?.entries.find((e) => e.networkId === row.id && e.chainId === row.chainId)
		const networkReset = hasNetworkCause(row)
		if (!networkReset && !entry) return null
		const seed = seedForKind(row.kind)
		const blocked = row.l1ChainId === MAINNET_L1_CHAIN_ID
		const onChain = (await this.accounts.getAccountsRaw(profileId)).filter((a) => a.chainId === row.chainId).sort(byIndexThenAddress)
		const imported = blocked ? new Map<string, string | null>() : await this.accounts.inspectImportedForReset(profileId, row.chainId)
		const { accounts, unmovable, moved } = splitAccounts(onChain, imported, blocked)
		const addressesMoved = moved || (entry?.addressesMoved ?? false) || (networkReset && row.l1ChainId !== seed?.l1ChainId)
		if (!networkReset && !addressesMoved) return null
		const target = networkReset && seed ? seed.chainId : row.chainId
		const endpoint =
			!blocked && networkReset && seed ? await this.decideEndpoint(row, seed) : { switchToSeedNode: false, probedEndpoint: null }
		return {
			networkId: row.id,
			name: row.name,
			cause: { networkReset, addressesMoved },
			blocked,
			accounts,
			unmovable,
			...endpoint,
			...conflictsOf(row, networks, target, journal),
		}
	}

	/** A6: only the user's own primary is probed, once per endpoint, within one 5 s request. Any
	 *  answer but the seed's identity, a timeout included, moves the network to the seed's node. */
	private async decideEndpoint(
		row: Network,
		seed: DefaultSeed,
	): Promise<{ switchToSeedNode: boolean; probedEndpoint: ProbedEndpoint | null }> {
		const primary = findPrimaryEndpoint(row)
		if (!primary || isSeedEndpointUrl(seed, primary.rpcUrl)) return { switchToSeedNode: false, probedEndpoint: null }
		const key = JSON.stringify([row.id, primary.id, primary.rpcUrl, seed.chainId])
		let switchToSeedNode = this.probeCache.get(key)
		if (switchToSeedNode === undefined) {
			switchToSeedNode = await this.networks.probeIdentityOnce(primary.rpcUrl, row.kind, RESET_NODE_PROBE_MS).then(
				(probed) => probed.chainId !== seed.chainId || probed.l1ChainId !== seed.l1ChainId,
				() => true,
			)
			this.probeCache.set(key, switchToSeedNode)
		}
		return { switchToSeedNode, probedEndpoint: { id: primary.id, url: primary.rpcUrl } }
	}

	// ── Admission and capture ────────────────────────────────────────────

	private async admit(fence: RunFence, networkId: string, confirmed: ResetConfirmation): Promise<void> {
		const { profileId } = fence
		if (this.profiles.isRecoveryMode(profileId)) throw new RecoveryModeError()
		const { record, journal } = await this.staleNetworks.readQuarantineState(profileId)
		if (journal && journal.networkId !== networkId) {
			throw new Error(`${ERR_RESET_IN_PROGRESS}: another network's reset has not finished`)
		}
		const networks = await this.networks.getNetworksRaw(profileId)
		const row = networks.find((n) => n.id === networkId)
		if (!row) throw notResettable("the network is gone")
		if (journal) return
		const view = await this.freshView(profileId, row, networks, record, undefined)
		if (!view || view.blocked || view.heldBy) throw notResettable("this network cannot be reset")
		if (!sameConfirmation(view, confirmed)) throw new Error(`${ERR_STALE_CHANGED}: the network changed since it was shown`)
		await this.capture(fence, row, view)
	}

	/**
	 * Writes the journal before anything is deleted: after the purge it is the only copy of the
	 * account list and of the imported keys, each resealed under its new chain and address.
	 */
	private async capture(fence: RunFence, row: Network, view: StaleNetworkView): Promise<void> {
		const { profileId } = fence
		const seed = seedForKind(row.kind)
		const fromChainId = row.chainId
		const toChainId = view.cause.networkReset && seed ? seed.chainId : fromChainId
		const l1ChainId = seed ? seed.l1ChainId : await this.verifyCustomL1(profileId, fromChainId)
		const rows = (await this.accounts.getAccountsRaw(profileId)).filter((a) => a.chainId === fromChainId).sort(byIndexThenAddress)
		if (l1ChainId === MAINNET_L1_CHAIN_ID || rows.some((a) => a.l1ChainId === MAINNET_L1_CHAIN_ID))
			throw notResettable("Mainnet is never reset")
		await this.profiles.assertRunFence(fence)
		const resealed = await this.accounts.resealImportedForReset(profileId, fromChainId, toChainId)
		const accounts: JournalAccount[] = []
		for (const a of rows) {
			const base = { index: a.index, name: a.name, visible: a.visible, oldAddress: a.address, done: false }
			if (a.type === AccountType.Nulo_v1) accounts.push({ type: 0, ...base })
			else if (a.type === AccountType.Imported) {
				const key = resealed.get(a.address)
				if (key) accounts.push({ type: 1, ...base, ...key })
			} else throw notResettable("an account of an unknown type is on the chain")
		}
		if (accounts.length !== view.accounts.length) throw new Error(`${ERR_STALE_CHANGED}: the accounts changed since they were shown`)
		const journal: ResetJournal = {
			profileId,
			networkId: row.id,
			fromChainId,
			toChainId,
			l1ChainId,
			cause: view.cause,
			purged: false,
			switchToSeedNode: view.switchToSeedNode,
			probedEndpoint: view.probedEndpoint,
			accounts,
		}
		await this.profiles.assertRunFence(fence)
		const check = { chainId: fromChainId, toChainId, primary: view.probedEndpoint }
		await this.networks.commitResetCapture(profileId, row.id, check, () =>
			this.staleNetworks.withLock(profileId, async () => {
				// Synchronous: a deletion holds the profile lock while it waits on this one to clear the
				// journal, so a deletion that began now must see no journal written after its clear.
				if (!this.profiles.isFenceLive(fence)) throw new SessionEndedError()
				if (await this.staleNetworks.getJournal(profileId))
					throw new Error(`${ERR_RESET_IN_PROGRESS}: a reset journal already exists`)
				await this.staleNetworks.setJournalLocked(journal)
			}),
		)
		this.logDebug("network reset captured", { networkId: row.id, cause: view.cause, accounts: accounts.length })
	}

	/** A custom row's L1 is the derivation input: one live check before anything is deleted, since
	 *  after the purge nothing may depend on a node. */
	private async verifyCustomL1(profileId: string, chainId: number): Promise<number> {
		try {
			return await this.networks.resolveVerifiedL1ChainId(profileId, chainId)
		} catch {
			throw new Error(`${ERR_NODE_UNREACHABLE}: the network's node did not confirm its L1`)
		}
	}

	// ── The run ──────────────────────────────────────────────────────────

	private async runFlight(flight: Flight, fence: RunFence): Promise<void> {
		try {
			const addressesMoved = await this.run(flight, fence)
			this.endFlight(flight, { running: false, completed: { addressesMoved } })
		} catch (error) {
			this.logWarn("network reset stopped", { networkId: flight.networkId, step: flight.step, error: loggable(error) })
			this.endFlight(flight, { running: false, failed: true })
		}
	}

	/** Every step is idempotent and re-checks the fence; `purged` is durable before the rewrite, and
	 *  no account is re-created before it, since an address-only reset purges the chain it fills. */
	private async run(flight: Flight, fence: RunFence): Promise<boolean> {
		const { profileId } = fence
		const { networkId } = flight
		flight.step = "validate"
		await this.profiles.assertRunFence(fence)
		const journal = await this.requireJournal(profileId, networkId)
		const row = (await this.networks.getNetworksRaw(profileId)).find((n) => n.id === networkId)
		validateJournal(journal, row)
		flight.step = journal.purged ? "rewrite" : "purge"
		let addresses: string[] = []
		await this.networks.resetChainInPlace(
			{
				profileId,
				networkId,
				fromChainId: journal.fromChainId,
				toChainId: journal.toChainId,
				purged: journal.purged,
				switchToSeedNode: journal.switchToSeedNode,
				probedEndpoint: journal.probedEndpoint,
			},
			{
				beforePurge: async () => {
					await this.profiles.assertRunFence(fence)
					await this.gate.waitAt("network-reset-purging")
					addresses = await this.chainAddresses(profileId, journal)
				},
				afterPurge: async () => {
					await this.transactions.purgeForAccounts(addresses, profileId, journal.fromChainId)
					// A kept session would auto-approve with the accounts the reset creates on that chain.
					await this.dappSessions.purgeForChain(profileId, journal.fromChainId)
				},
				onPurged: async () => {
					await this.updateJournal(profileId, networkId, (j) => ({ ...j, purged: true }))
					this.emitChanged(flight, { running: true })
					await this.gate.waitAt("network-reset-purged")
					await this.profiles.assertRunFence(fence)
					flight.step = "rewrite"
				},
			},
		)
		flight.step = "accounts"
		let first = true
		for (const [i, entry] of journal.accounts.entries()) {
			if (entry.done) continue
			await this.profiles.assertRunFence(fence)
			await this.accounts.recreateForReset(profileId, journal.toChainId, entry, journal.l1ChainId)
			await this.updateJournal(profileId, networkId, (j) => ({
				...j,
				accounts: j.accounts.map((a, k) => (k === i ? { ...a, done: true } : a)),
			}))
			this.emitChanged(flight, { running: true })
			if (first) await this.gate.waitAt("network-reset-account")
			first = false
		}
		flight.step = "finish"
		await this.profiles.assertRunFence(fence)
		await this.finish(profileId, networkId)
		this.tokens.seedDefaultTokens().catch((error) => this.logDebug("seeding after a reset failed", { error }))
		this.logDebug("network reset finished", { networkId, accounts: journal.accounts.length })
		return journal.cause.addressesMoved
	}

	/** Whose transaction rows the purge removes: the journal's accounts and those still stored,
	 *  read before the purge deletes them (an imported account whose key did not open is in no
	 *  journal). */
	private async chainAddresses(profileId: string, journal: ResetJournal): Promise<string[]> {
		const stored = (await this.accounts.getAccountsRaw(profileId)).filter((a) => a.chainId === journal.fromChainId)
		return [...new Set([...journal.accounts.map((a) => a.oldAddress), ...stored.map((a) => a.address)])]
	}

	/** The record entry goes before the journal: the other order, interrupted, would show A2 over
	 *  accounts that are already right. The notice is taken only once the journal is gone. */
	private async finish(profileId: string, networkId: string): Promise<void> {
		await this.staleNetworks.withLock(profileId, async () => {
			const journal = await this.staleNetworks.getJournal(profileId)
			if (journal?.networkId !== networkId) throw new Error("the reset journal is gone")
			await this.staleNetworks.removeEntryLocked(profileId, networkId)
			if (journal.accounts.length > 0) {
				await this.staleNetworks.setNoticeLocked(profileId, { networkId, addressesMoved: journal.cause.addressesMoved })
			}
			await this.staleNetworks.deleteJournalLocked(profileId)
		})
	}

	private async requireJournal(profileId: string, networkId: string): Promise<ResetJournal> {
		const journal = await this.staleNetworks.getJournal(profileId)
		if (journal?.networkId !== networkId || journal.profileId !== profileId) throw new Error("the reset journal is gone")
		return journal
	}

	/** Each write first checks, under the record lock, that the journal still exists: a deleted
	 *  network or profile ends the run instead of resurrecting it. */
	private updateJournal(profileId: string, networkId: string, next: (journal: ResetJournal) => ResetJournal): Promise<void> {
		return this.staleNetworks.withLock(profileId, async () => {
			const journal = await this.staleNetworks.getJournal(profileId)
			if (journal?.networkId !== networkId) throw new Error("the reset journal is gone")
			await this.staleNetworks.setJournalLocked(next(journal))
		})
	}
}
