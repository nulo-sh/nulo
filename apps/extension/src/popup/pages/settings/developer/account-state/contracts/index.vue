<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup lang="ts">
/** Components */
import ContractChip from "@/components/composite/ContractChip.vue"

/** Services */
import { AccountStateServiceClient, type ContractRow } from "@/wallet/services/account-state/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { type TokenInfo, TokenServiceClient } from "@/wallet/services/token/client"
import type { Contact } from "@/wallet/services/contact/client"

/** Utils */
import { copyWithToast } from "@/utils/clipboard"
import { managers } from "@/utils/core"
import { stripBidiAndZeroWidth, trimAddress } from "@/utils/string"
import { explorerDisplayName } from "@/wallet/constants/explorers"
import { nameBookOf } from "@/popup/windows/execute/contract-chips"
import { contractRowViews, matchingRows, ORIGIN_WORDS } from "./contract-rows"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { useTokenFlags } from "@/composables/usePrices"

/** Store */
import { useAppStore } from "@/stores/app.store"

const appStore = useAppStore()
const { openToast } = useToast()

const accountStateService = new AccountStateServiceClient()
const tokenService = new TokenServiceClient()
const priceService = new PriceServiceClient()
const marks = useTokenFlags(priceService)

const rows = ref<ContractRow[]>([])
const tokens = ref<TokenInfo[]>([])
const contacts = ref<readonly Contact[]>([])
const searchTerm = ref<string>()
const isFetchingContracts = ref(false)
const error = ref<unknown>()
const isErrorOccurred = computed(() => !!error.value)

const views = computed(() =>
	contractRowViews(rows.value, {
		chip: { reader: marks, chainId: appStore.network?.chainId, tokens: tokens.value },
		names: nameBookOf(contacts.value, appStore.accounts),
		accounts: appStore.accounts,
		explorerId: appStore.defaultExplorer,
	}),
)
const filteredContracts = computed(() => matchingRows(views.value, searchTerm.value))
const explorerLabel = computed(() => `View on ${explorerDisplayName(appStore.defaultExplorer)}`)

// A token row or a name that fails to load only lowers what a row claims; the rows' own failure is the
// page's. Only the latest read lands: an earlier one answers for the scope it started in.
let latestRead = 0
// A profile reboot keeps this page mounted, so a new scope drops what the old one held or will answer;
// its read waits for the scope's account, set only after its accounts, which the rows are judged by.
const dropReads = () => {
	latestRead++
	rows.value = []
	tokens.value = []
	contacts.value = []
	error.value = undefined
	isFetchingContracts.value = false
}
const fetchContracts = async (isRefetching?: boolean) => {
	const { network, profile } = appStore
	if (!network || !profile) return
	const read = ++latestRead
	if (isRefetching) openToast({ kind: "success", label: "Fetching contracts again" })
	isFetchingContracts.value = true
	error.value = undefined

	try {
		const [held, heldTokens, heldContacts] = await Promise.all([
			accountStateService.getContractRows(network.id),
			tokenService.getTokens(profile.id, network.chainId).catch((): TokenInfo[] => []),
			managers.contact.getContacts().catch((): Contact[] => []),
		])
		if (read !== latestRead) return
		tokens.value = heldTokens
		contacts.value = heldContacts
		rows.value = held
	} catch (err) {
		if (read === latestRead) error.value = err
	} finally {
		if (read === latestRead) isFetchingContracts.value = false
	}
}

const copy = (value: string, label: string) => void copyWithToast(value, openToast, label)

watch(() => [appStore.profile?.id, appStore.network?.id], dropReads)

watch(
	() => appStore.account,
	() => {
		fetchContracts()
	},
)

onMounted(async () => {
	if (appStore.network && appStore.isLogined) fetchContracts()
})

onBeforeUnmount(() => {
	accountStateService.disconnect()
	tokenService.disconnect()
	priceService.disconnect()
	marks.dispose()
})
</script>

<template>
	<SettingsPageShell title="Contracts" :backTo="'/popup/settings/developer/account-state'" gap="16" v-if="appStore.isLogined">
		<AsyncListStatus v-if="isFetchingContracts || isErrorOccurred" :loading="isFetchingContracts" :error="error" label="FETCHING CONTRACTS" @retry="fetchContracts(true)" />

		<Flex v-else-if="rows.length" direction="column" gap="8">
			<Input
				v-model="searchTerm"
				:normalize="stripBidiAndZeroWidth"
				icon="search"
				placeholder="Search by name or address"
				clearable
				@clear="searchTerm = ''"
			/>

			<ListStatusMessage v-if="searchTerm && filteredContracts.length === 0" variant="no-results" />

			<div
				v-else
				v-for="v in filteredContracts"
				:key="v.row.address"
				data-testid="contract-row"
				:data-address="v.row.address"
				:data-origin="v.origin"
				:class="$style.card"
			>
				<div :class="$style.body">
					<ContractChip :model="v.chip" testid="contract-row-name" />
					<div :class="$style.ids">
						<span :class="$style.id">
							<Text variant="caption" color="tertiary">Instance</Text>
							<Text variant="meta" color="secondary" data-testid="contract-row-instance">{{ trimAddress(v.row.address, 6, 4) }}</Text>
							<RowAction label="Copy contract address" data-testid="contract-row-copy-instance" @click="copy(v.row.address, 'Contract address is copied')">
								<Icon name="copy" size="12" color="tertiary" />
							</RowAction>
						</span>
						<span v-if="v.row.classId" :class="$style.id">
							<Text variant="caption" color="tertiary">Class</Text>
							<Text variant="meta" color="secondary" data-testid="contract-row-class">{{ trimAddress(v.row.classId, 6, 4) }}</Text>
							<RowAction label="Copy class id" data-testid="contract-row-copy-class" @click="copy(v.row.classId, 'Class id is copied')">
								<Icon name="copy" size="12" color="tertiary" />
							</RowAction>
						</span>
					</div>
					<Text variant="caption" color="tertiary" data-testid="contract-row-origin">{{ ORIGIN_WORDS[v.origin] }}</Text>
				</div>
				<Tooltip v-if="v.explorerUrl" side="top" position="end" delay="350">
					<RowAction :href="v.explorerUrl" :label="explorerLabel" data-testid="contract-row-explorer">
						<Icon name="open" size="14" color="tertiary" />
					</RowAction>
					<template #content>{{ explorerLabel }}</template>
				</Tooltip>
			</div>
		</Flex>

		<ListStatusMessage v-else headline="NO CONTRACTS YET" sub="Contracts known to this profile on this network will appear here." />
	</SettingsPageShell>
</template>

<style module>
.card {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--nulo-border);
}

.body {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	min-width: 0;
}

.ids {
	display: flex;
	flex-wrap: wrap;
	column-gap: 14px;
	row-gap: 4px;
}

.id {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}
</style>
