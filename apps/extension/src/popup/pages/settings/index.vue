<route lang="json">
{
	"meta": {
		"title": "Settings",
		"isAuthRequired": true,
		"showBottomNav": true
	}
}
</route>

<script setup>
/** Services */
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { ExecutionServiceClient } from "@/wallet/services/execution/client"

/** Composables */
import { useConfigRead } from "@/composables/useConfigRead"
import { usePrestoCheck } from "@/composables/usePrestoCheck"

/** Utils */
import { rowDescriptionFor } from "@/utils/presto-ui-state"
import { hubValues, profileTypeLabel } from "@/utils/settings-labels"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const isPasskey = computed(() => appStore.profile?.type === "passkey")
const profileKind = computed(() => {
	const type = profileTypeLabel(appStore.profile?.type)
	return type && `${type} profile`
})

/** Proving row: Presto's live status plus the SW's memory of the last prove attempt. */
const configService = new ConfigServiceClient()
const { state: prestoState, start: startPresto, dispose: disposePresto } = usePrestoCheck(configService)
const lastProve = ref(null)
const provingDescription = computed(() => rowDescriptionFor(prestoState.value, lastProve.value))
const executionService = new ExecutionServiceClient()

/** Trailing values: shown only once read, and never overwritten by an answer older than the value. */
const HUB_KEYS = new Set(["sessionTtl", "showFiatValues", "theme", "developerMode"])
const hubConfig = reactive({})
const values = computed(() => hubValues(hubConfig))

configService.onUpdate.add(onHubUpdate)
const hubRead = useConfigRead(
	configService,
	() => configService.getProps(),
	(props, updatedSince) => {
		for (const { key, value } of props) {
			if (HUB_KEYS.has(key) && !updatedSince(key)) hubConfig[key] = value
		}
	},
)

function onHubUpdate({ key, value }) {
	if (!HUB_KEYS.has(key)) return
	hubConfig[key] = value
}

onBeforeMount(async () => {
	void startPresto()
	void hubRead.read()
	try {
		lastProve.value = await executionService.getLastProveOutcome()
	} catch {
		lastProve.value = null
	}
})

/** Hero visibility → compact sticky title fade */
const heroRef = useTemplateRef("heroRef")
const heroVisible = ref(true)
let heroObserver = null

onMounted(() => {
	if (heroRef.value) {
		heroObserver = new IntersectionObserver(
			([entry]) => {
				heroVisible.value = entry.isIntersecting
			},
			{ threshold: 0 },
		)
		heroObserver.observe(heroRef.value)
	}
})

onBeforeUnmount(() => {
	heroObserver?.disconnect()
	executionService.disconnect()
	configService.disconnect()
	hubRead.dispose()
	disposePresto()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper" data-testid="settings-page">
		<!-- The hero's h1 names the page for a screen reader; this bar repeats it for sight only. -->
		<div :class="[$style.page_title_bar, !heroVisible && $style.page_title_bar_visible]" aria-hidden="true">
			<span :class="$style.page_title_label" data-testid="page-title-bar">SETTINGS</span>
		</div>

		<div ref="heroRef">
			<Flex direction="column" align="center" gap="16" :class="$style.hero" data-testid="page-hero">
				<h1 :class="$style.hero_title" data-testid="page-hero-title">SETTINGS</h1>
				<div :class="$style.hero_bar" />
			</Flex>
		</div>

		<Flex direction="column" gap="32" :class="$style.content">
			<ItemsContainer>
				<SettingItem
					size="large"
					to="/popup/settings/profile"
					:title="appStore.profile?.name"
					:description="profileKind"
					chevron
					data-testid="setting-nav-profile"
				>
					<template #icon>
						<AccountAvatar :name="appStore.profile?.name" :size="40" data-testid="profile-card-avatar" />
					</template>
				</SettingItem>
			</ItemsContainer>

			<ItemsContainer title="Your wallet">
				<SettingItem
					to="/popup/settings/accounts"
					title="Accounts"
					description="Switch, create, manage"
					materialIcon="account_balance_wallet"
					chevron
					data-testid="setting-nav-accounts"
				/>
				<SettingItem
					to="/popup/settings/contacts"
					title="Contacts"
					description="Saved addresses"
					materialIcon="group"
					chevron
					data-testid="setting-nav-contacts"
				/>
				<SettingItem
					to="/popup/settings/tokens"
					title="Tokens"
					description="Tracked tokens and balances"
					materialIcon="toll"
					chevron
					data-testid="setting-nav-tokens"
				/>
			</ItemsContainer>

			<ItemsContainer title="Apps and networks">
				<SettingItem
					to="/popup/settings/connected-apps"
					title="Connected Apps"
					description="Apps with granted permissions"
					materialIcon="extension"
					chevron
					data-testid="setting-nav-connected-apps"
				/>
				<SettingItem
					to="/popup/settings/networks"
					title="Networks"
					description="Aztec networks and RPCs"
					materialIcon="hub"
					chevron
					data-testid="setting-nav-networks"
				/>
				<SettingItem
					to="/popup/settings/fpcs"
					title="Fee Payments"
					description="FPCs and fee methods"
					materialIcon="local_gas_station"
					chevron
					data-testid="setting-nav-fpcs"
				/>
				<SettingItem
					to="/popup/settings/proving"
					title="Proving"
					:description="provingDescription"
					materialIcon="speed"
					chevron
					data-testid="setting-nav-proving"
					:data-status="prestoState.kind"
				/>
			</ItemsContainer>

			<ItemsContainer title="Safety">
				<SettingItem
					to="/popup/settings/lock"
					title="Lock"
					:description="isPasskey ? 'Auto-lock' : 'Auto-lock, strict mode'"
					materialIcon="lock"
					:value="values.lock"
					chevron
					data-testid="setting-nav-lock"
				/>
				<SettingItem
					to="/popup/settings/security/export"
					title="Back up profile"
					description="Keep a copy of this profile"
					materialIcon="download"
					chevron
					data-testid="backup-link-btn"
				/>
				<SettingItem
					v-if="!isPasskey"
					to="/popup/settings/security/change-password"
					title="Change password"
					materialIcon="password"
					chevron
					data-testid="change-password-link-btn"
				/>
			</ItemsContainer>

			<ItemsContainer title="Preferences">
				<SettingItem
					to="/popup/settings/privacy"
					title="Privacy"
					description="Prices, explorer"
					materialIcon="visibility"
					:value="values.privacy"
					chevron
					data-testid="setting-nav-privacy"
				/>
				<SettingItem
					to="/popup/settings/display"
					title="Display"
					description="Theme, layout"
					materialIcon="palette"
					:value="values.display"
					chevron
					data-testid="setting-nav-display"
				/>
				<SettingItem
					to="/popup/settings/developer"
					title="Developer"
					description="Mode, logs, account state"
					materialIcon="bolt"
					:value="values.developer"
					chevron
					data-testid="setting-nav-developer"
				/>
			</ItemsContainer>

			<ItemsContainer title="Help">
				<SettingItem
					to="/popup/settings/glossary"
					title="Glossary"
					description="What Nulo's words mean"
					materialIcon="menu_book"
					chevron
					data-testid="setting-nav-glossary"
				/>
				<SettingItem
					to="/popup/settings/about"
					title="About Nulo"
					description="Version, contact, legal"
					materialIcon="info"
					chevron
					data-testid="setting-nav-about"
				/>
			</ItemsContainer>

			<ItemsContainer title="Danger zone" danger>
				<SettingItem to="/popup/settings/security/reset" title="Delete profile" chevron data-testid="delete-profile-link-btn">
					<template #icon>
						<span :class="$style.danger_icon">
							<MaterialIcon name="delete" :size="20" color="red" />
						</span>
					</template>
				</SettingItem>
			</ItemsContainer>
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	flex: 1;

	overflow: auto;
	scrollbar-gutter: stable;
	background: var(--app-bg);

	padding-bottom: var(--nav-clearance);
}

.page_title_bar {
	composes: page_title_bar from "../tab-hero.module.css";
}

.page_title_bar_visible {
	composes: page_title_bar_visible from "../tab-hero.module.css";
}

.page_title_label {
	composes: page_title_label from "../tab-hero.module.css";
}

.hero {
	composes: hero from "../tab-hero.module.css";
}

.hero_title {
	composes: hero_title from "../tab-hero.module.css";
}

.hero_bar {
	composes: hero_bar from "../tab-hero.module.css";
}

.content {
	padding: 0 24px;
}

/* The ligature text lays out wider than the glyph until the icon font loads; the box holds the row. */
.danger_icon {
	display: inline-flex;
	width: 20px;
	height: 20px;
	overflow: hidden;
}
</style>
