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

/** Utils */
import { settingsRow } from "@/utils/settings-search"
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { BLOCK_EXPLORERS } from "@/wallet/constants/explorers"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfigRead } from "@/composables/useConfigRead"
import { useSettingsRowHighlight } from "@/composables/useSettingsRowHighlight"
const { openToast } = useToast()
const { vSettingsRow } = useSettingsRowHighlight()

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)
const privacyRead = useConfigRead(configService, () => configService.getProps(), landPrivacyConfig)

const isLoading = ref(true)
const defaultConfig = makeDefaultConfig()
const isShowFiatValues = ref(defaultConfig.showFiatValues)
const defaultExplorer = ref(defaultConfig.defaultExplorer)
const isPrivacyMode = ref(defaultConfig.privacyMode)
const settings = {
	showFiatValues: { ...settingsRow("privacy-fiat-values"), model: isShowFiatValues },
	defaultExplorer: { ...settingsRow("privacy-explorer"), model: defaultExplorer },
	privacyMode: { ...settingsRow("privacy-mode"), model: isPrivacyMode },
}

const selectedExplorerName = computed(() => {
	if (!defaultExplorer.value) return "None"
	const explorer = BLOCK_EXPLORERS.find((e) => e.id === defaultExplorer.value)
	return explorer?.name || "None"
})

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
		case "defaultExplorer":
			openToast({ kind: "success", label: "Default explorer updated" })
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

// Copies the values only: `applySetting` would toast on a reread.
function landPrivacyConfig(_settings, updatedSince) {
	_settings.forEach((s) => {
		if (settings[s.key] && !updatedSince(s.key)) {
			settings[s.key].model.value = s.value
		}
	})

	isLoading.value = false
}

onMounted(() => {
	void privacyRead.read()
})

onBeforeUnmount(() => {
	configService.disconnect()
	privacyRead.dispose()
})
</script>

<template>
	<SettingsPageShell title="Privacy" :backTo="'/popup/settings'" gap="32">
		<LoadingState v-if="isLoading" label="FETCHING SETTINGS" />

		<template v-if="!isLoading">
			<Flex justify="between" align="center" :data-testid="settings.showFiatValues.testid" v-settings-row="settings.showFiatValues.id">
				<Flex direction="column" gap="6">
					<Text variant="row-title" :class="$style.title_size" color="primary">{{ settings.showFiatValues.title }}</Text>
					<Text variant="caption" color="tertiary" data-testid="fiat-values-description">{{ settings.showFiatValues.description }}</Text>
				</Flex>

				<Toggle
					@update:modelValue="updateSetting('showFiatValues', $event)"
					:modelValue="settings.showFiatValues.model.value"
					data-testid="fiat-values-toggle"
				/>
			</Flex>

			<Flex justify="between" align="center" :data-testid="settings.defaultExplorer.testid" v-settings-row="settings.defaultExplorer.id">
				<Flex direction="column" gap="6">
					<Text variant="row-title" :class="$style.title_size" color="primary" data-testid="explorer-title">{{ settings.defaultExplorer.title }}</Text>
					<Text variant="caption" color="tertiary" data-testid="explorer-description">{{ settings.defaultExplorer.description }}</Text>
				</Flex>

				<Dropdown>
					<template #trigger>
						<DropdownTrigger :class="$style.explorerTrigger" data-testid="explorer-trigger">
							<Text variant="value" color="primary">
								{{ selectedExplorerName }}
							</Text>
							<Icon name="chevron-down" size="12" color="tertiary" />
						</DropdownTrigger>
					</template>

					<template #popup>
						<DropdownItem
							v-for="explorer in BLOCK_EXPLORERS"
							:key="explorer.id"
							@click="updateSetting('defaultExplorer', explorer.id)"
							:data-testid="`explorer-${explorer.id}-btn`"
						>
							<Flex align="center" gap="8">
								<Icon
									:name="settings.defaultExplorer.model.value === explorer.id ? 'check' : ''"
									size="14"
									color="primary"
								/>
								{{ explorer.name }}
							</Flex>
						</DropdownItem>
						<DropdownItem @click="updateSetting('defaultExplorer', null)" data-testid="explorer-none-btn">
							<Flex align="center" gap="8">
								<Icon :name="!settings.defaultExplorer.model.value ? 'check' : ''" size="14" color="primary" />
								None
							</Flex>
						</DropdownItem>
					</template>
				</Dropdown>
			</Flex>

			<Flex justify="between" align="center" :data-testid="settings.privacyMode.testid" v-settings-row="settings.privacyMode.id">
				<Flex direction="column" gap="6">
					<Text variant="row-title" :class="$style.title_size" color="primary" data-testid="privacy-mode-title">{{ settings.privacyMode.title }}</Text>
					<Text variant="caption" color="tertiary">{{ settings.privacyMode.description }}</Text>
				</Flex>

				<Toggle
					@update:modelValue="updateSetting('privacyMode', $event)"
					:modelValue="settings.privacyMode.model.value"
					data-testid="privacy-mode-toggle"
				/>
			</Flex>
		</template>
	</SettingsPageShell>
</template>

<style module>
.explorerTrigger {
	display: flex;
	align-items: center;
	gap: 6px;
}

.title_size {
	font-size: 13px;
}
</style>
