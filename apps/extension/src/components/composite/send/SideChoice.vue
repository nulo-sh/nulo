<script setup lang="ts">
/**
 * One side of a transfer as a native radio group: Tab reaches the chosen side, the arrows move between
 * sides the token can take, and a side it cannot take is disabled. A choice is only a choice; the
 * publish line says what it shows.
 */
import { useId } from "vue"
import type { SendSide } from "./send-sides"

defineProps<{
	label: string
	words: Record<SendSide, string>
	hints: Partial<Record<SendSide, string | null>>
	disabled?: Partial<Record<SendSide, boolean>>
	/** Sides whose hint is still loading: a bar stands in its place. */
	loading?: Partial<Record<SendSide, boolean>>
	/** Stacks the choices, so each hint can be a sentence. */
	rows?: boolean
	/** The group's testid; each choice is `<prefix>-<side>` and its hint `<hintPrefix>-<side>`. */
	testid: string
	prefix: string
	hintPrefix?: string
}>()
const side = defineModel<SendSide>({ required: true })

const SIDES: SendSide[] = ["private", "public"]
const name = useId()
const labelId = `${name}-label`
</script>

<template>
	<div :class="$style.wrap">
		<span :id="labelId" :class="$style.label">{{ label }}</span>
		<div :class="[$style.group, rows && $style.rows]" role="radiogroup" :aria-labelledby="labelId" :data-testid="testid" :data-side="side">
			<label v-for="s in SIDES" :key="s" :class="[$style.choice, side === s && $style.on, disabled?.[s] && $style.off]" :data-testid="`${prefix}-${s}-choice`">
				<input
					type="radio"
					:name="name"
					:value="s"
					:checked="side === s"
					:disabled="disabled?.[s]"
					:class="$style.radio"
					:data-testid="`${prefix}-${s}`"
					@change="side = s"
				/>
				<span :class="$style.top">
					<Icon :name="s" size="12" aria-hidden="true" />
					<span :class="$style.word">{{ words[s] }}</span>
				</span>
				<Skeleton v-if="loading?.[s]" :width="56" :height="10" />
				<span v-else-if="hints[s]" :class="rows ? $style.sentence : $style.hint" :data-testid="hintPrefix ? `${hintPrefix}-${s}` : undefined">{{ hints[s] }}</span>
			</label>
		</div>
	</div>
</template>

<style module>
.wrap {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.group {
	display: flex;
	gap: 6px;
}

.choice {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex: 1;
	min-width: 0;
	padding: 7px 10px;
	border: 1px solid var(--nulo-border);
	color: var(--txt-primary);
	cursor: pointer;

	&:focus-within {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 1px;
	}
}

/* Over the whole choice, so a press anywhere on it picks the side. */
.radio {
	position: absolute;
	inset: 0;
	margin: 0;
	opacity: 0;
	cursor: pointer;
}

.top {
	display: flex;
	align-items: center;
	gap: 6px;
}

.word {
	composes: type--name from global;
}

.on {
	border-color: var(--nulo-accent);
	box-shadow: inset 3px 0 0 var(--nulo-accent);
	background: var(--nulo-surface-low);
}

.off {
	color: var(--txt-tertiary);
	cursor: not-allowed;
	background: repeating-linear-gradient(135deg, transparent 0 6px, var(--nulo-surface-low) 6px 12px);

	& .radio {
		cursor: not-allowed;
	}

	& .word {
		text-decoration: line-through;
	}
}

.rows {
	flex-direction: column;
}

.sentence {
	composes: type--body from global;
	color: var(--txt-secondary);
}

.hint {
	composes: type--meta from global;
	overflow-wrap: anywhere;
	color: var(--nulo-secondary);
}
</style>
