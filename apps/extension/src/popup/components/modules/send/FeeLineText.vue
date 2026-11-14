<script setup lang="ts">
/** Words that hold a fee never open with a hand-added sponsor's sentence, so only words with none go
 *  through `FpcSentence`. */
import { computed } from "vue"
import FpcSentence from "@/components/composite/send/FpcSentence.vue"
import type { FeeWords } from "./fee-line-words"

const props = defineProps<{ words: FeeWords }>()

const parts = computed(() => {
	const { text, figure } = props.words
	const at = figure ? text.indexOf(figure) : -1
	if (!figure || at < 0) return null
	return { before: text.slice(0, at), figure, after: text.slice(at + figure.length) }
})
</script>

<template>
	<template v-if="parts">{{ parts.before }}<span :class="$style.figure" data-testid="send-fee-figure">{{ parts.figure }}</span>{{ parts.after }}</template>
	<FpcSentence v-else :text="words.text" />
</template>

<style module>
.figure {
	composes: whole from "./fee-shared.module.css";
}
</style>
