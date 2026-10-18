<script setup>
/**
 * The "Tx hash" row of a detail page's Details box: the hash opens the explorer's page when the page
 * has an explorer URL, and copies on a click when it has none (explorer None, or no explorer covers
 * the chain). The page owns the copy, so each page keeps its own confirmation.
 */

/** Utils */
import { endsSelection } from "@/utils/selection"
import { trimAddress } from "@/utils/string"

defineProps({
	hash: { type: String, required: true },
	explorerUrl: { type: String, default: null },
	linkTestid: { type: String, default: undefined },
	copyTestid: { type: String, default: undefined },
})

const emit = defineEmits(["copy"])
</script>

<template>
	<Flex wide justify="between" align="center">
		<span :class="$style.detail_key">Tx hash</span>
		<a
			v-if="explorerUrl"
			:href="explorerUrl"
			target="_blank"
			rel="noopener noreferrer"
			:data-testid="linkTestid"
			:class="[$style.detail_value_mono, $style.detail_link]"
		>{{ trimAddress(hash, 6, 4) }}</a>
		<span
			v-else
			@click="endsSelection($event) || emit('copy', hash)"
			:data-testid="copyTestid"
			:class="[$style.detail_value_mono, 'copyable']"
		>{{ trimAddress(hash, 6, 4) }}</span>
	</Flex>
</template>

<style module>
.detail_key {
	composes: detail_key from "../../../pages/detail-page.module.css";
}

.detail_value_mono {
	composes: type--meta from global;
	color: var(--txt-primary);
}

.detail_link {
	composes: detail_link from "../../../pages/detail-page.module.css";
}
</style>
