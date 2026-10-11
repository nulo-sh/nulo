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
import RowTarget from "@/components/ui/RowTarget.vue"

/** Utils */
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfigRead } from "@/composables/useConfigRead"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)
const developerRead = useConfigRead(configService, () => configService.getProps(), landDeveloperConfig)

const openLogs = async () => {
	if (appStore.loggerWindowId) {
		try {
			const win = await chrome.windows.get(appStore.loggerWindowId)
			chrome.windows.update(win.id, { focused: true })
			cacheStore.failureLog = null
			return
		} catch (_err) {
			appStore.loggerWindowId = null
		}
	}

	const url = new URL(chrome.runtime.getURL("src/popup/index.html#/windows/logger"))
	if (cacheStore.failureLog?.id) {
		url.searchParams.set("logId", cacheStore.failureLog.id)
	}

	const window = await chrome.windows.create({ type: "popup", url: url.toString(), height: 700, width: 1_200 })
	appStore.loggerWindowId = window.id
	cacheStore.failureLog = null
}

// The window's id is known only once windows.create resolves, so a press in that gap joins the
// open in flight instead of opening a second window.
let pendingOpen = null
const handleOpenLogs = () => {
	pendingOpen ??= openLogs().finally(() => {
		pendingOpen = null
	})
	return pendingOpen
}

const isLoading = ref(true)
const logsTitleId = useId()

const defaultConfig = makeDefaultConfig()
const isDeveloperModeEnabled = ref(defaultConfig.developerMode)
const isIndicationFailuresEnabled = ref(defaultConfig.indicateFailures)
const isDebugModeEnabled = ref(defaultConfig.debugMode)

const settings = {
	developerMode: {
		title: "Developer Mode",
		description: "Access to entity metadata, etc",
		model: isDeveloperModeEnabled,
		visible: ref(true),
	},
	indicateFailures: {
		title: "Indicate Failures",
		description: "Highlight errors and warnings in the header",
		model: isIndicationFailuresEnabled,
		visible: isDeveloperModeEnabled,
	},
	debugMode: {
		title: "Debug Mode",
		description: "Collect debug level logs",
		model: isDebugModeEnabled,
		visible: isDeveloperModeEnabled,
	},
}

async function updateSetting(key, value) {
	if (!settings[key]) return
	if (settings[key].model.value === value) return

	try {
		await configService.setValue(key, value)
		applySetting(key, value)
	} catch (err) {
		openToast({ kind: "error", label: "Failed to update setting" })
	}
}

async function applySetting(key, value) {
	settings[key].model.value = value

	switch (key) {
		case "developerMode":
			updateSetting("indicateFailures", value)
			if (!value) {
				updateSetting("debugMode", value)
			}
			break

		default:
			break
	}
}

function onSettingUpdate(setting) {
	if (settings[setting.key]) {
		if (settings[setting.key].model.value !== setting.value) {
			applySetting(setting.key, setting.value)
		}
	}
}

// Copies the values only: `applySetting` would write `indicateFailures` and `debugMode` on a reread.
function landDeveloperConfig(_settings, updatedSince) {
	_settings.forEach((s) => {
		if (settings[s.key] && !updatedSince(s.key)) {
			settings[s.key].model.value = s.value
		}
	})

	isLoading.value = false
}

onBeforeMount(() => {
	void developerRead.read()
})

onBeforeUnmount(() => {
	configService.disconnect()
	developerRead.dispose()
})
</script>

<template>
	<SettingsPageShell title="Developer" :backTo="'/popup/settings'" gap="32">
		<LoadingState v-if="isLoading" label="FETCHING SETTINGS" />

		<template v-if="!isLoading">
			<template v-for="sk in Object.keys(settings)" :key="sk">
				<Flex v-if="settings[sk].visible.value" align="center" justify="between">
					<Flex direction="column" justify="center" gap="6">
						<Text size="13" weight="600" color="primary">{{ settings[sk].title }}</Text>
						<Text size="12" weight="500" color="tertiary">{{ settings[sk].description }}</Text>
					</Flex>

					<Toggle
						:data-testid="`settings-toggle-${sk}`"
						@update:modelValue="updateSetting(sk, $event)"
						:modelValue="settings[sk].model.value"
					/>
				</Flex>
			</template>

			<!-- Logs (developer mode only) -->
			<div v-if="isDeveloperModeEnabled" @click="handleOpenLogs" :class="$style.logs_row" data-testid="settings-logs-row">
				<RowTarget :labelledby="logsTitleId" data-testid="settings-logs-open" />

				<Flex justify="between" align="center">
					<Flex direction="column" gap="6">
						<Flex align="center" gap="8">
							<Text :id="logsTitleId" size="13" weight="600" color="primary">Logs</Text>
							<div
								v-if="cacheStore.failureLog?.color"
								:class="$style.failure_dot"
								:style="{ background: cacheStore.failureLog.color }"
							/>
						</Flex>
						<Text size="12" weight="500" color="tertiary">
							{{ cacheStore.failureLog ? '1 recent failure' : 'Open the log viewer window' }}
						</Text>
					</Flex>
					<MaterialIcon name="open_in_new" :size="18" color="secondary" />
				</Flex>
			</div>

			<!-- Account State (Notes, Authwits, Contracts, Senders) -->
			<RouterLink
				to="/popup/settings/advanced/account-state"
				:class="$style.state_link"
				data-testid="setting-nav-advanced-account-state"
			>
				<Flex justify="between" align="center">
					<Flex direction="column" gap="6">
						<Text size="13" weight="600" color="primary">Account State</Text>
						<Text size="12" weight="500" color="tertiary">Notes, authwits, contracts, senders</Text>
					</Flex>
					<MaterialIcon name="chevron_right" :size="18" color="secondary" />
				</Flex>
			</RouterLink>
		</template>
	</SettingsPageShell>
</template>

<style module>
.state_link {
	text-decoration: none;
	transition: opacity 0.2s var(--bezier);

	&:hover {
		opacity: 0.8;
	}
}

/* The box reaches 8px past the text so the ring clears it; the fade stays off the ring. */
.logs_row {
	position: relative;
	margin: -6px -8px;
	padding: 6px 8px;

	transition: opacity 0.2s var(--bezier);

	&:hover {
		opacity: 0.8;
	}

	&:has(> [data-row-target]:focus-visible) {
		opacity: 1;
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.failure_dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}
</style>
