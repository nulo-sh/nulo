<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
import { computed, type CSSProperties, type PropType } from "vue"

import type { TextColorName } from "../color-names"
import { type Glyph, type GlyphName, glyphs } from "./glyphs"

const props = defineProps({
	name: { type: String as PropType<GlyphName>, required: true },
	size: { type: [String, Number], default: 16 },
	color: { type: String as PropType<TextColorName>, default: null },
	hoverColor: { type: String as PropType<TextColorName>, required: false },
	rotate: { type: [String, Number], default: 0 },
	loading: { type: Boolean, default: false },
})

// A glyph paints only through `color`: the root sets stroke and fill to currentColor.
const glyph = computed<Glyph>(() => (Object.hasOwn(glyphs, props.name) ? glyphs[props.name] : {}))
// One element strokes every path: an element's stroke is painted once, so where two of a glyph's
// strokes cross, a translucent colour is not laid down twice. Each path opens with an absolute M.
const strokes = computed(() => glyph.value.s?.join(" "))

const styles = computed<CSSProperties>(() => ({
	minWidth: `${props.size}px`,
	minHeight: `${props.size}px`,
	transformBox: "view-box",
	transformOrigin: "center center",
	transform: props.rotate ? `rotate(${props.rotate}deg)` : "",
}))

const hoverColorVar = computed(() => `var(--txt-${props.hoverColor})`)
</script>

<template>
	<svg
		viewBox="0 0 24 24"
		:width="size"
		:height="size"
		:style="styles"
		:class="[color && `color--${color}`, hoverColor && $style.hovered, loading && $style.loading]"
		role="img"
		fill="currentColor"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path v-if="strokes" :d="strokes" fill="none" />
		<path v-for="d in glyph.f" :key="`f${d}`" :d="d" stroke="none" />
	</svg>
</template>

<style module>
.hovered {
	transition: all 0.3s var(--bezier);

	&:hover {
		color: v-bind(hoverColorVar);
	}
}

.loading {
	animation: skeleton 1s ease-in-out infinite;
}

@keyframes skeleton {
	0% {
		opacity: 1;
	}

	50% {
		opacity: 0.5;
	}

	100% {
		opacity: 1;
	}
}
</style>
