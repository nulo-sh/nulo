<script setup lang="ts">
/** Presentation only: the page owns the request, which must run inside the click's own dispatch. */
const emit = defineEmits<{ allow: [] }>()
</script>

<template>
	<Banner variant="warning" direction="vertical" data-testid="presto-permission-row">
		<Text>Firefox needs your permission for Nulo to reach Presto.</Text>
		<div :class="$style.allow">
			<Button variant="primary" size="small" data-testid="presto-permission-allow" @click="emit('allow')">Allow</Button>
		</div>
	</Banner>
</template>

<style module>
.allow {
	margin-top: 8px;
}
</style>
