<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"

/** Utils */
import { accountStateOf } from "@/components/header-account"

const appStore = useAppStore()
const popupStore = usePopupStore()

const router = useRouter()

const props = defineProps({
	token: {
		type: Object,
		required: false,
	},
})

// Until a switched-to network's account loads, the store still holds the previous network's,
// whose address Receive would show under the new network's name.
const accountReady = () => accountStateOf(appStore) === "shown"

const handleSend = () => {
	if (!accountReady()) return
	// Thread the token via query — tokens/[id] clears cacheStore.activeTokenIdx
	// on unmount, so the cache store alone can't carry the preselection across
	// navigation. Home has no token context; no query → send page picks tokens[0].
	router.push({ path: "/popup/send", query: props.token ? { tokenId: props.token.id } : {} })
}

const handleReceive = () => {
	if (!accountReady()) return
	popupStore.open("receive")
}
</script>

<template>
	<Flex wide align="center" gap="16">
		<Flex tag="button" type="button" @click="handleSend" wide align="center" justify="center" :class="[$style.button, $style.primary]" data-testid="actions-send">
			<span :class="$style.label">SEND</span>
		</Flex>

		<Flex tag="button" type="button" @click="handleReceive" wide align="center" justify="center" :class="[$style.button, $style.secondary]" data-testid="actions-receive">
			<span :class="$style.label">RECEIVE</span>
		</Flex>
	</Flex>
</template>

<style module>
.button {
	height: 52px;

	font: inherit;
	cursor: pointer;
	border-radius: 0;

	transition: all 0.2s var(--bezier);

	&:active {
		transform: scale(0.97);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.primary {
	background: var(--nulo-accent);

	&:hover {
		opacity: 0.9;
	}
}

.secondary {
	background: transparent;
	box-shadow: inset 0 0 0 1px var(--nulo-outline);

	&:hover {
		background: var(--nulo-surface-low);
	}
}

.label {
	composes: type--button from global;
}

.primary .label {
	color: var(--txt-inverse);
}

.secondary .label {
	color: var(--nulo-accent);
}
</style>
