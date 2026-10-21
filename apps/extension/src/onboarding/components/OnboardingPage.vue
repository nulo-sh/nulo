<script setup lang="ts">
/**
 * Shared layout shell for every onboarding tab page. Owns the unified
 * 640 px max-width, the top margin, and the flex column that fills the shell.
 *
 * Renders a `<div>` (NOT `<main>`) — app.vue's `.shell` is already the
 * page's single `<main>` landmark; nesting another `<main>` would violate
 * HTML5 + WAI-ARIA-1.2. The test file asserts `tagName === 'DIV'` so a
 * future refactor can't silently re-introduce nested-`<main>`.
 */

const props = defineProps<{
	/** Centers the inner content + hero block. Used by welcome + done. */
	align?: "start" | "center"
	/** Inter-child gap in px. Default 32 px. */
	gap?: number
}>()

// `!== undefined` (not a truthy check) — otherwise `gap=0` silently collapses
// to the 32 px default.
const gapVar = computed(() => (props.gap !== undefined ? { "--onboarding-page-gap": `${props.gap}px` } : undefined))
</script>

<template>
	<div :class="[$style.page, align === 'center' && $style.center]" :style="gapVar">
		<slot />
	</div>
</template>

<style module>
.page {
	display: flex;
	flex-direction: column;
	width: 100%;
	max-width: 640px;
	margin: 24px auto 0;
	gap: var(--onboarding-page-gap, 32px);

	flex: 1;
}

.center {
	align-items: center;
}
</style>
