<script setup lang="ts">
/**
 * Who is paid: the name, when the wallet has one for the address, and the address whole in two lines
 * of 33 whose bold start and end sit at the line edges, the parts a person compares. A look-alike
 * differs somewhere in the middle too, so nothing of it is hidden. The default slot sits under it.
 */
import { computed } from "vue"
import { addressHalves } from "@/utils/string"

const props = withDefaults(defineProps<{ address: string; name?: string | null; known?: boolean }>(), { name: null, known: true })

/** Bold at each end: the first ten characters (`0x` and eight digits) and the last eight. */
const START = 10
const END = 8

/** An address of any other length is never cut: it is all the first line. */
const parts = computed(() => {
	const split = addressHalves(props.address)
	if (!split) return { start: "", firstRest: props.address, secondRest: "", end: "" }
	const [first, second] = split
	return { start: first.slice(0, START), firstRest: first.slice(START), secondRest: second.slice(0, -END), end: second.slice(-END) }
})
</script>

<template>
	<section :class="$style.payee" aria-label="Who you are paying" data-testid="send-payee">
		<span :class="$style.label">To</span>
		<span :class="$style.who">
			<span v-if="name" :class="$style.name" data-testid="send-payee-name">{{ name }}</span>
			<span :class="$style.address" data-testid="send-payee-address">
				<span :class="$style.half" data-testid="send-payee-half-first"><span :class="$style.end">{{ parts.start }}</span>{{ parts.firstRest }}</span>
				<span :class="$style.half" data-testid="send-payee-half-second">{{ parts.secondRest }}<span :class="$style.end">{{ parts.end }}</span></span>
			</span>
		</span>
		<span v-if="!known" :class="$style.check" data-testid="send-payee-check">
			<Icon name="warning" size="12" aria-hidden="true" :class="$style.check_mark" />
			<span>You have not paid this address before. Check its start and end.</span>
		</span>
		<slot />
	</section>
</template>

<style module>
.payee {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.label {
	composes: type--label-section from global;
	align-self: flex-start;
	color: var(--nulo-secondary);
}

.who {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.name {
	composes: type--name from global;
	color: var(--txt-primary);
}

.address {
	display: block;
	width: fit-content;
	max-width: 100%;
	color: var(--nulo-secondary);
}

/* A half wraps only where the panel is too narrow for 33 characters, and then anywhere: it never
   scrolls sideways. */
.half {
	composes: type--meta from global;
	display: block;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.end {
	composes: type--data-lead from global;
	color: var(--txt-primary);
}

.check {
	composes: type--body from global;
	display: flex;
	align-items: baseline;
	gap: 6px;
	color: var(--txt-warning);
}

.check_mark {
	flex: none;
	color: var(--yellow);
}
</style>
