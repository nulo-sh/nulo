<route lang="json">
{
	"meta": {
		"isAuthRequired": true,
		"showBottomNav": true
	}
}
</route>

<script setup lang="ts">
/** Vendor */
import type { ComponentPublicInstance } from "vue"

/** Components */
import TokenList from "../components/modules/holdings/TokenList.vue"

/** Services */
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import type { TokenBalanceInfo } from "@/wallet/services/token-balance/spec"

/** Utils */
import { managers } from "@/utils/core"
import { aggregateFiat, awaitingFirstPriceAnswer, pricesUnavailable } from "@/utils/token-aggregate"
import { fitHero } from "@/utils/hero-fit"
import { heroRoom, rulerWidth } from "@/utils/hero-ruler"

/** Composables */
import { pinScopeOf, usePinnedTokens } from "@/composables/usePinnedTokens"
import { usePrices } from "@/composables/usePrices"
import { type TokenBalanceSnapshotState, useTokenBalanceSnapshot } from "@/composables/useTokenBalanceSnapshot"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()

const activeChainId = () => appStore.network?.chainId

const rows = ref<TokenBalanceInfo[]>([])
const balancesState = ref<TokenBalanceSnapshotState>("loading")
const isLoading = computed(() => balancesState.value === "loading")
const error = computed(() => balancesState.value === "unavailable")
const tokenBalanceService = new TokenBalanceServiceClient()
const balances = useTokenBalanceSnapshot({
	client: tokenBalanceService,
	live: appStore,
	rows,
	state: balancesState,
	added: "replace",
})
tokenBalanceService.onTokenBalanceAdded.add(balances.onBalanceAdded)
tokenBalanceService.onTokenBalanceUpdated.add((tb) => balances.inActiveScope(tb) && balances.onBalanceUpdated(tb))
tokenBalanceService.onTokenBalanceDeleted.add(balances.onBalanceDeleted)
void balances.fetchTokenBalances()

const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const fiatOf = prices.fiatOfRow
const usdRateOf = (tb: TokenBalanceInfo) => prices.quoteFor(tb.token.chainId, tb.token.contract)?.usd
const isFlaggedAddress = (address: string) => prices.isFlagged({ chainId: activeChainId(), contract: address })

const showFiatValues = ref(true)
const dustThresholdUsd = ref(0)
const configService = new ConfigServiceClient()
configService.onUpdate.add(onConfigUpdate)
function onConfigUpdate(prop: { key: string; value: unknown }) {
	if (prop.key === "showFiatValues") showFiatValues.value = prop.value !== false
	if (prop.key === "incomingDustUsdThreshold") dustThresholdUsd.value = Number(prop.value) || 0
}
// Leaving the page rejects any read still in flight; the defaults stand in that case. A reconnect
// may have dropped an update, so the values are read again on every connect.
function readConfig() {
	configService
		.getValue("showFiatValues")
		.then((v) => {
			showFiatValues.value = v !== false
		})
		.catch(() => undefined)
	configService
		.getValue("incomingDustUsdThreshold")
		.then((v) => {
			dustThresholdUsd.value = Number(v) || 0
		})
		.catch(() => undefined)
}
readConfig()
configService.onConnected.add(readConfig)

const pins = usePinnedTokens({
	preferences: managers.uiPreference,
	getScope: () => pinScopeOf(appStore.profile?.id, activeChainId()),
	knownContracts: () => new Set(rows.value.map((tb) => tb.token.contract)),
})
void pins.refresh()

const aggregate = computed(() => aggregateFiat(rows.value, fiatOf))
/** Home's unavailable state, from the first price answer on: before it no quote has had a chance. */
const unavailable = computed(() => showFiatValues.value && prices.settled.value && pricesUnavailable(rows.value, fiatOf, prices))
/** A list that failed to read has no total, whatever rows live events stored since. */
const totalUnknown = computed(() => error.value || unavailable.value)
const totalDisplay = computed(() => (totalUnknown.value ? "—" : prices.formatUsdMicro(aggregate.value.micro)))
/** An unread list has no total yet, so the skeleton stands from the start, not from the first rows. */
const awaitingPrices = computed(
	() => showFiatValues.value && !error.value && (isLoading.value || awaitingFirstPriceAnswer(rows.value, prices)),
)

const openAddToken = (address: string) => {
	cacheStore.preselectedTokenAddressToAdd = address
	popupStore.open("new_token")
}

const summary = useTemplateRef<ComponentPublicInstance>("summary")
const totalRuler = useTemplateRef<HTMLElement>("totalRuler")
const metaRuler = useTemplateRef<HTMLElement>("metaRuler")
/** No count until the list answers: an unread list is not an empty one. */
const summaryMeta = computed(() => {
	if (isLoading.value || error.value) return ""
	if (unavailable.value) return "Prices unavailable"
	return `${rows.value.length} tokens${showFiatValues.value && aggregate.value.partial && !awaitingPrices.value ? " · priced assets only" : ""}`
})
/** The total's type as a fraction of its 26 px: full size while it fits beside the meta line
 *  wrapped to its narrowest, then the largest that does, with no floor, so no digit is ever hidden. */
const totalScale = ref(1)
/** The space, in px, a shrunk total keeps before the meta line: `.summary_amount_shrunk`'s margin,
 *  which makes the meta line wrap clear of it. A total that fits at full size has none. */
const TOTAL_GAP = 8
/** Measured widths are rounded to layout units (1/60 px in Firefox), so a total the line lays out
 *  exactly beside the meta can measure a hair over the room the two leave it. */
const LAYOUT_ROUNDING = 0.05
// jsdom has no ResizeObserver; there the fit still runs on each render.
const summaryResizes = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fitTotal)
const summaryLine = () => summary.value?.$el as HTMLElement | undefined
function fitTotal() {
	const line = summaryLine()
	const form = totalRuler.value
	const meta = metaRuler.value
	if (!line || !form || !meta) return
	const room = heroRoom(line) - meta.getBoundingClientRect().width
	if (rulerWidth(form, 1) <= room + LAYOUT_ROUNDING) {
		totalScale.value = 1
		return
	}
	totalScale.value = fitHero(1, (_, scale) => rulerWidth(form, scale), Math.max(room - TOTAL_GAP, 1)).scale
}

// The summary renders only while logged in, which may begin after the page mounts.
watch(
	summaryLine,
	(line, previous) => {
		if (previous) summaryResizes?.unobserve(previous)
		if (line) summaryResizes?.observe(line)
	},
	{ flush: "post", immediate: true },
)
// After the render, so the ruler holds the figure the line shows.
watch([summary, totalDisplay, summaryMeta], fitTotal, { flush: "post" })

watch(
	() => [appStore.profile?.id, appStore.account?.address, appStore.network?.chainId],
	() => {
		rows.value = []
		balancesState.value = "loading"
		void balances.fetchTokenBalances()
		void pins.refresh()
	},
)

onMounted(() => {
	fitTotal()
	document.fonts?.addEventListener("loadingdone", fitTotal)
})

onBeforeUnmount(() => {
	summaryResizes?.disconnect()
	document.fonts?.removeEventListener("loadingdone", fitTotal)
	balances.dispose()
	tokenBalanceService.disconnect()
	prices.dispose()
	priceService.disconnect()
	configService.onConnected.remove(readConfig)
	configService.disconnect()
	pins.dispose()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper" data-testid="holdings-page">
		<Flex direction="column" gap="16" :class="$style.content">
			<Flex ref="summary" align="end" justify="between" :class="$style.summary" data-testid="holdings-summary">
				<span
					v-if="showFiatValues"
					data-testid="holdings-total"
					:aria-busy="awaitingPrices || undefined"
					:class="[$style.summary_amount, { [$style.summary_amount_shrunk]: totalScale < 1 }]"
				>
					<Skeleton v-if="awaitingPrices" :width="96" :height="26" data-testid="holdings-total-loading" :class="$style.total_skeleton" />
					<span v-else :class="$style.summary_fit" :style="{ '--hero-scale': totalScale }" :aria-hidden="totalUnknown || undefined">{{ totalDisplay }}</span>
				</span>
				<span data-testid="holdings-meta" :class="$style.summary_meta">{{ summaryMeta }}</span>
				<!-- The fit's ruler: the total in the line's classes at full size and the meta line at its
				     narrowest, clipped to nothing, never drawn. -->
				<span v-if="showFiatValues" aria-hidden="true" :class="$style.summary_ruler">
					<span :class="[$style.summary_amount, $style.summary_ruler_total]">
						<span ref="totalRuler" :class="$style.summary_fit">{{ totalDisplay }}</span>
					</span>
					<span ref="metaRuler" :class="[$style.summary_meta, $style.summary_ruler_meta]">{{ summaryMeta }}</span>
				</span>
			</Flex>

			<LoadingState v-if="isLoading" label="LOADING HOLDINGS" />
			<span v-else-if="error" :class="$style.error" data-testid="holdings-error">Couldn't load holdings</span>
			<TokenList
				v-else
				:rows="rows"
				:pinnedContracts="pins.pinnedContracts.value"
				:fiatOf="fiatOf"
				:usdRateOf="usdRateOf"
				:dustThresholdUsd="dustThresholdUsd"
				:isFlagged="isFlaggedAddress"
				@addToken="openAddToken"
			/>
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	flex: 1;
	overflow: auto;
	background: var(--app-bg);
	scrollbar-gutter: stable;
}

.content {
	padding: 16px 24px var(--nav-clearance) 24px;
}

.summary {
	padding-bottom: 4px;
}

.summary_amount {
	composes: type--amount-total from global;
	font-size: 26px;
	color: var(--txt-primary);
}

.summary_amount_shrunk {
	margin-right: 8px;
}

/* Centred on the figure's line box, so the summary keeps its height when the figure lands. */
.total_skeleton {
	vertical-align: middle;
}

/* The figure scales down from the total's size, while its line keeps the full size's height; the
   role composes here too, so its em tracking computes at the fitted size. */
.summary_fit {
	composes: type--amount-total from global;
	font-size: calc(1em * var(--hero-scale, 1));
}

.summary_ruler {
	position: absolute;
	width: 0;
	height: 0;
	overflow: hidden;
	visibility: hidden;
	pointer-events: none;
}

.summary_ruler_total {
	position: absolute;
	white-space: nowrap;
}

.summary_ruler_meta {
	position: absolute;
	width: min-content;
}

.summary_meta {
	composes: type--meta from global;
	/* Empty while the list loads, and the list below must not move when the count arrives. */
	min-height: 1lh;
	color: var(--nulo-secondary);
}

.error {
	composes: type--body from global;
	color: var(--txt-danger);
}
</style>
