<script setup>
import ContractChip from "@/components/composite/ContractChip.vue"
import RowTarget from "@/components/ui/RowTarget.vue"
import { authwitAction } from "./authwit-helpers"

/**
 * Single authwit card. Renders the kind-specific kv_grid (call /
 * encoded_call / intent / message_hash) and exposes click events for
 * the parent to open the JSON viewer or fire the revoke confirm.
 */
const props = defineProps({
	authwit: { type: Object, required: true },
	/** The contract chip a `call` row is titled with (`{ model, explorer }`); null keeps the kind's title. */
	chip: { type: Object, default: null },
	/** The latest revoke of this row: "revoking" until the registry read prunes it, "failed" after it failed. */
	revokeState: { type: String, default: null },
})

const emit = defineEmits(["open", "revoke"])

const action = computed(() => (props.chip ? authwitAction(props.authwit.content) : null))

// One status chip: a revoke's state outranks Pending, so Revoking also covers the wait for the grant's block.
const status = computed(() => {
	if (props.revokeState === "revoking" || props.revokeState === "failed") return props.revokeState
	return props.authwit.pending ? "pending" : null
})

const titleId = useId()
const chipId = useId()
const statusId = useId()
const labelledby = computed(() => [titleId, action.value && chipId, status.value && statusId].filter(Boolean).join(" "))
</script>

<template>
	<div @click="emit('open', authwit)" :class="$style.card">
		<RowTarget :labelledby="labelledby" />

		<div :class="$style.header">
			<span :class="$style.title">
				<span :id="titleId" :class="$style.type">{{ action ?? authwit.kindName ?? "Custom Authwit" }}<span v-if="action" aria-hidden="true" :class="$style.dot"> ·</span></span>
				<!-- Raised above the card's target and kept from its click, so a press opens the chip's card, not the data viewer. -->
				<span v-if="action" :id="chipId" :class="$style.chip_slot" @click.stop><ContractChip :model="chip.model" :explorer="chip.explorer" testid="authwit-contract" /></span>
				<span v-if="status === 'revoking'" :id="statusId" data-testid="authwit-revoking-chip" :class="$style.pending">Revoking</span>
				<span v-else-if="status === 'failed'" :id="statusId" data-testid="authwit-not-revoked-chip" :class="[$style.pending, $style.failed]">Not revoked</span>
				<span v-else-if="status === 'pending'" :id="statusId" data-testid="authwit-pending-chip" :class="$style.pending">Pending</span>
			</span>

			<Tooltip position="end">
				<RowAction label="Revoke authwit" :class="$style.revoke" @click="emit('revoke', authwit)">
					<Icon name="close" color="secondary" size="16" />
				</RowAction>
				<template #content>Revoke authwit</template>
			</Tooltip>
		</div>

		<div :class="$style.kv_grid">
			<template v-if="authwit.content.kind === 'call'">
				<span :class="$style.kv_key">caller</span>
				<span data-testid="record-caller" :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.caller }}</span>
				<span :class="$style.kv_key">contract</span>
				<span data-testid="record-contract" :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.contract }}</span>
				<span :class="$style.kv_key">method</span>
				<span :class="$style.kv_val">{{ authwit.content.method }}</span>
			</template>
			<template v-else-if="authwit.content.kind === 'encoded_call'">
				<span :class="$style.kv_key">caller</span>
				<span data-testid="record-caller" :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.caller }}</span>
				<span :class="$style.kv_key">to</span>
				<span data-testid="record-to" :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.to }}</span>
				<span :class="$style.kv_key">selector</span>
				<span data-testid="record-selector" :class="$style.kv_val">{{ authwit.content.selector }}</span>
			</template>
			<template v-else-if="authwit.content.kind === 'intent'">
				<span :class="$style.kv_key">consumer</span>
				<span data-testid="record-consumer" :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.consumer }}</span>
				<span :class="$style.kv_key">intent</span>
				<span :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.intent.join(", ") }}</span>
			</template>
			<template v-else-if="authwit.content.kind === 'message_hash'">
				<span :class="$style.kv_key">hash</span>
				<span data-testid="record-hash" :class="[$style.kv_val, $style.kv_val_wrap]">{{ authwit.content.messageHash }}</span>
			</template>
		</div>
	</div>
</template>

<style module>
.card {
	composes: card from "../record-card.module.css";

	border: 1px solid var(--nulo-border);

	padding: 12px;

	&:hover .revoke,
	&:focus-within .revoke {
		opacity: 1;
	}
}

.header {
	composes: header from "../record-card.module.css";
}

.type {
	composes: type from "../record-card.module.css";
}

/* Holds the chips beside the title, wrapping under the row's width rather than cutting the contract
 * chip. On its own, the title's `flex: 1` would push them against Revoke and keep them from wrapping. */
.title {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	min-width: 0;
}

.title > .type {
	flex: 0 1 auto;
}

.dot {
	color: var(--txt-tertiary);
}

.chip_slot {
	position: relative;
	z-index: 1;
	min-width: 0;
	max-width: 100%;
}

.pending {
	composes: chip from "../../../../../components/composite/activity/activity-card.module.css";
}

/* Two classes, so it outranks the composed chip's colour in whatever order the sheets load. */
.pending.failed {
	color: var(--txt-danger);
}

.revoke {
	opacity: 0;

	transition: all 0.2s var(--bezier);
}

.kv_grid {
	composes: kv_grid from "../record-card.module.css";
}

.kv_key {
	composes: kv_key from "../record-card.module.css";
}

.kv_val {
	composes: kv_val from "../record-card.module.css";
}

.kv_val_wrap {
	composes: kv_val_wrap from "../record-card.module.css";
}
</style>
