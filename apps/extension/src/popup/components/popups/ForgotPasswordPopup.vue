<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Store */
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStack } from "@/composables/usePopupStack"
import { usePopupStore } from "@/stores/popup.store"
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("forgot_password")

const router = useRouter()

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const isPasskeyProfile = computed(() => appStore.profile?.type === "passkey")

const handleReset = () => {
	popupStore.closeAll()
	router.push("/popup/settings/security/reset")
}
</script>

<template>
	<Popup :show @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<Flex wide direction="column" gap="32" :class="$style.wrapper">
				<Flex align="center" direction="column" gap="12">
					<Flex align="center" gap="6">
						<Icon name="help" size="18" color="primary" />
						<Text variant="title-page" color="primary" data-testid="forgot-title">
							{{ isPasskeyProfile ? "Lost your passkey?" : "Lost your password?" }}
						</Text>
					</Flex>

					<Text variant="body" color="body" height="140" align="center" style="padding: 0 12px">
						{{ isPasskeyProfile ? "A lost passkey can't be recovered." : "Password recovery is not possible." }} Delete this
						profile, then re-import it with its recovery phrase.
					</Text>
					<!-- Shown for every profile: while locked the wallet reads nothing about its accounts. -->
					<Flex align="start" gap="6" :class="$style.warning" data-testid="forgot-imported-warning">
						<Icon name="warning" size="14" color="txt-warning" aria-hidden="true" />
						<Text variant="body" color="primary" height="140">Accounts you imported are lost with this profile. The recovery phrase can't bring them back.</Text>
					</Flex>
				</Flex>

				<ItemsContainer title="Recovery">
					<SettingItem
						@click="handleReset"
						title="Delete profile"
						icon="remove"
						iconBgColor="red"
						chevron
						data-testid="forgot-reset-btn"
					/>
				</ItemsContainer>

				<ItemsContainer>
					<SettingItem
						title="Report issue with authorization"
						to="mailto:hello@nulo.sh?subject=Nulo%20authorization%20issue"
						icon="help"
						external
						data-testid="forgot-report-btn"
					/>
				</ItemsContainer>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.warning {
	padding: 0 12px;
}

.wrapper {
	composes: body from "@/components/Popup/popup-shared.module.css";
}
</style>
