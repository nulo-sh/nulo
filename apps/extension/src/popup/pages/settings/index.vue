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
/** Components */
import SettingsSearch from "@/popup/components/modules/settings/SettingsSearch.vue"

/** Services */
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { ExecutionServiceClient } from "@/wallet/services/execution/client"

/** Composables */
import { useConfigRead } from "@/composables/useConfigRead"
import { useHeroVisible } from "@/composables/useHeroVisible"
import { usePrestoCheck } from "@/composables/usePrestoCheck"

/** Utils */
import { rowDescriptionFor } from "@/utils/presto-ui-state"
import { hubValues, profileTypeLabel } from "@/utils/settings-labels"
import { settingItemProps, settingsQueryTerms } from "@/utils/settings-search"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Each row below registers in `@/utils/settings-search`, which is what the search reads. */
const query = ref("")
const searching = computed(() => settingsQueryTerms(query.value).length > 0)

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

const searchContext = computed(() => ({
	sidePanel: Boolean(chrome.sidePanel),
	passkey: isPasskey.value,
	developerMode: hubConfig.developerMode === true,
	provingStatus: provingDescription.value,
}))

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
const barRef = useTemplateRef("barRef")
const { visible: heroVisible, settled: heroSettled } = useHeroVisible(heroRef, barRef)

onBeforeUnmount(() => {
	executionService.disconnect()
	configService.disconnect()
	hubRead.dispose()
	disposePresto()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper" data-testid="settings-page">
		<!-- The hero's h1 names the page for a screen reader; this bar repeats it for sight only. -->
		<div
			ref="barRef"
			:class="[$style.page_title_bar, !heroVisible && $style.page_title_bar_visible, !heroSettled && $style.page_title_bar_instant]"
			aria-hidden="true"
		>
			<span :class="$style.page_title_label" data-testid="page-title-bar">SETTINGS</span>
		</div>

		<div ref="heroRef">
			<Flex direction="column" align="center" gap="16" :class="$style.hero" data-testid="page-hero">
				<h1 :class="$style.hero_title" data-testid="page-hero-title">SETTINGS</h1>
				<div :class="$style.hero_bar" />
			</Flex>
		</div>

		<Flex direction="column" gap="32" :class="$style.content">
			<SettingsSearch v-model="query" :context="searchContext" />

			<template v-if="!searching">
				<ItemsContainer>
					<SettingItem
						size="large"
						to="/popup/settings/profile"
						:title="appStore.profile?.name"
						titleVariant="name"
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
						chevron
						v-bind="settingItemProps('hub-accounts', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-contacts', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-tokens', searchContext)"
					/>
				</ItemsContainer>

				<ItemsContainer title="Apps and networks">
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-connected-apps', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-networks', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-fpcs', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-proving', searchContext)"
						:data-status="prestoState.kind"
					/>
				</ItemsContainer>

				<ItemsContainer title="Safety">
					<SettingItem
						:value="values.lock"
						chevron
						v-bind="settingItemProps('hub-lock', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-backup', searchContext)"
					/>
					<SettingItem
						v-if="!isPasskey"
						chevron
						v-bind="settingItemProps('hub-change-password', searchContext)"
					/>
				</ItemsContainer>

				<ItemsContainer title="Preferences">
					<SettingItem
						:value="values.privacy"
						chevron
						v-bind="settingItemProps('hub-privacy', searchContext)"
					/>
					<SettingItem
						:value="values.display"
						chevron
						v-bind="settingItemProps('hub-display', searchContext)"
					/>
					<SettingItem
						:value="values.developer"
						chevron
						v-bind="settingItemProps('hub-developer', searchContext)"
					/>
				</ItemsContainer>

				<ItemsContainer title="Help">
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-glossary', searchContext)"
					/>
					<SettingItem
						chevron
						v-bind="settingItemProps('hub-about', searchContext)"
					/>
				</ItemsContainer>

				<ItemsContainer title="Danger zone" danger>
					<SettingItem chevron v-bind="settingItemProps('hub-delete-profile', searchContext)" />
				</ItemsContainer>
			</template>
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

.page_title_bar_instant {
	composes: page_title_bar_instant from "../tab-hero.module.css";
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
</style>
