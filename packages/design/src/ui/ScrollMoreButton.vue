<script setup lang="ts">
/**
 * A round down chevron that says a scroll area holds more below: a pointer shortcut, kept out of
 * the Tab path, that never takes focus from the field a person is in. It nudges on its first
 * show only. The host places it and decides where a press scrolls.
 */
import { ref, watch } from "vue"

import Icon from "../core/Icon.vue"

defineOptions({ inheritAttrs: false })

const props = defineProps({
	shown: { type: Boolean, default: false },
})
const emit = defineEmits<{ press: [] }>()

const nudging = ref(false)
let nudged = false
watch(
	() => props.shown,
	(shown) => {
		if (!shown || nudged) return
		nudged = true
		nudging.value = true
	},
	{ immediate: true },
)
</script>

<template>
	<Transition
		:enter-from-class="$style.out"
		:leave-to-class="$style.out"
		:enter-active-class="$style.fade"
		:leave-active-class="`${$style.fade} ${$style.leaving}`"
	>
		<button
			v-if="shown"
			v-bind="$attrs"
			type="button"
			tabindex="-1"
			aria-label="Show more below"
			:class="[$style.more, nudging && $style.nudge]"
			@mousedown.prevent
			@animationend="nudging = false"
			@click="emit('press')"
		>
			<Icon name="chevron" :size="18" :rotate="90" color="primary" />
		</button>
	</Transition>
</template>

<style module>
.more {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	padding: 0;
	margin: 0;
	border-radius: 50%;
	background: var(--app-bg);
	border: 1px solid var(--nulo-border);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
	cursor: pointer;
	transition:
		transform 0.18s ease,
		box-shadow 0.18s ease;

	&:hover {
		transform: translateY(-3px);
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.nudge {
	animation: nudge 0.6s ease-in-out 2;
}

@keyframes nudge {
	0%,
	100% {
		transform: translateY(0);
	}
	45% {
		transform: translateY(6px);
	}
}

.fade {
	transition: opacity 0.2s ease;
}

/* A click during the fade-out reaches the content underneath. */
.leaving {
	pointer-events: none;
}

.out {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.more:hover {
		transform: none;
	}
	.more, .fade {
		transition: none;
	}
	.nudge {
		animation: none;
	}
}

:global(.noanimations) .more:hover {
	transform: none;
}

:global(.noanimations) .more, :global(.noanimations) .fade {
	transition: none;
}

:global(.noanimations) .nudge {
	animation: none;
}
</style>
