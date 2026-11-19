<script setup>
/** An endpoint's state as the account engine's router last saw it; the words are the edit sheet's. */
defineProps({
	tone: {
		type: String,
		default: "gray",
		validator: (value) => ["green", "amber", "red", "gray"].includes(value),
	},
})
</script>

<template>
	<span :class="[$style.dot, $style[tone]]" :data-tone="tone" data-testid="endpoint-status-dot" aria-hidden="true" />
</template>

<style module>
/* The networks list's active dot: the same size, shape and colours, plus amber and grey. */
.dot {
	display: inline-block;
	flex: none;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--gray);

	&.green {
		background: var(--green);
	}

	&.amber {
		background: var(--yellow);
	}

	&.red {
		background: var(--red);
	}
}
</style>
