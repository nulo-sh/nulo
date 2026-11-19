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
import RowTarget from "@/components/ui/RowTarget.vue"
import ContractChip from "@/components/composite/ContractChip.vue"

/** Utils */
import { NoteServiceClient } from "@/wallet/services/note/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { contractChipOf } from "@/components/composite/contract-chip"
import { readContract } from "@/utils/contract-level"
import { stringCompare, stripBidiAndZeroWidth, trimAddress } from "@/utils/string"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"

/** Brutalist grayscale palette for the per-contract left-border accent.
 *  Replaces the colored 10-shade palette (`getColorFromAddress`) so the
 *  contract-grouping affordance survives without breaking the brutalist
 *  rule of "no decorative color." Five tonal steps span near-black →
 *  off-white. The contract address is the only chip surface; this band
 *  is purely a "rows from same contract share a stripe" visual hint. */
const NOTE_BORDER_SHADES = [
	"var(--nulo-border)",
	"var(--nulo-outline)",
	"var(--nulo-surface-highest)",
	"var(--nulo-secondary)",
	"var(--txt-primary)",
]
function noteBorderColor(address) {
	if (!address) return NOTE_BORDER_SHADES[0]
	const clean = address.startsWith("0x") ? address.slice(2) : address
	let hash = 0
	for (let i = 0; i < clean.length; i++) {
		hash = (hash + clean.charCodeAt(i)) % 2147483647
	}
	return NOTE_BORDER_SHADES[hash % NOTE_BORDER_SHADES.length]
}

/** Composables */
import { useToast } from "@/composables/toast.js"
import { useTokenFlags } from "@/composables/usePrices"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { useCacheStore } from "@/stores/cache.store"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
const appStore = useAppStore()
const popupStore = usePopupStore()
const cacheStore = useCacheStore()

const notes = ref([])
const noteService = new NoteServiceClient()
/** The list's network-free read: this page never asks for a price fetch. */
const priceService = new PriceServiceClient()
const marks = useTokenFlags(priceService)
const isFetchingNotes = ref(false)

const error = ref()
const isErrorOccurred = computed(() => !!error.value)

const searchTerm = ref("")

/**
 * Flat per-note snapshots for the template. Every helper runs here, per note, so a note a helper
 * cannot read becomes a fallback card with `renderError` instead of breaking the list; a child
 * component's own render error is not caught here.
 */
const displayNotes = computed(() => {
	const items = []
	for (const note of notes.value ?? []) {
		try {
			items.push(buildDisplayNote(note))
		} catch (err) {
			const message = errorMessageFromUnknown(err)
			console.warn("[notes] failed to build display row:", { error: err }, note)
			items.push({
				key: `err-${items.length}`,
				type: "Note (failed to render)",
				contractTrim: "",
				borderColor: "",
				location: "",
				kvEntries: [],
				rawLines: [],
				renderError: message,
				_raw: note,
			})
		}
	}
	return items
})

const filteredDisplayNotes = computed(() => {
	const term = searchTerm.value.trim().toLowerCase()
	if (!term) return displayNotes.value

	return displayNotes.value.filter((d) => {
		// What the card shows: the chip's label where it has one, and never a name the header hides.
		const haystack = [
			(d.chip?.label ?? d.contractTrim ?? "").toLowerCase(),
			(d.type || "custom note").toLowerCase(),
			(d.contractName || "").toLowerCase(),
			(d.location || "").toLowerCase(),
		]
		return haystack.some((h) => h.includes(term))
	})
})

const fetchNotes = async (isRefetching) => {
	if (isRefetching) openToast({ kind: "success", label: "Fetching notes again" })
	isFetchingNotes.value = true
	error.value = undefined

	try {
		const result = await noteService.getNotes(appStore.network.id, appStore.account.address)
		// Stable sort by contract then by location so the same notes land in
		// the same order each refetch.
		result.sort((a, b) => {
			const contractCompare = stringCompare(a.contract ?? "", b.contract ?? "")
			return contractCompare ? contractCompare : stringCompare(a.location ?? "", b.location ?? "")
		})
		notes.value = result
	} catch (err) {
		error.value = err
		notes.value = []
	} finally {
		isFetchingNotes.value = false
	}
}

/** Compute a flat display snapshot from a single Note. Throws on internal
 *  failure; the caller wraps in try/catch and falls back to an error card. */
function buildDisplayNote(note) {
	const contract = String(note.contract ?? "")
	const showingContent = parseNoteContent(note)
	const kvEntries = showingContent ? Object.entries(showingContent).map(([k, v]) => ({ key: k, value: v, isLongHex: isLongHex(v) })) : []

	return {
		key: `${contract || "?"}:${note.storageSlot ?? "?"}:${note.txHash ?? "?"}`,
		type: note.type ?? "Custom Note",
		contractTrim: trimAddress(contract, 4, 4),
		...contractOf(note, contract),
		borderColor: noteBorderColor(contract),
		location: sanitizeWireString(String(note.location ?? ""), 64),
		kvEntries,
		rawLines: Array.isArray(note.rawContent) ? note.rawContent.map((x) => String(x ?? "")) : [],
		renderError: note.renderError,
		_raw: note,
	}
}

/**
 * A code-chosen name heads a card only beside `nulo` or `scan` evidence; a known card keeps the
 * table's name and has the chip only where the reader places the contract.
 */
function contractOf(note, contract) {
	const selfName = note.contractNameFromCode === true ? note.contractName : undefined
	const tableName = selfName === undefined ? (note.contractName ?? "") : ""
	if (!contract || note.renderError) return { chip: null, contractName: tableName }
	const reading = readContract(marks, appStore.network?.chainId, contract)
	const chip = contractChipOf(reading, contract, { selfName })
	const vouched = chip.level === "nulo" || chip.level === "scan"
	if (note.type === undefined) return { chip, contractName: vouched && selfName ? sanitizeWireString(selfName, 64) : "" }
	const placed = vouched || (reading.level === "none" && reading.flagged)
	return { chip: placed ? chip : null, contractName: tableName }
}

function parseNoteContent(note) {
	if (!note?.content) return null

	// Order-preserving allow-list: schema-decoded fields first, side-channel
	// (owner, randomness) last. Anything else falls through to the full content.
	const allowed = ["value", "amount", "token_id", "expiry_block_number", "remaining_txs", "points", "owner", "randomness"]

	const ordered = {}
	for (const key of allowed) {
		if (Object.hasOwn(note.content, key)) ordered[key] = note.content[key]
	}

	return Object.keys(ordered).length > 0 ? ordered : note.content
}

const handleOpenNote = (display) => {
	cacheStore.viewerData = display._raw ?? display
	popupStore.open("data_viewer")
}

const rowIdBase = useId()

/** Long hex values (addresses, hashes, preimages) should wrap with
 *  overflow-wrap: anywhere instead of ellipsis-truncate — users need
 *  to glance-verify the head and tail, not just the head. Numeric
 *  values (amounts, block numbers) stay single-line. */
function isLongHex(value) {
	if (value === null || value === undefined) return false
	const s = String(value)
	return s.startsWith("0x") && s.length > 40
}

watch(
	() => appStore.account,
	() => {
		fetchNotes()
	},
)

onMounted(async () => {
	if (appStore.network && appStore.isLogined) fetchNotes()
})

onBeforeUnmount(() => {
	noteService.disconnect()
	priceService.disconnect()
	marks.dispose()
})
</script>

<template>
	<SettingsPageShell title="Notes" :backTo="'/popup/settings/developer/account-state'" gap="16" v-if="appStore.isLogined">
		<Input
			v-if="notes.length"
			v-model="searchTerm"
			:normalize="stripBidiAndZeroWidth"
			icon="search"
			placeholder="Search by type, contract, name or location"
			clearable
			@clear="searchTerm = ''"
		/>

		<AsyncListStatus v-if="isFetchingNotes || isErrorOccurred" :loading="isFetchingNotes" :error="error" label="FETCHING NOTES" @retry="fetchNotes(true)" />

		<Flex v-else-if="filteredDisplayNotes.length" direction="column" gap="8">
			<div
				v-for="(display, i) in filteredDisplayNotes"
				:key="display.key"
				@click="handleOpenNote(display)"
				:class="[$style.card, display.renderError && $style.card_error]"
				:style="{ borderLeftColor: display.borderColor }"
			>
				<RowTarget :labelledby="`${rowIdBase}-${i}`" />

				<div :class="$style.header">
					<span :id="`${rowIdBase}-${i}`" :class="$style.type">
						{{ display.type }}<span v-if="display.contractName" :class="$style.contract_name"> · {{ display.contractName }}</span>
					</span>
					<!-- Raised above the card's target and kept from its click, so a press opens the chip's card, not the data viewer. -->
					<span v-if="display.chip" :class="$style.chip_slot" @click.stop><ContractChip :model="display.chip" testid="note-contract" /></span>
					<span v-else-if="display.contractTrim" data-testid="note-contract" :class="$style.contract">{{ display.contractTrim }}</span>
				</div>

				<span v-if="display.location" :class="$style.location">{{ display.location }}</span>

				<div v-if="display.kvEntries.length" :class="$style.kv_grid">
					<template v-for="entry in display.kvEntries" :key="entry.key">
						<span :class="$style.kv_key">{{ entry.key }}</span>
						<span data-testid="record-value" :class="[$style.kv_val, entry.isLongHex && $style.kv_val_wrap]">{{ entry.value }}</span>
					</template>
				</div>

				<div v-else-if="display.rawLines.length" :class="$style.raw">
					<span v-for="(el, i) in display.rawLines" :key="i" :class="$style.raw_line">{{ el }}</span>
				</div>

				<div v-if="display.renderError" :class="$style.render_error">
					<span :class="$style.render_error_label">RENDER ERROR</span>
					<span :class="$style.render_error_msg">{{ display.renderError }}</span>
				</div>
			</div>
		</Flex>

		<ListStatusMessage v-else-if="filteredDisplayNotes.length === 0 && searchTerm" variant="no-results" />

		<ListStatusMessage v-else headline="NO NOTES YET" sub="Notes from your account contracts will appear here." />
	</SettingsPageShell>
</template>

<style module>
.card {
	composes: card from "../../../../../components/modules/settings/record-card.module.css";

	/* The inline left-border color groups notes by contract. */
	border: 1px solid var(--nulo-border);
	border-left: 4px solid var(--nulo-border);

	padding: 12px 12px 12px 10px;
}

.card_error {
	border-left-color: var(--red) !important;
}

.header {
	composes: header from "../../../../../components/modules/settings/record-card.module.css";
}

.type {
	composes: type from "../../../../../components/modules/settings/record-card.module.css";
}

/* Below the popup's width a note's type wraps rather than end in an ellipsis, and its contract goes
 * under it, at the right, when the two do not fit side by side. */
@media (width < 359px) {
	.card > .header {
		flex-wrap: wrap;
		row-gap: 6px;
	}

	.header > .type {
		flex: 1 1 auto;
		white-space: normal;
		overflow-wrap: break-word;
	}

	.header > .contract,
	.header > .chip_slot {
		margin-left: auto;
	}
}

.chip_slot {
	position: relative;
	z-index: 1;
	flex-shrink: 0;
	max-width: 60%;
	min-width: 0;
}

.contract {
	composes: type--meta from global;
	flex-shrink: 0;

	padding: 3px 6px;

	background: var(--nulo-surface-low);
	border: 1px solid var(--nulo-border);

	color: var(--nulo-secondary);
}

/** Takes the note type's role; the colour alone sets it apart. */
.contract_name {
	color: var(--nulo-secondary);
}

.location {
	composes: type--meta from global;
	color: var(--nulo-secondary);
	line-height: 1.4;
	word-break: break-all;
}

.kv_grid {
	composes: kv_grid from "../../../../../components/modules/settings/record-card.module.css";
}

.kv_key {
	composes: kv_key from "../../../../../components/modules/settings/record-card.module.css";
}

.kv_val {
	composes: kv_val from "../../../../../components/modules/settings/record-card.module.css";
}

.kv_val_wrap {
	composes: kv_val_wrap from "../../../../../components/modules/settings/record-card.module.css";
}

.raw {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.raw_line {
	composes: type--meta from global;
	color: var(--nulo-secondary);
	overflow-wrap: anywhere;
	line-height: 1.4;

	&:not(:first-child) {
		padding-top: 4px;
		border-top: 1px solid var(--nulo-border);
	}
}

.render_error {
	display: flex;
	flex-direction: column;
	gap: 4px;

	padding-top: 6px;
	border-top: 1px solid var(--nulo-border);
}

.render_error_label {
	composes: type--label-section from global;
	color: var(--txt-danger);
}

.render_error_msg {
	composes: type--body from global;
	color: var(--nulo-secondary);
	overflow-wrap: anywhere;
	line-height: 1.4;
}

</style>
