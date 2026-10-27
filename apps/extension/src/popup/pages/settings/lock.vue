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
import SettingControlRow from "@/components/ui/Settings/SettingControlRow.vue"

/** Utils */
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import { managers } from "@/utils/core"
import { debounce } from "@/utils/general"
import { settingItemProps, settingsRow } from "@/utils/settings-search"

/** Stores */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfigRead } from "@/composables/useConfigRead"
import { useConfirm } from "@/composables/useConfirm"
import { useLockWallet } from "@/composables/useLockWallet"
import { SETTING_UPDATE_FAILED } from "@/composables/useSettingUpdate"
import { useSettingsRowHighlight } from "@/composables/useSettingsRowHighlight"
const { openToast } = useToast()
const { requestConfirm, askConfirm } = useConfirm()
const { vSettingsRow } = useSettingsRowHighlight()
const { lock: lockNow, dispose: disposeLockWallet } = useLockWallet(managers.profile)

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)
const lockRead = useConfigRead(configService, fetchLockConfig, landLockConfig)

const profileService = new ProfileServiceClient()
const isLoading = ref(true)
let isUnmounted = false

const defaultConfig = makeDefaultConfig()
const MAX_SESSION_TTL = 1440
const sessionTtl = ref(defaultConfig.sessionTtl)
const sessionTtlMinutes = ref(0)
const strictSecurityMode = ref(defaultConfig.strictSecurityMode)
const strictRow = settingsRow("lock-strict-mode")
const autoLockRow = settingsRow("lock-auto-lock")

const notification = reactive({
	show: false,
	text: "",
})
function fillNotification(text) {
	if (!text) {
		notification.show = false
		notification.text = ""
		return
	}

	notification.show = true
	notification.text = text
}

async function updateSessionTtl(value) {
	if (sessionTtl.value === value) return

	try {
		await configService.setValue("sessionTtl", value)
		sessionTtl.value = value
		await profileService.refreshSession()
		openToast({ kind: "success", label: "Auto-lock timeout updated" })
	} catch (err) {
		// A failed write stores nothing: show the stored timeout again, so typing the same value
		// retries, unless the field already holds a newer edit.
		if (Number(sessionTtlMinutes.value) * 60 * 1_000 === value) sessionTtlMinutes.value = String(sessionTtl.value / 1_000 / 60)
		openToast({ kind: "error", label: SETTING_UPDATE_FAILED })
	}
}

/** An emptied int field emits 0 too, so clearing the field asks. One question at a time: a second
 *  would replace the first, whose "no" would then undo the 0 the second asks about. */
let isAskingNeverLock = false
async function confirmNeverLock() {
	if (isAskingNeverLock) return
	isAskingNeverLock = true
	try {
		const confirmed = await askConfirm({
			title: "Never lock automatically?",
			description:
				"Nulo will stay unlocked until you lock it yourself. Anyone who can use this browser can use your wallet meanwhile.",
			confirm_text: "Never lock",
			confirm_color: "red",
		})
		if (isUnmounted || Number(sessionTtlMinutes.value) !== 0) return
		if (confirmed) await updateSessionTtl(0)
		else sessionTtlMinutes.value = String(sessionTtl.value / 1_000 / 60)
	} finally {
		isAskingNeverLock = false
	}
}

function onSettingUpdate(setting) {
	if (setting.key === "sessionTtl" && sessionTtl.value !== setting.value) {
		sessionTtl.value = setting.value
		sessionTtlMinutes.value = String(setting.value / 1_000 / 60)
	} else if (setting.key === "strictSecurityMode" && strictSecurityMode.value !== setting.value) {
		strictSecurityMode.value = setting.value
	}
}

/** Handle strict-mode toggle. Disabling is a security regression → show
 *  a confirm dialog FIRST. The toggle is controlled by
 *  `strictSecurityMode`, so canceling the dialog is harmless (no state
 *  change). Enabling fires immediately. */
function onStrictToggle(next) {
	if (next === false) {
		requestConfirm({
			title: "Disable strict security?",
			description:
				"From your next unlock, every profile on this device stays unlocked when Nulo restarts in the background, until auto-lock. Less secure. " +
				"Anyone who can read browser data can unlock the wallet without your password or passkey.",
			confirm_text: "Disable",
			confirm_color: "red",
			callback: async () => {
				try {
					await configService.setValue("strictSecurityMode", false)
					strictSecurityMode.value = false
					openToast({ kind: "success", label: "Strict security mode disabled" })
				} catch (err) {
					openToast({ kind: "error", label: SETTING_UPDATE_FAILED })
				}
			},
		})
		// Note: do NOT mutate strictSecurityMode here. Toggle is controlled
		// by the ref; cancel = no state change, no UI flicker.
	} else {
		;(async () => {
			try {
				await configService.setValue("strictSecurityMode", true)
				strictSecurityMode.value = true
				openToast({ kind: "success", label: "Strict security mode enabled" })
			} catch (err) {
				openToast({ kind: "error", label: SETTING_UPDATE_FAILED })
			}
		})()
	}
}

async function fetchLockConfig() {
	const ttl = await configService.getValue("sessionTtl")
	const strict = await configService.getValue("strictSecurityMode")
	return { ttl, strict }
}

function landLockConfig({ ttl, strict }, updatedSince) {
	const ttlMoved = ttl !== undefined && !updatedSince("sessionTtl") && ttl !== sessionTtl.value
	if (ttlMoved) sessionTtl.value = ttl
	// A later read leaves the field alone unless the stored timeout moved, so an edit in progress stays.
	if (ttlMoved || isLoading.value) sessionTtlMinutes.value = String(sessionTtl.value / 1_000 / 60)
	if (strict !== undefined && !updatedSince("strictSecurityMode")) strictSecurityMode.value = strict
	isLoading.value = false
}

watch(
	() => sessionTtlMinutes.value,
	debounce(() => {
		const minutes = Number(sessionTtlMinutes.value)
		// Only whole minutes from 0 (never) to the maximum are a timeout: a stored negative expires
		// every session the moment it opens.
		if (minutes === 0 && sessionTtl.value !== 0) void confirmNeverLock()
		else if (Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_SESSION_TTL) updateSessionTtl(minutes * 60 * 1_000)
		switch (minutes) {
			case 0:
				fillNotification("'0' means the wallet will never be locked automatically")
				break
			case MAX_SESSION_TTL:
				fillNotification("This is the maximum session time. Use 0 to disable auto-lock.")
				break

			default:
				fillNotification("")
				break
		}
	}, 300),
)

onBeforeMount(() => {
	void lockRead.read()
})

onBeforeUnmount(() => {
	isUnmounted = true
	configService.disconnect()
	profileService.disconnect()
	lockRead.dispose()
	disposeLockWallet()
})
</script>

<template>
	<SettingsPageShell title="Lock" :backTo="'/popup/settings'" gap="32">
		<!-- Outside the load gate, so locking never waits on the config reads. -->
		<ItemsContainer>
			<SettingItem
				:disabled="appStore.lockHeldByImport"
				@click="lockNow"
				v-bind="settingItemProps('lock-now')"
				v-settings-row.inset="'lock-now'"
			/>
		</ItemsContainer>

		<LoadingState v-if="isLoading" label="FETCHING SETTINGS" />

		<template v-if="!isLoading">
			<!-- Strict Security Mode -->
			<SettingControlRow
				:title="strictRow.title"
				:description="strictRow.description"
				align="center"
				:data-testid="strictRow.testid"
				v-settings-row="strictRow.id"
			>
				<Toggle
					:modelValue="strictSecurityMode"
					@update:modelValue="onStrictToggle"
					data-testid="strict-security-toggle"
				/>
			</SettingControlRow>

			<!-- Auto-lock Timeout -->
			<Flex justify="between" align="center" :data-testid="autoLockRow.testid" v-settings-row="autoLockRow.id">
				<Flex direction="column" gap="6">
					<Flex align="end" gap="6">
						<Text :class="$style.title" color="primary">{{ autoLockRow.title }}</Text>
						<Tooltip v-if="notification.show">
							<Icon name="info" color="secondary" size="14" />
							<template #content>
								<Flex align="center" :class="$style.tooltip">
									<Text color="secondary">{{ notification.text }}</Text>
								</Flex>
							</template>
						</Tooltip>
					</Flex>
					<Text variant="caption" color="tertiary">{{ autoLockRow.description }}</Text>
				</Flex>

				<Input
					v-model="sessionTtlMinutes"
					type="text"
					subtype="int"
					:max="MAX_SESSION_TTL"
					placeholder="30"
					:class="$style.input"
					data-testid="auto-lock-input"
				/>
			</Flex>

		</template>
	</SettingsPageShell>
</template>

<style module>
.tooltip {
	max-width: 200px;

	* {
		line-height: 1.2;
	}
}

.input {
	width: 60px;

	* {
		text-align: center;
	}
}

.title {
	composes: control_title from "../../../components/ui/Settings/settings-row.module.css";
}
</style>
