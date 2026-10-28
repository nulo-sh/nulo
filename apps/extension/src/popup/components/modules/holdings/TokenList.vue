<script setup lang="ts">
/**
 * The full token list, presentational: the host owns the clients and hands in rows, prices, the
 * dust threshold and the pinned set; the list owns its search, sort and fold, reset on every mount.
 */
import type { PropType } from "vue"
import { computed, ref, useId } from "vue"
import { SectionLabel } from "@nulo/design"
import ListStatusMessage from "@/components/composite/ListStatusMessage.vue"
import SearchField from "@/components/composite/SearchField.vue"
import TokenCard from "@/popup/components/modules/general/TokenCard.vue"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { usdThresholdToMicro } from "@/utils/incoming-dust"
import { stringCompare, trimAddress } from "@/utils/string"
import { foldLabel, isHiddenHolding } from "@/utils/token-fold"
import { type OrderCtx, type OrderableRow, classifyRow, orderTokenRows } from "@/utils/token-order"
import { matchesQuery } from "@/utils/token-search"

/** `id` keys the balance row; a pick names the token, `token.id`. */
type Row = OrderableRow & { id: number | string; token: { id: number | string } }
// Callbacks receive the caller's own row type, so a `FiatOf<TokenBalanceInfo>` fits without a cast.
// biome-ignore lint/suspicious/noExplicitAny: variance escape hatch at the prop boundary; the template only reads OrderableRow fields.
type RowFn<R> = (tb: any) => R

const emit = defineEmits<{ addToken: [address: string]; pick: [tokenId: number | string] }>()
const props = defineProps({
	rows: { type: Array as PropType<Row[]>, required: true },
	testidPrefix: { type: String, default: "holdings" },
	label: { type: String, default: "All holdings" },
	placeholder: { type: String, default: "Search tokens" },
	sortable: { type: Boolean, default: true },
	/** Rows become options that emit `pick`; `selectedId` marks the current token. */
	selectable: { type: Boolean, default: false },
	selectedId: { type: [Number, String], default: undefined },
	/** Whether the signed list flags a pasted address no row holds. */
	isFlagged: { type: Function as PropType<(address: string) => boolean>, default: () => false },
	pinnedContracts: { type: Object as PropType<ReadonlySet<string>>, default: () => new Set<string>() },
	fiatOf: { type: Function as PropType<RowFn<bigint | undefined>>, required: true },
	/** Fresh USD rate per row for the dust fold; absent → the fold hides empties only. */
	usdRateOf: { type: Function as PropType<RowFn<number | undefined>>, default: () => () => undefined },
	dustThresholdUsd: { type: Number, default: 0 },
})

const query = ref("")
const sort = ref<"value" | "name">("value")
const showHidden = ref(false)

const ctx = computed<OrderCtx<Row>>(() => ({ pinnedContracts: props.pinnedContracts, fiatOf: props.fiatOf }))
const thresholdMicro = computed(() => usdThresholdToMicro(props.dustThresholdUsd))

const matching = computed(() => props.rows.filter((tb) => matchesQuery(tb.token, query.value)))

/** Value order comes from the shared comparator; name order is plain, with pins still first. */
const ordered = computed(() => {
	if (sort.value === "value") return orderTokenRows(matching.value, ctx.value)
	return [...matching.value].sort((a, b) => {
		const pa = classifyRow(a, ctx.value) === "pinned"
		const pb = classifyRow(b, ctx.value) === "pinned"
		if (pa !== pb) return pa ? -1 : 1
		return stringCompare(a.token.name, b.token.name)
	})
})

const partition = computed(() => {
	const pinned: Row[] = []
	const rest: Row[] = []
	const hidden: Row[] = []
	let empty = 0
	for (const tb of ordered.value) {
		if (classifyRow(tb, ctx.value) === "pinned") {
			pinned.push(tb)
		} else if (isHiddenHolding(tb, { ctx: ctx.value, usdRate: props.usdRateOf(tb), thresholdMicro: thresholdMicro.value })) {
			hidden.push(tb)
			if (classifyRow(tb, ctx.value) === "empty") empty += 1
		} else {
			rest.push(tb)
		}
	}
	return { pinned, rest, hidden, empty }
})

const foldText = computed(() =>
	foldLabel({
		hidden: partition.value.hidden.length,
		empty: partition.value.empty,
		dust: partition.value.hidden.length - partition.value.empty,
		thresholdUsd: props.dustThresholdUsd,
	}),
)
const showDivider = computed(() => partition.value.pinned.length > 0 && partition.value.rest.length > 0)
/** A pasted address no row matches. Stricter than the New token popup's hex check: a value that is
 *  no curve point gets the no-results line, never an add offer. */
const addCandidate = computed(() => {
	const q = query.value.trim()
	return matching.value.length === 0 && isValidAztecAddress(q) ? q : undefined
})
const addFlagged = computed(() => addCandidate.value !== undefined && props.isFlagged(addCandidate.value))
const noResults = computed(() => query.value.trim() !== "" && matching.value.length === 0)
const visibleCount = computed(() => matching.value.length)

const tid = (suffix: string) => `${props.testidPrefix}-${suffix}`
const addFlagId = useId()
const addNoteId = useId()
const rowProps = (tb: Row) =>
	props.selectable
		? { pickPrefix: props.testidPrefix, selected: tb.token.id === props.selectedId, onPick: () => emit("pick", tb.token.id) }
		: {}

const toggleSort = () => {
	sort.value = sort.value === "value" ? "name" : "value"
}
</script>

<template>
	<Flex direction="column" gap="12">
		<div :class="$style.sticky">
			<SearchField v-model="query" :placeholder :testid="tid('search')" />
		</div>

		<Flex align="end" justify="between">
			<SectionLabel :label :count="visibleCount" :countTestid="tid('count')" />
			<button v-if="sortable" type="button" @click="toggleSort" :data-testid="tid('sort')" :data-sort="sort" :class="$style.sort">
				{{ sort === "value" ? "BY VALUE" : "A–Z" }}
			</button>
		</Flex>

		<Flex direction="column" :class="$style.list">
			<template v-if="addCandidate">
				<Button
					wide
					variant="secondary"
					:data-testid="tid('add-token')"
					:aria-describedby="[addFlagged && addFlagId, $slots['add-note'] && addNoteId].filter(Boolean).join(' ') || undefined"
					@click="emit('addToken', addCandidate)"
				>
					<span>Add token <span class="type--meta" :data-testid="tid('add-token-address')">{{ trimAddress(addCandidate, 4, 2, "…") }}</span></span>
				</Button>
				<span v-if="addFlagged" :id="addFlagId" :data-testid="tid('add-token-flagged')" :class="$style.add_flagged">Flagged as a scam</span>
				<span v-if="$slots['add-note']" :id="addNoteId" :class="$style.add_note"><slot name="add-note" /></span>
			</template>
			<ListStatusMessage v-else-if="noResults" variant="no-results" :testid="tid('no-results')" />
			<template v-else>
				<TokenCard v-for="tb in partition.pinned" :key="tb.id" :tokenBalance="tb" v-bind="rowProps(tb)" />
				<div v-if="showDivider" :class="$style.divider" data-testid="token-list-divider" />
				<TokenCard v-for="tb in partition.rest" :key="tb.id" :tokenBalance="tb" v-bind="rowProps(tb)" />
				<button
					v-if="foldText"
					type="button"
					@click="showHidden = !showHidden"
					:data-testid="tid('fold')"
					:data-open="showHidden || undefined"
					:class="$style.fold"
				>
					<span>{{ foldText }}</span>
					<span :class="$style.fold_action">{{ showHidden ? "hide" : "show" }}</span>
				</button>
				<template v-if="showHidden">
					<TokenCard v-for="tb in partition.hidden" :key="tb.id" :tokenBalance="tb" v-bind="rowProps(tb)" />
				</template>
			</template>
		</Flex>
	</Flex>
</template>

<style module>
.sticky {
	position: sticky;
	top: 0;
	z-index: 2;

	padding: 4px 0 6px;
	background: var(--token-list-bg, var(--app-bg));
}

.sort {
	composes: type--label-section from global;
	height: 20px;
	padding: 0 8px;
	background: var(--nulo-surface-high);

	color: var(--txt-primary);
	cursor: pointer;
}

.list {
	gap: 1px;
}

.divider {
	border-top: 1px dashed var(--nulo-border);
	margin: 4px 0;
}

.add_flagged {
	composes: type--caption from global;
	margin-top: 8px;
	color: var(--txt-danger);
}

.add_note {
	composes: type--body from global;
	margin-top: 8px;
	color: var(--txt-tertiary);
}

.fold {
	composes: type--label-section from global;
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;

	padding: 10px 0;
	border-top: 1px dashed var(--nulo-border);
	background: transparent;
	cursor: pointer;
	text-align: left;

	color: var(--nulo-secondary);

	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--nulo-accent);
	}
}

.fold_action {
	color: var(--nulo-secondary);
}
</style>
