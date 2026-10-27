<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()
</script>

<template>
	<SettingsPageShell title="Backup" :backTo="'/popup/settings'" gap="24">
		<ItemsContainer title="Profile to backup">
			<SettingItem :title="appStore.profile.name" titleVariant="name" raw />
		</ItemsContainer>

		<ItemsContainer title="Choose backup mode">
			<SettingItem title="Full Backup" to="/popup/settings/security/export/full" data-testid="full-backup-link-btn" />
			<SettingItem title="Recovery Phrase" to="/popup/settings/security/export/seed" data-testid="seed-phrase-link-btn" />
			<SettingItem title="Account" to="/popup/settings/security/export/account" data-testid="account-backup-link-btn" />
		</ItemsContainer>

		<ItemsContainer
			description="Explore credentials management capabilities and options for resolving potential issues"
		>
			<SettingItem
				title="Frequently Asked Questions"
				to="/popup/settings/security/export/faq"
				external
				disabled
			/>
		</ItemsContainer>
	</SettingsPageShell>
</template>

