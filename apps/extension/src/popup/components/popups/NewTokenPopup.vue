<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Services */
import { TaskServiceClient } from "@/wallet/services/task/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Utils */
import { ALREADY_EXISTS, INVALID_ADDRESS } from "@/utils/entity-rules"

/** Composables */
import { useFormState } from "@/composables/useFormState"
import { usePopupEntity } from "@/composables/usePopupEntity"
import { usePopupStack } from "@/composables/usePopupStack"
import { contractVerdict, useTokenImport } from "@/composables/useTokenImport"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("new_token")

const props = defineProps({
	show: Boolean,
})

const emit = defineEmits(["onClose"])

const tokenService = new TokenServiceClient()
const tokenBalanceService = new TokenBalanceServiceClient()
const taskService = new TaskServiceClient()
const importer = useTokenImport({ tokenService, tokenBalanceService, taskService })

const tokens = ref([])

const form = useFormState({
	contract: {
		initial: "",
		validate: (v) => contractVerdict(v, tokens.value),
	},
})

const contractTerm = form.fields.contract.value

const isAlreadyExist = computed(() => form.fields.contract.error.value === ALREADY_EXISTS)
const isInvalidAddress = computed(() => form.fields.contract.error.value === INVALID_ADDRESS)
const isAvailableToCreateToken = computed(() => {
	if (!contractTerm.value?.length) return false
	if (form.fields.contract.error.value) return false
	// Belt + suspenders for the network-switch race: keep the submit button
	// disabled until we have a real (profile, network, account) tuple. The
	// import also re-checks; this gate keeps the UI honest.
	if (!appStore.profile || !appStore.network || !appStore.account?.address) return false
	return true
})

// 'idle' → 'adding' (parsing + addToken in flight)
//        → 'loading-balance' (waiting for the active account's first projector run)
const phase = importer.phase
const error = ref()

const isBusy = computed(() => phase.value !== "idle")

const submitLabel = computed(() => {
	if (phase.value === "adding") return "Adding token…"
	if (phase.value === "loading-balance") return "Loading balance…"
	return "Import new token"
})

/** The opener's `{ address, onAdded }`, kept on show: closing a popup deletes its payload. */
let request

const handleAddToken = async () => {
	if (!isAvailableToCreateToken.value || phase.value !== "idle") return
	error.value = null
	// `EventHandler.add` does not open the port: without it this client never receives the events the
	// balance wait listens for.
	void taskService.connect()
	const outcome = await importer.importToken(contractTerm.value)
	if (outcome.kind === "refused") {
		error.value = outcome.message
	} else if (outcome.kind === "added") {
		const onAdded = request?.onAdded
		emit("onClose")
		if (outcome.inScope) onAdded?.(outcome.token)
	}
}

// A refusal judged the address it was given, so a new address ends it.
watch(contractTerm, () => {
	error.value = null
})

usePopupEntity(
	() => props.show,
	{
		submit: handleAddToken,
		onShow: async () => {
			// Cleared again on open: a disconnect rejection can repopulate the error after hide reset it.
			error.value = null
			request = popupStore.getPayload("new_token")
			tokens.value = await tokenService.getTokens(appStore.profile.id, appStore.network.chainId)
			if (request?.address) contractTerm.value = request.address
		},
		onHide: () => {
			request = undefined
			importer.abort()
			form.reset()
			error.value = null
			taskService.disconnect()
			tokenBalanceService.disconnect()
			tokenService.disconnect()
		},
	},
	{ submitWaitsForShow: true },
)

onBeforeUnmount(() => importer.dispose())
</script>

<template>
	<FormPopup
		:show="show"
		@onClose="emit('onClose')"
		:displaceIdx="order"
		:depth="depth"
		title="New token"
		:submitLabel="submitLabel"
		:submitDisabled="!isAvailableToCreateToken"
		:submitLoading="isBusy"
		submitTestId="import-token-button"
		@submit="handleAddToken"
	>
		<Input
			v-model="contractTerm"
			label="Contract address"
			placeholder="0x"
			data-testid="token-address-input"
			inputTestid="token-address-field"
			textVariant="input-data"
			autofocus
			sanitize
			:disabled="isBusy"
		>
			<template #suffix>
				<Icon v-if="isAvailableToCreateToken && !error" name="square-check" size="14" color="green" />
			</template>
			<template #right>
				<Transition name="fade">
					<Flex v-if="isAlreadyExist" align="center" gap="4" role="alert" data-testid="error-text">
						<Icon name="warning" size="12" color="orange" />
						<Text variant="body" color="primary"> {{ ALREADY_EXISTS }} </Text>
					</Flex>
					<Flex v-else-if="isInvalidAddress" align="center" gap="4" role="alert" data-testid="error-text">
						<Icon name="square-cross" size="12" color="red" />
						<Text variant="body" color="primary"> {{ INVALID_ADDRESS }} </Text>
					</Flex>
				</Transition>
			</template>
		</Input>

		<template v-if="error" #belowSubmit>
			<Flex align="center" gap="6" :class="$style.error_row" data-testid="new-token-error">
				<Icon name="info" size="12" color="red" />
				<Text variant="body" color="secondary" :style="{ lineHeight: '1.4' }">
					{{ error }}
				</Text>
			</Flex>
		</template>
	</FormPopup>
</template>

<style module>
.error_row {
	padding: 8px 20px 0;
}
</style>
