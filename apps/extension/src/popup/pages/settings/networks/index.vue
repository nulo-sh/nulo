<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Services */
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Utils */
import { getChainPosition } from "@/components/ui/utils"
import { managers } from "@/utils/core"
import { stringCompare } from "@/utils/string"

/** Composables */
import { useToast } from "@/composables/toast"
import { useNetworkActivation } from "@/composables/useNetworkActivation"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const popupStore = usePopupStore()

const { openToast } = useToast()
const { activate } = useNetworkActivation({
	persist: (id) => managers.network.setActiveNetwork(id),
	read: () => managers.network.getActiveNetwork(),
})

// Custom chains are a developer surface: "Add network" is offered only under Developer Mode.
// Endpoints on the built-in networks, and rows that already exist, stay manageable for everyone.
const isDeveloperModeEnabled = ref(false)
const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)
function onSettingUpdate(setting) {
	if (setting.key === "developerMode") isDeveloperModeEnabled.value = setting.value === true
}

const networks = computed(() =>
	[...appStore.networks].sort((a, b) => {
		const chainPos = getChainPosition(a.chainId) - getChainPosition(b.chainId)
		return chainPos ? chainPos : stringCompare(a.name, b.name)
	}),
)

const isActive = (network) => appStore.network?.id === network.id

/** Each row's `SettingItem` by network id. */
const rows = new Map()
const setRow = (id, row) => (row ? rows.set(id, row) : rows.delete(id))

// Refusals and the unconfirmed outcome toast inside the composable.
async function handleSwitch(network) {
	if ((await activate(network)) === "activated") openToast({ kind: "success", label: "Active network updated" })
}

// Pre-flush, while the row becoming active still holds its Switch: the render replaces that row,
// so focus inside it moves to its new link instead of dropping to the body.
watch(
	() => appStore.network?.id,
	async (id) => {
		if (!rows.get(id)?.$el.contains(document.activeElement)) return
		await nextTick()
		const link = rows.get(id)?.$el
		const focused = document.activeElement
		if (!link?.isConnected || (focused && focused !== document.body && focused.isConnected)) return
		link.focus()
	},
)

onBeforeMount(async () => {
	isDeveloperModeEnabled.value = (await configService.getValue("developerMode")) === true
})

onBeforeUnmount(() => {
	configService.disconnect()
})
</script>

<template>
	<SettingsPageShell title="Manage Networks" :backTo="'/popup/settings'" gap="16">
		<SectionLabel label="Networks" :count="networks.length" />

		<ItemsContainer>
			<SettingItem
				v-for="network in networks"
				:key="network.id"
				:ref="(row) => setRow(network.id, row)"
				:to="`/popup/settings/networks/${network.id}`"
				:title="network.name"
				:controls="!isActive(network)"
				data-testid="network-row"
				:data-network-id="network.id"
				:data-network-name="network.name"
			>
				<template #dot>
					<div v-if="isActive(network)" :class="$style.active_dot" data-testid="network-active-dot" />
				</template>
				<template #right>
					<Flex align="center" gap="8">
						<Badge v-if="isActive(network)" variant="info" data-testid="network-active-badge">Active</Badge>
						<Button
							v-else
							variant="primary_outline"
							size="mini"
							:aria-label="`Switch to ${network.name}`"
							data-testid="network-row-switch"
							:data-network-name="network.name"
							@click="handleSwitch(network)"
						>
							Switch
						</Button>
						<Icon name="chevron" :size="18" color="secondary" :class="$style.chevron" />
					</Flex>
				</template>
			</SettingItem>
		</ItemsContainer>

		<Button
			v-if="isDeveloperModeEnabled"
			@click="popupStore.open('new_network')"
			wide
			variant="primary"
			size="large"
			data-testid="network-new-btn"
		>
			Add network
		</Button>
	</SettingsPageShell>
</template>

<style module>
.chevron {
	color: var(--nulo-secondary);
	transition: color 0.2s var(--bezier);
}

.active_dot {
	/* --green is Nulo's "active/live" status color (mirrors DappStatusStrip's ready dot). */
	width: 7px;
	height: 7px;
	flex: none;
	border-radius: 50%;
	background: var(--green);
}
</style>
