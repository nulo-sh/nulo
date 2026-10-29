// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { type IntentInnerHash, type CallIntent, computeAuthWitMessageHash } from "@aztec-labs/aztec.js/authorization"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import {
	type ContractArtifact,
	ContractArtifactSchema,
	FunctionSelector,
	FunctionCall,
	getFunctionReturnType,
} from "@aztec-labs/stdlib/abi"
import type { AuthWitness } from "@aztec-labs/stdlib/auth-witness"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import {
	CompleteAddress,
	computeContractAddressFromInstance,
	ContractInstanceWithAddressSchema,
	computePartialAddress,
} from "@aztec-labs/stdlib/contract"
import z from "zod"
import { NetworkService, networkInfoFrom } from "@/wallet/services/network/service"
import type { Network } from "@/wallet/services/network/spec"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import { offscreenEpoch, onOffscreenRetired } from "@/wallet/utils/offscreen"
import { AccountService } from "@/wallet/services/account/service"
import { ContactService } from "@/wallet/services/contact/service"
import { ProfileService } from "@/wallet/services/profile/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { TokenService } from "@/wallet/services/token/service"
import { FpcService, FpcType } from "@/wallet/services/fpc/service"
import type { FpcInfo } from "@/wallet/services/fpc/spec"
import type { Fpc } from "@/wallet/services/fpc/fpc"
import { TransactionService, OriginType, type TransferType, type LocalTxOrigin, TxStatus } from "@/wallet/services/transaction/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import type { OperationContext } from "@/wallet/services/operation-journal/spec"
import { isApprovedSendInFlight } from "@/utils/in-flight-send"
import { abortableSleep } from "@/utils/abortable-sleep"
import { DAPP_INTERACTION_SERVICE_NAME, type ExecutionHooks } from "@/wallet/services/dapp-interaction/spec"
import type { DappSessionService } from "@/wallet/services/dapp-session/service"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import { TaskService, type WrappedTask, ExecuteOperationContent } from "@/wallet/services/task/service"
import type { ILogger } from "@/wallet/logger"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { type CancelOrFailResult, classifyOperationCatch } from "./rpc-cancel"
import { ESTIMATE_JOB_TTL_MS, EstimateCancelRegistry } from "./estimate-cancel-registry"
import {
	ContractNotRegisteredError,
	InvalidWalletArgumentsError,
	JobCancelledError,
	ScopeViolationError,
	SessionEndedError,
	TermsAcceptanceRequiredError,
	TooManyPendingError,
	UnsupportedMethodError,
} from "@nulo/extension-messaging/errors"
import { isFeeAmount, JobCancelledSentinel } from "@nulo/wallet-core/jobs"
import { getErrorMessage } from "@nulo/wallet-core/utils"
import { assertLiveChainIdentity, liveChainInfo } from "@nulo/aztec-runtime/utils"
import { assertArtifactClassId, assertInstanceArtifactClassId } from "@nulo/aztec-runtime/pxe"
import {
	type DraftOperation,
	type FeeSettingsReaders,
	carriesFeeSettings,
	fieldAddressKey,
	refuseUnknownPriorities,
} from "@nulo/wallet-bridge"
import {
	EXECUTION_SERVICE_NAME,
	type Methods,
	type Operation,
	type RegisterSenderOperation,
	type RegisterContractOperation,
	type SendTransactionOperation,
	type OperationResult,
	type Action,
	type FeeSettings,
	type AztecRegisterSenderOperation,
	type AztecRegisterContractOperation,
	type AztecCreateAuthWitOperation,
	type FeeOptions,
	type GasBalances,
	type FeeQuestion,
	type OperationApprovalEnvelope,
	type OperationAuthwitPreview,
	type DecodedCall,
	type DecodedGrant,
	type DisplayCallInput,
	type RegisterTokenOperation,
	type TransferFeeEstimate,
	type TransferFeeQueued,
} from "./spec"
import type { LastProveOutcome } from "./models"
import { SendSequencer } from "./send-sequencer"
import { ChainTipGate } from "./chain-tip-gate"
import { recordedTxKeys } from "./transfer-sequence-keys"
import { coerceAmount } from "./coerce-amount"
import { OperationPlanner, type TransferRequest } from "./operation-planner"
import type { SendFeeFigure } from "./fee-reask"
import { type QueuedFeeCap, QueuedFeeAnswers, queuedFeeBasis, queuedFeeCap, sendShapeOf } from "./queued-fee-cap"
import { TransferEstimateReuse } from "./transfer-estimate-reuse"
import { type ChainIdentity, type EstimateReuseDeps, feeMultiplierFor } from "./estimate-reuse-shared"
import { OperationEstimateReuse } from "./operation-estimate-reuse"
import { PreviewSnapshots } from "./preview-snapshots"
import { TransferExecutor, type TransferSequence } from "./transfer-executor"
import { DappSendExecutor } from "./dapp-send-executor"
import { DiscoveryAwareEstimator, type DiscoveryProbe } from "./discovery-aware-estimator"
import { ViewExecutor } from "./view-executor"
import { ExecutionLane } from "./execution-lane"
import { GasBalanceReader } from "./gas-balance-reader"
import { AUTHWIT_CALL_BINDING, ContractResolver, assertSelectorBinding, findFunctionBySelector } from "./contract-resolver"
import { type ArtifactLookup, decodeCallForDisplay, decodeGrantForDisplay } from "./call-decoder"
import { getViewSimulationDeps } from "./helpers/get-view-simulation-deps"
import { AuthwitDiscoverer } from "./authwit-discoverer"
import { TxRequestBuilder } from "./tx-request-builder"
import type { FeeEstimate, FeeStrategy, FeeStrategyContext, FeeStrategyDeps, OnBuilt } from "./fee/fee-strategy"
import { appPriorityOf } from "./fee/fee-strategy"
import { buildFeeStrategies } from "./fee/build-fee-strategies"
import { ExecutionCoordinator } from "./execution-coordinator"
import { type ProofGate, NOOP_PROOF_GATE } from "@/e2e/proof-gate"

export * from "./spec"

/** The dApp-interaction service's SW-internal view of a stored request: the
 *  operation at `(interactionId, index)`, materialized and — when fee settings
 *  are given — completed with a validated fee path, or as a draft before any
 *  fee choice. The estimate, preview and display entry points read the
 *  operation THROUGH this, never from their caller. */
export interface InteractionOperationSource {
	materializeStoredOperation(interactionId: string, index: number, feeSettings?: FeeSettings): Promise<Operation>
	/** Asks a held send's question in a window; `true` only when the person accepted it. */
	askFeeAgain(question: FeeQuestion): Promise<boolean>
	materializeStoredDraft(interactionId: string, index: number): Promise<DraftOperation>
	materializeQuestionDraft(interactionId: string): Promise<DraftOperation>
	/** Keeps a refusal an estimate or preview of the request met; a request no longer stored keeps nothing. */
	recordRefusal(interactionId: string, refusal: ScopeViolationError): void
	refusalOf(interactionId: string): ScopeViolationError | undefined
}

/** Default PXE-client factory: the real RPC-backed client. Exported so the
 *  construction seam (real client vs the composition-test fake) is unit-testable
 *  without spinning up `init()` + a full ServiceCollection.
 *
 *  It tracks this service's timed-out simulations so an estimate keeps its admission place while
 *  one still runs offscreen. A record lives as long as an estimate entry and starts after the entry
 *  it holds, so it never ends a hold before the registry's TTL would. */
export const DEFAULT_PXE_CLIENT_FACTORY = (logger: ILogger): PxeServiceClient => {
	const client = new PxeServiceClient(logger)
	client.setDocumentEpochProvider(offscreenEpoch, ESTIMATE_JOB_TTL_MS)
	onOffscreenRetired((epoch) => client.retireEpochsThrough(epoch))
	return client
}

/** A popup decodes one approval window at a time; anything past this is not a display request. */
const MAX_DISPLAY_CALLS = 64

/** The operations that end in a broadcast. Refused up front without a current Terms acceptance so
 *  nobody proves for minutes first; reads, registrations and simulations are untouched, because the
 *  wallet's own views run through `executeOperations` too. */
const BROADCASTING_OPERATION_KINDS: ReadonlySet<Operation["kind"]> = new Set(["send_transaction", "aztec_sendTx"])

/** The app a dApp registration is counted against, and the session it was captured under. */
type Registrant = { origin: string; fence: ExecutionFence }

/** The operations that run under the authorizing session's fence. The wallet-sdk dispatcher sends
 *  every dApp op under the wire handler's admission fence; of its reads, registrations and
 *  simulations only a registration reads it, to count against that session (`registrant`). */
const FENCED_OPERATION_KINDS: ReadonlySet<Operation["kind"]> = new Set([
	"send_transaction",
	"aztec_sendTx",
	"register_token",
	"aztec_createAuthWit",
])

/** `tokenContract` as a transfer request carries it, or the refusal of `method`'s arguments. */
function tokenContractKey(method: string, tokenContract: unknown): string {
	const key = typeof tokenContract === "string" ? fieldAddressKey(tokenContract) : undefined
	if (key === undefined) throw InvalidWalletArgumentsError.forMethod(method)
	return key
}

/** The one figure a transfer is held to, from at most one of its two fee arguments. */
function sendFeeFigureOf(feeCap: string | undefined, shownFee: string | undefined): SendFeeFigure | undefined {
	const figure: SendFeeFigure | undefined =
		feeCap !== undefined ? { fee: feeCap, rule: "cap" } : shownFee !== undefined ? { fee: shownFee, rule: "estimate" } : undefined
	if ((feeCap !== undefined && shownFee !== undefined) || (figure && !isFeeAmount(figure.fee))) {
		throw InvalidWalletArgumentsError.forMethod("executeTransfer")
	}
	return figure
}

/** The popup's fee settings: one per transfer or estimate, one per broadcasting operation. */
const FEE_SETTINGS_OF = {
	executeTransfer: ([, , , , , , , feeSettings]) => [feeSettings],
	estimateTransferFee: ([, , , , , , , feeSettings]) => [feeSettings],
	estimateOperationFee: ([, , feeSettings]) => [feeSettings],
	executeOperations: ([operations]) =>
		Array.isArray(operations) ? operations.flatMap((op) => (carriesFeeSettings(op) ? [op.feeSettings] : [])) : [],
} satisfies FeeSettingsReaders<Methods>

export class ExecutionService extends Service<Methods> implements ServiceSpec<Methods> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"executeTransfer",
		"executeOperations",
		"getGasBalances",
		"peekGasBalances",
		"estimateTransferFee",
		"estimateOperationFee",
		"previewOperationAuthwits",
		"decodeCallsForDisplay",
		"decodeGrantsForDisplay",
		"decodeQuestionGrantsForDisplay",
		"cancelJob",
		"acceptQueuedFee",
		"cancelEstimate",
		"getLastProveOutcome",
	)
	public static name = EXECUTION_SERVICE_NAME

	private pxeService: PxeServiceClient = null!
	private profileService: ProfileService = null!
	private networkService: NetworkService = null!
	private accountService: AccountService = null!
	private contactService: ContactService = null!
	private tokenService: TokenService = null!
	private fpcService: FpcService = null!
	private transactionService: TransactionService = null!
	private authRegistryService: AuthRegistryService = null!
	private taskService: TaskService = null!
	private operationJournal: OperationJournalService = null!
	private legal: LegalAcceptanceService = null!
	private dappSessionService: DappSessionService = null!
	private planner: OperationPlanner = null!
	private resolver: ContractResolver = null!

	/**
	 * Public read-only access to the `ContractResolver` instance so external
	 * callers (BalanceProjector, getViewSimulationDeps) get the same instance
	 * rather than reaching into `this.resolver` via a private-state escape
	 * hatch.
	 */
	public get contractResolver(): ContractResolver {
		return this.resolver
	}
	private authwit: AuthwitDiscoverer = null!
	private txBuilder: TxRequestBuilder = null!
	private feeStrategies: Map<FeeSettings["paymentMethod"]["kind"], FeeStrategy> = null!
	private coordinator: ExecutionCoordinator = null!

	/** TTL cache for gas balance queries (survives popup reopens). */
	private gasBalances: GasBalanceReader = null!

	/** Estimate→confirm reuse caches. The popup-side estimators write; the
	 *  confirm paths consume when the caller passes an estimate id AND the
	 *  validation snapshot matches the SW's current view — skipping the
	 *  `buildAndEstimateTxRequest` round-trip (and, for dApp ops, the
	 *  authwit-discovery simulation) on the happy path.
	 *
	 *  Scope: `estimateReuse` covers the Send-page transfer flow
	 *  (`estimateTransferFee` → `executeTransfer`); `operationEstimateReuse`
	 *  covers standard-mode `aztec_sendTx` (`estimateOperationFee` →
	 *  `executeAztecSendTx`, ids threaded via the popup-privileged
	 *  `approveInteraction` envelope). Still carved out: `send_transaction`
	 *  (its confirm path skips discovery today — reusing a
	 *  discovery-inclusive estimate would change behavior), embedded-fee,
	 *  `default_entrypoint`/NO_FROM, and `fjwc`. */
	private estimateReuse: TransferEstimateReuse = null!
	private operationEstimateReuse: OperationEstimateReuse = null!
	private estimateCancel: EstimateCancelRegistry = null!
	private previewSnapshots: PreviewSnapshots = null!
	/** Resolved lazily: the dApp-interaction service registers after this one
	 *  and depends on it, so the lookup happens at first use, not at init. */
	private services: ServiceCollection = null!
	private transferExecutor: TransferExecutor = null!
	private readonly sendSequencer = new SendSequencer({
		pendingTxs: (account) => this.transactionService.getPendingForAccount(account),
		sleep: abortableSleep,
		now: () => Date.now(),
	})
	private readonly queuedFeeAnswers = new QueuedFeeAnswers()
	private readonly chainTipGate = new ChainTipGate({
		readTip: (networkId) => this.networkService.readChainTip(networkId),
		sleep: abortableSleep,
		now: () => Date.now(),
		logDebug: (msg) => this.logDebug(msg),
	})
	private dappSendExecutor: DappSendExecutor = null!
	private viewExecutor: ViewExecutor = null!
	private lane: ExecutionLane = null!

	public constructor(
		logger: ILogger,
		/** E2E-only proving hold-point, forwarded to the coordinator. The
		 *  no-op default keeps production proving unimpeded. */
		private readonly proofGate: ProofGate = NOOP_PROOF_GATE,
		/** PXE-client factory — the seam for in-process composition tests. The
		 *  default builds the real RPC-backed client, so production is unchanged;
		 *  tests inject a fake to drive the graph without the offscreen PXE /
		 *  Aztec sandbox. (Rollout: extract an `ExecutionPxePort` interface to
		 *  drop the test-side cast — deferred.) */
		private readonly pxeClientFactory: (logger: ILogger) => PxeServiceClient = DEFAULT_PXE_CLIENT_FACTORY,
	) {
		super(EXECUTION_SERVICE_NAME, logger)
	}

	/** An unknown speed level is refused before the method runs; fee math never reads one. */
	protected override invoke(method: string, params: unknown[]): unknown {
		refuseUnknownPriorities(FEE_SETTINGS_OF, method, params)
		return super.invoke(method, params)
	}

	protected async init(services: ServiceCollection) {
		this.services = services
		this.pxeService = this.pxeClientFactory(this.logger)
		this.profileService = services.get(ProfileService.name)
		this.networkService = services.get(NetworkService.name)
		this.accountService = services.get(AccountService.name)
		this.contactService = services.get(ContactService.name)
		this.tokenService = services.get(TokenService.name)
		this.fpcService = services.get(FpcService.name)
		this.transactionService = services.get(TransactionService.name)
		this.authRegistryService = services.get(AuthRegistryService.name)
		this.taskService = services.get(TaskService.name)
		this.operationJournal = services.get(OperationJournalService.name)
		this.legal = services.get(LegalAcceptanceService.name)
		this.dappSessionService = services.get(DAPP_SESSION_SERVICE_NAME)
		this.planner = new OperationPlanner(this.profileService, this.tokenService)
		this.resolver = new ContractResolver(this.logger)
		this.authwit = new AuthwitDiscoverer(this.logger)
		this.coordinator = new ExecutionCoordinator(this.taskService, this.logger, this.legal, this.proofGate, {
			updateProvingBackend: (journalId, backend) => this.operationJournal.updateProvingBackend(journalId, backend),
		})
		this.pxeService.onProvePhase.add((event) => void this.coordinator.onProvePhase(event))
		this.wireGasBalancesAndEstimateCaches()
		this.wireExecutors()
		// The deps literal stays HERE: every eager `this.*` read and
		// the lazy coordinator closure keep their capture point at the root.
		const feeDeps: FeeStrategyDeps = {
			txBuilder: this.txBuilder,
			simulateTxTask: (pxe, req, opts, parentTask) => this.coordinator.simulateTxTask(pxe, req, opts, parentTask),
			fpcService: this.fpcService,
			tasks: this.taskService,
			logger: this.logger,
		}
		this.feeStrategies = buildFeeStrategies(feeDeps)
		this.wireCacheInvalidation()
		// Every session open and close fires this inside the session transition, so the sweep is
		// started here and never awaited; it logs its own failures.
		this.profileService.onActiveProfileChanged.add(() => void this.lane.abandonDeadSessions())
		this.profileService.setExpiryDeferral((profileId) => this.hasApprovedSendsInFlight(profileId))
	}

	/** Reads the journal in-process: its gated RPC read asks for the active profile, which waits on
	 *  the facade lock the expiry decision's caller may already hold. */
	private async hasApprovedSendsInFlight(profileId: string): Promise<boolean> {
		const operations = await this.operationJournal.getOperations({ profileId })
		return operations.some(isApprovedSendInFlight)
	}

	/** Wiring only — every lambda reads `this.*` lazily at call time, so
	 *  construction order relative to init's tail is not observable. */
	private wireGasBalancesAndEstimateCaches(): void {
		this.gasBalances = new GasBalanceReader({
			getChainId: async (networkId) => (await this.networkService.getNetwork(networkId)).chainId,
			getViewDeps: (networkId, accountAddress) =>
				getViewSimulationDeps(
					{
						profiles: this.profileService,
						networks: this.networkService,
						accounts: this.accountService,
						pxeService: this.pxeService,
						contractResolver: this.resolver,
						logger: this.logger,
					},
					networkId,
					accountAddress,
				),
			getFpcs: (chainId) => this.fpcService.getFpcs(chainId),
			logDebug: (msg, ...rest) => this.logDebug(msg, ...rest),
			logError: (msg, ...rest) => this.logError(msg, ...rest),
		})
		const reuseDeps: EstimateReuseDeps = {
			getNetwork: (networkId) => this.networkService.getNetwork(networkId),
			getNode: (chainId) => this.networkService.getNode(chainId),
			getLiveChainIdentity: (network) => this.liveChainIdentity(network),
			getFpcInfo: (fpcId) => this.sponsorRow(fpcId),
			getPendingForAccount: (account) => this.transactionService.getPendingForAccount(account),
			sequenceEpoch: (chainId, account) => this.sendSequencer.epoch({ chainId, account }),
			logDebug: (msg) => this.logDebug(msg),
		}
		this.estimateReuse = new TransferEstimateReuse(reuseDeps)
		this.operationEstimateReuse = new OperationEstimateReuse(reuseDeps)
		this.previewSnapshots = new PreviewSnapshots()
		this.estimateCancel = new EstimateCancelRegistry({
			// Ids are UUID-unique across the caches — evict from each.
			evictStash: (estimateId) => {
				this.estimateReuse.evict(estimateId)
				this.operationEstimateReuse.evict(estimateId)
				this.previewSnapshots.evict(estimateId)
			},
			logDebug: (msg) => this.logDebug(msg),
		})
	}

	/** The sponsor row decorated as a build decorates it (`getFpcImpl` derives the protocol
	 *  addresses; `getFpc` reads a cache a purge of the same chain id in another profile empties). */
	private async sponsorRow(fpcId: string): Promise<FpcInfo> {
		return (await this.fpcService.getFpcImpl(fpcId)).infoData
	}

	/** The live pair, asserted against the network row: what a reused request skipped at build. */
	private async liveChainIdentity(network: Network): Promise<ChainIdentity> {
		const node = await this.networkService.getNode(network.chainId)
		const info = await node.getNodeInfo()
		assertLiveChainIdentity(network, info)
		return { l1ChainId: info.l1ChainId, rollupVersion: info.rollupVersion }
	}

	private wireExecutors(): void {
		this.wireLaneAndTransferExecutor()
		this.wireDappSendAndViewExecutors()
	}

	private wireLaneAndTransferExecutor(): void {
		this.lane = new ExecutionLane({
			operationJournal: this.operationJournal,
			getActiveProfile: () => this.profileService.getActiveProfile(),
			captureProfileEpoch: (profileId) => this.profileService.getDeletionState().capture(profileId),
			assertFence: (fence) => this.profileService.assertFence(fence),
			peekLiveSerial: () => this.profileService.peekLiveSerial(),
			getNetwork: (networkId) => this.networkService.getNetwork(networkId),
			logDebug: (msg, ...rest) => this.logDebug(msg, ...rest),
			logInfo: (msg, ...rest) => this.logInfo(msg, ...rest),
			logError: (msg, ...rest) => this.logError(msg, ...rest),
		})
		this.transferExecutor = new TransferExecutor({
			tasks: this.taskService,
			planner: this.planner,
			estimateReuse: this.estimateReuse,
			coordinator: this.coordinator,
			lane: {
				registerInFlight: (journalId, serial, controller) => this.lane.registerInFlight(journalId, serial, controller),
				deleteController: (journalId) => this.lane.deleteController(journalId),
				beginQueuedWait: (journalId) => this.lane.beginQueuedWait(journalId),
				endQueuedWait: (journalId) => this.lane.endQueuedWait(journalId),
				isSlotBusy: (profileId, chainId) => this.lane.isSlotBusy(profileId, chainId),
				tryTakeSlot: (profileId, chainId) => this.lane.tryTakeSlot(profileId, chainId),
				acquireTransferSlot: (networkId, journalId, fence, signal, onWait) =>
					this.lane.acquireTransferSlot(networkId, journalId, fence, signal, onWait),
			},
			sequencer: this.sendSequencer,
			chainTip: this.chainTipGate,
			getFpcImpl: (fpcId) => this.fpcService.getFpcImpl(fpcId),
			transactionsOf: (account, profileId) => this.transactionService.transactionsOf(account, profileId),
			getActiveProfile: () => this.profileService.getActiveProfile(),
			captureExecutionFence: () => this.captureFence(),
			assertFence: (fence) => this.profileService.assertFence(fence),
			isFenceLive: (fence) => this.profileService.isFenceLive(fence),
			getNetwork: (networkId) => this.networkService.getNetwork(networkId),
			getNode: (chainId) => this.networkService.getNode(chainId),
			readPublicStorageOnce: (network, contract, slot, timeoutMs) =>
				this.networkService.readPublicStorageOnce(network, contract, slot, timeoutMs),
			getPXE: (network) => this.pxeService.getPXE(networkInfoFrom(network)),
			getAccountContract: (profileId, chainId, address) => this.accountService.getAccountContract(profileId, chainId, address),
			getPendingForAccount: (account) => this.transactionService.getPendingForAccount(account),
			addTransaction: (...args) => this.transactionService.addTransaction(...args),
			buildAndEstimate: (op, feeSettings, fence, parentTask, signal, fpc) =>
				this.buildAndEstimateTxRequest(op, feeSettings, fence, parentTask, signal, undefined, fpc),
			createJournalOperation: (input) => this.operationJournal.createOperation(input),
			transitionJournal: (journalId, progress, error) => this.operationJournal.transitionOperation(journalId, progress, error),
			answers: this.queuedFeeAnswers,
			logDebug: (msg, ...rest) => this.logDebug(msg, ...rest),
			logError: (msg, ...rest) => this.logError(msg, ...rest),
		})
		this.txBuilder = new TxRequestBuilder(
			this.pxeService,
			this.profileService,
			this.networkService,
			this.accountService,
			this.authRegistryService,
			this.taskService,
			this.resolver,
			this.authwit,
			this.logger,
		)
	}

	private wireDappSendAndViewExecutors(): void {
		const estimateWithDiscovery = new DiscoveryAwareEstimator({
			authwit: this.authwit,
			buildAndEstimateValidated: (op, feeSettings, fence, parentTask, signal, onBuilt) =>
				this.buildAndEstimateTxRequest(op, feeSettings, fence, parentTask, signal, undefined, undefined, onBuilt),
			buildAndEstimateFolded: (op, feeSettings, fence, probe, parentTask, signal, onBuilt) =>
				this.buildAndEstimateTxRequest(op, feeSettings, fence, parentTask, signal, probe, undefined, onBuilt),
			buildForDiscovery: async (op, method, fence, onBuilt) => {
				const sendOp = op as SendTransactionOperation
				// An app's private call may read its gas settings, so discovery simulates with its priority too.
				const { txRequest, node, pxe, account, network, txCalls } = await this.txBuilder.buildStandard(
					sendOp,
					fence,
					method,
					undefined,
					appPriorityOf(sendOp.fee),
				)
				await onBuilt?.(txCalls)
				return { txRequest, node, pxe, account, network }
			},
		})
		this.dappSendExecutor = new DappSendExecutor({
			planner: this.planner,
			txBuilder: this.txBuilder,
			coordinator: this.coordinator,
			estimateWithDiscovery,
			operationEstimateReuse: this.operationEstimateReuse,
			previewSnapshots: this.previewSnapshots,
			getActiveProfile: () => this.profileService.getActiveProfile(),
			captureExecutionFence: () => this.captureFence(),
			assertFence: (fence) => this.profileService.assertFence(fence),
			isFenceLive: (fence) => this.profileService.isFenceLive(fence),
			getNetwork: (networkId) => this.networkService.getNetwork(networkId),
			getNode: (chainId) => this.networkService.getNode(chainId),
			readPublicStorageOnce: (network, contract, slot, timeoutMs) =>
				this.networkService.readPublicStorageOnce(network, contract, slot, timeoutMs),
			getPXE: (network) => this.pxeService.getPXE(networkInfoFrom(network)),
			getAccountContract: (profileId, chainId, address) => this.accountService.getAccountContract(profileId, chainId, address),
			getPendingForAccount: (account) => this.transactionService.getPendingForAccount(account),
			sequenceEpoch: (chainId, account) => this.sendSequencer.epoch({ chainId, account }),
			lane: {
				deleteController: (journalId) => this.lane.deleteController(journalId),
				acquireSlot: (networkId, queuedJournalId, fence, onEnqueued, originKey) =>
					this.lane.acquireSlot(networkId, queuedJournalId, fence, onEnqueued, originKey),
				claimOrCreateJournal: (networkId, accountAddress, origin, calls, hooks, reuseController, fence) =>
					this.lane.claimOrCreateJournal(networkId, accountAddress, origin, calls, hooks, reuseController, fence),
				beginJournal: (networkId, accountAddress, origin, calls, fence) =>
					this.lane.beginJournal(networkId, accountAddress, origin, calls, fence),
				recordBuiltCall: (journalId, txCalls) => this.lane.recordBuiltCall(journalId, txCalls),
				markJournal: (journalId, progress, error, retitle) => this.lane.markJournal(journalId, progress, error, retitle),
				commitJournal: (journalId, progress) => this.lane.commitJournal(journalId, progress),
				parkSlot: (release, networkId, queuedJournalId, fence, preController, originKey, wait) =>
					this.lane.parkSlot(release, networkId, queuedJournalId, fence, preController, originKey, wait),
				joinOriginLine: (fence, chainId, originKey) => this.lane.joinOriginLine(fence, chainId, originKey),
				failUnclaimed: (journalId, error) => this.lane.failUnclaimed(journalId, error),
				reclaimParked: (journalId) => this.lane.reclaimParked(journalId),
				beginQueuedWait: (journalId) => this.lane.beginQueuedWait(journalId),
				endQueuedWait: (journalId) => this.lane.endQueuedWait(journalId),
			},
			sequencer: this.sendSequencer,
			chainTip: this.chainTipGate,
			buildAndEstimateValidated: (op, feeSettings, fence, parentTask, signal, onBuilt) =>
				this.buildAndEstimateTxRequest(op, feeSettings, fence, parentTask, signal, undefined, undefined, onBuilt),
			addTransaction: (...args) => this.transactionService.addTransaction(...args),
			protocolSponsorAddress: async (chainId) => (await this.fpcService.getOrComputeProtocolAddresses(chainId)).sponsored,
			recordPendingAuthwits: (...args) => this.authRegistryService.recordPendingAuthwits(...args),
			noteSent: (chainId, account, txHash, calls) =>
				this.sendSequencer.externalSent({ chainId, account }, txHash, recordedTxKeys({ account, calls })),
			answers: this.queuedFeeAnswers,
			askInWindow: (question) => void this.askInWindow(question),
			logDebug: (msg, ...rest) => this.logDebug(msg, ...rest),
		})
		this.viewExecutor = new ViewExecutor({
			planner: this.planner,
			resolver: this.resolver,
			txBuilder: this.txBuilder,
			pxeService: this.pxeService,
			profileService: this.profileService,
			networkService: this.networkService,
			accountService: this.accountService,
			contactService: this.contactService,
			logDebug: (msg, ...rest) => this.logDebug(msg, ...rest),
			logError: (msg, ...rest) => this.logError(msg, ...rest),
		})
	}

	private wireCacheInvalidation(): void {
		// Invalidate gas balance cache when a transaction settles
		this.transactionService.onTransactionUpdated.add((tx) => {
			if (tx.status !== TxStatus.Pending) {
				this.gasBalances.invalidateAccount(tx.account)
				this.sendSequencer.settled(tx.hash)
				this.chainTipGate.observe(tx)
			}
		})

		// The cache key is profile-FREE while the private leg reads through the
		// profile-FILTERED getFpcs — without this, switching profiles can serve
		// profile A's cached PrivateFPC balance to profile B for up to the TTL.
		// EVICT (not stale-mark): a stale-marked last-known would still be
		// peekable, painting the old profile's figures dimmed under the new one.
		this.profileService.onActiveProfileChanged.add(() => this.gasBalances.evictAll())

		// PrivateFPC address is read on every getGasBalances() call to fetch
		// `balance_of`. The cache is keyed only by `${networkId}:${account}`,
		// so swapping the PrivateFPC address would otherwise serve stale
		// private-FJ readouts for up to GAS_BALANCE_TTL_MS. Invalidate on any
		// PrivateFpc mutation (stale-marked, peek keeps serving last-known).
		// Coarse but correct.
		const invalidateOnPrivateFpc = (fpc: { type: FpcType }) => {
			if (fpc.type === FpcType.PrivateFpc) this.gasBalances.invalidateAll()
		}
		this.fpcService.onFpcUpdated.add(invalidateOnPrivateFpc)
		this.fpcService.onFpcDeleted.add(invalidateOnPrivateFpc)
	}

	/** Capture the {profileId, epoch, session} fence at execution AUTHORIZATION (before the
	 *  slow prove) so `addTransaction` can reject a completing prove whose profile
	 *  was deleted meanwhile. Delegates to ProfileService so the active-read +
	 *  reserved-check + epoch-capture are ATOMIC under the facade lock — composing
	 *  requireActiveProfile + capture here would leave a TOCTOU. */
	private async captureFence(): Promise<ExecutionFence> {
		return this.profileService.captureExecutionFence()
	}

	public async executeTransfer(
		networkId: string,
		accountAddress: string,
		tokenId: number,
		tokenContract: string,
		transferType: TransferType,
		recipientAddress: string,
		amount: bigint,
		feeSettings: FeeSettings,
		precomputedEstimateId?: string,
		feeCap?: string,
		shownFee?: string,
	): Promise<string> {
		await this.ensureInitialized()
		const figure = sendFeeFigureOf(feeCap, shownFee)
		const contract = tokenContractKey("executeTransfer", tokenContract)
		// Early refusal only — the wall is in the coordinator. This spares the user a proof.
		await this.legal.assertCurrent()
		amount = coerceAmount(amount)
		const fence = await this.captureFence()
		return this.transferExecutor.execute(
			{ networkId, accountAddress, tokenId, tokenContract: contract, transferType, recipientAddress, amount, feeSettings },
			precomputedEstimateId,
			fence,
			figure,
		)
	}

	public async estimateTransferFee(
		networkId: string,
		accountAddress: string,
		tokenId: number,
		tokenContract: string,
		transferType: TransferType,
		recipientAddress: string,
		amount: bigint,
		feeSettings: FeeSettings,
		estimateToken?: string,
	): Promise<TransferFeeEstimate | TransferFeeQueued> {
		await this.ensureInitialized()
		const contract = tokenContractKey("estimateTransferFee", tokenContract)
		amount = coerceAmount(amount)
		const req = { networkId, accountAddress, tokenId, tokenContract: contract, transferType, recipientAddress, amount, feeSettings }
		const profile = await requireActiveProfile(this.profileService, "Wallet locked")
		// Before admission: a queued answer spends no slot and leaves the token unused, so the popup asks again with it.
		const sequence = await this.transferExecutor.sequence(req, profile.id)
		// A send holding the slot is proving: the PXE runs one operation at a time, so this estimate
		// would wait behind that proof anyway, past its RPC deadline on a real prover.
		const slotBusy = this.lane.isSlotBusy(profile.id, sequence.scope.chainId)
		const lagging = this.chainTipGate.unconfirmed(sequence.scope, sequence.keys, networkId)
		// The popup asks again every 2 s; the read it starts is what lets that answer change.
		if (lagging) void this.chainTipGate.refresh(networkId)
		if (slotBusy || lagging || this.sendSequencer.isBlocked(sequence.scope, sequence.keys)) {
			const cap = await this.queuedFeeCapFor(req, profile.id, sequence)
			return { queued: true, tokenSpent: false, ...(cap ? { cap } : {}) }
		}
		return this.withEstimateAdmission(estimateToken, "send", (signal) => this.transferExecutor.estimateFee(req, signal, sequence))
	}

	/** The cap a queued transfer is offered, read from stored rows only: nothing on the network. */
	private async queuedFeeCapFor(req: TransferRequest, profileId: string, sequence: TransferSequence): Promise<QueuedFeeCap | undefined> {
		const shape = sendShapeOf(req.feeSettings, req.transferType, sequence.feeSpender)
		if (!shape) return undefined
		const rows = await this.transactionService.transactionsOf(req.accountAddress, profileId)
		const basis = queuedFeeBasis(rows, profileId, sequence.scope.chainId, req.tokenContract, shape, Date.now())
		const cap = basis ? queuedFeeCap(basis) : undefined
		return basis && cap ? { basis, cap } : undefined
	}

	/** Admission + cancellation envelope for the estimate entry points.
	 *  Tokenless calls (legacy/internal) run un-tracked; tokened calls are
	 *  admitted through the registry's per-profile cap, get an AbortSignal
	 *  for stage-boundary checks, and ALWAYS settle — the settle carries the
	 *  stashed estimateId so a post-completion `cancelEstimate` can still
	 *  evict the cached signed request. The internal sentinel converts to the
	 *  structured `JobCancelledError` at this RPC boundary. */
	private async withEstimateAdmission<T extends { estimateId?: string; previewId?: string } | TransferFeeQueued>(
		estimateToken: string | undefined,
		flowKey: string,
		run: (signal?: AbortSignal) => Promise<T>,
	): Promise<T> {
		if (!estimateToken) return run()
		const profile = await requireActiveProfile(this.profileService, "Wallet locked")
		let admission: AbortSignal | undefined
		let estimateId: string | undefined
		let offscreenWork: Promise<void> | undefined
		try {
			// Inside the try: a parked admission rejected by supersede/cancel
			// throws the internal sentinel too, and it must cross the RPC
			// boundary as the structured error like every other cancel.
			admission = await this.estimateCancel.admit(estimateToken, profile.id, flowKey)
			const result = await run(admission)
			// One id evicts every cache: a standard estimate's preview id IS its
			// estimate id, and a preview-only result has nothing else stashed.
			if (!("queued" in result)) estimateId = result.previewId ?? result.estimateId
			return result
		} catch (error) {
			if (admission) offscreenWork = this.pxeService.offscreenSettled(error)
			if (error instanceof JobCancelledSentinel) {
				throw new JobCancelledError(undefined, { jobId: estimateToken })
			}
			throw error
		} finally {
			// A simulation that timed out still runs in the PXE's queue, so its estimate keeps its
			// place until that simulation ends offscreen; the client bounds the wait.
			if (admission && offscreenWork) {
				this.logDebug("estimate held until its timed-out simulation ends offscreen")
				const held = admission
				void offscreenWork.then(() => this.estimateCancel.settle(estimateToken, undefined, held))
			} else if (admission) {
				this.estimateCancel.settle(estimateToken, estimateId, admission)
			}
		}
	}

	/** Cancel an in-flight or just-completed estimate. Best-effort: locked
	 *  wallet or unknown/foreign tokens no-op silently. */
	public async cancelEstimate(estimateToken: string): Promise<void> {
		await this.ensureInitialized()
		const profile = await this.profileService.getActiveProfile()
		if (!profile) return
		this.estimateCancel.cancel(estimateToken, profile.id)
	}

	/** In-process only, never in `rpcMethods`: no port reaches the claimed set. */
	public claimPreviews(previewIds: readonly (string | undefined)[]): () => void {
		return this.previewSnapshots.claim(previewIds)
	}

	public async getLastProveOutcome(): Promise<LastProveOutcome> {
		await this.ensureInitialized()
		return this.coordinator.getLastProveOutcome()
	}

	/** Cancel an in-flight job. Semantics live on {@link ExecutionLane.cancelJob}
	 *  (journal-transition-first, abort-second; idempotent). */
	public async cancelJob(jobId: string): Promise<void> {
		await this.ensureInitialized()
		return this.lane.cancelJob(jobId)
	}

	/** Applies `cancelJob`'s ownership gate (the active profile's own record, nothing disclosed
	 *  about any other), then resumes only a transfer waiting at `queued` with exactly this fee. */
	public async acceptQueuedFee(jobId: string, fee: string): Promise<boolean> {
		await this.ensureInitialized()
		if (typeof jobId !== "string" || !isFeeAmount(fee)) throw InvalidWalletArgumentsError.forMethod("acceptQueuedFee")
		const [record, profile] = await Promise.all([this.operationJournal.getOperation(jobId), this.profileService.getActiveProfile()])
		if (!record || !profile || record.profileId !== profile.id || record.kind !== "transfer") return false
		if (record.progress.stage !== "queued" || record.progress.reask?.fee !== fee) return false
		return this.queuedFeeAnswers.accept(jobId, fee)
	}

	/** Start pre-claim liveness vouching for a queued journal record — see
	 *  {@link ExecutionLane.beginQueuedWait}. Called by the wallet-sdk handler
	 *  at queued-record creation; SW-internal, never RPC-exposed. */
	public beginQueuedWait(journalId: string): void {
		this.lane.beginQueuedWait(journalId)
	}

	/** Stop pre-claim vouching (handler settled). Idempotent backstop — the
	 *  normal removal is the ownership migration at mutex enqueue. */
	public endQueuedWait(journalId: string): void {
		this.lane.endQueuedWait(journalId)
	}

	/** A wallet-built transaction's fee, estimated where it was built: the operation never crosses an
	 *  RPC boundary, so no popup can supply one. */
	public async estimateSendTransactionFee(
		operation: SendTransactionOperation,
		estimateToken?: string,
		flowKey?: string,
	): Promise<TransferFeeEstimate> {
		await this.ensureInitialized()
		return this.withEstimateAdmission(estimateToken, flowKey ?? "wallet", (signal) =>
			this.dappSendExecutor.estimateOperationFee(operation, operation.feeSettings, signal),
		)
	}

	public async estimateOperationFee(
		interactionId: string,
		index: number,
		feeSettings: FeeSettings,
		estimateToken?: string,
		flowKey?: string,
	): Promise<TransferFeeEstimate> {
		await this.ensureInitialized()
		// Admitted before the stored request is read: a cancel then either finds the estimate or comes
		// after the approval that deleted the request, which the read then refuses.
		return this.refusalBound(interactionId, () =>
			this.withEstimateAdmission(estimateToken, flowKey ?? "op", async (signal) => {
				const operation = await this.interactionOperations().materializeStoredOperation(interactionId, index, feeSettings)
				return this.dappSendExecutor.estimateOperationFee(operation, feeSettings, signal, { interactionId, index })
			}),
		)
	}

	public async previewOperationAuthwits(
		interactionId: string,
		index: number,
		estimateToken?: string,
		flowKey?: string,
	): Promise<OperationAuthwitPreview> {
		await this.ensureInitialized()
		// Admitted before the read, as `estimateOperationFee` is.
		return this.refusalBound(interactionId, () =>
			this.withEstimateAdmission(estimateToken, flowKey ?? "op", async (signal) => {
				const operation = await this.interactionOperations().materializeStoredOperation(interactionId, index)
				return this.dappSendExecutor.previewOperationAuthwits(operation, { interactionId, index }, signal)
			}),
		)
	}

	/** A refusal is the request's, not one attempt's: the attempt that met it may be one the window
	 *  already dropped as superseded, so every attempt answers the first one recorded, the window
	 *  and the dApp's answer agreeing on it. */
	private async refusalBound<T>(interactionId: string, run: () => Promise<T>): Promise<T> {
		const source = this.interactionOperations()
		const recorded = source.refusalOf(interactionId)
		if (recorded) throw recorded
		try {
			return await run()
		} catch (error) {
			if (!(error instanceof ScopeViolationError)) throw error
			source.recordRefusal(interactionId, error)
			throw source.refusalOf(interactionId) ?? error
		}
	}

	/** The window's answer reaches the send as exactly the figure it asked; any other end, a window
	 *  that never opened included, cancels the send while it still asks that figure. */
	private async askInWindow(question: FeeQuestion): Promise<void> {
		const { journalId, reask } = question
		// A closed, refused or timed-out window rejects: that is the person's answer, not a fault.
		const accepted = await Promise.resolve()
			.then(() => this.interactionOperations().askFeeAgain(question))
			.catch(() => false)
		try {
			if (accepted) this.queuedFeeAnswers.accept(journalId, reask.fee)
			else await this.lane.cancelQuestion(journalId, reask.fee)
		} catch (error) {
			this.logError("A held send's question could not be settled", { error })
		}
	}

	private interactionOperations(): InteractionOperationSource {
		return this.services.get<InteractionOperationSource & { name: string; start(): Promise<void> }>(DAPP_INTERACTION_SERVICE_NAME)
	}

	public async decodeCallsForDisplay(networkId: string, calls: DisplayCallInput[]): Promise<DecodedCall[]> {
		const lookup = await this.displayArtifactLookup(networkId, calls)
		return Promise.all(calls.map((call) => decodeCallForDisplay(lookup, call)))
	}

	public async decodeGrantsForDisplay(interactionId: string, index: number): Promise<DecodedGrant[]> {
		await this.ensureInitialized()
		// The request approval executes, never the popup's copy: its JSON round trip rewrites some values.
		// A draft: the window decodes while the fee is still unchosen.
		return this.decodeGrantsOf(await this.interactionOperations().materializeStoredDraft(interactionId, index))
	}

	/** A held send's grants, read from the stored request its fee question shows. */
	public async decodeQuestionGrantsForDisplay(interactionId: string): Promise<DecodedGrant[]> {
		await this.ensureInitialized()
		return this.decodeGrantsOf(await this.interactionOperations().materializeQuestionDraft(interactionId))
	}

	private async decodeGrantsOf(operation: DraftOperation): Promise<DecodedGrant[]> {
		if (operation.kind !== "send_transaction") return []
		const contents = operation.actions.flatMap((action) => (action.kind === "add_public_authwit" ? [action.content] : []))
		const lookup = await this.displayArtifactLookup(operation.networkId, contents)
		return Promise.all(contents.map((content) => decodeGrantForDisplay(lookup, content)))
	}

	/** The checks every display decode shares (a bounded batch, on a network of the active profile),
	 *  then one artifact fetch per contract for the whole batch: a batch usually targets one. */
	private async displayArtifactLookup(networkId: string, batch: readonly unknown[]): Promise<ArtifactLookup> {
		await this.ensureInitialized()
		if (!Array.isArray(batch) || batch.length > MAX_DISPLAY_CALLS) throw new Error("Invalid calls")
		const profile = await this.profileService.getActiveProfile()
		const network = await this.networkService.getNetwork(networkId)
		if (!profile || network.profileId !== profile.id) throw new Error("unauthorized profile")
		const info = networkInfoFrom(network)
		const artifacts = new Map<string, Promise<ContractArtifact | undefined>>()
		return (address) => {
			const pending = artifacts.get(address)
			if (pending) return pending
			const fresh = (async () => {
				const instance = await this.pxeService.getContractInstance(info, AztecAddress.fromStringUnsafe(address))
				if (!instance) return undefined
				return (await this.pxeService.getContractArtifact(info, instance.currentContractClassId)) ?? undefined
			})()
			artifacts.set(address, fresh)
			return fresh
		}
	}

	public async executeOperations(
		operations: Operation[],
		origin: LocalTxOrigin,
		parentTask?: WrappedTask,
		hooks?: ExecutionHooks,
		/** Popup approval envelopes, index-aligned with `operations`: the
		 *  interaction each operation was materialized from plus the SW-minted
		 *  estimate/preview ids the popup handed back. Never part of the shared
		 *  `Operation` wire shape — a dApp cannot reach this parameter. */
		approvals?: readonly (OperationApprovalEnvelope | undefined)[],
		/** TRUSTED-INTERNAL parameter (like `estimateIds`): the fence captured
		 *  at the dApp interaction's session re-validation — the authorization
		 *  moment. Every send and token commit runs under it, so a lock, a
		 *  switch, a re-unlock or a delete + same-id re-import parked anywhere
		 *  between approval and commit fails closed. Required for a DAPP-origin
		 *  send or token commit: without it the dispatch would capture whatever
		 *  session is live when the op finally runs. NOT structurally unreachable over the wire (RPC
		 *  dispatch forwards extra positional params) — the boundary is
		 *  same-extension sender authentication, so only popup/SW code can
		 *  supply it; dApps route through the wallet-bridge dispatcher, which
		 *  forwards only the wire handler's own admission fence, never a value
		 *  from the dApp's arguments. */
		authorizedFence?: ExecutionFence,
	): Promise<OperationResult[]> {
		await this.ensureInitialized()
		if (operations.some((op) => BROADCASTING_OPERATION_KINDS.has(op.kind))) await this.legal.assertCurrent()
		if (origin.type === OriginType.DAPP && !authorizedFence && operations.some((op) => FENCED_OPERATION_KINDS.has(op.kind))) {
			throw new Error("a dApp send requires the fence of the session that authorized it")
		}
		const results: OperationResult[] = []
		let operationIndex = -1
		for (const operation of operations) {
			operationIndex++
			if (results.length && results.at(-1)!.status !== "ok") {
				results.push({ status: "skipped" })
				continue
			}

			const traceId = crypto.randomUUID().slice(0, 8)
			this.logDebug(`[${traceId}] executeOperations: starting ${operation.kind}`)

			const content = new ExecuteOperationContent(operation.kind, this.planner.extractPrimaryMethod(operation))
			const operationTask = parentTask ? parentTask.startSubtask(content) : this.taskService.startNewTask(content, undefined, origin)

			try {
				const result = await this.dispatchOperation(
					operation,
					origin,
					operationTask,
					hooks,
					authorizedFence,
					approvals?.[operationIndex],
				)
				// A broadcast stands even when a profile switch has cleared its task meanwhile.
				if (BROADCASTING_OPERATION_KINDS.has(operation.kind)) operationTask.completeIfTracked()
				else operationTask.complete()
				this.logDebug(`[${traceId}] executeOperations: ${operation.kind} completed`)
				results.push({ status: "ok", result })
			} catch (error) {
				const classified = classifyOperationCatch(error, operationTask, getErrorMessage)
				this.logOperationOutcome(traceId, operation.kind, classified)
				results.push(classified)
			}
		}
		return results
	}

	/** Level by reach: a Terms, scope, argument, capacity or unsupported-method refusal is expected,
	 *  and a connected dApp can repeat any of them, so at `error` they would fill every user's log buffer. */
	private logOperationOutcome(traceId: string, kind: Operation["kind"], classified: CancelOrFailResult): void {
		if (classified.status === "cancelled") {
			this.logInfo(`[${traceId}] executeOperations: ${kind} cancelled by user`)
		} else if (classified.code === TermsAcceptanceRequiredError.CODE) {
			this.logDebug(`[${traceId}] executeOperations: ${kind} refused: terms not accepted`)
		} else if (classified.code === ScopeViolationError.CODE) {
			this.logDebug(`[${traceId}] executeOperations: ${kind} refused: outside its grant`)
		} else if (classified.code === InvalidWalletArgumentsError.CODE) {
			this.logDebug(`[${traceId}] executeOperations: ${kind} refused: invalid arguments`)
		} else if (classified.code === TooManyPendingError.CODE) {
			this.logDebug(`[${traceId}] executeOperations: ${kind} refused: too many pending`)
		} else if (classified.code === UnsupportedMethodError.CODE) {
			this.logDebug(`[${traceId}] executeOperations: ${kind} refused: unsupported method`)
		} else {
			this.logError(`[${traceId}] executeOperations: ${kind} failed:`, classified.error)
		}
	}

	/** Per-operation dispatch — one contiguous awaited region (every arm was
	 *  already awaited at this position in the pre-split loop). Without an
	 *  `authorizedFence` (UI origin) the send arms capture INSIDE the arm, not
	 *  at the batch top: read-only ops must not trip the unlock check, and the
	 *  capture still precedes the prove. */
	private async dispatchOperation(
		operation: Operation,
		origin: LocalTxOrigin,
		operationTask: WrappedTask,
		hooks: ExecutionHooks | undefined,
		authorizedFence: ExecutionFence | undefined,
		approval: OperationApprovalEnvelope | undefined,
	): Promise<unknown> {
		switch (operation.kind) {
			case "register_contract": {
				return this.executeRegisterContract(operation)
			}
			case "register_sender": {
				return this.executeRegisterSender(operation)
			}
			case "register_token": {
				return this.executeRegisterToken(operation, origin, operationTask, authorizedFence, approval)
			}
			case "send_transaction": {
				// Forward hooks so the slot buckets per-origin (grantPublicAuthwit
				// carries { originKey }); without it hostile-dApp grants + UI auth ops
				// collapse into one __no_origin__ capacity bucket, losing fairness.
				const fence = authorizedFence ?? (await this.captureFence())
				return this.executeSendTransaction(operation, origin, operationTask, hooks, fence, approval)
			}
			case "simulate_transaction": {
				return this.viewExecutor.executeSimulateTransaction(operation)
			}
			case "simulate_utility": {
				return this.viewExecutor.executeSimulateUtility(operation)
			}
			// Aztec.js interface:
			case "aztec_getContractClassMetadata": {
				return this.viewExecutor.executeAztecGetContractClassMetadata(operation)
			}
			case "aztec_getContractMetadata": {
				return this.viewExecutor.executeAztecGetContractMetadata(operation)
			}
			case "aztec_getPrivateEvents": {
				return this.viewExecutor.executeAztecGetPrivateEvents(operation)
			}
			case "aztec_getChainInfo": {
				return this.viewExecutor.executeAztecGetChainInfo(operation)
			}
			case "aztec_registerSender": {
				return this.executeAztecRegisterSender(operation, await this.registrant(origin, authorizedFence))
			}
			case "aztec_getAddressBook": {
				return this.viewExecutor.executeAztecGetAddressBook(operation)
			}
			case "aztec_registerContract": {
				return this.executeAztecRegisterContract(operation, await this.registrant(origin, authorizedFence))
			}
			case "aztec_simulateTx": {
				return this.viewExecutor.executeAztecSimulateTx(operation)
			}
			case "aztec_executeUtility": {
				return this.viewExecutor.executeAztecExecuteUtility(operation)
			}
			case "aztec_profileTx": {
				return this.viewExecutor.executeAztecProfileTx(operation)
			}
			case "aztec_sendTx": {
				// Hooks forwarded ONLY to aztec_sendTx; other ops don't need them.
				const fence = authorizedFence ?? (await this.captureFence())
				return this.dappSendExecutor.executeAztecSendTx(operation, origin, operationTask, hooks, fence, approval)
			}
			case "aztec_createAuthWit": {
				return this.executeAztecCreateAuthWit(operation, authorizedFence)
			}
			default: {
				const _unhandled: never = operation
				throw new Error("Invalid operation")
			}
		}
	}

	// Nulo base:

	private async executeRegisterContract(op: RegisterContractOperation): Promise<void> {
		const addressNum = AztecAddress.fromStringUnsafe(op.address).toBigInt()
		if (addressNum >= 0 && addressNum <= 6) {
			// ignore protocol contracts registration,
			// because we cannot validate it due to hardcoded addresses
			return
		}

		const network = await this.networkService.getNetwork(op.networkId)

		const providedInstance = await ContractInstanceWithAddressSchema.optional().parseAsync(op.instance)
		const instance =
			providedInstance ??
			(await this.pxeService.getContractInstance(networkInfoFrom(network), AztecAddress.fromStringUnsafe(op.address)))
		if (!instance) {
			throw new ContractNotRegisteredError("Contract instance not found")
		}

		const providedArtifact = await ContractArtifactSchema.optional().parseAsync(op.artifact)
		const artifact =
			providedArtifact ?? (await this.pxeService.getContractArtifact(networkInfoFrom(network), instance.currentContractClassId))
		if (!artifact) {
			throw new ContractNotRegisteredError("Contract artifact not found")
		}

		await assertArtifactClassId(artifact, instance.currentContractClassId)

		const contractAddress = await computeContractAddressFromInstance(instance)
		if (contractAddress.toString() !== op.address) {
			throw new Error("Contract address doesn't match instance address")
		}

		await this.pxeService.registerContract(networkInfoFrom(network), { instance, artifact })
	}

	private async executeRegisterSender(op: RegisterSenderOperation): Promise<void> {
		const network = await this.networkService.getNetwork(op.networkId)
		await this.pxeService.registerSender(networkInfoFrom(network), AztecAddress.fromStringUnsafe(op.address))
	}

	private async executeRegisterToken(
		op: RegisterTokenOperation,
		origin: LocalTxOrigin,
		parentTask?: WrappedTask,
		authorizedFence?: ExecutionFence,
		approval?: OperationApprovalEnvelope,
	): Promise<void> {
		// The deletion fence anchors the whole approval→commit chain: the dApp
		// path threads the capture made AT the interaction's session
		// re-validation (upstream of the refreshSession park); popup-origin
		// dispatches capture here, where dispatch IS the authorization. A
		// deletion (or a delete + same-id re-import) landing anywhere after the
		// capture moves the epoch, so the commit's assert against it fails
		// closed. Token ops are not switch-blocked (not a SENDING kind), so
		// every identity below must derive from this one capture plus the
		// ownership-checked network row — never a live re-read. The capture's
		// only throw is the locked gate; re-thrown under the pinned message.
		let fence: ExecutionFence
		if (authorizedFence) {
			fence = authorizedFence
		} else {
			try {
				fence = await this.profileService.captureExecutionFence()
			} catch {
				throw new Error("Wallet locked")
			}
		}
		// A dApp's add stores the details its window showed, so a window that showed none approves nothing.
		const shown = approval?.tokenMetadata
		if (origin.type === OriginType.DAPP && shown === undefined) throw new Error("Token details were not shown for approval")
		const network = await this.networkService.getNetwork(op.networkId)
		// `getNetwork` anchors the row to the ACTIVE profile; tying it to the
		// fence makes the write identity and the commit assert one chain.
		if (network.profileId !== fence.profileId) throw new Error("unauthorized profile")

		// Always parsed here: a popup-supplied interface would carry function
		// mappings nothing authenticated, and they are what gets persisted. Pinned
		// to the class the window read: an interface of another class refuses before any record.
		const ti = await this.tokenService.parseTokenInterface(op.networkId, op.address, parentTask, shown?.classId)

		if (
			ti.getNameFn === undefined ||
			ti.getSymbolFn === undefined ||
			ti.getDecimalsFn === undefined ||
			(ti.balanceOfPrivateFn === undefined && ti.balanceOfPublicFn === undefined)
		) {
			throw new Error("Couldn't find necessary methods in the contract interface. Try to add token manually.")
		}
		// Thread the dApp origin into the journal entry so the tokens-view
		// TokenImportRow can render "Requested by <origin>" for dapp imports.
		// Anonymous-DApp fallback matches the repo convention used in
		// tx-enrichment.ts and tx-detail-helpers.ts.
		const opContext: OperationContext =
			origin.type === OriginType.DAPP ? { origin: "dapp", dappOrigin: origin.name ?? "dApp" } : { origin: "popup" }
		const expected = shown && { name: shown.name, symbol: shown.symbol, decimals: shown.decimals }
		await this.tokenService.addTokenAuthorized(fence, fence.profileId, op.networkId, op.accountAddress, ti, opContext, expected)
	}

	/** `fence` absent ⇒ captured now, which is right only for a caller that
	 *  awaited nothing between the user's action and this call. */
	public async executeSendTransaction(
		op: SendTransactionOperation,
		origin: LocalTxOrigin,
		parentTask?: WrappedTask,
		hooks?: ExecutionHooks,
		fence?: ExecutionFence,
		approval?: OperationApprovalEnvelope,
	): Promise<string> {
		await this.ensureInitialized()
		await this.legal.assertCurrent()
		const authorized = fence ?? (await this.captureFence())
		return this.dappSendExecutor.executeSendTransaction(op, origin, parentTask, authorized, hooks, approval)
	}

	/**
	 * Claim a pre-allocated queued journal record (transition queued → pending)
	 * OR create a new in-flight record if no queued id was provided.
	 *
	 * Decision tree + invariants live in `./claim-helper.ts` so they're
	 * unit-testable without spinning up the full ExecutionService harness.
	 * This thin wrapper just binds `this.*` dependencies into the helper's
	 * dependency injection shape.
	 */

	public async getGasBalances(networkId: string, accountAddress: string, forceRefresh?: boolean): Promise<GasBalances> {
		await this.ensureInitialized()
		return this.gasBalances.get(networkId, accountAddress, forceRefresh)
	}

	public async peekGasBalances(networkId: string, accountAddress: string): Promise<{ balances: GasBalances; stale: boolean } | null> {
		await this.ensureInitialized()
		return this.gasBalances.peek(networkId, accountAddress)
	}

	// Aztec.js interface:

	/** The app a dApp registration is counted against, and the session it runs under, captured before
	 *  the executor's first await. The app is the origin the wallet-sdk dispatcher stamps, the only
	 *  builder of the two registration kinds; the person's own registrations are not counted. */
	private async registrant(origin: LocalTxOrigin, authorizedFence?: ExecutionFence): Promise<Registrant | undefined> {
		if (origin.type !== OriginType.DAPP) return undefined
		if (!origin.name) throw new Error("a dApp registration needs the app's origin")
		return { origin: origin.name, fence: authorizedFence ?? (await this.captureFence()) }
	}

	/** Before anything is written (`dapp-session/registration-allowance.ts`). */
	private async admitDappRegistration(registrant: Registrant | undefined, network: Network): Promise<void> {
		if (!registrant) return
		if (registrant.fence.profileId !== network.profileId) throw new SessionEndedError()
		await this.dappSessionService.admitDappRegistration(registrant.origin, registrant.fence, network.chainId)
	}

	private async executeAztecRegisterSender(op: AztecRegisterSenderOperation, registrant?: Registrant): Promise<AztecAddress> {
		const network = await this.networkService.getNetwork(op.networkId)
		await this.admitDappRegistration(registrant, network)
		return this.pxeService.registerSender(networkInfoFrom(network), op.address)
	}

	// Resolves to void: the 5.0.1 wallet-sdk WalletSchema declares
	// `registerContract(): Promise<void>`, and the dApp-side proxy validates the
	// response with z.void() — any non-undefined result rejects the whole call
	// on the dApp even though registration succeeded wallet-side.
	private async executeAztecRegisterContract(op: AztecRegisterContractOperation, registrant?: Registrant): Promise<void> {
		const instance = await ContractInstanceWithAddressSchema.parseAsync(op.instance)
		const network = await this.networkService.getNetwork(op.networkId)

		const addressNum = instance.address.toBigInt()
		if (addressNum >= 0 && addressNum <= 6) {
			return
		}

		let providedArtifact: ContractArtifact | undefined
		try {
			providedArtifact = await ContractArtifactSchema.optional().parseAsync(op.artifact)
		} catch {
			// artifact parse failed — will fall back to lookup below
		}

		// Smart-tighten: if the dApp didn't pass an artifact, the wallet can
		// still resolve it via the chain's PXE (already-registered) or the
		// compiled-in known bundle (Aztec/Wonderland tokens, FPCs, NFTs,
		// etc.). When neither has it, fail loudly with a message telling
		// the dApp to pass `artifact` — there is no remote registry fallback.
		const classId = instance.originalContractClassId
		const artifact = providedArtifact ?? (await this.pxeService.getContractArtifact(networkInfoFrom(network), classId))
		if (!artifact) {
			throw new ContractNotRegisteredError(
				`Contract artifact not found for class ${classId}. ` +
					"The wallet only ships artifacts for the standard bundled contracts; " +
					"pass the artifact in aztec_registerContract({ instance, artifact }) for custom contracts.",
			)
		}

		await assertInstanceArtifactClassId(instance, artifact)

		// A secret key registers the instance's own account or nothing: one that derives another
		// address or other keys would add an account the dApp's contract grant never named, or one
		// whose contract the PXE then refuses.
		const account = op.secretKey
			? await CompleteAddress.fromSecretKeyAndPartialAddress(
					await Fr.schema.parseAsync(op.secretKey),
					await computePartialAddress(instance),
				)
			: undefined
		if (account && !(account.address.equals(instance.address) && account.publicKeys.equals(instance.publicKeys))) {
			throw InvalidWalletArgumentsError.forMethod("registerContract")
		}

		// Admitted before the account, so a refused keyed call registers neither the account nor the contract.
		if (op.secretKey && account) {
			await this.admitDappRegistration(registrant, network)
			await this.pxeService.registerAccount(networkInfoFrom(network), op.secretKey, account.partialAddress)
		}

		await this.pxeService.registerContract(networkInfoFrom(network), { instance, artifact })
	}

	public async executeAztecCreateAuthWit(op: AztecCreateAuthWitOperation, authorizedFence?: ExecutionFence): Promise<AuthWitness> {
		// UI-origin authwits capture their own fence; a dApp-origin one arrives already fenced
		// (aztec_createAuthWit is a fenced kind — refused at the batch entry without one). The
		// account is resolved from the fence's profile, which fails closed on a locked profile
		// (getSecret throws), never from the current active profile.
		const fence = authorizedFence ?? (await this.captureFence())
		const network = await this.networkService.getNetwork(op.networkId)
		const account = await this.accountService.getAccountContract(fence.profileId, network.chainId, op.accountAddress.toString())
		const messageHash = await this.resolveAuthWitMessageHash(op, network)

		// The same shape as the statement before node.sendTx: the awaited assert (deletion included)
		// releases the facade lock, so a queued lock could take it in the gap while this account
		// handle already holds derived key material. The synchronous isFenceLive is the last
		// statement before the irreversible sign — no await, not even a helper call, between them.
		await this.profileService.assertFence(fence)
		if (!this.profileService.isFenceLive(fence)) throw new SessionEndedError()
		return account.createAuthWit(messageHash)
	}

	/** The hash an authwit signs over, bound to the live node's chain identity and, for a call
	 *  intent, to the selector's real ABI function rather than the dApp's claimed name. */
	private async resolveAuthWitMessageHash(op: AztecCreateAuthWitOperation, network: Network): Promise<Fr> {
		const node = await this.networkService.getNode(network.chainId)
		const nodeInfo = await node.getNodeInfo()
		const metadata = liveChainInfo(network, nodeInfo)

		if (typeof op.messageHashOrIntent === "object" && "caller" in op.messageHashOrIntent) {
			const { caller, call } = op.messageHashOrIntent
			// Bind the dApp-supplied name to the selector's real ABI function before
			// signing an authwit over it. Without resolving the artifact here, a dApp
			// could obtain an authwit for a selector that did not match the claimed name.
			// Fail closed if the contract/artifact is unregistered — the dApp registers it
			// first. Build the call from ABI truth; never trust dApp name/type/isStatic.
			const authwitInstance = await this.pxeService.getContractInstance(networkInfoFrom(network), call.to)
			if (!authwitInstance) {
				throw new ContractNotRegisteredError("Contract not found")
			}
			const authwitArtifact = await this.pxeService.getContractArtifact(
				networkInfoFrom(network),
				authwitInstance.currentContractClassId,
			)
			if (!authwitArtifact) {
				throw new ContractNotRegisteredError("Contract artifact not found")
			}
			const authwitFn = assertSelectorBinding(
				await findFunctionBySelector(authwitArtifact, call.selector.toString()),
				call,
				AUTHWIT_CALL_BINDING,
			)
			const intentAction: CallIntent = {
				caller: await AztecAddress.schema.parseAsync(caller),
				call: new FunctionCall(
					authwitFn.name,
					await AztecAddress.schema.parseAsync(call.to),
					await FunctionSelector.schema.parseAsync(call.selector),
					authwitFn.functionType,
					call.hideMsgSender,
					authwitFn.isStatic,
					await z.array(Fr.schema).parseAsync(call.args),
					getFunctionReturnType(authwitFn),
				),
			}
			return computeAuthWitMessageHash(intentAction, metadata)
		}
		if (typeof op.messageHashOrIntent === "object" && "consumer" in op.messageHashOrIntent) {
			const { consumer, innerHash } = op.messageHashOrIntent
			const intentHash: IntentInnerHash = {
				consumer: await AztecAddress.schema.parseAsync(consumer),
				innerHash: await Fr.schema.parseAsync(innerHash),
			}
			return computeAuthWitMessageHash(intentHash, metadata)
		}
		// Raw Fr message hash (pre-computed by wallet-sdk)
		return Fr.schema.parseAsync(op.messageHashOrIntent)
	}

	// internals

	/** Dispatcher — clones the op (`fjwc` / `fpc` mutate actions), looks
	 *  up the `FeeStrategy` by kind, and delegates. Replaces the
	 *  4-way switch from the pre-strategy era. Thin delegator only —
	 *  collaborators own the actual logic. */
	private async buildAndEstimateTxRequest(
		inputOp: {
			networkId: string
			accountAddress: string
			actions: Action[]
			fee?: FeeOptions
		},
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		probe?: DiscoveryProbe,
		fpc?: Fpc,
		onBuilt?: OnBuilt,
	): Promise<FeeEstimate> {
		// Clone the op + its actions array. fjwc / fpc branches mutate
		// `op.actions` (unshift / splice) to prepend fee payloads; leaking
		// those mutations back to the caller breaks repeat estimates and
		// any caller that keeps a reference to the array.
		const op = { ...inputOp, actions: [...inputOp.actions] }
		const feeMultiplier = feeMultiplierFor(feeSettings.priorityLevel)
		const gasPadding = op.fee?.gasPadding ?? 1.05
		const strategy = this.feeStrategies.get(feeSettings.paymentMethod.kind)
		if (!strategy) {
			throw new Error("Invalid fee payment method")
		}
		const ctx: FeeStrategyContext = {
			op,
			fence,
			feeSettings,
			feeMultiplier,
			gasPadding,
			parentTask,
			signal,
			probe,
			fpc,
			onBuilt,
		}
		return strategy.buildAndEstimate(ctx)
	}
}
