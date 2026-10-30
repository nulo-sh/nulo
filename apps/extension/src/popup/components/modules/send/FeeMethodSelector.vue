<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import { Dropdown } from "@/components/ui/Dropdown"
import mark from "@/components/composite/send/publish-mark.module.css"
import { menuOrder } from "./fee-helpers"

const props = defineProps({
	modelValue: { type: Object, default: null },
	methods: { type: Array, required: true },
	/** "private-private" | "private-public" while this send's fee names the account, else null. The
	 *  page decides; this only draws the tag. */
	payerNoticeShape: { type: String, default: null },
	/** The card is still reading what can pay. */
	pending: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue", "open", "close"])
/** Focuses the trigger without opening the menu. */
defineExpose({ focus: () => trigger.value?.$el.focus() })

const trigger = ref(null)
const menu = computed(() => menuOrder(props.methods))

/** A checking row answers nothing yet; the click stops here so the menu stays open. */
const onRowClick = (method, event) => {
	if (method.checking) return event?.stopPropagation()
	if (!method.disabled) emit("update:modelValue", method)
}
</script>

<template>
	<Flex direction="column" gap="4" :class="$style.card">
		<Flex align="center" justify="between">
			<span :class="$style.fee_label">Fee</span>
			<span
				v-if="payerNoticeShape"
				:class="[$style.tag, mark.exposed]"
				data-testid="send-fee-privacy-notice"
				:data-notice-shape="payerNoticeShape"
			>
				<Icon name="public" size="10" aria-hidden="true" />
				NAMES YOUR ADDRESS
			</span>
		</Flex>
		<Dropdown @onOpen="emit('open')" @onClose="emit('close')">
			<template #trigger>
				<Flex
					ref="trigger"
					tag="button"
					type="button"
					align="center"
					justify="between"
					class="clickable"
					:class="$style.trigger"
					data-testid="send-fee-method-trigger"
					:data-fee-method="modelValue?.subtitle"
					:aria-busy="!modelValue && pending ? 'true' : undefined"
				>
					<span v-if="modelValue" :class="$style.fee_value">{{ modelValue.title }}</span>
					<span v-else-if="pending" :class="$style.fee_value" data-testid="send-fee-method-checking">
						<Skeleton :class="$style.bar" />
						<span :class="$style.visually_hidden">Checking</span>
					</span>
					<span v-else :class="[$style.fee_value, $style.fee_placeholder]">Select method</span>
					<Icon name="chevron" :rotate="90" :size="16" color="secondary" aria-hidden="true" />
				</Flex>
			</template>

			<template #popup>
				<DropdownItem
					v-for="method in menu"
					:key="method.fpc?.id ?? method.type"
					:class="[$style.method, method.checking && $style.checking]"
					:disabled="method.disabled || method.checking"
					:data-testid="`send-fee-method-${method.subtitle}`"
					:data-fpc-id="method.fpc?.id"
					:data-checking="method.checking ? 'true' : undefined"
					:data-verifying="method.verifying ? 'true' : undefined"
					:aria-busy="method.checking || method.verifying ? 'true' : undefined"
					@click="onRowClick(method, $event)"
				>
					<Flex align="center" justify="between" gap="8" wide>
						<Text variant="name" :class="$style.method_title" :color="method.disabled || method.checking ? 'tertiary' : 'primary'">
							{{ method.title }}
						</Text>
						<template v-if="method.checking || method.verifying">
							<Skeleton />
							<span :class="$style.visually_hidden">Checking</span>
						</template>
						<Text v-else variant="caption" color="tertiary">
							{{ method.disabled && method.disabledReason ? method.disabledReason : method.spend }}
						</Text>
					</Flex>
				</DropdownItem>
			</template>
		</Dropdown>
	</Flex>
</template>

<style module>
.card {
	padding: 12px;
}

.method_title {
	font-size: 13px;
}

.fee_label {
	composes: fee_label from "./fee-shared.module.css";
}

.trigger {
	width: 100%;
	font: inherit;
	color: inherit;
	background: none;

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.fee_value {
	composes: type--name from global;
	font-size: 12px;
	color: var(--txt-primary);
}

.fee_placeholder {
	color: var(--nulo-secondary);
}

/* Centred on the line, the bar stays inside the text's line box, so the trigger keeps its height when
   the title replaces it. */
.bar {
	vertical-align: middle;
}

/* A disabled method already reads in tertiary ink, so DropdownItem's own fade would dim it twice.
   The doubled class outranks `.wrapper.disabled` whichever sheet loads last. */
.method.method[aria-disabled="true"] {
	opacity: 1;
}

/* A checking row takes its click so the menu does not close on it, and does not light up as a choice. */
.method.method.checking {
	pointer-events: auto;
	cursor: default;
	background: transparent;
}

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}

.tag {
	composes: type--label-section from global;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	white-space: nowrap;
}
</style>
