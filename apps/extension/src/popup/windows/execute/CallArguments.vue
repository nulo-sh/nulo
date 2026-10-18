<script setup lang="ts">
/**
 * The argument block under one call. Owns only its raw-fields toggle: the fields are a last resort,
 * closed by default, and the notice above them says why the wallet could not do better.
 */
import type { TokenInfo } from "@/wallet/services/token/client"
import { safeWire } from "./humanize"
import { type CallSurface, amountLabel, nonceValue, rawToggleLabel, valueText, valueTitle } from "./call-surface"
import DetailsToggle from "./DetailsToggle.vue"
import UnreadableArgsNotice from "./UnreadableArgsNotice.vue"

const props = defineProps<{
	surface: CallSurface
	/** The call's target, so an amount can be labeled with the token the wallet knows at that address. */
	contract: unknown
	chainId?: number
	tokens?: readonly TokenInfo[]
	/** Prefix for every `data-testid` in the block, so each host surface stays addressable. */
	prefix: string
	/** Whether the request's JSON view carries this call, so capped rows can point there. */
	jsonView?: boolean
	/** Every value prints whole, an address as its own text with no name in its place; the
	 *  `this account` sender, which only a surface read with caller context carries, is not covered. */
	full?: boolean
}>()

const rawOpen = ref(false)
const rawArgsId = useId()
const amount = computed(() =>
	props.surface.kind === "transfer" || props.surface.kind === "mint"
		? amountLabel(props.tokens, props.chainId, props.contract, props.surface.amount)
		: undefined,
)
const nonce = computed(() =>
	props.surface.kind === "transfer" && props.surface.nonce !== undefined ? nonceValue(props.surface.nonce) : undefined,
)
</script>

<template>
	<Flex
		v-if="surface.kind === 'transfer' || surface.kind === 'mint'"
		:data-testid="`${prefix}-structured-args`"
		:data-intent-kind="surface.kind"
		direction="column"
		gap="2"
		:class="[$style.block, full && $style.full]"
	>
		<!-- The sender is rendered even when the call carries none: a dApp can spend from another
		     account it names, and the entrypoint spends from nobody. -->
		<Flex v-if="surface.kind === 'transfer'" :data-testid="`${prefix}-transfer-sender`" :data-sender-kind="surface.sender.kind" justify="between" :class="$style.row">
			<template v-if="surface.sender.kind === 'none'">
				<Text variant="label-section" color="secondary">Caller:</Text>
				<Text variant="value" color="primary">none</Text>
			</template>
			<template v-else-if="surface.sender.kind === 'account'">
				<Text variant="label-section" color="secondary">From:</Text>
				<Text variant="value" color="primary">this account <Text color="secondary">(<AddressDisplay :data-testid="`${prefix}-transfer-sender-address`" :address="surface.sender.address" />)</Text></Text>
			</template>
			<template v-else>
				<Text variant="label-section" color="secondary">From:</Text>
				<Text v-if="full" :data-testid="`${prefix}-transfer-sender-address`" variant="meta" color="primary">{{ surface.sender.address }}</Text>
				<AddressDisplay v-else :data-testid="`${prefix}-transfer-sender-address`" :address="surface.sender.address" />
			</template>
		</Flex>
		<Flex justify="between" :class="$style.row">
			<Text variant="label-section" color="secondary">{{ surface.kind === "mint" ? "Mint to:" : "To:" }}</Text>
			<Text v-if="full" :data-testid="`${prefix}-transfer-to`" variant="meta" color="primary">{{ surface.to }}</Text>
			<AddressDisplay v-else :data-testid="`${prefix}-transfer-to`" :address="surface.to" />
		</Flex>
		<Flex justify="between" :class="$style.row">
			<Text variant="label-section" color="secondary">Amount:</Text>
			<Text :data-testid="`${prefix}-amount`" variant="meta" color="primary">
				{{ amount?.text }}
				<Text v-if="amount?.symbol" variant="meta">{{ amount.symbol }}</Text>
				<Text v-else color="tertiary">base units</Text>
			</Text>
		</Flex>
		<Flex v-if="nonce" :data-testid="`${prefix}-transfer-nonce`" justify="between" :class="$style.row">
			<Text variant="label-section" color="secondary">Authwit nonce:</Text>
			<Text
				:data-testid="`${prefix}-transfer-nonce-value`"
				variant="meta"
				color="primary"
				:title="valueTitle(nonce)"
			>
				{{ valueText(nonce, full) }}
			</Text>
		</Flex>
	</Flex>

	<Flex
		v-else-if="surface.kind === 'decoded'"
		:data-testid="`${prefix}-decoded-args`"
		direction="column"
		gap="2"
		:class="[$style.block, full && $style.full]"
	>
		<Flex
			v-for="(p, m) in surface.params"
			:key="m"
			:data-testid="`${prefix}-decoded-param`"
			:data-param="p.name"
			:data-value-kind="p.value.kind"
			justify="between"
			:class="$style.row"
		>
			<Text variant="label-section" color="secondary">{{ safeWire(p.name, 32) }}:</Text>
			<AddressDisplay v-if="p.value.kind === 'address' && !full" :data-testid="`${prefix}-decoded-param-value`" :address="p.value.value" />
			<Text
				v-else
				:data-testid="`${prefix}-decoded-param-value`"
				variant="meta"
				color="primary"
				:title="valueTitle(p.value)"
			>
				{{ valueText(p.value, full) }}
			</Text>
		</Flex>
	</Flex>

	<Text v-else-if="surface.kind === 'pending'" :data-testid="`${prefix}-args-pending`" variant="body" color="tertiary" :class="$style.block">
		Reading arguments…
	</Text>

	<Flex
		v-else
		:data-testid="`${prefix}-unverified-args`"
		:data-reason="surface.reason"
		direction="column"
		gap="4"
		:class="[$style.block, full && $style.full]"
	>
		<UnreadableArgsNotice :reason="surface.reason" :prefix="prefix" />
		<DetailsToggle
			v-if="surface.rows.length"
			:data-testid="`${prefix}-raw-toggle`"
			:open="rawOpen"
			:controls="rawArgsId"
			:label="rawToggleLabel(surface.rows.length + surface.hidden, rawOpen)"
			@click="rawOpen = !rawOpen"
		/>
		<Flex v-if="rawOpen" :id="rawArgsId" :data-testid="`${prefix}-raw-args`" direction="column" gap="2">
			<Flex v-for="(row, m) in surface.rows" :key="m" :data-testid="`${prefix}-arg`" :data-arg-kind="row.kind" justify="between" :class="$style.row">
				<Text variant="label-section" color="secondary">#{{ m }}</Text>
				<Text v-if="row.kind === 'field'" :data-testid="`${prefix}-arg-field`" variant="meta" color="primary" :title="row.full">
					{{ full ? row.full : row.short }}<Text v-if="row.decimal !== undefined" color="tertiary"> = {{ row.decimal }}</Text>
				</Text>
				<Text v-else-if="row.kind === 'text'" variant="meta" color="primary">{{ full ? row.full : row.value }}</Text>
				<Text v-else variant="value" color="tertiary">(unreadable)</Text>
			</Flex>
			<Text v-if="surface.hidden" :data-testid="`${prefix}-args-more`" variant="meta" color="tertiary">
				+{{ surface.hidden }} more{{ jsonView ? " in the JSON view" : " not shown" }}
			</Text>
		</Flex>
	</Flex>
</template>

<style module>
.block {
	width: 100%;
}

/* A dApp's artifact names each parameter and supplies its value; either may run long and unbroken. */
.row {
	width: 100%;
	gap: 12px;

	> * {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	> :last-child {
		text-align: right;
	}
}

/* A whole value takes the full width under its name, so a 66-glyph field breaks into two even lines. */
.full .row {
	flex-direction: column;
	gap: 2px;

	> :last-child {
		text-align: left;
	}
}
</style>
