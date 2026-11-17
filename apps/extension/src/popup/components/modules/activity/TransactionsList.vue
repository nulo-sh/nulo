<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/**
 * Date-grouped activity list (Archives page). Rows are a discriminated union the parent merges:
 * `{ type: "tx", tx }`, `{ type: "journal", op }` and `{ type: "incoming", inc }`, each with a
 * `key` and a millisecond `sortKey` for ordering and date grouping.
 */
import { DateTime } from "luxon"
import ActivityRowCard from "./ActivityRowCard.vue"

const props = defineProps({
	rows: { type: Array, required: true },
	/** The current profile and chain's tokens: a mint, journal transfer or received row shows an
	 *  amount only for a token in this list. */
	tokens: { type: Array, default: () => [] },
	/** Whether an incoming row's receipt is arriving now; judged when the row renders. */
	isArriving: { type: Function, default: undefined },
	/** The page's price reading, which its in-flight cards read too. */
	fiatLabel: { type: Function, required: true },
	iconFor: { type: Function, required: true },
	isFlagged: { type: Function, required: true },
})

const groupedRows = computed(() => {
	if (!props.rows?.length) return []
	const groups = new Map()
	for (const row of props.rows) {
		const dateKey = DateTime.fromMillis(row.sortKey).toFormat("MMM d, yyyy").toUpperCase()
		if (!groups.has(dateKey)) {
			groups.set(dateKey, [])
		}
		groups.get(dateKey).push(row)
	}
	return Array.from(groups, ([date, rows]) => ({ date, rows }))
})

const tokensById = computed(() => new Map(props.tokens.map((t) => [t.id, t])))
const tokenById = (id) => tokensById.value.get(id)
</script>

<template>
	<Flex direction="column" gap="24">
		<Flex v-for="group in groupedRows" :key="group.date" direction="column" gap="10">
			<Flex align="center" gap="12" :class="$style.date_separator">
				<span :class="$style.date_label" data-testid="activity-date-label">{{ group.date }}</span>
				<div :class="$style.separator_line" />
			</Flex>

			<ActivityRowCard
				v-for="row in group.rows"
				:key="row.key"
				:row="row"
				:tokens="tokens"
				:tokenById="tokenById"
				:fiatLabel="fiatLabel"
				:iconFor="iconFor"
				:isFlagged="isFlagged"
				:isArriving="isArriving"
			/>
		</Flex>
	</Flex>
</template>

<style module>
.date_separator {
	padding-bottom: 2px;
}

.date_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
	flex-shrink: 0;
}

.separator_line {
	flex: 1;
	height: 1px;
	background: var(--nulo-border);
}
</style>
