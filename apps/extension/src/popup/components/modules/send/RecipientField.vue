<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/**
 * Recipient address input + autocomplete suggestion popover used by
 * `pages/send.vue`. The parent owns the contact + account lists and
 * passes them as `candidates`; this component handles the substring
 * filter, the focus / blur lifecycle (so the popover closes after a
 * short delay to allow the click), and the per-state right-icon.
 *
 * v-models:
 * - `searchTerm` — what the user typed (the address-like text in the
 *   field)
 * - `selectedContact` — the candidate object once they pick one
 *
 * A mouse or pen press that takes the focus from the field holds the typed view (and the
 * suggestions) until the press ends: the card is taller than the field, so swapping at the blur
 * would move whatever the press is on before its click lands.
 */
import { isComposing } from "@/composables/usePopupEntity"
import { stripBidiAndZeroWidth, trimAddress } from "@/utils/string"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { matchRecipients } from "./recipient-search"

const props = defineProps({
	candidates: { type: Array, default: () => [] },
})

const searchTerm = defineModel("searchTerm", { type: String, default: "" })
const selectedContact = defineModel("selectedContact", { default: null })

const isSearchInputFocused = ref(false)
const justCleared = ref(false)
/** Escape closed the suggestions; the next input or focus opens them again. */
const dismissed = ref(false)
/** The suggestion Down and Up moved to, or null: none until an arrow is pressed. Held by identity,
 *  so a row that loads in ahead of it does not move the highlight onto another destination. */
const activeRow = shallowRef(null)
const listId = useId()
const labelId = `${listId}-label`
const optionId = (i) => `${listId}-${i}`
const fieldEl = useTemplateRef("fieldEl")
const cardEl = useTemplateRef("cardEl")
/** The field shows the typed text while the press that blurred it is still down. */
const holdView = ref(false)
/** The `pointerId` of the primary mouse or pen press now down, or null. */
let pressId = null
let closeTimer
let releaseTimer
/** A list change, not the person's typing, took the highlight: Enter must not fall back to another row. */
let highlightTaken = false

const filteredContacts = computed(() => matchRecipients(props.candidates, searchTerm.value))
/** Every drawn row renders again on each keystroke, so a long list draws this many and counts the rest.
 *  Arrows, Enter and a click reach only the drawn rows. */
const MAX_SHOWN = 50
const shownContacts = computed(() => filteredContacts.value.slice(0, MAX_SHOWN))
const moreCount = computed(() => filteredContacts.value.length - shownContacts.value.length)
const moreSentence = computed(() => {
	const n = moreCount.value
	return `Keep typing to narrow ${n.toLocaleString("en-US")} more ${n === 1 ? "match" : "matches"}.`
})

const showSuggestions = computed(() => Boolean(filteredContacts.value?.length && isSearchInputFocused.value && !dismissed.value))
const activeIndex = computed(() => (showSuggestions.value ? shownContacts.value.indexOf(activeRow.value) : -1))
const activeId = computed(() => (activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined))
/** Keyed by candidate and address, so a row a held press is on is never rebound to another destination. */
const rowKey = (c) => (c.id === undefined ? `account:${c.address}` : `contact:${c.id}:${c.address}`)
const showInvalidHint = computed(() => !isSearchInputFocused.value && !isValidAztecAddress(searchTerm.value) && searchTerm.value.length > 0)

const handleSelectContact = (contact) => {
	selectedContact.value = contact
	searchTerm.value = contact.address
}

const handleChange = () => {
	selectedContact.value = null
	searchTerm.value = ""
	justCleared.value = true
	isSearchInputFocused.value = true
}

const handleSearchBlur = () => {
	if (searchTerm.value !== selectedContact.value?.address) {
		const contact = props.candidates.find((c) => c.address === searchTerm.value)
		if (contact) handleSelectContact(contact)
	}
	clearTimeout(closeTimer)
	if (pressId !== null) {
		clearTimeout(releaseTimer)
		holdView.value = true
		return
	}
	closeTimer = setTimeout(() => {
		isSearchInputFocused.value = false
	}, 250)
}

const handleSearchFocus = () => {
	clearTimeout(closeTimer)
	dismissed.value = false
	if (holdView.value) {
		clearTimeout(releaseTimer)
		holdView.value = false
		selectedContact.value = null
	}
	isSearchInputFocused.value = true
}

const endHold = () => {
	clearTimeout(releaseTimer)
	holdView.value = false
	isSearchInputFocused.value = false
}

const onPointerDown = (e) => {
	if (!e.isPrimary || e.button !== 0 || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return
	// The press holding the field stays the one whose release ends the hold.
	if (holdView.value && pressId !== null) return
	pressId = e.pointerId
	// A press that starts before the last one's release ran keeps the field held through itself.
	clearTimeout(releaseTimer)
}

const onPointerUp = (e) => {
	if (e.pointerId !== pressId) return
	pressId = null
	if (!holdView.value) return
	// A browser dispatches a press's pointerup, mouseup and click in one task: the click lands first.
	releaseTimer = setTimeout(endHold, 0)
}

// A native click runs the microtasks between its listeners, so the card renders before the click
// reaches its target: a menu that measures its trigger on that click sees where the trigger now is.
const onClickCapture = (e) => {
	if (!holdView.value || pressId !== null || fieldEl.value?.contains(e.target)) return
	endHold()
}

const onPointerCancel = (e) => {
	if (e.pointerId !== pressId) return
	pressId = null
	if (holdView.value) endHold()
}

const onWindowBlur = () => {
	pressId = null
	if (holdView.value) endHold()
}

watch(
	() => searchTerm.value,
	(val) => {
		dismissed.value = false
		if (selectedContact.value && val !== selectedContact.value.address) {
			selectedContact.value = null
		}
	},
)

watch([shownContacts, showSuggestions, searchTerm], ([, open, term], [, , prevTerm]) => {
	const taken = activeRow.value !== null && activeIndex.value < 0
	if (taken) activeRow.value = null
	highlightTaken = open && term === prevTerm && (taken || highlightTaken)
})

const ARROW_STEPS = { ArrowDown: 1, ArrowUp: -1 }

const moveHighlight = (e, step) => {
	e.preventDefault()
	const rows = shownContacts.value
	const at = activeIndex.value
	const next = at < 0 && step < 0 ? rows.length - 1 : (at + step + rows.length) % rows.length
	activeRow.value = rows[next]
	highlightTaken = false
	document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" })
}

// With no row highlighted, Enter keeps its typed-name shortcut, the first suggestion, unless a list
// change took the highlight.
const pickHighlighted = (e) => {
	if (e.repeat) return
	e.preventDefault()
	if (highlightTaken) return
	handleSelectContact(shownContacts.value[Math.max(activeIndex.value, 0)])
	e.target.blur()
	// The card replaces the field, which would leave the keyboard on the page's body.
	nextTick(() => cardEl.value?.focusChange())
}

// Marked handled: Chrome closes the toolbar popup on an Escape the page leaves unhandled.
const dismiss = (e) => {
	e.preventDefault()
	dismissed.value = true
}

// Only the field's own input may pick: the suggestions outlive its blur, and an Enter meant for
// another control must never set where the money goes.
const onKeydown = (e) => {
	if (e.defaultPrevented || isComposing(e) || !showSuggestions.value) return
	if (!(e.target instanceof HTMLInputElement) || !fieldEl.value?.contains(e.target)) return
	if (e.key in ARROW_STEPS) moveHighlight(e, ARROW_STEPS[e.key])
	else if (e.key === "Enter") pickHighlighted(e)
	else if (e.key === "Escape") dismiss(e)
}

onMounted(() => {
	document.addEventListener("keydown", onKeydown)
	// Capture: the press must be recorded before its mousedown moves the focus and blurs the field.
	document.addEventListener("pointerdown", onPointerDown, true)
	document.addEventListener("pointerup", onPointerUp, true)
	document.addEventListener("pointercancel", onPointerCancel, true)
	document.addEventListener("click", onClickCapture, true)
	window.addEventListener("blur", onWindowBlur)
})

onBeforeUnmount(() => {
	document.removeEventListener("keydown", onKeydown)
	document.removeEventListener("pointerdown", onPointerDown, true)
	document.removeEventListener("pointerup", onPointerUp, true)
	document.removeEventListener("pointercancel", onPointerCancel, true)
	document.removeEventListener("click", onClickCapture, true)
	window.removeEventListener("blur", onWindowBlur)
	clearTimeout(closeTimer)
	clearTimeout(releaseTimer)
})
</script>

<template>
	<div :class="$style.recipient_section">
		<Flex align="center" justify="between">
			<span :id="labelId" :class="$style.section_label">Recipient Address</span>
			<Transition name="fade">
				<Flex v-if="showInvalidHint" align="center" gap="6" data-testid="recipient-invalid-hint">
					<Icon name="warning" size="12" color="red" />
					<Text variant="body" color="primary">Invalid address</Text>
				</Flex>
			</Transition>
		</Flex>
		<div ref="fieldEl" data-testid="send-destination-field" :class="$style.recipient_wrap">
			<RecipientCard
				v-if="selectedContact && !holdView"
				ref="cardEl"
				:name="selectedContact.name"
				:address="selectedContact.address"
				@change="handleChange"
			/>

			<template v-else>
				<AddressInput
					v-model="searchTerm"
					:normalize="stripBidiAndZeroWidth"
					:autofocus="justCleared"
					role="combobox"
					:ariaLabelledby="labelId"
					:ariaExpanded="showSuggestions"
					ariaAutocomplete="list"
					:ariaActivedescendant="activeId"
					:ariaControls="showSuggestions ? listId : undefined"
					@focus="handleSearchFocus"
					@blur="handleSearchBlur()"
					placeholder="0x... or contact name"
				/>

				<Transition name="fade">
					<div v-if="showSuggestions" :class="$style.popover" data-testid="send-destination-popover">
						<!-- A list that scrolls is a Tab stop unless it opts out; the field keeps the keyboard. -->
						<Flex
							align="center"
							direction="column"
							wide
							:class="$style.contacts_wrapper"
							:id="listId"
							role="listbox"
							tabindex="-1"
							:aria-labelledby="labelId"
							data-testid="send-destination-suggestions"
						>
							<Flex
								v-for="(c, i) in shownContacts"
								:key="rowKey(c)"
								@click="handleSelectContact(c)"
								align="center"
								gap="10"
								:class="[$style.contact, i === activeIndex && $style.active]"
								wide
								:id="optionId(i)"
								role="option"
								:aria-selected="i === activeIndex"
							>
								<AccountAvatar :name="c.name" :address="c.address" :size="28" aria-hidden="true" />

								<Flex direction="column" gap="4" wide>
									<Text variant="name" color="primary" :class="[$style.title, $style.name_size]">{{ c.name }}</Text>
									<Text variant="meta" color="tertiary" data-testid="recipient-suggestion-address" :class="$style.description">
										{{ trimAddress(c.address) }}
									</Text>
								</Flex>
							</Flex>
						</Flex>
						<Text v-if="moreCount" variant="caption" color="tertiary" aria-hidden="true" :class="$style.more" data-testid="send-destination-more">
							{{ moreSentence }}
						</Text>
					</div>
				</Transition>
			</template>

			<!-- Mounted with the field: a region created with its text in place may go unannounced. -->
			<span role="status" aria-live="polite" aria-atomic="true" :class="$style.visually_hidden" data-testid="send-destination-more-live">
				{{ showSuggestions && moreCount ? moreSentence : "" }}
			</span>
		</div>
	</div>
</template>

<style module>
.recipient_section {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-top: 8px;
}

.section_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.recipient_wrap {
	position: relative;
}

.recipient_wrap :global(input::placeholder) {
	color: var(--txt-tertiary);
}

.popover {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	z-index: 999;

	border: 2px solid var(--nulo-outline);
	background: var(--app-bg);
}

.more {
	display: block;
	padding: 8px 14px;
	border-top: 1px solid var(--nulo-outline);
}

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}

.contacts_wrapper {
	max-height: 156px;

	overflow-y: auto;

	.contact {
		cursor: pointer;

		padding: 10px 14px;
		transition: all 0.2s var(--bezier);

		&:hover,
		&.active {
			background: var(--nulo-surface-low);
		}

		&:active {
			background: var(--nulo-surface-high);
		}

		.title {
			min-width: 100%;
			width: 0;

			line-height: 16px !important;

			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		}

		.description {
			min-width: 100%;
			width: 0;

			line-height: 14px !important;

			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		}
	}
}

.name_size {
	font-size: 14px;
}
</style>
