<script setup lang="ts">
/**
 * One account in the permission window's picker. Its selection target is stretched over the row,
 * and the rename link and the alias field sit above it as siblings, so no control is inside
 * another. Pressing "Rename for this app" swaps in the alias field, which stays open from then on;
 * the parent keeps what is typed as a `caip → alias` map.
 *
 * A `locked` row is one the session already holds: it renders selected, cannot be toggled, and has
 * no rename link, since the stored alias is not re-consented here.
 */
import { getChainName } from "@/components/ui/utils.js"
import RowTarget from "@/components/ui/RowTarget.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { formatCaipAccount } from "@/wallet/utils/caip"
import { stripBidiAndZeroWidth, trimAddress } from "@/utils/string"

const props = defineProps<{
	account: { address: string; name: string; chainId: number }
	selected: boolean
	alias?: string
	disabled?: boolean
	locked?: boolean
}>()

const emit = defineEmits(["toggle", "updateAlias"])

const nameId = useId()
const aliasId = useId()
const renaming = ref(false)
const aliasInput = ref<HTMLInputElement | null>(null)
const aliasText = ref("")

const caip = (a: { address: string; chainId: number }) => formatCaipAccount(a.chainId, a.address)

const inert = computed(() => Boolean(props.disabled || props.locked))
const canRename = computed(() => props.selected && !props.locked)

const toggle = () => {
	if (!inert.value) emit("toggle")
}

const startRename = async () => {
	if (props.disabled) return
	aliasText.value = props.alias ?? props.account.name
	renaming.value = true
	await nextTick()
	aliasInput.value?.focus()
}

// `v-model` writes the stripped text back to the field, skips while an input method composes, and
// repeats the input once the composition commits, so a composing keystroke is never rewritten.
const onAliasInput = (e: Event) => {
	if ((e as InputEvent).isComposing) return
	aliasText.value = stripBidiAndZeroWidth(aliasText.value)
	emit("updateAlias", caip(props.account), aliasText.value)
}
</script>

<template>
	<div
		data-testid="cap-account-item"
		:data-account-id="account.address"
		:data-account-name="account.name"
		:data-selected="selected || undefined"
		:data-granted="locked || undefined"
		:class="[$style.row, disabled && $style.row_disabled, locked && $style.row_locked]"
		@click="toggle"
	>
		<RowTarget :labelledby="nameId" :aria-pressed="selected" :aria-disabled="inert || undefined" :tabindex="inert ? -1 : undefined" />

		<Flex align="center" gap="12" wide>
			<Icon
				v-if="selected"
				name="square-check"
				size="16"
				color="primary"
				:class="$style.row_check"
			/>
			<Icon v-else name="square" size="16" color="secondary" :class="$style.row_check" />

			<Flex direction="column" gap="2" wide :class="$style.row_text">
				<Flex align="center" justify="between" gap="8" wide>
					<span :id="nameId" :class="$style.row_name">{{ account.name }}</span>
					<span v-if="locked" :class="$style.chain_label">SHARED</span>
					<span v-else :class="$style.chain_label">{{ getChainName(account.chainId).toUpperCase() }}</span>
				</Flex>
				<Flex align="center" justify="between" gap="8" wide :class="$style.address_line">
					<span data-testid="account-select-address" :class="$style.row_address">{{ trimAddress(account.address, 6, 4, "...") }}</span>
					<DottedTerm
						v-if="canRename && !renaming"
						term="name-for-this-app"
						action
						:disabled="disabled"
						testid="cap-account-rename-btn"
						@click.stop="startRename"
					>Rename for this app</DottedTerm>
				</Flex>
			</Flex>
		</Flex>

		<Flex
			v-if="canRename && renaming"
			direction="column"
			gap="4"
			wide
			:class="$style.alias_block"
			@click.stop
		>
			<label :for="aliasId" :class="$style.alias_label">Name for this app</label>
			<input
				:id="aliasId"
				ref="aliasInput"
				data-testid="cap-account-alias-input"
				v-model="aliasText"
				@input="onAliasInput"
				:class="$style.alias_input"
				:placeholder="account.name"
			/>
		</Flex>
	</div>
</template>

<style module>
.row {
	user-select: none;
	position: relative;

	display: flex;
	flex-direction: column;
	gap: 10px;

	padding: 12px 14px;
	cursor: pointer;
	background: transparent;

	transition: background 0.2s var(--bezier);

	&:hover,
	&:has(> [data-row-target]:focus-visible) {
		background: var(--nulo-surface-high);
	}

	&::after {
		position: absolute;
		bottom: 0;
		left: 14px;
		right: 14px;
		display: block;
		height: 1px;

		background: var(--hairline-strong);

		content: " ";
	}

	&:last-child::after {
		display: none;
	}
}

.row_disabled {
	cursor: default;
	pointer-events: none;
	opacity: 0.5;
}

.row_locked {
	cursor: default;

	&:hover {
		background: transparent;
	}

	& > [data-row-target] {
		cursor: default;
	}
}

.row_check {
	flex-shrink: 0;
}

.row_text {
	min-width: 0;
}

.row_name {
	composes: type--name from global;
	font-size: 14px;
	color: var(--txt-primary);
	line-height: 20px;

	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.row_address {
	composes: type--meta from global;
	color: var(--nulo-secondary);
	line-height: 16px;

	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* Below the popup's width the rename link goes under the shortened address, at the right, when the two
 * do not fit side by side, so the address is never cut. Two classes outrank the global `gap--8`. */
@media (width < 359px) {
	.row_text > .address_line {
		flex-wrap: wrap;
		row-gap: 2px;
	}

	.address_line > .row_address + * {
		margin-left: auto;
	}
}

.chain_label {
	composes: type--meta from global;
	flex-shrink: 0;

	color: var(--nulo-secondary);
}

/* Above the row's stretched target, so the field takes its own clicks. */
.alias_block {
	position: relative;
	z-index: 1;

	padding: 0 0 0 28px;
}

.alias_label {
	composes: type--label-section from global;
	display: flex;
	align-items: center;
	gap: 4px;

	color: var(--nulo-secondary);
}

.alias_input {
	composes: type--input from global;
	width: 100%;

	padding: 8px 10px;
	border: 1px solid var(--nulo-border);
	background: var(--nulo-surface-low);
	color: var(--txt-primary);
	outline: none;

	transition: border-color 0.2s ease;

	&:focus {
		border-color: var(--nulo-accent);
	}

	&::placeholder {
		color: var(--nulo-secondary);
	}
}
</style>
