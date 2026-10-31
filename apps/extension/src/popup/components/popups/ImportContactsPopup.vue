<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Utils */
import { ContactServiceClient } from "@/wallet/services/contact/client"
import { trimAddress } from "@/utils/string"
import { addressChangeText, classifyImportRow, indexSavedContacts, planImportWrites } from "@/utils/contact-import-rows"
import { contactListReducers } from "@/utils/entity-list"

/** Components */
import RowTarget from "@/components/ui/RowTarget.vue"

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { usePopupStack } from "@/composables/usePopupStack"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("import_contacts")

const emit = defineEmits(["onClose"])

const props = defineProps({
	show: Boolean,
})

const contacts = ref([])

const contactService = new ContactServiceClient()
const contactList = contactListReducers(contacts)
contactService.onContactAdded.add(contactList.onAdded)
contactService.onContactUpdated.add(contactList.onUpdated)
contactService.onContactDeleted.add(contactList.onDeleted)

const SECTIONS = [
	{ key: "address", label: "Address changes", kinds: ["address-change"], warn: true },
	{ key: "name", label: "Name changes", kinds: ["name-change"], warn: true },
	{ key: "new", label: "New", kinds: ["new"], warn: false },
	{ key: "saved", label: "Already saved", kinds: ["unchanged"], warn: false },
	{ key: "skipped", label: "Can't be imported", kinds: ["invalid", "conflict"], warn: false },
]
const REASONS = { invalid: "Invalid address", conflict: "Matches two saved contacts" }
const REFUSALS = { invalid: "To select, correct the address first", conflict: "This contact matches two saved contacts" }

const uid = useId()
const importContacts = ref([])
/** The saved contacts as they are now: an edited row is judged against them, and so is the banner,
 *  so it never counts a sender the apply step would refuse. Rows already shown keep their decision. */
const savedIndex = computed(() => indexSavedContacts(contacts.value))

/** Section labels and rows in one keyed list: a row an edit moves to another section keeps its
 *  element, so focus can return to its edit button. */
const listItems = computed(() =>
	SECTIONS.flatMap((section) => {
		const rows = importContacts.value.filter((c) => section.kinds.includes(c.kind))
		if (!rows.length) return []
		return [
			{ key: `section-${section.key}`, section, count: rows.length },
			...rows.map((row) => ({ key: `row-${row.idx}`, section, row })),
		]
	}),
)

/** Selected contacts flagged `isSender: true` that confirming would write: the banner states the
 *  registrations the import will attempt, never one the apply step refuses. */
const incomingSenderCount = computed(() => {
	const chosen = importContacts.value.filter((c) => c.selected && c.importable)
	return planImportWrites(chosen, savedIndex.value).admitted.filter((w) => w.row.isSender).length
})

/** The row's accessible name: what the user reads in it, in reading order. */
function rowLabelledby(c) {
	const ids = [`${uid}-${c.idx}-name`, `${uid}-${c.idx}-detail`]
	if (!c.importable) ids.push(`${uid}-${c.idx}-reason`)
	return ids.join(" ")
}

/** Which row an edit button belongs to, since every one is named "Edit contact". */
function editDescribedby(c, section) {
	const ids = [`${uid}-${c.idx}-name`, `${uid}-${section.key}`]
	if (!c.importable) ids.push(`${uid}-${c.idx}-reason`)
	return ids.join(" ")
}

function stageRow(row, idx) {
	const classified = classifyImportRow(row, savedIndex.value)
	const addressText = classified.kind === "address-change" ? addressChangeText(classified.savedAddress, row.address) : null
	return { ...row, idx, ...classified, addressText }
}

function handleSelectContact(contact) {
	if (!contact.importable) {
		openToast({ kind: "error", label: REFUSALS[contact.kind] })

		return
	}

	contact.selected = !contact.selected
}
/** The edit form gets the row and its save as its popup payload, which lives only while the form is
 *  open: a form closed without saving changes nothing. */
function handleEditContact(contact) {
	popupStore.open("edit_contact", {
		contact,
		// An edited row is judged again from scratch: what the edit carried over from the staged row
		// (its kind, its selection) describes the row before the edit.
		onSave: (edited) => {
			importContacts.value[contact.idx] = stageRow(edited, contact.idx)
		},
	})
}
function handleResolve() {
	cacheStore.importPromise?.resolve(importContacts.value.filter((c) => c.selected && c.importable))
	emit("onClose")
}
function handleReject() {
	cacheStore.importPromise?.reject(false)
	emit("onClose")
}

watch(
	() => props.show,
	async () => {
		if (props.show) {
			contacts.value = await contactService.getContacts()
			importContacts.value = cacheStore.importContacts.map((c, idx) => stageRow(c, String(idx)))
		} else {
			cacheStore.importPromise?.reject(false)
			cacheStore.importContacts = []
			// The next file's rows arrive only after its book read, so until then the popup must not
			// show, or confirm, this file's.
			importContacts.value = []

			contactService.disconnect()
		}
	},
)
</script>

<template>
	<Popup :show @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<Flex
				direction="column"
				wide
				:class="$style.wrapper"
			>
				<Flex align="center" direction="column" gap="12" wide :class="$style.section_wrapper">
					<Flex align="center" direction="column" gap="12">
						<Flex direction="column" align="center" gap="12">
							<Text variant="title-page" color="primary">
								Import contacts
							</Text>
						</Flex>

						<Text variant="body" color="body" height="140" align="center">
							Selected contacts are added or updated.
							<Text variant="value" color="primary">Address and name changes</Text>
							start unselected. Contacts that
							<Text variant="value" color="primary">can't be imported</Text>
							are listed last.
						</Text>

						<!-- Active-network banner. Only shown when at least one
						     selected import will trigger registerSender on confirm. -->
						<Text
							v-if="incomingSenderCount > 0 && appStore.network"
							variant="body"
							color="secondary"
							align="center"
							data-testid="import-contacts-senders"
						>
							<Text variant="value" color="primary">{{ incomingSenderCount }}</Text>
							{{ incomingSenderCount === 1 ? "sender" : "senders" }} will be registered on
							<Text variant="value" color="primary">{{ appStore.network.name }}</Text>.
						</Text>
						<Text v-else-if="incomingSenderCount > 0" variant="body" color="secondary" align="center" data-testid="import-contacts-senders">
							No active network. Sender registrations will be skipped.
						</Text>
					</Flex>

					<Flex direction="column" gap="6" wide :class="$style.contacts_section">
						<template v-for="item in listItems" :key="item.key">
							<Flex
								v-if="!item.row"
								:id="`${uid}-${item.section.key}`"
								align="center"
								gap="6"
								:class="$style.section_label"
								data-testid="import-contacts-section"
								:data-section="item.section.key"
							>
								<Icon v-if="item.section.warn" name="warning" size="12" color="orange" aria-hidden="true" />
								<SectionLabel :label="item.section.label" :count="item.count" :countTestid="`import-contacts-${item.section.key}-count`" />
							</Flex>

							<Flex
								v-else
								@click="handleSelectContact(item.row)"
								align="center"
								justify="between"
								gap="10"
								:class="[$style.contact, !item.row.importable && $style.contact_skipped]"
								data-testid="import-contact-row"
								:data-contact-name="item.row.name"
								:data-row-kind="item.row.kind"
								:data-selected="item.row.selected || undefined"
								wide
							>
								<RowTarget
									data-testid="import-contact-target"
									:labelledby="rowLabelledby(item.row)"
									:aria-describedby="`${uid}-${item.section.key}`"
									:aria-pressed="item.row.selected"
									:aria-disabled="!item.row.importable || undefined"
									:tabindex="item.row.importable ? undefined : -1"
								/>

								<Flex align="center" gap="10" wide :class="$style.row_body">
									<Icon
										:name="
											item.row.selected
												? 'square-check'
												: 'square'
										"
										size="16"
										:color="item.row.selected ? 'primary' : 'tertiary'"
									/>

									<Flex direction="column" gap="4" wide :class="$style.row_text">
										<Flex :id="`${uid}-${item.row.idx}-name`" align="center" gap="6" wide>
											<template v-if="item.row.kind === 'name-change'">
												<Text variant="name" color="tertiary" :class="[$style.name_part, $style.name_size]">{{ item.row.savedName }}</Text>
												<span :class="$style.visually_hidden">changes to</span>
												<Icon name="forward" size="12" color="tertiary" aria-hidden="true" :class="$style.arrow" />
												<Text variant="name" color="primary" :class="[$style.name_part, $style.name_size]">{{ item.row.name }}</Text>
											</template>
											<Text v-else variant="name" color="primary" :class="[$style.title, $style.name_size]">
												{{ item.row.name }}
											</Text>
										</Flex>

										<Flex
											:id="`${uid}-${item.row.idx}-detail`"
											:align="item.row.addressText?.full ? 'start' : 'center'"
											gap="6"
											:class="[$style.detail, item.row.addressText?.full && $style.detail_full]"
										>
											<template v-if="item.row.addressText">
												<Text variant="meta" color="tertiary" data-testid="import-contact-address-saved" :class="$style.address_saved">
													{{ item.row.addressText.saved }}
												</Text>
												<span :class="$style.visually_hidden">changes to</span>
												<Icon name="forward" size="12" color="tertiary" aria-hidden="true" :class="$style.arrow" />
												<Text variant="meta" color="primary" data-testid="import-contact-address-incoming" :class="$style.address_incoming">
													{{ item.row.addressText.incoming }}
												</Text>
											</template>
											<Text v-else variant="meta" color="tertiary" data-testid="import-contact-address">{{ trimAddress(item.row.address) }}</Text>
											<Text v-if="item.row.isSender" variant="label-section" color="tertiary" :class="$style.tag">sender</Text>
										</Flex>

										<Text v-if="!item.row.importable" :id="`${uid}-${item.row.idx}-reason`" variant="caption" color="tertiary">
											{{ REASONS[item.row.kind] }}
										</Text>
									</Flex>
								</Flex>

								<RowAction
									label="Edit contact"
									:aria-describedby="editDescribedby(item.row, item.section)"
									data-testid="import-contact-edit"
									@click="handleEditContact(item.row)"
								>
									<Icon name="edit" size="14" color="tertiary" />
								</RowAction>
							</Flex>
						</template>
					</Flex>

					<Flex v-snack-footer align="center" justify="between" gap="12" wide>
						<Button
							@click="handleReject"
							variant="primary_outline"
							size="medium"
							wide
							data-testid="import-contacts-cancel"
						>
							Cancel
						</Button>

						<Button
							@click="handleResolve"
							variant="primary"
							size="medium"
							wide
							data-testid="import-contacts-submit"
						>
							Import selected
						</Button>
					</Flex>
				</Flex>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "@/components/Popup/popup-shared.module.css";
	flex: 1;

	min-height: 0;
}

.section_wrapper {
	flex: 1;

	min-height: 0;
}

.contacts_section {
	flex: 1;

	min-height: 0;

	overflow: auto;
}

.section_label {
	padding: 10px 0 2px 0;

	&:first-child {
		padding-top: 0;
	}
}

.contact {
	composes: select_row from "@/components/Popup/popup-shared.module.css";
	user-select: none;
	position: relative;

	padding: 12px;

	&:has(> [data-row-target]:focus-visible) {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.contact_skipped {
	opacity: 0.5;
}

.row_body {
	min-width: 0;
}

.row_text {
	min-width: 0;
}

.tag {
	padding: 1px 4px;
	border: 1px solid var(--nulo-border);
}

.title {
	min-width: 100%;
	width: 0;

	line-height: 16px !important;

	text-overflow: ellipsis;
	overflow: hidden;
	white-space: nowrap;
}

.name_part {
	flex: 0 1 auto;

	min-width: 0;

	line-height: 16px !important;

	text-overflow: ellipsis;
	overflow: hidden;
	white-space: nowrap;
}

.name_size {
	font-size: 14px;
}

.arrow {
	flex-shrink: 0;
}

/* Below the popup's width a changed address's two shortened forms wrap rather than run past the row,
   each whole. Two classes outrank the global `gap--6`. */
@media (width < 359px) {
	.detail.detail:not(.detail_full) {
		flex-wrap: wrap;
		row-gap: 2px;
	}
}

/* Two full addresses, broken anywhere: the saved one on its own lines, the arrow leading the
   incoming one. */
.detail_full {
	flex-wrap: wrap;

	& .arrow {
		margin-top: 3px;
	}

	& .address_saved,
	& .address_incoming {
		line-height: 1.4 !important;
		word-break: break-all;
	}

	& .address_saved {
		flex-basis: 100%;
	}

	& .address_incoming {
		flex-basis: calc(100% - 18px);
	}
}

.visually_hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}
</style>
