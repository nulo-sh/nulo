<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Utils */
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import { managers } from "@/utils/core"
import { debounce } from "@/utils/general"

/** Stores */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()

/** Composables */
import { useToast } from "@/composables/toast"
import { useLockWallet } from "@/composables/useLockWallet"
const { openToast } = useToast()
const { lock: lockNow, dispose: disposeLockWallet } = useLockWallet(managers.profile)

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)

const profileService = new ProfileServiceClient()
const isLoading = ref(true)

const defaultConfig = makeDefaultConfig()
const MAX_SESSION_TTL = 1440
const sessionTtl = ref(defaultConfig.sessionTtl)
const sessionTtlMinutes = ref(0)
const strictSecurityMode = ref(defaultConfig.strictSecurityMode)
const isPasskey = computed(() => appStore.profile?.type === "passkey")

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
		openToast({ kind: "error", label: "Failed to update setting" })
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
		cacheStore.confirm.title = "Disable strict security?"
		cacheStore.confirm.description =
			"Skip password re-entry across browser restarts. Less secure. " +
			"Anyone who can read browser data can unlock the wallet without your password."
		cacheStore.confirm.confirm_text = "Disable"
		cacheStore.confirm.confirm_color = "red"
		cacheStore.confirm.callback = async () => {
			try {
				await configService.setValue("strictSecurityMode", false)
				strictSecurityMode.value = false
				openToast({ kind: "success", label: "Strict security mode disabled" })
			} catch (err) {
				openToast({ kind: "error", label: "Failed to update setting" })
			}
		}
		popupStore.open("confirm")
		// Note: do NOT mutate strictSecurityMode here. Toggle is controlled
		// by the ref; cancel = no state change, no UI flicker.
	} else {
		;(async () => {
			try {
				await configService.setValue("strictSecurityMode", true)
				strictSecurityMode.value = true
				openToast({ kind: "success", label: "Strict security mode enabled" })
			} catch (err) {
				openToast({ kind: "error", label: "Failed to update setting" })
			}
		})()
	}
}

watch(
	() => sessionTtlMinutes.value,
	debounce(() => {
		updateSessionTtl(Number(sessionTtlMinutes.value) * 60 * 1_000)
		switch (Number(sessionTtlMinutes.value)) {
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

onBeforeMount(async () => {
	const ttl = await configService.getValue("sessionTtl")
	if (ttl !== undefined) sessionTtl.value = ttl
	sessionTtlMinutes.value = String(sessionTtl.value / 1_000 / 60)

	const strict = await configService.getValue("strictSecurityMode")
	if (strict !== undefined) strictSecurityMode.value = strict

	isLoading.value = false
})

onBeforeUnmount(() => {
	configService.disconnect()
	profileService.disconnect()
	disposeLockWallet()
})
</script>

<template>
	<SettingsPageShell title="Lock" :backTo="'/popup/settings'" gap="32">
		<!-- Outside the load gate: the config reads can hang after a worker restart. -->
		<ItemsContainer>
			<SettingItem
				title="Lock now"
				description="Locks Nulo until you unlock it again"
				materialIcon="lock"
				@click="lockNow"
				data-testid="lock-now-btn"
			/>
		</ItemsContainer>

		<LoadingState v-if="isLoading" label="FETCHING SETTINGS" />

		<template v-if="!isLoading">
			<!-- Strict Security Mode -->
			<Flex v-if="!isPasskey" justify="between" align="center" data-testid="setting-strict-security-mode">
				<Flex direction="column" gap="6">
					<Text size="13" weight="600" color="primary">Strict security mode</Text>
					<Text size="12" weight="500" color="tertiary">
						More secure, asks for your password more often. Recommended.
					</Text>
				</Flex>

				<Toggle
					:modelValue="strictSecurityMode"
					@update:modelValue="onStrictToggle"
					data-testid="strict-security-toggle"
				/>
			</Flex>

			<!-- Auto-lock Timeout -->
			<Flex justify="between" align="center">
				<Flex direction="column" gap="6">
					<Flex align="end" gap="6">
						<Text size="13" weight="600" color="primary">Auto-lock Timeout</Text>
						<Tooltip v-if="notification.show">
							<Icon name="info" color="secondary" size="14" />
							<template #content>
								<Flex align="center" :class="$style.tooltip">
									<Text size="12" color="secondary">{{ notification.text }}</Text>
								</Flex>
							</template>
						</Tooltip>
					</Flex>
					<Text size="12" weight="500" color="tertiary">Automatic wallet locking (minutes)</Text>
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
</style>
