<script setup lang="ts">
/**
 * A bordered mono search box: icon + native input. It keeps every visible character, since a symbol
 * may hold any punctuation, and none of the ones `stripBidiAndZeroWidth` removes.
 */
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
	const kept = stripBidiAndZeroWidth(el.value)
	if (kept !== el.value) {
		// Rewriting the value puts the caret at the end; it goes back after what preceded it.
		const caret = stripBidiAndZeroWidth(el.value.slice(0, el.selectionStart ?? undefined)).length
		el.value = kept
		el.setSelectionRange(caret, caret)
	}
	emit("update:modelValue", kept)
}
</script>

<template>
	<label :class="$style.search">
		<Icon name="search" :size="16" color="secondary" />
		<input
			:value="modelValue"
			@input="onInput"
			@compositionend="onInput"
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
