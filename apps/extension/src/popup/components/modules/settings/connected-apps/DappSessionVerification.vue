<script setup>
import EmojiGrid from "@/components/composite/general/EmojiGrid.vue"

/**
 * Shared-secret verification block for the connected-app detail page.
 * Renders the emoji grid and the always-trust toggle. Emits
 * `toggle-trust` with the new value; parent persists it through the
 * service.
 */
const props = defineProps({
	emojis: { type: String, required: true },
	isTrusted: { type: Boolean, default: false },
})

const emit = defineEmits(["toggleTrust"])
</script>

<template>
	<Flex direction="column" gap="10" wide data-testid="connected-app-verification">
		<SectionLabel label="Connection check" />
		<Flex direction="column" align="center" wide>
			<EmojiGrid :emojis="emojis" />
		</Flex>
		<Text variant="body" color="tertiary" :style="{ lineHeight: '1.4' }">
			Emojis from the most recent connection. They should have matched what the app showed then.
		</Text>
		<Flex align="center" justify="between" gap="12" wide>
			<Flex direction="column" gap="4">
				<span :class="$style.setting_key">Skip this check next time</span>
				<span :class="$style.setting_sub">Only for this app on this network.</span>
			</Flex>
			<Toggle :modelValue="isTrusted" @update:modelValue="(v) => emit('toggleTrust', v)" />
		</Flex>
	</Flex>
</template>

<style module>
.setting_key {
	composes: type--label from global;
	color: var(--nulo-secondary);
}

.setting_sub {
	composes: type--caption from global;
	line-height: 1.4;
	color: var(--nulo-outline);
}
</style>
