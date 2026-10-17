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

/** Services */
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Utils */
import { stringCompare } from "@/utils/string"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfirm } from "@/composables/useConfirm"
import { useEntityCrud } from "@/composables/useEntityCrud"
const { openToast } = useToast()
const { requestConfirm } = useConfirm()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const popupStore = usePopupStore()

const tokenService = new TokenServiceClient()
const { entities: tokens, refresh: refreshTokens } = useEntityCrud({
	fetch: () => tokenService.getTokens(appStore.profile.id, appStore.network.chainId),
	added: tokenService.onTokenAdded,
	updated: tokenService.onTokenUpdated,
	deleted: tokenService.onTokenDeleted,
	// Resync re-reads through the scoped fetch, which is always correct.
	mode: "resync",
})

// A profile/network switch emits no token events and this route is not
// remounted — refetch under the new scope explicitly; the composable's fetch
// sequence makes any in-flight stale fetch stand down instead of installing.
watch(
	() => [appStore.profile?.id, appStore.network?.chainId],
	() => void refreshTokens({ clear: true }),
)

const handleDelete = (target) => {
	requestConfirm({
		confirm_color: "red",
		confirm_text: "Yes, delete token",
		title: "Remove this token?",
		description: "Removing a token only affects the display in the interface and it does not affect the token balance",
		callback: async () => {
			await tokenService.deleteToken(target.id)
			openToast({ kind: "success", label: "Token successfully deleted" })
		},
	})
}

watch(
	() => tokens.value.length,
	() => {
		tokens.value = [...tokens.value].sort((a, b) => stringCompare(a.name, b.name))
	},
)

onBeforeUnmount(() => {
	tokenService.disconnect()
})
</script>

<template>
	<SettingsPageShell title="Manage Tokens" :backTo="'/popup/settings'" gap="16">
		<SectionLabel label="Tokens" :count="tokens.length" />

		<ItemsContainer v-if="tokens.length">
			<SettingItem
				v-for="token in tokens"
				:title="token.symbol"
				:description="token.name"
				raw
				data-testid="token-row"
			>
				<template #right>
					<Flex align="center" gap="8">
						<Tooltip v-if="appStore.networks.length > 1" position="end" delay="350">
							<RowAction label="Delete token" data-testid="token-delete" @click="handleDelete(token)">
								<Icon name="close" size="14" color="tertiary" />
							</RowAction>

							<template #content> Delete token </template>
						</Tooltip>
					</Flex>
				</template>
			</SettingItem>
		</ItemsContainer>

		<ListStatusMessage v-else headline="NO TOKENS YET" sub="Import tokens to track balances and send or receive." />

		<Button @click="popupStore.open('new_token')" wide variant="primary" size="large" data-testid="token-import-btn">
			Import token
		</Button>
	</SettingsPageShell>
</template>

