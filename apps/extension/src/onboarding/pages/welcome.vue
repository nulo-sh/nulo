<route lang="json">
{ "meta": { "title": "Welcome" } }
</route>

<script setup lang="ts">
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"

const router = useRouter()
</script>

<template>
	<OnboardingPage align="center" :gap="56">
		<Flex direction="column" align="center" gap="16" :class="$style.hero">
			<BrutalistTitle main="Welcome" sub="to Nulo" align="center" size="hero" />
			<div :class="$style.hero_bar" />
			<Text variant="body" color="secondary" height="150" align="center" :class="$style.subhead">
				A wallet that keeps your balance to yourself.
			</Text>
			<Text variant="body" color="secondary" height="150" align="center" :class="$style.tagline">
				Private by default. Sovereign by design.
			</Text>
		</Flex>

		<Flex v-snack-footer direction="column" gap="8" :class="$style.actions">
			<Button
				variant="primary"
				size="large"
				wide
				data-testid="onboarding-welcome-create"
				@click="router.push('/onboarding/create')"
			>
				Create profile
			</Button>
			<Button
				variant="primary_outline"
				size="large"
				wide
				data-testid="onboarding-welcome-import"
				@click="router.push('/onboarding/import')"
			>
				Import profile
			</Button>
		</Flex>
	</OnboardingPage>
</template>

<style module>
.hero {
	padding: 24px 0;
}

.hero_bar {
	width: 56px;
	height: 2px;
	background: var(--nulo-accent);
}

.subhead {
	max-width: 360px;
}

.tagline {
	opacity: 0.65;
}

.actions {
	width: 100%;
}
</style>
