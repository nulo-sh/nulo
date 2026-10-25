<script setup lang="ts">
/**
 * Selected send-recipient summary. Shows the account/contact name + the address
 * masked as `0x??????…????????` (first 8 / last 8). A tap on the eye reveals the
 * FULL address (mono, selectable) — the recipient-verification surface for the
 * send screen (which submits + navigates away with no later confirm step).
 * Reveal is OPTIONAL by design (user decision); the masked form is a glance
 * summary, the reveal is for 100% certainty (select the text to copy if needed).
 */
import { computed, ref, useTemplateRef } from "vue"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { maskAddress } from "./masked-address"

/** Macros */
const props = defineProps<{
	name?: string
	address: string
}>()
const emit = defineEmits<{ change: [] }>()
// `focusVisible`: a script focus carries no keyboard event a browser could infer the ring from.
defineExpose({ focusChange: () => changeBtn.value?.focus({ focusVisible: true }) })

/** Reactive state */
const revealed = ref(false)
const changeBtn = useTemplateRef<HTMLButtonElement>("changeBtn")

const masked = computed(() => maskAddress(props.address))

/** Handlers */
const toggleReveal = () => {
	revealed.value = !revealed.value
}
</script>

<template>
	<Flex direction="column" gap="10" :class="$style.card" data-testid="recipient-card" :data-address="address">
		<Flex align="center" justify="between" gap="10" wide :class="$style.head">
			<Flex align="center" gap="10" :class="$style.identity">
				<AccountAvatar :name="name" :size="36" />
				<Flex direction="column" gap="2" :class="$style.text">
					<Text variant="name" color="primary" noWrap :class="[$style.name, $style.name_size]">
						{{ name || "Address" }}
					</Text>
					<Text variant="meta" color="tertiary" noWrap data-testid="recipient-card-masked">
						{{ masked }}
					</Text>
				</Flex>
			</Flex>
			<Flex align="center" gap="4" :class="$style.actions">
				<button
					type="button"
					:class="$style.icon_btn"
					data-testid="recipient-card-reveal"
					:aria-label="revealed ? 'Hide full address' : 'Reveal full address'"
					@click="toggleReveal"
				>
					<Icon :name="revealed ? 'eye-off' : 'eye'" size="16" color="secondary" />
				</button>
				<button
					ref="changeBtn"
					type="button"
					:class="$style.icon_btn"
					data-testid="recipient-card-change"
					aria-label="Change recipient"
					@click="emit('change')"
					@keydown.enter="refuseRepeatEnter"
				>
					<Icon name="close" size="16" color="secondary" />
				</button>
			</Flex>
		</Flex>

		<Flex v-if="revealed" :class="$style.reveal" data-testid="recipient-card-full">
			<Text variant="meta" color="primary" selectable :class="$style.full_addr" data-testid="recipient-card-full-address">
				{{ address }}
			</Text>
		</Flex>
	</Flex>
</template>

<style module>
/* Style D — field-style underline: no box, a single bottom rule (matches the
 * brutalist input fields), flush horizontal. */
.card {
	background: transparent;
	border-bottom: 1px solid var(--nulo-border);
	padding: 14px 0;
}

.identity {
	min-width: 0;
	flex: 1;
}

.text {
	min-width: 0;
}

.name {
	max-width: 100%;
	text-overflow: ellipsis;
	overflow: hidden;
}

.name_size {
	font-size: 14px;
}

.actions {
	flex-shrink: 0;
}

.icon_btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	background: transparent;
	cursor: pointer;
	transition: background 0.2s var(--bezier);
}

.icon_btn:hover {
	background: var(--nulo-surface-high);
}

/* Restores the focus indication the base `button` reset removes. */
.icon_btn:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}

.reveal {
	padding-top: 10px;
	border-top: 1px solid var(--nulo-border);
}

.full_addr {
	word-break: break-all;
	line-height: 1.4 !important;
}

/* Below the popup's width the head wraps: the identity keeps its whole width where the line has it,
 * so the buttons go under it, at the right, rather than cut the shortened address, and a name wraps
 * rather than end in an ellipsis. Two classes outrank the global `gap--10`. */
@media (width < 359px) {
	.card > .head {
		flex-wrap: wrap;
		row-gap: 8px;
	}

	.head > .identity {
		flex: 1 1 auto;
		max-width: 100%;
	}

	.head > .actions {
		margin-left: auto;
	}

	.head .name {
		white-space: normal;
		overflow-wrap: anywhere;
	}
}
</style>
