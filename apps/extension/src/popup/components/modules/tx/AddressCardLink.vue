<script setup>
/** The explorer link in an address card's corner; its click never reaches the card, whose click copies. */
defineProps({
	href: { type: String, required: true },
	label: { type: String, required: true },
})
</script>

<template>
	<a :href="href" target="_blank" rel="noopener noreferrer" :aria-label="label" :class="$style.link" @click.stop>
		<Icon name="open" size="12" color="tertiary" />
	</a>
</template>

<style module>
/* Only the target grows to 24 px; the glyph keeps its place, 10 px in from the card's corner. */
.link {
	position: absolute;
	top: 4px;
	right: 4px;

	display: inline-flex;
	padding: 6px;

	& svg {
		transition: color 0.2s var(--bezier);
	}

	&:hover svg {
		color: var(--nulo-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}
</style>
