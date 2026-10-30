<script setup lang="ts">
/** Vendor */
import type { GlyphName, TextColorName } from "@nulo/design"
import type { PropType } from "vue"

/** Composables */
import { refuseRepeatEnter } from "@/composables/usePopupEntity"

/** Utils */
import type { TakeoverAction, TakeoverContent, TakeoverDensity, TakeoverMark } from "./takeover"

const emit = defineEmits<{ chip: []; lock: [] }>()
const props = defineProps({
	content: { type: Object as PropType<TakeoverContent>, required: true },
	/** The top bar's network chip. */
	chip: { type: String, required: true },
	/** The chip's square: its network is the one the screen is about. */
	flagged: { type: Boolean, default: false },
	/** While true, the primary and every guarded action are disabled. */
	busy: { type: Boolean, default: false },
	density: { type: String as PropType<TakeoverDensity>, default: undefined },
	/** The layout's own testids are `<prefix>-<part>`; the content's carry theirs. */
	testidPrefix: { type: String, required: true },
})

const MARKS: Record<TakeoverMark, { icon: GlyphName; color: TextColorName }> = {
	check: { icon: "check", color: "primary" },
	cross: { icon: "close", color: "orange" },
	swap: { icon: "swap", color: "txt-warning" },
}

const outlined = computed(() => [props.content.secondary, props.content.tertiary].filter((a): a is TakeoverAction => a !== undefined))
const id = (part: string) => `${props.testidPrefix}-${part}`
</script>

<template>
	<Flex direction="column" :class="$style.screen" :data-testid="id('takeover')">
		<div :class="$style.top_bar">
			<button type="button" :class="$style.chip" :data-testid="id('chip')" @click="emit('chip')">
				{{ chip }}<span v-if="flagged" :class="$style.chip_square" />
			</button>
			<button type="button" :class="[$style.chip, $style.lock]" :data-testid="id('lock')" aria-label="Lock wallet" @click="emit('lock')">
				<Icon name="lock" :size="15" aria-hidden="true" />
			</button>
		</div>

		<div :class="[$style.content, density && $style[density]]">
			<div :class="$style.eyebrow">
				<Icon :name="content.eyebrow.icon" :size="16" :color="content.eyebrow.color ?? 'txt-warning'" aria-hidden="true" />
				<span :class="$style.eyebrow_text">{{ content.eyebrow.text }}</span>
			</div>
			<h1 :class="$style.title" :data-testid="id('title')">{{ content.title }}</h1>
			<p :class="$style.body">{{ content.body }}</p>
			<div v-if="content.notice" :class="$style.notice" :data-testid="id('notice')">{{ content.notice }}</div>
			<div v-if="content.box" :class="$style.box" :data-testid="id('box')">
				<span v-if="content.box.label" :class="$style.box_label">{{ content.box.label }}</span>
				<div v-for="line in content.box.lines" :key="line.text" :class="$style.line" :data-testid="line.testid">
					<span v-if="line.number" :class="$style.number">{{ line.number }}</span>
					<Icon v-else-if="line.mark" :name="MARKS[line.mark].icon" :size="14" :color="MARKS[line.mark].color" :class="$style.mark" aria-hidden="true" />
					<span>{{ line.text }}</span>
				</div>
			</div>
			<span v-if="content.note" :class="$style.note" :data-testid="id('note')">{{ content.note }}</span>
		</div>

		<div :class="[$style.actions, density === 'dense_notice' && $style.actions_notice]">
			<button
				type="button"
				:class="$style.primary"
				:data-testid="content.primary.testid"
				:disabled="busy"
				@keydown="refuseRepeatEnter"
				@click="content.primary.action"
			>
				{{ content.primary.text }}
			</button>
			<button
				v-for="action in outlined"
				:key="action.testid"
				type="button"
				:class="$style.secondary"
				:data-testid="action.testid"
				:disabled="action.guarded && busy"
				@keydown="action.guarded && refuseRepeatEnter($event)"
				@click="action.action"
			>
				{{ action.text }}
			</button>
		</div>

		<slot />
	</Flex>
</template>

<style module>
.screen {
	flex: 1;
	min-height: 0;
	background: var(--app-bg);
}

.top_bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px;
	border-bottom: 1px solid var(--hairline-strong);
}

.chip {
	composes: type--label-section from global;
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: 60%;
	padding: 7px 10px;
	color: var(--txt-primary);
	background: transparent;
	border: 1px solid var(--nulo-outline);
	cursor: pointer;
}

/* With no text of its own, it takes the height of the network chip beside it. */
.lock {
	align-self: stretch;
	padding-block: 0;
}

.chip:focus-visible,
.primary:focus-visible,
.secondary:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}

.chip_square {
	flex: none;
	width: 7px;
	height: 7px;
	background: var(--yellow);
}

.content {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 22px 20px 0;
	overflow-y: auto;
}

.content.dense_notice {
	gap: 13px;
	padding-top: 20px;
}

.content.dense_tight {
	gap: 11px;
	padding-top: 18px;
}

.eyebrow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.eyebrow_text {
	composes: type--meta from global;
	color: var(--txt-secondary);
}

.title {
	composes: type--row-title from global;
	margin: 0;
	font-size: 26px;
	line-height: 1.15;
	color: var(--txt-primary);
	overflow-wrap: anywhere;
}

.body {
	composes: type--body from global;
	margin: 0;
	line-height: 1.55;
	color: var(--txt-body);
}

.notice {
	composes: type--body from global;
	padding: 10px 12px;
	line-height: 1.45;
	color: var(--txt-warning);
	background: color-mix(in srgb, var(--yellow) 7%, transparent);
	border: 1px solid color-mix(in srgb, var(--yellow) 45%, transparent);
}

.box {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	background: var(--card-bg);
	border: 1px solid var(--border);
}

.dense_tight .box {
	gap: 8px;
	padding: 12px 14px;
}

.box_label {
	composes: type--meta from global;
	color: var(--txt-secondary);
}

.line {
	composes: type--body from global;
	display: flex;
	align-items: flex-start;
	gap: 10px;
	line-height: 1.45;
	color: var(--txt-primary);
}

.mark {
	margin-top: 2px;
}

.number {
	composes: type--meta from global;
	flex: none;
	width: 14px;
	text-align: center;
	color: var(--txt-warning);
}

.note {
	composes: type--body from global;
	color: var(--txt-secondary);
}

.actions {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 16px 20px 20px;
}

.actions_notice {
	padding-top: 14px;
}

.primary {
	composes: type--button from global;
	height: 48px;
	cursor: pointer;
	color: var(--txt-inverse);
	background: var(--nulo-accent);
	border: 0;
}

.primary:disabled {
	cursor: default;
	opacity: 0.6;
}

.secondary {
	composes: type--button from global;
	height: 48px;
	cursor: pointer;
	color: var(--txt-primary);
	background: transparent;
	border: 1px solid var(--nulo-outline);
}
</style>
