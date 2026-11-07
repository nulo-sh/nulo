<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Utils */
import { SWITCH_SETTLED_KEY } from "@/popup/network-switch"
import { managers, requireAccount } from "@/utils/core"
import { switchAndAnnounce } from "./switch-toast"
import { sentenceName } from "@/utils/string"
import * as staleCopy from "@/components/stale-network/copy"
import { AccountType, DEFAULT_IMPORTED_ACCOUNT_NAME } from "@/wallet/services/account/client"
import { endpointsInOrder } from "@/wallet/services/network/client"
import { routeOrder } from "@/utils/endpoint-order"
import { endpointStatus, movedFirstWarning } from "@/utils/endpoint-status"

/** Components */
import EndpointOrderList from "@/popup/components/modules/settings/endpoints/EndpointOrderList.vue"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfirm } from "@/composables/useConfirm"
import { useNetworkActivation } from "@/composables/useNetworkActivation"
import { exportsHeld } from "@/composables/useStaleNetwork"
import { useRouteSnapshot } from "@/composables/useRouteSnapshot"
const { openToast } = useToast()
const { requestConfirm } = useConfirm()
const { activate: activateNetwork } = useNetworkActivation({
	persist: (id) => managers.network.setActiveNetwork(id),
	read: () => managers.network.getActiveNetwork(),
})
const switchSettled = inject(SWITCH_SETTLED_KEY)
const {
	view: routeView,
	refresh: refreshRoute,
	dispose: disposeRoute,
} = useRouteSnapshot({ client: managers.network, getNetwork: () => network.value })

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

/** The order a move asked for, shown until its write settles; one naming another set of endpoints
 *  than the row's is ignored. */
const pendingOrder = ref(null)
const shownEndpoints = computed(() => {
	const n = network.value
	if (!n) return []
	if (pendingOrder.value) {
		try {
			return endpointsInOrder(n, pendingOrder.value)
		} catch {
			// Another set of endpoints than the move's: the row's own order.
		}
	}
	return routeOrder(n.endpoints, n.primaryEndpointId)
})
/** `{ id, text }`: the row a move put first while it was not answering, for its warning line. */
const movedFirst = ref(null)

/** The hold a reset puts on network `id`, with the imported accounts deleting it would delete. A
 *  running reset's takeover covers this page, so only a paused one's view is read. */
async function readHeldReset(id) {
	const pending = await managers.networkReset.getPendingReset()
	if (pending?.networkId !== id) return null
	const view = pending.running ? null : await managers.networkReset.getStaleNetwork(id)
	return { imported: view?.reset?.imported ?? [], exportable: exportsHeld(view, appStore.profile?.type) }
}

/** The imported accounts deleting network `network` deletes, and whether they can be exported first:
 *  a paused reset's list, which already names the chain's live imports, else the chain's live ones.
 *  Full backup exports those unless a reset is pending; then only account export can, from a password
 *  profile once the chain is active, which a stale chain never is. */
async function readDeletedImports(network) {
	const held = await readHeldReset(network.id)
	if (held) return held
	// `getAccounts` answers while locked, so a read the lock or a page change overtook stops before it.
	if (disposed || !appStore.isLogined || networkId.value !== network.id) throw new Error("read overtaken")
	const [rows, pending] = await Promise.all([
		requireAccount().getAccounts(appStore.profile?.id, network.chainId, true),
		managers.networkReset.getPendingReset(),
	])
	const imported = rows.filter((a) => a.type === AccountType.Imported)
	const exportable =
		!pending || (appStore.profile?.type === "password" && (await managers.networkReset.getStaleNetwork(network.id)) === null)
	return { imported: imported.map((a) => sentenceName(a.name, DEFAULT_IMPORTED_ACCOUNT_NAME)), exportable }
}

/** What the confirmation says deleting `network` removes; null when it cannot be known. */
async function deleteDescription(network) {
	const held = await readDeletedImports(network).catch(() => null)
	if (!held) return null
	return [
		"This wipes accounts, balances, tokens, and PXE state on this chain. This cannot be undone.",
		held.imported.length ? staleCopy.deleteChainImported(held.imported, held.exportable) : "",
	]
		.filter(Boolean)
		.join(" ")
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
	// Refusals and the unconfirmed outcome toast inside the composable.
	await switchAndAnnounce(target, { store: appStore, activate: activateNetwork, settled: switchSettled, openToast })
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

/** Moves are written one at a time, in the order they were made. */
let writes = Promise.resolve()
let moves = 0
/** The latest move that changed the first row: only its warning may show. */
let firstMove = 0

/** Writes `ids` as the row's order. Only a move that changes the first row toasts a success; a
 *  refused one re-reads the row, which another window may have changed meanwhile. A re-read that
 *  fails after a write landed does not make the write a failure. */
async function writeOrder(id, ids, firstChanged) {
	let written
	try {
		written = await managers.network.reorderEndpoints(id, ids)
	} catch {
		await refreshNetworks().catch(() => {})
		openToast({ kind: "error", label: firstChanged ? "Failed to update primary endpoint" : "Failed to update the endpoint order" })
		return false
	}
	// The written row stands in until the re-read lands, so a failed re-read never shows the old order.
	if (written?.id === id) appStore.networks = appStore.networks.map((n) => (n.id === id ? written : n))
	await refreshNetworks().catch(() => {})
	if (firstChanged) openToast({ kind: "success", label: "Primary endpoint updated" })
	return true
}

const handleReorder = (ids) => {
	const target = network.value
	if (!target || heldReset.value) return
	const move = ++moves
	const firstChanged = shownEndpoints.value[0]?.id !== ids[0]
	// Judged on the dot before the move: the rebuilt route starts every endpoint unasked.
	const before = routeView.value?.snapshot?.endpoints.find((e) => e.id === ids[0])?.state
	const warning = firstChanged ? movedFirstWarning(before) : null
	if (firstChanged) {
		firstMove = move
		movedFirst.value = null
	}
	pendingOrder.value = ids
	writes = writes
		.then(() => writeOrder(target.id, ids, firstChanged))
		.then((written) => {
			if (written && warning && move === firstMove) movedFirst.value = { id: ids[0], text: warning }
		})
		.finally(() => {
			if (move === moves) pendingOrder.value = null
		})
}

const handleDeleteEndpoint = (endpoint) => {
	if (!network.value) return
	if (network.value.primaryEndpointId === endpoint.id) return
	if (network.value.endpoints.length === 1) return

	requestConfirm({
		confirm_text: "Yes, delete endpoint",
		confirm_color: "red",
		irreversible: true,
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

/** Each press and each Confirm; one a later one or the lock overtook while it read acts no further. */
let deleteAttempts = 0
const overtaken = (id, attempt) => disposed || !appStore.isLogined || networkId.value !== id || attempt !== deleteAttempts

/** The delete goes only on what its confirmation said: Confirm reads the chain again, and an import
 *  made since, in another window, reopens the confirmation naming it instead of deleting. */
const confirmDeleteNetwork = (id, name, description) =>
	requestConfirm({
		confirm_text: "Yes, delete chain",
		confirm_color: "red",
		irreversible: true,
		title: `Delete ${name}?`,
		description,
		callback: async () => {
			const attempt = ++deleteAttempts
			const target = network.value
			const now = target?.id === id ? await deleteDescription(target) : null
			if (overtaken(id, attempt)) return
			if (now === null) return openToast({ kind: "error", label: "Failed to delete chain" })
			if (now !== description) return confirmDeleteNetwork(id, name, now)
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

const handleDeleteNetwork = async () => {
	if (!network.value) return
	if (!canDelete.value) return
	const { id, name } = network.value
	const attempt = ++deleteAttempts
	// Read at the click: a confirmation opened before the page's own read landed must still name them.
	const description = await deleteDescription(network.value)
	if (overtaken(id, attempt)) return
	// An unknown hold is not an empty one: the confirmation never omits what the delete removes.
	if (description === null) return openToast({ kind: "error", label: "Failed to delete chain" })
	confirmDeleteNetwork(id, name, description)
}

// If the network row disappears (deleted from elsewhere), redirect back to the list.
watch(network, (n) => {
	if (!n) router.replace("/popup/settings/networks")
})

// The router reuses this page across network ids; a hold read for one must never show on another.
watch(networkId, () => {
	heldReset.value = null
	movedFirst.value = null
	pendingOrder.value = null
	void syncHeldReset()
})

// Every change to the row may be a change to its route, whose old answer is then cleared.
watch(network, () => void refreshRoute(), { immediate: true })
watch(
	routeView,
	(view) => {
		cacheStore.endpointRoute = view
	},
	{ immediate: true },
)

// The warning is the move's: it goes once the row is no longer first or the router finds it answering.
watch([() => shownEndpoints.value[0]?.id, routeView], ([first, view]) => {
	const moved = movedFirst.value
	if (moved && (first !== moved.id || endpointStatus(view, moved.id).tone === "green")) movedFirst.value = null
})

onBeforeUnmount(() => {
	disposed = true
	managers.networkReset.onStaleNetworkChanged.remove(syncHeldReset)
	disposeRoute()
	cacheStore.endpointRoute = null
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
			<EndpointOrderList
				:endpoints="shownEndpoints"
				:view="routeView"
				:held="!!heldReset"
				:warning="movedFirst"
				:primaryId="network.primaryEndpointId"
				@reorder="handleReorder"
				@edit="handleEditEndpoint"
				@remove="handleDeleteEndpoint"
			/>

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
