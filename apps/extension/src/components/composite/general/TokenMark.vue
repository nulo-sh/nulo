<script setup lang="ts">
/** Utils */
import { tokenInitials } from "@/utils/string"

/** Macros */
const props = defineProps<{
	symbol: string
	/** A `data:` picture from the signed list, drawn only as an image. */
	icon?: string
	size: 16 | 20 | 32 | 36
	badge: boolean
}>()

/** Reactive state */
/** The picture failed to decode; a new one is tried afresh. */
const failed = ref(false)
const kind = computed(() => (props.icon && !failed.value ? "logo" : "initials"))
const initials = computed(() => tokenInitials(props.symbol, props.size))
const INITIALS_CLASS = { 16: "initials_10", 20: "initials_10", 32: "initials_12", 36: "initials_13" } as const

/** Watchers */
watch(
	() => props.icon,
	() => {
		failed.value = false
	},
)
</script>

<template>
	<!-- Decorative: the symbol beside it is the name a screen reader reads. -->
	<span
		data-testid="token-mark"
		:data-kind="kind"
		aria-hidden="true"
		:class="[$style.mark, kind === 'initials' && $style.disc]"
		:style="{ width: `${size}px`, height: `${size}px` }"
	>
		<img v-if="kind === 'logo'" :src="icon" alt="" draggable="false" data-testid="token-mark-logo" :class="$style.logo" @error="failed = true" />
		<span v-else :class="[$style.initials, $style[INITIALS_CLASS[size]]]">{{ initials }}</span>
		<Icon v-if="badge" name="warning" :size="size < 24 ? 8 : 10" color="red" :class="$style.badge" />
	</span>
</template>

<style module>
.mark {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	user-select: none;
}

.disc {
	border-radius: 50%;
	background: var(--nulo-surface-high);
}

/* The issuer's file as published: no clip, background or filter. */
.logo {
	display: block;
	width: 100%;
	height: 100%;
}

/* A contract-supplied symbol may hold a letter wider than the disc; the badge sits outside it. */
.initials {
	max-width: 100%;
	overflow-x: clip;
}

.initials_10 {
	composes: type--row-title from global;
	font-size: 10px;
	line-height: 1;
	color: var(--txt-primary);
}

.initials_12 {
	composes: type--row-title from global;
	font-size: 12px;
	line-height: 1;
	color: var(--txt-primary);
}

.initials_13 {
	composes: type--row-title from global;
	font-size: 13px;
	line-height: 1;
	color: var(--txt-primary);
}

.badge {
	position: absolute;
	top: -4px;
	right: -4px;

	box-sizing: content-box;
	background: var(--app-bg);
	padding: 1px;
}
</style>
