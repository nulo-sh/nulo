<script setup lang="ts">
/** One authorization's rows, led by its group's heading: what the wallet signs reads apart from what
 *  an account already gave. Its arguments sit behind their own toggle, which the rail opens. */
import type { DiscoveredAuthwit } from "@/wallet/services/execution/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import { trimAddress } from "@/utils/string"
import { type CallSurface, authwitTitle, rawRows } from "./call-surface"
import CallArguments from "./CallArguments.vue"
import DetailsToggle from "./DetailsToggle.vue"
import { safeWire } from "./humanize"

defineProps<{
	authwit: DiscoveredAuthwit
	surface: CallSurface
	group: { testid: string; label: string }
	open: boolean
	/** The id of the arguments' panel. */
	controls: string
	chainId?: number
	tokens?: readonly TokenInfo[]
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
	<Flex :data-testid="group.testid" direction="column" gap="4" wide>
		<Text variant="label-section" color="secondary">{{ group.label }}</Text>
		<Flex data-testid="execute-op-discovered-authwit" :data-message-hash="authwit.messageHash" direction="column" gap="2" wide>
			<Flex justify="between" :class="$style.row">
				<Text variant="label-section" color="secondary">Consumer:</Text>
				<AddressDisplay :address="authwit.consumer" data-testid="execute-discovered-consumer" />
			</Flex>
			<Flex justify="between" :class="$style.row">
				<Text variant="label-section" color="secondary">Authorizes:</Text>
				<AddressDisplay :address="authwit.caller" data-testid="execute-discovered-caller" />
			</Flex>
			<Flex justify="between" :class="$style.row">
				<Text variant="label-section" color="secondary">Function:</Text>
				<Text variant="meta" color="primary" data-testid="execute-discovered-authwit-function">{{ authwitTitle(authwit.selector, authwit.consumer, surface) }}</Text>
			</Flex>
			<Flex v-if="authwit.onBehalfOf" justify="between" :class="$style.row">
				<Text variant="label-section" color="secondary">Authorized by:</Text>
				<AddressDisplay :address="authwit.onBehalfOf" data-testid="execute-discovered-authorized-by" />
			</Flex>
			<DetailsToggle
				data-testid="execute-discovered-authwit-toggle"
				:open="open"
				:controls="controls"
				:label="open ? 'Hide details' : 'Show details'"
				@click="emit('toggle')"
			/>
			<Flex v-if="open" :id="controls" data-testid="execute-discovered-authwit-details" direction="column" gap="2">
				<!-- The line above states an unreadable reading at rest; a pending one it does not. -->
				<CallArguments
					:surface="surface"
					:contract="authwit.consumer"
					:chainId="chainId"
					:tokens="tokens"
					prefix="execute-discovered-authwit"
					:notice="surface.kind === 'pending'"
					:raw="rawRows(authwit.args, Number.POSITIVE_INFINITY)"
				/>
				<Flex justify="between" :class="$style.row">
					<Text variant="label-section" color="secondary">Inner hash:</Text>
					<Text variant="meta" color="primary" :title="safeWire(authwit.innerHash, 80)" data-testid="execute-discovered-inner-hash">{{ trimAddress(safeWire(authwit.innerHash, 80), 10, 6) }}</Text>
				</Flex>
			</Flex>
		</Flex>
	</Flex>
</template>

<style module>
.row {
	width: 100%;
	gap: 12px;

	> :last-child {
		min-width: 0;
		overflow-wrap: anywhere;
		text-align: right;
	}
}

/* Below the popup's width a value goes under its name, at the right, when the two do not fit side by
 * side: a name breaks only inside a word wider than the card, and a shortened address stays whole. */
@media (width < 359px) {
	.row {
		flex-wrap: wrap;
		column-gap: 12px;
		row-gap: 2px;
	}

	.row > :last-child {
		margin-left: auto;
	}
}
</style>
