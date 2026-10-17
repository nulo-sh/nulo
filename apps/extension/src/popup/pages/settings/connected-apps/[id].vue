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
import DappSessionVerification from "@/popup/components/modules/settings/connected-apps/DappSessionVerification.vue"
import GrantedCapabilitiesList from "@/popup/components/modules/settings/connected-apps/GrantedCapabilitiesList.vue"
import PermissionRow from "@/components/composite/capabilities/PermissionRow.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { getChainName } from "@/components/ui/utils.js"

/** Vendor */
import { hashToEmoji } from "@aztec-labs/wallet-sdk/crypto"

/** Services */
import { AccountServiceClient } from "@/wallet/services/account/client"
import { DappSessionServiceClient } from "@/wallet/services/dapp-session/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { formatCaipAccount, parseCaipAccount } from "@/wallet/utils/caip"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { useConfirm } from "@/composables/useConfirm"
const { openToast } = useToast()
const { requestConfirm } = useConfirm()

/** Helpers */
import { formatSessionExpiry, parseSessionParams } from "@/popup/components/modules/settings/connected-apps/connected-app-helpers"
import { authorizationsRow, holdsCallScope, holdsCanCreateAuthWit } from "@/popup/windows/capabilities/permission-rows"
import { authorizationsEffective, coversAnyContract } from "@nulo/wallet-bridge"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { copyWithToast } from "@/utils/clipboard"
import { trimAddress } from "@/utils/string"
const appStore = useAppStore()

const route = useRoute()
const router = useRouter()

const session = ref()
const accounts = ref([])

const sessionParams = computed(() => parseSessionParams(session.value?.permissions))
const methods = computed(() => sessionParams.value.methods)
const events = computed(() => sessionParams.value.events)
// Chain scoping lives on the parent session. Display the single
// `session.chainId` rather than flattening per-permission `chains`
// arrays (which no longer exist on `DappPermissions`).
const sessionChainName = computed(() => {
	const cid = session.value?.chainId
	if (cid === undefined || cid === null) return ""
	return getChainName(Number(cid))
})

const verificationEmojis = computed(() => (session.value?.verificationHash ? hashToEmoji(session.value.verificationHash) : ""))

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

const fetchSession = async () => {
	try {
		session.value = await dappSessionService.getDappSession(route.params.id)
	} catch {
		// Session missing / expired — the service throws instead of returning null
		router.push("/popup/settings/connected-apps")
		return
	}

	if (!session.value) {
		router.push("/popup/settings/connected-apps")
		return
	}

	if (session.value.dappMetadata.logo) {
		session.value.dappMetadata.logoBlobUrl = session.value.dappMetadata.logo
	}
}

async function fetchAccounts() {
	const networkServiceClient = new NetworkServiceClient()
	const accMap = new Map()

	for (const account of session.value.accounts) {
		let parsed
		try {
			parsed = parseCaipAccount(account)
		} catch {
			continue
		}
		if (!accMap[parsed.chainId]) {
			accMap[parsed.chainId] = []
		}
		accMap[parsed.chainId].push(parsed.address)
	}

	for (const chainId of Object.keys(accMap)) {
		const networks = await networkServiceClient.getNetworks(+chainId)
		if (networks.length) {
			const network = networks[0]
			const accountServiceClient = new AccountServiceClient()

			for (const address of accMap[chainId]) {
				const account = await accountServiceClient.getAccount(appStore.profile.id, network.chainId, address)
				if (account) {
					accounts.value.push(account)
				}
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
	await fetchSession()
	if (!session.value) return
	await fetchAccounts()
})

onBeforeUnmount(() => {
	dappSessionService.disconnect()
})
</script>

<template>
	<SettingsPageShell title="Connected App" :backTo="'/popup/settings/connected-apps'" gap="24" v-if="session">
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
				<Text variant="data-lead" color="tertiary" selectable>
					{{ session.dappMetadata.url }}
				</Text>
				<Text v-if="expiryFormatted" variant="time" color="tertiary">
					Expires {{ expiryFormatted }}
				</Text>
			</Flex>
		</Flex>

		<!-- Shared accounts -->
		<Flex direction="column" gap="10" wide>
			<SectionLabel label="Shared accounts" :count="accounts.length" />

			<ItemsContainer v-if="accounts.length">
				<SettingItem
					v-for="acc in accounts"
					:key="`${acc.chainId}:${acc.address}`"
					:title="getAccountAlias(acc)"
					titleVariant="name"
					:description="`${getChainName(acc.chainId).toUpperCase()} · ${trimAddress(acc.address, 6, 4, '...')}`"
					descriptionVariant="meta"
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
				<Text variant="value" color="secondary" :style="{ lineHeight: '1.2' }">
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

		<Flex v-if="authorizations" direction="column" gap="10" wide>
			<SectionLabel label="If you allow, it can" />
			<ItemsContainer>
				<PermissionRow
					data-testid="connected-app-authorizations"
					switchTestid="connected-app-authorizations-toggle"
					:icon="authorizations.icon"
					:title="authorizations.title"
					:switchLabel="authorizations.switchLabel"
					:flagged="authorizations.flagged"
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
			</ItemsContainer>
		</Flex>

		<!-- Granted permissions -->
		<Flex v-if="grantedCapabilities.length" direction="column" gap="10" wide>
			<SectionLabel label="Granted permissions" :count="grantedCapabilities.length" />
			<GrantedCapabilitiesList :grants="grantedCapabilities" />
		</Flex>

		<!-- Connection check -->
		<DappSessionVerification v-if="verificationEmojis" :emojis="verificationEmojis" />
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
