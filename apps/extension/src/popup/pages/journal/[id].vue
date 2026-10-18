<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/**
 * Detail page for a journal record with no settled `TransactionService` row; settled transactions
 * open `tx/[id].vue`. Every load (mount, scope switch, the record's update, a reconnect) goes
 * through `readJournalDetail`, so a record outside the popup's profile, network and account is
 * never shown. `op.error.message` and `op.error.normalizedRaw` render only in developer or debug
 * mode: they can hold serialized stacks and internal strings.
 */

/** Components */
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import TxHashRow from "@/popup/components/modules/tx/TxHashRow.vue"

/** Vendor */
import { DateTime } from "luxon"

/** Services */
import { OperationJournalServiceClient } from "@/wallet/services/operation-journal/client"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Utils */
import { DETAIL_TIME_FORMAT } from "../detail-page"
import { categoricalLabel, journalCardOriginLabel, journalTerminalDisplay } from "@/utils/journal-state"
import { bindJournalDetailUpdates, readJournalDetail } from "./journal-detail-scope"
import { humanizeMethodName, formatTransferType } from "@/utils/tx-enrichment"
import { usePrices } from "@/composables/usePrices"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { balanceFormatted } from "@/utils/amount.js"
import { knownDecimals } from "@/utils/token-amount"
import { copyWithToast } from "@/utils/clipboard"
import { getAccountExplorerUrl, getTransactionExplorerUrl, BLOCK_EXPLORERS } from "@/wallet/constants/explorers"

/** Composables */
import { useToast } from "@/composables/toast"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { trimAddress } from "@/utils/string"
const appStore = useAppStore()

const route = useRoute()
const router = useRouter()

const journalService = new OperationJournalServiceClient()
const configService = new ConfigServiceClient()
const tokenService = new TokenServiceClient()
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)

const op = ref(null)
const tokens = ref([])
const showDevFields = ref(false)
const notFound = ref(false)

const idFromRoute = computed(() => route.params.id)

const display = computed(() => (op.value ? journalTerminalDisplay(op.value) : null))

const isTransfer = computed(() => op.value?.kind === "transfer")

const token = computed(() => {
	if (!isTransfer.value || op.value?.tokenId === undefined) return null
	return tokens.value.find((t) => t.id === op.value.tokenId) ?? null
})

const title = computed(() => {
	if (!op.value) return "Transaction"
	if (isTransfer.value) return token.value?.symbol || "Transfer"
	return op.value.title ? humanizeMethodName(op.value.title) : "Transaction"
})

const amountDisplay = computed(() => {
	const decimals = knownDecimals(token.value)
	if (!isTransfer.value || !op.value?.amountRaw || decimals === null) return null
	return balanceFormatted(op.value.amountRaw, decimals, 8, { compact: true }).value
})

const transferTypeLabel = computed(() => {
	if (!isTransfer.value || op.value?.transferType === undefined) return null
	return formatTransferType(op.value.transferType)
})

/** Hero fiat at today's rate. This page renders only records that failed or
 *  ended early, and the owner wants those priced too: the dollar context of
 *  the transfer's amount. */
const transferFiat = computed(() => {
	if (!isTransfer.value || !op.value?.amountRaw || !token.value) return null
	return prices.tokenFiatLabel(token.value, BigInt(op.value.amountRaw)) ?? null
})

// Method label (when title is set; pre-broadcast records may not have one).
const methodLabel = computed(() => {
	if (!op.value?.title) return null
	if (isTransfer.value) return null
	return humanizeMethodName(op.value.title)
})

// Recipient surface for transfer kinds (only populated post-broadcast on
// some paths; null otherwise). Trimmed for the row presentation.
const recipientLabel = computed(() => {
	const r = op.value?.recipientAddress
	if (!r) return null
	return trimAddress(r, 6, 4, "…")
})

const originChip = computed(() => (op.value ? journalCardOriginLabel(op.value) : null))

const txHash = computed(() => op.value?.progress?.txHash ?? null)

// Only a record that names the active network places its hash or recipient on a chain; a legacy record names none.
const onActiveNetwork = computed(() => Boolean(appStore.network) && op.value?.networkId === appStore.network.id)
const explorerUrl = computed(() => {
	if (!txHash.value || !onActiveNetwork.value) return null
	return getTransactionExplorerUrl(appStore.network.chainId, appStore.defaultExplorer, txHash.value)
})
const recipientUrl = computed(() => {
	const r = op.value?.recipientAddress
	if (!r || !onActiveNetwork.value) return null
	return getAccountExplorerUrl(appStore.network.chainId, appStore.defaultExplorer, r)
})
const explorerName = computed(() => BLOCK_EXPLORERS.find((e) => e.id === appStore.defaultExplorer)?.name ?? "explorer")

const handleCopy = (target) => {
	void copyWithToast(target, openToast, "Successfully copied")
}

const errorMessage = computed(() => op.value?.error?.message ?? null)
const errorNormalizedRaw = computed(() => op.value?.error?.normalizedRaw ?? null)

// Wallet-controlled: never reads the dApp-controlled `op.subtitle`.
const category = computed(() => (op.value ? categoricalLabel(op.value) : null))

// State row value is title-case for visual parity with the other rows
// (which show user-friendly capitalized strings, not raw tokens).
const stateLabel = computed(() => {
	if (!display.value?.state) return null
	const s = display.value.state
	return s.charAt(0).toUpperCase() + s.slice(1)
})

// Hide the Outcome row when its label duplicates the State row (e.g.
// generic cancelled: Outcome "Cancelled" + State "Cancelled"). When
// they differ (e.g. user_rejected → Outcome "You rejected", State
// "Cancelled"), both rows surface distinct information and we keep
// the Outcome row.
const showOutcome = computed(() => {
	if (!category.value) return false
	if (category.value.label === "Error") return false
	return category.value.label.toLowerCase() !== display.value?.state
})

const createdAtLabel = computed(() => {
	if (!op.value?.createdAt) return null
	return DateTime.fromMillis(op.value.createdAt).toFormat(DETAIL_TIME_FORMAT)
})

const terminalAtLabel = computed(() => {
	if (!op.value?.terminalAt) return null
	return DateTime.fromMillis(op.value.terminalAt).toFormat(DETAIL_TIME_FORMAT)
})

// A send its wallet is still checking has not ended as far as the wallet knows.
const endedLabel = computed(() => (display.value?.state === "checking" ? null : terminalAtLabel.value))

const activeScope = () => ({
	profileId: appStore.profile?.id,
	networkId: appStore.network?.id,
	accountAddress: appStore.account?.address,
})

async function loadOp() {
	const record = idFromRoute.value ? await readJournalDetail(journalService, idFromRoute.value, activeScope) : undefined
	op.value = record ?? null
	notFound.value = !record
}

/** A failed reload keeps what the page shows; the record's next update or a reconnect reads it again. */
function reloadOp() {
	loadOp().catch(() => console.debug("[journal] the record's reload failed"))
}

function onOperationDeleted(deleted) {
	if (deleted.id === idFromRoute.value) {
		openToast({ kind: "success", label: "Record removed" })
		router.replace("/popup/activity")
	}
}

journalService.onOperationDeleted.add(onOperationDeleted)
const unbindUpdates = bindJournalDetailUpdates(journalService, () => idFromRoute.value, reloadOp)

// Re-validate the record's scope whenever the active profile/network/account
// changes — a switch while viewing A's journal detail must not keep it on-screen.
// `flush: 'sync'` + the synchronous `op` clear close the window where A's detail
// would otherwise linger under B during the async `loadOp()` re-fetch.
watch(
	() => `${appStore.profile?.id}|${appStore.network?.id}|${appStore.account?.address}`,
	() => {
		op.value = null
		loadOp()
	},
	{ flush: "sync" },
)

onMounted(async () => {
	if (appStore.profile && appStore.network) {
		tokens.value = await tokenService.getTokens(appStore.profile.id, appStore.network.chainId)
	}
	const props = await configService.getProps()
	const debugMode = props.find((p) => p.key === "debugMode")?.value ?? false
	const developerMode = props.find((p) => p.key === "developerMode")?.value ?? false
	showDevFields.value = Boolean(debugMode || developerMode)
	await loadOp()
})

onBeforeUnmount(() => {
	unbindUpdates()
	journalService.disconnect()
	configService.disconnect()
	tokenService.disconnect()
	prices.dispose()
	priceService.disconnect()
})
</script>

<template>
	<Flex direction="column" :class="$style.wrapper" data-testid="journal-detail-page">
		<SubPageHeader :title="title" :backTo="'/popup/activity'" />

		<Flex v-if="op && display" wide direction="column" gap="20" :class="$style.content">
			<Flex align="center" justify="center" gap="8" :class="$style.hero_meta">
				<span v-if="terminalAtLabel" :class="$style.tx_time">{{ terminalAtLabel }}</span>
				<span v-if="terminalAtLabel && explorerUrl" :class="$style.meta_sep">·</span>
				<a
					v-if="explorerUrl"
					:href="explorerUrl"
					target="_blank"
					rel="noopener noreferrer"
					@click.stop
					:class="$style.hero_link"
					data-testid="journal-detail-explorer-link"
				>
					<span>View on {{ explorerName }}</span>
					<Icon name="open" size="10" color="tertiary" />
				</a>
			</Flex>

			<!-- Transfer amount block (transfer kind only) -->
			<Flex v-if="isTransfer && amountDisplay" align="center" direction="column" gap="6">
				<span :class="$style.amount_value" data-testid="journal-detail-amount">
					{{ amountDisplay }}
					<span v-if="token?.symbol" :class="$style.amount_symbol">{{ token.symbol }}</span>
				</span>
				<span v-if="transferFiat" data-testid="journal-detail-fiat" title="At today's price" :class="$style.amount_fiat">
					{{ transferFiat }}
				</span>
			</Flex>

			<!-- Transfer-type chip (transfer kind only) — mirrors tx/[id].vue. -->
			<div v-if="transferTypeLabel" :class="$style.category_chip" data-testid="journal-detail-transfer-type">
				{{ transferTypeLabel }}
			</div>

			<!-- Details box — mirrors tx/[id].vue's details_box. App/Method/To/etc.
				 surfaced as rows (not standalone chips) so the layout matches the
				 confirmed-tx detail page. -->
			<Flex wide direction="column" gap="10" :class="$style.details_box" data-testid="journal-detail-box">
				<Flex v-if="category" wide direction="column" gap="4">
					<span :class="$style.detail_key">What happened</span>
					<span :class="$style.detail_context" data-testid="journal-detail-context">{{ category.context }}</span>
				</Flex>

				<TxHashRow
					v-if="txHash"
					:hash="txHash"
					:explorerUrl="explorerUrl"
					linkTestid="journal-detail-tx-hash-link"
					copyTestid="journal-detail-tx-hash-copy"
					@copy="handleCopy"
				/>

				<Flex v-if="originChip" wide justify="between" align="start" gap="16">
					<span :class="$style.app_key" data-testid="journal-detail-app-label">App</span>
					<span :class="$style.app_value" data-testid="journal-detail-origin">{{ originChip }}</span>
				</Flex>

				<Flex v-if="methodLabel" wide justify="between" align="start" gap="16">
					<span :class="$style.app_key" data-testid="journal-detail-method-label">Method</span>
					<span :class="$style.method_value" data-testid="journal-detail-method">{{ methodLabel }}</span>
				</Flex>

				<Flex v-if="recipientLabel" wide justify="between" align="center">
					<span :class="$style.detail_key">To</span>
					<a
						v-if="recipientUrl"
						:href="recipientUrl"
						target="_blank"
						rel="noopener noreferrer"
						data-testid="journal-detail-recipient-link"
						:class="$style.recipient_link"
						>{{ recipientLabel }}</a
					>
					<span v-else :class="$style.detail_value_mono" data-testid="journal-detail-recipient">{{ recipientLabel }}</span>
				</Flex>

				<Flex v-if="showOutcome" wide justify="between" align="center">
					<span :class="$style.detail_key">Outcome</span>
					<span :class="$style.detail_value_mono" data-testid="journal-detail-category">{{ category?.label }}</span>
				</Flex>

				<Flex v-if="createdAtLabel" wide justify="between" align="center">
					<span :class="$style.detail_key">Started</span>
					<span :class="$style.detail_value_mono">{{ createdAtLabel }}</span>
				</Flex>

				<Flex v-if="endedLabel" wide justify="between" align="center">
					<span :class="$style.detail_key">Ended</span>
					<span :class="$style.detail_value_mono" data-testid="journal-detail-ended">{{ endedLabel }}</span>
				</Flex>

				<Flex wide justify="between" align="center">
					<span :class="$style.detail_key">State</span>
					<span :class="$style.detail_value_mono" data-testid="journal-detail-state">{{ stateLabel }}</span>
				</Flex>
			</Flex>

			<!-- Developer-mode-gated raw error envelope. Preserved verbatim per
				 user QA feedback ("I like the 'developer mode on' error showing"). -->
			<Flex v-if="showDevFields && (errorMessage || errorNormalizedRaw)" direction="column" gap="6" :class="$style.dev_box">
				<span :class="$style.detail_key">Error (developer mode)</span>
				<pre
					v-if="errorMessage"
					:class="$style.code_block"
					data-testid="journal-detail-error-message"
				>{{ errorMessage }}</pre>
				<pre
					v-if="errorNormalizedRaw"
					:class="$style.code_block"
					data-testid="journal-detail-error-raw"
				>{{ errorNormalizedRaw }}</pre>
			</Flex>
		</Flex>

		<Flex v-else-if="notFound" wide direction="column" align="center" gap="12" :class="$style.content">
			<span :class="$style.empty_headline">RECORD NOT FOUND</span>
			<span :class="$style.empty_sub">This journal record isn't in your current activity feed.</span>
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	composes: wrapper from "../detail-page.module.css";
}

.content {
	composes: content from "../detail-page.module.css";
}

.hero_meta {
	composes: hero_meta from "../detail-page.module.css";
}

.tx_time {
	composes: tx_time from "../detail-page.module.css";
}

.meta_sep {
	composes: meta_sep from "../detail-page.module.css";
}

.hero_link {
	composes: hero_link from "../detail-page.module.css";
}

.amount_value {
	composes: amount_value from "../detail-page.module.css";
}

.amount_symbol {
	composes: amount_symbol from "../detail-page.module.css";
}

.amount_fiat {
	composes: amount_fiat from "../detail-page.module.css";
}

.category_chip {
	composes: type_chip from "../detail-page.module.css";
}

.details_box {
	composes: details_box from "../detail-page.module.css";
}

.detail_key {
	composes: detail_key from "../detail-page.module.css";
}

.detail_value_mono {
	composes: detail_value_mono from "../detail-page.module.css";
}

.app_key {
	composes: app_key from "../detail-page.module.css";
}

.app_value {
	composes: app_value from "../detail-page.module.css";
}

/* A function name wraps at its spaces and breaks inside a word only when the word outruns the line. */
.method_value {
	composes: detail_value_mono from "../detail-page.module.css";
	min-width: 0;
	text-align: right;
	overflow-wrap: anywhere;
	line-height: 1.4;
}

/* TxHashRow's link, so both linked values in Details read alike. */
.recipient_link {
	composes: detail_value_mono from "../detail-page.module.css";
	composes: detail_link from "../detail-page.module.css";
}

.detail_context {
	composes: type--body from global;
	line-height: 1.5;
	color: var(--txt-primary);
}

.dev_box {
	composes: details_box from "../detail-page.module.css";
}

.code_block {
	composes: type--meta from global;
	background: var(--nulo-surface-low);
	padding: 8px 12px;
	border: 1px solid var(--nulo-border);
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--txt-secondary);
	margin: 0;
}

.empty_headline {
	composes: empty_headline from "../detail-page.module.css";
}

.empty_sub {
	composes: empty_sub from "../detail-page.module.css";
}
</style>
