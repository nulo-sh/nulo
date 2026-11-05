<script setup lang="ts">
/** No `sanitize`-style filter: a token symbol may hold any punctuation. */
import { bareAztecAddress } from "@/utils/aztec-address"
import { stripBidiAndZeroWidth } from "@/utils/string"

defineProps({
	modelValue: { type: String, required: true },
	placeholder: { type: String, default: "Search" },
	testid: { type: String, default: undefined },
})
const emit = defineEmits<{ "update:modelValue": [value: string] }>()

// A composing keystroke is emitted as typed, never rewritten under the input method; the text it
// commits is judged at `compositionend`, which no further `input` may follow.
const onInput = (e: Event) => {
	const el = e.target as HTMLInputElement
	if ((e as InputEvent).isComposing) {
		emit("update:modelValue", el.value)
		return
	}
	const stripped = stripBidiAndZeroWidth(el.value)
	// An address keeps nothing at its two ends; any other text keeps its spaces.
	const bare = bareAztecAddress(stripped)
	const kept = bare ?? stripped
	if (kept !== el.value) {
		// Rewriting the value puts the caret at the end; it goes back after what preceded it.
		const caret = bare?.length ?? stripBidiAndZeroWidth(el.value.slice(0, el.selectionStart ?? undefined)).length
		el.value = kept
		el.setSelectionRange(caret, caret)
	}
	emit("update:modelValue", kept)
}

// `maxlength` cuts a paste before `input` runs, so a padded address it would cut is judged whole.
const onPaste = (e: ClipboardEvent) => {
	const el = e.target as HTMLInputElement
	const start = el.selectionStart ?? el.value.length
	const text = el.value.slice(0, start) + (e.clipboardData?.getData("text") ?? "") + el.value.slice(el.selectionEnd ?? start)
	const bare = text.length > el.maxLength ? bareAztecAddress(stripBidiAndZeroWidth(text)) : undefined
	if (bare === undefined) return
	e.preventDefault()
	el.value = bare
	emit("update:modelValue", bare)
}
</script>

<template>
	<label :class="$style.search">
		<Icon name="search" :size="16" color="secondary" />
		<input
			:value="modelValue"
			@input="onInput"
			@compositionend="onInput"
			@paste="onPaste"
			type="text"
			:placeholder="placeholder"
			maxlength="80"
			autocomplete="off"
			spellcheck="false"
			:data-testid="testid"
			:class="$style.search_input"
		/>
	</label>
</template>

<style module>
.search {
	display: flex;
	align-items: center;
	gap: 8px;

	height: 36px;
	padding: 0 10px;
	border: 1px solid var(--nulo-outline);
	background: var(--nulo-surface);
	cursor: text;
}

.search_input {
	composes: type--input-data from global;
	flex: 1;
	min-width: 0;

	color: var(--txt-primary);
	background: transparent;
	border: none;
	outline: none;

	&::placeholder {
		color: var(--nulo-secondary);
	}
}
</style>
