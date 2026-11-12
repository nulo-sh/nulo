<script setup>
/**
 * Who pays the fee, as native radios: each payer the card offers with its glossary definition and
 * what it can spend. A row still loading, or one that cannot pay, cannot be chosen; the arrows skip
 * it, as they do any disabled radio.
 */
import { Skeleton } from "@nulo/design"
import { GLOSSARY } from "@/utils/glossary"
import { menuOrder } from "./fee-helpers"

const props = defineProps({
	modelValue: { type: Object, default: null },
	methods: { type: Array, required: true },
	/** The card is still reading what can pay. */
	pending: { type: Boolean, default: false },
})
const emit = defineEmits(["update:modelValue"])

const uid = Math.random().toString(36).slice(2, 8)
const labelId = `fee-payers-${uid}`
const group = ref(null)

/** Private Fee Juice first, then public, then the sponsors in the menu's order. */
const RANK = { private_fpc: 0, fj: 1, fpc: 2 }
const rows = computed(() => [...menuOrder(props.methods)].sort((a, b) => RANK[a.type] - RANK[b.type]))

const DEFINITION = {
	private_fpc: GLOSSARY["private-fee-juice"].definition,
	fj: GLOSSARY["public-fee-juice"].definition,
	fpc: GLOSSARY.sponsored.definition,
}

const keyOf = (m) => m.fpc?.id ?? m.type
const isChosen = (m) =>
	Boolean(props.modelValue) && props.modelValue.type === m.type && (m.type !== "fpc" || props.modelValue.fpc?.id === m.fpc?.id)
const isOff = (m) => Boolean(m.disabled || m.checking)

/** Focuses the chosen payer, else the first one that can be chosen. */
defineExpose({
	focus: () => {
		const radios = [...(group.value?.querySelectorAll("input") ?? [])]
		;(radios.find((r) => r.checked) ?? radios.find((r) => !r.disabled))?.focus()
	},
})
</script>

<template>
	<div
		ref="group"
		role="radiogroup"
		:aria-labelledby="labelId"
		:aria-busy="!modelValue && pending ? 'true' : undefined"
		:class="$style.group"
		data-testid="send-fee-payers"
		:data-fee-method="modelValue?.subtitle"
	>
		<span :id="labelId" :class="$style.key">Who pays the fee</span>
		<label
			v-for="m in rows"
			:key="keyOf(m)"
			:class="[$style.option, isChosen(m) && $style.chosen, isOff(m) && $style.off]"
			:data-testid="`send-fee-payer-${m.subtitle}-choice`"
			:data-fpc-id="m.fpc?.id"
		>
			<input
				type="radio"
				:name="labelId"
				:checked="isChosen(m)"
				:disabled="isOff(m)"
				:class="$style.radio"
				:data-testid="`send-fee-payer-${m.subtitle}`"
				:data-fpc-id="m.fpc?.id"
				:data-checking="m.checking ? 'true' : undefined"
				:data-verifying="m.verifying ? 'true' : undefined"
				@change="emit('update:modelValue', m)"
			/>
			<span :class="$style.main">
				<span :class="$style.title">{{ m.title }}</span>
				<span :class="$style.definition">{{ DEFINITION[m.type] }}</span>
			</span>
			<span v-if="m.checking || m.verifying" :class="$style.spend">
				<Skeleton />
				<span :class="$style.visually_hidden">Checking</span>
			</span>
			<span v-else :class="$style.spend">{{ m.disabled && m.disabledReason ? m.disabledReason : m.spend }}</span>
		</label>
	</div>
</template>

<style module>
.group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-bottom: 12px;
}

.key {
	composes: fee_label from "./fee-shared.module.css";
}

/* What a payer spends wraps under its words, right-aligned, once the row cannot hold both side by side. */
.option {
	position: relative;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 10px;
	padding: 7px 10px;
	border: 1px solid var(--nulo-border);
	cursor: pointer;

	&:focus-within {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.chosen {
	border-color: var(--nulo-accent);
	box-shadow: inset 3px 0 0 var(--nulo-accent);
	background: var(--nulo-surface-low);
}

.off {
	cursor: default;

	& .title {
		color: var(--txt-tertiary);
	}
}

/* The radio covers its whole row, invisible: the row draws the choice and its ring. */
.radio {
	position: absolute;
	inset: 0;
	margin: 0;
	opacity: 0;
	cursor: inherit;
}

.main {
	display: flex;
	flex: 1 1 9em;
	flex-direction: column;
	min-width: 0;
}

.title {
	composes: type--name from global;
	color: var(--txt-primary);
}

.definition {
	composes: type--caption from global;
	color: var(--txt-secondary);
}

.spend {
	composes: type--meta from global;
	flex: none;
	margin-left: auto;
	color: var(--nulo-secondary);
}

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}
</style>
