<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import AccountsPopup from "./AccountsPopup.vue"
import ChangeAuthwitsRegistryPopup from "./ChangeAuthwitsRegistryPopup.vue"
import ConfirmPopup from "./ConfirmPopup.vue"
import DataViewerPopup from "./DataViewerPopup.vue"
import EditAccountPopup from "./EditAccountPopup.vue"
import EditContactPopup from "./EditContactPopup.vue"
import EditFpcPopup from "./EditFpcPopup.vue"
import EditEndpointPopup from "./EditEndpointPopup.vue"
import EditNetworkPopup from "./EditNetworkPopup.vue"
import EditProfilePopup from "./EditProfilePopup.vue"
import ForgotPasswordPopup from "./ForgotPasswordPopup.vue"
import ImportContactsPopup from "./ImportContactsPopup.vue"
import IncomingTrustPopup from "./IncomingTrustPopup.vue"
import NewAccountPopup from "./NewAccountPopup.vue"
import NewContactPopup from "./NewContactPopup.vue"
import NewFpcPopup from "./NewFpcPopup.vue"
import NewEndpointPopup from "./NewEndpointPopup.vue"
import NewNetworkPopup from "./NewNetworkPopup.vue"
import NewSenderPopup from "./NewSenderPopup.vue"
import NewTokenPopup from "./NewTokenPopup.vue"
import ReceivePopup from "./ReceivePopup.vue"
import RevokeAuthwitsPopup from "./RevokeAuthwitsPopup.vue"
import SelectProfilePopup from "./SelectProfilePopup.vue"
import SelectTokenPopup from "./SelectTokenPopup.vue"
import TokenMetadataPopup from "./TokenMetadataPopup.vue"

/** Services */
import { IncomingTransferServiceClient } from "@/wallet/services/incoming-transfer/client"
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Composables */
import { useIncomingTrustPrompts } from "@/composables/useIncomingTrustPrompts"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const popupStore = usePopupStore()

const incomingTransferService = new IncomingTransferServiceClient()
const configService = new ConfigServiceClient()
const trust = useIncomingTrustPrompts(incomingTransferService, configService)

// Clients connect on their first request, so both connect here for `onConnected` and the pending
// stream to fire at all.
onMounted(async () => {
	try {
		await incomingTransferService.connect()
	} catch {
		// Connect is retried on the first method call; non-fatal here.
	}
	try {
		await configService.connect()
	} catch {
		// Non-fatal; toggle-flip replay just won't fire this session.
	}
	let visible
	try {
		visible = (await configService.getValue("incomingTransfersVisible")) !== false
	} catch {
		// Fail open, as the service's own visibility check does.
	}
	trust.seedVisibility(visible)
})

onBeforeUnmount(() => {
	trust.dispose()
	incomingTransferService.disconnect()
	configService.disconnect()
})
</script>

<template>
	<ForgotPasswordPopup :show="popupStore.isOpened('forgot_password')" @onClose="popupStore.close('forgot_password')" />

	<ConfirmPopup :show="popupStore.isOpened('confirm')" @onClose="popupStore.close('confirm')" />
	<DataViewerPopup :show="popupStore.isOpened('data_viewer')" @onClose="popupStore.close('data_viewer')" />

	<EditProfilePopup :show="popupStore.isOpened('edit_profile')" @onClose="popupStore.close('edit_profile')" />
	<SelectProfilePopup :show="popupStore.isOpened('select_profile')" @onClose="popupStore.close('select_profile')" />

	<NewNetworkPopup :show="popupStore.isOpened('new_network')" @onClose="popupStore.close('new_network')" />
	<EditNetworkPopup :show="popupStore.isOpened('edit_network')" @onClose="popupStore.close('edit_network')" />
	<NewEndpointPopup :show="popupStore.isOpened('new_endpoint')" @onClose="popupStore.close('new_endpoint')" />
	<EditEndpointPopup :show="popupStore.isOpened('edit_endpoint')" @onClose="popupStore.close('edit_endpoint')" />

	<AccountsPopup :show="popupStore.isOpened('accounts')" @onClose="popupStore.close('accounts')" />
	<NewAccountPopup :show="popupStore.isOpened('new_account')" @onClose="popupStore.close('new_account')" />
	<EditAccountPopup :show="popupStore.isOpened('edit_account')" @onClose="popupStore.close('edit_account')" />

	<TokenMetadataPopup :show="popupStore.isOpened('token_metadata')" @onClose="popupStore.close('token_metadata')" />
	<NewTokenPopup :show="popupStore.isOpened('new_token')" @onClose="popupStore.close('new_token')" />
	<!-- Mounted only while unlocked: its price feed refreshes at setup, which must never run locked. -->
	<SelectTokenPopup v-if="appStore.isLogined" :show="popupStore.isOpened('select_token')" @onClose="popupStore.close('select_token')" />


	<NewFpcPopup :show="popupStore.isOpened('new_fpc')" @onClose="popupStore.close('new_fpc')" />
	<EditFpcPopup :show="popupStore.isOpened('edit_fpc')" @onClose="popupStore.close('edit_fpc')" />

	<NewSenderPopup :show="popupStore.isOpened('new_sender')" @onClose="popupStore.close('new_sender')" />
	<ChangeAuthwitsRegistryPopup :show="popupStore.isOpened('change_authwits_registry')" @onClose="popupStore.close('change_authwits_registry')" />
	<RevokeAuthwitsPopup :show="popupStore.isOpened('revoke_authwits')" @onClose="popupStore.close('revoke_authwits')" />

	<NewContactPopup :show="popupStore.isOpened('new_contact')" @onClose="popupStore.close('new_contact')" />
	<EditContactPopup :show="popupStore.isOpened('edit_contact')" @onClose="popupStore.close('edit_contact')" />
	<ImportContactsPopup :show="popupStore.isOpened('import_contacts')" @onClose="popupStore.close('import_contacts')" />

	<ReceivePopup :show="popupStore.isOpened('receive')" @onClose="popupStore.close('receive')" />

	<IncomingTrustPopup :show="popupStore.isOpened('incoming_trust')" @onClose="popupStore.close('incoming_trust')" />
</template>
