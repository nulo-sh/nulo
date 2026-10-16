<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Vendor */
import { onMounted } from "vue"

/** Utils */
import { closeCurrentWindow } from "@/utils/close-current-window"
import { DappInteractionServiceClient } from "@/wallet/services/dapp-interaction/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"

const params = new URLSearchParams(window.location.search)
const requestId = params.get("requestId")
const payload = ref()
const data = computed(() => payload.value?.params.operations)

let profileService

function onActiveProfileChanged(profile) {
	if (!profile) closeCurrentWindow()
}

// The subscription ends with the document, not the page: a lock routes this window to the auth
// page, and a disconnect on unmount would reject the profile read still in flight, leaving the
// window open over a locked wallet.
function onClose() {
	profileService?.disconnect()
	profileService = null
}

onMounted(async () => {
	profileService = new ProfileServiceClient()
	profileService.connect()
	await profileService.subscribeActiveProfile(onActiveProfileChanged)
	window.addEventListener("beforeunload", onClose)

	// A request the worker no longer holds leaves the window empty.
	const client = new DappInteractionServiceClient()
	payload.value = await client.getInteractionPayload(requestId).catch(() => undefined)
	client.disconnect()
})

onUnmounted(() => {
	window.removeEventListener("beforeunload", onClose)
})
</script>

<template>
	<Flex
		v-if="data"
		data-testid="json-content"
		align="start"
		direction="column"
		justify="start"
		gap="12"
		:class="[$style.wrapper, $style.json_viewer]"
	>
		<JsonViewer :data="data" fullscreen />
	</Flex>
</template>

<style module>
body {
	width: 100%;
	height: 100%;

	background: var(--app-bg);

	margin: 0 auto;
}

.wrapper {
	composes: viewer_wrapper from "../window-shell.module.css";
}

.json_viewer {
	composes: json_viewer from "../window-shell.module.css";
}
</style>
