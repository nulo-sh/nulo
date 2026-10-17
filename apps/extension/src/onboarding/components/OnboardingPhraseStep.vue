<script setup lang="ts">
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useSecretClipboardCopy } from "@/composables/useSecretClipboardCopy"

/** Components */
import RecoveryPhraseGrid from "@/components/composite/RecoveryPhraseGrid.vue"

const props = defineProps<{ words: readonly string[] }>()
const emit = defineEmits<{ saved: []; later: [] }>()

const { openToast } = useToast()
const { isCopied, copySecret } = useSecretClipboardCopy({ toastLabel: "Recovery phrase copied", openToast })

const title = useTemplateRef<HTMLElement>("title")

onMounted(() => {
	// A stage of Create, not a route: no router scroll reset runs, and focus must leave the Create
	// button for an element no held Enter can press.
	document.scrollingElement?.scrollTo(0, 0)
	title.value?.focus({ preventScroll: true })
})
</script>

<template>
	<OnboardingPage data-testid="onboarding-phrase-page">
		<StepIndicator :current="3" />
		<header ref="title" tabindex="-1" :class="$style.hero" data-testid="onboarding-phrase-title">
			<BrutalistTitle main="Your recovery" sub="Phrase" />
			<div :class="$style.hero_bar" />
		</header>

		<Text variant="body" color="secondary" height="150">
			Write these 24 words on paper and keep them offline. They bring your wallet back if you forget your password.
		</Text>

		<RecoveryPhraseGrid
			:words="props.words"
			:columns="4"
			testId="onboarding-phrase"
			:isCopied="isCopied"
			@copy="copySecret(props.words.join(' '))"
		/>

		<Flex v-snack-footer direction="column" align="center" gap="12">
			<Button
				variant="cta"
				size="large"
				data-testid="onboarding-phrase-saved"
				@keydown.enter="refuseRepeatEnter"
				@click="emit('saved')"
			>
				I saved it
			</Button>
			<OnboardingSkipLink testid="onboarding-phrase-later" @click="emit('later')">Do it later</OnboardingSkipLink>
		</Flex>
	</OnboardingPage>
</template>

<style module>
.hero {
	padding: 8px 0 0;
}

/* A focus target, not a control: no ring. */
.hero:focus {
	outline: none;
}

.hero_bar {
	width: 40px;
	height: 2px;
	background: var(--nulo-accent);
	margin-top: 12px;
}
</style>
