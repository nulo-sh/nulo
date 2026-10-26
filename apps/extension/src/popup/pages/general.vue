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
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Components */
import BackupReminderBanner from "../components/modules/general/BackupReminderBanner.vue"
import BalanceView from "../components/modules/general/BalanceView.vue"
import GetStartedCard from "../components/modules/general/GetStartedCard.vue"
import RecentActivityView from "../components/modules/general/RecentActivityView.vue"
import RecoveryModeBanner from "../components/modules/general/RecoveryModeBanner.vue"
import RestoreOutcomeBanner from "../components/modules/general/RestoreOutcomeBanner.vue"
import TokensView from "../components/modules/general/TokensView.vue"

/** Composables */
import { ARRIVALS_KEY } from "@/composables/useArrivals"
import { useConfigRead } from "@/composables/useConfigRead"
import { useGetStarted } from "@/composables/useGetStarted"
import { useSeedStatus } from "@/composables/useSeedStatus"

/** Utils */
import { FEE_JUICE_BRIDGE_URL } from "../components/modules/send/fee-helpers"
import { combineHoldings, gasHoldings, getStartedView, HOW_AZTEC_WORKS_URL } from "@/utils/get-started"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { selectedBalanceScope, useBalancesStore } from "@/stores/balances.store"
const appStore = useAppStore()
const balancesStore = useBalancesStore()

const arrivals = inject(ARRIVALS_KEY, undefined)
const router = useRouter()

const scrolled = ref(false)
/** The token rows' side of "holds funds", from BalanceView; Fee Juice comes from the gas entry. */
const tokenHoldings = ref("unknown")
const prestoReached = ref(undefined)

const ITEM_ROUTES = {
	phrase: "/popup/settings/security/export/seed",
	presto: "/popup/settings/proving",
}

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

const configService = new ConfigServiceClient()
configService.onUpdate.add(onConfigUpdate)
const prestoRead = useConfigRead(configService, readPrestoReached, landPrestoReached)
const getStarted = useGetStarted({ profileId: () => appStore.profile?.id })

const feeJuice = computed(() => {
	const scope = selectedBalanceScope(appStore)
	return gasHoldings(scope ? balancesStore.entry(scope)?.gas : undefined)
})
const reminders = computed(() =>
	getStartedView({
		type: appStore.profile?.type,
		flags: getStarted.flags.value,
		funds: combineHoldings(tokenHoldings.value, feeJuice.value),
		feeJuice: feeJuice.value,
		prestoReached: prestoReached.value,
	}),
)
// Token funds can raise the card before the gas read lands, which can still check the Fee Juice step.
const remindersSettled = computed(() => reminders.value !== null && feeJuice.value !== "unknown")

async function readPrestoReached() {
	try {
		return await configService.getValue("prestoReached")
	} catch (error) {
		// Unread is not reached: the row offers a setup that may be done already. Rethrown, so a
		// reconnect reads it again.
		prestoReached.value ??= false
		console.debug("presto flag read failed", { error })
		throw error
	}
}

function landPrestoReached(reached, updatedSince) {
	if (!updatedSince("prestoReached")) prestoReached.value = reached === true
}

function onConfigUpdate({ key, value }) {
	if (key === "prestoReached") prestoReached.value = value === true
}

function openPhrase() {
	router.push(ITEM_ROUTES.phrase)
}

/** The mark is awaited before the tab opens: the new tab closes the toolbar popup, and a write
 *  still in flight would close with it. */
async function onGetStartedSelect(item) {
	if (ITEM_ROUTES[item]) {
		// Unawaited: a route push keeps the popup, and the write, alive.
		if (item === "presto") void getStarted.mark("prestoOpened")
		router.push(ITEM_ROUTES[item])
		return
	}
	if (item === "aztec") await getStarted.mark("aztecOpened")
	window.open(item === "aztec" ? HOW_AZTEC_WORKS_URL : FEE_JUICE_BRIDGE_URL, "_blank", "noopener,noreferrer")
}

function onScroll(event) {
	scrolled.value = event.currentTarget.scrollTop > 0
}

watch(
	() => [appStore.profile?.id, appStore.network?.chainId],
	() => void seed.refresh(),
)
// The first read that finds Fee Juice checks the step for the profile: a spend, another account or
// a new chain never reopens it.
watch(
	() => feeJuice.value === "some" && getStarted.flags.value?.feeJuiceHeld === false,
	(held) => {
		if (held) void getStarted.mark("feeJuiceHeld")
	},
)
onBeforeMount(() => void prestoRead.read())
onMounted(() => void seed.refresh())
onBeforeUnmount(() => {
	tokenService.disconnect()
	configService.disconnect()
	seed.dispose()
	prestoRead.dispose()
	getStarted.dispose()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<div :class="$style.hero" data-testid="home-hero">
			<BackupReminderBanner v-if="reminders?.banner" :class="$style.reminder" @save="openPhrase" />
			<BalanceView
				:seedEntries="seed.entries.value"
				:seedReady="seed.ready.value"
				:arrival="arrivals?.latest.value ?? null"
				@holdings="tokenHoldings = $event"
			/>
			<div aria-hidden="true" :class="[$style.scroll_shadow, scrolled && $style.scroll_shadow_visible]" data-testid="home-scroll-shadow" />
		</div>

		<!-- The card waits for its reads, so it can mount after the rows have and move them down. -->
		<div :class="$style.scroller" data-testid="home-scroller" :data-reminders-settled="remindersSettled" @scroll.passive="onScroll">
			<Flex direction="column" gap="16" :class="$style.content">
				<RecoveryModeBanner />
				<RestoreOutcomeBanner />
				<GetStartedCard
					v-if="reminders?.steps.length"
					:steps="reminders.steps"
					:canHide="reminders.canHide"
					@select="onGetStartedSelect"
					@hide="getStarted.mark('hidden')"
				/>
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

.reminder {
	margin: 16px 24px 0;
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
