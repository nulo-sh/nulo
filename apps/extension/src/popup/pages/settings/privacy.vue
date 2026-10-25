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
import SettingControlRow from "@/components/ui/Settings/SettingControlRow.vue"

/** Utils */
import { settingsRow } from "@/utils/settings-search"
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { BLOCK_EXPLORERS } from "@/wallet/constants/explorers"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfigRead } from "@/composables/useConfigRead"
import { useSettingUpdate } from "@/composables/useSettingUpdate"
import { useSettingsRowHighlight } from "@/composables/useSettingsRowHighlight"
const { openToast } = useToast()
const { vSettingsRow } = useSettingsRowHighlight()

const configService = new ConfigServiceClient()

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

const { updateSetting, onSettingUpdate, landSettings } = useSettingUpdate(configService, settings, applySetting)
configService.onUpdate.add(onSettingUpdate)
const privacyRead = useConfigRead(configService, () => configService.getProps(), landPrivacyConfig)

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

function landPrivacyConfig(stored, updatedSince) {
	landSettings(stored, updatedSince)
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
			<SettingControlRow
				:title="settings.showFiatValues.title"
				:description="settings.showFiatValues.description"
				descriptionTestid="fiat-values-description"
				align="center"
				:data-testid="settings.showFiatValues.testid"
				v-settings-row="settings.showFiatValues.id"
			>
				<Toggle
					@update:modelValue="updateSetting('showFiatValues', $event)"
					:modelValue="settings.showFiatValues.model.value"
					data-testid="fiat-values-toggle"
				/>
			</SettingControlRow>

			<SettingControlRow
				:title="settings.defaultExplorer.title"
				:description="settings.defaultExplorer.description"
				titleTestid="explorer-title"
				descriptionTestid="explorer-description"
				align="center"
				:data-testid="settings.defaultExplorer.testid"
				v-settings-row="settings.defaultExplorer.id"
			>

				<Dropdown>
					<template #trigger>
						<DropdownTrigger :class="$style.explorerTrigger" data-testid="explorer-trigger">
							<Text variant="value" color="primary">
								{{ selectedExplorerName }}
							</Text>
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
									name="check"
									size="14"
									color="primary"
									:class="settings.defaultExplorer.model.value !== explorer.id && $style.unselected"
								/>
								{{ explorer.name }}
							</Flex>
						</DropdownItem>
						<DropdownItem @click="updateSetting('defaultExplorer', null)" data-testid="explorer-none-btn">
							<Flex align="center" gap="8">
								<Icon name="check" size="14" color="primary" :class="settings.defaultExplorer.model.value && $style.unselected" />
								None
							</Flex>
						</DropdownItem>
					</template>
				</Dropdown>
			</SettingControlRow>

			<SettingControlRow
				:title="settings.privacyMode.title"
				:description="settings.privacyMode.description"
				titleTestid="privacy-mode-title"
				align="center"
				:data-testid="settings.privacyMode.testid"
				v-settings-row="settings.privacyMode.id"
			>
				<Toggle
					@update:modelValue="updateSetting('privacyMode', $event)"
					:modelValue="settings.privacyMode.model.value"
					data-testid="privacy-mode-toggle"
				/>
			</SettingControlRow>
		</template>
	</SettingsPageShell>
</template>

<style module>
.explorerTrigger {
	display: flex;
	align-items: center;
	gap: 6px;
}

.unselected {
	visibility: hidden;
}
</style>
