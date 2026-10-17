<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
defineProps({
	displaceIdx: {
		type: Number,
	},
})
</script>

<template>
	<Flex align="center" direction="column" :class="[$style.wrapper, displaceIdx > 1 && $style.displace]">
		<Flex direction="column" gap="16" wide :style="{ minHeight: 0 }" data-testid="popup-card-body">
			<slot />
		</Flex>
	</Flex>
</template>

<style module>
/* Content height: a card taller than the frame shrinks to what Popup's close area leaves and scrolls. */
.wrapper {
	overflow: auto;

	padding-top: 16px;

	background: var(--nulo-surface);
	border-top: 2px solid var(--nulo-accent);
	/* A box shadow paints outside the border box, so the card's own overflow never clips the ledge. */
	box-shadow: -6px -6px 0 0 color-mix(in srgb, var(--nulo-accent) 30%, transparent);

	transition: all 0.2s var(--bezier);

	&.displace {
		transform: translateY(15px);
	}

	&::-webkit-scrollbar {
		display: none;
	}
}

:global([theme="light"]) .wrapper {
	box-shadow: -6px -6px 0 0 var(--nulo-outline);
}
</style>
