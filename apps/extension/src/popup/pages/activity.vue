<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"title": "History",
		"isAuthRequired": true,
		"showBottomNav": true
	}
}
</route>

<script setup>
/** Components */
import TransactionsList from "../components/modules/activity/TransactionsList.vue"

/** Services */
import { TransactionServiceClient } from "@/wallet/services/transaction/client"
import { OperationJournalServiceClient } from "@/wallet/services/operation-journal/client"
import { TokenServiceClient } from "@/wallet/services/token/client"
import { IncomingTransferServiceClient } from "@/wallet/services/incoming-transfer/client"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { PriceServiceClient } from "@/wallet/services/price/client"

/** Utils */
import { buildActivityRows, rowOnToken } from "@/utils/activity-rows"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"

/** Composables */
import { ARRIVALS_KEY } from "@/composables/useArrivals"
import { useIncomingTransfers } from "@/composables/useIncomingTransfers"
import { useScopedTokens } from "@/composables/useScopedTokens"

/** Store */
import { useAppStore } from "@/stores/app.store"

const appStore = useAppStore()

const route = useRoute()
const router = useRouter()

/** Service clients */
const transactionService = new TransactionServiceClient()
/** Journal terminal records (cancel / interrupted / failed paths that never produced an on-chain
 *  tx) merge into the History list alongside settled chain transactions. */
const journalService = new OperationJournalServiceClient()
const tokenService = new TokenServiceClient()
const scopedTokens = useScopedTokens({
	tokenService,
	scope: () => (appStore.profile && appStore.network ? { profileId: appStore.profile.id, chainId: appStore.network.chainId } : undefined),
})
const { tokens, loaded: tokensLoaded, tokenById } = scopedTokens

/** Incoming-receive surface — third source for the activity row merge.
 *  Filtered by trust state at the service layer; only visible (trusted)
 *  records arrive via getIncomingTransfers. */
// Parent owns the client lifecycle (connect/disconnect below).
const incomingTransferService = new IncomingTransferServiceClient()
const configService = new ConfigServiceClient()
const incomingPriceService = new PriceServiceClient()
const arrivals = inject(ARRIVALS_KEY, undefined)
const {
	incomingTransfers,
	loaded: incomingLoaded,
	refresh: loadIncomingTransfers,
	dispose: disposeIncomingTransfers,
} = useIncomingTransfers({
	incomingTransferService,
	configService,
	priceService: incomingPriceService,
	scope: () =>
		appStore.profile?.id && appStore.network?.id && appStore.account?.address
			? { profileId: appStore.profile.id, networkId: appStore.network.id, account: appStore.account.address }
			: undefined,
	afterRead: arrivals?.load,
})

/** Journal terminal records.
 *  Loaded on mount + refreshed on every journal event so the list reacts to
 *  late-arriving cancellations / failures while the user is on this page. */
const terminalJournalOps = ref([])

async function loadTerminalJournalOps() {
	if (!appStore.profile?.id) return
	const records = await journalService.getOperations({ profileId: appStore.profile.id, isTerminal: true })
	terminalJournalOps.value = records
}

function onJournalAdded(op) {
	if (op.terminalAt === null) return
	terminalJournalOps.value = [op, ...terminalJournalOps.value.filter((x) => x.id !== op.id)]
}
function onJournalUpdated(op) {
	if (op.terminalAt === null) {
		terminalJournalOps.value = terminalJournalOps.value.filter((x) => x.id !== op.id)
		return
	}
	const idx = terminalJournalOps.value.findIndex((x) => x.id === op.id)
	if (idx !== -1) terminalJournalOps.value[idx] = op
	else terminalJournalOps.value = [op, ...terminalJournalOps.value]
}
function onJournalDeleted(op) {
	terminalJournalOps.value = terminalJournalOps.value.filter((x) => x.id !== op.id)
}

journalService.onOperationAdded.add(onJournalAdded)
journalService.onOperationUpdated.add(onJournalUpdated)
journalService.onOperationDeleted.add(onJournalDeleted)
journalService.onConnected.add(loadTerminalJournalOps)

/** Discriminated row model — see TransactionsList for shape. Three sources
 *  merge into one date-sorted feed: chain txs, terminal journal records
 *  (cancelled / interrupted / failed-pre-broadcast), and incoming-receive
 *  records. Merge logic lives in utils/activity-rows.ts so both this page
 *  and the home Recent Activity widget agree on filter + sort semantics. */
const activityRows = computed(() =>
	buildActivityRows({
		transactions: appStore.transactions,
		terminalJournalOps: terminalJournalOps.value,
		incomingTransfers: incomingTransfers.value,
		accountAddress: appStore.account?.address,
		chainId: appStore.network?.chainId,
		networkId: appStore.network?.id,
		profileId: appStore.profile?.id,
	}),
)

/** Opened from a token page: `?token=` is one string of digits naming a positive safe integer, or no
 *  filter at all. It names a token of the active scope or none, and it only ever removes rows. */
const filterId = computed(() => {
	const raw = route.query.token
	if (typeof raw !== "string" || !/^\d+$/.test(raw)) return undefined
	const id = Number(raw)
	return Number.isSafeInteger(id) && id > 0 ? id : undefined
})
// Until the scope's tokens are read, an id names nothing yet: no list and no empty state paints.
const filterPending = computed(() => filterId.value !== undefined && !tokensLoaded.value)
const filterToken = computed(() => (filterId.value !== undefined && tokensLoaded.value ? tokenById(filterId.value) : undefined))
const filterSymbol = computed(() => (filterToken.value ? sanitizeWireString(filterToken.value.symbol, 32) : ""))
const visibleRows = computed(() => {
	if (filterPending.value) return []
	const token = filterToken.value
	return token ? activityRows.value.filter((row) => rowOnToken(row, token)) : activityRows.value
})

const titleRef = useTemplateRef("titleRef")

/** Hero visibility → compact sticky title fade */
const heroRef = useTemplateRef("heroRef")
const heroVisible = ref(true)
let heroObserver = null

/** The chip leaves with the focused control, so focus moves to the title rather than the page. */
async function clearTokenFilter() {
	await router.replace({ path: "/popup/activity" })
	titleRef.value?.focus()
}

watch(visibleRows, (rows) => arrivals?.present(rows.filter((row) => row.type === "incoming").map((row) => row.inc)), { flush: "post" })
// A token the scope does not hold (removed, another network's, or a list that could not be read)
// filters nothing, so History shows everything without a chip.
watch([filterId, tokensLoaded, filterToken], ([id, loaded, token]) => {
	if (id !== undefined && loaded && !token) void router.replace({ path: "/popup/activity" })
})

/** Lifecycle hooks */
onMounted(async () => {
	if (heroRef.value) {
		// One delivery batches every change since the last, oldest first: only the newest is current.
		heroObserver = new IntersectionObserver(
			(entries) => {
				heroVisible.value = entries.at(-1).isIntersecting
			},
			{ threshold: 0 },
		)
		heroObserver.observe(heroRef.value)
	}
	// Never behind the journal read: a rejected one would leave every row without its token.
	void scopedTokens.reload()
	await loadTerminalJournalOps()
	await loadIncomingTransfers()
	// Trigger an explicit ConfigService connect so the onUpdate listener
	// receives runtime toggle changes (ServiceClient registers but doesn't
	// auto-connect).
	try {
		await configService.connect()
	} catch {
		// Non-fatal; reload-on-toggle just won't fire until next mount.
	}
})

onBeforeUnmount(() => {
	transactionService.disconnect()
	tokenService.disconnect()
	journalService.disconnect()
	incomingTransferService.disconnect()
	configService.disconnect()
	incomingPriceService.disconnect()
	disposeIncomingTransfers()
	scopedTokens.dispose()
	heroObserver?.disconnect()
})
</script>

<template>
	<Flex
		v-if="appStore.isLogined"
		direction="column"
		:class="$style.wrapper"
		data-testid="activity-feed-root"
		:data-active-account="appStore.account?.address"
		:data-incoming-loaded="incomingLoaded ? 'true' : undefined"
	>
		<!-- The hero's h1 names the page for a screen reader; this bar repeats it for sight only. -->
		<div :class="[$style.page_title_bar, !heroVisible && $style.page_title_bar_visible]" aria-hidden="true">
			<span :class="$style.page_title_label" data-testid="page-title-bar">HISTORY</span>
		</div>

		<div ref="heroRef">
			<Flex direction="column" align="center" gap="16" :class="$style.hero" data-testid="page-hero">
				<h1 ref="titleRef" tabindex="-1" :class="$style.hero_title" data-testid="page-hero-title">HISTORY</h1>
				<div :class="$style.hero_bar" />
				<Badge v-if="filterToken" :class="$style.filter_chip" data-testid="activity-token-filter">
					<span :class="$style.filter_label" data-testid="activity-token-filter-symbol">{{ filterSymbol }}</span>
					<RowAction label="Show all activity" data-testid="activity-token-filter-clear" @click="clearTokenFilter">
						<MaterialIcon name="close" :size="14" color="secondary" />
					</RowAction>
				</Badge>
			</Flex>
		</div>

		<Flex direction="column" gap="24" :class="$style.content">
			<!-- Mixed activity list (chain tx + journal terminal records) -->
			<TransactionsList v-if="visibleRows.length" :rows="visibleRows" :tokens="tokens" :isArriving="arrivals?.isArriving" />

			<!-- Empty state -->
			<Flex
				v-else-if="!filterPending"
				direction="column"
				align="center"
				gap="12"
				:class="$style.empty_banner"
				data-testid="activity-empty"
			>
				<MaterialIcon name="history" :size="32" color="secondary" />
				<span :class="$style.empty_title">No transactions yet</span>
				<span :class="$style.empty_description">
					Once you start working with your assets, all activity will appear here
				</span>
			</Flex>
		</Flex>

	</Flex>
</template>

<style module>
.wrapper {
	flex: 1;
	overflow: auto;
	background: var(--app-bg);

	padding-bottom: var(--nav-clearance);
}

.page_title_bar {
	composes: page_title_bar from "./tab-hero.module.css";
}

.page_title_bar_visible {
	composes: page_title_bar_visible from "./tab-hero.module.css";
}

.page_title_label {
	composes: page_title_label from "./tab-hero.module.css";
}

.hero {
	composes: hero from "./tab-hero.module.css";
}

.hero_title {
	composes: hero_title from "./tab-hero.module.css";

	/* Focus lands here only after the token filter is cleared; it is not a control. */
	&:focus {
		outline: none;
	}
}

.hero_bar {
	composes: hero_bar from "./tab-hero.module.css";
}

.content {
	padding: 0 24px;
}

.filter_chip {
	max-width: 100%;
	min-width: 0;
	padding: 2px 2px 2px 10px;
}

/* The sanitizer caps code points, not width: a wide symbol ends in an ellipsis inside the hero. */
.filter_label {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	font-family: var(--font-headline);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.12em;
	text-transform: uppercase;
}

.empty_banner {
	max-width: 280px;
	margin: 48px auto 0 auto;
	text-align: center;
}

.empty_title {
	font-family: var(--font-headline);
	font-size: 14px;
	font-weight: 600;
	letter-spacing: -0.02em;
	color: var(--txt-primary);
}

.empty_description {
	font-family: var(--font-body);
	font-size: 12px;
	line-height: 1.5;
	color: var(--nulo-secondary);
}
</style>
