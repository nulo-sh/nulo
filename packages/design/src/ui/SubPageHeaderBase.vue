<script setup lang="ts">
/** Vendor */
import { type PropType, useTemplateRef } from "vue"

/** Components */
import Flex from "../core/Flex.vue"
import MaterialIcon from "../core/MaterialIcon.vue"
import type { TextColorName } from "../color-names"

// Router-free base: emits `back` instead of touching the router. The extension wrapper owns the
// history policy (`window.history.length > 1 ? router.back() : backTo ?? "/popup/general"`).
defineEmits<{ back: [] }>()
defineProps({
	title: {
		type: String,
		required: false,
		default: "",
	},
	showBack: {
		type: Boolean,
		default: true,
	},
	leadingIcon: {
		type: String,
		required: false,
	},
	leadingIconColor: {
		type: String as PropType<TextColorName>,
		default: "secondary",
	},
})
const titleEl = useTemplateRef<HTMLSpanElement>("titleEl")
/** Focuses the default title; a no-op under a `title` slot or with no title. */
defineExpose({ focusTitle: () => titleEl.value?.focus() })
</script>

<template>
	<Flex align="center" justify="between" gap="12" :class="$style.wrapper">
		<button
			v-if="showBack"
			@click="$emit('back')"
			:class="$style.back_btn"
			type="button"
			aria-label="Back"
			data-testid="subpage-back"
		>
			<MaterialIcon name="arrow_back" :size="22" color="primary" />
		</button>
		<div v-else :class="$style.back_spacer" />

		<Flex align="center" justify="center" gap="8" :class="$style.title_wrapper">
			<slot name="title">
				<MaterialIcon v-if="leadingIcon && title" :name="leadingIcon" :size="18" :color="leadingIconColor" />
				<span v-if="title" ref="titleEl" tabindex="-1" :class="$style.title">{{ title }}</span>
			</slot>
		</Flex>

		<div :class="$style.trailing">
			<slot name="trailing" />
		</div>
	</Flex>
</template>

<style module>
.wrapper {
	position: sticky;
	top: 0;
	z-index: 10;

	padding: 0 24px;
	min-height: 56px;

	background: var(--app-bg);
}

.back_btn {
	display: flex;
	align-items: center;
	justify-content: center;

	width: 40px;
	height: 40px;

	background: transparent;
	border: none;
	cursor: pointer;

	flex-shrink: 0;

	transition: background 0.2s var(--bezier);

	&:hover {
		background: color-mix(in srgb, var(--nulo-accent) 8%, transparent);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.back_spacer {
	width: 40px;
	flex-shrink: 0;
}

.title_wrapper {
	flex: 1;
	min-width: 0;
}

.title {
	composes: type--title-page from global;
	color: var(--txt-primary);

	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	/* A focus target, not a control: no ring. */
	&:focus {
		outline: none;
	}
}

.trailing {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 4px;
	min-width: 40px;
	flex-shrink: 0;
}
</style>
