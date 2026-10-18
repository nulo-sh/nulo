<script setup>
/**
 * A settings row that holds its own control: title and caption on the left, the default slot (a
 * toggle, a dropdown, a field) on the right. Its layout (`align`, `gap`), its testid and
 * `v-settings-row` are set where it is used and land on the root.
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
