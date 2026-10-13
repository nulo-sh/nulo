<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
import { computed, type PropType } from "vue"
import type { TextColorName } from "../color-names"
import type { TextAlign } from "../layout-names"
import { type TypeRole, typeRoleNames } from "../tokens"

const props = defineProps({
	// Validated at run time too: most callers are SFCs without `lang="ts"`, which vue-tsc skips.
	variant: {
		type: String as PropType<TypeRole>,
		validator: (value: string) => (typeRoleNames as readonly string[]).includes(value),
	},
	// Line-height is an open scale (no token union); the class is `lh--${height}`.
	height: {
		type: String,
		default: "100",
	},
	align: {
		type: String as PropType<TextAlign>,
	},
	color: {
		type: String as PropType<TextColorName>,
	},
	noWrap: {
		type: Boolean,
	},
	selectable: {
		type: Boolean,
		default: false,
	},
})

const classes = computed(() => {
	const flexClasses = []

	if (props.variant) {
		flexClasses.push(`type--${props.variant}`)
	}
	if (props.height) {
		flexClasses.push(`lh--${props.height}`)
	}
	if (props.align) {
		flexClasses.push(`ta--${props.align}`)
	}
	if (props.color) {
		flexClasses.push(`color--${props.color}`)
	}
	if (props.noWrap) {
		flexClasses.push("no-wrap")
	}
	if (props.selectable) {
		flexClasses.push("selectable")
	}

	return flexClasses
})
</script>

<template>
	<span :class="[classes]">
		<slot />
	</span>
</template>
