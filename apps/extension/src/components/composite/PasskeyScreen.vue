<script setup lang="ts">
/**
 * The passkey screen: the card the in-page dialog shows over the dimmed page, or Nulo's passkey
 * window. Presentational: the host runs the passkey request and passes its buttons through the
 * `actions` slot, so each host keeps its own handlers and test ids.
 *
 * The body is a status, so a screen reader hears each new line while focus stays where it is.
 * `finishing` renders like `waiting` with its footer hidden in place: the host keeps its waiting
 * buttons in the slot, so nothing moves and nothing can be pressed.
 */
import { computed, useId } from "vue"
import { BrutalistTitle, Icon } from "@nulo/design"

const props = defineProps<{
	layout: "card" | "window"
	tone: "waiting" | "finishing" | "failed"
	/** The step and the profile it acts on; empty renders no tag. */
	tag: string
	title: readonly [string, string]
	body: string
	/** The window's footer line, shown while waiting; the card has none. */
	note?: string
	bodyTestid?: string
}>()

const titleId = useId()
const bodyId = useId()

const glyphSize = computed(() => (props.layout === "window" ? 36 : 20))
const badgeSize = computed(() => (props.layout === "window" ? 20 : 14))
</script>

<template>
	<div
		:class="[$style.screen, $style[layout], tone === 'failed' && $style.failed]"
		:role="tone === 'failed' ? 'alertdialog' : 'dialog'"
		aria-modal="true"
		:aria-labelledby="titleId"
		:aria-describedby="bodyId"
	>
		<div :class="$style.head">
			<span v-if="layout === 'window'" :class="$style.wordmark">Nulo</span>
			<div v-else :class="[$style.glyph, tone !== 'failed' && $style.breathing]" aria-hidden="true">
				<Icon name="passkey" :size="glyphSize" />
				<span v-if="tone === 'failed'" :class="$style.badge"><Icon name="close-circle" :size="badgeSize" color="red" /></span>
			</div>
			<span v-if="tag" :class="$style.tag">{{ tag }}</span>
		</div>

		<div :class="$style.main">
			<div v-if="layout === 'window'" :class="[$style.glyph, tone !== 'failed' && $style.breathing]" aria-hidden="true">
				<Icon name="passkey" :size="glyphSize" />
				<span v-if="tone === 'failed'" :class="$style.badge"><Icon name="close-circle" :size="badgeSize" color="red" /></span>
			</div>
			<div :class="$style.copy">
				<BrutalistTitle :id="titleId" :main="title[0]" :sub="title[1]" :size="layout === 'card' ? 'compact' : 'default'" />
				<div :class="$style.rule" />
				<p :id="bodyId" :class="$style.body" role="status" :data-testid="bodyTestid">{{ body }}</p>
			</div>
		</div>

		<div :class="[$style.foot, tone === 'finishing' && $style.hidden_in_place]" :inert="tone === 'finishing' || undefined">
			<p v-if="layout === 'window' && note && tone !== 'failed'" :class="$style.note">{{ note }}</p>
			<div :class="$style.actions"><slot name="actions" /></div>
		</div>
	</div>
</template>

<style module>
.tag {
	display: inline-flex;
	align-items: center;
	padding: 4px 8px;
	border: 1px solid var(--nulo-outline);
	font-family: var(--font-mono);
	font-size: 11px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--txt-secondary);
	background: var(--nulo-surface-low);
}

.screen {
	display: flex;
	flex-direction: column;
	box-sizing: border-box;

	background: var(--app-bg);
	color: var(--txt-primary);
}

.card {
	width: 100%;
	max-width: 360px;
	gap: 20px;
	padding: 24px;

	border: 1px solid var(--nulo-outline);
}

.window {
	flex: 1;
	min-height: 0;
	overflow-y: auto;

	border-top: 2px solid var(--nulo-accent);
}

.head {
	display: flex;
	align-items: center;
	gap: 16px;
}

.window .head {
	justify-content: space-between;
	gap: 12px;
	padding: 32px 32px 0;
}

.wordmark {
	font-family: var(--font-headline);
	font-size: 20px;
	font-weight: 700;
	letter-spacing: -0.04em;
	text-transform: uppercase;
	color: var(--txt-primary);
}

.main {
	display: flex;
	flex-direction: column;
}

.window .main {
	flex: 1;
	justify-content: center;
	gap: 28px;
	padding: 0 32px;
}

.glyph {
	position: relative;
	flex-shrink: 0;

	display: flex;
	align-items: center;
	justify-content: center;

	box-sizing: border-box;
	width: 40px;
	height: 40px;

	background: var(--nulo-surface);
	border: 1px solid var(--nulo-outline);
	color: var(--nulo-accent);
}

.window .glyph {
	width: 72px;
	height: 72px;
}

.failed .glyph {
	color: var(--txt-secondary);
}

.breathing {
	outline: 1px solid color-mix(in srgb, var(--nulo-accent) 45%, transparent);
	animation: breathe 3s ease-out infinite;
}

.badge {
	position: absolute;
	top: -9px;
	right: -9px;

	display: flex;
	align-items: center;
	justify-content: center;

	width: 18px;
	height: 18px;

	background: var(--app-bg);
	border-radius: 50%;
}

.window .badge {
	top: -12px;
	right: -12px;
	width: 24px;
	height: 24px;
}

.copy {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.window .copy {
	gap: 16px;
}

.rule {
	width: 40px;
	height: 2px;
	background: var(--nulo-accent);
}

.window .rule {
	width: 56px;
}

.failed .rule {
	background: var(--red);
}

.body {
	margin: 0;
	font-size: 13px;
	line-height: 1.5;
	color: var(--txt-secondary);
}

.window .body {
	max-width: 340px;
	font-size: 15px;
}

.foot {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.window .foot {
	padding: 24px 32px 32px;
}

.note {
	margin: 0;
	font-size: 12px;
	line-height: 1.5;
	color: var(--txt-support);
}

.actions {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.hidden_in_place {
	visibility: hidden;
}

@keyframes breathe {
	0% {
		outline-offset: 0;
		outline-color: color-mix(in srgb, var(--nulo-accent) 45%, transparent);
	}

	70%,
	100% {
		outline-offset: 10px;
		outline-color: transparent;
	}
}

/* "Disable animations" reads as reduced motion. */
@media (prefers-reduced-motion: reduce) {
	.breathing {
		animation: none;
	}
}

:global(.noanimations) .breathing {
	animation: none;
}
</style>
