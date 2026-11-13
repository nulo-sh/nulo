<script setup lang="ts">
/** One press to fill the form with the last send to this person: its token, amount and arrival. */
import { refuseRepeatEnter } from "@/composables/usePopupEntity"

defineProps<{ words: string }>()
const emit = defineEmits<{ apply: [] }>()
</script>

<template>
	<button type="button" :class="$style.again" data-testid="send-again" @keydown.enter="refuseRepeatEnter" @click="emit('apply')">
		<Icon name="undo" size="14" aria-hidden="true" :class="$style.mark" />
		<span :class="$style.text">Same as last time: <span :class="$style.what">{{ words }}</span></span>
		<Icon name="forward" size="14" color="secondary" aria-hidden="true" :class="$style.mark" />
	</button>
</template>

<style module>
.again {
	composes: type--body from global;
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 10px;
	background: var(--nulo-surface-low);
	color: var(--txt-primary);
	border: 1px solid transparent;
	text-align: left;
	cursor: pointer;

	&:hover {
		border-color: var(--nulo-outline);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
	}
}

.mark {
	flex: none;
}

.text {
	flex: 1;
	min-width: 0;
}

.what {
	composes: type--value from global;
}
</style>
