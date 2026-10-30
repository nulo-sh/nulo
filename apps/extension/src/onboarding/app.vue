<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/** Services */
import { isServiceReady, managers } from "@/utils/core"
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Components */
import ConfirmPopup from "@/components/ConfirmPopup.vue"

/** Composables */
import { useConfigRead } from "@/composables/useConfigRead"
import { useProfileBootstrap } from "@/composables/useProfileBootstrap"

/** Stores */
import { usePopupStore } from "@/stores/popup.store"

/** Utils */
import { applyThemeChoice, isPrefersDarkScheme } from "@/utils/general"
import type { Config } from "@/wallet/config"
import { openPopupWindowAndClose } from "./hand-over"
import { doneRoute, resumePath, settleResume } from "./steps"

const popupStore = usePopupStore()
const router = useRouter()
const { hydrateKnownProfile } = useProfileBootstrap()

// `theme-boot.js` painted the hint before first paint, and it stands until Config is read: applying a
// default first would paint a theme nobody chose and overwrite the hint the next document reads.
const root = document.documentElement
let storedTheme: Config["theme"] | undefined
const configService = new ConfigServiceClient()
const themeRead = useConfigRead(configService, readTheme, (choice) => {
	storedTheme = choice
	applyThemeChoice(root, choice)
})
const systemScheme = window.matchMedia("(prefers-color-scheme: dark)")

async function readTheme(): Promise<Config["theme"]> {
	try {
		return await configService.getValue("theme")
	} catch (error) {
		console.debug("theme read failed; the pre-paint theme stays", { error })
		throw error
	}
}

function followSystemScheme() {
	if (storedTheme === "system") root.setAttribute("theme", isPrefersDarkScheme() ? "dark" : "light")
}
systemScheme.addEventListener("change", followSystemScheme)

onBeforeMount(() => {
	void themeRead.read()
})

onMounted(async () => {
	let resumed = false
	try {
		const active = await hydrateKnownProfile()
		if (active) {
			// The first navigation awaits the Terms guard, so the reloaded route may not be known yet.
			await router.isReady()
			// An active profile alone proves nothing: another window may have unlocked it. Only an entry
			// whose flow got a profile in resumes at Ready.
			const path = resumePath()
			if (path) {
				resumed = true
				router.replace(doneRoute(path))
			}
			return
		}

		const profiles = await managers.profile.getProfiles()
		if (profiles.length === 0) {
			return
		}

		await openPopupWindowAndClose()
	} finally {
		settleResume(resumed)
	}
})

onBeforeUnmount(() => {
	configService.disconnect()
	themeRead.dispose()
	systemScheme.removeEventListener("change", followSystemScheme)
})
</script>

<template>
	<main :class="$style.shell" :data-service-ready="isServiceReady ? 'true' : undefined">
		<!-- Passkey ceremony dialog teleports to #popup. The popup app.vue
			declares this anchor too; onboarding mirrors it. -->
		<div id="popup" />
		<div id="tooltip" />
		<div id="dropdown" />
		<div id="popover" />

		<ConfirmPopup :show="popupStore.isOpened('confirm')" @onClose="popupStore.close('confirm')" />
		<ToastManager />
		<NotificationManager />
		<MigrationBarrier />

		<!-- Brand signature: lock icon + NULO wordmark — same as popup
			register page, so the onboarding tab feels like Nulo from the
			very first paint. -->
		<Flex tag="header" align="center" justify="center" gap="8" :class="$style.brand">
			<Icon name="lock" :size="18" color="primary" />
			<span :class="$style.wordmark">NULO</span>
		</Flex>

		<RouterView v-slot="{ Component }">
			<component :is="Component" />
		</RouterView>

		<div id="toast" />
	</main>
</template>

<style module>
.shell {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
	width: 100%;
	background: var(--app-bg);
	color: var(--txt-primary);
	padding: 24px 24px 64px;
	box-sizing: border-box;
}

.brand {
	padding: 8px 0 24px;
}

.wordmark {
	composes: type--title-hero from global;
	font-size: 20px;
	color: var(--txt-primary);
}
</style>
