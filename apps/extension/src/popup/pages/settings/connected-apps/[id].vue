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
import PermissionRow from "@/components/composite/capabilities/PermissionRow.vue"
import DetailsTable from "@/components/composite/capabilities/DetailsTable.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { getNetworkName } from "@/components/ui/utils.js"

/** Services */
import { AccountServiceClient } from "@/wallet/services/account/client"
import { DappSessionServiceClient } from "@/wallet/services/dapp-session/client"
import { DappInteractionServiceClient } from "@/wallet/services/dapp-interaction/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { formatCaipAccount, parseCaipAccount } from "@/wallet/utils/caip"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { useConfirm } from "@/composables/useConfirm"
const { openToast } = useToast()
const { requestConfirm } = useConfirm()

/** Helpers */
import { formatSessionExpiry, parseSessionParams } from "@/popup/components/modules/settings/connected-apps/connected-app-helpers"
import {
	accountAddressRow,
	addressBookRow,
	authorizationsRow,
	holdsCallScope,
	holdsCanCreateAuthWit,
	isBroadRequest,
	plainText,
	unknownRow,
} from "@/popup/windows/capabilities/permission-rows"
import { buildDetailsTable, listsFunctionNames } from "@/popup/windows/capabilities/details-table"
import { isKnownCapability } from "@/wallet/services/dapp-session/capability-meta"
import { authorizationsEffective, coversAnyContract } from "@nulo/wallet-bridge"
import { isObjectLike } from "@nulo/wallet-core/utils"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { copyWithToast } from "@/utils/clipboard"
import { trimAddress } from "@/utils/string"
const appStore = useAppStore()

const route = useRoute()
const router = useRouter()

const session = ref()
const accounts = ref([])
// A read that settles around the unmount resumes after it: it must neither navigate nor open a port.
let unmounted = false

const sessionParams = computed(() => parseSessionParams(session.value?.permissions))
const methods = computed(() => sessionParams.value.methods)
const events = computed(() => sessionParams.value.events)
// Chain scoping lives on the parent session. Display the single
// `session.chainId` rather than flattening per-permission `chains`
// arrays (which no longer exist on `DappPermissions`).
const sessionChainName = computed(() => {
	const cid = session.value?.chainId
	if (cid === undefined || cid === null) return ""
	return getNetworkName(Number(cid), appStore.networks)
})

const expiryFormatted = computed(() => formatSessionExpiry(session.value?.expiry))

const hasSessionAllowances = computed(() => methods.value.length > 0 || events.value.length > 0)

const grantedCapabilities = computed(() => session.value?.capabilityGrants ?? [])

const grantedCaps = computed(() => grantedCapabilities.value.map((g) => g.capability))
// An On consents to the breadth the row shows, so the write carries it.
const shownBroad = computed(() => coversAnyContract(grantedCaps.value))
// Absent without `canCreateAuthWit`: there is nothing for the app to sign.
const authorizations = computed(() => {
	const caps = grantedCaps.value
	if (!holdsCanCreateAuthWit(caps)) return undefined
	return authorizationsRow({ broad: shownBroad.value, noScope: !holdsCallScope(caps) })
})
// The switch shows what the write asked for until the session event lands, and reverts on a failure.
const pendingAuthorizations = ref()
const isSavingAuthorizations = ref(false)
const authorizationsOn = computed(
	() => pendingAuthorizations.value ?? authorizationsEffective(session.value?.authorizationsWithoutAsking, grantedCaps.value),
)
const authorizationsLine = computed(() => {
	const row = authorizations.value
	return (row?.switchLabel && !authorizationsOn.value ? row.subOff : row?.subOn) ?? []
})

/** The kinds that name no contract, each the window's entry over a held grant, in its row order. */
const kindRows = computed(() => {
	const caps = grantedCaps.value.filter(isObjectLike)
	const held = (type) => caps.find((cap) => cap.type === type)
	const unknowns = caps.filter((cap) => !isKnownCapability(cap.type)).length
	const broad = isBroadRequest(caps)
	return [
		...(held("accounts")?.canGet === true ? [accountAddressRow()] : []),
		...(authorizations.value ? [authorizations.value] : []),
		...(held("data")?.addressBook === true ? [addressBookRow({ broadRequest: broad })] : []),
		...(unknowns > 0 ? [unknownRow(unknowns, { broadRequest: broad })] : []),
	]
})

// Unset until the names read settles, so a contract Nulo knows never shows first among those it doesn't.
const knownNames = ref()
const detailsTable = computed(() => {
	const table = buildDetailsTable(grantedCaps.value, knownNames.value ?? [])
	return table.known.length || table.unknown.length || table.classes.length || table.anyContract ? table : undefined
})
const permissionsLabel = computed(() => (detailsTable.value ? `Permissions · ${detailsTable.value.label}` : "Permissions"))

async function fetchKnownNames() {
	let names = []
	try {
		names = await interactionService.getKnownContracts(route.params.id)
	} catch {
		// Nothing named: every contract shows by its address.
	}
	if (!unmounted) knownNames.value = names
}

const fetchSession = async () => {
	let read
	try {
		read = await dappSessionService.getDappSession(route.params.id)
	} catch {
		// Missing or expired: the service throws rather than answer empty.
	}
	if (unmounted) return
	if (!read) {
		router.push("/popup/settings/connected-apps")
		return
	}

	session.value = read
	if (session.value.dappMetadata.logo) {
		session.value.dappMetadata.logoBlobUrl = session.value.dappMetadata.logo
	}
}

/** Own keys, not a Map, so the chains are read, and their rows listed, in ascending id order. */
function addressesByChain(caipAccounts) {
	const byChain = {}
	for (const account of caipAccounts) {
		let parsed
		try {
			parsed = parseCaipAccount(account)
		} catch {
			continue
		}
		if (!byChain[parsed.chainId]) {
			byChain[parsed.chainId] = []
		}
		byChain[parsed.chainId].push(parsed.address)
	}
	return byChain
}

async function fetchAccounts() {
	for (const [chainId, addresses] of Object.entries(addressesByChain(session.value.accounts))) {
		const networks = await networkService.getNetworks(+chainId)
		if (unmounted) return
		if (!networks.length) continue
		const network = networks[0]

		for (const address of addresses) {
			const account = await accountService.getAccount(appStore.profile.id, network.chainId, address)
			if (unmounted) return
			if (account) {
				accounts.value.push(account)
			}
		}
	}
}

const handleDropSession = () => {
	if (!session.value) return
	requestConfirm({
		confirm_color: "red",
		confirm_text: "Yes, disconnect",
		description: `Disconnect "${session.value.dappMetadata?.name ?? "this dApp"}"?`,
		callback: async () => {
			await dappSessionService.deleteDappSession(session.value.id)
		},
	})
}

const handleCopyAddress = (target) => {
	void copyWithToast(target, openToast, "Address is copied")
}

const copyScopeAddress = (address) => void copyWithToast(address, openToast, "Address is copied", { sanitize: true })

const getAccountAlias = (acc) => {
	if (!session.value?.accountAliases) return acc.name
	const caip = formatCaipAccount(acc.chainId, acc.address)
	return session.value.accountAliases[caip] || acc.name
}

const setAuthorizations = async (on) => {
	if (!session.value || isSavingAuthorizations.value) return
	isSavingAuthorizations.value = true
	pendingAuthorizations.value = on
	try {
		onDappSessionUpdated(await dappSessionService.setAuthorizationsWithoutAsking(session.value.id, on, shownBroad.value))
	} catch {
		openToast({ kind: "error", label: "Couldn't save this setting" })
	} finally {
		pendingAuthorizations.value = undefined
		isSavingAuthorizations.value = false
	}
}

const dappSessionService = new DappSessionServiceClient()
const networkService = new NetworkServiceClient()
const accountService = new AccountServiceClient()
const interactionService = new DappInteractionServiceClient()
function onDappSessionUpdated(ds) {
	if (ds.id !== session.value?.id) return
	const prevBlob = session.value.dappMetadata?.logoBlobUrl
	session.value = ds
	if (prevBlob && session.value.dappMetadata) {
		session.value.dappMetadata.logoBlobUrl = prevBlob
	}
}
function onDappSessionDeleted(ds) {
	if (ds.id !== session.value?.id) return
	openToast({ kind: "success", label: "The session was interrupted" })
	router.go(-1)
}
dappSessionService.onDappSessionUpdated.add(onDappSessionUpdated)
dappSessionService.onDappSessionDeleted.add(onDappSessionDeleted)

onMounted(async () => {
	void fetchKnownNames()
	await fetchSession()
	if (!session.value || unmounted) return
	await fetchAccounts()
})

onBeforeUnmount(() => {
	unmounted = true
	dappSessionService.disconnect()
	networkService.disconnect()
	accountService.disconnect()
	interactionService.disconnect()
})
</script>

<template>
	<SettingsPageShell title="Connected App" :backTo="'/popup/settings/connected-apps'" gap="24" v-if="session" data-testid="connected-app-page">
		<template #trailing>
			<Dropdown>
				<button type="button" :class="$style.icon_btn" aria-label="Session actions">
					<Icon name="more" :rotate="90" :size="18" color="secondary" />
				</button>

				<template #popup>
					<DropdownItem @click="handleDropSession">
						<Flex align="center" gap="8">
							<Icon name="log-out" size="14" color="secondary" />
							Disconnect session
						</Flex>
					</DropdownItem>
				</template>
			</Dropdown>
		</template>

		<!-- Identity block -->
		<Flex align="center" gap="12" wide>
			<Icon v-if="session.loadingLogo" :loading="true" name="app" size="40" color="tertiary" />
			<img
				v-else-if="session.dappMetadata.logoBlobUrl"
				:src="session.dappMetadata.logoBlobUrl"
				:class="$style.logo"
				alt=""
			/>
			<Icon v-else name="app" size="40" color="tertiary" />

			<Flex direction="column" gap="4" wide>
				<Text variant="name" color="primary" :class="$style.name_size">
					{{ session.dappMetadata.name ?? "Unknown dapp" }}
				</Text>
				<Text variant="data-lead" color="tertiary" selectable :class="$style.url">
					{{ session.dappMetadata.url }}
				</Text>
				<Text v-if="expiryFormatted" variant="time" color="tertiary">
					Expires {{ expiryFormatted }}
				</Text>
			</Flex>
		</Flex>

		<!-- Establishment writes the hash, so a row without one was allowed and never connected. -->
		<Text
			v-if="!session.verificationHash"
			data-testid="connected-app-not-connected"
			variant="body"
			color="secondary"
			:style="{ lineHeight: '1.4' }"
		>
			You allowed this app, but it has not finished connecting. Nothing is shared with it. Its next connection
			starts with the emoji check.
		</Text>

		<!-- Shared accounts -->
		<Flex direction="column" gap="10" wide>
			<SectionLabel label="Shared accounts" :count="accounts.length" />

			<ItemsContainer v-if="accounts.length">
				<SettingItem
					v-for="acc in accounts"
					:key="`${acc.chainId}:${acc.address}`"
					:title="getAccountAlias(acc)"
					titleVariant="name"
					:description="`${getNetworkName(acc.chainId, appStore.networks).toUpperCase()} · ${trimAddress(acc.address, 6, 4, '...')}`"
					descriptionVariant="meta"
					wrapDescription
					raw
					data-testid="connected-app-account-row"
				>
					<template #right>
						<Tooltip position="end" delay="350">
							<Icon
								@click.stop="handleCopyAddress(acc.address)"
								name="copy"
								size="14"
								color="tertiary"
								:class="$style.action_icon"
							/>
							<template #content>Copy address</template>
						</Tooltip>
					</template>
				</SettingItem>
			</ItemsContainer>
		</Flex>

		<!-- Session allowances -->
		<Flex v-if="hasSessionAllowances" direction="column" gap="10" wide>
			<SectionLabel label="Session allowances" />

			<Flex v-if="sessionChainName" align="start" gap="4">
				<Text variant="label-section" color="secondary">Network:</Text>
				<Text variant="value" color="secondary" :class="$style.network_value" :style="{ lineHeight: '1.2' }">
					{{ sessionChainName }}
				</Text>
			</Flex>

			<Flex align="start" gap="4">
				<Text variant="label-section" color="secondary">Methods:</Text>
				<Text variant="meta" color="secondary" :style="{ lineHeight: '1.2' }">{{ methods.join(", ") }}</Text>
			</Flex>

			<Flex align="start" gap="4">
				<Text variant="label-section" color="secondary">Events:</Text>
				<Text v-if="events.length" variant="meta" color="secondary" :style="{ lineHeight: '1.2' }">
					{{ events.join(", ") }}
				</Text>
				<Text v-else variant="value" color="tertiary" :style="{ lineHeight: '1.2' }">no allowances given</Text>
			</Flex>
		</Flex>

		<!-- Confirmation policy -->
		<Flex direction="column" gap="10" wide>
			<SectionLabel label="Confirmation policy" />
			<Text variant="body" color="secondary" :style="{ lineHeight: '1.4' }">
				{{
					confirmationPolicies.find((x) => x.confirmationLevel === session?.confirmationLevel)?.description ?? "Unknown"
				}}
			</Text>
		</Flex>

		<Flex v-if="kindRows.length || detailsTable" direction="column" gap="10" wide data-testid="connected-app-permissions">
			<SectionLabel :label="permissionsLabel" />
			<Flex direction="column" gap="24" wide>
				<ItemsContainer v-if="kindRows.length">
					<template v-for="row in kindRows" :key="row.key">
						<PermissionRow
							v-if="row.key === 'authorizations'"
							data-testid="connected-app-authorizations"
							switchTestid="connected-app-authorizations-toggle"
							:icon="row.icon"
							:title="row.title"
							:switchLabel="row.switchLabel"
							:flagged="row.flagged"
							:modelValue="authorizationsOn"
							@update:modelValue="setAuthorizations"
						>
							<template #sub>
								<template v-for="(segment, i) in authorizationsLine" :key="i">
									<DottedTerm v-if="'term' in segment" term="authorization" testid="cap-auth-term">{{ segment.term }}</DottedTerm>
									<template v-else>{{ segment.text }}</template>
								</template>
							</template>
						</PermissionRow>
						<PermissionRow
							v-else
							data-testid="connected-app-kind-row"
							:data-kind-row="row.key"
							:icon="row.icon"
							:title="row.title"
							:subOn="plainText(row.subOn)"
							:flagged="row.flagged"
						/>
					</template>
				</ItemsContainer>
				<DetailsTable
					v-if="detailsTable && knownNames"
					v-bind="detailsTable"
					bare
					:foot="listsFunctionNames(detailsTable)"
					@copy="copyScopeAddress"
				/>
			</Flex>
		</Flex>
	</SettingsPageShell>
</template>

<style module>
.logo {
	width: 40px;
	height: 40px;
	object-fit: cover;
	flex-shrink: 0;
}

.name_size {
	font-size: 14px;
}

/* Below the popup's width an app's address breaks anywhere rather than run past the view. */
@media (width < 359px) {
	.url {
		overflow-wrap: anywhere;
	}
}

/* A network's name, a person's own of up to 25 characters with no space, breaks rather than run past the view. */
.network_value {
	overflow-wrap: anywhere;
}

.icon_btn {
	composes: icon_btn from "../../toolbar-button.module.css";
}

.action_icon {
	cursor: pointer;
	transition: all 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}
}
</style>
