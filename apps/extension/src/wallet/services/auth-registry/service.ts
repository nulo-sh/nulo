// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ILogger } from "@/wallet/logger"
import { assertRestoreEpoch, captureRestoreEpochs, requireRestoreProfileId } from "@/wallet/services/restore-fence"
import { restoreRows } from "@/wallet/services/restore-rows"
import type { Restored, ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { maybeRethrowAsRpcCancel } from "@/wallet/services/execution/rpc-cancel"
import {
	ExecutionService,
	type FeeSettings,
	type AuthwitContent,
	type SendTransactionOperation,
	type TransferFeeEstimate,
} from "@/wallet/services/execution/service"
import { ProfileService } from "@/wallet/services/profile/service"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { NetworkService } from "@/wallet/services/network/service"
import { type Network, primaryEndpointUrl } from "@/wallet/services/network/spec"
import { AccountService } from "@/wallet/services/account/service"
import { type AccountScope, accountScopeKey } from "@/wallet/services/account/spec"
import { purgeMalformedRows, purgeRows } from "@/wallet/services/purge-rows"
import type { WrappedTask } from "@/wallet/services/task/wrapped-task"
import { TaskService, RevokeAuthwitsContent, StepContent } from "@/wallet/services/task/service"
import { TransactionService, OriginType } from "@/wallet/services/transaction/service"
import { type Tx, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import type { SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { array_max, Lock, sleep } from "@/wallet/utils"
import { getAuthRegistryAddress, isAuthRegistryEnabled, isAuthwitConsumable } from "@/wallet/utils/auth-registry"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import {
	AUTH_REGISTRY_SERVICE_NAME,
	type Authwit,
	type AuthwitRegistryScope,
	authwitStatusRowId,
	type Events,
	MAX_REVOKES_PER_TX,
	MAX_TRACKED_AUTHWITS_PER_ACCOUNT,
	type Methods,
	AuthwitSchema,
	parseAuthwitStatusRowId,
	type SendStarted,
} from "./spec"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { type FeeSettingsReaders, type IExecutionHooks, refuseUnknownPriorities } from "@nulo/wallet-bridge"
import { TxHash } from "@aztec-labs/stdlib/tx"
import { GRANT_BLOCK_WAIT_MS, awaitGrantBlock, grantBlockOf } from "./grant-block"

export * from "./spec"

/** A popup mints its key per call; the bound only keeps an absurd one off the event. */
const MAX_CORRELATION_LENGTH = 64

/** The popup's fee settings for the RPCs that send or estimate a transaction. */
const FEE_SETTINGS_OF = {
	revokeAuthwits: ([, , , feeSettings]) => [feeSettings],
	setRegistryEnabled: ([, , , feeSettings]) => [feeSettings],
	estimateRevokeFee: ([, , , feeSettings]) => [feeSettings],
	estimateRegistryToggleFee: ([, , , feeSettings]) => [feeSettings],
} satisfies FeeSettingsReaders<Methods>

/** The `(profileId, chainId, account)` scope every authwit read/write is bound to. `profileId` is
 *  never a popup parameter — it is always the active profile, resolved SW-side. */
type AuthwitScope = { profileId: string; chainId: number; account: string }

function assertRevokeCount(ids: number[]): void {
	if (ids.length > MAX_REVOKES_PER_TX) throw new Error(`Cannot revoke more than ${MAX_REVOKES_PER_TX} authwits per single tx`)
}

const grantNotInBlock = (authwit: Authwit): Error =>
	new Error(`Authwit #${authwit.id}'s grant is not in a block yet. Revoke it again later.`)

function registryToggleOperation(networkId: string, account: string, enabled: boolean, feeSettings: FeeSettings): SendTransactionOperation {
	const contract = getAuthRegistryAddress().toString()
	return {
		kind: "send_transaction",
		networkId,
		accountAddress: account,
		feeSettings,
		actions: [{ kind: "call", contract, method: "set_reject_all", args: [!enabled] }],
	}
}

export class AuthRegistryService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getAuthwits",
		"revokeAuthwits",
		"getRegistryEnabled",
		"setRegistryEnabled",
		"syncRegistry",
		"estimateRevokeFee",
		"estimateRegistryToggleFee",
		"cancelFeeEstimate",
	)
	public static name = AUTH_REGISTRY_SERVICE_NAME

	public readonly onAuthwitAdded = new EventHandler<Authwit>()
	public readonly onAuthwitUpdated = new EventHandler<Authwit>()
	public readonly onAuthwitDeleted = new EventHandler<Authwit>()
	public readonly onRegistryEnabled = new EventHandler<AuthwitRegistryScope>()
	public readonly onRegistryDisabled = new EventHandler<AuthwitRegistryScope>()
	public readonly onSendStarted = new EventHandler<SendStarted>()

	private readonly authwits: SealedEntityStorage<Authwit>
	private readonly statuses: SealedEntityStorage<boolean>
	private readonly lock = new Lock()

	private profileService: ProfileService = null!
	private networkService: NetworkService = null!
	private accountService: AccountService = null!
	private executionService: ExecutionService = null!
	private transactionService: TransactionService = null!
	private taskService: TaskService = null!

	public constructor(logger: ILogger, browserApi: BrowserApi) {
		super(AUTH_REGISTRY_SERVICE_NAME, logger)
		// The journal is keyed BY the authwit's numeric id and every mutation site derives its
		// storage key from the row's embedded id — so a raw-storage row copied under a foreign
		// key (id aliasing) would make revoke/delete/reconcile operate on the wrong row. The
		// id/key guard hides such rows at read time; honest rows always agree.
		const rowKeys = (profileId: string) => this.profileService.rowKeys(profileId)
		this.authwits = sealedEntityStorage("authRegistry", browserApi.storage.local, rowKeys)
		this.statuses = sealedEntityStorage("authRegistryEnabled", browserApi.storage.local, rowKeys)
	}

	/** An unknown speed level is refused before the method runs; fee math never reads one. */
	protected override invoke(method: string, params: unknown[]): unknown {
		refuseUnknownPriorities(FEE_SETTINGS_OF, method, params)
		return super.invoke(method, params)
	}

	protected async init(services: ServiceCollection) {
		this.profileService = services.get(ProfileService.name)
		this.networkService = services.get(NetworkService.name)
		this.accountService = services.get(AccountService.name)
		this.executionService = services.get(ExecutionService.name)
		this.transactionService = services.get(TransactionService.name)
		this.taskService = services.get(TaskService.name)

		// Authwit rows + registry-enabled flags are scoped by (profileId, chainId, account). Two
		// awaited purge subscribers, NOT the address-only onAccountDeleted listener (which could
		// delete a sibling profile's rows for a shared address, and never fires on deleteNetwork):
		//   - account purge (reconcileImportedAccounts): the exact (chainId, address) scopes.
		//   - chain purge (deleteNetwork / profile delete): every row on (profileId, chainId).
		this.accountService.registerAccountPurgeSubscriber(async (profileId, scopes) => this.purgeForAccounts(scopes, profileId))
		this.networkService.registerChainPurgeSubscriber(async (profileId, chainId) => this.purgeChain(profileId, chainId))

		// Confirm a `pending` authwit row once its tx is proven successful and remove it once the tx
		// reverts, so the revocation index never claims a grant that never landed. Best-effort and
		// idempotent: a failed pass is retried on the next tx update, or by sync.
		this.transactionService.onTransactionUpdated.add((tx) => this.reconcileFromTx(tx).catch(() => {}))
		this.profileService.onRowKeysReady.add((profileId) => void this.sealLegacyRows(profileId))
	}

	/** Seals the profile's plaintext authwits and flags under the lock every writer of both holds. */
	private async sealLegacyRows(profileId: string): Promise<void> {
		try {
			await this.authwits.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
			await this.statuses.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
		} catch (error) {
			this.logWarn("sealing the profile's plaintext authorizations failed; the next worker retries", { error })
		}
	}

	/** Map a tx's settled on-chain outcome to a pending-authwit reconcile, scoped to the tx's own
	 *  `(profileId, chainId, account)` — a tx without provenance (`profileId` absent) is skipped
	 *  so it can never reconcile another profile's rows. Proven/Finalized + Success ⇒ confirm;
	 *  settled non-success (reverted) ⇒ remove. A Dropped status deliberately does NOTHING: the
	 *  transaction service may still resurrect a dropped tx on a late mine (transient DROPPED
	 *  answers happen behind load-balanced RPCs), and a row removed here can never be reconfirmed —
	 *  authwit hashes aren't enumerable from chain. ACCEPTED RESIDUAL: a genuinely dropped tx's row
	 *  then lingers as pending — `syncAuthwit` skips pending rows on purpose, so nothing prunes it.
	 *  That is the safe direction (over-claiming): the row stays listed, a revoke keeps it and fails
	 *  on it, and it costs headroom against the tracked-authwit cap. */
	private async reconcileFromTx(tx: Tx): Promise<void> {
		if (!tx.profileId) return
		const scope: AuthwitScope = { profileId: tx.profileId, chainId: tx.chainId, account: tx.account }
		const settled = tx.status === TxStatus.Proven || tx.status === TxStatus.Finalized
		if (settled && tx.executionResult === TxExecutionResult.Success) {
			await this.reconcileAuthwits(scope, tx.hash, "mined")
			return
		}
		const reverted = settled && tx.executionResult !== undefined && tx.executionResult !== TxExecutionResult.Success
		if (reverted) {
			await this.reconcileAuthwits(scope, tx.hash, "dropped")
		}
	}

	/** The node for the operation's OWN network row. `getNode(chainId)` resolves the ACTIVE
	 *  profile's endpoint, and a profile switch during the proof wait would send this
	 *  profile's tx hash and registry reads to a provider it never selected. */
	private async nodeFor(network: Network): Promise<AztecNode> {
		const url = primaryEndpointUrl(network)
		if (!url) throw new Error(`network ${network.id} has no primary endpoint`)
		return this.networkService.getNodeForUrl(url)
	}

	/** Every tracked row for `(profileId, chainId, account)`. */
	private async rowsForScope(scope: AuthwitScope): Promise<Authwit[]> {
		return (await this.authwits.getValues()).filter(
			(x) => x.profileId === scope.profileId && x.chainId === scope.chainId && x.account === scope.account,
		)
	}

	public async getAuthwits(chainId: number, account: string): Promise<Authwit[]> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return this.rowsForScope({ profileId: profile.id, chainId, account })
	}

	/** PRE-send cap gate: throw if granting `newHashes` would push the scope past the
	 *  tracked-authwit ceiling. Counts existing tracked rows for THIS `(profileId, chainId,
	 *  account)` (incl. pending) PLUS the unique NEW hashes not already tracked — a per-action
	 *  check would let e.g. 255 existing + 2 new slip through and miscount intra-tx duplicates.
	 *  Never auto-evict (that destroys the only local revocation index). Called by `buildStandard`
	 *  for each `add_public_authwit`, with the owned network's profile + chain. */
	public async assertWithinCap(scope: AuthwitScope, newHashes: string[]): Promise<void> {
		const existing = await this.rowsForScope(scope)
		const existingHashes = new Set(existing.map((a) => a.hash))
		const newUnique = new Set(newHashes.filter((h) => !existingHashes.has(h)))
		if (existing.length + newUnique.size > MAX_TRACKED_AUTHWITS_PER_ACCOUNT) {
			throw new Error(
				`Cannot grant: account ${scope.account} would exceed the ${MAX_TRACKED_AUTHWITS_PER_ACCOUNT} tracked public-authwit limit. Revoke some first.`,
			)
		}
	}

	/** Record public authwits at the POST-send tail as `pending`, tx-linked rows, stamped with the
	 *  sending tx's `(profileId, chainId, account)`. Acceptance of `sendTx` is NOT mining — these
	 *  stay pending until `reconcileAuthwits` confirms (mined) or removes (dropped) them.
	 *  Idempotent: a hash already tracked in this scope (pending or confirmed) is skipped, so a
	 *  retry after a partial write does not duplicate. Ids are allocated over the PHYSICAL key
	 *  space so a codec-hidden row (a damaged current-format row) can't be overwritten. */
	public async recordPendingAuthwits(
		scope: AuthwitScope,
		items: { hash: string; content: AuthwitContent }[],
		txHash: string,
	): Promise<void> {
		if (items.length === 0) return
		await this.lock.withLock(async () => {
			const all = await this.authwits.getValues()
			const seen = new Set(
				all
					.filter((x) => x.profileId === scope.profileId && x.chainId === scope.chainId && x.account === scope.account)
					.map((x) => x.hash),
			)
			const occupied = new Set(await this.authwits.getKeys())
			let nextId = array_max(all.map((x) => x.id)) + 1
			for (const { hash, content } of items) {
				if (seen.has(hash)) continue
				seen.add(hash)
				while (Number.isSafeInteger(nextId) && occupied.has(`${nextId}`)) nextId++
				if (!Number.isSafeInteger(nextId)) throw new Error("authwit id space exhausted")
				const authwit: Authwit = {
					id: nextId,
					profileId: scope.profileId,
					chainId: scope.chainId,
					account: scope.account,
					hash,
					content,
					pending: true,
					txHash,
				}
				await this.authwits.set(`${authwit.id}`, authwit)
				occupied.add(`${authwit.id}`)
				nextId++
				this.emit("onAuthwitAdded", authwit)
			}
		})
	}

	/** Reconcile pending rows for a tx once its outcome is known, scoped to the tx's own
	 *  `(profileId, chainId, account)` AND its hash: `mined` clears the pending flag (the grant is
	 *  durable + revocable); `dropped` removes the rows (the grant never landed, so the local index
	 *  must not claim it exists). Confirmed (non-pending) rows are untouched. */
	public async reconcileAuthwits(scope: AuthwitScope, txHash: string, outcome: "mined" | "dropped"): Promise<void> {
		await this.lock.withLock(async () => {
			const rows = (await this.authwits.getValues()).filter(
				(x) =>
					x.pending &&
					x.txHash === txHash &&
					x.profileId === scope.profileId &&
					x.chainId === scope.chainId &&
					x.account === scope.account,
			)
			for (const row of rows) {
				if (outcome === "mined") {
					const confirmed = { ...row, pending: false }
					await this.authwits.set(`${row.id}`, confirmed)
					this.emit("onAuthwitUpdated", confirmed)
				} else {
					await this.authwits.delete(`${row.id}`)
					this.emit("onAuthwitDeleted", row)
				}
			}
		})
	}

	/** Names the send's journal record to the caller that keyed the call; a call with no key gets none. */
	private sendStartedHooks(correlation: unknown): IExecutionHooks | undefined {
		if (typeof correlation !== "string" || correlation.length === 0 || correlation.length > MAX_CORRELATION_LENGTH) return undefined
		return { onJournalCreated: (journalId) => this.emit("onSendStarted", { correlation, journalId }) }
	}

	/** The revoke's transaction, built from this scope's own rows: a foreign id reads as missing, so
	 *  no caller revokes another profile's, chain's or account's authwit and nothing discloses one. */
	private async revokeOperation(
		networkId: string,
		account: string,
		ids: number[],
		feeSettings: FeeSettings,
	): Promise<{ network: Network; scope: AuthwitScope; authwits: Authwit[]; operation: SendTransactionOperation }> {
		const network = await this.networkService.getNetwork(networkId)
		const scope: AuthwitScope = { profileId: network.profileId, chainId: network.chainId, account }
		const authwits: Authwit[] = []
		for (const id of ids) {
			const authwit = await this.authwits.get(`${id}`)
			const inScope = authwit?.profileId === scope.profileId && authwit.chainId === scope.chainId && authwit.account === scope.account
			if (!authwit || !inScope) throw new Error(`Authwit #${id} doesn't exist`)
			authwits.push(authwit)
		}
		const registryAddress = getAuthRegistryAddress().toString()
		const operation: SendTransactionOperation = {
			kind: "send_transaction",
			networkId,
			accountAddress: account,
			feeSettings,
			actions: authwits.map((x) => ({ kind: "call", contract: registryAddress, method: "set_authorized", args: [x.hash, false] })),
		}
		return { network, scope, authwits, operation }
	}

	public async estimateRevokeFee(
		networkId: string,
		account: string,
		ids: number[],
		feeSettings: FeeSettings,
		estimateToken?: string,
		flowKey?: string,
	): Promise<TransferFeeEstimate> {
		await this.ensureInitialized()
		assertRevokeCount(ids)
		const { operation } = await this.revokeOperation(networkId, account, ids, feeSettings)
		return this.executionService.estimateSendTransactionFee(operation, estimateToken, flowKey)
	}

	public async estimateRegistryToggleFee(
		networkId: string,
		account: string,
		enabled: boolean,
		feeSettings: FeeSettings,
		estimateToken?: string,
		flowKey?: string,
	): Promise<TransferFeeEstimate> {
		await this.ensureInitialized()
		const operation = registryToggleOperation(networkId, account, enabled, feeSettings)
		return this.executionService.estimateSendTransactionFee(operation, estimateToken, flowKey)
	}

	public async cancelFeeEstimate(estimateToken: string): Promise<void> {
		await this.ensureInitialized()
		await this.executionService.cancelEstimate(estimateToken)
	}

	public async revokeAuthwits(
		networkId: string,
		account: string,
		ids: number[],
		feeSettings: FeeSettings,
		correlation?: string,
	): Promise<void> {
		await this.ensureInitialized()
		assertRevokeCount(ids)
		// Bound to the session the user acted in before anything else is awaited:
		// a lock and re-unlock during the reads below must not authorize the send.
		const fence = await this.profileService.captureExecutionFence()
		const { network, scope, authwits, operation } = await this.revokeOperation(networkId, account, ids, feeSettings)

		const task = this.taskService.startNewTask(new RevokeAuthwitsContent(ids))
		try {
			await this.awaitGrantBlocks(network, authwits)
			const txHash = await this.executionService.executeSendTransaction(
				operation,
				{ type: OriginType.UI },
				task,
				this.sendStartedHooks(correlation),
				fence,
			)

			await this.transactionService.waitForTx(txHash, fence.profileId, task)

			const node = await this.nodeFor(network)
			// `waitForTx` only confirms the tx left the pending queue (submitted),
			// not that its PUBLIC effect is mined + visible. Poll the on-chain state
			// so a fast (proverless) follow-up consume can't race a not-yet-mined
			// revoke. See waitForOnChainState.
			const revokeBlock = await this.waitForTxProven(node, txHash)
			// No subtask past the send: a profile switch clears the registry, and the prune must still land.
			await this.verifyRevoked(network, node, scope, authwits, revokeBlock)

			task.completeIfTracked()
		} catch (error) {
			// Convert the internal sentinel to the structured RPC-boundary
			// error so the popup's `classifyCancellableRejection` works.
			maybeRethrowAsRpcCancel(error, task)
			task.fail(error)
			throw error
		}
	}

	public async getRegistryEnabled(chainId: number, account: string): Promise<boolean> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		return (await this.statuses.get(authwitStatusRowId(profile.id, chainId, account), profile.id)) ?? true
	}

	public async setRegistryEnabled(
		networkId: string,
		account: string,
		enabled: boolean,
		feeSettings: FeeSettings,
		correlation?: string,
	): Promise<void> {
		await this.ensureInitialized()
		// Captured first, for the same reason as `revokeAuthwits`.
		const fence = await this.profileService.captureExecutionFence()
		const network = await this.networkService.getNetwork(networkId)
		const scope: AuthwitScope = { profileId: network.profileId, chainId: network.chainId, account }
		const task = this.taskService.startNewTask(new StepContent(`${enabled ? "Enable" : "Disable"} auth registry`))
		try {
			const txHash = await this.executionService.executeSendTransaction(
				registryToggleOperation(networkId, account, enabled, feeSettings),
				{ type: OriginType.UI },
				task,
				this.sendStartedHooks(correlation),
				fence,
			)

			await this.transactionService.waitForTx(txHash, fence.profileId, task)

			const node = await this.nodeFor(network)
			// Ensure the registry toggle is mined + visible before returning, so a
			// fast follow-up consume reads the new state (see waitForOnChainState).
			await this.waitForTxProven(node, txHash)
			// No subtask past the send: a profile switch clears the registry, and the status must still land.
			await this.applyStatus(node, scope)

			task.completeIfTracked()
		} catch (error) {
			// Convert the internal sentinel to the structured RPC-boundary
			// error so the popup's `classifyCancellableRejection` works.
			maybeRethrowAsRpcCancel(error, task)
			task.fail(error)
			throw error
		}
	}

	public async syncRegistry(networkId: string, account: string): Promise<void> {
		await this.ensureInitialized()
		const network = await this.networkService.getNetwork(networkId)
		const scope: AuthwitScope = { profileId: network.profileId, chainId: network.chainId, account }
		const task = this.taskService.startNewTask(new StepContent("Sync auth registry"))
		try {
			const node = await this.nodeFor(network)
			await Promise.all([this.syncAuthwits(node, scope, task), this.syncStatus(node, scope, task)])
			task.complete()
		} catch (error) {
			task.fail(error)
			throw error
		}
	}

	/**
	 * Wait until the mutation tx's block is PROVEN, not merely at the proposed
	 * `latest` tip. The sequencer executes public functions — e.g. a follow-up
	 * authwit consume's `AuthRegistry.consume` — against PROVEN state, so a
	 * revoke/toggle visible only at `latest` is invisible to that execution and a
	 * fast consume can still spend a "revoked" grant. Poll the proven tip past the
	 * tx's receipt block, and return that block. Throws on timeout — never report an unverifiable
	 * security mutation as success. (Proven advances normally here: grants reach
	 * proven within the test's own step timing, which is why their consumes work.)
	 */
	private async waitForTxProven(node: AztecNode, txHash: string, timeoutMs = 120_000): Promise<number> {
		const receipt = await node.getTxReceipt(TxHash.fromString(txHash))
		const target = receipt.blockNumber
		if (target === undefined) throw new Error(`waitForTxProven: tx ${txHash} has no block number`)
		const start = Date.now()
		while (Date.now() - start < timeoutMs) {
			if ((await node.getChainTips()).proven.block.number >= target) return target
			await sleep(1_000)
		}
		throw new Error(`waitForTxProven: tx ${txHash} (block ${target}) not proven within ${timeoutMs}ms`)
	}

	private async syncAuthwits(node: AztecNode, scope: AuthwitScope, parentTask: WrappedTask) {
		const task = parentTask.startSubtask(new StepContent("Sync authwits"))
		try {
			const authwits = await this.rowsForScope(scope)
			await Promise.all(authwits.map((authwit) => this.syncAuthwit(node, scope, authwit, task)))
			task.complete()
		} catch (error) {
			task.fail(error)
			throw error
		}
	}

	private async syncAuthwit(node: AztecNode, scope: AuthwitScope, authwit: Authwit, parentTask: WrappedTask) {
		// A `pending` row's grant may still land, so a node that reads its hash unauthorized proves
		// nothing about it: its tx outcome reconciles it, or a revoke that saw the grant's block
		// prunes it. Skipped before the subtask starts, so no open subtask blocks the parent.
		if (authwit.pending) return
		if (await isAuthwitConsumable(node, authwit.account, authwit.hash)) return
		const task = parentTask.startSubtask(new StepContent(`Sync authwit #${authwit.id}`))
		try {
			await this.deleteTracked(scope, authwit, { confirmedOnly: true })
			task.complete()
		} catch (error) {
			task.fail(error)
			throw error
		}
	}

	/** Deletes `authwit`'s row under the lock only while it still holds the same scope, hash and grant
	 *  transaction: a purge and restore during an unlocked node read can hand its id to another row.
	 *  `confirmedOnly` also keeps a row that is `pending` now. */
	private async deleteTracked(scope: AuthwitScope, authwit: Authwit, { confirmedOnly }: { confirmedOnly: boolean }): Promise<void> {
		await this.lock.withLock(async () => {
			const current = await this.authwits.get(`${authwit.id}`)
			if (
				!current ||
				(confirmedOnly && current.pending) ||
				current.profileId !== scope.profileId ||
				current.chainId !== scope.chainId ||
				current.account !== scope.account ||
				current.hash !== authwit.hash ||
				current.txHash !== authwit.txHash
			) {
				return
			}
			await this.authwits.delete(`${authwit.id}`)
			this.emit("onAuthwitDeleted", current)
		})
	}

	/** The single-attempt client of the operation's own network, for reads the caller repeats itself. */
	private async singleAttemptNodeFor(network: Network): Promise<AztecNode> {
		const url = primaryEndpointUrl(network)
		if (!url) throw new Error(`network ${network.id} has no primary endpoint`)
		return this.networkService.getSingleAttemptNodeForUrl(url)
	}

	/** Waits until the grant of every selected `pending` row is in a block, so the revoke is not
	 *  included before a grant it names. Refuses before any send when a row has no grant transaction,
	 *  or a grant still reads pending or unreadable once polling stops. A grant still read dropped then
	 *  does not hold back the rest of the batch: `verifyRevoked` keeps its row and fails the revoke
	 *  unless the grant has since landed at or below the revoke's block. */
	private async awaitGrantBlocks(network: Network, authwits: Authwit[]): Promise<void> {
		const pending = authwits.filter((authwit) => authwit.pending)
		const untracked = pending.find((authwit) => !authwit.txHash)
		if (untracked) throw grantNotInBlock(untracked)
		if (!pending.length) return
		const node = await this.singleAttemptNodeFor(network)
		const txHashes = [...new Set(pending.map((authwit) => authwit.txHash as string))]
		const deadline = Date.now() + GRANT_BLOCK_WAIT_MS
		const reads = await Promise.all(txHashes.map((txHash) => awaitGrantBlock(node, txHash, deadline)))
		const unseen = new Set(txHashes.filter((_, i) => reads[i] === undefined))
		const waiting = pending.find((authwit) => unseen.has(authwit.txHash as string))
		if (waiting) throw grantNotInBlock(waiting)
	}

	/** Prunes every revoked row the node now reads unauthorized, then fails on the first row it could
	 *  not verify. A `pending` row goes only when its grant's block is at or below `revokeBlock`: a grant
	 *  included after the revoke would still be live. */
	private async verifyRevoked(
		network: Network,
		node: AztecNode,
		scope: AuthwitScope,
		authwits: Authwit[],
		revokeBlock: number,
	): Promise<void> {
		const grantNode = authwits.some((authwit) => authwit.pending) ? await this.singleAttemptNodeFor(network) : undefined
		const outcomes = await Promise.allSettled(
			authwits.map(async (authwit) => {
				if (await isAuthwitConsumable(node, authwit.account, authwit.hash)) {
					throw new Error(`Authwit #${authwit.id} is still authorized after the revoke`)
				}
				if (authwit.pending) {
					const grantBlock = grantNode && authwit.txHash ? await grantBlockOf(grantNode, authwit.txHash) : undefined
					if (grantBlock === undefined || grantBlock > revokeBlock) throw grantNotInBlock(authwit)
				}
				await this.deleteTracked(scope, authwit, { confirmedOnly: false })
			}),
		)
		const failure = outcomes.find((outcome) => outcome.status === "rejected")
		if (failure) throw failure.reason
	}

	private async syncStatus(node: AztecNode, scope: AuthwitScope, parentTask: WrappedTask): Promise<void> {
		const task = parentTask.startSubtask(new StepContent("Sync status"))
		try {
			await this.applyStatus(node, scope)
			task.complete()
		} catch (error) {
			task.fail(error)
			throw error
		}
	}

	private async applyStatus(node: AztecNode, scope: AuthwitScope): Promise<void> {
		const rowId = authwitStatusRowId(scope.profileId, scope.chainId, scope.account)
		const isEnabled = await isAuthRegistryEnabled(node, scope.account)
		await this.lock.withLock(async () => {
			const enabled = (await this.statuses.get(rowId, scope.profileId)) ?? true
			if (enabled !== isEnabled) {
				if (isEnabled) {
					await this.statuses.delete(rowId, scope.profileId)
					this.emit("onRegistryEnabled", scope)
				} else {
					await this.statuses.set(rowId, isEnabled)
					this.emit("onRegistryDisabled", scope)
				}
			}
		})
	}

	public async backup(): Promise<Authwit[] | undefined> {
		const profile = await requireActiveProfile(this.profileService)

		const networks = await this.networkService.getNetworks()
		if (!networks.length) {
			return undefined
		}

		const authwits: Authwit[] = []

		for (const n of networks) {
			const accounts = await this.accountService.getAccounts(profile.id, n.chainId)
			for (const acc of accounts) {
				authwits.push(...(await this.rowsForScope({ profileId: profile.id, chainId: n.chainId, account: acc.address })))
			}
		}

		return authwits
	}

	/** Awaited authwit + status purge for a SET of `(chainId, address)` scopes within ONE profile —
	 *  registered with AccountService and invoked BEFORE the Account rows are deleted.
	 *  Scope is the full tuple: a bare-address match would destroy a sibling profile's rows (shared
	 *  addresses are a supported state), and an address+profile match would destroy this profile's
	 *  rows on ANOTHER chain. Idempotent. */
	public async purgeForAccounts(scopes: ReadonlyArray<AccountScope>, profileId: string): Promise<void> {
		await this.ensureInitialized()
		if (scopes.length === 0) return
		const keys = new Set(scopes.map((s) => accountScopeKey(s.chainId, s.address)))
		// A plain arrow, never async: an async wrapper delays the lock release by a tick.
		await this.lock.withLock(() =>
			this.purgeMatchingLocked({
				row: (a) => a.profileId === profileId && keys.has(accountScopeKey(a.chainId, a.account)),
				raw: (raw) =>
					raw.profileId === profileId &&
					typeof raw.chainId === "number" &&
					typeof raw.account === "string" &&
					keys.has(accountScopeKey(raw.chainId, raw.account)),
				status: (s) => s.profileId === profileId && keys.has(accountScopeKey(s.chainId, s.account)),
			}),
		)
	}

	/** Awaited authwit + status purge for one whole profile (profile-delete cascade). */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		await this.lock.withLock(() =>
			this.purgeMatchingLocked({
				row: (a) => a.profileId === profileId,
				raw: (raw) => raw.profileId === profileId,
				status: (s) => s.profileId === profileId,
			}),
		)
	}

	/** Awaited authwit + status purge for one `(profileId, chainId)` — the chain-purge subscriber
	 *  (deleteNetwork and the profile-delete network cascade both reach it). */
	public async purgeChain(profileId: string, chainId: number): Promise<void> {
		await this.ensureInitialized()
		await this.lock.withLock(() =>
			this.purgeMatchingLocked({
				row: (a) => a.profileId === profileId && a.chainId === chainId,
				raw: (raw) => raw.profileId === profileId && raw.chainId === chainId,
				status: (s) => s.profileId === profileId && s.chainId === chainId,
			}),
		)
	}

	/** Under `this.lock`: delete-then-emit each matching authwit, then the matching rows that fail
	 *  validation (invisible to `getValues()`, so they would otherwise survive forever), then the
	 *  matching status rows. */
	private async purgeMatchingLocked(match: {
		row: (authwit: Authwit) => boolean
		raw: (raw: Record<string, unknown>) => boolean
		status: (scope: { profileId: string; chainId: number; account: string }) => boolean
	}): Promise<void> {
		const authwits = (await this.authwits.getValues()).filter(match.row)
		await purgeRows(
			authwits,
			(authwit) => this.authwits.delete(`${authwit.id}`),
			(authwit) => this.emit("onAuthwitDeleted", authwit),
		)
		await purgeMalformedRows(this.authwits, match.raw, (id) => this.logDebug(`purged malformed authwit row ${id}`))
		await this.purgeStatuses(match.status)
	}

	/** Delete every readable registry-enabled row whose canonical tuple id matches `keep`, legacy
	 *  twins included. Attribution is off the byte-canonical natural id, never a value (a status
	 *  row's value is a bare boolean with no identity), so a non-canonical/foreign key is left
	 *  untouched; a sealed row no key opens is left to its profile's deletion. Caller holds the lock. */
	private async purgeStatuses(keep: (scope: { profileId: string; chainId: number; account: string }) => boolean): Promise<void> {
		for (const { located } of await this.statuses.entries()) {
			const scope = parseAuthwitStatusRowId(located.naturalId)
			if (scope && keep(scope)) await this.statuses.deleteStorageId(located.storageId)
		}
	}

	public async restore(authwits: Authwit[], profileId: string): Promise<Restored<Authwit>[]> {
		await this.ensureInitialized()
		// Deletion fence keyed on the composable's authoritative created-profile id.
		requireRestoreProfileId(profileId)
		const deletion = this.profileService.getDeletionState()
		const epochs = captureRestoreEpochs(deletion, [profileId])

		return await this.lock.withLock(async () => {
			// Duplicate identity is the compound (profileId, chainId, account, hash): the restored
			// rows are all forced to THIS profile, so a same-address sibling's existing row (a
			// different profileId) no longer false-blocks the restore, while a genuine in-profile
			// duplicate still does. Encoded injectively (JSON array): the strings are
			// attacker-shaped, so any in-band delimiter is forgeable. The seed comes from RAW
			// payloads — decoded reads hide malformed rows whose tuples must still block
			// duplicates; a row too corrupt to yield its fields has no identity to collide with.
			// NO cap check: these are already-granted authorizations, and rejecting a unique row
			// would destroy the only revocation index. The profile's sealed rows are opened, with no
			// codec, through the keys the restore commit put in the keyring.
			const pairKeyOf = (chainId: number, account: string, hash: string) => JSON.stringify([profileId, chainId, account, hash])
			const seen = new Set<string>()
			for (const { row } of (await this.authwits.rawRowsOf(profileId)).rows) {
				const v = row as { chainId?: unknown; account?: unknown; hash?: unknown }
				if (typeof v.chainId === "number" && typeof v.account === "string" && typeof v.hash === "string") {
					seen.add(pairKeyOf(v.chainId, v.account, v.hash))
				}
			}
			// Occupancy from the PHYSICAL key space: the cursor must never land on
			// a key a decoded read can't see (a hidden row would be overwritten).
			// Writes use canonical String(id), so noncanonical aliases can't
			// falsely collide.
			const occupied = new Set(await this.authwits.getKeys())
			let id = array_max((await this.authwits.getValues()).map((x) => x.id)) + 1
			// `id` advances only after a successful write: restoreRows routes a
			// throwing row to `restoreError` and never reaches the `id++`, so a
			// malformed authwit doesn't consume a cursor slot. Ordering inside the
			// writer is load-bearing: validate → dedupe-check → write → record —
			// a malformed or duplicate row must neither block nor poison a valid
			// sibling.
			return await restoreRows(authwits, async (authwit) => {
				// The safe-integer guard lives INSIDE the loop condition: a hostile
				// decodable row can sit at MAX_SAFE_INTEGER, past which the float
				// cursor stops advancing (id++ is a no-op) — an unguarded skip
				// loop would spin forever under the service-wide lock, and an
				// unguarded write would land key-identity-hidden on read. Fail
				// the ROW (restoreRows tags it), never the service.
				while (Number.isSafeInteger(id) && occupied.has(`${id}`)) id++
				if (!Number.isSafeInteger(id)) {
					throw new Error("authwit id space exhausted (hostile id boundary)")
				}
				// Parse the persisted shape, FORCING profileId to the threaded id — a hostile
				// backup's foreign profileId is overwritten, never trusted — so a malformed backup
				// authwit is recorded as restoreError, not silently written + codec-hidden on read.
				const row = AuthwitSchema.parse({ ...authwit, id, profileId })
				const pairKey = pairKeyOf(row.chainId, row.account, row.hash)
				if (seen.has(pairKey)) {
					throw new Error("authwit already exists (profile+chain+account+hash)")
				}
				const write = await this.authwits.prepare(`${id}`, row)
				assertRestoreEpoch(deletion, epochs, profileId)
				await write.commit()
				occupied.add(`${id}`)
				seen.add(pairKey)
				id++
				return row
			})
		})
	}
}
