<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/**
 * The name + address field pair shared by the new/edit contact popups.
 * Presentation only: the popup owns validation, duplicate policy, and
 * submit; this component just renders the fields and their inline
 * warnings from the flags it is handed.
 */
import { CONTACT_NAME_MAX, typedContactName } from "@/utils/contact-name"

defineProps({
	/** Show "Already exist" on the name field. */
	nameExists: Boolean,
	/** Address parses as hex; when false (and non-empty) shows "Invalid address". */
	addressValid: Boolean,
	/** Show "Already exist" on the address field. */
	addressExists: Boolean,
})

const nameModel = defineModel("name", { type: String, default: "" })
const addressModel = defineModel("address", { type: String, default: "" })
</script>

<template>
	<Input
		label="Name"
		placeholder="New contact"
		autofocus
		:normalize="typedContactName"
		:maxLength="CONTACT_NAME_MAX"
		v-model="nameModel"
		inputTestid="contact-name-input"
	>
		<template #right>
			<Transition name="fade">
				<Flex v-if="nameExists" align="center" gap="6" data-testid="contact-name-exists">
					<Icon name="warning" size="12" color="primary" />
					<Text size="12" weight="600" color="primary"> Already exist </Text>
				</Flex>
			</Transition>
		</template>
	</Input>

	<AddressInput
		label="Address"
		placeholder="0x15c4ac6afcffdf59aa8a1fb3317ff0c86aee3eb02f9e52c3612e1163d4701446"
		sanitize
		v-model="addressModel"
		inputTestid="contact-address-input"
	>
		<template #right>
			<Transition name="fade">
				<Flex v-if="!addressValid && addressModel" align="center" gap="6">
					<Icon name="warning" size="12" color="primary" />
					<Text size="12" weight="600" color="primary"> Invalid address </Text>
				</Flex>
				<Flex v-else-if="addressExists && addressModel" align="center" gap="6">
					<Icon name="warning" size="12" color="primary" />
					<Text size="12" weight="600" color="primary"> Already exist </Text>
				</Flex>
			</Transition>
		</template>
	</AddressInput>
</template>
