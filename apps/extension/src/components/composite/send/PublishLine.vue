<script setup lang="ts">
/**
 * What anyone watching the chain can see, said once under the sides: one plain sentence, or the one
 * warning, for a private send whose fee names the account, with the payer that fixes it when one can.
 * The region stays mounted, so a line that changes is announced.
 */
import { computed } from "vue"
import { feeWarning, type PayerKind, type PublishFacts, publishSentence } from "./publish-facts"

const props = defineProps<{
	facts: PublishFacts
	/** The recipient's name, already safe for a sentence, or null. */
	name: string | null
	payer: PayerKind
	remedy: "private_fpc" | "sponsor" | null
}>()
const emit = defineEmits<{ fix: [] }>()

const FIX_WORDS = { private_fpc: "Pay it from private Fee Juice", sponsor: "Use Sponsored" } as const

const warning = computed(() => feeWarning(props.facts, props.name))
const sentence = computed(() => (warning.value ? null : publishSentence(props.facts, props.name, props.payer)))
const fix = computed(() => (props.remedy ? FIX_WORDS[props.remedy] : null))
</script>

<template>
	<div role="status" aria-live="polite" aria-atomic="true" :class="$style.region" :data-you="facts.you" data-testid="send-publish">
		<div v-if="warning" :class="$style.warning" data-testid="send-fee-warning">
			<Icon name="warning" size="14" aria-hidden="true" :class="$style.mark" />
			<span :class="$style.warning_body">
				<span>{{ warning }}</span>
				<button v-if="fix" type="button" :class="$style.fix" data-testid="send-fee-warning-fix" @click="emit('fix')">{{ fix }}</button>
			</span>
		</div>
		<p v-else-if="sentence" :class="$style.sentence" data-testid="send-publish-line">{{ sentence }}</p>
	</div>
</template>

<style module>
.region:empty {
	display: none;
}

.sentence {
	composes: type--body from global;
	margin: 0;
	color: var(--txt-secondary);
}

.warning {
	composes: type--body from global;
	display: flex;
	align-items: baseline;
	gap: 8px;
	padding: 8px 10px;
	background: var(--nulo-surface-low);
	color: var(--txt-warning);
	box-shadow: inset 3px 0 0 var(--yellow);
}

.mark {
	flex: none;
	color: var(--yellow);
}

.warning_body {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	min-width: 0;
}

.fix {
	composes: type--label-section from global;
	background: none;
	color: var(--nulo-accent);
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}
</style>
