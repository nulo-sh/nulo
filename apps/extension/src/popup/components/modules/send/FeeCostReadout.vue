<script setup>
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import FeeAmount from "@/components/composite/FeeAmount.vue"

const props = defineProps({
	estimate: { type: Object, default: null },
	isEstimating: { type: Boolean, default: false },
	/** The wallet answered that an earlier send holds what this estimate needs. */
	isQueued: { type: Boolean, default: false },
	/** A queued send can still go out from this surface, as Send's can on Nulo's sponsor or a cap; a
	 *  surface that holds it until its estimate lands shows only the queued sentence. */
	offersQueue: { type: Boolean, default: true },
	/** Who pays an estimate. The parent decides: only it knows whether a sponsor is Nulo's own. */
	payer: { type: String, default: "self", validator: (v) => ["self", "sponsor", "unvouched"].includes(v) },
	/** Set while the send can be queued against a cap: `about` is the last fee of this token's like sends,
	 *  `cap` the most it goes out for without asking again, both as the card writes a fee. */
	queuedCap: { type: Object, default: null },
	/** The card is still reading what can pay: an estimate or queue on the other props is stale. */
	pending: { type: Boolean, default: false },
	/** Send's amount field holds an amount. While `pending`, You pay draws a bar only then. */
	amountTyped: { type: Boolean, default: false },
})

const estimating = computed(() => props.isEstimating && !props.estimate && !props.pending)

/** Screen readers skip a strikethrough, so the sponsored row is spoken as this sentence alone. */
const sponsoredSentence = computed(() => {
	const usd = props.estimate?.usd
	if (!usd) return `You pay nothing. The sponsor covers about ${props.estimate?.amount} FJ.`
	if (usd.startsWith("<")) return `You pay nothing. The sponsor covers less than ${usd.slice(1)}.`
	return `You pay nothing. The sponsor covers about ${usd}.`
})
</script>

<template>
	<!-- Pending with an amount, estimating and estimated stack label over value, so the row keeps its height when the number lands. -->
	<Flex
		v-if="estimating && isQueued && offersQueue && queuedCap"
		direction="column"
		gap="4"
		:class="$style.detail_row"
		data-testid="fee-estimate-queued-cap"
	>
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.fee_value">
			About <FeeAmount :display="queuedCap.about" :usdClass="$style.fee_usd" usdTestid="fee-estimate-usd" />
		</span>
		<span :class="$style.queued" data-testid="fee-estimate-queued-cap-line">Goes out after your earlier send, for at most <FeeAmount :display="queuedCap.cap" :class="$style.fee_figure" />.</span>
	</Flex>
	<Flex
		v-else-if="estimating && isQueued && offersQueue && payer === 'sponsor'"
		direction="column"
		gap="4"
		:class="$style.detail_row"
		data-testid="fee-estimate-queued-sponsored"
	>
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.fee_value">Nothing</span>
		<span :class="$style.queued" data-testid="fee-estimate-queued-sponsored-line">{{ QUEUED_SPONSORED_COPY }}</span>
	</Flex>
	<Flex v-else-if="estimating && isQueued" direction="column" gap="4" :class="$style.detail_row" data-testid="fee-estimate-queued">
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.queued">{{ QUEUED_FEE_COPY }}</span>
	</Flex>
	<Flex v-else-if="estimating || (pending && amountTyped)" direction="column" gap="4" :class="$style.detail_row">
		<span :class="$style.fee_label">You pay</span>
		<span :class="$style.fee_value"><Skeleton /></span>
	</Flex>
	<Flex v-else-if="estimate && !pending" direction="column" gap="4" :class="$style.detail_row" data-testid="fee-estimate">
		<span :class="$style.fee_label" :aria-hidden="payer === 'sponsor' ? 'true' : undefined">You pay</span>
		<span v-if="payer === 'sponsor'" :class="$style.fee_value">
			<span aria-hidden="true">
				<span>Nothing</span> <s :class="$style.fee_usd"><FeeAmount :display="estimate" usdTestid="fee-estimate-usd" /></s>
			</span>
			<span :class="$style.visually_hidden">{{ sponsoredSentence }}</span>
		</span>
		<span v-else-if="payer === 'unvouched'" :class="$style.fee_value">
			<span aria-hidden="true">—</span>
			<span :class="$style.visually_hidden">{{ UNVOUCHED_FEE_SENTENCE }}</span>
		</span>
		<FeeAmount v-else :class="$style.fee_value" :display="estimate" :usdClass="$style.fee_usd" usdTestid="fee-estimate-usd" />
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

.fee_figure {
	composes: fee_figure from "./fee-shared.module.css";
}

.fee_value {
	composes: type--meta from global;
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

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}

</style>
