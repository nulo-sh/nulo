<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/** Vendor */
import { onMounted, onUnmounted } from "vue"
import { JobCancelledError } from "@nulo/extension-messaging/errors"

/** Components */
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"
import DappCancelledOverlay from "@/components/composite/DappCancelledOverlay.vue"
import DappApprovalFooter from "@/components/composite/DappApprovalFooter.vue"
import OperationCard from "./OperationCard.vue"
import SignerIdentityStrip from "./SignerIdentityStrip.vue"

/** Utils */
import { getErrorMessage } from "@nulo/wallet-core/utils"

/** Local utilities */
import { uniqueSignerAccounts, uniqueSignerNetworks } from "./signers"
import { resolveOperationScope, scopeBannerCopy, scopeBannerState } from "./scope-mismatch"
import { createScopeFollow, selectionWriter } from "./scope-follow"
import { managers, requireNetwork } from "@/utils/core"
import { carriesFeeSettings, isSelfPay } from "@nulo/wallet-bridge"
import { isEmbeddedFeePayment, requiresFeeSelection } from "./operation-validation"
import { type FeePayerPick, holdsConfirm, personPaysAppPayment } from "./fee-figure"
import { authwitDisplayCall, grantContentsOf, pendingAuthwitDecodes, undecodedAll } from "./display-calls"
import { REFUSAL_REASON, REFUSAL_TITLE, type RefusalKind, refusalKind } from "./refusal"
import { grantRefusalRow, readableGrants } from "./call-surface"
import { decodeOperationArguments, followKnownTokens, resolveOperations } from "./operation-display"
import type { DraftUIOperation } from "./types"

/** Services */
import { type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { type Account, AccountServiceClient } from "@/wallet/services/account/client"
import {
	type DecodedCall,
	type DecodedGrant,
	type DiscoveredAuthwit,
	ExecutionServiceClient,
	type FeeSettings,
	type OperationAuthwitPreview,
	type TransferFeeEstimate,
} from "@/wallet/services/execution/client"
import { type TokenInfo, TokenServiceClient } from "@/wallet/services/token/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import {
	DappInteractionServiceClient,
	type ExecutionPayload,
	type OperationApprovalDelta,
	type ShownTokenMetadata,
	type WindowEnd,
} from "@/wallet/services/dapp-interaction/client"
import type { DappMetadata } from "@/wallet/services/dapp-session/client"

/** Composables */
import { useDappInteractionPayload } from "@/composables/useDappInteractionPayload"
import { useDappApprovalWindow } from "@/composables/useDappApprovalWindow"
import { useFeeEstimationMap } from "@/composables/useFeeEstimationMap"
import { EstimateRequeue, estimateWhenClear } from "@/utils/estimate-when-clear"
import { useTokenFlags } from "@/composables/usePrices"
import { useToast } from "@/composables/toast"

const { openToast } = useToast()

// Local alias — kept for diff minimality. The honest type lives in `./types.ts`
// (DraftUIOperation) so send-like `feeSettings` is optional during user editing.
type UIOperation = DraftUIOperation

type UIDappMetadata = DappMetadata & {
	loadingLogo?: boolean
	logoBlobUrl?: string
}

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const profile = ref<ProfileInfo>()

const router = useRouter()

const session = ref()
const operations = ref<UIOperation[]>([])
/** Per operation, the paying method its fee card reports. */
const feePayers = ref<Record<number, FeePayerPick | null>>({})
const accounts = ref<Account[]>([])

const isLoading = ref(false)
const isWrongProfile = ref(false)

/**
 * True once `init()` has finished materializing the operations list. The
 * footer (Reject/Confirm) renders unconditionally in the template, so without
 * this gate a fast click before init() resolves would call `approve()` with
 * `operations.value === []` — `approveInteraction()` happily detaches and
 * executes the empty list, and downstream code unwraps `results[0]` of
 * nothing. Flip to true at the end of init() once we have at least one
 * operation; refuse approval until then.
 */
const initComplete = ref(false)

const executionService = new ExecutionServiceClient()
const interactionService = new DappInteractionServiceClient()
const tokenService = new TokenServiceClient()

/**
 * Per contract address, the details a `register_token` card shows and the class they were read
 * from. The approval names them and the SW stores only a read equal to them, so the window is not
 * approvable while they load or once their read failed.
 */
const tokenMetadata = ref<Map<string, ShownTokenMetadata>>(new Map())
const tokenMetadataLoading = ref(false)
const tokenMetadataError = ref<Map<string, string>>(new Map())
const tokenMetadataUnread = computed(() =>
	operations.value.some((op) => op.kind === "register_token" && !tokenMetadata.value.has(op.address)),
)

/** The signed list's flags, from the snapshot the token page reads, with no price fetch. */
const priceService = new PriceServiceClient()
const tokenFlags = useTokenFlags(priceService)

const isFlaggedAdd = (op: UIOperation): boolean =>
	op.kind === "register_token" && tokenFlags.isFlagged({ chainId: op.network?.chainId, contract: op.address })

/** The flagged token adds the person ticked, by operation index: empty at every mount, never stored. */
const flagAcknowledged = ref(new Set<number>())
const acknowledgeTokenFlag = (index: number, on: boolean) => {
	const next = new Set(flagAcknowledged.value)
	if (on) next.add(index)
	else next.delete(index)
	flagAcknowledged.value = next
}

/** A token add waits for the list's first answer, and a flagged one for its tick; a list that flags
 *  the token while the window is open holds Confirm again. */
const tokenFlagHold = computed(() =>
	operations.value.some(
		(op, i) =>
			op.kind === "register_token" &&
			(!tokenFlags.mapped.value || (isFlaggedAdd(op as UIOperation) && !flagAcknowledged.value.has(i))),
	),
)

/**
 * Display-only decodings the card renders: per operation index for its calls,
 * per message hash for a discovered authorization. An entry is absent while
 * the wallet is still decoding; nothing here gates approval or reaches the SW's
 * execution path, which reads the stored request.
 */
const decodedCalls = ref<Map<number, readonly DecodedCall[]>>(new Map())
const decodedAuthwits = ref<Map<string, DecodedCall>>(new Map())
const authwitDecodesInFlight = new Set<string>()
/** The wallet's registered tokens on the operations' chains, so amounts render in token units. */
const knownTokens = ref<TokenInfo[]>([])
const tokenFollow = followKnownTokens(tokenService, knownTokens)

/** Per operation index, the decodings of its public grants; absent while the wallet is decoding.
 *  Unlike a call's decode, a grant's gates Confirm: what the card shows is what the wallet signs. */
const decodedGrants = ref<Map<number, readonly DecodedGrant[]>>(new Map())
const grantsPending = computed(() =>
	operations.value.some((op, i) => grantContentsOf(op as unknown as UIOperation).length > 0 && !decodedGrants.value.has(i)),
)
/** The footer's error row for a grant the wallet cannot read. Its own state, so the `clearError()` of
 *  a fee change never lifts it. */
const grantRefusal = computed(() => grantRefusalRow([...decodedGrants.value.values()].flat()))

const {
	requestId,
	payload,
	dapp,
	isCancelled: isInteractionCancelled,
	load: loadInteractionPayload,
	reject: rejectViaInteractionService,
} = useDappInteractionPayload<ExecutionPayload>({
	interactionService,
	getRequestId: () => router.currentRoute.value.query.requestId?.toString(),
	dappOf: (p) => p.session.dappMetadata as UIDappMetadata,
})

/** Per operation, whether its estimate or preview waits behind another send; cleared once neither is
 *  in flight. */
const queuedOps = ref<Record<number, boolean>>({})
const readQueued = (index: number, signal: AbortSignal) => () => {
	if (!signal.aborted) queuedOps.value[index] = true
}
/** What each operation's running estimate was asked: a requeue repeats it with a fresh token. */
const lastFeeParams: Record<number, { index: number; feeSettings: FeeSettings }> = {}

const {
	results: feeEstimates,
	estimating: estimatingOps,
	estimate: scheduleFeeEstimate,
	handoffAll: handoffFeeEstimates,
	rearm: rearmFeeEstimates,
	cancelAll: cancelAllFeeEstimates,
	dispose: disposeFeeEstimates,
} = useFeeEstimationMap<number, { index: number; feeSettings: FeeSettings }, TransferFeeEstimate>({
	// By reference: the SW re-materializes the stored request at this index and
	// applies the fee choice itself — the popup never hands it an operation.
	estimate: (params, estimateToken, flowKey, signal) => {
		lastFeeParams[params.index] = params
		return estimateWhenClear(
			() => executionService.estimateOperationFee(requestId.value!, params.index, params.feeSettings, estimateToken, flowKey),
			signal,
			{ onQueued: readQueued(params.index, signal) },
		)
	},
	cancelRemote: (estimateToken) => executionService.cancelEstimate(estimateToken).catch(() => {}),
	debounceMs: 500,
	onError: (key, err) => {
		// Rescheduled before the engine's settle clears its in-flight flag, so Confirm never comes on between.
		if (err instanceof EstimateRequeue) return scheduleFeeEstimate(key, lastFeeParams[key]!)
		if (holdRefusal(err)) return
		console.error(`[Execute] Fee estimation failed for op ${key}:`, err)
		// An app-paid operation's estimate only checks the app's fee contract, so its other failures are
		// unknown, never a verdict. A payment the person makes all the same keeps Confirm waiting on a retry.
		const op = operations.value[key] as unknown as UIOperation
		if (!isAppPaid(op) || personPaysAppPayment(op)) openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
	},
})

/** The wallet's refusal of the request, met by an estimate, a preview or an approval. The worker keeps
 *  it too, so it never clears: Reject is the one way on, and it answers the dApp with the refusal. */
const refusal = ref<RefusalKind | undefined>()
const holdRefusal = (error: unknown): boolean => {
	const kind = refusalKind(error)
	if (kind) refusal.value ??= kind
	return kind !== undefined
}

/** A send whose fee the app pays through its own payload. */
const isAppPaid = (op: UIOperation | undefined): boolean => carriesFeeSettings(op) && isEmbeddedFeePayment(op)

/** An estimate whose payer the node would refuse at submission: an app's fee contract proven unable
 *  to pay, or the account's own Fee Juice below the fee. Confirm stays off, so nothing is proven. */
const isShortEstimate = (estimate: TransferFeeEstimate): boolean =>
	estimate.appPayerFunding?.provenShort === true || estimate.feeJuiceShortfall !== undefined
/** Each operation's last landed verdict. A replacement estimate clears the result while it runs, so a
 *  shortfall already shown holds Confirm until the replacement answers. */
const lastLandedShort = ref<Record<number, boolean>>({})
const payerShort = computed(() =>
	operations.value.some((_, i) => {
		const landed = feeEstimates.value[i]
		return landed ? isShortEstimate(landed) : estimatingOps.value[i] === true && lastLandedShort.value[i] === true
	}),
)

// A `default_entrypoint` operation never gets a fee estimate (the dApp pays), so
// the authorizations the wallet would sign are previewed through their own slot
// of the same engine: same attempt token, flow key, cancel and handoff rules.
const {
	results: authwitPreviews,
	estimating: previewingOps,
	estimate: scheduleAuthwitPreview,
	handoffAll: handoffAuthwitPreviews,
	rearm: rearmAuthwitPreviews,
	cancelAll: cancelAllAuthwitPreviews,
	dispose: disposeAuthwitPreviews,
} = useFeeEstimationMap<number, { index: number }, OperationAuthwitPreview>({
	estimate: ({ index }, estimateToken, flowKey, signal) =>
		estimateWhenClear(() => executionService.previewOperationAuthwits(requestId.value!, index, estimateToken, flowKey), signal, {
			onQueued: readQueued(index, signal),
		}),
	cancelRemote: (estimateToken) => executionService.cancelEstimate(estimateToken).catch(() => {}),
	debounceMs: 0,
	onError: (key, err) => {
		if (err instanceof EstimateRequeue) return scheduleAuthwitPreview(key, { index: key })
		if (holdRefusal(err)) return
		console.error(`[Execute] Authorization preview failed for op ${key}:`, err)
		openToast({ kind: "error", label: "Couldn't preview authorizations. Try again." })
	},
})

const awaitsEstimates = computed(() =>
	operations.value.some((op, i) =>
		holdsConfirm(op as unknown as UIOperation, feePayers.value[i], {
			landed: !!feeEstimates.value[i],
			inFlight: estimatingOps.value[i] === true || previewingOps.value[i] === true,
		}),
	),
)

// init/reject/services are referenced lazily (thunks): they are declared below
// and only invoked by start()/dispose()/the guard at runtime.
const {
	start: startWindow,
	dispose: disposeWindow,
	closeWindow,
	endAndClose,
	onActiveProfileChanged,
	stripStatus,
	processingError,
	setError,
	clearError,
} = useDappApprovalWindow({
	profile,
	isInteractionCancelled,
	isLoading,
	connectServices: () => {
		profileService.connect()
		interactionService.connect()
		tokenService.connect()
		priceService.connect()
	},
	disconnectServices: () => {
		profileService.disconnect()
		interactionService.disconnect()
		executionService.disconnect()
		tokenService.disconnect()
		priceService.disconnect()
		tokenFlags.dispose()
	},
	init: () => init(),
	// A request of another profile than the active one was ended by that lock or switch, not by the
	// person, whatever then closes its window.
	reject: (end) => reject(isWrongProfile.value && end === "close" ? (profile.value ? "switch" : "lock") : end),
})

const init = async () => {
	// Disconnect the locally-constructed account/network clients on EVERY
	// exit path. They were disconnected only on the success path (after the ops
	// loop), so any throw in the loop — e.g. "Account no longer exists" — leaked
	// both live SW ports for the failed popup's lifetime.
	let accountService: AccountServiceClient | undefined
	let networkService: NetworkServiceClient | undefined
	try {
		profile.value = await profileService.getActiveProfile()
		await loadInteractionPayload()
		if (!payload.value) return

		if (profile.value?.id !== payload.value.session.profileId) {
			// TODO: redirect to sign in page with preconfigured profile id
			isWrongProfile.value = true
			throw new Error("Sign in with another profile")
		}

		accountService = new AccountServiceClient()
		networkService = new NetworkServiceClient()
		const resolved = await resolveOperations(payload.value.params.operations, accountService, networkService, profile.value!.id)
		session.value = payload.value.session
		operations.value = resolved.operations
		accounts.value = resolved.accounts
		// Only flip after operations are committed to state. If the popup
		// is dismissed mid-init (cancel from another window) we want the
		// approve gate to stay closed.
		initComplete.value = resolved.operations.length > 0
		for (const [index, op] of resolved.operations.entries()) {
			if (op.kind === "aztec_sendTx" && op.executionMode === "default_entrypoint") scheduleAuthwitPreview(index, { index })
			// No fee card asks for these: the estimate runs once, to check the app's own fee contract.
			else if (isAppPaid(op)) scheduleFeeEstimate(index, { index, feeSettings: { paymentMethod: { kind: "embedded" } } })
		}
		// None is awaited here. A call's decode never gates Confirm: a slow one leaves the card on its
		// vocabulary reading or "Reading arguments…", and a failed one falls back to the raw fields.
		void decodeOperationArguments(resolved.operations, executionService, (index, decoded) => decodedCalls.value.set(index, decoded))
		void decodeOperationGrants(resolved.operations)
		void tokenFollow.start(resolved.operations, profile.value!.id)

		// Pre-fetch token metadata for any `register_token` ops so the
		// OperationCard renders name/symbol/decimals before Allow. The Allow
		// button is disabled while this is in flight (see template).
		const registerOps = resolved.operations.filter((op): op is UIOperation & { kind: "register_token" } => op.kind === "register_token")
		if (registerOps.length > 0) {
			await prefetchTokenMetadata(registerOps, tokenService, {
				metadata: tokenMetadata,
				errors: tokenMetadataError,
				loading: tokenMetadataLoading,
			})
		}
	} catch (error) {
		console.error("Failed to initialize execution", error)
		setError("Something went wrong")
	} finally {
		// Both are idle after the ops loop; disconnect on success, throw, or
		// early-return alike (undefined when init returned before constructing them).
		accountService?.disconnect()
		networkService?.disconnect()
	}
}

/** Best-effort per-op metadata prefetch; a failed preview records its error
 *  and never blocks the others, and the loading flag clears in `finally`. */
async function prefetchTokenMetadata(
	registerOps: Array<UIOperation & { kind: "register_token" }>,
	tokenClient: TokenServiceClient,
	refs: {
		metadata: typeof tokenMetadata
		errors: typeof tokenMetadataError
		loading: typeof tokenMetadataLoading
	},
): Promise<void> {
	refs.loading.value = true
	try {
		await Promise.all(
			registerOps.map(async (op) => {
				try {
					const meta = await tokenClient.previewTokenMetadata(op.networkId, op.accountAddress, op.address)
					refs.metadata.value.set(op.address, {
						name: meta.name,
						symbol: meta.symbol,
						decimals: meta.decimals,
						classId: meta.interface.classId,
					})
				} catch (err) {
					const msg = getErrorMessage(err)
					refs.errors.value.set(op.address, msg)
					console.warn(`[Execute] previewTokenMetadata failed for ${op.address}`, { error: err })
				}
			}),
		)
	} finally {
		refs.loading.value = false
	}
}

/** Per operation, one decode of its stored grants; a failed one reads as unavailable, which refuses
 *  the request rather than leaving it pending. */
async function decodeOperationGrants(ops: UIOperation[]): Promise<void> {
	await Promise.all(
		ops.map(async (op, index) => {
			const count = grantContentsOf(op).length
			if (!count) return
			let decoded: readonly DecodedGrant[] = []
			try {
				decoded = await executionService.decodeGrantsForDisplay(requestId.value!, index)
			} catch (error) {
				console.warn("[Execute] Grant decode failed", { index, error })
			}
			decodedGrants.value.set(index, readableGrants(decoded, count))
		}),
	)
}

/** Every discovered authorization an estimate or preview lists gets one decode on its consumer. */
function decodeDiscoveredAuthwits(): void {
	for (const [index, op] of operations.value.entries()) {
		if (op.kind !== "aztec_sendTx") continue
		const listed = feeEstimates.value[index]?.discoveredAuthwits ?? authwitPreviews.value[index]?.discoveredAuthwits ?? []
		const fresh = pendingAuthwitDecodes(listed, decodedAuthwits.value, authwitDecodesInFlight)
		if (!fresh.length) continue
		for (const a of fresh) authwitDecodesInFlight.add(a.messageHash)
		void decodeAuthwitBatch(op.networkId, fresh)
	}
}

async function decodeAuthwitBatch(networkId: string, fresh: DiscoveredAuthwit[]): Promise<void> {
	let decoded: DecodedCall[]
	try {
		decoded = await executionService.decodeCallsForDisplay(networkId, fresh.map(authwitDisplayCall))
	} catch (error) {
		console.warn("[Execute] Authorization decode failed", { error })
		decoded = undecodedAll(fresh.length)
	}
	for (const [i, a] of fresh.entries()) {
		decodedAuthwits.value.set(a.messageHash, decoded[i] ?? { kind: "undecoded", reason: "unavailable" })
		authwitDecodesInFlight.delete(a.messageHash)
	}
}

const handleFeeUpdate = (index: number, value: FeeSettings | undefined) => {
	const op = operations.value[index]
	// The cast works around an AztecAddress/Fr mismatch between the popup's resolved operation and
	// wallet-bridge's; the trait check is what keeps `feeSettings` off the other kinds.
	if (!carriesFeeSettings(op)) return
	;(op as { feeSettings?: FeeSettings }).feeSettings = value
	clearError()
	if (value) scheduleFeeEstimate(index, { index, feeSettings: value })
}

const approve = async () => {
	if (isInteractionCancelled.value || isLoading.value) return
	// Block approval until init() has finished and at least one operation
	// exists. Without this guard, a fast click before payload materialization
	// would approve an empty operations list.
	if (!initComplete.value || operations.value.length === 0) return
	if (tokenMetadataUnread.value) return
	// UX gate: any send-like op still missing user-picked fee?
	// Cast to DraftOperation works around a pre-existing AztecAddress/Fr
	// structural mismatch between popup-resolved Operation and wallet-bridge's
	// — runtime semantics are unaffected (discriminant + feeSettings checks).
	if (operations.value.some((op) => requiresFeeSelection(op as unknown as import("./types").DraftOperation))) {
		setError("Validation error", "Select a fee payment method for each transaction", "warning")
		return
	}
	if (payerShort.value || awaitsEstimates.value || tokenFlagHold.value) return
	if (grantsPending.value || grantRefusal.value || refusal.value) return
	try {
		isLoading.value = true
		// Ownership handoff: approval transfers the completed estimates and previews to
		// the execution path, so the disposal below must NOT remote-cancel them, or the
		// eviction would race the execution out of its reuse hits and preview snapshots.
		handoffFeeEstimates()
		handoffAuthwitPreviews()
		// The SW executes the dApp's stored request; per operation the popup
		// contributes only its fee choice, the ids the SW minted for it, and the
		// token details its card showed.
		const deltas: OperationApprovalDelta[] = operations.value.map((op, index) => {
			const estimate = feeEstimates.value[index] ?? undefined
			const feeSettings = carriesFeeSettings(op) ? op.feeSettings : undefined
			return {
				feeSettings,
				estimateId: estimate?.estimateId,
				previewId: estimate?.previewId ?? authwitPreviews.value[index]?.previewId,
				feeCeiling: estimate?.maxFee,
				tokenMetadata: op.kind === "register_token" ? tokenMetadata.value.get(op.address) : undefined,
			}
		})
		const stillOurs = scopeFollow.capture()
		await interactionService.approveInteraction(requestId.value!, deltas)
		// A removed window runs no unmount, so the approval itself ends every estimate it did not
		// hand over, and the window closes once the worker has taken those cancels.
		const estimatesEnded = Promise.all([disposeFeeEstimates(), disposeAuthwitPreviews()])
		// Never throws, so a failed follow cannot turn the approval into an error below.
		await scopeFollow.follow(scopeView.value, followDeclined.value, stillOurs)
		await endAndClose(() => estimatesEnded)
	} catch (error) {
		// The execution path never took ownership — re-arm so a later
		// reject/unmount can still cancel + evict the handed-off estimates.
		rearmFeeEstimates()
		rearmAuthwitPreviews()
		showApprovalFailure(error)
	} finally {
		isLoading.value = false
	}
}

const showApprovalFailure = (error: unknown) => {
	if (error instanceof JobCancelledError) {
		// A raced approve refused service-side (the dApp cancelled first):
		// the refusal IS the cancelled state — render the overlay, never an
		// error banner. Covers the case where the cancel broadcast itself
		// was lost to this popup.
		isInteractionCancelled.value = true
	} else if (!holdRefusal(error)) {
		setError("Processing error.", getErrorMessage(error))
	}
}

const reject = async (end: WindowEnd) => {
	if (isInteractionCancelled.value || !requestId.value) return
	// Reject-time eviction: abort in-flight estimates and drop any stashed
	// signed requests NOW — window teardown alone isn't guaranteed to run
	// dispose before the window dies.
	cancelAllFeeEstimates()
	cancelAllAuthwitPreviews()
	await endAndClose(() => rejectViaInteractionService("User rejected", end))
}

// The notice's OK ends another profile's request as the lock or switch that made it, with the same
// wait as Reject, so the window's close cannot reach the request first.
const dismissWrongProfile = () =>
	requestId.value && !isInteractionCancelled.value ? reject(profile.value ? "switch" : "lock") : closeWindow()

const signerAccounts = computed(() => uniqueSignerAccounts(operations.value))
const signerNetworks = computed(() => uniqueSignerNetworks(operations.value))

// Where the payload runs against where the wallet is looking; nothing renders until the active rows arrive.
const followDeclined = ref(false)
const scopeView = computed(() =>
	resolveOperationScope(operations.value, { networkId: appStore.network?.id, accountAddress: appStore.account?.address }),
)
const scopeBanner = computed(() => {
	const view = scopeView.value
	const state = scopeBannerState(view, followDeclined.value)
	if (!view || !state || !appStore.account || !appStore.network) return undefined
	return { state, ...scopeBannerCopy(state, view, { account: appStore.account, network: appStore.network }) }
})
const toggleFollow = () => {
	// Confirm captured the choice; a click while the follow waits behind the lock would flip the copy only.
	if (isLoading.value) return
	followDeclined.value = !followDeclined.value
}
const scopeFollow = createScopeFollow({
	// Invalidating: the guard is read right after, so it must not answer from a snapshot an event overtook.
	refreshInFlight: () => appStore.refreshInFlight({ invalidate: true }),
	hasInFlightSend: () => appStore.hasInFlightSend,
	getActiveNetworkId: async () => (await requireNetwork().getActiveNetwork())?.id,
	setActiveNetwork: (networkId) => requireNetwork().setActiveNetwork(networkId),
	writeActiveAccount: selectionWriter(
		() => profile.value?.id,
		(profileId, address) => managers.uiPreference.setSelectedAccount(profileId, address),
	),
})
// Mirrors the `requiresFeeSelection` early-return inside approve(): a send-like op
// with no chosen fee can't execute yet. Gating the Confirm button's disabled state
// on it (not just approve()'s guard) makes the button authoritative — a click while
// the fee is still auto-selecting can no longer no-op into the "select a fee"
// warning. e2e clicks wait for the button to enable, so this also removes the race
// where approval is clicked before the default fee resolves (slow PXE / cold start).
const needsFeeSelection = computed(() =>
	operations.value.some((op) => requiresFeeSelection(op as unknown as import("./types").DraftOperation)),
)

const showJson = () => {
	if (!requestId.value) return
	const url = new URL(chrome.runtime.getURL("src/popup/index.html#/windows/json"))
	url.searchParams.set("requestId", requestId.value)
	chrome.windows.create({ type: "popup", url: url.toString(), height: 700, width: 900 })
}

const profileService = new ProfileServiceClient()
// Synchronous on the event and on the store flip: the follow re-checks between its awaits, and a
// bump that waited for the scheduler could land after the write it was meant to stop.
profileService.onActiveProfileChanged.add((changed?: ProfileInfo) => {
	scopeFollow.invalidate()
	onActiveProfileChanged(changed)
})
watch(
	() => appStore.isLogined,
	(loggedIn) => {
		if (!loggedIn) scopeFollow.invalidate()
	},
	{ flush: "sync" },
)

watch([feeEstimates, authwitPreviews], decodeDiscoveredAuthwits, { deep: true })
watch(
	[estimatingOps, previewingOps],
	([estimating, previewing]) => {
		for (const i of Object.keys(queuedOps.value).map(Number)) if (!estimating[i] && !previewing[i]) queuedOps.value[i] = false
	},
	{ deep: true },
)
// Synchronous, so a result cleared in the tick it landed still leaves its verdict behind.
watch(
	feeEstimates,
	(results) => {
		for (const [i, landed] of Object.entries(results)) if (landed) lastLandedShort.value[Number(i)] = isShortEstimate(landed)
	},
	{ deep: true, flush: "sync" },
)

onMounted(startWindow)

onUnmounted(() => {
	scopeFollow.invalidate()
	tokenFollow.dispose()
	disposeWindow()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<SignerIdentityStrip :signerAccounts="signerAccounts" :signerNetworks="signerNetworks" :status="stripStatus" />

		<Flex direction="column" :class="$style.scroll_area">
			<DappIdentityBlock
				:dapp="dapp ?? undefined"
				hostnameTestId="execute-hostname"
				actionLabel="wants to execute the following"
			/>

			<Flex direction="column" gap="16" :class="$style.sections">
				<Banner
					v-if="scopeBanner"
					data-testid="execute-scope-banner"
					:data-state="scopeBanner.state"
					variant="info"
					direction="vertical"
					wide
					:action="scopeBanner.action ? { name: scopeBanner.action, callback: toggleFollow, testId: 'execute-scope-action-btn' } : undefined"
				>
					<template #title>{{ scopeBanner.title }}</template>
					<template #description>{{ scopeBanner.body }}</template>
				</Banner>

				<Flex v-if="operations.length" direction="column" gap="10" wide>
					<Flex wide justify="between" align="center">
						<SectionLabel label="Requested operations" :count="operations.length" />
						<Icon
							data-testid="execute-show-json-btn"
							@click="showJson"
							name="expand"
							size="16"
							color="tertiary"
							:class="$style.fullscreen_icon"
						/>
					</Flex>

					<OperationCard
						v-for="(op, i) in operations"
						:key="i"
						:op="op as UIOperation"
						:index="i"
						:profile="profile"
						:dapp="dapp ?? undefined"
						:feeEstimate="feeEstimates[i] ?? undefined"
						:isEstimating="!!estimatingOps[i]"
						:authwitPreview="authwitPreviews[i] ?? undefined"
						:isPreviewing="!!previewingOps[i]"
						:isQueued="!!queuedOps[i]"
						:decodedCalls="decodedCalls.get(i)"
						:decodedAuthwits="decodedAuthwits"
						:decodedGrants="decodedGrants.get(i)"
						:tokens="knownTokens"
						:tokenMetadata="op.kind === 'register_token' ? tokenMetadata.get((op as { address: string }).address) : undefined"
						:tokenMetadataError="op.kind === 'register_token' ? tokenMetadataError.get((op as { address: string }).address) : undefined"
						:tokenMetadataLoading="op.kind === 'register_token' && tokenMetadataLoading"
						:tokenFlagged="isFlaggedAdd(op as UIOperation)"
						:tokenFlagAcknowledged="flagAcknowledged.has(i)"
						:refused="refusal !== undefined"
						@updateFeeSettings="handleFeeUpdate"
						@updatePayer="(index: number, payer: FeePayerPick | null) => (feePayers[index] = payer)"
						@acknowledgeTokenFlag="acknowledgeTokenFlag"
					>
						<template v-if="refusal" #fee>
							<Flex
								data-testid="execute-op-refusal"
								:data-kind="refusal"
								role="alert"
								direction="column"
								gap="4"
								wide
								:class="$style.refusal"
							>
								<Flex align="center" gap="4">
									<Icon name="warning" size="12" color="orange" />
									<Text data-testid="execute-op-refusal-title" variant="body" color="orange">{{ REFUSAL_TITLE }}</Text>
								</Flex>
								<Text data-testid="execute-op-refusal-reason" variant="body" color="secondary">{{ REFUSAL_REASON[refusal] }}</Text>
							</Flex>
						</template>
					</OperationCard>
				</Flex>
			</Flex>
		</Flex>

		<DappApprovalFooter
			:processing-error="grantRefusal ?? processingError"
			reject-testid="execute-reject-btn"
			reject-label="Reject"
			:reject-disabled="isLoading || !requestId"
			confirm-testid="execute-confirm-btn"
			:confirm-hidden="refusal !== undefined"
			:confirm-label="isLoading ? 'EXECUTING' : 'Confirm'"
			:confirm-loading="isLoading"
			:confirm-disabled="
				processingError?.type === 'error' ||
				tokenMetadataUnread ||
				!initComplete ||
				operations.length === 0 ||
				needsFeeSelection ||
				payerShort ||
				awaitsEstimates ||
				tokenFlagHold ||
				grantsPending ||
				grantRefusal !== undefined ||
				isInteractionCancelled
			"
			@reject="reject('reject')"
			@approve="approve"
		/>

		<DappCancelledOverlay
			v-if="isWrongProfile"
			message="You are signed in to a different profile. Please switch profiles and resend your request."
			@dismiss="dismissWrongProfile"
		/>
		<DappCancelledOverlay
			v-else-if="isInteractionCancelled"
			message="The operation request was cancelled"
			@dismiss="closeWindow()"
		/>
	</Flex>
</template>

<style module>
.wrapper {
	composes: approval_wrapper from "../window-shell.module.css";
}

.scroll_area {
	composes: scroll_area from "../window-shell.module.css";
}

.sections {
	padding: 16px;
}

.refusal {
	padding: 12px;
	background: var(--nulo-surface-low);
}

.fullscreen_icon {
	cursor: pointer;
	padding: 4px;

	&:hover {
		background: var(--nulo-surface-high);
	}
}

</style>
