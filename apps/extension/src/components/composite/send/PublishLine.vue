<script setup lang="ts">
/**
 * The warning's fix is the account's private Fee Juice when that can pay, else the bridge; never a
 * sponsor, which only some networks have. The region stays mounted, so a line that changes is announced.
 */
import { computed } from "vue"
import FpcSentence from "./FpcSentence.vue"
import { feeWarning, type PayerKind, type PublishFacts, publishSentence } from "./publish-facts"

const props = defineProps<{
	facts: PublishFacts
	/** The recipient's name, already safe for a sentence, or null. */
	name: string | null
	payer: PayerKind
	remedy: "private_fpc" | null
	/** Where the account gets private Fee Juice when its own cannot pay. */
	bridgeUrl: string
}>()
const emit = defineEmits<{ fix: [] }>()

const warning = computed(() => feeWarning(props.facts, props.name))
const sentence = computed(() => (warning.value ? null : publishSentence(props.facts, props.name, props.payer)))
</script>

<template>
	<div role="status" aria-live="polite" aria-atomic="true" :class="$style.region" :data-you="facts.you" data-testid="send-publish">
		<div v-if="warning" :class="$style.warning" data-testid="send-fee-warning">
			<Icon name="warning" size="14" aria-hidden="true" :class="$style.mark" />
			<span :class="$style.warning_body">
				<span>{{ warning }}</span>
				<button v-if="remedy === 'private_fpc'" type="button" :class="$style.fix" data-testid="send-fee-warning-fix" @click="emit('fix')">Pay it from private Fee Juice</button>
				<a v-else :href="bridgeUrl" target="_blank" rel="noopener noreferrer" :class="$style.fix" data-testid="send-fee-warning-bridge">Get private Fee Juice</a>
			</span>
		</div>
		<p v-else-if="sentence" :class="$style.sentence" data-testid="send-publish-line"><FpcSentence :text="sentence" /></p>
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
	composes: warning_box from "./publish-mark.module.css";
}

.mark {
	composes: warning_mark from "./publish-mark.module.css";
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
