<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true,
		"showBottomNav": true
	}
}
</route>

<script setup>
/** Services */
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Components */
import BalanceView from "../components/modules/general/BalanceView.vue"
import RecentActivityView from "../components/modules/general/RecentActivityView.vue"
import RecoveryModeBanner from "../components/modules/general/RecoveryModeBanner.vue"
import RestoreOutcomeBanner from "../components/modules/general/RestoreOutcomeBanner.vue"
import TokensView from "../components/modules/general/TokensView.vue"

/** Composables */
import { ARRIVALS_KEY } from "@/composables/useArrivals"
import { useSeedStatus } from "@/composables/useSeedStatus"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const arrivals = inject(ARRIVALS_KEY, undefined)

const scrolled = ref(false)

/** One client and one seeding kick for the page: the hero and the list read the same snapshot. */
const tokenService = new TokenServiceClient()
const seed = useSeedStatus({
	client: tokenService,
	getScope: () => {
		const profileId = appStore.profile?.id
		const chainId = appStore.network?.chainId
		return profileId !== undefined && chainId !== undefined ? { profileId, chainId } : undefined
	},
})

function onScroll(event) {
	scrolled.value = event.currentTarget.scrollTop > 0
}

watch(
	() => [appStore.profile?.id, appStore.network?.chainId],
	() => void seed.refresh(),
)
onMounted(() => void seed.refresh())
onBeforeUnmount(() => {
	tokenService.disconnect()
	seed.dispose()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<div :class="$style.hero" data-testid="home-hero">
			<BalanceView :seedEntries="seed.entries.value" :seedReady="seed.ready.value" :arrival="arrivals?.latest.value ?? null" />
			<div aria-hidden="true" :class="[$style.scroll_shadow, scrolled && $style.scroll_shadow_visible]" data-testid="home-scroll-shadow" />
		</div>

		<div :class="$style.scroller" data-testid="home-scroller" @scroll.passive="onScroll">
			<Flex direction="column" gap="16" :class="$style.content">
				<RecoveryModeBanner />
				<RestoreOutcomeBanner />
				<TokensView :seedEntries="seed.entries.value" :seedReady="seed.ready.value" @retry-seed="seed.retry" />
				<RecentActivityView />
			</Flex>
		</div>
	</Flex>
</template>

<style module>
.wrapper {
	composes: wrapper from "./pinned-hero.module.css";
}

.hero {
	composes: hero from "./pinned-hero.module.css";
}

.scroll_shadow {
	composes: scroll_shadow from "./pinned-hero.module.css";
}

.scroll_shadow_visible {
	composes: scroll_shadow_visible from "./pinned-hero.module.css";
}

.scroller {
	composes: scroller from "./pinned-hero.module.css";
}

.content {
	padding: 16px 24px var(--nav-clearance) 24px;
}
</style>
