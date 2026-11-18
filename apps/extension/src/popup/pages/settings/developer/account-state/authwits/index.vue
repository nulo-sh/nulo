<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Components */
import { Dropdown } from "@/components/ui/Dropdown"
import AuthwitCard from "@/popup/components/modules/settings/authwits/AuthwitCard.vue"

/** Services */
import { AuthRegistryServiceClient } from "@/wallet/services/auth-registry/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TaskServiceClient } from "@/wallet/services/task/client"
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { useEntityCrud } from "@/composables/useEntityCrud"
import { useTokenFlags } from "@/composables/usePrices"
import { useRevokeTasks } from "@/composables/useRevokeTasks"

/** Helpers */
import {
	authwitAction,
	authwitMatchesSearch,
	decorateAuthwit,
	sortAuthwits,
} from "@/popup/components/modules/settings/authwits/authwit-helpers"
import { contractChipAt } from "@/popup/windows/execute/contract-chips"
import { stripBidiAndZeroWidth } from "@/utils/string"

const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const popupStore = usePopupStore()
const cacheStore = useCacheStore()

const isRegistryEnabled = ref(true)
const isFetchingRegistryStatus = ref(false)
const searchTerm = ref("")

const authwitsService = new AuthRegistryServiceClient()
const tokenService = new TokenServiceClient()
const priceService = new PriceServiceClient()
const marks = useTokenFlags(priceService)
const tokens = ref([])
// A revoke runs on in the worker after its popup closes; its task tells each row how it stands.
const taskService = new TaskServiceClient()
const revokeTasks = useRevokeTasks({ client: taskService })
taskService.onTaskCreated.add(revokeTasks.onTaskCreated)
taskService.onTaskUpdated.add(revokeTasks.onTaskUpdated)
taskService.onTaskDeleted.add(revokeTasks.onTaskDeleted)

const {
	entities: authwits,
	isLoading: isFetchingAuthwits,
	error,
	refresh: refreshAuthwits,
} = useEntityCrud({
	fetch: async () => (await authwitsService.getAuthwits(appStore.network.chainId, appStore.account.address)) ?? [],
	added: authwitsService.onAuthwitAdded,
	updated: authwitsService.onAuthwitUpdated,
	deleted: authwitsService.onAuthwitDeleted,
	identity: (aw) => aw.id,
	// The list is (profile, chain, account)-scoped: the same address on another chain or profile
	// must not splice in mid-switch.
	accept: (aw) =>
		aw.profileId === appStore.profile?.id && aw.chainId === appStore.network?.chainId && aw.account === appStore.account?.address,
})

// Decorated here, not in `fetch`: an event splices the service's raw row into the list.
const filteredAuthwits = computed(() => {
	const sorted = sortAuthwits(authwits.value.map(decorateAuthwit))
	const term = searchTerm.value.trim()
	if (!term) return sorted
	return sorted.filter((aw) => authwitMatchesSearch(aw, term))
})

const isErrorOccurred = computed(() => !!error.value)

// No name book: an unlisted contract reads its short address, never a name the person gave it.
const chipContext = computed(() => ({
	reader: marks,
	chainId: appStore.network?.chainId,
	tokens: tokens.value,
	explorerId: appStore.defaultExplorer,
}))
const chipOf = (aw) => (authwitAction(aw.content) ? contractChipAt(chipContext.value, aw.content.contract) : null)

// A token list that fails to load only lowers what a chip claims; only the latest read lands.
let latestTokenRead = 0
async function fetchTokens() {
	const read = ++latestTokenRead
	const { profile, network } = appStore
	const held = profile && network ? await tokenService.getTokens(profile.id, network.chainId).catch(() => []) : []
	if (read === latestTokenRead) tokens.value = held ?? []
}

const isShownScope = (scope) =>
	scope.profileId === appStore.profile?.id && scope.chainId === appStore.network?.chainId && scope.account === appStore.account?.address
function onRegistryEnabled(scope) {
	if (isShownScope(scope)) isRegistryEnabled.value = true
}
function onRegistryDisabled(scope) {
	if (isShownScope(scope)) isRegistryEnabled.value = false
}
authwitsService.onRegistryEnabled.add(onRegistryEnabled)
authwitsService.onRegistryDisabled.add(onRegistryDisabled)

async function fetchRegistryStatus() {
	isFetchingRegistryStatus.value = true
	try {
		isRegistryEnabled.value = await authwitsService.getRegistryEnabled(appStore.network.chainId, appStore.account.address)
	} catch {
		// surfaced via the entity-crud error ref already
	} finally {
		isFetchingRegistryStatus.value = false
	}
}

function handleRefetch() {
	openToast({ kind: "success", label: "Fetching authwits again" })
	refreshAuthwits()
}

function changeAuthwitsRegistry() {
	popupStore.open("change_authwits_registry")
}

function revokeAuthwits(aw) {
	cacheStore.preselectedAuthwits = aw ? [aw] : authwits.value
	popupStore.open("revoke_authwits")
}

const handleOpenAuthwit = (aw) => {
	cacheStore.viewerData = aw.content
	popupStore.open("data_viewer")
}

// A profile/account switch emits no authwit events and this route is not
// remounted — refetch explicitly. `clear` empties the foreign scope's rows
// synchronously so a failed refetch cannot leave them rendered; the
// composable's fetch sequence retires any in-flight stale fetch.
watch(
	() => [appStore.profile?.id, appStore.network?.chainId, appStore.account?.address],
	() => {
		void refreshAuthwits({ clear: true })
		void fetchRegistryStatus()
		void fetchTokens()
		void revokeTasks.snapshot()
	},
)

onMounted(async () => {
	if (appStore.account && appStore.isLogined) {
		void fetchTokens()
		void revokeTasks.snapshot()
		await fetchRegistryStatus()
	}
})

onBeforeUnmount(() => {
	authwitsService.onRegistryEnabled.remove(onRegistryEnabled)
	authwitsService.onRegistryDisabled.remove(onRegistryDisabled)
	authwitsService.disconnect()
	tokenService.disconnect()
	priceService.disconnect()
	marks.dispose()
	taskService.onTaskCreated.remove(revokeTasks.onTaskCreated)
	taskService.onTaskUpdated.remove(revokeTasks.onTaskUpdated)
	taskService.onTaskDeleted.remove(revokeTasks.onTaskDeleted)
	revokeTasks.dispose()
	taskService.disconnect()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<SubPageHeader title="Authwits" :backTo="'/popup/settings/developer/account-state'">
			<template #trailing>
				<Dropdown>
					<button type="button" data-testid="authwits-actions-btn" :class="$style.icon_btn" aria-label="Authwit actions">
						<Icon name="settings" :size="18" color="secondary" />
					</button>

					<template #popup>
						<DropdownItem data-testid="authwits-toggle-registry" @click="changeAuthwitsRegistry">
							<Flex align="center" gap="8">
								<Icon name="lock" size="14" color="secondary" />
								{{ `${isRegistryEnabled ? "Disable" : "Enable"} authwits registry` }}
							</Flex>
						</DropdownItem>
						<DropdownItem data-testid="authwits-revoke-all" @click="revokeAuthwits()" :disabled="!authwits.length">
							<Flex align="center" gap="8">
								<Icon name="close" size="14" color="secondary" />
								Revoke all authwits
							</Flex>
						</DropdownItem>
					</template>
				</Dropdown>
			</template>
		</SubPageHeader>

		<Flex direction="column" gap="16" wide :class="$style.content">
			<Flex v-if="!isRegistryEnabled" align="center" justify="center" gap="6" wide :class="$style.warning">
				<Icon name="warning" color="orange" size="14" />
				<Text variant="body" color="secondary">
					Account authwits registry
					<Text color="orange"> disabled</Text>
				</Text>
			</Flex>
			<Input
				v-if="authwits.length"
				v-model="searchTerm"
				:normalize="stripBidiAndZeroWidth"
				icon="search"
				placeholder="Search by kind, address or function"
				clearable
				@clear="searchTerm = ''"
			/>

			<AsyncListStatus v-if="isFetchingAuthwits || isErrorOccurred" :loading="isFetchingAuthwits" :error="error" label="FETCHING AUTHWITS" @retry="handleRefetch" />

			<Flex v-else-if="filteredAuthwits.length" direction="column" gap="8">
				<AuthwitCard
					v-for="aw in filteredAuthwits"
					:key="aw.id"
					:authwit="aw"
					:chip="chipOf(aw)"
					:revokeState="revokeTasks.stateOf(aw.id)"
					@open="handleOpenAuthwit"
					@revoke="revokeAuthwits"
				/>
			</Flex>

			<ListStatusMessage v-else-if="filteredAuthwits.length === 0 && searchTerm" variant="no-results" />

			<ListStatusMessage v-else headline="NO AUTHWITS YET" sub="Approved authorizations you grant will appear here." />
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	composes: wrapper from "../../../../../../components/composite/settings-page.module.css";
}

.content {
	composes: content from "../../../../../../components/composite/settings-page.module.css";
}

.icon_btn {
	composes: icon_btn from "../../../../toolbar-button.module.css";
}

.warning {
	padding: 4px;
}




</style>
