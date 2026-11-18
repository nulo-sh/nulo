<script setup>
/**
 * A settings row holding its own control. Its single root takes the page's `align`, `gap`, testid
 * and `v-settings-row`. The slot receives `titleId`, the title's id, so a control can take the
 * visible title as its accessible name (`aria-labelledby`) and follow any change to it.
 */
defineProps({
	title: { type: String, required: true },
	description: { type: String, required: true },
	titleTestid: { type: String, default: undefined },
	descriptionTestid: { type: String, default: undefined },
})

const titleId = useId()
</script>

<template>
	<Flex justify="between">
		<Flex direction="column" gap="6">
			<Text :id="titleId" :class="$style.title" color="primary" :data-testid="titleTestid">{{ title }}</Text>
			<Text variant="caption" color="tertiary" :data-testid="descriptionTestid">{{ description }}</Text>
		</Flex>

		<slot :titleId="titleId" />
	</Flex>
</template>

<style module>
.title {
	composes: control_title from "./settings-row.module.css";
}
</style>
