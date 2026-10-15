<script setup>
/** Where a person acts on a token the signed list flags as a scam: its page and the Send form. */
</script>

<template>
	<Banner variant="error" direction="vertical" wide data-testid="token-flagged-banner">
		<template #title>Nulo flagged this token as a scam</template>
		<template #description>Its name and balance can be fake. Do not buy it or follow links that promote it.</template>
	</Banner>
</template>
