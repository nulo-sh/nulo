<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Utils */
import { isValidAztecAddress } from "@/utils/aztec-address"
import { CONTACT_EXISTS, canonicalContactAddress, sameContactAddress } from "@/utils/contact-rules"
import { isEmptyContactName, sameContactName, sanitizeContactName } from "@/utils/contact-name"
import { contactListReducers } from "@/utils/entity-list"

/** Components */
import ContactFormFields from "@/popup/components/modules/settings/contacts/ContactFormFields.vue"
import ProcessingErrorNote from "@/components/composite/ProcessingErrorNote.vue"

/** Services */
import { ContactServiceClient } from "@/wallet/services/contact/client"

/** Composables */
import { useToast } from "@/composables/toast"
import { useFormState } from "@/composables/useFormState"
import { usePopupEntity } from "@/composables/usePopupEntity"
import { usePopupStack } from "@/composables/usePopupStack"
const { openToast } = useToast()

/** Store */
import { useCacheStore } from "@/stores/cache.store"
const cacheStore = useCacheStore()
const { order, depth } = usePopupStack("edit_contact")

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const contactToEdit = ref(null)
const contacts = ref([])

const contactService = new ContactServiceClient()
const contactList = contactListReducers(contacts)
contactService.onContactAdded.add(contactList.onAdded)
contactService.onContactUpdated.add(onContactUpdated)
contactService.onContactDeleted.add(contactList.onDeleted)

function onContactUpdated(contact) {
	// An outside update to the listed contact being edited (another window, an import) refreshes
	// the draft and the dirty baseline, so a later submit cannot overwrite it with stale fields.
	const listed = contacts.value.some((c) => c.id === contact.id)
	if (listed && cacheStore.contactToEditIdx && contact.id === contactToEdit.value?.id) {
		contactToEdit.value = contact
		nameTerm.value = storedNameOf(contact)
		contactAddressTerm.value = contact.address
		return
	}
	contactList.onUpdated(contact)
}

/** The saved contact this form edits: its own row, or the one an import row would write. Its own
 *  name and address are never duplicates. */
const isEditedContact = (c) => c.id === (contactToEdit.value?.id ?? contactToEdit.value?.targetId)

/** A name saved by older code can hold what is no longer stored; the field shows it as a save would
 *  store it, so an edit never saves a name other than the one on screen. */
const storedNameOf = (contact) => sanitizeContactName(contact?.name ?? "")

/** Name + address managed by useFormState. The "already exist" check
 *  filters out the contact-being-edited so saving with the SAME name/
 *  address it already has doesn't trip the duplicate guard. */
const form = useFormState({
	name: {
		initial: "",
		validate: (v) => {
			if (isEmptyContactName(v)) return null
			// The name as it would be stored: the cut can make a longer draft another contact's name.
			const conflicting = contacts.value.find((c) => sameContactName(c.name, sanitizeContactName(v)) && !isEditedContact(c))
			if (conflicting) return CONTACT_EXISTS
			return null
		},
	},
	address: {
		initial: "",
		validate: (v) => {
			if (!v) return null
			if (!isValidAztecAddress(v)) return "Invalid address"
			// Case-insensitive: hex casing doesn't make a different address.
			const conflicting = contacts.value.find((c) => sameContactAddress(c, v) && !isEditedContact(c))
			if (conflicting) return CONTACT_EXISTS
			return null
		},
	},
})

const nameTerm = form.fields.name.value
const contactAddressTerm = form.fields.address.value

// Per-field dirty: name/address are "edited" if value differs from the
// loaded contact. Used to gate the Update button's "anything changed?"
// check and the "Already exist" warnings, which stay hidden on the
// unchanged row.
const isStartedEditingName = computed(
	() => Boolean(contactToEdit.value) && sanitizeContactName(nameTerm.value ?? "") !== storedNameOf(contactToEdit.value),
)
const isStartedEditingAddress = computed(() => Boolean(contactToEdit.value) && contactAddressTerm.value !== contactToEdit.value?.address)
const isStartedEditing = computed(() => isStartedEditingName.value || isStartedEditingAddress.value)

// Either field's duplicate blocks the save, so once anything is edited both warnings show: an
// unchanged name can clash with a stored spaced twin, an unchanged address with a mixed-case copy.
const isAlreadyExistName = computed(() => form.fields.name.error.value === CONTACT_EXISTS && isStartedEditing.value)
const isAlreadyExistAddress = computed(() => form.fields.address.error.value === CONTACT_EXISTS && isStartedEditing.value)
const isValidAddress = computed(() => isValidAztecAddress(contactAddressTerm.value))
const isAvailableToUpdateContact = computed(() => {
	// Full-lifetime submit latch: a running save closes the form on EVERY
	// route (button, Enter, future callers) — not just the pointer path.
	if (isLoading.value) return false
	if (isEmptyContactName(nameTerm.value ?? "")) return false
	if (!isValidAddress.value) return false
	if (form.fields.name.error.value) return false
	if (form.fields.address.error.value) return false
	return true
})

const isLoading = ref(false)
const processingError = ref({
	show: false,
	title: "",
	tooltip: "",
})

function handleFillFieldsWithDefaultValues() {
	nameTerm.value = storedNameOf(contactToEdit.value)
	contactAddressTerm.value = contactToEdit.value?.address ?? ""
}

const handleUpdateContact = async () => {
	if (!isAvailableToUpdateContact.value) return
	// Mirror the submit button's dirty gate: the Enter-key path calls this
	// directly, and a clean submit would otherwise fire a no-op update with
	// a misleading "updated" toast. (Import staging is exempt — its dirty
	// state lives in the staging row, not this form.)
	if (!cacheStore.importContact && !isStartedEditing.value) return

	isLoading.value = true
	try {
		if (cacheStore.importContact) {
			cacheStore.importContact = {
				...contactToEdit.value,
				// Staged as the import would store it, so the row shows the name it writes.
				name: sanitizeContactName(nameTerm.value),
				// Same canonical-lowercase rule as the direct-save path below —
				// staged rows feed addContact/addSender downstream.
				address: canonicalContactAddress(contactAddressTerm.value),
				updated: true,
			}
			emit("onClose")
		} else {
			// Canonical lowercase on save (matches NewContactPopup + wallet-wide hex convention).
			await contactService.updateContact(
				contactToEdit.value.id,
				nameTerm.value.trim(),
				canonicalContactAddress(contactAddressTerm.value),
			)

			emit("onClose")
			openToast({ kind: "success", label: "Contact is updated" })
		}
	} catch (err) {
		processingError.value = {
			show: true,
			title: "Failed to update contact.",
			tooltip: err,
		}

		openToast({ kind: "error", label: "Something went wrong" })
	} finally {
		isLoading.value = false
	}
}

usePopupEntity(
	() => props.show,
	{
		submit: handleUpdateContact,
		onShow: async () => {
			contacts.value = await contactService.getContacts()
			contactToEdit.value = cacheStore.importContact
				? cacheStore.importContact
				: contacts.value.find((c) => c.id === cacheStore.contactToEditIdx)
			nameTerm.value = storedNameOf(contactToEdit.value)
			contactAddressTerm.value = contactToEdit.value?.address ?? ""
		},
		onHide: () => {
			cacheStore.contactToEditIdx = ""

			contactService.disconnect()

			contactToEdit.value = null
			contacts.value = []

			form.reset()
		},
	},
	// The edit target (import mode included) arrives with the await above — a
	// premature first submit must stay inert, exactly as when the hand-rolled
	// watcher installed its listener only after it.
	{ submitWaitsForShow: true },
)

watch(
	() => [nameTerm.value, contactAddressTerm.value],
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
		title="Edit contact"
		submitLabel="Update contact"
		:submitDisabled="
			!isAvailableToUpdateContact ||
			processingError.show ||
			!isStartedEditing
		"
		:submitLoading="isLoading"
		submitTestId="edit-contact-submit"
		@submit="handleUpdateContact"
	>
		<ContactFormFields
			v-model:name="nameTerm"
			v-model:address="contactAddressTerm"
			:nameExists="isAlreadyExistName"
			:addressValid="isValidAddress"
			:addressExists="isAlreadyExistAddress"
		/>

		<template #aboveSubmit>
			<ProcessingErrorNote
				:show="processingError.show"
				:title="processingError.title"
				:tooltip="processingError.tooltip"
			/>
		</template>

		<template #belowSubmit>
			<Button @click="handleFillFieldsWithDefaultValues" wide variant="primary_outline" size="medium">
				Reset changes
			</Button>
		</template>
	</FormPopup>
</template>

