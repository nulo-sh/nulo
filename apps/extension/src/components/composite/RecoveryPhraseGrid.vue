<script setup lang="ts">
const props = defineProps<{
	words: readonly string[]
	columns: 3 | 4
	/** The root's testid; each word carries `<testId>-word` and Copy `<testId>-copy`. */
	testId: string
	/** The parent owns the clipboard write and its toast, and flashes this after a copy. */
	isCopied: boolean
}>()

const emit = defineEmits<{ copy: [] }>()
</script>

<template>
	<div v-if="props.words.length" :class="$style.wrapper" :data-testid="testId" translate="no">
		<!-- Page translation must never rewrite a recovery word. -->
		<ol :class="[$style.grid, columns === 4 ? $style.four : $style.three]">
			<li v-for="(word, i) in props.words" :key="i" :class="$style.cell">
				<span :class="$style.num">{{ i + 1 }}</span>
				<span :class="$style.word" :data-testid="`${testId}-word`">{{ word }}</span>
			</li>
		</ol>
		<Button variant="primary_outline" wide :data-testid="`${testId}-copy`" @click="emit('copy')">
			{{ isCopied ? "Copied" : "Copy" }}
		</Button>
	</div>
</template>

<style module>
.wrapper {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.grid {
	display: grid;
	gap: 4px 16px;
	margin: 0;
	padding: 16px 20px;
	list-style: none;
	background: var(--nulo-surface);
	border: 1px solid var(--nulo-border);
}

.three {
	grid-template-columns: repeat(3, 1fr);
}

.four {
	grid-template-columns: repeat(4, 1fr);
}

.cell {
	display: flex;
	align-items: baseline;
	gap: 8px;
	min-width: 0;
	line-height: 2;
}

.num {
	composes: type--meta from global;
	flex: none;
	width: 18px;
	color: var(--txt-tertiary);
}

.word {
	composes: type--input-data from global;
	color: var(--txt-primary);
	white-space: nowrap;
}
</style>
