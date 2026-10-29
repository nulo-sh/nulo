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

/** Services */
import { FpcServiceClient } from "@/wallet/services/fpc/client"
import { PriceServiceClient } from "@/wallet/services/price/client"

/** Helpers */
import {
	buildFeeMethods,
	FEE_JUICE_BRIDGE_URL,
	feePayerOf,
	formatGasBalance,
	liveFeeScope,
	settingsForMethod,
	shortfallFigures,
} from "./fee-helpers"
import { feeDisplay, feeText } from "@/utils/fee-estimation"
import { applyFpcEdits } from "./fee-privacy"
import { usePrices } from "@/composables/usePrices"
import { useSponsorVerdicts, watchSponsorVerdicts } from "@/composables/useSponsorVerdicts"
import { useFeeSnapshot, watchFeeSnapshot } from "@/composables/useFeeSnapshot"
import { useAppFeeSelection, useSendFeeSelection } from "@/composables/useFeeSelection"

/** Composables */
import { useToast } from "@/composables/toast"
const { openToast } = useToast()

/** Stores */
import { useBalancesStore } from "@/stores/balances.store"
const balancesStore = useBalancesStore()

const props = defineProps({
	profile: { type: Object },
	network: { type: Object },
	account: { type: Object },
	feeEstimate: { type: Object, default: null },
	isEstimating: { type: Boolean, default: false },
	isQueued: { type: Boolean, default: false },
	/** Passed to the cost row: whether a queued send can still go out from this surface. */
	offersQueue: { type: Boolean, default: true },
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
	/** Send's amount field holds an amount; read only while the card reads what can pay. */
	amountTyped: { type: Boolean, default: false },
})

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

const snapshot = useFeeSnapshot(props, { store: balancesStore, selection: () => rules, accountUnusable: accountUnusableOut })
const { isInitComplete, gasBalances, registeredFpcs, snapshotCommitted, snapshotPending, isLoading, failure } = snapshot

const verdicts = useSponsorVerdicts({ isEstimating: () => props.isEstimating })
const { shortSponsorIds, setAsideSponsorIds, lastVerdict, verifyingSponsorId } = verdicts

/** This card's own FPC events, by id (`null` = deleted), applied over every store snapshot. The
 *  store's FPC list never hears those events and is re-copied on each commit, so a patch to
 *  `registeredFpcs` would not survive. Kept for the life of the card: an account switched away from
 *  and back to is served the store's retained list, and an id only ever names its own row. */
const fpcEdits = reactive(new Map())
const knownFpcs = computed(() => applyFpcEdits(registeredFpcs.value, fpcEdits))

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

const selectedPriority = ref("normal")
const isMethodsDropdownOpen = ref(false)

const selectionInput = {
	props,
	snapshot,
	verdicts,
	knownFpcs,
	methods,
	getFeePicks: (profileId) => managers.uiPreference.getFeePicks(profileId),
	saveFeePick: (profileId, update) => managers.uiPreference.saveFeePick(profileId, update),
}
/** Chosen once: Send always passes an origin, the app windows never do. */
const rules =
	props.originPrivacy !== null
		? useSendFeeSelection({ ...selectionInput, origin: () => props.originPrivacy })
		: useAppFeeSelection({ ...selectionInput, lockedMethod: () => props.lockedMethod, fallsBack: () => props.fallsBack })
const { effectiveMethod, previewMethod, held, sponsorShort, feeJuiceMissing } = rules

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
const displayMethod = computed(() => effectiveMethod.value ?? previewMethod.value)

/** Send's read for the live identity is in flight; the app windows keep their own loading look.
 *  Priority needs no balance, so it answers before the read lands. */
const readPending = computed(() => props.originPrivacy !== null && snapshotPending.value)
const showsCostRows = computed(() => readPending.value || (Boolean(effectiveMethod.value) && !feeJuiceMissing.value))

/** Who pays the estimate the readout shows; an estimate shows only while a method is chosen. */
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

/** `undefined` until init commits a whole snapshot, so the parent never estimates against a partial one. */
const derivedSettings = computed(() => {
	if (!isInitComplete.value) return undefined
	const m = effectiveMethod.value
	if (!m) return undefined
	return settingsForMethod(m, selectedPriority.value, gasBalances.value)
})

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

const handleMethodPicked = (m) => {
	// A loading row is inert in the menu; this keeps it so for any other path a pick arrives on.
	if (m.checking) return
	verdicts.picked(m)
	rules.pick(m)
}

const onFpcUpdated = (fpc) => {
	const before = knownFpcs.value.find((f) => f.id === fpc.id)?.address ?? ""
	fpcEdits.set(fpc.id, fpc)
	// An address edit keeps the id, and the verdict was on the old contract.
	if (!sameFieldAddress(before, fpc.address ?? "")) verdicts.addressEdited(fpc.id)
	rules.fpcUpdated(fpc)
}
const onFpcDeleted = (fpc) => {
	const wasSelected = effectiveMethod.value?.fpc?.id === fpc.id
	// The store's FPC list never hears of a deletion, and the menu offers what that list holds.
	fpcEdits.set(fpc.id, null)
	if (!wasSelected) return
	rules.fpcDeleted()
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
 *  speaks for a hold it caused. On Send, a failure's line waits out any read the bars stand for,
 *  and returns if that read fails. */
const statusNotice = computed(() => {
	if (failure.value && !readPending.value) return failure.value === "init" ? FEE_INIT_FAILED : FEE_DATA_UNAVAILABLE
	if (sponsorShort.value) return ""
	return held.value && props.originPrivacy === "private" ? PRIVATE_GAS_UNCHECKED : ""
})

// Keep this order: watchers one dependency triggers run in creation order.
watchFeeSnapshot(snapshot)
watchSponsorVerdicts(verdicts, {
	verdict: () => props.feeEstimate?.sponsorFunding,
	txShape: () => props.txShape,
	priority: selectedPriority,
	isEstimating: () => props.isEstimating,
	rows: methods,
	payer: effectiveMethod,
	onShort: rules.onShort,
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
	// this key must die with the card's subscription.
	snapshot.dispose()
	fpcService.disconnect()
	prices.dispose()
	priceService.disconnect()
})
</script>

<template>
	<Flex
		direction="column"
		:class="[$style.wrapper, embedded && $style.embedded]"
		data-testid="fee-settings-card"
		:data-origin="originPrivacy"
		:data-sponsor-funding="sponsorFunding"
		:data-read-pending="readPending || undefined"
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
			:pending="readPending"
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
			v-if="readPending || !statusNotice"
			:method="effectiveMethod"
			:isLoading="isLoading"
			:pending="readPending"
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
			v-if="showsCostRows"
			:pending="readPending"
			:amountTyped="amountTyped"
			:estimate="estimatedFeeDisplay"
			:isEstimating="isEstimating"
			:isQueued="isQueued"
			:offersQueue="offersQueue"
			:payer="feePayer"
			:queuedCap="queuedCapDisplay"
		/>

		<FeePriorityRow v-if="showsCostRows" v-model="selectedPriority" />
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
