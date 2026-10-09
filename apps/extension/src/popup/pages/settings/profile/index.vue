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
import { profileTypeLabel } from "@/utils/settings-labels"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const popupStore = usePopupStore()
</script>

<template>
	<SettingsPageShell title="Your profile" :backTo="'/popup/settings'" gap="24">
		<ItemsContainer v-if="appStore.profile" title="Identity">
			<SettingField
				@click="popupStore.open('edit_profile')"
				label="Name"
				:value="appStore.profile?.name"
				icon="edit"
				data-testid="identity-name-row"
			/>
			<Flex direction="column" gap="6" :class="$style.field_row" data-testid="identity-id-row">
				<Text size="12" weight="600" color="secondary">ID</Text>
				<Text size="12" weight="500" color="tertiary" :class="$style.id_value">
					{{ appStore.profile?.id }}
				</Text>
			</Flex>
			<Flex direction="column" gap="6" :class="$style.field_row" data-testid="identity-type-row">
				<Text size="12" weight="600" color="secondary">Type</Text>
				<Text size="13" weight="600" color="primary">{{ profileTypeLabel(appStore.profile?.type) }}</Text>
			</Flex>
		</ItemsContainer>
	</SettingsPageShell>
</template>

<style module>
.field_row {
	composes: divider from "../../../../components/ui/Settings/settings-row.module.css";

	padding: 14px 16px;

	&::after {
		left: 16px;
		right: 16px;
	}

	&:last-child::after {
		display: none;
	}
}

.id_value {
	font-family: var(--font-mono);
	word-break: break-all;
}
</style>
