<script setup>
import { QUEUED_FEE_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import { feeInWords } from "./fee-helpers"

const props = defineProps({
	estimate: { type: Object, default: null },
	isEstimating: { type: Boolean, default: false },
	/** The wallet answered that an earlier send holds this transfer's chain state. */
	isQueued: { type: Boolean, default: false },
	/** Who pays an estimate. The parent decides: only it knows whether a sponsor is Nulo's own. */
	payer: { type: String, default: "self", validator: (v) => ["self", "sponsor", "unvouched"].includes(v) },
	/** Set while the send can be queued against a cap: `about` is the last fee of this token's like sends,
	 *  `cap` the most it goes out for without asking again, both as the card writes a fee. */
	queuedCap: { type: Object, default: null },
})

/** Screen readers skip a strikethrough, so the sponsored row is spoken as this sentence alone. */
const sponsoredSentence = computed(() => {
	const usd = props.estimate?.usd
	if (!usd) return `You pay nothing. The sponsor covers about ${props.estimate?.amount} FJ.`
	if (usd.startsWith("<")) return `You pay nothing. The sponsor covers less than ${usd.slice(1)}.`
	return `You pay nothing. The sponsor covers about ${usd}.`
})
</script>

<template>
	<!-- Estimating and estimated share ONE geometry: the stacked label+value
	     layout is reserved from the first frame and the skeleton simply
	     occupies the value's slot — the row never moves or grows when the
	     number lands. -->
	<Flex
		v-if="isEstimating && isQueued && !estimate && queuedCap"
		direction="column"
		gap="4"
		:class="$style.detail_row"
		data-testid="fee-estimate-queued-cap"
	>
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.fee_value">
			About {{ queuedCap.about.amount }} FJ<template v-if="queuedCap.about.usd">
				<span :class="$style.fee_usd" title="At today's AZTEC price" data-testid="fee-estimate-usd"> ({{ queuedCap.about.usd }})</span>
			</template>
		</span>
		<span :class="$style.queued" data-testid="fee-estimate-queued-cap-line">Goes out after your earlier send, for at most {{ feeInWords(queuedCap.cap) }}.</span>
	</Flex>
	<Flex v-else-if="isEstimating && isQueued && !estimate" direction="column" gap="4" :class="$style.detail_row" data-testid="fee-estimate-queued">
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.queued">{{ QUEUED_FEE_COPY }}</span>
	</Flex>
	<Flex v-else-if="isEstimating && !estimate" direction="column" gap="4" :class="$style.detail_row">
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.fee_value"><span :class="$style.skeleton" /></span>
	</Flex>
	<Flex v-else-if="estimate" direction="column" gap="4" :class="$style.detail_row" data-testid="fee-estimate">
		<span :class="$style.fee_label" :aria-hidden="payer === 'sponsor' ? 'true' : undefined">You pay</span>
		<span v-if="payer === 'sponsor'" :class="$style.fee_value">
			<span aria-hidden="true">
				<span>Nothing</span> <s :class="$style.fee_usd">~{{ estimate.amount }} FJ<span v-if="estimate.usd" title="At today's AZTEC price" data-testid="fee-estimate-usd"> ({{ estimate.usd }})</span></s>
			</span>
			<span :class="$style.visually_hidden">{{ sponsoredSentence }}</span>
		</span>
		<span v-else-if="payer === 'unvouched'" :class="$style.fee_value">
			<span aria-hidden="true">—</span>
			<span :class="$style.visually_hidden">{{ UNVOUCHED_FEE_SENTENCE }}</span>
		</span>
		<span v-else :class="$style.fee_value">
			~{{ estimate.amount }} FJ<template v-if="estimate.usd">
				<span :class="$style.fee_usd" title="At today's AZTEC price" data-testid="fee-estimate-usd"> ({{ estimate.usd }})</span>
			</template>
		</span>
	</Flex>
	<Flex v-else align="center" gap="4" :class="$style.detail_row">
		<Icon name="info" size="12" color="tertiary" />
		<Text variant="caption" color="tertiary">Fee estimated after simulation</Text>
	</Flex>
</template>

<style module>
.detail_row {
	composes: detail_row from "./fee-shared.module.css";
}

.fee_label {
	composes: fee_label from "./fee-shared.module.css";
}

.fee_value {
	composes: type--data from global;
	color: var(--txt-primary);
}

.fee_usd {
	composes: type--fiat from global;
	font-size: 11px;
	color: var(--nulo-secondary);
}

.queued {
	composes: type--body from global;
	color: var(--nulo-secondary);
}

.skeleton {
	composes: skeleton from "./fee-shared.module.css";
}

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}

</style>
