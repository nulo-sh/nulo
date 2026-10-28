<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Services */
import { PriceServiceClient } from "@/wallet/services/price/client"

/** Composables */
import { usePrices } from "@/composables/usePrices"

/** Utils */
import { balanceFormatted } from "@/utils/amount.js"
import { dashIfBlank } from "@/utils/string"
import { knownDecimals, parseRawBalance } from "@/utils/token-amount"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const props = defineProps({
	tokenBalance: {
		type: Object,
		required: false,
	},
	newToken: {
		type: Object,
		required: false,
	},
	/** Set, the row is a picker's option: a button that emits `pick` with the token id, its testids
	 *  under this prefix. Unset, it links to the token's page. */
	pickPrefix: String,
	selected: Boolean,
})
const emit = defineEmits(["pick"])

const token = computed(() => props.tokenBalance.token)
const pickAttrs = computed(() => ({
	type: "button",
	"data-testid": `${props.pickPrefix}-row`,
	"data-symbol": token.value.symbol,
	"data-selected": props.selected ? "true" : "false",
	"aria-current": props.selected ? "true" : undefined,
}))
// Row numbers come from storage rows that contracts fed: a side that is not a non-negative
// integer literal, or decimals the wallet does not know, makes the row "unknown" — rendered as a
// dash, never parsed into BigInt or an exponent.
const isMalformed = computed(
	() => !props.tokenBalance || parseRawBalance(props.tokenBalance) === undefined || knownDecimals(token.value) === null,
)
const decimals = computed(() => (isMalformed.value ? 0 : token.value.decimals))
const publicRaw = computed(() => (isMalformed.value ? 0n : BigInt(props.tokenBalance.publicBalance || 0)))
const privateRaw = computed(() => (isMalformed.value ? 0n : BigInt(props.tokenBalance.privateBalance || 0)))
const totalBalance = computed(() =>
	isMalformed.value ? "—" : balanceFormatted(privateRaw.value + publicRaw.value, decimals.value, 10, { compact: true }).value,
)

/** Holding fiat value between amount and split — absent when unpriced.
 *  The client lifecycle lives here (row-level) because TokenCard is mounted
 *  per-row from the tokens list; the shared cache keeps this cheap. */
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const fiatLabel = computed(() => (isMalformed.value ? undefined : prices.tokenFiatLabel(token.value, privateRaw.value + publicRaw.value)))
const isFlagged = computed(() => prices.isFlagged(token.value))
onBeforeUnmount(() => {
	prices.dispose()
	priceService.disconnect()
})
const privateFormatted = computed(() => balanceFormatted(privateRaw.value, decimals.value, 6, { compact: true }).value)
const publicFormatted = computed(() => balanceFormatted(publicRaw.value, decimals.value, 6, { compact: true }).value)
// Treat updatedAt===0 as "balance has never synced" — the projector hasn't run yet
// so the "0" placeholder in the row would be misleading. Render a skeleton instead.
const isInitialSync = computed(() => !!props.tokenBalance && props.tokenBalance.updatedAt === 0)

// Routine refreshes are deliberately SILENT per row — batch refreshes would animate every row at
// once; TokensView's section-header dot is the ONE activity signal. Only exceptions speak here:
// the failed dim below + the first-load skeleton.
// The row's last projection FAILED (persisted `syncFailure`, cleared by the
// next success): dim the last-known amount + say so. Gated on !isUpdating so a
// retry in flight shows its honest in-flight state instead (the loading block
// during an initial sync; silence after). Deliberately NOT gated on
// isInitialSync: a never-synced row whose FIRST projection failed must show
// the failure, not an infinite skeleton.
const syncFailed = computed(() => !!props.tokenBalance?.syncFailure && !props.tokenBalance?.isUpdating)
</script>

<template>
	<!-- Space calls `navigate` with no `.prevent`: vue-router's guardEvent refuses an event whose
	     default is already prevented, and `navigate` prevents it itself when it navigates. A pick
	     row is a native button, which Space and Enter activate on their own. -->
	<RouterLink v-if="tokenBalance" :to="`/popup/tokens/${token?.id}`" custom v-slot="{ href, navigate }">
		<component
			:is="pickPrefix ? 'button' : 'a'"
			v-bind="pickPrefix ? pickAttrs : { href, 'data-testid': 'tokens-card' }"
			:class="[$style.row, $style.link, pickPrefix && $style.pick, selected && $style.selected]"
			@click="pickPrefix ? emit('pick', token.id) : navigate($event)"
			@keydown.space="pickPrefix || navigate($event)"
		>
			<Flex direction="column" gap="2">
				<span :class="$style.symbol" data-testid="token-symbol" :data-symbol="token.symbol">
					{{ dashIfBlank(token.symbol) }}
				</span>
				<span v-if="isFlagged" :data-testid="pickPrefix ? `${pickPrefix}-flagged` : 'token-flagged'" :class="$style.flagged">Flagged as a scam</span>
				<span v-else-if="fiatLabel" data-testid="token-fiat" :class="[$style.fiat, $style.fiat_figure]">{{ fiatLabel }}</span>
				<span v-else data-testid="token-name" :class="$style.fiat">{{ dashIfBlank(token?.name) }}</span>
			</Flex>

			<Flex
				v-if="isInitialSync && !syncFailed && !isMalformed"
				direction="column"
				align="end"
				justify="center"
				gap="2"
				data-testid="token-balance-loading"
				aria-busy="true"
				:class="$style.loading_block"
			>
				<Skeleton :width="64" :height="13" />
				<Skeleton :width="92" :height="11" />
			</Flex>
			<Flex v-else direction="column" align="end" gap="2">
				<span data-testid="token-amount" :class="[$style.amount, syncFailed && $style.amount_stale]" :data-malformed="isMalformed || undefined">{{ totalBalance || 0 }}</span>
				<span v-if="!isMalformed" :class="$style.detail">
					<span :class="$style.icon_private"><Icon name="private" size="12" /></span>
					{{ privateFormatted }}
					<span :class="$style.pub_group">
						<span :class="$style.icon_public"><Icon name="public" size="12" /></span>
						{{ publicFormatted }}
					</span>
				</span>
				<span v-if="syncFailed" :class="$style.failed_text" data-testid="token-balance-failed">
					Couldn't refresh
				</span>
			</Flex>
		</component>
	</RouterLink>

	<Flex v-if="newToken" align="center" justify="between" :class="[$style.row, $style.minting]">
		<Flex direction="column" gap="2">
			<span :class="$style.symbol">{{ newToken.symbol }}</span>
			<span :class="$style.type_label">MINTING...</span>
		</Flex>
		<Spinner size="14" color="--txt-tertiary" />
	</Flex>
</template>

<style module>
.row {
	display: flex;
	align-items: center;
	justify-content: space-between;

	padding: 8px 0;
	text-decoration: none;
}

.link {
	user-select: none;
	cursor: pointer;
	transition: background 0.2s var(--bezier);

	&:hover,
	&:focus-visible {
		background: var(--nulo-surface-low);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

/* A picker's option spans the sheet: the fill and bar reach past the text on both sides. */
.pick {
	width: calc(100% + 16px);
	margin: 0 -8px;
	padding: 8px;
	background: transparent;
	color: inherit;
	text-align: left;
}

.selected {
	background: var(--nulo-surface-low);
	box-shadow: inset 2px 0 0 var(--nulo-accent);
}

.minting {
	opacity: 0.5;
	pointer-events: none;
}

/* The symbol and an unpriced row's name are contract-supplied: clipped so a hostile string cannot
   push the balance off the row. */
.symbol {
	composes: type--row-title from global;
	font-size: 14px;
	color: var(--txt-primary);

	max-width: 160px;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.type_label {
	composes: type--caption from global;
	color: var(--nulo-secondary);
}

.amount {
	composes: type--amount-row from global;
	color: var(--txt-primary);
}

.fiat {
	composes: type--fiat from global;
	font-size: 13px;
	color: var(--nulo-secondary);

	max-width: 160px;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

/* A priced figure wraps rather than hide digits: the row grows only when it does not fit. Its cap is
 * wider than a name's, and `anywhere` keeps that cap from raising the column's minimum width. */
.fiat_figure {
	max-width: 190px;
	white-space: normal;
	overflow-wrap: anywhere;
}

/* --txt-danger passes AA in both themes; --red does not on the light one. */
.flagged {
	composes: type--caption from global;
	color: var(--txt-danger);
}

.detail {
	composes: type--meta from global;
	color: var(--nulo-secondary);

	display: inline-flex;
	align-items: center;
	gap: 3px;
}

/* Keep in step with BalanceView's breakdown; the glyph paints in the span's colour. */
.icon_private {
	display: inline-flex;
	color: var(--nulo-accent);
}

.icon_public {
	display: inline-flex;
	color: var(--nulo-secondary);
}

.pub_group {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	margin-left: 6px;
}

.loading_block {
	composes: loading_block from "./token-row.module.css";
}

/* Last projection failed: keep the last-known amount visible, dimmed (the
   GasBalanceCard stale vocabulary), with the reason underneath. */
.amount_stale {
	opacity: 0.55;
}

.failed_text {
	composes: type--caption from global;
	color: var(--txt-danger);
}
</style>
