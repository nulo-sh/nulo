<script setup>
/**
 * Who pays the fee, as native radios. The card may refuse a pick (a row its own rules cannot use),
 * so the browser's check is put back to the card's choice after every change.
 */
import { Skeleton } from "@nulo/design"
import { FEE_JUICE_DECIMALS } from "@/utils/fee-estimation"
import { GLOSSARY } from "@/utils/glossary"
import { parseSide } from "@/utils/token-amount"
import { formatUsdMicro, tokenAmountToUsdMicro } from "@/wallet/services/price/convert"
import { menuOrder } from "@/utils/fee/fee-helpers"

const props = defineProps({
	modelValue: { type: Object, default: null },
	methods: { type: Array, required: true },
	/** The card is still reading what can pay. */
	pending: { type: Boolean, default: false },
	/** USD per Fee Juice from a band-checked quote (the conversion rejects a rate that rounds to zero
	 *  micro-USD); none hides every balance's dollars. */
	usd: { type: Number, default: undefined },
})
const emit = defineEmits(["update:modelValue"])

const labelId = `fee-payers-${useId()}`
const group = ref(null)

/** Private Fee Juice first, then public, then the sponsors in the menu's order. */
const RANK = { private_fpc: 0, fj: 1, fpc: 2 }
const rows = computed(() => [...menuOrder(props.methods)].sort((a, b) => RANK[a.type] - RANK[b.type]))

const DEFINITION = {
	private_fpc: GLOSSARY["private-fee-juice"].definition,
	fj: GLOSSARY["public-fee-juice"].definition,
	fpc: GLOSSARY.sponsored.definition,
}
/** A contract added by hand may charge, so it is never told as one that pays for you. */
const definitionOf = (m) => (m.type === "fpc" && m.fpc?.isProtocol !== true ? GLOSSARY.fpc.definition : DEFINITION[m.type])

const keyOf = (m) => m.fpc?.id ?? m.type
const isChosen = (m) =>
	Boolean(props.modelValue) && props.modelValue.type === m.type && (m.type !== "fpc" || props.modelValue.fpc?.id === m.fpc?.id)
const isOff = (m) => Boolean(m.disabled || m.checking)

const dollarsOf = (m) => {
	const raw = typeof m.balance === "string" ? parseSide(m.balance) : undefined
	const usd = props.usd
	if (raw === undefined || isOff(m) || !Number.isFinite(usd) || usd <= 0) return null
	return formatUsdMicro(tokenAmountToUsdMicro(raw, FEE_JUICE_DECIMALS, usd))
}
const spendOf = (m) => (m.disabled && m.disabledReason ? m.disabledReason : m.spend)

/** Vue patches `checked` only when `isChosen` changes, so a refused pick would stay checked. */
async function onChange(m) {
	emit("update:modelValue", m)
	await nextTick()
	const inputs = group.value?.querySelectorAll("input") ?? []
	rows.value.forEach((row, i) => {
		if (inputs[i]) inputs[i].checked = isChosen(row)
	})
}

/** The chosen payer, else the first that can be chosen; undefined when none can. */
const target = () => {
	const open = [...(group.value?.querySelectorAll("input:not(:disabled)") ?? [])]
	return open.find((r) => r.checked) ?? open[0]
}
defineExpose({ target, focus: () => target()?.focus() })
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
				@change="onChange(m)"
			/>
			<span :class="$style.main">
				<span :class="$style.title">{{ m.title }}</span>
				<span :class="$style.definition">{{ definitionOf(m) }}</span>
			</span>
			<span v-if="m.checking || m.verifying" :class="$style.spend">
				<Skeleton />
				<span :class="$style.visually_hidden">Checking</span>
			</span>
			<span v-else :class="$style.spend">
				<span :class="$style.figure">{{ spendOf(m) }}</span>
				<span v-if="dollarsOf(m)" :class="$style.usd">{{ dollarsOf(m) }}</span>
			</span>
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

	/* Keyboard focus only: a press focuses the radio too, and must leave no ring behind. */
	&:has(> .radio:focus-visible) {
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
	display: flex;
	flex: none;
	flex-direction: column;
	align-items: flex-end;
	margin-left: auto;
}

.figure {
	composes: type--value from global;
	color: var(--nulo-secondary);
	white-space: nowrap;
}

/* The row's secondary line, so `caption`, not the mono `fiat` every other dollar value takes. */
.usd {
	composes: type--caption from global;
	color: var(--nulo-secondary);
	white-space: nowrap;
}

.visually_hidden {
	composes: visually_hidden from "@/components/a11y.module.css";
}
</style>
