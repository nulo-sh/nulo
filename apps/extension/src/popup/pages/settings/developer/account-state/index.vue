<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Components */
</script>

<template>
	<SettingsPageShell title="Account State" :backTo="'/popup/settings/developer'" gap="20">
		<ItemsContainer>
			<SettingItem
				size="large"
				to="/popup/settings/developer/account-state/notes"
				title="Notes"
				description="View all notes"
				chevron
				data-testid="setting-nav-advanced-account-state-notes"
			/>
			<SettingItem
				size="large"
				to="/popup/settings/developer/account-state/authwits"
				title="Authwits"
				description="View all authwits"
				chevron
				data-testid="setting-nav-advanced-account-state-authwits"
			/>
			<SettingItem
				size="large"
				to="/popup/settings/developer/account-state/contracts"
				title="Contracts"
				description="View all contracts"
				chevron
				data-testid="setting-nav-advanced-account-state-contracts"
			/>
			<SettingItem
				size="large"
				to="/popup/settings/developer/account-state/senders"
				title="Senders"
				description="View all senders"
				chevron
				data-testid="setting-nav-advanced-account-state-senders"
			/>
		</ItemsContainer>
	</SettingsPageShell>
</template>

