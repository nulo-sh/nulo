<script setup lang="ts">
/**
 * Everything above an onboarding step's content: the back row, the step row and the title. Every
 * step after welcome draws it the same, so moving between steps never moves the title. Attributes
 * land on the `<header>`, the element a step marks or focuses; `class` sets the space under it.
 */
import type { OnboardingPath, OnboardingStep } from "../steps"

defineOptions({ inheritAttrs: false })

defineProps<{
	current: OnboardingStep
	path: OnboardingPath
	/** The back link's testid; a step without one keeps the row, empty. */
	back?: string
	main: string
	sub: string
	align?: "left" | "center"
}>()

const hero = useTemplateRef<HTMLElement>("hero")

defineExpose({ focus: (options?: FocusOptions) => hero.value?.focus(options) })
</script>

<template>
	<div :class="$style.head">
		<div :class="$style.backRow">
			<OnboardingBackLink v-if="back" :testid="back" />
		</div>
		<StepIndicator :current="current" :path="path" />
		<header ref="hero" v-bind="$attrs" :class="[$style.hero, align === 'center' && $style.center]">
			<BrutalistTitle :main="main" :sub="sub" :align="align" data-testid="onboarding-step-title" />
			<div :class="$style.bar" />
			<slot />
		</header>
	</div>
</template>

<style module>
.head {
	align-self: stretch;
	display: flex;
	flex-direction: column;
	gap: 32px;
}

/* The back link's own box: a fixed row keeps the title's line whether or not a step has a back link. */
.backRow {
	display: flex;
	flex-shrink: 0;
	height: 22px;
}

.hero {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-top: 8px;
}

/* A focus target, not a control: no ring. */
.hero:focus {
	outline: none;
}

.center {
	align-items: center;
	gap: 16px;
}

.bar {
	width: 40px;
	height: 2px;
	background: var(--nulo-accent);
}

.center .bar {
	width: 56px;
}
</style>
