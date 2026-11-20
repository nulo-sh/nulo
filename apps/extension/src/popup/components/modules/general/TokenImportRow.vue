<script setup>
/**
 * Tokens-view sibling to {@link TokenCard} for journal-backed token imports.
 * Renders for `kind: "token_import"` records that are either
 * in-flight or recently failed. Succeeded records vanish — `TokenCard`'s
 * existing `updatedAt === 0` initial-sync spinner takes over once the
 * watchlist entry lands.
 *
 * A failed row stays visible for a short window so the person sees the reason, then
 * auto-dismisses.
 */

import TokenMark from "@/components/composite/general/TokenMark.vue"
import { dashIfBlank, trimAddress } from "@/utils/string"
import { canRetryImport, importFailureSentence } from "./token-import-retry"

const emit = defineEmits(["retry"])
const props = defineProps({
	op: {
		type: Object,
		required: true,
	},
	/** The signed list's picture for this import's chain and contract, when the list names them. */
	icon: String,
	/** The signed list's picture of that contract's bridge, matched the same way. */
	bridgeIcon: String,
	retrying: Boolean,
})

const isInFlight = computed(() => props.op?.terminalAt === null || props.retrying)
const isFailed = computed(() => props.op?.progress?.stage === "failed" && !props.retrying)
const canRetry = computed(() => isFailed.value && canRetryImport(props.op))

const shortAddress = computed(() => {
	const a = props.op?.contractAddress
	if (typeof a !== "string" || a.length < 12) return a ?? ""
	return trimAddress(a, 6, 4, "…")
})

const hasName = computed(() => typeof props.op?.title === "string" && props.op.title.length > 0)

const title = computed(() => {
	if (hasName.value) return dashIfBlank(props.op.title)
	return shortAddress.value || "Token"
})

const titleIsAddress = computed(() => !hasName.value && Boolean(shortAddress.value))
/** Initials come only from a title that names the token: a shortened contract's would read as a name. */
const markSymbol = computed(() => (hasName.value ? props.op.title : ""))

const subtitle = computed(() => {
	if (isFailed.value) {
		return importFailureSentence(props.op) ?? (props.op?.error?.message || "Couldn't add token")
	}
	if (!props.retrying && typeof props.op?.subtitle === "string" && props.op.subtitle.length > 0) return props.op.subtitle
	return "Adding token…"
})
</script>

<template>
	<Flex align="center" justify="between" :class="$style.row" data-testid="token-import-row">
		<Flex align="center" gap="12" :class="$style.lead">
			<TokenMark :symbol="markSymbol" :icon="icon" :bridgeIcon="bridgeIcon" :size="32" :badge="false" :class="isFailed && $style.failed" />
			<Flex direction="column" gap="2" :class="$style.lead">
				<span
					:class="[$style.title, titleIsAddress ? $style.address : $style.symbol, isFailed && $style.failed]"
					data-testid="token-import-title"
				>{{ title }}</span>
				<span :class="[$style.subtitle, isFailed && $style.failed]" data-testid="token-import-subtitle">{{ subtitle }}</span>
			</Flex>
		</Flex>

		<Flex v-if="isInFlight" align="center" gap="6" data-testid="token-import-spinner">
			<Spinner size="12" color="--txt-tertiary" />
		</Flex>
		<Flex v-else-if="isFailed" align="center" gap="12">
			<button v-if="canRetry" type="button" @click="emit('retry')" data-testid="token-import-retry" :class="$style.retry">
				RETRY
			</button>
			<Icon name="square-cross" size="14" color="red" data-testid="token-import-failed" :class="$style.failed" />
		</Flex>
	</Flex>
</template>

<style module>
.row {
	border-bottom: 1px solid var(--nulo-border);
	padding: 16px 0;
}

/* Dims what the row says, never its Retry, which keeps the contrast of a control. */
.failed {
	opacity: 0.7;
}

.retry {
	composes: retry from "./token-row.module.css";
}

.lead {
	composes: lead from "./token-row.module.css";
}

/* A contract names its token with up to 32 characters in one word: cut where the spinner or × starts. */
.title {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.symbol {
	composes: type--row-title from global;
	font-size: 14px;
	color: var(--txt-primary);
}

.address {
	composes: type--meta from global;
	color: var(--txt-primary);
}

.subtitle {
	composes: type--caption from global;
	color: var(--nulo-secondary);
}
</style>
