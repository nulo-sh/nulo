<script setup>
/** Composables */
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { neverOpened } from "@/composables/useStaleNetwork"

/** Utils */
import { trimAddress } from "@/utils/string"
import * as copy from "./copy"

const props = defineProps({
	show: { type: Boolean, default: false },
	/** The stale network's view; its accounts are the ones the reset re-creates. */
	view: { type: Object, required: true },
})
const emit = defineEmits(["onClose", "confirm"])

const c = computed(() =>
	copy.confirm(
		props.view.name,
		props.view.accounts.length,
		props.view.cause.addressesMoved,
		props.view.switchToSeedNode && neverOpened(props.view),
	),
)
const notice = computed(() =>
	props.view.unmovable.length > 0 ? copy.unmovableNotice(props.view.unmovable, props.view.cause.addressesMoved) : undefined,
)

/** RESET answers once per opening: a double click or a repeated activation starts nothing twice. */
const submitted = ref(false)
const submit = () => {
	if (submitted.value) return
	submitted.value = true
	emit("confirm")
}

watch(
	() => props.show,
	(show) => {
		if (show) submitted.value = false
	},
)
</script>

<template>
	<Popup :show :displaceIdx="0" initialFocus="[data-testid='stale-confirm-cancel']" @onClose="emit('onClose')">
		<div role="dialog" aria-modal="true" aria-labelledby="stale-confirm-title" :class="$style.card" data-testid="stale-confirm">
			<span :class="$style.pre_title">{{ c.preTitle }}</span>
			<h2 id="stale-confirm-title" :class="$style.title">{{ c.title }}</h2>
			<p :class="$style.body">{{ c.body }}</p>
			<div v-if="view.accounts.length" :class="$style.accounts">
				<div v-for="account in view.accounts" :key="account.address" :class="$style.account" data-testid="stale-confirm-account">
					<span :class="$style.account_name">{{ account.name }}</span>
					<span :class="$style.account_address" data-testid="stale-confirm-account-address">{{
						trimAddress(account.address, 6, 4, "...")
					}}</span>
				</div>
			</div>
			<div v-if="notice" :class="$style.notice" data-testid="stale-confirm-unmovable">{{ notice }}</div>
			<div :class="$style.buttons">
				<button type="button" :class="$style.cancel" data-testid="stale-confirm-cancel" @click="emit('onClose')">{{ c.cancel }}</button>
				<button
					type="button"
					:class="$style.submit"
					:disabled="submitted"
					data-testid="stale-confirm-submit"
					@keydown="refuseRepeatEnter"
					@click="submit"
				>
					{{ c.submit }}
				</button>
			</div>
		</div>
		<!-- The lower close area mirrors Popup's upper one, so the card sits centred. -->
		<div :class="$style.close_area" @click="emit('onClose')" />
	</Popup>
</template>

<style module>
.card {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin: 0 20px;
	padding: 20px;
	background: var(--card-bg);
	border: 1px solid var(--nulo-outline);
}

.close_area {
	flex: 1;
	width: 100%;
	min-height: 40px;
}

.pre_title {
	composes: type--meta from global;
	color: var(--txt-secondary);
}

.title {
	composes: type--row-title from global;
	margin: 0;
	font-size: 20px;
	color: var(--txt-primary);
	overflow-wrap: anywhere;
}

.body {
	composes: type--body from global;
	margin: 0;
	line-height: 1.55;
	color: var(--txt-body);
}

.accounts {
	display: flex;
	flex-direction: column;
	max-height: 160px;
	overflow-y: auto;
	border: 1px solid var(--border);
}

.account {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 10px 12px;
}

.account + .account {
	border-top: 1px solid var(--hairline-strong);
}

.account_name {
	composes: type--name from global;
	min-width: 0;
	font-size: 13px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--txt-primary);
}

.account_address {
	composes: type--meta from global;
	flex: none;
	color: var(--txt-secondary);
}

/* Below the popup's width an account's shortened address goes under its name when the two do not fit
 * side by side, and the name wraps rather than end in an ellipsis. */
@media (width < 359px) {
	.account {
		flex-wrap: wrap;
		row-gap: 2px;
	}

	.account > .account_name {
		flex: 1 1 auto;
		white-space: normal;
		overflow-wrap: anywhere;
	}
}

.notice {
	composes: type--body from global;
	padding: 10px 12px;
	line-height: 1.45;
	color: var(--txt-warning);
	background: color-mix(in srgb, var(--yellow) 7%, transparent);
	border: 1px solid color-mix(in srgb, var(--yellow) 45%, transparent);
}

.buttons {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	margin-top: 4px;
}

.cancel {
	composes: type--button from global;
	height: 44px;
	color: var(--txt-primary);
	background: transparent;
	border: 1px solid var(--nulo-outline);
	cursor: pointer;
}

.submit {
	composes: type--button from global;
	height: 44px;
	color: var(--txt-danger);
	background: transparent;
	border: 1px solid var(--txt-danger);
	cursor: pointer;
}

.submit:disabled {
	cursor: default;
	opacity: 0.6;
}

.cancel:focus-visible,
.submit:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}
</style>
