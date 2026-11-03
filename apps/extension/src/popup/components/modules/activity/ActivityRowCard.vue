<script setup>
/** A journal record no card can draw renders nothing. */
import TransactionCard from "./TransactionCard.vue"
import TransactionTerminalCard from "@/components/composite/activity/TransactionTerminalCard.vue"
import TransactionIncomingCard from "@/components/composite/activity/TransactionIncomingCard.vue"
import { activityRowRoute } from "@/utils/activity-rows"
import { buildJournalTerminalCardProps } from "@/utils/journal-state"
import { buildIncomingCardProps } from "@/utils/received-display"

const props = defineProps({
	/** `{ type: "tx", tx }`, `{ type: "incoming", inc }` or `{ type: "journal", op }`. */
	row: { type: Object, required: true },
	/** The current profile and chain's tokens: a row shows an amount only for a token in this list. */
	tokens: { type: Array, default: () => [] },
	tokenById: { type: Function, required: true },
	fiatLabel: { type: Function, required: true },
	/** Whether an incoming row's receipt is arriving now; judged when the row renders. */
	isArriving: { type: Function, default: undefined },
})

const terminalProps = computed(() =>
	props.row.type === "journal" ? buildJournalTerminalCardProps(props.row.op, { tokenById: props.tokenById, tokens: props.tokens }) : null,
)
</script>

<template>
	<TransactionCard v-if="row.type === 'tx'" :tx="row.tx" :tokens="tokens" :to="activityRowRoute(row)" />
	<TransactionIncomingCard
		v-else-if="row.type === 'incoming'"
		v-bind="buildIncomingCardProps(row.inc, tokens, fiatLabel)"
		:to="activityRowRoute(row)"
		:arriving="isArriving?.(row.inc) ?? false"
	/>
	<TransactionTerminalCard v-else-if="terminalProps" v-bind="terminalProps" :to="activityRowRoute(row)" />
</template>
