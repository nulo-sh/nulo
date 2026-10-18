<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/**
 * The Send token picker. Lists the active account's tokens on the active chain in the same order
 * as Home and Holdings (pinned, then by value), with a search box once the list outgrows Home's
 * budget. The balance client connects on show and is torn down on hide — the popup stays mounted.
 */

/** Components */
import ListStatusMessage from "@/components/composite/ListStatusMessage.vue"
import SearchField from "@/components/composite/SearchField.vue"

/** Services */
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"

/** Utils */
import { HOME_TOKEN_ROWS, orderTokenRows } from "@/utils/token-order"
import { matchesQuery } from "@/utils/token-search"

/** Composables */
import { pinScopeOf, usePinnedTokens } from "@/composables/usePinnedTokens"
import { usePrices } from "@/composables/usePrices"
import { usePopupStack } from "@/composables/usePopupStack"
import { useTokenBalanceSnapshot } from "@/composables/useTokenBalanceSnapshot"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { useCacheStore } from "@/stores/cache.store"
const appStore = useAppStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("select_token")
const cacheStore = useCacheStore()

const emit = defineEmits(["onSelectToken", "onClose"])
const props = defineProps({
	show: Boolean,
})

const router = useRouter()

const rows = ref([])
const query = ref("")
const balancesState = ref("loading")
const loadError = computed(() => balancesState.value === "unavailable")

/** Prices order the rows; the composable owns a shared ticker, so it lives with the component. */
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const fiatOf = prices.fiatOfRow
const pins = usePinnedTokens({
	getScope: () => pinScopeOf(appStore.profile?.id, appStore.network?.chainId),
	knownContracts: () => new Set(rows.value.map((tb) => tb.token.contract)),
})

const searchable = computed(() => rows.value.length > HOME_TOKEN_ROWS)
const listed = computed(() => {
	// A query typed while the box was shown must not keep filtering once the box is gone.
	const matching = searchable.value ? rows.value.filter((tb) => matchesQuery(tb.token, query.value)) : rows.value
	return orderTokenRows(matching, { pinnedContracts: pins.pinnedContracts.value, fiatOf })
})
const noResults = computed(() => rows.value.length > 0 && listed.value.length === 0)

const activeScope = () => {
	const account = appStore.account?.address
	const chainId = appStore.network?.chainId
	return account && chainId !== undefined ? { account, chainId } : undefined
}
// The hide disconnects the client, so no event or connect reaches a hidden sheet.
const tokenBalanceService = new TokenBalanceServiceClient()
const balances = useTokenBalanceSnapshot({
	client: tokenBalanceService,
	live: appStore,
	rows,
	state: balancesState,
	retryOnReject: false,
	refetchWhenDirty: false,
	onReconnect: () => void load(),
})
tokenBalanceService.onTokenBalanceAdded.add(balances.onBalanceAdded)
tokenBalanceService.onTokenBalanceUpdated.add((tb) => balances.inActiveScope(tb) && balances.onBalanceUpdated(tb))
tokenBalanceService.onTokenBalanceDeleted.add(balances.onBalanceDeleted)

const handleSelectToken = (id) => {
	cacheStore.activeTokenIdx = id
	emit("onClose")
}

const handleManageTokens = () => {
	router.push("/popup/settings/tokens")
	popupStore.closeAll()
}

// Without a whole scope nothing is read, and a read still out for the previous scope never lands.
const load = () => {
	rows.value = []
	balancesState.value = "loading"
	if (!activeScope()) return balances.invalidate()
	void pins.refresh()
	return balances.fetchTokenBalances()
}

// The hide disconnects the port, which rejects a read in flight; the next show's first connect is
// again the one its load opens.
const close = () => {
	balances.reset()
	rows.value = []
	query.value = ""
	balancesState.value = "loading"
	tokenBalanceService.disconnect()
}

watch(
	() => props.show,
	() => (props.show ? load() : close()),
)
watch(
	() => [appStore.account?.address, appStore.network?.chainId],
	() => {
		if (props.show) void load()
	},
)

onBeforeUnmount(() => {
	balances.dispose()
	tokenBalanceService.disconnect()
	prices.dispose()
	priceService.disconnect()
	pins.dispose()
})
</script>

<template>
	<Popup :show @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<PopupHeader @onClose="emit('onClose')" closable>
				<template #title>
					<Text variant="title-page" color="primary">Select token</Text>
				</template>
			</PopupHeader>

			<Flex wide direction="column" gap="24" :class="$style.wrapper">
				<SearchField v-if="searchable" v-model="query" placeholder="Search tokens" testid="select-token-search" />

				<ItemsContainer>
					<span v-if="loadError" :class="$style.error" data-testid="select-token-error">Couldn't load tokens</span>
					<ListStatusMessage v-else-if="noResults" variant="no-results" testid="select-token-no-results" />
					<SettingItem
						v-for="tb in listed"
						:key="tb.id"
						@click="handleSelectToken(tb.token.id)"
						:title="tb.token.symbol"
						:icon="tb.token.id === cacheStore.activeTokenIdx ? 'square-check' : 'square'"
						:iconFillColor="tb.token.id === cacheStore.activeTokenIdx ? 'primary' : 'tertiary'"
						iconBgColor="transparent"
						data-testid="select-token-row"
						:data-symbol="tb.token.symbol"
						:data-selected="tb.token.id === cacheStore.activeTokenIdx ? 'true' : 'false'"
					>
						<template v-if="prices.isFlagged(tb.token)" #description>
							<span data-testid="select-token-flagged" :class="$style.flagged">Flagged as a scam</span>
						</template>
					</SettingItem>
				</ItemsContainer>

				<ItemsContainer>
					<SettingItem
						@click="handleManageTokens"
						size="small"
						title="Manage tokens"
						icon="settings"
						iconFillColor="secondary"
						iconBgColor="transparent"
						chevron
					/>
				</ItemsContainer>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "./popup-shared.module.css";
}

/* The description slot's caption role, in the danger colour Home's flagged row uses. */
.flagged {
	color: var(--txt-danger);
}

.error {
	composes: type--body from global;
	padding: 12px 16px;

	color: var(--nulo-secondary);
}
</style>
