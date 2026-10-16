<script setup lang="ts">
/**
 * What a transaction does, before its value rows: each call in order with the wallet's own reading
 * of it, and each authorization the wallet will sign. Only the wallet's reading of a transfer or mint
 * states an amount and a recipient; every other call is marked as named by the app, and an unreadable
 * call keeps its warning here, at rest.
 */
import type { DiscoveredAuthwit } from "@/wallet/services/execution/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import { type CallSurface, type WireCall, amountLabel, authwitLine, authwitTitle, rowTitle } from "./call-surface"
import UnreadableArgsNotice from "./UnreadableArgsNotice.vue"

const props = defineProps<{
	calls: readonly { call: WireCall; surface: CallSurface }[]
	/** The authorizations the wallet will sign, each with its reading; absent while none are listed. */
	authwits?: readonly { authwit: DiscoveredAuthwit; surface: CallSurface }[]
	/** The wallet is still finding the authorizations. */
	checkingAuthwits?: boolean
	chainId?: number
	tokens?: readonly TokenInfo[]
}>()

/** An amount in the token's units with its symbol, or the raw integer in base units. */
const amountOf = (contract: unknown, amount: string): { text: string; baseUnits: boolean } => {
	const { text, symbol } = amountLabel(props.tokens, props.chainId, contract, amount)
	return symbol ? { text: `${text} ${symbol}`, baseUnits: false } : { text, baseUnits: true }
}

const callRows = computed(() =>
	props.calls.map(({ call, surface }) => ({
		call,
		surface,
		title: rowTitle(call, surface),
		amount: surface.kind === "transfer" || surface.kind === "mint" ? amountOf(call.to, surface.amount) : undefined,
	})),
)

const authwitRows = computed(() =>
	(props.authwits ?? []).map(({ authwit, surface }) => {
		const line = authwitLine(surface, authwitTitle(authwit.selector, authwit.consumer, surface))
		return {
			authwit,
			line,
			amount: line.kind === "move" ? amountOf(authwit.consumer, line.amount) : undefined,
		}
	}),
)
</script>

<template>
	<Flex v-if="callRows.length" data-testid="execute-op-summary" direction="column" gap="8" :class="$style.section">
		<SectionLabel label="What this does" />
		<ol data-testid="execute-op-summary-calls" :class="$style.items">
			<li
				v-for="(row, j) in callRows"
				:key="j"
				data-testid="execute-op-summary-call"
				:data-call-index="j"
				:data-intent-kind="row.surface.kind"
				:class="$style.item"
			>
				<Text variant="data" color="secondary" :class="$style.marker">{{ j + 1 }}</Text>
				<Flex direction="column" gap="4" :class="$style.item_body">
					<Text data-testid="execute-op-summary-call-head" variant="body" color="primary" height="130">
						<Text variant="data" data-testid="execute-op-summary-call-title">{{ row.title }}</Text> on <AddressDisplay :address="row.call.to" data-testid="execute-op-summary-call-to" /><template v-if="row.amount">:</template><template v-else-if="row.surface.kind === 'decoded'">. <Text variant="caption" color="secondary" data-testid="execute-op-call-named">Named by the app.</Text></template>
					</Text>
					<Text
						v-if="row.amount && (row.surface.kind === 'transfer' || row.surface.kind === 'mint')"
						data-testid="execute-op-call-line"
						:data-sender-kind="row.surface.kind === 'transfer' ? row.surface.sender.kind : undefined"
						variant="body"
						color="primary"
						height="130"
					>
						<!-- A sentence's spaces sit inside its text nodes: a bare newline between two tags renders none. -->
						<Text variant="data" data-testid="execute-op-line-amount">{{ row.amount.text }}</Text>
						<template v-if="row.amount.baseUnits"> base units</template>
						<template v-if="row.surface.kind === 'transfer' && row.surface.sender.kind === 'account'"> from this account</template>
						<template v-else-if="row.surface.kind === 'transfer' && row.surface.sender.kind === 'explicit'"> from <AddressDisplay :address="row.surface.sender.address" data-testid="execute-op-line-from" /></template>
						to <AddressDisplay :address="row.surface.to" data-testid="execute-op-line-to" />
						<template v-if="row.surface.kind === 'transfer' && row.surface.sender.kind === 'none'">. Caller: none</template>
					</Text>
					<Text v-else-if="row.surface.kind === 'pending'" data-testid="execute-op-summary-args-pending" variant="body" color="tertiary">
						Reading arguments…
					</Text>
					<Flex v-else-if="row.surface.kind === 'raw'" data-testid="execute-op-summary-unverified-args" :data-reason="row.surface.reason" direction="column" gap="4">
						<UnreadableArgsNotice :reason="row.surface.reason" prefix="execute-op-summary" />
					</Flex>
				</Flex>
			</li>
		</ol>
	</Flex>

	<Flex v-if="authwitRows.length" data-testid="execute-op-summary-authwits-section" direction="column" gap="8" :class="$style.section">
		<SectionLabel label="Authorizations" :count="authwitRows.length" />
		<ul data-testid="execute-op-summary-authwits" :class="$style.items">
			<li
				v-for="({ authwit: a, line, amount }, k) in authwitRows"
				:key="`${k}:${a.messageHash}`"
				data-testid="execute-op-summary-authwit"
				:data-message-hash="a.messageHash"
				:data-line-kind="line.kind"
				:class="$style.item"
			>
				<Text variant="body" color="secondary" aria-hidden="true" :class="$style.marker">•</Text>
				<Text data-testid="execute-discovered-authwit-line" variant="body" color="primary" height="130" :class="$style.item_body">
					Lets <AddressDisplay :address="a.caller" data-testid="execute-discovered-line-caller" />
					<template v-if="line.kind === 'move' && amount"> move <Text variant="data" data-testid="execute-discovered-line-amount">{{ amount.text }}</Text></template>
					<template v-if="line.kind === 'move' && amount?.baseUnits"> base units</template>
					<template v-if="line.kind === 'move'"> from <AddressDisplay :address="line.from" data-testid="execute-discovered-line-from" /> to <AddressDisplay :address="line.to" data-testid="execute-discovered-line-to" /></template>
					<template v-else> call <Text variant="data" data-testid="execute-discovered-line-function">{{ line.fn }}</Text> on <AddressDisplay :address="a.consumer" data-testid="execute-discovered-line-consumer" /></template>
				</Text>
			</li>
		</ul>
	</Flex>
	<Flex v-else-if="checkingAuthwits" :class="$style.section">
		<Text variant="body" color="secondary" data-testid="execute-op-authwits-pending">Checking authorizations…</Text>
	</Flex>
</template>

<style module>
.section {
	width: 100%;
	padding-top: 12px;
}

.items {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.item {
	display: flex;
	align-items: baseline;
	gap: 8px;
}

.marker {
	flex: 0 0 10px;
}

/* A dApp names each call and supplies its addresses; a long unbroken one breaks inside the card. */
.item_body {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}
</style>
