<script setup>
/**
 * A settings row holding its own control. Its single root takes the page's `align`, `gap`, testid
 * and `v-settings-row`.
 */
defineProps({
	title: { type: String, required: true },
	description: { type: String, required: true },
	titleTestid: { type: String, default: undefined },
	descriptionTestid: { type: String, default: undefined },
})
</script>

<template>
	<Flex justify="between">
		<Flex direction="column" gap="6">
			<Text :class="$style.title" color="primary" :data-testid="titleTestid">{{ title }}</Text>
			<Text variant="caption" color="tertiary" :data-testid="descriptionTestid">{{ description }}</Text>
		</Flex>

		<slot />
	</Flex>
</template>

<style module>
.title {
	composes: control_title from "./settings-row.module.css";
}
</style>
