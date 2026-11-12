<script setup>
/**
 * A default token that is not a token row yet. Inert on purpose: there is no token id to open,
 * so it is a `div` — never a link, never a picker option. Every string it shows comes from the
 * signed token list; chain data only ever reaches the real `TokenCard`.
 */

/** Components */
import { Skeleton } from "@nulo/design"
import TokenMark from "@/components/composite/general/TokenMark.vue"

/** Utils */
import { isSeedWorking } from "./home-slots"

const props = defineProps({
	entry: {
		type: Object,
		required: true,
	},
	/** The signed list's picture for this entry; a list without one leaves its initials. */
	icon: String,
})
const emit = defineEmits(["retry"])

// `seeded` reaches this row only while its balance row is still on its way.
const isWorking = computed(() => isSeedWorking(props.entry.status))
const isFailed = computed(() => props.entry.status === "failed")
const reason = computed(() => (isFailed.value ? "Couldn't set up" : "Couldn't verify"))
</script>

<template>
	<div
		data-testid="token-seed-row"
		:data-status="entry.status"
		:data-symbol="entry.symbol"
		:aria-busy="isWorking || undefined"
		:class="$style.row"
	>
		<Flex align="center" gap="12" :class="$style.lead">
			<TokenMark :symbol="entry.symbol" :icon="icon" :size="32" :badge="false" :class="!isWorking && $style.dimmed" />
			<Flex direction="column" gap="2" :class="$style.lead">
				<span :class="[$style.symbol, !isWorking && $style.dimmed]">{{ entry.symbol }}</span>
				<span v-if="isWorking" :class="$style.sub">{{ entry.displayName }}</span>
				<span v-else :class="$style.reason" data-testid="token-seed-reason">{{ reason }}</span>
			</Flex>
		</Flex>

		<Flex v-if="isWorking" direction="column" align="end" justify="center" gap="2" :class="$style.loading_block">
			<Skeleton :width="64" :height="13" />
			<Skeleton :width="92" :height="11" />
		</Flex>
		<button v-else-if="isFailed" type="button" @click="emit('retry')" data-testid="token-seed-retry" :class="$style.retry">
			RETRY
		</button>
	</div>
</template>

<style module>
.row {
	display: flex;
	align-items: center;
	justify-content: space-between;

	padding: 8px 0;
}

.symbol {
	composes: type--row-title from global;
	font-size: 14px;
	color: var(--txt-primary);
}

.dimmed {
	opacity: 0.55;
}

.sub {
	composes: type--caption from global;
	color: var(--nulo-secondary);
}

.reason {
	composes: type--caption from global;
	color: var(--txt-danger);
}

.lead {
	composes: lead from "./token-row.module.css";
}

.loading_block {
	composes: loading_block from "./token-row.module.css";
}

.retry {
	composes: type--label-section from global;
	height: 28px;
	padding: 0 12px;
	background: transparent;
	box-shadow: inset 0 0 0 1px var(--nulo-outline);

	color: var(--nulo-accent);
	cursor: pointer;

	transition: box-shadow 0.2s var(--bezier);

	&:hover {
		box-shadow: inset 0 0 0 1px var(--nulo-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}
</style>
