<script setup>
/** Components */
import { SectionLabel } from "@nulo/design"

const props = defineProps({
	/** `GetStartedStep[]` from `@/utils/get-started`, in the drawn order. */
	steps: { type: Array, required: true },
	canHide: { type: Boolean, required: true },
})
const emit = defineEmits(["select", "hide"])

const ROWS = {
	phrase: { title: "Save your recovery phrase", description: "The 24 words that restore this wallet" },
	backup: { title: "Back up this wallet", description: "Sync your passkey or save a backup file" },
	aztec: { title: "How Aztec works", value: "1 min" },
	feeJuice: { title: "Get Fee Juice" },
	presto: { title: "Make proofs faster", value: "Optional" },
}

const next = computed(() => props.steps.find((step) => !step.done))
const doneCount = computed(() => props.steps.filter((step) => step.done).length)
</script>

<template>
	<Flex direction="column" gap="12" data-testid="get-started">
		<Flex align="end" justify="between">
			<SectionLabel label="Get started" />
			<Flex align="end" gap="16">
				<span v-if="steps.length > 1" role="status" :class="$style.count" data-testid="get-started-count">{{ doneCount }} of {{ steps.length }} done</span>
				<button v-if="canHide" type="button" :class="$style.hide" data-testid="get-started-hide" @click="emit('hide')">Hide</button>
			</Flex>
		</Flex>
		<!-- The list carries each step's position to assistive tech, so the drawn number and check are hidden from it. -->
		<ItemsContainer role="list">
			<SettingItem
				v-for="(step, index) in steps"
				:key="step.item"
				role="listitem"
				:aria-current="step === next ? 'step' : undefined"
				:title="ROWS[step.item].title"
				:description="step.done ? undefined : ROWS[step.item].description"
				:value="step.done ? undefined : ROWS[step.item].value"
				:chevron="!step.done"
				:class="step.done && $style.done"
				:data-testid="`get-started-${step.item}`"
				:data-done="step.done"
				v-on="step.done ? {} : { click: () => emit('select', step.item) }"
			>
				<template #icon>
					<span aria-hidden="true" :class="[$style.mark, step === next && $style.next, step.done && $style.checked]">
						<Icon v-if="step.done" name="check" :size="14" />
						<template v-else>{{ index + 1 }}</template>
					</span>
				</template>
				<template v-if="step.done" #right>
					<Text variant="value" color="tertiary">Done</Text>
				</template>
			</SettingItem>
		</ItemsContainer>
	</Flex>
</template>

<style module>
.count {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.hide {
	composes: type--label-section from global;
	padding: 0;
	border: none;
	background: transparent;
	color: var(--nulo-secondary);
	text-decoration: underline;
	text-underline-offset: 4px;
	cursor: pointer;
	transition: color 0.2s var(--bezier);
}

.hide:hover {
	color: var(--txt-primary);
}

.hide:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}

.mark {
	composes: type--data-lead from global;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 24px;
	height: 24px;
	border: 1px solid var(--nulo-track);
	color: var(--txt-secondary);
}

.next {
	border-color: var(--nulo-accent);
	background: var(--nulo-accent);
	color: var(--txt-inverse);
}

.checked {
	border-color: var(--nulo-border);
	color: var(--nulo-accent);
}

.done :global(.type--row-title) {
	color: var(--txt-tertiary);
	text-decoration: line-through;
	text-decoration-thickness: 1px;
}
</style>
