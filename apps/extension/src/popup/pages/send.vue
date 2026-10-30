<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Components */
import AmountCard from "@/components/composite/send/AmountCard.vue"
import FlaggedTokenBanner from "@/popup/components/modules/general/FlaggedTokenBanner.vue"
import FeeSettingsCard from "@/popup/components/modules/send/FeeSettingsCard.vue"
import PublishStrip from "@/components/composite/send/PublishStrip.vue"
import RecipientField from "@/popup/components/modules/send/RecipientField.vue"
import SelectTokenCard from "@/popup/components/modules/send/SelectTokenCard.vue"
import SendReviewSheet from "@/popup/components/modules/send/SendReviewSheet.vue"
import SendTypesCard from "@/components/composite/send/SendTypesCard.vue"

/** Services */
import { ContactServiceClient } from "@/wallet/services/contact/client"
import { ExecutionServiceClient } from "@/wallet/services/execution/client"
import { OperationJournalServiceClient } from "@/wallet/services/operation-journal/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { TokenServiceClient } from "@/wallet/services/token/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { proxyTickerFor } from "@/wallet/services/price/price-map"
import { TransferType } from "@/wallet/services/transaction/client"

/** Utils */
import { managers } from "@/utils/core"
import { LEGAL_DISMISSED_KEY } from "@/utils/legal-sheet"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { contactListReducers } from "@/utils/entity-list"
import { EstimateRequeue, estimateWhenClear } from "@/utils/estimate-when-clear"
import { FEE_JUICE_BRIDGE_URL, feePayerOf } from "@/popup/components/modules/send/fee-helpers"
import { feeText } from "@/utils/fee-estimation"
import { validateSendAmount } from "@/popup/pages/send-amount"
import { evaluateFiatGate, requoteReason } from "@/popup/pages/send-fiat-gate"
import { submitTransfer } from "@/popup/pages/send-submit"
import { feeAllowsSend, queueCapOf, queuedSponsoredOf, queueModeOf, sendFeeHandoff } from "@/popup/pages/send-fee-gate"
import { NO_FACTS, payerKindOf, publishFacts, TOKEN_CAVEAT } from "@/components/composite/send/publish-facts"
import { isValidatedTokenClass } from "@/utils/token-class"
import { IMPORTED_UNUSABLE_TOAST } from "@/components/stale-network/copy"
import { ImportedAccountUnusableError } from "@nulo/extension-messaging/errors"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { useFeeEstimation } from "@/composables/useFeeEstimation"
import { useLegalAcceptance } from "@/composables/useLegalAcceptance"
import { usePrices } from "@/composables/usePrices"
import { vSnackFooter } from "@/composables/snackInset"
import { useSendReview } from "@/composables/useSendReview"
import { useTicker } from "@/composables/ticker"
import { useTokenBalanceSnapshot } from "@/composables/useTokenBalanceSnapshot"
const { openToast, toast, closeToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()

const route = useRoute()
const router = useRouter()

/** Post-send / forced-close navigation. Prefers browser history so the user
 *  returns to whichever surface launched Send (token detail, contacts, home);
 *  falls back to /popup/general for cold-open / deep-link. */
function leaveSend() {
	if (window.history.length > 1) {
		router.back()
	} else {
		router.replace("/popup/general")
	}
}

const feeSettings = ref()
/** The fee card's reading of the method in effect — `{ type, fpcId, isProtocol }` or null. */
const payer = ref(null)
/** Set by FeeSettingsCard when the selected fee-juice method has zero balance.
 *  When true, the primary CTA becomes "Get fee juice" (C) and the fee card
 *  shows the explainer banner (A). */
const needsFeeJuice = ref(false)
const feeDisplay = ref(null)
/** The fee card's wording of the queued cap, for the review sheet. */
const queuedCapText = ref(null)
/** Set by FeeSettingsCard when the fee read refused the account: its imported key does not open. */
const accountUnusable = ref(false)

/** No send can leave an account whose key does not open, so Send closes onto Home and says why. */
let leftUnusable = false
function leaveUnusable() {
	if (leftUnusable) return
	leftUnusable = true
	openToast({ kind: "error", ...IMPORTED_UNUSABLE_TOAST })
	router.replace("/popup/general")
}

/** Open the fee-juice bridge in a new tab. */
const openFeeJuiceBridge = () => {
	window.open(FEE_JUICE_BRIDGE_URL, "_blank", "noopener,noreferrer")
}

const awaitingNewToken = ref(false)

const tokenService = new TokenServiceClient()
tokenService.onTokenAdded.add(onTokensChanged)
tokenService.onTokenUpdated.add(onTokensChanged)
tokenService.onTokenDeleted.add(onTokenDeleted)
let tokensChangedDuringLoad = false
/** Fires for any profile's or chain's add or update, so it re-reads the current identity's tokens
 *  rather than patching one: an amount integerizes with the decimals the list holds. A change during
 *  an identity fetch makes that fetch read them again, and one after a refused fetch retries it,
 *  since its balances and contacts are missing too. */
function onTokensChanged() {
	if (tokensLoading.value) {
		tokensChangedDuringLoad = true
		return
	}
	if (tokensFailed.value) return retryTokens()
	reloadTokens().catch(onReadFailed)
}
/** Bumped by each token re-read and identity fetch; a re-read lands only if none began after it. */
let tokenReadSeq = 0
async function reloadTokens() {
	if (!appStore.profile?.id || !appStore.network?.id || !appStore.account?.address) return
	const myRead = ++tokenReadSeq
	const list = await tokenService.getTokens(appStore.profile.id, appStore.network.chainId)
	if (myRead !== tokenReadSeq) return
	tokens.value = list
}
const onReadFailed = (error) => console.debug("send page read failed", { error })
function onTokenDeleted(token) {
	const idx = tokens.value.findIndex((t) => t.id === token.id)
	if (idx === -1) return
	const wasActive = activeToken.value?.id === token.id
	tokens.value.splice(idx, 1)
	if (!wasActive) return

	if (tokens.value.length) {
		cacheStore.activeTokenIdx = tokens.value[0].id
		return
	}

	openToast({ kind: "success", label: "The last token has just been deleted" })

	leaveSend()
}

const tokens = ref([])
/** True while the current identity's tokens are being read; the token card waits on it. */
const tokensLoading = ref(true)
/** The current identity's fetch was refused; the token card offers a Retry. */
const tokensFailed = ref(false)
const activeToken = computed(() => tokens.value?.find((t) => t.id === cacheStore.activeTokenIdx))
const isBlockedTransfer = computed(() => !activeToken.value?.hasPrivateTransfers && !activeToken.value?.hasPublicTransfers)

const tokenBalances = ref([])
/** `loaded` once the hook has landed a read since the identity fetch began. */
const balancesState = ref("loading")
const tokenBalanceService = new TokenBalanceServiceClient()
const balances = useTokenBalanceSnapshot({
	client: tokenBalanceService,
	live: appStore,
	rows: tokenBalances,
	state: balancesState,
})
tokenBalanceService.onTokenBalanceAdded.add(balances.onBalanceAdded)
tokenBalanceService.onTokenBalanceUpdated.add(balances.onBalanceUpdated)
tokenBalanceService.onTokenBalanceDeleted.add(balances.onBalanceDeleted)
const tokenBalance = computed(() => {
	return tokenBalances.value?.find((b) => b?.token.id === cacheStore.activeTokenIdx)
})
const tokenBalanceByType = computed(() => {
	// A balance can land before its token (an event during an identity fetch).
	if (!tokenBalance.value || !activeToken.value) return 0
	return selectedSendType.value === "private"
		? tokenBalance.value.privateBalance / 10 ** activeToken.value.decimals
		: tokenBalance.value.publicBalance / 10 ** activeToken.value.decimals
})

const selectedSendType = ref("private")
const selectedReceiverType = ref("private")
const initSendType = (keepSide = false) => {
	if (!activeToken.value) return
	if (!keepSide && cacheStore.preselectedBalanceType && activeToken.value.hasPrivateTransfers && activeToken.value.hasPublicTransfers) {
		selectedSendType.value = cacheStore.preselectedBalanceType
	}

	if (!activeToken.value.hasPrivateTransfers) {
		selectedSendType.value = "public"
	}

	if (!activeToken.value.hasPublicTransfers) {
		selectedSendType.value = "private"
	}
}
const initReceiverType = (keepSide = false) => {
	if (!activeToken.value) return
	if (!keepSide && cacheStore.preselectedBalanceType && activeToken.value.hasPrivateBalances && activeToken.value.hasPublicBalances) {
		selectedReceiverType.value = cacheStore.preselectedBalanceType
	}

	if (!activeToken.value.hasPrivateTransfers) {
		selectedReceiverType.value = "public"
	}

	if (!activeToken.value.hasPublicTransfers) {
		selectedReceiverType.value = "private"
	}
}

const contacts = ref([])
const contactService = new ContactServiceClient()
const contactList = contactListReducers(contacts)
contactService.onContactAdded.add(contactList.onAdded)
contactService.onContactUpdated.add(contactList.onUpdated)
contactService.onContactDeleted.add(contactList.onDeleted)

const selectedContact = ref()
const searchTerm = ref("")
const recipientCandidates = computed(() => [...contacts.value, ...appStore.accounts])

const amountTerm = ref()
/** The card's own resting text, whose commas the validator reads as its grouping. */
const amountRested = ref(null)

const isValidAddress = computed(() => isValidAztecAddress(searchTerm.value))

/** Raw balance (base units) for the currently-selected send type.
 *  Returned as a string straight from `tokenBalance.{public,private}Balance`
 *  so we never round-trip through JS-number math. */
const balanceRaw = computed(() => {
	if (!tokenBalance.value) return undefined
	return selectedSendType.value === "private" ? tokenBalance.value.privateBalance : tokenBalance.value.publicBalance
})

/** Single source of truth for "is the typed amount valid?". Drives
 *  both the Submit gate AND the estimate-watcher (which consumes the
 *  resulting `integerized: bigint` directly). */
const amountValidation = computed(() =>
	validateSendAmount({
		input: typeof amountTerm.value === "string" ? amountTerm.value : amountTerm.value?.toString(),
		rested: amountRested.value,
		tokenDecimals: activeToken.value?.decimals,
		balanceRaw: balanceRaw.value,
	}),
)

/** A never-synced row holds placeholder zeroes; a failed refresh keeps the last balance it read. */
const balanceState = computed(() => {
	const row = tokenBalance.value
	if (row && row.updatedAt !== 0) return "read"
	if (row ? row.syncFailure : balancesState.value === "unavailable") return "unavailable"
	return "loading"
})

/** The line under the amount names only a balance the wallet read: a row never synced holds a zero
 *  placeholder, which the token card draws as loading. */
const exceedsBalance = computed(() => amountValidation.value.reason === "exceedsBalance" && tokenBalance.value?.updatedAt !== 0)

/** The estimate watch's source for validity, a boolean: `amountValidation` is a new object on every
 *  balance recompute, and a deep watch runs on any change it subscribes to, so only a flip re-asks. */
const amountSendable = computed(() => amountValidation.value.valid)

/** C3 live pricing. The card freezes a session quote when fiat mode starts;
 *  the SUBMIT GATE lives here (this page owns handleSend) and fails closed. */
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)

/** Nothing is sent without a current Terms acceptance; the background refuses it too. `loading`
 *  shows no banner, so an accepted user never sees one flash. */
const legal = useLegalAcceptance(managers.legal)
const legalBlocked = computed(() => legal.status.value === "missing" || legal.status.value === "stale")
/** Clearing the dismissal is what lets the shell's sheet cover this page again. */
const legalBannerAction = {
	name: "Review",
	testId: "send-legal-review",
	callback: () => chrome.storage.session.remove(LEGAL_DISMISSED_KEY),
}
const liveQuote = computed(() => prices.quoteFor(activeToken.value?.chainId, activeToken.value?.contract) ?? null)
const proxyTicker = computed(() => (liveQuote.value ? (proxyTickerFor(liveQuote.value.coingeckoId) ?? null) : null))

const fiatMode = ref(false)
const fiatGuard = ref(null)
const amountCardRef = useTemplateRef("amountCardRef")

/** Pure, unit-tested gate (send-fiat-gate.ts) — fail-closed by construction. */
const gateNow = useTicker(30_000)
const fiatGate = computed(() =>
	evaluateFiatGate({
		fiatMode: fiatMode.value,
		guard: fiatGuard.value,
		liveUsd: liveQuote.value?.usd ?? null,
		now: gateNow.value ?? Date.now(),
	}),
)
const fiatQuoteBlocked = computed(() => !fiatGate.value.ok)
/** Distinguishes "needs explicit re-confirmation" from "just converting". */
const fiatNeedsRequote = computed(() => !fiatGate.value.ok && fiatGate.value.requote)
const fiatQuoteMoved = computed(() => requoteReason(fiatGuard.value?.frozenUsd, liveQuote.value?.usd) === "moved")
const handleRequote = (e) => {
	// Re-freezes at the current quote and re-derives the token amount — the
	// user sees the NEW derived amount on the card before confirming.
	amountCardRef.value?.refreezeQuote()
	// With a live quote the re-freeze unmounts the button: a keyboard user keeps their place in the amount.
	if (liveQuote.value && e.currentTarget.matches(":focus-visible")) amountCardRef.value?.focusAmount()
}

/** The wallet answered that an earlier send holds this transfer's chain state; set until the
 *  estimate's run starts, lands, fails or stops, so nothing the person pays goes out on a fee they
 *  have not seen. */
const feeQueued = ref(false)
/** The cap the queued answer offered (`{ basis, cap }`), or null when it offered none. */
const queuedCap = ref(null)
/** The current input's estimate failed; the fee row offers to ask again. */
const estimateFailed = ref(false)
/** The snack that reported the failure: the next question closes it unless another replaced it. */
let failureSnackId
const clearEstimateFailure = () => {
	estimateFailed.value = false
	if (failureSnackId !== undefined && toast.value?.id === failureSnackId) closeToast()
	failureSnackId = undefined
}
const clearQueued = () => {
	feeQueued.value = false
	queuedCap.value = null
}
const feeState = computed(() => ({
	queued: feeQueued.value,
	queuedCap: queuedCap.value,
	payer: feePayerOf(payer.value),
	estimate: feeEstimate.value,
}))
const queueCap = computed(() => queueCapOf(feeState.value))
const queuedSponsored = computed(() => queuedSponsoredOf(feeState.value))
const queueMode = computed(() => queueModeOf(feeState.value))

const isAllowedToSend = computed(() => {
	if (!legal.isCurrent.value) return false
	if (!feeAllowsSend(feeState.value)) return false
	if (!amountTerm.value) return false
	if (isBlockedTransfer.value) return false
	if (!isValidAddress.value) return false
	if (!feeSettings.value) return false
	if (fiatQuoteBlocked.value) return false
	return amountValidation.value.valid
})

const payerKind = computed(() => payerKindOf(feeSettings.value, payer.value))
// No sendable token → no facts: no strip, no tag, no review, whatever the fee card resolved.
const facts = computed(() =>
	isBlockedTransfer.value ? NO_FACTS : publishFacts(selectedSendType.value, selectedReceiverType.value, payerKind.value),
)
const showsTokenCaveat = computed(() => !isBlockedTransfer.value && !isValidatedTokenClass(activeToken.value?.classId))

/** The review sheet lives on the popup stack under this key, so it stacks and closes like any other popup. */
const REVIEW_KEY = "send_review"
const reviewOpen = computed(() => popupStore.isOpened(REVIEW_KEY))
const reviewOrder = computed(() => popupStore.popups[REVIEW_KEY]?.order ?? 0)
const reviewDepth = computed(() => popupStore.len - reviewOrder.value)
const { ready: reviewReady, authorises } = useSendReview({
	isGated: () => facts.value.requiresReview,
	isOpen: () => reviewOpen.value,
	isTop: () => reviewOrder.value === popupStore.len - 1,
})
const openReview = () => {
	if (!reviewOpen.value) popupStore.open(REVIEW_KEY)
}
const closeReview = () => popupStore.close(REVIEW_KEY)

const amountText = computed(() => (amountTerm.value ? String(amountTerm.value) : undefined))
const reviewFeeText = computed(() => (feeDisplay.value ? feeText(feeDisplay.value) : undefined))

const transferType = computed(() => {
	if (selectedSendType.value === "private" && selectedReceiverType.value === "private") return TransferType.Private
	if (selectedSendType.value === "private" && selectedReceiverType.value === "public") return TransferType.PrivateToPublic
	if (selectedSendType.value === "public" && selectedReceiverType.value === "private") return TransferType.PublicToPrivate
	if (selectedSendType.value === "public" && selectedReceiverType.value === "public") return TransferType.Public
	return undefined
})

/** The transfer the fee is for, less its fee settings: the transaction a sponsor verdict describes. */
const feeTxShape = computed(() =>
	JSON.stringify([activeToken.value?.id, transferType.value, searchTerm.value, amountValidation.value.integerized?.toString()]),
)

const executionService = new ExecutionServiceClient()
// ExecutionService opens a live SW port as soon as fee estimation runs
// (before any submit). Its ONLY disconnect used to live in executeTransfer's
// `.finally`, which never runs unless Send was actually clicked — so the common
// "open Send, pick amount, navigate away" flow leaked the port. Disconnect it in
// onBeforeUnmount too, idempotently (submit + unmount must not double-disconnect).
let executionDisconnected = false
function disconnectExecution() {
	if (executionDisconnected) return
	executionDisconnected = true
	executionService.disconnect()
}
// While a submit is in flight, teardown is OWNED by executeTransfer's `.finally`
// — the page navigates away immediately after submitting, so disconnecting in
// onBeforeUnmount would reject the still-pending executeTransfer RPC and surface
// a false "transaction not sent" for a tx the SW is actually executing.
let submitInFlight = false

// Per-mount instance id so the in-app log viewer can pin which Send
// page mount initiated each estimate / submit. Helps diagnose
// "extension wedge" reports — if a simulate fires while no instance
// is active, the call originated outside the popup (SW-side retry,
// dApp re-request, etc).
const sendInstanceId = Math.random().toString(36).slice(2, 8)

/** What the running estimate was asked: a requeue repeats it with a fresh token. */
let lastEstimateParams

const {
	result: feeEstimate,
	isEstimating,
	estimate: scheduleFeeEstimate,
	cancel: cancelFeeEstimate,
	handoff: handoffFeeEstimate,
} = useFeeEstimation({
	debounceMs: 800,
	estimate: (params, estimateToken, signal) => {
		const { networkId, accountAddress, tokenId, tokenContract, transferType: tt, destination, amount, settings } = params
		lastEstimateParams = params
		console.debug(`[send:${sendInstanceId}] estimateTransferFee firing`)
		return estimateWhenClear(
			() =>
				executionService.estimateTransferFee(
					networkId,
					accountAddress,
					tokenId,
					tokenContract,
					tt,
					destination,
					amount,
					settings,
					estimateToken,
				),
			signal,
			{
				onQueued: (answer) => {
					if (signal.aborted) return
					feeQueued.value = true
					// A spent token's answer carries no cap; the requeue's own answer will.
					if (!answer.tokenSpent) queuedCap.value = answer.cap ?? null
				},
				start: { events: executionService.onEstimateStarted, estimateToken, onStarted: clearQueued },
			},
		)
	},
	cancelRemote: (estimateToken) => {
		executionService.cancelEstimate(estimateToken).catch(() => {})
	},
	onError: (err) => {
		// Rescheduled before the engine's settle clears `isEstimating`, so the queued row never drops.
		if (err instanceof EstimateRequeue) return scheduleFeeEstimate(lastEstimateParams)
		clearQueued()
		if (err instanceof ImportedAccountUnusableError) return leaveUnusable()
		console.error(`[send:${sendInstanceId}] estimateTransferFee failed:`, err)
		estimateFailed.value = true
		failureSnackId = openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
	},
})
const isSending = ref(false)

/** Set true if the user navigates away manually during the short
 *  "Confirming..." window — prevents a second router.back() from firing. */
let cancelled = false

const canSubmitNow = () => {
	if (!isAllowedToSend.value || isSending.value) return false
	if (!amountValidation.value.valid) return false
	// The reactive gate runs on a 30s ticker — re-evaluate at TRUE wall-clock
	// on the actual click so a snapshot cannot slip through expiry/drift by up
	// to one tick.
	const submitGate = evaluateFiatGate({
		fiatMode: fiatMode.value,
		guard: fiatGuard.value,
		liveUsd: liveQuote.value?.usd ?? null,
		now: Date.now(),
	})
	return submitGate.ok
}

/**
 * The one path to a transfer. `source` says which control was activated; the sheet's counts only
 * while the sheet is open, the footer's only while it is not. A send that names the account as fee
 * payer goes out only from the sheet, and only once it is ready — the footer opens the sheet instead.
 */
const submit = (source) => {
	if (!canSubmitNow()) return
	if ((source === "review") !== reviewOpen.value) return
	if (facts.value.requiresReview && !authorises(source)) return openReview()

	isSending.value = true
	closeReview()
	submitInFlight = true
	submitTransfer(submitDeps, snapshotTransfer())

	// Leave at once: the durable operation journal shows progress on the general page and survives
	// popup close and SW restart; a fast rejection reaches the user as a toast.
	if (cancelled) return
	leaveSend()
}

/** Reactive values read once: the page unmounts before the transfer settles. */
function snapshotTransfer() {
	// Pass the cached estimate id when available so the SW can skip the
	// redundant `buildAndEstimateTxRequest` round-trip and reuse the
	// pre-built TxRequest. The SW validates a snapshot (base fee, primary
	// endpoint, inputs) at consume time and rebuilds on any drift.
	// Ownership handoff: submitting transfers the estimate to the execution
	// path — unmount cleanup must NOT remote-cancel it, or the eviction
	// would race the fire-and-forget executeTransfer out of its reuse hit.
	// Only when a consumable id exists: handing off a still-in-flight
	// estimate would orphan its eventual stash (nobody consumes, nobody can
	// cancel) for the full TTL.
	const { feeCap, precomputedEstimateId, shownFee } = sendFeeHandoff(feeState.value)
	if (precomputedEstimateId) handoffFeeEstimate()
	return {
		networkId: appStore.network.id,
		accountAddress: appStore.account.address,
		tokenId: activeToken.value.id,
		transferType: transferType.value,
		destination: searchTerm.value,
		amount: amountValidation.value.integerized,
		feeSettings: feeSettings.value,
		precomputedEstimateId,
		feeCap,
		shownFee,
		contract: activeToken.value.contract,
		symbol: activeToken.value.symbol,
		decimals: activeToken.value.decimals,
		epoch: appStore.scopeEpoch,
	}
}

const submitDeps = {
	executeTransfer: (...args) => executionService.executeTransfer(...args),
	awaiting: { add: appStore.addAwaitingTransaction, remove: appStore.removeAwaitingTransaction },
	openToast,
	isCurrent: (epoch) => appStore.isLogined && appStore.scopeEpoch === epoch,
	viewTransaction: (hash) => router.push(`/popup/tx/${hash}`),
	// A failure lands after the page has left, so the read opens and closes its own port.
	readJournal: async (id) => {
		const journal = new OperationJournalServiceClient()
		try {
			return await journal.getOperation(id)
		} finally {
			journal.disconnect()
		}
	},
	viewJournal: (id) => router.push(`/popup/journal/${id}`),
	onSettled: () => {
		submitInFlight = false
		disconnectExecution()
	},
}

watch(accountUnusable, (unusable) => {
	if (unusable) leaveUnusable()
})

// The queued flag outlives requeues (the engine stays estimating) but never the estimate itself.
watch(isEstimating, (estimating) => {
	if (!estimating) clearQueued()
})

/** An imported token's id: the token watch's next run keeps the amount and each side the token
 *  supports. */
let keepFormFor
async function pickAddedToken(token) {
	const epoch = appStore.scopeEpoch
	const current = cacheStore.activeTokenIdx
	const listed = () => tokens.value.some((t) => t.id === token.id)
	if (!listed()) await reloadTokens().catch(onReadFailed)
	// Only a token the list holds can be active: any other leaves the card with no token. A token
	// picked while the list was read is the later choice, and keeps its own form.
	if (cancelled || appStore.scopeEpoch !== epoch || cacheStore.activeTokenIdx !== current || !listed() || current === token.id) return
	keepFormFor = token.id
	cacheStore.activeTokenIdx = token.id
}

watch(
	() => cacheStore.activeTokenIdx,
	(id) => {
		closeReview()
		const keep = id === keepFormFor
		keepFormFor = undefined
		initSendType(keep)
		initReceiverType(keep)
		if (!keep) amountTerm.value = null
	},
)

// A re-read of the same token can take away the transfer kind the page has selected; a kind it
// still supports stays selected.
watch([() => activeToken.value?.hasPrivateTransfers, () => activeToken.value?.hasPublicTransfers], ([canPrivate, canPublic]) => {
	if (!activeToken.value) return
	if (!canPrivate) selectedSendType.value = selectedReceiverType.value = "public"
	if (!canPublic) selectedSendType.value = selectedReceiverType.value = "private"
})

watch(
	() => tokens.value,
	() => {
		if (tokens.value?.length && awaitingNewToken.value) {
			awaitingNewToken.value = false
			cacheStore.activeTokenIdx = tokens.value[0].id
		}
	},
	{ deep: true },
)

function requestEstimate() {
	clearEstimateFailure()
	// An estimate simulates against the node: no work for a send the wall would refuse.
	if (!legal.isCurrent.value) {
		cancelFeeEstimate()
		return
	}
	// NB: transferType can be 0 (TransferType.Private enum) which is falsy — check against undefined explicitly
	// or Private → Private is silently dropped here before estimation.
	if (!isValidAddress.value || transferType.value === undefined || !feeSettings.value) {
		cancelFeeEstimate()
		return
	}
	if (!amountValidation.value.valid) {
		cancelFeeEstimate()
		return
	}

	// New input asks a new question: it is queued only once the wallet says so again.
	clearQueued()
	scheduleFeeEstimate({
		networkId: appStore.network.id,
		accountAddress: appStore.account.address,
		tokenId: activeToken.value.id,
		tokenContract: activeToken.value.contract,
		transferType: transferType.value,
		destination: searchTerm.value,
		amount: amountValidation.value.integerized,
		settings: feeSettings.value,
	})
}

// Every input the estimate is asked with is a source here, so a landed estimate is always the
// current input's: each change re-asks (clearing the result) or cancels. A balance that starts or
// stops covering the amount counts as a change.
watch(
	[
		amountTerm,
		amountSendable,
		searchTerm,
		selectedSendType,
		selectedReceiverType,
		() => feeSettings.value,
		() => legal.isCurrent.value,
		() => activeToken.value?.id,
		() => activeToken.value?.contract,
		() => appStore.network?.id,
		() => appStore.account?.address,
	],
	requestEstimate,
	{ deep: true },
)

// The contact travels in the URL so a row opened in a new tab preselects it too. Applied after each
// contacts load rather than at mount: a cold tab's identity settles after the page is up, and the
// first load finds no contacts. Consumed once it matches; an id that is not one of this profile's
// contacts selects nothing.
let queryContactApplied = false
function applyQueryContact() {
	if (queryContactApplied || selectedContact.value || searchTerm.value) return
	const id = typeof route.query.contact === "string" ? route.query.contact : null
	const preselected = id === null ? undefined : contacts.value.find((c) => String(c.id) === id)
	if (!preselected) return
	queryContactApplied = true
	selectedContact.value = preselected
	searchTerm.value = preselected.address
}

// A newer identity fetch supersedes an older one, and only the current fetch ends `tokensLoading`
// or marks the fetch failed.
// `activeTokenIdx` is global (cache store): a new token set without it moves it to the first token,
// or `activeToken` resolves to nothing. The send and receiver types are then re-validated for it.
let identityFetchSeq = 0
async function refetchIdentityScopedState() {
	const mySeq = ++identityFetchSeq
	const isCurrent = () => mySeq === identityFetchSeq
	// A reconnect's re-read or retry begun for the previous identity must not land after this.
	balances.invalidate()
	balancesState.value = "loading"
	tokenReadSeq++
	tokensFailed.value = false
	if (!appStore.profile?.id || !appStore.network?.id || !appStore.account?.address) {
		if (isCurrent()) {
			tokens.value = []
			tokenBalances.value = []
			contacts.value = []
			tokensLoading.value = false
		}
		return
	}
	const profileId = appStore.profile.id
	const chainId = appStore.network.chainId
	// Cleared before the read, so a switch never shows the previous identity's token or balance.
	tokens.value = []
	tokenBalances.value = []
	tokensLoading.value = true
	tokensChangedDuringLoad = false
	try {
		const [first, tb, c] = await Promise.all([
			tokenService.getTokens(profileId, chainId),
			tokenBalanceService.getTokenBalances(undefined, appStore.account.address),
			contactService.getContacts(),
		])
		let t = first
		while (tokensChangedDuringLoad && isCurrent()) {
			tokensChangedDuringLoad = false
			t = await tokenService.getTokens(profileId, chainId)
		}
		if (!isCurrent()) return
		tokens.value = t
		// A reconnect's read that began after this fetch and has landed is the newer one.
		if (balancesState.value !== "loaded") tokenBalances.value = tb
		contacts.value = c
		// The tokens watch makes the first token added to an empty list the active one. A refused
		// load must not arm it, or the Retry's list would lose the active or requested token.
		awaitingNewToken.value = t.length === 0
		applyQueryContact()
		if (!t.some((tok) => tok.id === cacheStore.activeTokenIdx)) {
			cacheStore.activeTokenIdx = t[0]?.id ?? undefined
		}
		applyQueryToken()
		initSendType()
		initReceiverType()
	} catch (error) {
		if (isCurrent()) tokensFailed.value = true
		throw error
	} finally {
		if (isCurrent()) tokensLoading.value = false
	}
}

/** The token card's Retry: all three reads again, since the page cannot send without any of them. */
function retryTokens() {
	refetchIdentityScopedState().catch(onReadFailed)
}

// `?tokenId=` survives the unmount of tokens/[id], which clears `activeTokenIdx`. It is consumed by
// the first load that succeeds, matching or not: a cold tab's identity settles after mount, and a
// refused first load leaves it to the Retry.
let queryTokenApplied = false
function applyQueryToken() {
	if (queryTokenApplied) return
	queryTokenApplied = true
	const id = route.query.tokenId ? Number(route.query.tokenId) : null
	if (id && tokens.value.some((tok) => tok.id === id)) cacheStore.activeTokenIdx = id
}

watch(
	() => [appStore.profile?.id, appStore.network?.id, appStore.account?.address],
	() => {
		closeReview()
		refetchIdentityScopedState().catch(onReadFailed)
	},
	{ immediate: false },
)

onMounted(async () => {
	console.debug(`[send:${sendInstanceId}] mounted`)
	void legal.refresh()
	// Route mount fetch through the shared refetch so it inherits the
	// sequence guard AND the null-triple defense AND the
	// activeTokenIdx-rebind logic.
	await refetchIdentityScopedState().catch(onReadFailed)
})

onBeforeUnmount(() => {
	console.debug(`[send:${sendInstanceId}] unmounting`)
	cancelled = true
	closeReview()

	contactService.disconnect()
	balances.dispose()
	tokenBalanceService.disconnect()
	tokenService.disconnect()
	prices.dispose()
	priceService.disconnect()
	legal.dispose()
	// Only when NO submit is in flight — otherwise executeTransfer's `.finally`
	// owns the disconnect, and tearing down here would abort the pending RPC.
	if (!submitInFlight) disconnectExecution()

	cancelFeeEstimate()

	amountTerm.value = null

	searchTerm.value = ""

	contacts.value = []
	selectedContact.value = null

	awaitingNewToken.value = false

	cacheStore.preselectedBalanceType = "private"
})
</script>

<template>
	<Flex direction="column" :class="$style.wrapper">
		<SubPageHeader title="Send" :backTo="'/popup/general'" />

		<Banner v-if="legalBlocked" variant="warning" wide :action="legalBannerAction" data-testid="send-legal-banner">
			Accept the Terms to send
		</Banner>

		<Flex wide direction="column" justify="between" :class="$style.body">
			<Flex direction="column" :class="$style.top">
				<!-- Section: Transfer Path + Recipient — flush variant: the input's own bottom border
				     is the visual terminator, so we suppress the section divider to avoid a double line. -->
				<div :class="[$style.section, $style.section_flush]">
					<SendTypesCard
						v-if="!isBlockedTransfer"
						v-model:sendType="selectedSendType"
						v-model:receiverType="selectedReceiverType"
						:token="activeToken"
					/>

					<RecipientField
						v-model:searchTerm="searchTerm"
						v-model:selectedContact="selectedContact"
						:candidates="recipientCandidates"
					/>
				</div>

				<!-- Section: Select Asset -->
				<div :class="$style.section">
					<span :class="$style.section_label">Select Asset</span>
					<FlaggedTokenBanner v-if="prices.isFlagged(activeToken)" />
					<SelectTokenCard
						:token="activeToken"
						:loading="tokensLoading"
						:failed="tokensFailed"
						:onTokenAdded="pickAddedToken"
						@retry="retryTokens"
					/>
				</div>

				<!-- Section: Transaction Amount -->
				<div :class="$style.section">
					<span :class="$style.section_label">Transaction Amount</span>
					<AmountCard
						ref="amountCardRef"
						v-model="amountTerm"
						v-model:rested="amountRested"
						v-model:fiatMode="fiatMode"
						v-model:fiatGuard="fiatGuard"
						:token="activeToken"
						:tokenBalanceByType
						:balanceRawByType="balanceRaw ?? null"
						:balanceState
						:liveQuote
						:proxyTicker
						:exceedsBalance
					/>
					<Flex v-if="fiatNeedsRequote" align="center" gap="6" :class="$style.requote_notice">
						<Icon name="warning" size="12" color="tertiary" />
						<Text variant="caption" color="tertiary">
							{{ fiatQuoteMoved ? "The price moved since you started typing." : "The price quote went stale." }}
						</Text>
						<button type="button" @click="handleRequote" data-testid="send-fiat-requote" :class="$style.requote_action">
							Refresh quote
						</button>
					</Flex>
				</div>

				<!-- Section: Fee Summary -->
				<div :class="$style.section_last">
					<FeeSettingsCard
						:profile="appStore.profile"
						:network="appStore.network"
						:account="appStore.account"
						:feeEstimate="feeEstimate"
						:isEstimating="isEstimating"
						:isQueued="feeQueued"
						:queuedCap="queueCap"
						:amountTyped="Boolean(amountTerm)"
						:estimateFailed="estimateFailed"
						:originPrivacy="selectedSendType"
						:payerNoticeShape="facts.noticeShape"
						:txShape="feeTxShape"
						v-model="feeSettings"
						v-model:needsFeeJuice="needsFeeJuice"
						v-model:payer="payer"
						v-model:feeDisplay="feeDisplay"
						v-model:queuedCapText="queuedCapText"
						v-model:accountUnusable="accountUnusable"
						@retryEstimate="requestEstimate"
					/>
				</div>
			</Flex>

			<Flex v-snack-footer direction="column" gap="10" :class="$style.bottom" data-testid="send-footer">
				<PublishStrip v-if="!isBlockedTransfer" :facts="facts" @open="openReview" />
				<Text v-if="showsTokenCaveat" variant="body" color="secondary" data-testid="send-token-caveat">{{ TOKEN_CAVEAT }}</Text>
				<Button
					v-if="needsFeeJuice"
					@click="openFeeJuiceBridge"
					data-testid="send-get-fee-juice"
					variant="cta"
					wide
				>
					{{ selectedSendType === "private" ? "Get private gas" : "Get Fee Juice" }}
				</Button>
				<Button
					v-else
					@click="submit('primary')"
					data-testid="send-submit"
					:data-action="facts.requiresReview ? 'review' : 'send'"
					variant="cta"
					wide
					:disabled="!isAllowedToSend || isSending"
					:loading="isSending"
				>
					{{ isSending ? "CONFIRMING" : facts.requiresReview ? "Review send" : queueMode ? "Queue send" : "Confirm Transaction" }}
				</Button>
			</Flex>
		</Flex>

		<SendReviewSheet
			:show="reviewOpen"
			:order="reviewOrder"
			:depth="reviewDepth"
			:facts="facts"
			:amount="amountText"
			:symbol="activeToken?.symbol"
			:recipientName="selectedContact?.name"
			:recipientAddress="searchTerm"
			:feeText="reviewFeeText"
			:payerKind="payerKind"
			:payerType="payer?.type"
			:canSend="isAllowedToSend"
			:sending="isSending"
			:ready="reviewReady"
			:queuedCapText="queueCap ? queuedCapText : undefined"
			:queuedSponsored="queuedSponsored"
			@close="closeReview"
			@send="submit('review')"
		/>
	</Flex>
</template>

<style module>
.wrapper {
	flex: 1;
	overflow: auto;
	scrollbar-gutter: stable;
	background: var(--app-bg);
}

.body {
	flex: 1;
}

.top {
	padding: 0 24px;
}

.section {
	display: flex;
	flex-direction: column;
	gap: 8px;

	padding: 14px 0;
	border-bottom: 1px solid rgba(35, 31, 28, 1);
}

.section_flush {
	border-bottom: none;
	padding-bottom: 0;
}

.section_last {
	padding: 14px 0;
}

.section_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.bottom {
	position: sticky;
	bottom: 0;
	z-index: 5;

	padding: 20px 24px;
	background: var(--app-bg);
	border-top: 1px solid var(--nulo-border);
}


.requote_notice {
	padding: 6px 0;
}

.requote_action {
	composes: type--label-section from global;
	line-height: inherit;
	background: none;
	color: var(--nulo-accent);
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}
</style>
