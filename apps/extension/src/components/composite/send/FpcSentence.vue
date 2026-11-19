<script setup lang="ts">
/**
 * Prints a sentence; when it opens with one of a hand-added sponsor's two sentences, that sentence's
 * "FPC" is the glossary's dotted term. Only the constant is dotted, so a name after it never is.
 */
import { computed } from "vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { UNVOUCHED_FEE_SENTENCE, UNVOUCHED_PUBLISH_SENTENCE } from "./publish-facts"

const props = defineProps<{ text: string }>()

const parts = computed(() => {
	const lead = [UNVOUCHED_PUBLISH_SENTENCE, UNVOUCHED_FEE_SENTENCE].find((s) => props.text.startsWith(s))
	if (!lead) return null
	const at = lead.indexOf("FPC")
	return { before: lead.slice(0, at), after: lead.slice(at + 3) + props.text.slice(lead.length) }
})
</script>

<template>
	<template v-if="parts">{{ parts.before }}<DottedTerm term="fpc" testid="send-fpc-term">FPC</DottedTerm>{{ parts.after }}</template>
	<template v-else>{{ text }}</template>
</template>
