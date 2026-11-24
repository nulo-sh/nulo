<script setup lang="ts">
/**
 * Stands where a call's arguments will read while the wallet still reads them: a label and value
 * pair of bars per field the call carries, at most four, or one bar on a sentence's line. The bars
 * say nothing to assistive tech; the words do, unless the block is `decorative`. A host that wants a
 * live region puts its role on the root.
 */
import { Skeleton } from "@nulo/design"

const props = defineProps<{
	/** The call's field count, known before its reading lands. Absent, one bar holds a line. */
	fields?: number
	/** The host already says the arguments are being read: the block draws its bars and no words. */
	decorative?: boolean
}>()

/** Shaped on a transfer's four decoded rows, the common call, so its reading lands with no jump. */
const LABEL_WIDTHS = [44, 28, 56, 92]
const VALUE_WIDTHS = [132, 132, 72, 132]

const pairs = computed(() => Math.min(props.fields ?? 0, LABEL_WIDTHS.length))
</script>

<template>
	<div :class="fields === undefined ? $style.line : $style.pairs" :aria-hidden="decorative || undefined">
		<span v-if="!decorative" :class="$style.words">Reading arguments…</span>
		<Skeleton v-if="fields === undefined" :width="148" :height="9" />
		<template v-else>
			<span v-for="n in pairs" :key="n" :class="$style.pair">
				<Skeleton :width="LABEL_WIDTHS[n - 1]" :height="9" />
				<Skeleton :width="VALUE_WIDTHS[n - 1]" :height="9" />
			</span>
		</template>
	</div>
</template>

<style module>
.words {
	composes: visually_hidden from "@/components/a11y.module.css";
}

/* A decoded row is one 13 px line and rows sit 2 px apart, so the pairs take the rows' height. */
.pairs {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.pair {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 13px;
}

/* One line of body text. */
.line {
	position: relative;
	display: flex;
	align-items: center;
	min-height: 17px;
}
</style>
