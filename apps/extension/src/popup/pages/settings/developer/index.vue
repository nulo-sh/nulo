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
import { settingsRow } from "@/utils/settings-search"
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Composables */
import { useConfigRead } from "@/composables/useConfigRead"
import { useSettingUpdate } from "@/composables/useSettingUpdate"
import { useSettingsRowHighlight } from "@/composables/useSettingsRowHighlight"
const { vSettingsRow } = useSettingsRowHighlight()

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
	developerMode: { ...settingsRow("developer-mode"), model: isDeveloperModeEnabled, visible: ref(true) },
	indicateFailures: {
		...settingsRow("developer-indicate-failures"),
		model: isIndicationFailuresEnabled,
		visible: isDeveloperModeEnabled,
	},
	debugMode: { ...settingsRow("developer-debug"), model: isDebugModeEnabled, visible: isDeveloperModeEnabled },
}
const logsRow = settingsRow("developer-logs")
const accountStateRow = settingsRow("developer-account-state")

const { updateSetting } = useSettingUpdate(configService, settings, applySetting)

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
	<SettingsPageShell title="Developer" :backTo="'/popup/settings'" gap="32" data-testid="settings-developer-page">
		<LoadingState v-if="isLoading" label="FETCHING SETTINGS" />

		<template v-if="!isLoading">
			<template v-for="sk in Object.keys(settings)" :key="sk">
				<Flex v-if="settings[sk].visible.value" align="center" justify="between" :data-testid="settings[sk].testid" v-settings-row="settings[sk].id">
					<Flex direction="column" justify="center" gap="6">
						<Text variant="row-title" :class="$style.title_size" color="primary">{{ settings[sk].title }}</Text>
						<Text variant="caption" color="tertiary">{{ settings[sk].description }}</Text>
					</Flex>

					<Toggle
						:data-testid="`settings-toggle-${sk}`"
						@update:modelValue="updateSetting(sk, $event)"
						:modelValue="settings[sk].model.value"
					/>
				</Flex>
			</template>

			<!-- Logs (developer mode only) -->
			<div v-if="isDeveloperModeEnabled" @click="handleOpenLogs" :class="$style.logs_row" :data-testid="logsRow.testid" v-settings-row="logsRow.id">
				<RowTarget :labelledby="logsTitleId" data-testid="settings-logs-open" />

				<Flex justify="between" align="center">
					<Flex direction="column" gap="6">
						<Flex align="center" gap="8">
							<Text :id="logsTitleId" variant="row-title" :class="$style.title_size" color="primary">{{ logsRow.title }}</Text>
							<div
								v-if="cacheStore.failureLog?.color"
								:class="$style.failure_dot"
								:style="{ background: cacheStore.failureLog.color }"
							/>
						</Flex>
						<Text variant="caption" color="tertiary">
							{{ cacheStore.failureLog ? '1 recent failure' : logsRow.description }}
						</Text>
					</Flex>
					<Icon name="open" :size="18" color="secondary" />
				</Flex>
			</div>

			<!-- Account State (Notes, Authwits, Contracts, Senders) -->
			<RouterLink
				to="/popup/settings/developer/account-state"
				:class="$style.state_link"
				:data-testid="accountStateRow.testid"
				v-settings-row="accountStateRow.id"
			>
				<Flex justify="between" align="center">
					<Flex direction="column" gap="6">
						<Text variant="row-title" :class="$style.title_size" color="primary">{{ accountStateRow.title }}</Text>
						<Text variant="caption" color="tertiary">{{ accountStateRow.description }}</Text>
					</Flex>
					<Icon name="chevron" :size="18" color="secondary" />
				</Flex>
			</RouterLink>
		</template>
	</SettingsPageShell>
</template>

<style module>
.state_link {
	user-select: none;
	text-decoration: none;
	transition: opacity 0.2s var(--bezier);

	&:hover {
		opacity: 0.8;
	}
}

/* The box reaches 8px past the text so the ring clears it; the fade stays off the ring. */
.logs_row {
	user-select: none;
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

.title_size {
	font-size: 13px;
}
</style>
