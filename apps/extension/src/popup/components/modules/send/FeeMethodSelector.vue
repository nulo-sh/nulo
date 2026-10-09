<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import { Dropdown } from "@/components/ui/Dropdown"
import { publishGlyph } from "@/components/composite/send/publish-facts"
import mark from "@/components/composite/send/publish-mark.module.css"
import { menuOrder } from "./fee-helpers"

const props = defineProps({
	modelValue: { type: Object, default: null },
	methods: { type: Array, required: true },
	/** "private-private" | "private-public" while this send's fee names the account, else null. The
	 *  page decides; this only draws the tag. */
	payerNoticeShape: { type: String, default: null },
})

const emit = defineEmits(["update:modelValue", "open", "close"])

/** The tag only ever says the fee names the account publicly. */
const TAG_GLYPH = publishGlyph("exposed")

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
				<Icon :name="TAG_GLYPH" size="10" aria-hidden="true" />
				NAMES YOUR ADDRESS
			</span>
		</Flex>
		<Dropdown @onOpen="emit('open')" @onClose="emit('close')">
			<template #trigger>
				<Flex
					tag="button"
					type="button"
					align="center"
					justify="between"
					class="clickable"
					:class="$style.trigger"
					data-testid="send-fee-method-trigger"
					:data-fee-method="modelValue?.subtitle"
				>
					<span v-if="modelValue" :class="$style.fee_value">{{ modelValue.title }}</span>
					<span v-else :class="[$style.fee_value, $style.fee_placeholder]">Select method</span>
					<MaterialIcon name="expand_more" :size="16" color="secondary" />
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
					:aria-busy="method.checking ? 'true' : undefined"
					@click="onRowClick(method, $event)"
				>
					<Flex align="center" justify="between" gap="8" wide>
						<Text size="13" weight="600" :color="method.disabled || method.checking ? 'tertiary' : 'primary'">
							{{ method.title }}
						</Text>
						<template v-if="method.checking">
							<span :class="$style.skeleton" aria-hidden="true" />
							<span :class="$style.visually_hidden">Checking</span>
						</template>
						<Text v-else size="11" color="tertiary">
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
	font-family: var(--font-mono);
	font-size: 12px;
	color: var(--txt-primary);
}

.fee_placeholder {
	color: var(--nulo-secondary);
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

.skeleton {
	composes: skeleton from "./fee-shared.module.css";
}

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}

.tag {
	display: inline-flex;
	align-items: center;
	gap: 5px;

	font-family: var(--font-headline);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.1em;
	white-space: nowrap;
}
</style>
