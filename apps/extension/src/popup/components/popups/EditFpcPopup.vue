<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import { FieldWarning } from "@nulo/design"
import { sameFieldAddress } from "@nulo/wallet-bridge"
/** Services */
import { FpcServiceClient, FpcType } from "@/wallet/services/fpc/client"

/** Utils */
import { sameStoredName } from "@/utils/account-name"
import { copyWithToast } from "@/utils/clipboard"
import { isValidHex } from "@/utils/string"

/** Composables */
import { useToast } from "@/composables/toast"
import { useFormState } from "@/composables/useFormState"
import { usePopupEntity } from "@/composables/usePopupEntity"
import { usePopupStack } from "@/composables/usePopupStack"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
const appStore = useAppStore()
const { order, depth } = usePopupStack("edit_fpc")
const cacheStore = useCacheStore()

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

let fpcService = null
const fpcs = ref([])
const fpcToEdit = ref(null)

const form = useFormState({
	name: {
		initial: "",
		validate: (v) => {
			if (!v?.length) return null
			const conflicting = fpcs.value.find((f) => sameStoredName(f.name, v) && f.id !== fpcToEdit.value?.id)
			if (conflicting) return "Already exist"
			return null
		},
	},
	address: {
		initial: "",
		validate: (v) => {
			if (!v) return null
			if (!isValidHex(v)) return "Invalid address"
			if (fpcs.value.some((f) => f.id !== fpcToEdit.value?.id && sameFieldAddress(v, f.address ?? ""))) return "Already added"
			return null
		},
	},
})

const nameTerm = form.fields.name.value
const addressTerm = form.fields.address.value

const isProtocol = computed(() => !!fpcToEdit.value?.isProtocol)
/** PrivateFPC validation can't tolerate arbitrary addresses (custom-salt
 * instances aren't publicly deployed and the wallet bundles a single
 * artifact version). Locking address-edit on PrivateFPC is honest UX,
 * and the manage-page also hides the edit affordance — this is the
 * defensive backstop in case the dialog ever opens for one. */
const isPrivateFpc = computed(() => fpcToEdit.value?.type === FpcType.PrivateFpc)

/** Reuses the per-type description from the manage-FPCs list so the
 * Edit dialog stays semantically consistent with the row the user
 * clicked. The disabled name input on protocol rows is the lock signal,
 * no extra copy needed. */
const typeDescription = computed(() => {
	if (fpcToEdit.value?.type === FpcType.PrivateFpc) return "Pays fees from your private Fee Juice"
	if (fpcToEdit.value?.type === FpcType.DefaultSponsoredFpc) return "Fees covered by sponsor"
	return ""
})

const nameChanged = computed(() => Boolean(fpcToEdit.value) && nameTerm.value !== (fpcToEdit.value?.name ?? ""))
// The row's own address in another letter case is the same contract, so it is no change: the
// service matches Nulo's sponsor by exact spelling, and a re-cased row would stop being it.
const addressChanged = computed(() => {
	if (!fpcToEdit.value) return false
	const own = fpcToEdit.value.address ?? ""
	return addressTerm.value !== own && !sameFieldAddress(addressTerm.value, own)
})
const hasChanges = computed(() => nameChanged.value || addressChanged.value)

const isAlreadyExist = computed(() => form.fields.name.error.value === "Already exist" && nameChanged.value)
// Only an edited address is checked, so a row that already shares its address can still be renamed.
const isAddressStored = computed(() => form.fields.address.error.value === "Already added" && addressChanged.value)
const isAddressValid = computed(() => isValidHex(addressTerm.value))
const isAvailableToUpdateFpc = computed(() => {
	// Full-lifetime submit latch: a running save closes the form on EVERY
	// route (button, Enter, future callers) — not just the pointer path.
	if (isFpcUpdateInProgress.value) return false
	if (!hasChanges.value) return false
	// Name is locked on protocol rows; if it differs, that's an invalid edit.
	if (isProtocol.value && nameChanged.value) return false
	// Address is locked on PrivateFPC, period.
	if (isPrivateFpc.value && addressChanged.value) return false
	if (nameChanged.value) {
		if (!nameTerm.value?.length) return false
		if (form.fields.name.error.value) return false
	}
	if (addressChanged.value) {
		if (!isAddressValid.value || form.fields.address.error.value) return false
	}
	return true
})

const handleFillFieldsWithDefaultValues = () => {
	nameTerm.value = fpcToEdit.value?.name ?? ""
	addressTerm.value = fpcToEdit.value?.address ?? ""
	processingError.value.show = false
}

const isFpcUpdateInProgress = ref(false)
const processingError = ref({ show: false, title: "", tooltip: "" })

const handleUpdateFpc = async () => {
	if (!isAvailableToUpdateFpc.value) return

	isFpcUpdateInProgress.value = true
	processingError.value.show = false
	// The name as the person left it at the press: a rename from another window during the address
	// check updates the row this compares against, and must not read as this save's rename.
	const rename = nameChanged.value ? nameTerm.value : undefined
	try {
		// Address change first. It goes to PXE for validation; if it
		// rejects, we abort before persisting any name change.
		if (addressChanged.value) {
			await fpcService.updateFpcAddress(cacheStore.fpcToEditIdx, addressTerm.value)
		}
		if (rename !== undefined) {
			await fpcService.updateFpc(cacheStore.fpcToEditIdx, rename)
		}
		emit("onClose")
		openToast({ kind: "success", label: "FPC is updated" })
	} catch (err) {
		const msg = errorMessageFromUnknown(err)
		processingError.value = {
			show: true,
			title: msg,
			tooltip: "",
		}
	} finally {
		isFpcUpdateInProgress.value = false
	}
}
const onFpcAdded = (fpc) => {
	fpcs.value.push(fpc)
}
const onFpcUpdated = (fpc) => {
	const idx = fpcs.value.findIndex((f) => f.id === fpc.id)
	if (idx !== -1) fpcs.value[idx] = fpc
	if (fpcToEdit.value?.id === fpc.id) {
		fpcToEdit.value = fpc
	}
}
const onFpcDeleted = (fpc) => {
	if (fpc.id === fpcToEdit.value?.id) {
		emit("onClose")
		openToast({ kind: "success", label: "FPC was deleted" })
		return
	}
	fpcs.value = fpcs.value.filter((f) => f.id !== fpc.id)
}
const handleCopyAddress = () => {
	void copyWithToast(fpcToEdit.value.address, openToast, "FPC's address is copied")
}

usePopupEntity(
	() => props.show,
	{
		submit: handleUpdateFpc,
		onShow: async () => {
			fpcService = new FpcServiceClient()
			fpcService.onFpcAdded.add(onFpcAdded)
			fpcService.onFpcDeleted.add(onFpcDeleted)
			fpcService.onFpcUpdated.add(onFpcUpdated)
			fpcToEdit.value = await fpcService.getFpc(cacheStore.fpcToEditIdx)
			if (!fpcToEdit.value) {
				emit("onClose")
				return
			}
			nameTerm.value = fpcToEdit.value.name ?? ""
			addressTerm.value = fpcToEdit.value.address ?? ""
			fpcs.value = await fpcService.getFpcs(appStore.network.chainId)
		},
		onHide: () => {
			fpcService.disconnect()
			fpcService = null
			fpcToEdit.value = null
			fpcs.value = []
			form.reset()
			processingError.value = { show: false, title: "", tooltip: "" }
		},
	},
	// The edit target and the collision list arrive with the awaits above — a
	// premature first submit must stay inert, exactly as when the hand-rolled
	// watcher installed its listener only after them.
	{ submitWaitsForShow: true },
)

watch(
	() => addressTerm.value,
	() => {
		processingError.value.show = false
	},
)
</script>

<template>
	<FormPopup
		:show="show"
		@onClose="emit('onClose')"
		:displaceIdx="order"
		:depth="depth"
		title="Edit FPC"
		submitLabel="Update"
		:submitDisabled="!isAvailableToUpdateFpc || processingError.show"
		:submitLoading="isFpcUpdateInProgress"
		submitTestId="edit-fpc-submit"
		@submit="handleUpdateFpc"
	>
		<ItemsContainer>
			<SettingItem
				data-testid="edit-fpc-header-row"
				size="large"
				:title="fpcToEdit?.name || fpcToEdit?.address"
				:titleVariant="fpcToEdit?.name ? 'row-title' : 'meta'"
				:description="typeDescription"
				icon="fee"
				raw
			>
				<template #right>
					<Flex align="center" gap="8">
						<Tooltip position="end" delay="350">
							<Icon
								@click.stop="handleCopyAddress"
								name="copy"
								size="14"
								color="tertiary"
								hoverColor="primary"
								:class="$style.icon_btn"
							/>

							<template #content>Copy FPC's address</template>
						</Tooltip>
					</Flex>
				</template>
			</SettingItem>
		</ItemsContainer>

		<Input
			label="Name"
			placeholder="My FPC"
			v-model="nameTerm"
			autofocus
			sanitize
			:maxLength="25"
			:disabled="isProtocol"
			data-testid="fpc-name-input"
		>
			<template v-if="isAlreadyExist" #right>
				<FieldWarning> Already exist </FieldWarning>
			</template>
		</Input>

		<Input
			label="Address"
			placeholder="0x..."
			v-model="addressTerm"
			sanitize
			:disabled="isPrivateFpc"
			data-testid="edit-fpc-address-input"
			textVariant="input-data"
		>
			<template #right>
				<Transition name="fade">
					<FieldWarning v-if="!isAddressValid && addressTerm"> Invalid address </FieldWarning>
					<FieldWarning v-else-if="isAddressStored"> Already added </FieldWarning>
				</Transition>
			</template>
		</Input>

		<template #aboveSubmit>
			<ProcessingErrorNote :show="processingError.show" :title="processingError.title" :tooltip="processingError.tooltip" color="red" />
		</template>

		<template #belowSubmit>
			<Button @click="handleFillFieldsWithDefaultValues" wide variant="primary_outline" size="medium">
				Reset changes
			</Button>
		</template>
	</FormPopup>
</template>

<style module>
.icon_btn {
	cursor: pointer;

	transition: all 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}

	&.disabled {
		pointer-events: none;
		opacity: 0.3;
	}
}
</style>
