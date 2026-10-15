<script setup lang="ts">
/** The stale-network screens' stroke icons, drawn as the layout mockups draw them. Decorative: the
 *  text beside each one carries its meaning. */
type IconName = "reset" | "warning" | "pause" | "no-signal" | "check" | "cross" | "swap" | "lock"

defineProps<{
	name: IconName
	size: number
	/** A colour token, e.g. `--txt-warning`; the text colour when absent. */
	color?: string
}>()

const PATHS: Record<IconName, { d: string[]; width: number }> = {
	reset: {
		d: ["M3 12a9 9 0 0 1 15.5-6.2L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15.5 6.2L3 16", "M3 21v-5h5"],
		width: 2,
	},
	warning: { d: ["M12 3l9 16H3z", "M12 10v4", "M12 17v.5"], width: 2 },
	pause: { d: ["M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0", "M10 9v6", "M14 9v6"], width: 2 },
	"no-signal": { d: ["M2 8.5a15 15 0 0 1 20 0", "M5.5 12a10 10 0 0 1 13 0", "M9 15.5a5 5 0 0 1 6 0", "M3 3l18 18"], width: 2 },
	check: { d: ["M4 12l5 5L20 6"], width: 2.5 },
	cross: { d: ["M6 6l12 12", "M18 6L6 18"], width: 2.5 },
	swap: { d: ["M5 8h13l-3-3", "M19 16H6l3 3"], width: 2.5 },
	lock: { d: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"], width: 2 },
}
</script>

<template>
	<svg
		:width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="none"
		:stroke="color ? `var(${color})` : 'currentColor'"
		:stroke-width="PATHS[name].width"
		aria-hidden="true"
		:class="$style.icon"
	>
		<path v-for="d in PATHS[name].d" :key="d" :d="d" />
	</svg>
</template>

<style module>
.icon {
	flex: none;
}
</style>
