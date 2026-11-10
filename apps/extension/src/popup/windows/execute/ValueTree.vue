<script setup lang="ts">
/**
 * One decoded value as rows: a struct or an array is its name's row, then one row per field or item
 * under a guide; any other value is one name and value row. No row holds another, so every
 * `-decoded-param` row is one name, and only the guides and the DOM carry a value's ancestry. A
 * decode may hold 32,769 rows, so a row is native elements carrying `Flex`'s and `Text`'s classes,
 * not three component instances.
 */
import type { DecodedValue } from "@/wallet/services/execution/client"
import { safeWire } from "./humanize"
import { valueText, valueTitle } from "./call-surface"

defineOptions({ name: "ValueTree" })

const props = withDefaults(
	defineProps<{
		name: string
		value: DecodedValue
		/** Prefix for every `data-testid`, the host surface's. */
		prefix: string
		/** Every value prints whole, under its name, an address as its own text. */
		full?: boolean
		depth?: number
	}>(),
	{ full: false, depth: 0 },
)

const children = computed(() => {
	const v = props.value
	if (v.kind === "struct") return v.fields.map((f) => ({ name: f.name, value: f.value }))
	if (v.kind === "array") return v.items.map((value, i) => ({ name: `[${i}]`, value }))
	return []
})
const isBranch = computed(() => children.value.length > 0)
/** An empty struct or array reads as one value, so the name never stands alone. */
const emptyText = computed(() => (props.value.kind === "array" ? "[]" : props.value.kind === "struct" ? "{}" : undefined))
const scalar = computed(() => (props.value.kind === "array" || props.value.kind === "struct" ? undefined : props.value))
/** Past the sixth level, or the fourth in a narrow window, a level indents by its guide alone, so a
 *  value 32 levels deep still has the card's width to print in. */
const indent = computed(() => (props.depth + 1 > 6 ? "tight" : props.depth + 1 > 4 ? "narrow" : "wide"))
</script>

<template>
	<div
		:data-testid="`${prefix}-decoded-param`"
		:data-param="name"
		:data-value-kind="value.kind"
		:data-depth="depth"
		:class="['flex justify-between', $style.row, full && !isBranch && $style.full]"
	>
		<span :data-testid="`${prefix}-decoded-param-name`" :class="['type--label-section lh--100 color--secondary', $style.name]">{{ safeWire(name, 32) }}:</span>
		<template v-if="!isBranch">
			<span v-if="emptyText" :data-testid="`${prefix}-decoded-param-value`" :class="['type--meta lh--100 color--primary', $style.value]">{{ emptyText }}</span>
			<AddressDisplay
				v-else-if="scalar?.kind === 'address' && !full"
				:data-testid="`${prefix}-decoded-param-value`"
				:address="scalar.value"
				:class="$style.value"
			/>
			<span
				v-else-if="scalar"
				:data-testid="`${prefix}-decoded-param-value`"
				:title="valueTitle(scalar)"
				:class="['type--meta lh--100 color--primary', $style.value]"
			>{{ valueText(scalar, full) }}</span>
		</template>
	</div>
	<div v-if="isBranch" :class="[$style.children, $style[indent]]">
		<ValueTree v-for="(c, i) in children" :key="i" :name="c.name" :value="c.value" :prefix="prefix" :full="full" :depth="depth + 1" />
	</div>
</template>

<style module>
/* A dApp's artifact names each parameter and supplies its value; either may run long and unbroken.
 * The name keeps its own width up to 60% of the row, so a long value cannot crush it a letter a line. */
.row {
	width: 100%;
	gap: 12px;
}

.name {
	flex: 0 0 auto;
	max-width: 60%;
	overflow-wrap: anywhere;
}

.value {
	flex: 1 1 0;
	min-width: 0;
	overflow-wrap: anywhere;
	text-align: right;
}

/* A whole value takes the row's full width, under its name. */
.full {
	flex-direction: column;
	gap: 2px;

	> .name {
		max-width: none;
	}

	> .value {
		text-align: left;
	}
}

.children {
	display: flex;
	flex-direction: column;
	gap: 2px;
	border-left: 1px solid var(--nulo-border);
}

.wide,
.narrow {
	margin-left: 3px;
	padding-left: 11px;
}

.tight {
	padding-left: 1px;
}

/* Below the popup's width a value goes under its name, at the right, when the two do not fit side by
 * side, so a name breaks only inside a word wider than the card. */
@media (width < 359px) {
	.row:not(.full) {
		flex-wrap: wrap;
		row-gap: 2px;

		> .name {
			max-width: none;
			overflow-wrap: break-word;
		}

		> .value {
			flex: 0 1 auto;
			margin-left: auto;
		}
	}
}

@media (width < 300px) {
	.narrow {
		margin-left: 0;
		padding-left: 1px;
	}
}
</style>
