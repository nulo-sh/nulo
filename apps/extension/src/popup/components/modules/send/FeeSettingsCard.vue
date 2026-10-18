<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import FeeMethodRow from "./FeeMethodRow.vue"
import FeeCostReadout from "./FeeCostReadout.vue"
import FeeAmount from "@/components/composite/FeeAmount.vue"
import FeePriorityRow from "./FeePriorityRow.vue"
import FeeMethodSelector from "./FeeMethodSelector.vue"

/** Vendor */
import { getRandomHex } from "@/wallet/utils"
import { sameFieldAddress } from "@nulo/wallet-bridge"

/** Utils */
import { managers } from "@/utils/core"
import { storageLocalGet } from "@/utils/storage"
import { readAppPicks, readSendSlots } from "@/utils/fee-picks"
import { feePicksKey, sendFeePicksKey } from "@/utils/profile-ui-keys"

/** Services */
import { FpcServiceClient } from "@/wallet/services/fpc/client"
import { PriceServiceClient } from "@/wallet/services/price/client"

/** Helpers */
import {
	buildFeeMethods,
	defaultSponsor,
	FEE_JUICE_BRIDGE_URL,
	feePayerOf,
	formatGasBalance,
	liveFeeScope,
	resolveSavedSelection,
	savedSelectionOf,
	settingsForMethod,
	shortfallFigures,
} from "./fee-helpers"
import { feeDisplay, feeText } from "@/utils/fee-estimation"
import { applyFpcEdits, previewForPick, recordOf, resolveSendSelection } from "./fee-privacy"
import { usePrices } from "@/composables/usePrices"
import { useSponsorVerdicts, watchSponsorVerdicts } from "@/composables/useSponsorVerdicts"
import { useFeeSnapshot, watchFeeSnapshot } from "@/composables/useFeeSnapshot"

/** Composables */
import { useToast } from "@/composables/toast"
const { openToast } = useToast()

/** Stores */
import { useCacheStore } from "@/stores/cache.store"
import { useBalancesStore } from "@/stores/balances.store"
const cacheStore = useCacheStore()
const balancesStore = useBalancesStore()

const props = defineProps({
	profile: { type: Object },
	network: { type: Object },
	account: { type: Object },
	feeEstimate: { type: Object, default: null },
	isEstimating: { type: Boolean, default: false },
	isQueued: { type: Boolean, default: false },
	/** When mounted inside another bordered container (e.g. execute window's
	 *  operation card), the outer wrapper's own border + overflow:hidden
	 *  clash with the parent's border. Passing embedded=true strips the root
	 *  border so the parent can own the single border. */
	embedded: { type: Boolean, default: false },
	/** A method the dApp asked for by naming the account itself as payer ("fj" is the one shape):
	 *  the card shows it, its balance and its cost, and offers no other — the user's saved choice
	 *  and the network's default never replace it. */
	lockedMethod: { type: String, default: null },
	/** "private" | "public" — the side the transfer spends from. Non-null only on the Send page, where
	 *  the fee source follows it; null keeps the one-pick-per-account behaviour of the dApp windows. */
	originPrivacy: { type: String, default: null },
	/** "private" | "public" — the side the transfer lands on. */
	destinationPrivacy: { type: String, default: null },
	/** The page's reading of what this send's fee publishes — the selector's tag is drawn from it,
	 *  never from this card's own selection, so the tag can only ever agree with the footer. */
	payerNoticeShape: { type: String, default: null },
	/** The transaction the fee is for, less its fee settings; a change is a new transaction. */
	txShape: { type: String, default: "" },
	/** Outside Send: a short sponsor's selection falls to the next payer of Send's public-side walk
	 *  instead of to nothing. For a transaction whose calls are public, where paying from the
	 *  account's own Fee Juice publishes nothing new. */
	fallsBack: { type: Boolean, default: false },
	/** `{ basis, cap }` in base units while the page offers to queue the send against a cap. */
	queuedCap: { type: Object, default: null },
})

const readStored = async (key) => (await storageLocalGet(key))[key]
const readSavedFeeMethods = async (profileId) => readAppPicks(await readStored(feePicksKey(profileId)))

const settings = defineModel()

/** One-way child→parent flag: the selected fee-juice method has zero balance,
 *  so the account must bridge before it can pay. Drives the Send page's
 *  "get fee juice" CTA takeover. */
const needsFeeJuiceOut = defineModel("needsFeeJuice", { type: Boolean, default: false })

/** One-way child→parent: the method that pays, as `{ type, fpcId, isProtocol }`, or null while none
 *  does (pending, held, none). The parent reads the payer off the submitted settings; this only says
 *  whether the contract those settings name is one the wallet vouches for. */
const payerOut = defineModel("payer", { default: null })

/** One-way child→parent: the fee as "You pay" shows it. The review sheet repeats this value rather
 *  than pricing it again, since the page's own price client can hold a different quote. */
const feeDisplayOut = defineModel("feeDisplay", { default: null })

/** One-way child→parent: the cap as the readout words it, for the review sheet, priced once here. */
const queuedCapTextOut = defineModel("queuedCapText", { default: null })

/** One-way child→parent: the fee read refused the account because its imported key does not open. */
const accountUnusableOut = defineModel("accountUnusable", { type: Boolean, default: false })

const methodId = getRandomHex(6)

const snapshot = useFeeSnapshot(props, { store: balancesStore, selection: () => selection, accountUnusable: accountUnusableOut })
const { isInitComplete, gasBalances, registeredFpcs, committedScope, snapshotCommitted, snapshotPending, isLoading, failure } = snapshot
const { scopeIsLiveIdentity } = snapshot

/** This card's own FPC events, by id (`null` = deleted), applied over every store snapshot. The
 *  store's FPC list never hears those events and is re-copied on each commit, so a patch to
 *  `registeredFpcs` would not survive. Kept for the life of the card: an account switched away from
 *  and back to is served the store's retained list, and an id only ever names its own row. */
const fpcEdits = reactive(new Map())
const knownFpcs = computed(() => applyFpcEdits(registeredFpcs.value, fpcEdits))

const verdicts = useSponsorVerdicts({ isEstimating: () => props.isEstimating })
const { shortSponsorIds, setAsideSponsorIds, lastVerdict, droppedForVerdictId, verifyingSponsorId } = verdicts

/** The FPC list the store has read for the live identity. That read is never forced, so it usually
 *  lands well before the forced balance read lets the snapshot commit: the sponsor rows answer early. */
const earlyFpcs = computed(() => {
	const fpc = balancesStore.entry(liveFeeScope(props))?.fpc
	return fpc?.status === "ready" && fpc.data ? applyFpcEdits(fpc.data, fpcEdits) : null
})

/**
 * `methods` is what selections are resolved against. We pass `gasBalances`
 * only after init completes, so the loading-state items don't briefly flash
 * "no balance" before the first fetch returns.
 */
const methods = computed(() =>
	buildFeeMethods(knownFpcs.value, isInitComplete.value ? gasBalances.value : undefined, {
		shortSponsorIds,
		setAsideSponsorIds,
		verifyingSponsorId: verifyingSponsorId.value,
	}),
)

/** The dropdown's rows: `methods` once the live identity's snapshot is in. Before that, rows come
 *  from that identity's early FPC list alone, never another identity's, and load wherever no read
 *  has answered them. Display only: no selection is ever resolved against them. */
const menuMethods = computed(() => {
	if (snapshotCommitted.value) return methods.value
	const early = earlyFpcs.value
	return buildFeeMethods(early ?? [], undefined, {
		shortSponsorIds,
		setAsideSponsorIds,
		balancesPending: snapshotPending.value,
		fpcsPending: snapshotPending.value && !early,
	})
})

const selectedMethod = ref()
const selectedPriority = ref("normal")
const isMethodsDropdownOpen = ref(false)

const feeJuiceBalanceFormatted = computed(() =>
	gasBalances.value && gasBalances.value.publicFeeJuice !== null ? formatGasBalance(gasBalances.value.publicFeeJuice) : null,
)
const privateFeeJuiceFormatted = computed(() =>
	gasBalances.value && gasBalances.value.privateFeeJuice !== null ? formatGasBalance(gasBalances.value.privateFeeJuice) : null,
)

/** Fee USD is derived LIVE from the estimate's raw FJ amount × the current
 *  usable AZTEC quote — an estimate-time snapshot would keep displaying a
 *  stale figure after the 3-min refresh moved the rate (or after the quote
 *  expired entirely, where the figure must disappear). */
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const estimatedFeeDisplay = computed(() =>
	props.feeEstimate ? feeDisplay(props.feeEstimate.maxFee, prices.feeJuiceQuote.value?.usd) : null,
)
const queuedCapDisplay = computed(() => {
	if (!props.queuedCap) return null
	const usd = prices.feeJuiceQuote.value?.usd
	return { about: feeDisplay(props.queuedCap.basis, usd), cap: feeDisplay(props.queuedCap.cap, usd) }
})

/** Send's picks, `{ [slot]: { private?, public? } }`, one slot per profile and address: storage keeps
 *  each profile's picks apart, so an account held by two profiles has two picks. */
const sendPicks = reactive({})
const pickSlot = (profileId, address) => `${profileId}\n${address}`
const livePicks = () => sendPicks[pickSlot(props.profile?.id, props.account?.address)]

/**
 * Send's selection is DERIVED, never assigned: a pure function of the live origin, the live
 * account's pick and the committed snapshot. An origin flip cannot be missed and a late init cannot
 * overwrite a pick, because there is no assignment to race. It resolves only while the committed
 * snapshot belongs to the live identity — account A's balances never meet account B's pick.
 */
const sendSelection = computed(() => {
	if (props.originPrivacy === null) return null
	const pick = livePicks()?.[props.originPrivacy]
	if (!isInitComplete.value || !scopeIsLiveIdentity(committedScope.value)) {
		return { kind: "pending", preview: previewForPick(pick, methods.value) }
	}
	const know = { fpcs: knownFpcs.value, balances: gasBalances.value }
	return resolveSendSelection(props.originPrivacy, { ...know, shortSponsorIds, setAsideSponsorIds }, pick)
})

/** A short verdict set aside the sponsor that would have paid: on Send, the one the selection names
 *  without the verdicts; elsewhere, the one it dropped. */
const sponsorShort = computed(() => {
	if (props.originPrivacy === null) return droppedForVerdictId.value !== null
	if (shortSponsorIds.size === 0 || !isInitComplete.value || !scopeIsLiveIdentity(committedScope.value)) return false
	const pick = livePicks()?.[props.originPrivacy]
	const know = { fpcs: knownFpcs.value, balances: gasBalances.value }
	const unset = resolveSendSelection(props.originPrivacy, know, pick)
	return unset.kind === "selected" && unset.method.type === "fpc" && shortSponsorIds.has(unset.method.fpc?.id)
})

/** The method that pays. A `pending` preview is deliberately not one. */
const effectiveMethod = computed(() => {
	if (props.originPrivacy === null) return selectedMethod.value
	return sendSelection.value.kind === "selected" ? sendSelection.value.method : undefined
})
const nudgeCopy = computed(() =>
	props.originPrivacy === "private"
		? {
				title: "You have no private gas yet",
				body: "A private send pays its fee from private gas, so the fee contract is the payer instead of you. Bridge some to cover this send.",
				link: "Get private gas",
			}
		: { title: "You have no fee juice yet", body: "Bridge some to cover the network fee.", link: "Get fee juice" },
)

/** What the dropdown trigger shows: the paying method, or the saved pick's row while loading. */
const displayMethod = computed(() => effectiveMethod.value ?? sendSelection.value?.preview)

/** Who pays the estimate the readout shows; the readout draws only while a method is chosen. */
const feePayer = computed(() => {
	const m = effectiveMethod.value
	return feePayerOf(m && { type: m.type, isProtocol: m.fpc?.isProtocol }) ?? "self"
})

const SPONSOR_SHORT = "The sponsor you chose can't cover this fee right now."
/** The payer that takes over, named by kind: a sponsor's row title can be the short one's too. */
const takeoverName = (m) => {
	if (m?.type === "fj") return "Public Fee Juice"
	if (m?.type === "private_fpc") return "Private FPC"
	return m?.type === "fpc" && m.fpc?.isProtocol === true ? "The default sponsor" : null
}
const sponsorShortText = computed(() => {
	const name = takeoverName(effectiveMethod.value)
	return name ? `${SPONSOR_SHORT} ${name} pays it instead.` : SPONSOR_SHORT
})

/** The account's own Fee Juice, read short of this estimate's fee while it pays. */
const shortfall = computed(() => {
	const short = props.feeEstimate?.feeJuiceShortfall
	return short && effectiveMethod.value?.type === "fj" ? shortfallFigures(short, prices.feeJuiceQuote.value?.usd) : null
})

/** `short` while the notice shows, `funded` while the sponsor a funded verdict named pays. */
const sponsorFunding = computed(() => {
	if (sponsorShort.value) return "short"
	const verdict = lastVerdict.value
	return verdict?.funded && effectiveMethod.value?.fpc?.id === verdict.fpcId ? "funded" : undefined
})

/** The dApp-locked method's fresh row from `methods` (balance-aware), never a saved record. */
const lockedOption = () => methods.value.find((m) => m.type === props.lockedMethod)

/** `undefined` until init commits a whole snapshot, so the parent never estimates against a partial one. */
const derivedSettings = computed(() => {
	if (!isInitComplete.value) return undefined
	const m = effectiveMethod.value
	if (!m) return undefined
	return settingsForMethod(m, selectedPriority.value, gasBalances.value)
})

/** True when the selected fee-juice method (public or private) can't pay because
 *  its balance is zero — the trigger for the get-fee-juice nudge (banner + CTA). */
const feeJuiceMissing = computed(() => {
	// Send: only confirmed exhaustion — every applicable payer read, none can pay — whatever is selected.
	if (sendSelection.value) return sendSelection.value.kind === "none"
	return selectedMethodHasNoGas() || noPayerCanPay()
})
/** Send's public-side walk, with this card's pick standing in for Send's saved one: a hand-added
 *  sponsor counts only once picked, and an unread balance never counts as empty. */
const noPayerCanPay = () => {
	if (props.lockedMethod || !snapshotCommitted.value) return false
	const know = { fpcs: knownFpcs.value, balances: gasBalances.value, shortSponsorIds, setAsideSponsorIds }
	const pick = selectedMethod.value ? recordOf(selectedMethod.value) : undefined
	return resolveSendSelection("public", know, pick).kind === "none"
}
const selectedMethodHasNoGas = () => {
	if (!isInitComplete.value) return false
	// Unknown balances (failed/timed-out read, silent retry pending) never
	// trigger the nudge — only a confirmed zero does.
	const balances = gasBalances.value
	if (!balances) return false
	const m = selectedMethod.value
	if (!m) return false
	if (m.type === "private_fpc") {
		// Only a CONFIRMED zero triggers the bridge nudge. `null` means the PrivateFPC
		// read failed or isn't registered — an unknown state, not a confirmed empty
		// balance — so we don't tell a possibly-funded user to go bridge.
		return balances.privateFeeJuice === "0"
	}
	if (m.type === "fj") return balances.publicFeeJuice === "0"
	return false
}
watch(
	feeJuiceMissing,
	(v) => {
		needsFeeJuiceOut.value = v
	},
	{ immediate: true },
)

// Sync the computed to v-model. No `immediate: true` — we don't want to
// clobber the parent's initial value on mount; only push when derivation
// produces a new result.
watch(derivedSettings, (val) => {
	settings.value = val
})
watch(
	effectiveMethod,
	(m) => {
		payerOut.value = m ? { type: m.type, fpcId: m.fpc?.id, isProtocol: m.fpc?.isProtocol === true } : null
	},
	{ immediate: true },
)
watch(
	queuedCapDisplay,
	(d) => {
		queuedCapTextOut.value = d ? feeText(d.cap) : null
	},
	{ immediate: true },
)
watch(
	estimatedFeeDisplay,
	(d) => {
		feeDisplayOut.value = d
	},
	{ immediate: true },
)

/**
 * Persist the user's explicit selection. Idempotent: re-saving the same
 * selection is safe. Called only from user-action handlers
 * (`handleMethodPicked`) — never from data-refresh paths like
 * `onBalanceUpdated`.
 */
const persistSelection = async (method) => {
	const update = { kind: "app", address: props.account.address, pick: savedSelectionOf(method) }
	await managers.profile.saveFeePick(props.profile.id, update)

	if (method.type === "fpc" || method.type === "private_fpc") {
		const idx = cacheStore.feePaymentMethods.findIndex((m) => m.id === methodId)
		const entry = { id: methodId, fpc: method.fpc }
		if (idx === -1) cacheStore.feePaymentMethods.push(entry)
		else cacheStore.feePaymentMethods[idx] = entry
	}
}

/** Profile, address and origin are captured before any await: the pick belongs to the account and
 *  side it was made on. */
const pickForSend = (m) => {
	const profileId = props.profile.id
	const address = props.account.address
	const origin = props.originPrivacy
	const record = recordOf(m)
	const slot = pickSlot(profileId, address)
	sendPicks[slot] = { ...sendPicks[slot], [origin]: record }
	const update = { kind: "send", address, side: origin, pick: record }
	managers.profile.saveFeePick(profileId, update).catch((e) => console.error("Failed to save the send fee selection", { error: e }))
}

/** The selection is the card's own default, not a saved or live pick. */
let chosenUnasked = false
/** Counts explicit picks: a re-pick of the selected row leaves the reference unchanged. */
let pickSeq = 0

const handleMethodPicked = (m) => {
	// A loading row is inert in the menu; this keeps it so for any other path a pick arrives on.
	if (m.checking) return
	verdicts.picked(m)
	if (props.originPrivacy !== null) return pickForSend(m)
	selectedMethod.value = m
	pickSeq++
	chosenUnasked = false
	persistSelection(m).catch((error) => console.error("Failed to save the fee method", { error }))
}

const onFpcUpdated = (fpc) => {
	const before = knownFpcs.value.find((f) => f.id === fpc.id)?.address ?? ""
	fpcEdits.set(fpc.id, fpc)
	// An address edit keeps the id, and the verdict was on the old contract.
	if (!sameFieldAddress(before, fpc.address ?? "")) verdicts.addressEdited(fpc.id)
	if (props.originPrivacy !== null) return
	// Replace the full snapshot so address-edit changes propagate to the
	// dropdown trigger and any persisted-fee-method round-trips below.
	// Object replacement (not deep mutation) keeps the derived computed
	// reactive. A default holds only while its row is the protocol's: an edited address makes the
	// row custom, and a custom FPC pays only once picked.
	if (selectedMethod.value?.fpc?.id === fpc.id) {
		selectedMethod.value = chosenUnasked && !fpc.isProtocol ? undefined : { ...selectedMethod.value, fpc }
	}
}
const onFpcDeleted = (fpc) => {
	const wasSelected = effectiveMethod.value?.fpc?.id === fpc.id
	// The store's FPC list never hears of a deletion, and the menu offers what that list holds.
	fpcEdits.set(fpc.id, null)
	if (!wasSelected) return
	if (props.originPrivacy === null) selectedMethod.value = undefined
	openToast({ kind: "success", label: "Selected FPC was deleted" })
}

const fpcService = new FpcServiceClient()
fpcService.onFpcDeleted.add(onFpcDeleted)
fpcService.onFpcUpdated.add(onFpcUpdated)

// Silent degraded notice: the store owns the capped-backoff retry loop (it
// runs while this card's retry-capable subscription holds the key), so the
// card's job is only to SHOW the degraded state and re-commit on recovery.
// Deliberately no user-facing retry affordance — nothing the user can do
// fixes a failed balance read, and the degraded state keeps the card
// operable meanwhile (sponsored methods stay usable; self-paid methods stay
// fail-closed until a read succeeds — see settingsForMethod).
const FEE_DATA_UNAVAILABLE = "Couldn't load fee data. Retrying in the background."
/** A thrown init never committed, so no store retry can reach it: nothing runs it again on its own. */
const FEE_INIT_FAILED = "Couldn't load fee data. Close and reopen to try again."
const PRIVATE_GAS_UNCHECKED = "Couldn't check your private gas. Pick a fee source to continue."

/** The info row's text. A hold with a healthy store is a read that came back without a balance —
 *  nothing is retrying, so the row never promises a retry: a private origin says what to do, and a
 *  public origin leaves the trigger's own "select a method" prompt to speak. The sponsor's notice
 *  speaks for a hold it caused. */
const statusNotice = computed(() => {
	if (failure.value) return failure.value === "init" ? FEE_INIT_FAILED : FEE_DATA_UNAVAILABLE
	if (sponsorShort.value) return ""
	return sendSelection.value?.kind === "hold" && props.originPrivacy === "private" ? PRIVATE_GAS_UNCHECKED : ""
})

/** The selection a settled init lands on when the user picked nothing meanwhile: the saved one,
 *  resolved against fresh `methods` by semantic key (never the stored `fpc.name`), else the
 *  default: Nulo's sponsor, else nothing. A dangling saved record (a deleted FPC) simply re-resolves
 *  to nothing every time — it is deliberately NOT pruned here, since a whole-map write would race
 *  `persistSelection` / another mounted card and could clobber a newer selection. */
const settledSelection = (savedRecord) => {
	const resolved = resolveSavedSelection(savedRecord, methods.value)
	if (resolved) return resolved
	const preferred = defaultSponsor(methods.value)
	return preferred ? { ...preferred } : undefined
}

/** A selection taken as `baseline` has since been picked, or replaced by an FPC edit or deletion. */
const touchedSince = (baseline) => selectedMethod.value !== baseline.method || pickSeq !== baseline.pick

/** A pick made during init stands, read again from the snapshot's rows: their sponsor metadata is
 *  current, and a sponsor the snapshot no longer lists is dropped rather than paid through. */
const snapshotRowFor = (m) => (m ? methods.value.find((x) => x.type === m.type && x.fpc?.id === m.fpc?.id) : undefined)

const reconcileSelection = (savedRecord, baseline) => {
	if (props.lockedMethod) {
		selectedMethod.value = lockedOption()
		chosenUnasked = false
	} else if (touchedSince(baseline)) {
		selectedMethod.value = snapshotRowFor(selectedMethod.value)
	} else {
		selectedMethod.value = settledSelection(savedRecord)
		chosenUnasked = !resolveSavedSelection(savedRecord, methods.value)
	}
}

/** The saved selections this card reconciles against. Send reads its own key into `sendPicks`, for
 *  the address it read for and under any pick already made in this mount (which is newer), and
 *  reconciles nothing — so it hands back an empty legacy map. */
const readSavedSelections = async ({ profileId, accountAddress: address }) => {
	if (props.originPrivacy === null) return readSavedFeeMethods(profileId)
	const slots = readSendSlots(await readStored(sendFeePicksKey(profileId)), address)
	const slot = pickSlot(profileId, address)
	sendPicks[slot] = { ...slots, ...sendPicks[slot] }
	return {}
}

/** Shows the last-used method while the fetch is in flight. Send previews through `sendSelection` instead. */
const prefillSelection = (saved) => {
	if (props.originPrivacy !== null) return
	if (props.lockedMethod) selectedMethod.value = lockedOption()
	else if (saved[props.account.address]) selectedMethod.value = saved[props.account.address]
	else return
	chosenUnasked = false
}

/** Pre-fills from storage BEFORE the slow fetch, so the trigger shows the last-used method while it
 *  runs (the `isInitComplete` gate keeps the pre-fill out of settings derivation). Returns the saved
 *  map and the reconcile baseline, which a later pick moves off. A pick made during the read (an
 *  early sponsor row) is newer than anything saved, so nothing is pre-filled over it and the
 *  baseline stays the one from before the read. Null when a newer run owns the card: re-applying
 *  the pre-fill would clobber that run's reconcile. */
const readAndPrefill = async (scope, isCurrent) => {
	const beforeRead = { method: selectedMethod.value, pick: pickSeq }
	const saved = await readSavedSelections(scope)
	if (!isCurrent()) return null
	if (touchedSince(beforeRead)) return { saved, baseline: beforeRead }
	prefillSelection(saved)
	return { saved, baseline: { method: selectedMethod.value, pick: pickSeq } }
}

/** The snapshot's view of this card's selection, until each mode has its own rule book. */
const selection = {
	// A dApp locks the method precisely when the balance just moved (a claim made for this
	// account): a snapshot inside the reader's TTL would show the old figure and hold Confirm
	// off, so a locked mount reads fresh.
	// A private send defaults to the account's own Fee Juice only on a private balance read as zero,
	// and a zero from the reader's TTL may predate a receipt. The origin can flip to private without
	// another read, so every Send mount reads fresh, whatever its origin is at the time.
	forceRefresh: () => Boolean(props.lockedMethod) || props.originPrivacy !== null,
	load: readAndPrefill,
	reload: async (scope) => {
		// Baseline BEFORE the await (same rule as the run): a user pick landing
		// while the storage read is pending moves the selection off this
		// baseline, so the reconcile keeps the pick instead of re-applying a
		// stale storage snapshot over it.
		const baseline = { method: selectedMethod.value, pick: pickSeq }
		const saved = await readSavedFeeMethods(scope.profileId)
		return { saved, baseline }
	},
	// Send derives its selection (`sendSelection`); only the one-pick-per-account cards reconcile here.
	reconcile: ({ saved, baseline }, scope) => {
		if (props.originPrivacy === null) reconcileSelection(saved[scope.accountAddress], baseline)
	},
}

/** The payer Send's public-side walk lands on with this card's verdicts applied, or none. */
const publicFallback = () => {
	const know = { fpcs: knownFpcs.value, balances: gasBalances.value, shortSponsorIds, setAsideSponsorIds }
	const next = resolveSendSelection("public", know, undefined)
	return next.kind === "selected" ? next.method : undefined
}

/** Outside Send, a pick of a contract that cannot pay is dropped too; its saved record stays. */
const onShort = (fpcId) => {
	if (props.originPrivacy !== null || selectedMethod.value?.fpc?.id !== fpcId) return false
	selectedMethod.value = props.fallsBack ? publicFallback() : undefined
	chosenUnasked = true
	return true
}

watchFeeSnapshot(snapshot)
watchSponsorVerdicts(verdicts, {
	verdict: () => props.feeEstimate?.sponsorFunding,
	txShape: () => props.txShape,
	priority: selectedPriority,
	isEstimating: () => props.isEstimating,
	rows: methods,
	payer: effectiveMethod,
	onShort,
})
watch(
	() => [props.profile, props.network, props.account],
	async () => {
		// Close the gate NOW on a real identity change: if a same-identity
		// refresh is in flight, its commit is drift-guarded away — the old
		// identity's snapshot must not keep serving settings for the new one
		// in the meantime. (Fresh identity → fresh backoff is the store's
		// 0→1 retry-capable transition inside subscribeTo's resubscribe.)
		if (snapshot.invalidate()) verdicts.forget()
		await snapshot.run()
	},
)
onBeforeMount(async () => {
	console.debug(`[fee:${methodId}] mounting`)
	fpcService.connect()
	await snapshot.run()
})
onBeforeUnmount(() => {
	console.debug(`[fee:${methodId}] unmounting`)
	// Release before tearing down the clients: the store's retry loop for
	// this key must die with the card's subscription (today's unmount
	// retry-chain death).
	snapshot.dispose()
	fpcService.disconnect()
	prices.dispose()
	priceService.disconnect()
	cacheStore.feePaymentMethods = cacheStore.feePaymentMethods.filter((m) => m.id !== methodId)
})
</script>

<template>
	<Flex
		direction="column"
		:class="[$style.wrapper, embedded && $style.embedded]"
		data-testid="fee-settings-card"
		:data-origin="originPrivacy"
		:data-sponsor-funding="sponsorFunding"
	>
		<!-- A method the dApp asked for: shown, never a choice. -->
		<Flex v-if="lockedMethod" align="center" justify="between" :class="$style.card" data-testid="send-fee-locked">
			<Text variant="label-section" color="primary">Fee</Text>
			<Text variant="name" color="primary" :class="$style.method_size">Public Fee Juice · set by the app</Text>
		</Flex>
		<FeeMethodSelector
			v-else
			:modelValue="displayMethod"
			@update:modelValue="handleMethodPicked"
			:methods="menuMethods"
			:payerNoticeShape="payerNoticeShape"
			@open="isMethodsDropdownOpen = true"
			@close="isMethodsDropdownOpen = false"
		/>

		<!-- Mounted empty with the card, so a notice that lands in it is announced. -->
		<div role="status" aria-live="polite" aria-atomic="true" data-testid="fee-init-degraded-live">
			<Flex
				v-if="statusNotice"
				align="start"
				gap="6"
				wide
				:class="$style.detail_row"
				data-testid="fee-init-degraded"
			>
				<Icon name="info" size="14" color="primary" aria-hidden="true" />
				<Text variant="body" color="secondary" :style="{ paddingTop: '1px' }">
					{{ statusNotice }}
				</Text>
			</Flex>
		</div>

		<FeeMethodRow
			v-if="!statusNotice"
			:method="effectiveMethod"
			:isLoading="isLoading"
			:feeJuiceBalanceFormatted="feeJuiceBalanceFormatted"
			:privateFeeJuiceFormatted="privateFeeJuiceFormatted"
		/>

		<!-- Mounted with the card in every state: a region created with its text in place may go unannounced. -->
		<div role="status" aria-live="polite" aria-atomic="true" data-testid="fee-sponsor-live">
			<Flex
				v-if="sponsorShort"
				align="start"
				gap="6"
				wide
				:class="$style.detail_row"
				data-testid="fee-sponsor-short"
			>
				<Icon name="info" size="14" color="primary" aria-hidden="true" />
				<Text variant="body" color="secondary" :style="{ paddingTop: '1px' }">
					{{ sponsorShortText }}
				</Text>
			</Flex>
			<Flex
				v-if="shortfall"
				align="start"
				gap="6"
				wide
				:class="$style.detail_row"
				data-testid="fee-juice-shortfall"
			>
				<Icon name="warning" size="14" color="secondary" aria-hidden="true" />
				<Text variant="body" color="secondary" :style="{ paddingTop: '1px' }">
					This send can cost up to <FeeAmount :display="shortfall.cost" :class="$style.fee_figure" />. You have {{ shortfall.balance }} FJ.
				</Text>
			</Flex>
		</div>

		<Flex v-if="feeJuiceMissing" align="center" gap="8" :class="$style.detail_row" data-testid="send-fee-nudge">
			<Icon name="warning" size="14" color="secondary" />
			<Flex direction="column" gap="2" :style="{ flex: 1, minWidth: 0 }">
				<Text variant="value" color="primary">{{ nudgeCopy.title }}</Text>
				<Text variant="caption" color="tertiary">{{ nudgeCopy.body }}</Text>
			</Flex>
			<a
				:href="FEE_JUICE_BRIDGE_URL"
				target="_blank"
				rel="noopener noreferrer"
				:class="$style.get_fee_juice"
				data-testid="send-fee-get-juice"
			>{{ nudgeCopy.link }}</a>
		</Flex>

		<FeeCostReadout
			v-if="effectiveMethod && !feeJuiceMissing"
			:estimate="estimatedFeeDisplay"
			:isEstimating="isEstimating"
			:isQueued="isQueued"
			:payer="feePayer"
			:queuedCap="queuedCapDisplay"
		/>

		<FeePriorityRow v-if="effectiveMethod && !feeJuiceMissing" v-model="selectedPriority" />
	</Flex>
</template>

<style module>
.wrapper {
	border: 1px solid var(--nulo-outline);
	overflow: hidden;
}

.embedded {
	border: none;
}

.card {
	padding: 12px;
}

.method_size {
	font-size: 13px;
}

.detail_row {
	composes: detail_row from "./fee-shared.module.css";
}

.fee_figure {
	composes: fee_figure from "./fee-shared.module.css";
}

.get_fee_juice {
	composes: type--label-section from global;
	color: var(--nulo-accent);
	white-space: nowrap;
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}
}
</style>
