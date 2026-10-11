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
import { parseRawBalance, safeFiatOf } from "@/utils/token-amount"
import { aggregateFiat } from "@/utils/token-aggregate"
import { forChain } from "@/utils/token-order"
import { fitHero } from "@/utils/hero-fit"
import { heroRoom, rulerWidth } from "@/utils/hero-ruler"

/** Composables */
import { useEntityCrud } from "@/composables/useEntityCrud"
import { pinScopeOf, usePinnedTokens } from "@/composables/usePinnedTokens"
import { usePrices } from "@/composables/usePrices"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()

const activeChainId = () => appStore.network?.chainId
const activeAccount = () => appStore.account?.address

// The balance service returns a shared address's rows from every chain of the profile; this page
// keeps the active chain's rows only, both on fetch and on every live event.
const tokenBalanceService = new TokenBalanceServiceClient()
const {
	entities: rows,
	isLoading,
	error,
	refresh,
	dispose: disposeCrud,
} = useEntityCrud<TokenBalanceInfo>({
	fetch: async () => {
		const account = activeAccount()
		if (!account) return []
		return forChain(await tokenBalanceService.getTokenBalances(undefined, account), activeChainId())
	},
	added: tokenBalanceService.onTokenBalanceAdded,
	updated: tokenBalanceService.onTokenBalanceUpdated,
	deleted: tokenBalanceService.onTokenBalanceDeleted,
	accept: (tb) => tb.account === activeAccount() && tb.token.chainId === activeChainId(),
})
// A port reconnect can drop events fired while disconnected; resnapshot.
tokenBalanceService.onConnected.add(onReconnected)
function onReconnected() {
	void refresh()
}

const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const fiatOf = safeFiatOf((tb: TokenBalanceInfo) => prices.tokenFiatMicro(tb.token, parseRawBalance(tb) ?? 0n))
const usdRateOf = (tb: TokenBalanceInfo) => prices.quoteFor(tb.token.chainId, tb.token.contract)?.usd

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
	getScope: () => pinScopeOf(appStore.profile?.id, activeChainId()),
	knownContracts: () => new Set(rows.value.map((tb) => tb.token.contract)),
})
void pins.refresh()

const aggregate = computed(() => aggregateFiat(rows.value, fiatOf))
const aggregateDisplay = computed(() => prices.formatUsdMicro(aggregate.value.micro))

const openAddToken = (address: string) => {
	cacheStore.preselectedTokenAddressToAdd = address
	popupStore.open("new_token")
}

const summary = useTemplateRef<ComponentPublicInstance>("summary")
const summaryMeta = useTemplateRef<HTMLElement>("summaryMeta")
const totalRuler = useTemplateRef<HTMLElement>("totalRuler")
/** The total's type as a fraction of its 26 px: full size while it fits beside the meta line, then
 *  the largest that does, with no floor, so no digit is ever hidden. */
const totalScale = ref(1)
/** The least space, in px, a fitted total leaves before the meta line. */
const TOTAL_GAP = 8
let summaryResizes: ResizeObserver | undefined
function fitTotal() {
	const line = summary.value?.$el as HTMLElement | undefined
	const form = totalRuler.value
	const meta = summaryMeta.value
	if (!line || !form || !meta) return
	const room = heroRoom(line) - meta.getBoundingClientRect().width - TOTAL_GAP
	totalScale.value = fitHero(1, (_, scale) => rulerWidth(form, scale), room).scale
}

// After the render, so the ruler holds the figure the line shows.
watch([summary, aggregateDisplay, showFiatValues, () => rows.value.length, () => aggregate.value.partial], fitTotal, {
	flush: "post",
})

watch(
	() => [appStore.profile?.id, appStore.account?.address, appStore.network?.chainId],
	() => {
		void refresh({ clear: true })
		void pins.refresh()
	},
)

onMounted(() => {
	fitTotal()
	// jsdom has neither; there the fit still runs on each render.
	summaryResizes = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fitTotal)
	const line = summary.value?.$el as HTMLElement | undefined
	if (line) summaryResizes?.observe(line)
	document.fonts?.addEventListener("loadingdone", fitTotal)
})

onBeforeUnmount(() => {
	summaryResizes?.disconnect()
	document.fonts?.removeEventListener("loadingdone", fitTotal)
	tokenBalanceService.onConnected.remove(onReconnected)
	disposeCrud()
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
				<span v-if="showFiatValues" :class="$style.summary_amount">
					<span :class="$style.summary_fit" :style="{ '--hero-scale': totalScale }">{{ aggregateDisplay }}</span>
				</span>
				<span ref="summaryMeta" :class="$style.summary_meta">
					{{ rows.length }} tokens<template v-if="showFiatValues && aggregate.partial"> · priced assets only</template>
				</span>
				<!-- The fit's ruler: the total in the line's classes at full size, clipped to nothing, never drawn. -->
				<span v-if="showFiatValues" aria-hidden="true" :class="$style.summary_ruler">
					<span :class="$style.summary_amount"><span ref="totalRuler" :class="$style.summary_fit">{{ aggregateDisplay }}</span></span>
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

.summary_ruler > span {
	position: absolute;
	white-space: nowrap;
}

/* One line, never squeezed: the total gives way instead. */
.summary_meta {
	composes: type--meta from global;
	color: var(--nulo-secondary);
	flex-shrink: 0;
	white-space: nowrap;
}

.error {
	composes: type--body from global;
	color: var(--red);
}
</style>
