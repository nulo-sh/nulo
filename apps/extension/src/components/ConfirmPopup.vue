<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { usePopupStack } from "@/composables/usePopupStack"

/** Store */
import { useCacheStore } from "@/stores/cache.store.ts"
const cacheStore = useCacheStore()
const { order, depth } = usePopupStack("confirm")

/** Optional toggle row driven by a caller-owned ref:
 *  requestConfirm({ …, toggle: { label, description?, model: someRef } })
 *  The store's deep unwrap reads `model` as the ref's value, and v-model writes go back through
 *  the ref's setter. The caller's callback closes over `someRef`, so the clear on close drops no
 *  state mid-await. */

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

/** Informational use: one button, no Cancel, no callback required; cleared with the rest on close. */
const isSingle = computed(() => cacheStore.confirm.single === true)

const confirmationInputEl = useTemplateRef("confirmationInputEl")
const confirmationTerm = ref()
const isConfirmed = computed(() => !cacheStore.confirm.confirmation_text || cacheStore.confirm.confirmation_text === confirmationTerm.value)

const handleConfirm = () => {
	cacheStore.confirm.callback?.()
	emit("onClose")
}

watch(
	() => props.show,
	async () => {
		if (!props.show) {
			confirmationTerm.value = null
			cacheStore.confirm = {}
		} else {
			if (cacheStore.confirm.confirmation_text) {
				await nextTick()
				confirmationInputEl.value.inputEl.focus()
			}
		}
	},
)
</script>

<template>
	<Popup :show @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<Flex direction="column" gap="32" :class="$style.wrapper" wide>
				<Flex direction="column" align="center" gap="12" :class="$style.header">
					<Icon name="warning" size="16" color="primary" />
					<span :class="$style.pre_title" data-testid="confirm-pre-title">
						{{ cacheStore.confirm.pre_title || (cacheStore.confirm.irreversible ? 'Irreversible' : 'Action required') }}
					</span>
					<h2 :class="$style.title" data-testid="confirm-title">
						{{ cacheStore.confirm.title ? cacheStore.confirm.title : "Are you sure?" }}
					</h2>
					<Text variant="body" color="body" height="150" align="center" :class="$style.description" data-testid="confirm-description">
						{{ cacheStore.confirm.description }}
					</Text>
				</Flex>

				<Flex
					v-if="cacheStore.confirm.toggle"
					align="center"
					justify="between"
					gap="12"
					:class="$style.toggle_row"
				>
					<Flex direction="column" gap="2" :class="$style.toggle_text">
						<Text variant="row-title" color="primary" :class="$style.toggle_label_size">
							{{ cacheStore.confirm.toggle.label }}
						</Text>
						<Text v-if="cacheStore.confirm.toggle.description" variant="caption" color="tertiary" height="140">
							{{ cacheStore.confirm.toggle.description }}
						</Text>
					</Flex>
					<Toggle
						v-model="cacheStore.confirm.toggle.model"
						data-testid="confirm-toggle"
					/>
				</Flex>

				<Flex v-if="cacheStore.confirm.confirmation_text" align="center" justify="between" gap="8" wide>
					<Input
						ref="confirmationInputEl"
						v-model="confirmationTerm"
						:placeholder="cacheStore.confirm.confirmation_text"
						wide
					/>
				</Flex>

				<Flex v-snack-footer gap="12">
					<Button
						v-if="!isSingle"
						@click="emit('onClose')"
						wide
						variant="primary_outline"
						size="medium"
						data-testid="confirm-cancel"
					>
						Cancel
					</Button>

					<Button
						@click="handleConfirm"
						wide
						:type="cacheStore.confirm.confirm_color"
						:variant="cacheStore.confirm.confirm_variant"
						:disabled="!isConfirmed"
						size="medium"
						data-testid="confirm-submit"
					>
						{{ cacheStore.confirm.confirm_text || "Confirm" }}
					</Button>
				</Flex>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "./Popup/popup-shared.module.css";
}

.header {
	composes: header from "./Popup/popup-shared.module.css";
}

.pre_title {
	composes: pre_title from "./Popup/popup-shared.module.css";
}

.toggle_row {
	padding: 12px 0;
	border-top: 1px solid var(--nulo-border);
	border-bottom: 1px solid var(--nulo-border);
}

.toggle_text {
	min-width: 0;
	flex: 1;
}

.toggle_label_size {
	font-size: 13px;
}

.title {
	composes: title from "./Popup/popup-shared.module.css";
	max-width: 280px;
}

.description {
	max-width: 100%;
	word-wrap: break-word;
}

:global([theme="light"]) .pre_title {
	color: var(--txt-secondary);
}
</style>
