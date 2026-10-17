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

// The set's 2.5-unit stroke, thickened below 14.4 px so it never renders under 1.5 px.
const strokeWidth = computed(() => Math.max(2.5, 36 / Number(props.size)))

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
		:stroke-width="strokeWidth"
		stroke-linecap="square"
		stroke-linejoin="miter"
	>
		<path v-for="d in glyph.s" :key="`s${d}`" :d="d" fill="none" />
		<path v-for="d in glyph.f" :key="`f${d}`" :d="d" stroke="none" fill-rule="evenodd" />
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
