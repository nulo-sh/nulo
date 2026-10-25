<script setup>
/**
 * Tokens-view sibling to {@link TokenCard} for journal-backed token imports.
 * Renders for `kind: "token_import"` records that are either
 * in-flight or recently failed. Succeeded records vanish — `TokenCard`'s
 * existing `updatedAt === 0` initial-sync spinner takes over once the
 * watchlist entry lands.
 *
 * No interactive affordances: a token import is a single-shot op without a
 * cancel surface today. If it fails, the row stays visible for a short
 * window so the user sees the reason, then auto-dismisses.
 */

import { dashIfBlank, trimAddress } from "@/utils/string"

const props = defineProps({
	op: {
		type: Object,
		required: true,
	},
})

const isInFlight = computed(() => props.op?.terminalAt === null)
const isFailed = computed(() => props.op?.progress?.stage === "failed")

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

const subtitle = computed(() => {
	if (isFailed.value) {
		return props.op?.error?.message || "Couldn't add token"
	}
	if (typeof props.op?.subtitle === "string" && props.op.subtitle.length > 0) return props.op.subtitle
	return "Adding token…"
})
</script>

<template>
	<Flex align="center" justify="between" :class="[$style.row, isFailed && $style.failed]" data-testid="token-import-row">
		<Flex direction="column" gap="2">
			<span :class="titleIsAddress ? $style.address : $style.symbol" data-testid="token-import-title">{{ title }}</span>
			<span :class="$style.subtitle" data-testid="token-import-subtitle">{{ subtitle }}</span>
		</Flex>

		<Flex v-if="isInFlight" align="center" gap="6" data-testid="token-import-spinner">
			<Spinner size="12" color="--txt-tertiary" />
		</Flex>
		<Icon v-else-if="isFailed" name="square-cross" size="14" color="red" data-testid="token-import-failed" />
	</Flex>
</template>

<style module>
.row {
	border-bottom: 1px solid var(--nulo-border);
	padding: 16px 0;
}

.failed {
	opacity: 0.7;
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
