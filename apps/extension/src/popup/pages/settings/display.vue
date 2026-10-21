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
import { hasSidePanelSurface, isFirefoxSidebar, sidebarAction } from "@/utils/browser-surface"
import { settingsRow } from "@/utils/settings-search"
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfigRead } from "@/composables/useConfigRead"
import { SETTING_UPDATE_FAILED, useSettingUpdate } from "@/composables/useSettingUpdate"
import { useSettingsRowHighlight } from "@/composables/useSettingsRowHighlight"
const { openToast } = useToast()
const { vSettingsRow } = useSettingsRowHighlight()

const configService = new ConfigServiceClient()

const isLoading = ref(true)
const defaultConfig = makeDefaultConfig()
const theme = ref(defaultConfig.theme)
const isSidePanelEnabled = ref(defaultConfig.sidePanel)
const isShowNodeNameEnabled = ref(defaultConfig.showNode)
const isAnimationsDisabled = ref(defaultConfig.disableAnimations)
const isIncomingTransfersVisible = ref(defaultConfig.incomingTransfersVisible)
// D8 dust filter — a NUMBER, not a toggle, so it lives outside the `settings` toggle map.
const dustThreshold = ref(String(defaultConfig.incomingDustUsdThreshold))
const TOGGLE_TESTIDS = { sidePanel: "side-panel-toggle", disableAnimations: "animations-toggle", showNode: "show-network-name-toggle" }
const settings = {
	theme: { ...settingsRow("display-theme"), model: theme },
	...(hasSidePanelSurface()
		? {
				sidePanel: { ...settingsRow("display-side-panel"), model: isSidePanelEnabled },
			}
		: {}),
	showNode: { ...settingsRow("display-network-name"), model: isShowNodeNameEnabled },
	disableAnimations: { ...settingsRow("display-animations"), model: isAnimationsDisabled },
	incomingTransfersVisible: { ...settingsRow("display-incoming-transfers"), model: isIncomingTransfersVisible },
}
const dustRow = settingsRow("display-dust")

async function updateDustThreshold(event) {
	const el = event.target
	const raw = el.value.trim()
	// Strict decimal parse: reject "1,000", "0,5", "1.2junk", "abc", "" rather than coercing them — the old
	// parseFloat clamp turned "0,5" into 0, silently DISABLING the filter. On invalid input, snap the field
	// back to the last saved value and change nothing.
	if (!/^(\d+\.?\d*|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw))) {
		el.value = dustThreshold.value
		return
	}
	const value = Number(raw)
	try {
		await configService.setValue("incomingDustUsdThreshold", value)
		dustThreshold.value = String(value)
		el.value = dustThreshold.value // normalize the display (e.g. "1.50" → "1.5")
	} catch (err) {
		// A failed write stores nothing, but the field still holds the typed text, which an unchanged
		// ref never re-renders: put the stored value back, unless the field already holds a newer edit.
		if (el.value.trim() === raw) el.value = dustThreshold.value
		openToast({ kind: "error", label: SETTING_UPDATE_FAILED })
	}
}

const { updateSetting, onSettingUpdate, landSettings } = useSettingUpdate(configService, settings, applySetting)
configService.onUpdate.add(onDisplayUpdate)
const displayRead = useConfigRead(configService, () => configService.getProps(), landDisplayConfig)

async function applySetting(key, value) {
	settings[key].model.value = value

	switch (key) {
		case "sidePanel":
			if (value && chrome.sidePanel) {
				const currentWindow = await chrome.windows.getCurrent()
				chrome.sidePanel.open({
					windowId: currentWindow.id,
				})
			}

			window.close()
			break

		default:
			break
	}
}

function toggleSetting(key, value) {
	const written = updateSetting(key, value)
	// Firefox opens or closes its sidebar only inside the click that asks, so neither can wait for the
	// write. A connected client has already posted it, so a document the change closes has sent it;
	// a client still reconnecting has not, and the page stays to finish it.
	if (key === "sidePanel" && configService.isConnected) {
		let change
		if (value) change = sidebarAction()?.open()
		else if (isFirefoxSidebar()) change = sidebarAction()?.close()
		change?.catch(() => console.debug("[display] Firefox did not open or close the sidebar"))
	}
	return written
}

function onDisplayUpdate(setting) {
	if (setting.key === "incomingDustUsdThreshold") dustThreshold.value = String(setting.value)
	else onSettingUpdate(setting)
}

function landDisplayConfig(stored, updatedSince) {
	for (const s of stored) {
		if (s.key === "incomingDustUsdThreshold" && !updatedSince(s.key)) dustThreshold.value = String(s.value)
	}
	landSettings(stored, updatedSince)
	isLoading.value = false
}

onMounted(() => {
	void displayRead.read()
})

onBeforeUnmount(() => {
	configService.disconnect()
	displayRead.dispose()
})
</script>

<template>
	<Flex direction="column" :class="$style.wrapper">
		<SubPageHeader title="Display" :backTo="'/popup/settings'" />

		<Flex v-if="!isLoading" direction="column" gap="24" :class="$style.content">
			<SettingControlRow
				:title="settings.theme.title"
				:description="settings.theme.description"
				:data-testid="settings.theme.testid"
				v-settings-row="settings.theme.id"
			>
				<Dropdown>
					<template #trigger>
						<DropdownTrigger data-testid="theme-trigger">
							<Icon
								:name="
									(theme === 'dark' && 'moon') ||
									(theme === 'light' && 'sun') ||
									(theme === 'system' && 'settings')
								"
								size="14"
								color="primary"
							/>
							<Text variant="value" color="primary">
								<span style="text-transform: capitalize">{{ theme }}</span>
							</Text>
						</DropdownTrigger>
					</template>

					<template #popup>
						<DropdownItem @click="updateSetting('theme', 'dark')" data-testid="theme-dark-btn">
							<Flex align="center" gap="8">
								<Icon name="check" size="14" color="primary" :class="theme !== 'dark' && $style.unselected" />
								Dark
							</Flex>
						</DropdownItem>
						<DropdownItem @click="updateSetting('theme', 'light')" data-testid="theme-light-btn">
							<Flex align="center" gap="8">
								<Icon name="check" size="14" color="primary" :class="theme !== 'light' && $style.unselected" />
								Light
							</Flex>
						</DropdownItem>
						<DropdownItem @click="updateSetting('theme', 'system')" data-testid="theme-system-btn">
							<Flex align="center" gap="8">
								<Icon name="check" size="14" color="primary" :class="theme !== 'system' && $style.unselected" />
								System
							</Flex>
						</DropdownItem>
					</template>
				</Dropdown>
			</SettingControlRow>

			<SettingControlRow
				v-for="sk in Object.keys(settings).filter(sk => sk !== 'theme' && sk !== 'incomingTransfersVisible')"
				:title="settings[sk].title"
				:description="settings[sk].description"
				:data-testid="settings[sk].testid"
				v-settings-row="settings[sk].id"
			>
				<Toggle
					@update:modelValue="toggleSetting(sk, $event)"
					:modelValue="settings[sk].model.value"
					:data-testid="TOGGLE_TESTIDS[sk] || null"
				/>
			</SettingControlRow>

			<SectionLabel label="Lists" />

			<SettingControlRow
				:title="settings.incomingTransfersVisible.title"
				:description="settings.incomingTransfersVisible.description"
				:data-testid="settings.incomingTransfersVisible.testid"
				v-settings-row="settings.incomingTransfersVisible.id"
			>
				<Toggle
					@update:modelValue="updateSetting('incomingTransfersVisible', $event)"
					:modelValue="settings.incomingTransfersVisible.model.value"
				/>
			</SettingControlRow>

			<!-- One dust threshold for the wallet: the activity feed's receipts AND the Holdings fold. -->
			<SettingControlRow
				:title="dustRow.title"
				:description="dustRow.description"
				align="center"
				gap="12"
				:data-testid="dustRow.testid"
				v-settings-row="dustRow.id"
			>

				<!-- type="text" (not number) so there are no spinner arrows widening the field; the $ prefix
				     lives in the wrapper. -->
				<label :class="$style.dust_field">
					<span :class="$style.dust_prefix">$</span>
					<input
						:class="$style.dust_input"
						type="text"
						inputmode="decimal"
						data-testid="dust-threshold-input"
						:value="dustThreshold"
						@change="updateDustThreshold($event)"
					/>
				</label>
			</SettingControlRow>
		</Flex>

	</Flex>
</template>

<style module>
.wrapper {
	composes: wrapper from "../../../components/composite/settings-page.module.css";
}

.content {
	composes: content from "../../../components/composite/settings-page.module.css";
}

.dust_field {
	display: flex;
	align-items: center;
	gap: 2px;

	width: 72px;
	padding: 6px 8px;

	background: var(--nulo-surface-low);
	border: 1px solid var(--nulo-border);

	transition: border-color 0.2s var(--bezier);

	&:focus-within {
		border-color: var(--nulo-outline);
	}
}

.dust_prefix {
	composes: type--input-data from global;
	color: var(--nulo-secondary);
}

.dust_input {
	composes: type--input-data from global;
	width: 100%;
	min-width: 0;
	text-align: right;

	color: var(--txt-primary);

	background: transparent;
	border: none;
	padding: 0;

	&:focus {
		outline: none;
	}
}

.unselected {
	visibility: hidden;
}
</style>
