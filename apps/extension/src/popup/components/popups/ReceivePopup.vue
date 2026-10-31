<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Vendor */
import { generate } from "lean-qr"

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast.js"
import { usePopupStack } from "@/composables/usePopupStack"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store.ts"
import { usePopupStore } from "@/stores/popup.store.ts"

/** Utils */
import { copyWithToast } from "@/utils/clipboard"
import { endsSelection } from "@/utils/selection"
const appStore = useAppStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("receive")

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const account = computed(() => appStore.account)

const handleCopyAddress = (e) => {
	if (endsSelection(e)) return
	void copyWithToast(appStore.account.address, openToast, "Address is copied")
}

watch(
	() => props.show,
	() => {
		if (!props.show) return

		nextTick(() => {
			const qrCode = generate(appStore.account.address)
			qrCode.toCanvas(document.getElementById("my-qr-code"))
		})
	},
)
</script>

<template>
	<Popup :show="show" @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<Flex wide align="center" direction="column" gap="24" :class="$style.wrapper">
				<Flex align="center" gap="6">
					<Icon name="receive" size="16" color="primary" />
					<Text variant="title-page" color="primary"> Receive </Text>
				</Flex>

				<Flex wide direction="column" align="center" gap="8">
					<canvas id="my-qr-code" :class="$style.qrcode" />

					<Flex align="center" justify="center" :class="$style.link">
						<Flex align="center" direction="column" gap="8">
							<Text variant="name" color="primary" :class="$style.name_size">
								{{ account.name }}
							</Text>

							<Flex @click="handleCopyAddress" align="center" gap="6" class="copyable" data-testid="receive-address">
								<Text variant="data-lead" color="body" data-testid="receive-address-text">
									{{ account.address.slice(0, 6) }}
									<Text color="tertiary">•••</Text>
									{{ account.address.slice(-4) }}
								</Text>

								<Icon name="copy" size="12" color="tertiary" />
							</Flex>
						</Flex>
					</Flex>
				</Flex>

				<Button v-snack-footer @click="popupStore.close('receive')" wide variant="primary_outline" size="medium" data-testid="receive-close"> Close </Button>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "@/components/Popup/popup-shared.module.css";
}

.link {
	padding: 12px 16px 12px 12px;
}

.name_size {
	font-size: 14px;
}

.qrcode {
	width: 100%;
	image-rendering: pixelated;

	user-select: none;
	-webkit-user-drag: none;
	border: 1px solid var(--nulo-border);
	border-radius: 0;
}

[theme="dark"] {
	.qrcode {
		filter: invert(1);
	}
}
</style>
