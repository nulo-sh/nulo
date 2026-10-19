<script setup lang="ts">
/** Vendor */
import type { PropType } from "vue"

/** Components */
import TakeoverLayout from "@/components/composite/TakeoverLayout.vue"

/** Composables */
import { useLockWallet } from "@/composables/useLockWallet"
import { useNetworkActivation } from "@/composables/useNetworkActivation"
import { NETWORK_ARRIVAL_KEY } from "@/composables/useNetworkArrival"

/** Utils */
import { managers } from "@/utils/core"
import type { TakeoverContent } from "@/components/composite/takeover"
import type { Network } from "@/wallet/services/network/client"
import * as copy from "./copy"

/** Store */
import { usePopupStore } from "@/stores/popup.store"

const props = defineProps({
	/** The network that arrived. */
	network: { type: Object as PropType<Network>, required: true },
	/** The active network's name. */
	current: { type: String, required: true },
})

const popupStore = usePopupStore()

const { lock, dispose: disposeLock } = useLockWallet(managers.profile)
const { activate } = useNetworkActivation({
	persist: (id) => managers.network!.setActiveNetwork(id),
	read: () => managers.network!.getActiveNetwork(),
})
const arrival = inject(NETWORK_ARRIVAL_KEY)!

const router = useRouter()

const switching = ref(false)

/** The network service records the switch as the answer. */
const switchTo = async () => {
	switching.value = true
	try {
		await activate(props.network)
	} finally {
		switching.value = false
	}
}

const content = computed<TakeoverContent>(() => {
	const c = copy.arrival(props.network.name, props.current)
	return {
		eyebrow: { icon: "add", text: c.eyebrow, color: "primary" },
		title: c.title,
		body: c.body,
		box: { label: c.label, lines: c.lines.map((text) => ({ mark: "check", text })) },
		primary: { text: c.switchTo, testid: "network-arrival-switch", action: switchTo },
		secondary: { text: c.stay, testid: "network-arrival-stay", action: () => arrival.stay(props.network.id), guarded: true },
	}
})

// A popup opened over the route the arrival replaces must not outlive it.
onMounted(() => popupStore.closeAll())
onBeforeUnmount(() => {
	disposeLock()
})
</script>

<template>
	<TakeoverLayout
		:content="content"
		:chip="copy.chipLabel(current)"
		:busy="switching || arrival.answering.value"
		testid-prefix="network-arrival"
		data-screen="arrival"
		@chip="router.push('/popup/settings/networks')"
		@lock="lock"
	/>
</template>
