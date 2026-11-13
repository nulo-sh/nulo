<script setup lang="ts">
/**
 * Send's fee in one line pinned over the button, with Change to the full card. It says what the card
 * would say in the form, in the card's words: the cost and who pays it, the estimate's state, the queue,
 * and the card's notices on the line under it.
 */
import { computed, nextTick, useTemplateRef } from "vue"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import type { FeeDisplay } from "@/utils/fee-estimation"
import FeeLineText from "./FeeLineText.vue"
import { type FeeLinePayer, feeLine, feeLineNotes } from "./fee-line-words"

const props = withDefaults(
	defineProps<{
		/** Null until the card names who pays. */
		payer: FeeLinePayer | null
		/** A hand-added sponsor's name, already safe to show. */
		payerName?: string | null
		display: FeeDisplay | null
		estimating?: boolean
		slow?: boolean
		failed?: boolean
		queued?: boolean
		queuedCap?: { about: FeeDisplay; cap: FeeDisplay } | null
		queuedSponsored?: boolean
		notices?: string[]
		/** The sheet Change opens is open. */
		open?: boolean
	}>(),
	{
		payerName: null,
		estimating: false,
		slow: false,
		failed: false,
		queued: false,
		queuedCap: null,
		queuedSponsored: false,
		notices: () => [],
		open: false,
	},
)
const emit = defineEmits<{ change: []; retry: [] }>()

const line = computed(() => feeLine(props))
const notes = computed(() => feeLineNotes(line.value, props.notices))

const changeEl = useTemplateRef<HTMLButtonElement>("changeEl")
/** A retry replaces its own button, so the keyboard it held moves on to Change. */
function retry(e: Event) {
	const held = e.currentTarget === document.activeElement
	emit("retry")
	if (held) nextTick(() => changeEl.value?.focus())
}
</script>

<template>
	<div :class="$style.wrap" data-testid="send-fee-line" :data-payer="payer ?? 'none'">
		<div :class="$style.line">
			<span :class="$style.key">Fee</span>
			<span :class="$style.value" data-testid="send-fee-line-value">
				<span v-if="line.kind === 'words'"><FeeLineText :words="line.value" /></span>
				<Skeleton v-else-if="line.kind === 'bar'" :width="96" :height="10" />
				<template v-else-if="line.kind === 'slow'">
					<span :class="$style.muted">Taking longer than usual.</span>
					<button type="button" :class="$style.link" data-testid="send-fee-line-retry" @click="retry">Try again</button>
				</template>
				<template v-else>
					<span class="color--txt-danger">Couldn't estimate fee.</span>
					<button type="button" :class="$style.link" data-testid="send-fee-line-retry" @click="retry">Try again</button>
				</template>
			</span>
			<button
				ref="changeEl"
				type="button"
				:class="[$style.link, $style.change]"
				data-testid="send-fee-change"
				aria-haspopup="dialog"
				:aria-expanded="open"
				@keydown.enter="refuseRepeatEnter"
				@click="emit('change')"
			>
				Change
			</button>
		</div>
		<div role="status" aria-live="polite" aria-atomic="true" :class="$style.notes" data-testid="send-fee-line-note">
			<p v-for="note in notes" :key="note.text" :class="$style.note"><FeeLineText :words="note" /></p>
		</div>
	</div>
</template>

<style module>
.wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

/* Where the value cannot hold its fee whole beside Change, Change takes the next row. */
.line {
	composes: type--body from global;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 8px;
	color: var(--txt-primary);
}

.key {
	composes: type--label-section from global;
	flex: none;
	min-width: 32px;
	color: var(--nulo-secondary);
}

/* No `min-width: 0`: the column is never narrower than its fee. */
.value {
	flex: 1;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
}

.muted {
	color: var(--txt-secondary);
}

.link {
	composes: type--label-section from global;
	flex: none;
	background: none;
	color: var(--nulo-accent);
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.change {
	align-self: baseline;
	margin-left: auto;
}

.notes {
	display: flex;
	flex-direction: column;
	padding-left: 40px;

	&:empty {
		display: none;
	}
}

.note {
	composes: type--body from global;
	margin: 0;
	color: var(--txt-secondary);
}
</style>
