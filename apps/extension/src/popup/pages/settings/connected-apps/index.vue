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
import RowTarget from "@/components/ui/RowTarget.vue"
import SettingControlRow from "@/components/ui/Settings/SettingControlRow.vue"

/** Services */
import { DappSessionServiceClient } from "@/wallet/services/dapp-session/client"
import { getSafeDisplay } from "@/wallet/services/dapp-session/capability-meta"

/** Utils */
import { entityListReducers } from "@/utils/entity-list"
import { EVERY_SITE_CONFIRM } from "@/utils/every-site"
import { pluralize } from "@/utils/plural"
import { settingsRow } from "@/utils/settings-search"

/** Stores */
import { useAppStore } from "@/stores/app.store"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfirm } from "@/composables/useConfirm"
import { SETTING_UPDATE_FAILED } from "@/composables/useSettingUpdate"
import { useSettingsRowHighlight } from "@/composables/useSettingsRowHighlight"
const appStore = useAppStore()
const { openToast } = useToast()
const { requestConfirm, askConfirm } = useConfirm()
const { vSettingsRow } = useSettingsRowHighlight()

const formatGrantSummary = (grants) => {
	// getSafeDisplay returns the constant "Unknown" shortLabel for
	// unrecognized types so the per-session row in the settings list never
	// paints a dApp-controlled wire string as a friendly summary.
	return grants.map((g) => getSafeDisplay(g.capability.type).shortLabel).join(" \u00B7 ")
}

/** The app's host, so e2e can pick one app's row without reading its text. */
const appHost = (session) => {
	try {
		return new URL(session.dappMetadata?.url ?? "").host
	} catch {
		return ""
	}
}

const dappSessions = ref([])
const sessionList = entityListReducers(dappSessions)

const sortedSessions = computed(() => [...dappSessions.value].sort((a, b) => a.expiry - b.expiry))

const everySiteRow = settingsRow("connected-apps-every-site")
/** The profile the switch was read for, `null` until read: the Toggle waits for it. */
const everySiteProfile = ref(null)
const everySite = ref(false)
let everySiteReads = 0

const dappSessionService = new DappSessionServiceClient()
dappSessionService.onDappSessionAdded.add(onDappSessionAdded)
dappSessionService.onDappSessionUpdated.add(onDappSessionUpdated)
dappSessionService.onDappSessionDeleted.add(sessionList.onDeleted)
// The connect window's "Allow every site" turns it on too, maybe while this page stays open.
dappSessionService.onEverySiteChanged.add(readEverySite)

function hydrateLogo(session) {
	if (!session.dappMetadata?.logo || session.dappMetadata.logoBlobUrl) return
	session.dappMetadata.logoBlobUrl = session.dappMetadata.logo
}

function onDappSessionAdded(session) {
	sessionList.onAdded(session)
	hydrateLogo(session)
}
function onDappSessionUpdated(session) {
	const prevBlob = dappSessions.value.find((ds) => ds.id === session.id)?.dappMetadata?.logoBlobUrl
	if (prevBlob && session.dappMetadata) {
		session.dappMetadata.logoBlobUrl = prevBlob
	}
	sessionList.onUpdated(session)
	hydrateLogo(session)
}

const rowIdBase = useId()

/** Only the latest read lands. Unread, the Toggle is disabled: showing off for a switch that may be
 *  on would mislead. */
async function readEverySite() {
	const read = ++everySiteReads
	try {
		const { profileId, on } = await dappSessionService.getEverySite()
		if (read !== everySiteReads) return
		everySiteProfile.value = profileId
		everySite.value = on
	} catch {
		if (read === everySiteReads) everySiteProfile.value = null
	}
}

/** On asks first and writes only on Turn on; off writes at once. The Toggle shows what was written.
 *  A confirm is for the profile shown when it opened: answered after a switch, it writes nothing. */
async function onEverySiteToggle(next) {
	const profileId = everySiteProfile.value
	if (next && !(await askConfirm(EVERY_SITE_CONFIRM))) return
	if (profileId === null || everySiteProfile.value !== profileId) return
	try {
		await dappSessionService.setEverySite(profileId, next)
		everySite.value = next
	} catch {
		openToast({ kind: "error", label: SETTING_UPDATE_FAILED })
		void readEverySite()
	}
}

const handleDropSession = (session) => {
	requestConfirm({
		confirm_color: "red",
		confirm_text: "Yes, disconnect",
		description: `Disconnect "${session.dappMetadata?.name ?? "this dApp"}"?`,
		callback: async () => {
			await dappSessionService.deleteDappSession(session.id)
		},
	})
}

const handleDropAllSessions = () => {
	if (!dappSessions.value.length) return
	requestConfirm({
		confirm_color: "red",
		confirm_text: "Yes, disconnect all",
		description: `Disconnect all ${dappSessions.value.length} ${pluralize(dappSessions.value.length, "session", "sessions")}?`,
		callback: async () => {
			for (const session of [...dappSessions.value]) {
				await dappSessionService.deleteDappSession(session.id)
			}
		},
	})
}

// Another window can switch the profile while this page stays open; the switch is per profile.
watch(
	() => appStore.profile?.id,
	() => {
		everySiteProfile.value = null
		void readEverySite()
	},
)

onBeforeMount(async () => {
	void readEverySite()
	const sessions = await dappSessionService.getDappSessions()
	dappSessions.value = sessions
	for (const session of sessions) hydrateLogo(session)
})

onBeforeUnmount(() => {
	dappSessionService.disconnect()
})
</script>

<template>
	<SettingsPageShell title="Connected Apps" :backTo="'/popup/settings'" gap="12">
		<template #trailing>
			<Dropdown>
				<button type="button" :class="$style.icon_btn" aria-label="Session actions">
					<Icon name="more" :rotate="90" :size="18" color="secondary" />
				</button>

				<template #popup>
					<DropdownItem @click="handleDropAllSessions" :disabled="!dappSessions.length">
						<Flex align="center" gap="8">
							<Icon name="log-out" size="14" color="secondary" />
							Disconnect all sessions
						</Flex>
					</DropdownItem>
				</template>
			</Dropdown>
		</template>

		<SettingControlRow
			:title="everySiteRow.title"
			:description="everySiteRow.description"
			align="center"
			:data-testid="everySiteRow.testid"
			v-settings-row="everySiteRow.id"
			:class="$style.every_site"
		>
			<Toggle
				:modelValue="everySite"
				:disabled="everySiteProfile === null"
				@update:modelValue="onEverySiteToggle"
				data-testid="every-site-toggle"
			/>
		</SettingControlRow>

		<SectionLabel label="Sessions" :count="sortedSessions.length" />

		<ItemsContainer v-if="sortedSessions.length">
			<div v-for="(ds, i) in sortedSessions" :key="ds.id" :class="$style.row">
				<RowTarget data-testid="connected-app-row" :data-app-host="appHost(ds)" :to="`/popup/settings/connected-apps/${ds.id}`" :labelledby="`${rowIdBase}-${i}`" />

				<Flex align="center" gap="12" wide>
					<div :class="$style.logo_wrapper">
						<Icon v-if="ds.loadingLogo" :loading="true" name="app" size="18" color="tertiary" />
						<img
							v-else-if="ds.dappMetadata.logoBlobUrl"
							:src="ds.dappMetadata.logoBlobUrl"
							:class="$style.logo"
							alt=""
						/>
						<Icon v-else name="app" size="18" color="tertiary" />
					</div>

					<Flex direction="column" gap="2" wide :class="$style.row_text">
						<span :id="`${rowIdBase}-${i}`" :class="$style.row_name">{{ ds.dappMetadata.name }}</span>
						<!-- Establishment writes the hash, so a row without one was allowed and never connected. -->
						<span v-if="!ds.verificationHash" data-testid="connected-app-row-not-connected" :class="$style.row_grants">
							Allowed. Not connected yet.
						</span>
						<span v-else-if="ds.capabilityGrants?.length" :class="$style.row_grants">
							{{ formatGrantSummary(ds.capabilityGrants) }}
						</span>
					</Flex>

					<Flex align="center" gap="8" :class="$style.actions">
						<Tooltip position="end" delay="350">
							<RowAction label="Disconnect session" data-testid="session-disconnect" :class="$style.action_danger" @click="handleDropSession(ds)">
								<Icon name="close" size="14" color="tertiary" />
							</RowAction>

							<template #content> Disconnect session </template>
						</Tooltip>
					</Flex>
				</Flex>
			</div>
		</ItemsContainer>

		<div v-else :class="$style.empty">
			<div :class="$style.empty_label">No active sessions</div>
			<div :class="$style.empty_hint">Connect a dApp to start a session</div>
		</div>
	</SettingsPageShell>
</template>

<style module>
/* The page's 12 px gap separates list rows; the switch above the list takes Privacy's 32 px. */
.every_site {
	margin-bottom: 20px;
}

.row {
	composes: divider row from "../../../../components/ui/Settings/settings-row.module.css";
}

.logo_wrapper {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;

	width: 24px;
	height: 24px;
}

.logo {
	width: 24px;
	height: 24px;
	object-fit: cover;
}

.row_text {
	composes: row_text from "../../../../components/ui/Settings/settings-row.module.css";
}

.row_name {
	composes: row_name from "../../../../components/ui/Settings/settings-row.module.css";
}

.row_grants {
	composes: type--caption from global;
	composes: row_sub from "../../../../components/ui/Settings/settings-row.module.css";
}

.actions {
	composes: row_actions from "../../../../components/ui/Settings/settings-row.module.css";
}

/* Below the popup's width an app's name and its grants wrap rather than being cut. */
@media (width < 359px) {
	.row .row_name,
	.row .row_grants {
		white-space: normal;
		overflow-wrap: break-word;
	}
}

.action_danger {
	&:hover svg,
	&:focus-visible svg {
		color: var(--red);
	}
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;

	padding: 40px 16px;

	background: var(--nulo-surface);
	border: 1px solid var(--nulo-border);
}

.empty_label {
	composes: type--title-page from global;
	color: var(--nulo-secondary);
}

.empty_hint {
	composes: type--body from global;
	color: var(--nulo-secondary);
}

.icon_btn {
	composes: icon_btn from "../../toolbar-button.module.css";
}
</style>
