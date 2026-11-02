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
			<SettingItem
				title="Full Backup"
				description="Everything in this profile, in one password-protected file."
				wrapDescription
				to="/popup/settings/security/export/full"
				data-testid="full-backup-link-btn"
			/>
			<SettingItem
				title="Recovery Phrase"
				description="The 24 words that restore your accounts."
				wrapDescription
				to="/popup/settings/security/export/seed"
				data-testid="seed-phrase-link-btn"
			/>
			<SettingItem
				title="Account"
				description="One account in a file you can import elsewhere."
				wrapDescription
				to="/popup/settings/security/export/account"
				data-testid="account-backup-link-btn"
			/>
		</ItemsContainer>

		<ItemsContainer description="Questions about backups">
			<SettingItem
				title="Frequently Asked Questions"
				to="/popup/settings/security/export/faq"
				external
				disabled
			/>
		</ItemsContainer>
	</SettingsPageShell>
</template>

