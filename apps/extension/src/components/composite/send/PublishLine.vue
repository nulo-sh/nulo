<script setup lang="ts">
/**
 * The warning's fix is the account's private Fee Juice when that can pay, else the bridge; never a
 * sponsor, which only some networks have. The region stays mounted, so a line that changes is announced.
 */
import { computed } from "vue"
import FpcSentence from "./FpcSentence.vue"
import mark from "./publish-mark.module.css"
import { feeWarningShort, type PayerKind, type PublishFacts, publishSentence } from "./publish-facts"

const props = defineProps<{
	facts: PublishFacts
	/** The recipient's name, already safe for a sentence, or null. */
	name: string | null
	payer: PayerKind
	remedy: "private_fpc" | null
	/** Where the account gets private Fee Juice when its own cannot pay. */
	bridgeUrl: string
	/** The Fee sheet covers the page and announces the same warning from its own region. */
	quiet?: boolean
}>()
const emit = defineEmits<{ fix: [] }>()

const warning = computed(() => feeWarningShort(props.facts))
const sentence = computed(() => (warning.value ? null : publishSentence(props.facts, props.name, props.payer)))
</script>

<template>
	<div role="status" :aria-live="quiet ? 'off' : 'polite'" aria-atomic="true" :class="$style.region" :data-you="facts.you" data-testid="send-publish">
		<div v-if="warning" :class="mark.warning_box" data-testid="send-fee-warning">
			<Icon name="warning" size="14" aria-hidden="true" :class="mark.warning_mark" />
			<span :class="mark.warning_body">
				<span>{{ warning }}</span>
				<button v-if="remedy === 'private_fpc'" type="button" :class="mark.warning_fix" data-testid="send-fee-warning-fix" @click="emit('fix')">Pay it from private Fee Juice</button>
				<a v-else :href="bridgeUrl" target="_blank" rel="noopener noreferrer" :class="mark.warning_fix" data-testid="send-fee-warning-bridge">Get private Fee Juice</a>
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
</style>
