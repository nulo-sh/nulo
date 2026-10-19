<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Utils */
import { managers } from "@/utils/core"
import * as staleCopy from "@/components/stale-network/copy"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfirm } from "@/composables/useConfirm"
import { useNetworkActivation } from "@/composables/useNetworkActivation"
import { exportsHeld } from "@/composables/useStaleNetwork"
const { openToast } = useToast()
const { requestConfirm } = useConfirm()
const { activate: activateNetwork } = useNetworkActivation({
	persist: (id) => managers.network.setActiveNetwork(id),
	read: () => managers.network.getActiveNetwork(),
})

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { useCacheStore } from "@/stores/cache.store"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
const appStore = useAppStore()
const popupStore = usePopupStore()
const cacheStore = useCacheStore()

/** Router */
const route = useRoute()
const router = useRouter()

const networkId = computed(() => route.params.id)
const network = computed(() => appStore.networks.find((n) => n.id === networkId.value))
const isActive = computed(() => appStore.network?.id === networkId.value)
const canDelete = computed(() => !isActive.value && appStore.networks.length > 1)

/** The hold a reset puts on network `id`, with the imported accounts deleting it would delete. A
 *  running reset's takeover covers this page, so only a paused one's view is read. */
async function readHeldReset(id) {
	const pending = await managers.networkReset.getPendingReset()
	if (pending?.networkId !== id) return null
	const view = pending.running ? null : await managers.networkReset.getStaleNetwork(id)
	return { imported: view?.reset?.imported ?? [], exportable: exportsHeld(view, appStore.profile?.type) }
}

const heldReset = ref(null)
let resetReads = 0
let disposed = false
const syncHeldReset = async () => {
	const read = ++resetReads
	const held = await readHeldReset(networkId.value)
	if (read === resetReads) heldReset.value = held
}
managers.networkReset.onStaleNetworkChanged.add(syncHeldReset)
void syncHeldReset()

async function refreshNetworks() {
	appStore.networks = await managers.network.getNetworks()
	if (isActive.value) {
		const n = appStore.networks.find((x) => x.id === networkId.value)
		if (n) appStore.network = n
	}
}

const handleEditNetworkName = () => {
	cacheStore.networkToEditIdx = networkId.value
	popupStore.open("edit_network")
}

const handleSetActive = async () => {
	if (!network.value) return
	if (isActive.value) return
	// Snapshot before the await: `network` is computed from `route.params.id`,
	// and if the caller (or another reactive consumer) navigates while the
	// RPC is in flight, `network.value` becomes `undefined` after the await.
	// Without the snapshot, `appStore.network = network.value` would write
	// `undefined`, leaving the popup with no active network until the next
	// reactive trigger. See implementations-plan/archive/e2e-network-recovery/plan.md (Network watcher snapshot).
	const target = network.value
	// Refusals and the unconfirmed outcome toast inside the composable; "stale"
	// means the profile changed while this waited and nobody is left to toast at.
	const result = await activateNetwork(target)
	if (result !== "activated") return
	openToast({ kind: "success", label: "Active network updated" })
}

const handleAddEndpoint = () => {
	cacheStore.endpointEditNetworkId = networkId.value
	cacheStore.endpointEditId = null
	popupStore.open("new_endpoint")
}

const handleEditEndpoint = (endpoint) => {
	cacheStore.endpointEditNetworkId = networkId.value
	cacheStore.endpointEditId = endpoint.id
	popupStore.open("edit_endpoint")
}

const handleSetPrimary = async (endpoint) => {
	if (!network.value) return
	if (network.value.primaryEndpointId === endpoint.id) return
	try {
		await managers.network.setPrimaryEndpoint(network.value.id, endpoint.id)
		await refreshNetworks()
		openToast({ kind: "success", label: "Primary endpoint updated" })
	} catch {
		openToast({ kind: "error", label: "Failed to update primary endpoint" })
	}
}

const handleDeleteEndpoint = (endpoint) => {
	if (!network.value) return
	if (network.value.primaryEndpointId === endpoint.id) return
	if (network.value.endpoints.length === 1) return

	requestConfirm({
		confirm_text: "Yes, delete endpoint",
		confirm_color: "red",
		title: "Delete this endpoint?",
		description: `This RPC URL will be removed from ${network.value.name}. The chain itself stays.`,
		callback: async () => {
			try {
				await managers.network.deleteEndpoint(network.value.id, endpoint.id)
				await refreshNetworks()
				openToast({ kind: "success", label: "Endpoint deleted" })
			} catch (err) {
				const msg = errorMessageFromUnknown(err)
				if (msg.includes("PRIMARY_ENDPOINT")) {
					openToast({ kind: "error", label: "Make another endpoint primary first." })
				} else if (msg.includes("LAST_ENDPOINT")) {
					openToast({ kind: "error", label: "Last endpoint. Delete the chain instead." })
				} else {
					openToast({ kind: "error", label: "Failed to delete endpoint" })
				}
			}
		},
	})
}

const handleDeleteNetwork = async () => {
	if (!network.value) return
	if (!canDelete.value) return
	const { id, name } = network.value
	// Read at the click: a confirmation opened before the page's own read landed must still name them.
	let held
	try {
		held = await readHeldReset(id)
	} catch {
		held = undefined
	}
	if (disposed || networkId.value !== id) return
	// An unknown hold is not an empty one: the confirmation never omits what the delete removes.
	if (held === undefined) return openToast({ kind: "error", label: "Failed to delete chain" })
	requestConfirm({
		confirm_text: "Yes, delete chain",
		confirm_color: "red",
		title: `Delete ${name}?`,
		description: [
			"This wipes accounts, balances, tokens, and PXE state on this chain. This cannot be undone.",
			held?.imported.length ? staleCopy.deleteChainImported(held.imported, held.exportable) : "",
		]
			.filter(Boolean)
			.join(" "),
		callback: async () => {
			const target = network.value
			try {
				await appStore.removeNetwork(target)
				openToast({ kind: "success", label: "Chain deleted" })
				router.replace("/popup/settings/networks")
			} catch (err) {
				const msg = errorMessageFromUnknown(err)
				if (msg.startsWith("ACTIVE_NETWORK")) {
					openToast({ kind: "error", label: "Switch to another chain before deleting this one." })
				} else {
					openToast({ kind: "error", label: "Failed to delete chain" })
				}
			}
		},
	})
}

// If the network row disappears (deleted from elsewhere), redirect back to the list.
watch(network, (n) => {
	if (!n) router.replace("/popup/settings/networks")
})

// The router reuses this page across network ids; a hold read for one must never show on another.
watch(networkId, () => {
	heldReset.value = null
	void syncHeldReset()
})

onBeforeUnmount(() => {
	disposed = true
	managers.networkReset.onStaleNetworkChanged.remove(syncHeldReset)
})
</script>

<template>
	<SettingsPageShell :title="network.name" :backTo="'/popup/settings/networks'" gap="24" v-if="network">
		<!-- Network info -->
		<Flex direction="column" gap="12">
			<SectionLabel label="Chain" />
			<ItemsContainer>
				<SettingItem
					size="small"
					:title="isActive ? 'Active network' : 'Set as active network'"
					:description="isActive ? 'Currently in use' : 'Switch the wallet to this chain'"
					:icon="isActive ? 'square-check' : 'square'"
					:iconFillColor="isActive ? 'primary' : 'tertiary'"
					iconBgColor="transparent"
					:disabled="isActive"
					@click="handleSetActive"
					data-testid="network-set-active"
				/>
				<SettingItem
					size="small"
					title="Name"
					:description="network.name"
					trailingIcon="edit"
					@click="handleEditNetworkName"
					data-testid="network-detail-rename"
				/>
				<SettingItem
					size="small"
					title="Chain ID"
					:description="String(network.chainId)"
					descriptionVariant="meta"
					raw
					data-testid="network-detail-chain-id"
				/>
			</ItemsContainer>
		</Flex>

		<!-- Endpoints -->
		<Flex direction="column" gap="12">
			<SectionLabel label="Endpoints" :count="network.endpoints.length" />
			<Flex v-if="heldReset" align="start" gap="6" data-testid="endpoint-reset-held">
				<Icon name="warning" size="12" color="orange" aria-hidden="true" :class="$style.reason_icon" />
				<Text variant="body" color="secondary" height="140">{{ staleCopy.endpointsHeld(network.name) }}</Text>
			</Flex>
			<ItemsContainer>
				<!-- A bound onClick, not @click: SettingItem renders a row inert only with no click listener. -->
				<SettingItem
					v-for="endpoint in network.endpoints"
					:key="endpoint.id"
					:title="endpoint.label || endpoint.rpcUrl"
					:description="endpoint.label ? endpoint.rpcUrl : undefined"
					:icon="network.primaryEndpointId === endpoint.id ? 'square-check' : 'square'"
					:iconFillColor="network.primaryEndpointId === endpoint.id ? 'primary' : 'tertiary'"
					iconBgColor="transparent"
					:onClick="heldReset ? undefined : () => handleSetPrimary(endpoint)"
					data-testid="endpoint-row"
					:data-endpoint-id="endpoint.id"
				>
					<template v-if="!heldReset" #right>
						<Flex align="center" gap="8">
							<Tooltip position="end" delay="350">
								<RowAction label="Edit endpoint" data-testid="endpoint-edit-btn" @click="handleEditEndpoint(endpoint)">
									<Icon name="edit" size="14" color="tertiary" />
								</RowAction>
								<template #content>Edit endpoint</template>
							</Tooltip>
							<Tooltip
								position="end"
								delay="350"
								v-if="network.primaryEndpointId !== endpoint.id && network.endpoints.length > 1"
							>
								<RowAction label="Delete endpoint" data-testid="endpoint-delete-btn" @click="handleDeleteEndpoint(endpoint)">
									<Icon name="close" size="14" color="tertiary" />
								</RowAction>
								<template #content>Delete endpoint</template>
							</Tooltip>
						</Flex>
					</template>
				</SettingItem>
			</ItemsContainer>

			<Button
				@click="handleAddEndpoint"
				wide
				variant="primary_outline"
				size="medium"
				:disabled="!!heldReset"
				data-testid="endpoint-add-btn"
			>
				Add endpoint
			</Button>
		</Flex>

		<!-- Danger zone -->
		<Flex direction="column" gap="12" v-if="canDelete">
			<SectionLabel label="Danger zone" />
			<Button
				@click="handleDeleteNetwork"
				wide
				variant="primary_outline"
				size="medium"
				data-testid="network-delete-chain-btn"
			>
				Delete chain
			</Button>
			<Text variant="body" color="tertiary" height="140">
				Deleting wipes all accounts, balances, tokens and PXE state for this chain.
			</Text>
		</Flex>
	</SettingsPageShell>
</template>

<style module>
.reason_icon {
	flex-shrink: 0;
	margin-top: 2px;
}
</style>
