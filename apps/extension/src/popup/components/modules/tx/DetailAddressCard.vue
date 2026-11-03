<script setup>
/**
 * One card of a detail page's From/To pair: the address, its label, and the explorer's link in the
 * corner. A card with an address copies it on a click that ends no selection; one without shows its
 * slot and stays static. The page owns the copy, so each page keeps its own confirmation.
 */
import AddressCardLink from "./AddressCardLink.vue"

/** Utils */
import { endsSelection } from "@/utils/selection"
import { trimAddress } from "@/utils/string"

const props = defineProps({
	label: { type: String, required: true },
	address: { type: String, default: undefined },
	addressTestid: { type: String, default: undefined },
	explorerUrl: { type: String, default: null },
	explorerName: { type: String, default: "" },
	linkTestid: { type: String, default: undefined },
})

const emit = defineEmits(["copy"])

const labelId = useId()
const hasAddress = computed(() => props.address !== undefined)
</script>

<template>
	<Flex
		wide
		direction="column"
		gap="4"
		:class="[$style.card, !hasAddress && $style.card_static]"
		@click="hasAddress && !endsSelection($event) && emit('copy', address)"
	>
		<AddressDisplay
			v-if="hasAddress"
			static
			:data-testid="addressTestid"
			lead
			:address="address"
			:formatter="(addr) => trimAddress(addr, 6, 4)"
		/>
		<slot v-else />
		<span :id="labelId" :class="$style.label">{{ label }}</span>
		<AddressCardLink
			v-if="explorerUrl"
			:href="explorerUrl"
			:label="`View on ${explorerName}`"
			:aria-describedby="labelId"
			:data-testid="linkTestid"
		/>
	</Flex>
</template>

<style module>
.card {
	composes: address_card from "../../../pages/detail-page.module.css";
}

/* Outranks shared card rules reintroduced by later-loaded detail chunks. */
.card.card_static {
	cursor: default;

	&:hover {
		background: transparent;
	}
}

.label {
	composes: caption from "../../../pages/detail-page.module.css";
}
</style>
