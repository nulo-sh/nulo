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
import { AccountType } from "@/wallet/services/account/client"

/** Composables */
import { useToast } from "@/composables/toast"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { useCacheStore } from "@/stores/cache.store"
import { copyWithToast } from "@/utils/clipboard"
const appStore = useAppStore()
const popupStore = usePopupStore()
const cacheStore = useCacheStore()

const router = useRouter()

const accounts = computed(() => appStore.accounts.filter((a) => a.visible).sort((a, b) => a.index - b.index))
const hiddenAccounts = computed(() => appStore.accounts.filter((a) => !a.visible))

const handleSelectAccount = async (acc) => {
	// Same guard as the accounts popup: a send in flight is still reading the
	// active account as it builds, so switching now would let it finish as the
	// wrong one. Without this, the popup's guard is just a detour.
	if (!(await appStore.commitScopeChange(() => appStore.selectAccount(acc)))) {
		openToast({ kind: "error", label: "Finish or cancel your pending transaction first" })
	}
}

const handleEditAccount = (target) => {
	cacheStore.accountToEditIdx = target.address
	popupStore.open("edit_account")
}

const handleExportAccount = (target) => {
	// Deep-link into the Account backup page with this account preselected (the page skips its
	// picker). The flow lives with the other backup modes; this icon is the shortcut.
	router.push(`/popup/settings/security/export/account?address=${target.address}`)
}

const handleHideAccount = async (acc) => {
	if (accounts.value.length === 1) return
	// Hiding ANY account reassigns the active one to the first visible account,
	// so it changes the signing scope exactly like an explicit switch does.
	if (!(await appStore.changeAccountVisibility(acc, false))) {
		openToast({ kind: "error", label: "Finish or cancel your pending transaction first" })
		return
	}
	openToast({ kind: "success", label: "Account successfully hidden" })
}

const handleShowAccount = (acc) => {
	appStore.changeAccountVisibility(acc, true)
	openToast({ kind: "success", label: "Account visible again" })
}

const handleCopyAddress = (target) => {
	void copyWithToast(target, openToast, "Address is copied")
}
</script>

<template>
	<SettingsPageShell title="Manage Accounts" :backTo="'/popup/settings'" gap="40" data-testid="manage-accounts-page">
		<Flex direction="column" gap="16">
			<SectionLabel label="Accounts" :count="appStore.accounts.length" />

			<ItemsContainer>
				<SettingItem
					v-for="account in accounts"
					@click="handleSelectAccount(account)"
					:title="account.name"
					titleVariant="name"
					:icon="account?.address === appStore.account?.address ? 'square-check' : 'square'"
					:iconFillColor="account?.address === appStore.account?.address ? 'primary' : 'tertiary'"
					data-testid="manage-accounts-row"
					:data-account-name="account.name"
				>
					<!-- The head is the only part that may clip, with an ellipsis; the tail never does. -->
					<template #description>
						<Text v-if="account.type === AccountType.Imported" variant="meta" color="tertiary" data-testid="account-imported-badge" :class="$style.marker">imported</Text>
						<Text variant="meta" color="tertiary" :class="$style.desc_line" data-testid="manage-accounts-address">
							<span :class="$style.addr_head" data-testid="manage-accounts-address-head">{{ account.address.slice(0, -4) }}</span>
							<span :class="$style.desc_fixed" data-testid="manage-accounts-address-tail">{{ account.address.slice(-4) }}</span>
						</Text>
					</template>
					<template #right>
						<Flex align="center" gap="8">
							<Tooltip position="end" delay="350">
								<RowAction label="Copy account address" @click="handleCopyAddress(account.address)">
									<Icon name="copy" size="14" color="tertiary" />
								</RowAction>

								<template #content>Copy account address</template>
							</Tooltip>

							<Tooltip position="end" delay="350">
								<RowAction label="Export account" data-testid="account-export-btn" @click="handleExportAccount(account)">
									<Icon name="upload" size="14" color="tertiary" />
								</RowAction>

								<template #content>Export account</template>
							</Tooltip>

							<Tooltip position="end" delay="350">
								<RowAction label="Edit account" data-testid="account-edit-btn" @click="handleEditAccount(account)">
									<Icon name="edit" size="14" color="tertiary" />
								</RowAction>

								<template #content>Edit account</template>
							</Tooltip>

							<Tooltip position="end" delay="350">
								<RowAction
									label="Hide account"
									data-testid="account-hide"
									:disabled="accounts.length === 1"
									:class="accounts.length === 1 && $style.disabled"
									@click="handleHideAccount(account)"
								>
									<Icon name="close" size="14" color="tertiary" />
								</RowAction>

								<template #content> Hide account </template>
							</Tooltip>
						</Flex>
					</template>
				</SettingItem>
			</ItemsContainer>

			<Flex gap="10" :class="$style.account_actions">
				<Button
					@click="popupStore.open('new_account')"
					wide
					variant="primary"
					size="large"
					data-testid="accounts-new-btn"
				>
					Add account
				</Button>
				<Button
					@click="router.push('/popup/settings/accounts/import')"
					wide
					variant="primary_outline"
					size="large"
					data-testid="accounts-import-btn"
				>
					Import account
				</Button>
			</Flex>
		</Flex>

		<Flex v-if="hiddenAccounts.length" direction="column" gap="12">
			<Flex align="center" justify="between">
				<Text variant="label-section" color="body"> Hidden accounts </Text>

				<Text variant="meta" color="secondary">
					{{ hiddenAccounts.length }}
				</Text>
			</Flex>

			<ItemsContainer description="Click on an account you want to make visible">
				<SettingItem
					v-for="account in hiddenAccounts"
					@click="handleShowAccount(account)"
					:title="account.name"
					titleVariant="name"
					:description="account.address"
					descriptionVariant="meta"
					data-testid="manage-accounts-hidden-row"
					:data-account-name="account.name"
				>
					<template #icon>
						<AccountAvatar :name="account.name" :address="account.address" :size="20" />
					</template>
					<template #right>
						<Icon name="undo" size="14" color="secondary" />
					</template>
				</SettingItem>
			</ItemsContainer>
		</Flex>
	</SettingsPageShell>
</template>

<style module>
.desc_line {
	display: flex;
	max-width: 100%;
}

.desc_fixed {
	flex-shrink: 0;
}

.marker {
	display: block;
}

/* Shrink-only (no grow), so on wide rows the tail sits flush against the head. */
.addr_head {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.disabled {
	opacity: 0.3;
}

@media (width < 359px) {
	.account_actions {
		flex-direction: column;
	}
}
</style>
