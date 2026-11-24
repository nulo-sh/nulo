<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/**
 * The name + address field pair shared by the new/edit contact popups.
 * Presentation only: the popup owns validation, duplicate policy, and
 * submit; this component just renders the fields and their inline
 * warnings from the flags it is handed.
 */
import { CONTACT_NAME_MAX, typedContactName } from "@/utils/contact-name"
import { ADDRESS_LIKE_NAME } from "@/utils/contact-rules"
import { ALREADY_EXISTS, INVALID_ADDRESS } from "@/utils/entity-rules"

defineProps({
	/** Show "Already exists" on the name field. */
	nameExists: Boolean,
	/** The name reads as an address: the field is refused, with `ADDRESS_LIKE_NAME` under it. */
	nameLooksLikeAddress: Boolean,
	/** Address parses as hex; when false (and non-empty) shows `INVALID_ADDRESS`. */
	addressValid: Boolean,
	/** Show "Already exists" on the address field. */
	addressExists: Boolean,
})

const nameModel = defineModel("name", { type: String, default: "" })
const addressModel = defineModel("address", { type: String, default: "" })
const refusalId = useId()
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
		:error="nameLooksLikeAddress"
		:ariaInvalid="nameLooksLikeAddress || undefined"
		:ariaDescribedby="nameLooksLikeAddress ? refusalId : undefined"
	>
		<template v-if="nameExists" #right>
			<Flex align="center" gap="6" data-testid="contact-name-exists">
				<Icon name="warning" size="12" color="primary" />
				<Text variant="body" color="primary"> {{ ALREADY_EXISTS }} </Text>
			</Flex>
		</template>
		<template v-if="nameLooksLikeAddress" #bottom>
			<Text :id="refusalId" variant="body" color="txt-danger" height="150" role="alert" data-testid="contact-name-address-like" :class="$style.refusal">
				{{ ADDRESS_LIKE_NAME }}
			</Text>
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
					<Text variant="body" color="primary"> {{ INVALID_ADDRESS }} </Text>
				</Flex>
				<Flex v-else-if="addressExists && addressModel" align="center" gap="6">
					<Icon name="warning" size="12" color="primary" />
					<Text variant="body" color="primary"> {{ ALREADY_EXISTS }} </Text>
				</Flex>
			</Transition>
		</template>
	</AddressInput>
</template>

<style module>
.refusal {
	display: block;
	margin-top: 6px;
}
</style>
