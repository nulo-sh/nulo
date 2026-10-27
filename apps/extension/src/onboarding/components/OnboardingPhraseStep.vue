<script setup lang="ts">
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useSecretClipboardCopy } from "@/composables/useSecretClipboardCopy"
import { useSecretCountdown } from "@/composables/useSecretCountdown"

/** Components */
import DisableAutoCloseLink from "@/components/composite/DisableAutoCloseLink.vue"
import RecoveryPhraseGrid from "@/components/composite/RecoveryPhraseGrid.vue"

/** Utils */
import { RECOVERY_PHRASE_AUTO_CLOSE_MS, RECOVERY_PHRASE_WARNINGS } from "@/utils/recovery-phrase-warnings"

const props = defineProps<{ words: readonly string[]; path: "password" | "passkey" }>()
const emit = defineEmits<{ saved: []; later: [] }>()

const body = computed(
	() =>
		`Write these 24 words on paper and keep them offline. They bring your wallet back if you ${props.path === "password" ? "forget your password" : "lose your passkey"}.`,
)

const { openToast } = useToast()
const { isCopied, copySecret } = useSecretClipboardCopy({ toastLabel: "Recovery phrase copied", openToast })

const {
	countdownLabel,
	isAutoCloseDisabled,
	start: startCountdown,
	disable: disableAutoClose,
} = useSecretCountdown({ autoCloseMs: RECOVERY_PHRASE_AUTO_CLOSE_MS, onTimeout: () => emit("later") })

const title = useTemplateRef<{ focus: (options?: FocusOptions) => void }>("title")
const later = useTemplateRef<{ focus: () => void }>("later")

/** The link leaves with the countdown; focus goes to the exit it timed, not to the page. */
function keepOpen() {
	disableAutoClose()
	later.value?.focus()
}

onMounted(() => {
	// A stage of Create, not a route: no router scroll reset runs, and focus must leave the Create
	// button for an element no held Enter can press.
	document.scrollingElement?.scrollTo(0, 0)
	title.value?.focus({ preventScroll: true })
	startCountdown()
})
</script>

<template>
	<OnboardingPage data-testid="onboarding-phrase-page">
		<OnboardingStepHeader
			ref="title"
			current="phrase"
			:path="props.path"
			main="Your recovery"
			sub="Phrase"
			tabindex="-1"
			data-testid="onboarding-phrase-title"
		/>

		<Text variant="body" color="secondary" height="150">
			{{ body }}
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
			<OnboardingSkipLink
				ref="later"
				testid="onboarding-phrase-later"
				:class="$style.later"
				@keydown.enter="refuseRepeatEnter"
				@click="emit('later')"
			>
				Do it later<span v-if="!isAutoCloseDisabled"> · {{ countdownLabel }}</span>
			</OnboardingSkipLink>
			<DisableAutoCloseLink v-if="!isAutoCloseDisabled" testid="onboarding-phrase-disable-auto-close" @click="keepOpen" />
		</Flex>
	</OnboardingPage>
</template>

<style module>
.mark {
	height: 18px;
	flex-shrink: 0;
}

.later {
	font-variant-numeric: tabular-nums;
}

.actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
	width: 100%;
}
</style>
