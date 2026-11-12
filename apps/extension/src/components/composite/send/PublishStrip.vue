<script setup lang="ts">
/**
 * What the chain publishes, You · To · Amount, each with its mark and word. The cells are drawn only:
 * a screen reader hears the strip as one sentence, which also carries the route the cells imply.
 */
import { computed } from "vue"
import { type FactCell, factWord, type PayerKind, type PublishFacts, publishGlyph, stripSentence } from "./publish-facts"
import mark from "./publish-mark.module.css"

const props = withDefaults(defineProps<{ facts: PublishFacts; payer: PayerKind; name?: string | null }>(), { name: null })

const CELLS: { cell: FactCell; name: string; attr: string }[] = [
	{ cell: "you", name: "You", attr: "you" },
	{ cell: "recipient", name: "To", attr: "to" },
	{ cell: "amount", name: "Amount", attr: "amount" },
]

const spoken = computed(() => stripSentence(props.facts, props.name, props.payer))
const cells = computed(() => CELLS.map((c) => ({ ...c, glyph: publishGlyph(props.facts[c.cell]) })))
</script>

<template>
	<div :class="$style.strip" data-testid="send-review-strip" :data-you="facts.you" :data-to="facts.recipient" :data-amount="facts.amount">
		<span
			v-for="{ cell, name: cellName, attr, glyph } in cells"
			:key="cell"
			aria-hidden="true"
			:class="[$style.cell, mark[facts[cell]]]"
			:data-cell="attr"
		>
			<Icon v-if="glyph" :name="glyph" size="10" />
			<b :class="$style.name">{{ cellName }}</b>
			<span>{{ factWord(cell, facts) }}</span>
		</span>
		<span :class="$style.spoken" data-testid="send-review-strip-spoken">{{ spoken }}</span>
	</div>
</template>

<style module>
.strip {
	position: relative;
	display: flex;
	border: 1px solid var(--nulo-border);
}

.cell {
	composes: type--label-section from global;
	flex: 1 1 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 5px;

	padding: 6px 2px;

	white-space: nowrap;
}

.cell + .cell {
	border-left: 1px solid var(--nulo-border);
}

/* The facts sit at 10px semibold, a step under the bold 10px names, so every cell fits its text. */
.strip .cell {
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.08em;
}

/* Below the popup's width a cell's fact goes under its name when the strip cannot hold every cell on
 * one line. */
@media (width < 359px) {
	.strip .cell {
		flex-wrap: wrap;
		row-gap: 2px;
	}
}

.name {
	composes: type--tag-name from global;
	color: var(--nulo-secondary);
}

.spoken {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}
</style>
