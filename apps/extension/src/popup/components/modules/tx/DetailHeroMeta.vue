<script setup>
/**
 * A detail page's hero line. Without an explorer URL it offers `hash` as a copy, which the page
 * performs so each keeps its own confirmation; without `hash` either, it offers neither.
 */
defineProps({
	time: { type: String, default: null },
	explorerUrl: { type: String, default: null },
	explorerName: { type: String, required: true },
	hash: { type: String, default: null },
	linkTestid: { type: String, default: undefined },
	copyTestid: { type: String, default: undefined },
})

const emit = defineEmits(["copy"])
</script>

<template>
	<Flex align="center" justify="center" gap="8" :class="$style.hero_meta">
		<span v-if="time" :class="$style.tx_time">{{ time }}</span>
		<span v-if="time && (explorerUrl || hash)" :class="$style.meta_sep">·</span>
		<a
			v-if="explorerUrl"
			:href="explorerUrl"
			target="_blank"
			rel="noopener noreferrer"
			@click.stop
			:class="$style.hero_link"
			:data-testid="linkTestid"
		>
			<span>View on {{ explorerName }}</span>
			<Icon name="open" size="10" color="tertiary" />
		</a>
		<span
			v-else-if="hash"
			@click="emit('copy', hash)"
			:class="[$style.hero_link, 'copyable']"
			:data-testid="copyTestid"
		>
			<span>Copy hash</span>
			<Icon name="copy" size="10" color="tertiary" />
		</span>
	</Flex>
</template>

<style module>
.hero_meta {
	composes: hero_meta from "../../../pages/detail-page.module.css";
}

.tx_time {
	composes: tx_time from "../../../pages/detail-page.module.css";
}

.meta_sep {
	composes: meta_sep from "../../../pages/detail-page.module.css";
}

.hero_link {
	composes: hero_link from "../../../pages/detail-page.module.css";
}
</style>
