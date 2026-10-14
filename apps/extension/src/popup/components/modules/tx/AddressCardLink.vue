<script setup>
/**
 * The explorer link in an address card's top-right corner. A click on it opens the explorer and
 * never reaches the card, whose own click copies the address.
 */
defineProps({
	href: { type: String, required: true },
	label: { type: String, required: true },
})
</script>

<template>
	<a :href="href" target="_blank" rel="noopener noreferrer" :aria-label="label" :class="$style.link" @click.stop>
		<Icon name="external-link" size="12" color="tertiary" />
	</a>
</template>

<style module>
/* A 24 px target around the 12 px glyph, the glyph 10 px in from the card's top and right edges. */
.link {
	position: absolute;
	top: 4px;
	right: 4px;

	display: inline-flex;
	padding: 6px;

	& svg {
		transition: fill 0.2s var(--bezier);
	}

	&:hover svg {
		fill: var(--nulo-accent);
	}
}
</style>
