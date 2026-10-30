<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** The Send token picker. It stays mounted, so its balance client connects on show and disconnects on hide. */

/** Components */
import TokenList from "@/popup/components/modules/holdings/TokenList.vue"

/** Services */
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"

/** Utils */
import { managers } from "@/utils/core"

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
const balancesState = ref("loading")
const loadError = computed(() => balancesState.value === "unavailable")

/** Prices order the rows; the composable owns a shared ticker, so it lives with the component. */
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const fiatOf = prices.fiatOfRow
const pins = usePinnedTokens({
	preferences: managers.uiPreference,
	getScope: () => pinScopeOf(appStore.profile?.id, appStore.network?.chainId),
	knownContracts: () => new Set(rows.value.map((tb) => tb.token.contract)),
})

const isFlaggedAddress = (address) => prices.isFlagged({ chainId: appStore.network?.chainId, contract: address })

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
	// A reconnect reads without `load()`: one begun without a whole scope lands nothing.
	scopeFence: () => {
		const whole = activeScope() !== undefined
		return () => whole
	},
})
tokenBalanceService.onTokenBalanceAdded.add(balances.onBalanceAdded)
tokenBalanceService.onTokenBalanceUpdated.add((tb) => balances.inActiveScope(tb) && balances.onBalanceUpdated(tb))
tokenBalanceService.onTokenBalanceDeleted.add(balances.onBalanceDeleted)

const handleSelectToken = (id) => {
	cacheStore.activeTokenIdx = id
	emit("onClose")
}

/** The opener's `{ onAdded }`, kept on show: closing a popup deletes its payload. */
let request
const openAddToken = (address) => {
	const opener = request
	popupStore.open("new_token", {
		address,
		onAdded: (token) => {
			opener?.onAdded?.(token)
			emit("onClose")
		},
	})
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
	request = undefined
	balances.reset()
	rows.value = []
	balancesState.value = "loading"
	tokenBalanceService.disconnect()
}

watch(
	() => props.show,
	() => {
		if (!props.show) return close()
		request = popupStore.getPayload("select_token")
		return load()
	},
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
				<span v-if="loadError" :class="$style.error" data-testid="select-token-error">Couldn't load tokens</span>
				<!-- An unread list holds no rows, so it would offer to add a token the person holds. -->
				<TokenList
					v-else-if="balancesState === 'loaded'"
					:rows
					:pinnedContracts="pins.pinnedContracts.value"
					:fiatOf
					testidPrefix="select-token"
					label="Your tokens"
					placeholder="Search or paste an address"
					:sortable="false"
					selectable
					:selectedId="cacheStore.activeTokenIdx"
					:isFlagged="isFlaggedAddress"
					:class="$style.list"
					@pick="handleSelectToken"
					@addToken="openAddToken"
				>
					<template #add-note>It joins your list on {{ appStore.network?.name }} and is picked for this send.</template>
				</TokenList>

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
	composes: body from "@/components/Popup/popup-shared.module.css";
}

/* The list's sticky search paints the sheet's colour, not the page's. */
.list {
	--token-list-bg: var(--nulo-surface);
}

.error {
	composes: type--body from global;
	padding: 12px 16px;

	color: var(--nulo-secondary);
}
</style>
