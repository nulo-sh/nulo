<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import { useNotificationStore } from "@/stores/notification.store"
import { usePopupStore } from "@/stores/popup.store"
const notificationStore = useNotificationStore()
const popupStore = usePopupStore()

const notification = computed(() => notificationStore.active)

/** Above the popups open when it shows; one that opens later stacks above it, as its focus trap does. */
const displaceIdx = ref(0)
const confirmBtnType = computed(() => {
	switch (notification.value?.type) {
		case "info":
			return "primary"
		case "warning":
			return "red"
		default:
			return "secondary"
	}
})

const isLoading = ref(false)
const confirm = async () => {
	isLoading.value = true
	try {
		await notification.value?.payload.onConfirm?.()
	} catch (err) {
		console.error(err)
	} finally {
		isLoading.value = false
		notificationStore.removeActive()
	}
}

const cancel = async () => {
	isLoading.value = true
	try {
		await notification.value?.payload.onCancel?.()
	} catch (err) {
		console.error(err)
	} finally {
		isLoading.value = false
		notificationStore.removeActive()
	}
}

/** Escape and a tap outside answer as Cancel does, never as the confirm, and not while an answer runs. */
const dismiss = () => {
	if (!isLoading.value) cancel()
}

/** The answer that is never an approval takes the focus, so an Enter can act on nothing behind the notice. */
const initialFocus = computed(() => {
	const payload = notification.value?.payload
	if (payload?.onCancel) return "[data-testid='notification-cancel']"
	return payload?.onConfirm ? "[data-testid='notification-confirm']" : false
})

watch(
	() => Boolean(notification.value),
	(shown) => {
		if (shown) displaceIdx.value = popupStore.len
	},
	{ immediate: true, flush: "sync" },
)
</script>

<template>
	<Popup :show="Boolean(notification)" :displaceIdx :initialFocus="initialFocus" @onClose="dismiss">
		<!-- Fixed to the viewport, as the document under it can scroll (the onboarding tab). The close
			areas are the card's siblings, as Popup's is, so a press on the card released off it closes nothing. -->
		<div v-if="notification" :class="$style.layer">
		<div :class="$style.close_area" @click="dismiss" />
		<Flex
			align="center"
			direction="column"
			gap="12"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="notification-title"
			aria-describedby="notification-description"
			:class="$style.card"
			data-testid="notification"
		>
			<Flex align="center" gap="8">
				<Icon
					v-if="notification.type === 'warning'"
					name="warning"
					size="18"
					color="orange"
				/>

				<Text id="notification-title" variant="title-page" color="primary">
					{{ notification.payload.title }}
				</Text>
			</Flex>

			<Text id="notification-description" variant="body" color="body" height="140" align="center" data-testid="notification-description">
				{{ notification.payload.description }}
			</Text>

			<Text v-if="notification.payload.note" variant="body" color="secondary" height="140" align="center" style="font-style: italic;">
				<Text variant="value">Note: </Text>
				{{ notification.payload.note }}
			</Text>

			<Flex gap="12" wide>
				<Button
					v-if="notification.payload.onCancel"
					@click="cancel"
					wide
					variant="primary_outline"
					size="medium"
					data-testid="notification-cancel"
				>
					{{ notification.payload.cancelText || "Cancel" }}
				</Button>

				<Button
					v-if="notification.payload.onConfirm"
					@click="confirm"
					wide
					:type="confirmBtnType"
					:loading="isLoading"
					size="medium"
					data-testid="notification-confirm"
				>
					{{ notification.payload.confirmText || "Confirm" }}
				</Button>
			</Flex>
		</Flex>
		<div :class="$style.close_area" @click="dismiss" />
		</div>
	</Popup>
</template>

<style module>
.layer {
	position: fixed;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.close_area {
	flex: 1;
	align-self: stretch;
}

.card {
	background: var(--nulo-surface);
	box-shadow: 0 0 0 1px var(--nulo-border), 0 -6px 16px rgba(10, 9, 8, 0.3);

	width: 90%;
	max-width: 480px;
	padding: 24px;
	/* Notice text can carry data: one string wider than the card. A centred flex item never shrinks
	 * below its min-content width, which `anywhere` lowers and `break-word` does not. */
	overflow-wrap: anywhere;
}
</style>
