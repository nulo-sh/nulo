<script setup>
/** A roving tablist: one Tab stop, and ←/→ switch the level and move focus to it. */
import { nextTick } from "vue"

const PRIORITY_LEVELS = [
	{ value: "normal", label: "Normal" },
	{ value: "fast", label: "Fast" },
	{ value: "urgent", label: "Urgent" },
]

const props = defineProps({
	modelValue: { type: String, default: "normal" },
})

const emit = defineEmits(["update:modelValue"])

const labelId = useId()
const tabs = {}

const onKeydown = (e) => {
	if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
	e.preventDefault()
	const at = PRIORITY_LEVELS.findIndex((level) => level.value === props.modelValue)
	const step = e.key === "ArrowRight" ? 1 : -1
	const next = PRIORITY_LEVELS[(at + step + PRIORITY_LEVELS.length) % PRIORITY_LEVELS.length].value
	emit("update:modelValue", next)
	nextTick(() => tabs[next]?.focus())
}
</script>

<template>
	<Flex direction="column" gap="8" :class="$style.detail_row">
		<span :id="labelId" :class="$style.fee_label">Priority</span>
		<div role="tablist" :aria-labelledby="labelId" :class="$style.priority_grid" @keydown="onKeydown">
			<button
				v-for="level in PRIORITY_LEVELS"
				:key="level.value"
				:ref="(el) => (tabs[level.value] = el ?? undefined)"
				type="button"
				role="tab"
				:aria-selected="modelValue === level.value"
				:tabindex="modelValue === level.value ? 0 : -1"
				@click="emit('update:modelValue', level.value)"
				:data-testid="`send-fee-priority-${level.value}`"
				:class="[$style.priority_btn, modelValue === level.value && $style.priority_active]"
			>
				{{ level.label }}
			</button>
		</div>
	</Flex>
</template>

<style module>
.detail_row {
	composes: detail_row from "./fee-shared.module.css";
}

.fee_label {
	composes: fee_label from "./fee-shared.module.css";
}

.priority_grid {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	gap: 8px;
}

.priority_btn {
	composes: type--label-section from global;
	padding: 6px 0;
	cursor: pointer;

	text-align: center;
	color: var(--nulo-secondary);

	background: transparent;
	border: 1px solid var(--nulo-border);

	transition: all 0.15s ease;

	/* The accent border marks the chosen level alone; a hovered one only tints. */
	&:hover {
		background: var(--nulo-surface-low);
	}

	/* Focus sits on the chosen level, so the ring is what tells a keyboard user they arrived. */
	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.priority_active {
	border-color: var(--nulo-accent);
	color: var(--txt-primary);
}
</style>
