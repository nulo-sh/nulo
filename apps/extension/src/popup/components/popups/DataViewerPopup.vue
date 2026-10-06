<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { usePopupStack } from "@/composables/usePopupStack"

/** Store */
import { useCacheStore } from "@/stores/cache.store.ts"
const { order, depth } = usePopupStack("data_viewer")
const cacheStore = useCacheStore()

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const data = computed(() => cacheStore.viewerData)

watch(
	() => props.show,
	async () => {
		if (!props.show) {
			cacheStore.viewerData = null
		}
	},
)
</script>

<template>
	<Popup :show="show" @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<Flex wide align="center" direction="column" gap="24" :class="$style.wrapper" data-testid="data-viewer">
				<JsonViewer :data="data" />

				<Button v-snack-footer @click="emit('onClose')" variant="primary_outline" size="medium" wide>Close</Button>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "./popup-shared.module.css";
}
</style>
