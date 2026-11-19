<script setup lang="ts">
/**
 * One press row over content it raises above a stretched `RowTarget`, so the content's text stays
 * selectable and its own controls stay siblings of the button, never inside it. The row's attributes
 * land on that button.
 */
import RowTarget from "@/components/ui/RowTarget.vue"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { endsSelection } from "@/utils/selection"

defineOptions({ inheritAttrs: false })

const props = defineProps<{
	open: boolean
	/** The row's accessible name; `describedby` names what reads after it. */
	name: string
	/** The ids, space-separated, of the elements that describe the row. */
	describedby?: string
	/** The ids, space-separated, of the panels the row shows, named only while they are rendered. */
	controls: string
}>()

const emit = defineEmits<{ toggle: [] }>()

const nameId = useId()

/** A press on another control inside the row stays that control's, and a drag that selects the row's
 *  text ends in a click on it: neither toggles. The search stops at the row, so a focusable ancestor
 *  of the row never counts as a control inside it. */
const onClick = (event: MouseEvent): void => {
	const row = event.currentTarget as HTMLElement
	const control = (event.target as Element | null)?.closest("a[href], button, [tabindex]")
	const own = control?.parentElement === row && control.hasAttribute("data-row-target")
	if (control && row.contains(control) && !own) return
	// The row's own textless button cannot end a selection, so a selection a drag left stands aside.
	if (own || !endsSelection(event)) emit("toggle")
}
</script>

<template>
	<div :class="$style.row" @click="onClick">
		<RowTarget
			v-bind="$attrs"
			:labelledby="nameId"
			:aria-describedby="describedby"
			:aria-expanded="props.open"
			:aria-controls="props.open ? controls : undefined"
			@keydown.enter="refuseRepeatEnter"
		/>
		<span :id="nameId" hidden>{{ name }}</span>
		<div :class="$style.raised"><slot /></div>
	</div>
</template>

<style module>
/* The margin takes the padding back, so nothing around the row moves and a one-line row's press stands
 * 26 px tall. */
.row {
	position: relative;
	margin: -5px -6px;
	padding: 5px 6px;
	cursor: pointer;
	transition: background 0.15s var(--bezier);

	&:hover,
	&:has(> [data-row-target]:focus-visible) {
		background: var(--nulo-surface-low);
	}

	&:has(> [data-row-target]:focus-visible) {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.raised {
	position: relative;
	z-index: 1;
}
</style>
