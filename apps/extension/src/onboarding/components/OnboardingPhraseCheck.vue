<script setup lang="ts">
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"

/** Utils */
import { isPhraseCheckPassed, type PhraseQuestion } from "../phrase-check"

const props = defineProps<{ questions: readonly PhraseQuestion[]; path: "password" | "passkey" }>()
const emit = defineEmits<{ passed: []; later: [] }>()

const phrasePicks = ref<(string | undefined)[]>(props.questions.map(() => undefined))
const isRefused = ref(false)
const isComplete = computed(() => phrasePicks.value.every((pick) => pick !== undefined))

const title = useTemplateRef<{ focus: (options?: FocusOptions) => void }>("title")

function pick(index: number, word: string) {
	phrasePicks.value[index] = word
	isRefused.value = false
}

function confirm() {
	if (!isComplete.value) return
	if (isPhraseCheckPassed(props.questions, phrasePicks.value)) emit("passed")
	else isRefused.value = true
}

onMounted(() => {
	// A stage of Create, not a route: no router scroll reset runs, and a held Enter from I saved it
	// must land on an element it cannot press.
	document.scrollingElement?.scrollTo(0, 0)
	title.value?.focus({ preventScroll: true })
})
</script>

<template>
	<OnboardingPage data-testid="onboarding-phrase-check-page">
		<OnboardingStepHeader
			ref="title"
			current="phrase"
			:path="props.path"
			main="Check your"
			sub="Phrase"
			tabindex="-1"
			data-testid="onboarding-phrase-check-title"
		/>

		<Text variant="body" color="secondary" height="150">Pick 3 words by their position.</Text>

		<Flex direction="column" gap="24" :class="$style.questions">
			<!-- No <form>: Enter on a choice submits nothing, and Confirm is the one way on. -->
			<fieldset
				v-for="(question, index) in props.questions"
				:key="question.position"
				:class="$style.question"
				:data-position="question.position"
				data-testid="onboarding-phrase-check-question"
			>
				<legend :class="$style.legend">Word {{ question.position }}</legend>
				<!-- Page translation must never rewrite a recovery word. -->
				<div :class="$style.choices" translate="no">
					<label v-for="choice in question.phraseChoices" :key="choice" :class="$style.choice">
						<input
							type="radio"
							:class="$style.radio"
							:name="`onboarding-phrase-check-${question.position}`"
							:value="choice"
							:checked="phrasePicks[index] === choice"
							data-testid="onboarding-phrase-check-choice"
							@change="pick(index, choice)"
						/>
						<span :class="$style.chip">{{ choice }}</span>
					</label>
				</div>
			</fieldset>
		</Flex>

		<Flex v-snack-footer direction="column" align="center" gap="12">
			<Text
				v-if="isRefused"
				variant="body"
				color="txt-danger"
				height="150"
				role="alert"
				data-testid="onboarding-phrase-check-error"
			>
				Words don't match. Try again.
			</Text>
			<Button
				variant="primary"
				size="large"
				wide
				:disabled="!isComplete"
				data-testid="onboarding-phrase-check-confirm"
				@keydown.enter="refuseRepeatEnter"
				@click="confirm"
			>
				Confirm
			</Button>
			<OnboardingSkipLink testid="onboarding-phrase-check-later" @keydown.enter="refuseRepeatEnter" @click="emit('later')">
				Do it later
			</OnboardingSkipLink>
		</Flex>
	</OnboardingPage>
</template>

<style module>
.question {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	margin: 0;
	padding: 0;
	border: none;
}

.legend {
	composes: type--label-section from global;
	padding: 0 0 8px;
	color: var(--txt-secondary);
}

.choices {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
}

/* A chip holds the widest BIP39 word, 67.2 px, in 77.2 px: four of them and their gaps need 333 px,
 * so below that the choices keep their order in two columns. */
.questions {
	container: choices / inline-size;
}

@container choices (width < 333px) {
	.choices {
		grid-template-columns: repeat(2, 1fr);
	}
}

.choice {
	position: relative;
	display: flex;
	cursor: pointer;
}

/* The native radio stays the control, over the whole chip: one Tab stop per group, arrows move the
 * pick, and a press anywhere on the chip lands on it. */
.radio {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	margin: 0;
	opacity: 0;
	cursor: pointer;
}

.chip {
	composes: type--input-data from global;
	flex: 1;
	padding: 10px 4px;
	text-align: center;
	/* A word is never clipped: the column keeps the width of its longest choice. */
	white-space: nowrap;
	color: var(--txt-primary);
	background: var(--nulo-surface);
	border: 1px solid var(--nulo-outline);
	transition: background 0.15s var(--bezier), color 0.15s var(--bezier), border-color 0.15s var(--bezier);
}

.choice:hover .chip {
	border-color: var(--txt-secondary);
}

.radio:checked + .chip {
	color: var(--app-bg);
	background: var(--nulo-accent);
	border-color: var(--nulo-accent);
}

/* Outside the chip, so the ring stays visible on the filled one. */
.radio:focus-visible + .chip {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}
</style>
