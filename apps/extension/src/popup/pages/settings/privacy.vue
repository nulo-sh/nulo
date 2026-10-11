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
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { BLOCK_EXPLORERS } from "@/wallet/constants/explorers"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfigRead } from "@/composables/useConfigRead"
const { openToast } = useToast()

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)
const privacyRead = useConfigRead(configService, () => configService.getProps(), landPrivacyConfig)

const isLoading = ref(true)
const defaultConfig = makeDefaultConfig()
const isShowFiatValues = ref(defaultConfig.showFiatValues)
const defaultExplorer = ref(defaultConfig.defaultExplorer)
const settings = {
	showFiatValues: {
		title: "Show fiat values",
		description: "Fetch USD prices from CoinGecko while unlocked. Off hides all dollar values",
		model: isShowFiatValues,
	},
	defaultExplorer: {
		title: "Block Explorer",
		description: "Transaction link explorer",
		model: defaultExplorer,
	},
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
			<Flex justify="between" align="center">
				<Flex direction="column" gap="6">
					<Text size="13" weight="600" color="primary">{{ settings.showFiatValues.title }}</Text>
					<Text size="12" weight="500" color="tertiary">{{ settings.showFiatValues.description }}</Text>
				</Flex>

				<Toggle
					@update:modelValue="updateSetting('showFiatValues', $event)"
					:modelValue="settings.showFiatValues.model.value"
					data-testid="fiat-values-toggle"
				/>
			</Flex>

			<Flex justify="between" align="center">
				<Flex direction="column" gap="6">
					<Text size="13" weight="600" color="primary">{{ settings.defaultExplorer.title }}</Text>
					<Text size="12" weight="500" color="tertiary">{{ settings.defaultExplorer.description }}</Text>
				</Flex>

				<Dropdown>
					<template #trigger>
						<DropdownTrigger :class="$style.explorerTrigger" data-testid="explorer-trigger">
							<Text size="13" weight="600" color="primary">
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
		</template>
	</SettingsPageShell>
</template>

<style module>
.explorerTrigger {
	display: flex;
	align-items: center;
	gap: 6px;
}
</style>
