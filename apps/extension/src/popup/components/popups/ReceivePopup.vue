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
import { addressEnds } from "@/utils/string"
const appStore = useAppStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("receive")

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const account = computed(() => appStore.account)
const addressParts = computed(() => addressEnds(appStore.account.address))

const handleCopyAddress = (e) => {
	if (endsSelection(e)) return
	void copyWithToast(appStore.account.address, openToast, "Address is copied")
}

// The QR follows the address the text under it shows, should the account change while the sheet is open.
watch(
	() => [props.show, appStore.account?.address],
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

							<button type="button" :aria-label="`Copy address ${account.address}`" :class="$style.address" data-testid="receive-address" @click="handleCopyAddress">
								<span class="type--input-data" :class="$style.address_text" data-testid="receive-address-text"><span :class="$style.address_end">{{ addressParts.head }}</span>{{ addressParts.middle }}<span :class="$style.address_end">{{ addressParts.tail }}</span><Icon name="copy" size="14" aria-hidden="true" :class="$style.address_glyph" /></span>
							</button>

							<Text variant="caption" color="secondary" :class="$style.network" data-testid="receive-network">Your address on {{ appStore.network.name }}</Text>
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

.address {
	padding: 0;
	background: none;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.address_text {
	display: block;
	max-width: 260px;
	text-align: center;
	color: var(--txt-tertiary);
	overflow-wrap: anywhere;
	user-select: text;
}

.address_end {
	color: var(--txt-primary);
}

.address_glyph {
	display: inline-block;
	margin-left: 6px;
	vertical-align: -2px;
}

.network {
	text-align: center;
	overflow-wrap: anywhere;
}

/* 240 px leaves the sheet room for the address and the network line without a scroll in the
   popup's frame; a narrower frame shrinks the code with its column. */
.qrcode {
	width: 240px;
	max-width: 100%;
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
