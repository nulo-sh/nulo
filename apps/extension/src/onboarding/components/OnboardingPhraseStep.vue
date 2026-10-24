<script setup lang="ts">
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useSecretClipboardCopy } from "@/composables/useSecretClipboardCopy"

/** Components */
import RecoveryPhraseGrid from "@/components/composite/RecoveryPhraseGrid.vue"

/** Utils */
import { RECOVERY_PHRASE_WARNINGS } from "@/utils/recovery-phrase-warnings"

const props = defineProps<{ words: readonly string[] }>()
const emit = defineEmits<{ saved: []; later: [] }>()

const { openToast } = useToast()
const { isCopied, copySecret } = useSecretClipboardCopy({ toastLabel: "Recovery phrase copied", openToast })

const title = useTemplateRef<{ focus: (options?: FocusOptions) => void }>("title")

onMounted(() => {
	// A stage of Create, not a route: no router scroll reset runs, and focus must leave the Create
	// button for an element no held Enter can press.
	document.scrollingElement?.scrollTo(0, 0)
	title.value?.focus({ preventScroll: true })
})
</script>

<template>
	<OnboardingPage data-testid="onboarding-phrase-page">
		<OnboardingStepHeader
			ref="title"
			current="phrase"
			path="password"
			main="Your recovery"
			sub="Phrase"
			tabindex="-1"
			data-testid="onboarding-phrase-title"
		/>

		<Text variant="body" color="secondary" height="150">
			Write these 24 words on paper and keep them offline. They bring your wallet back if you forget your password.
		</Text>

		<RecoveryPhraseGrid :words="props.words" :columns="4" testId="onboarding-phrase" />

		<Flex direction="column" gap="12">
			<Text variant="label-section" color="secondary">Keep in mind</Text>
			<Flex direction="column" gap="10">
				<Flex v-for="warning in RECOVERY_PHRASE_WARNINGS" :key="warning" gap="8">
					<Icon name="warning" size="12" color="tertiary" :class="$style.mark" />
					<Text variant="body" height="150" color="tertiary">{{ warning }}</Text>
				</Flex>
			</Flex>
		</Flex>

		<Flex v-snack-footer direction="column" align="center" gap="12">
			<div :class="$style.actions">
				<Button
					variant="primary_outline"
					size="large"
					wide
					data-testid="onboarding-phrase-copy"
					@click="copySecret(props.words.join(' '))"
				>
					{{ isCopied ? "Copied" : "Copy" }}
				</Button>
				<Button
					variant="primary"
					size="large"
					wide
					data-testid="onboarding-phrase-saved"
					@keydown.enter="refuseRepeatEnter"
					@click="emit('saved')"
				>
					I saved it
				</Button>
			</div>
			<OnboardingSkipLink testid="onboarding-phrase-later" @click="emit('later')">Do it later</OnboardingSkipLink>
		</Flex>
	</OnboardingPage>
</template>

<style module>
.mark {
	height: 18px;
	flex-shrink: 0;
}

.actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
	width: 100%;
}
</style>
