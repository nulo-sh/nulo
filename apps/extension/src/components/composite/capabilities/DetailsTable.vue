<script setup lang="ts">
/**
 * The Details fold: every contract and contract class the app would reach, once, with a mark per
 * permission that includes it, and on opening a row the functions it listed. Function names,
 * unknown addresses and class ids are the app's own strings: control and bidi characters are
 * stripped before they show.
 */
import { trimAddress } from "@/utils/string"
import { sanitizeWireString, stripWireControl } from "@/wallet/services/dapp-session/capability-meta"
import RowTarget from "@/components/ui/RowTarget.vue"
import CapabilityDisclosure from "./CapabilityDisclosure.vue"

type Row = {
	address?: string
	name?: string
	simulate: readonly string[]
	add: boolean
	transact: readonly string[]
	details: boolean
	events: boolean
	code: boolean
}

const props = defineProps<{
	known: readonly Row[]
	unknown: readonly Row[]
	classes: readonly Row[]
	anyContract: Row | null
	/** "any contract", or the count of listed contracts or, with none, of classes. */
	label: string
}>()

const emit = defineEmits<{ copy: [address: string] }>()

type SectionKey = "known" | "unknown" | "classes"
type Entry = { kind: "sub"; key: string; text: string } | { kind: "row"; key: string; row: Row; section: SectionKey | "any" }

/** Keys double as id suffixes, so they hold no whitespace. */
const section = (key: SectionKey, text: string, rows: readonly Row[]): Entry[] =>
	rows.length === 0
		? []
		: [{ kind: "sub", key, text }, ...rows.map((row, i): Entry => ({ kind: "row", key: `${key}-${i}`, row, section: key }))]

/** "Any contract" goes last, under no sub-header. */
const entries = computed<Entry[]>(() => [
	...section("known", "Nulo knows", props.known),
	...section("unknown", "Nulo doesn't know", props.unknown),
	...section("classes", "Contract classes", props.classes),
	...(props.anyContract ? [{ kind: "row" as const, key: "any", row: props.anyContract, section: "any" as const }] : []),
])

const isNamed = (entry: { section: SectionKey | "any" }) => entry.section === "known" || entry.section === "any"

const opened = ref(new Set<string>())

const toggle = (key: string) => {
	const next = new Set(opened.value)
	if (!next.delete(key)) next.add(key)
	opened.value = next
}

const uid = useId()

const shownAddress = (address: string | undefined) => trimAddress(sanitizeWireString(address ?? "", 128), 6, 4, "…")

const functions = (names: readonly string[]) => names.map((name) => sanitizeWireString(name, 64)).join(" · ")

/** Each column's word, which a row's spoken name uses, and the glyph of the row it stands for. */
const COLUMNS = [
	["simulate", "play", (row: Row) => row.simulate.length > 0],
	["add", "add", (row: Row) => row.add],
	["transact", "check", (row: Row) => row.transact.length > 0],
	["details", "info", (row: Row) => row.details],
	["events", "mail-lock", (row: Row) => row.events],
	["code", "code", (row: Row) => row.code],
] as const

/** A row's target reads "{name}: {columns}", since the head is hidden from screen readers, and an
 *  unknown contract's or a class's name says so, since a Tab to it skips its sub-header. */
const spokenName = (entry: { row: Row; section: SectionKey | "any" }) => {
	const shown = shownAddress(entry.row.address)
	const name = isNamed(entry) ? entry.row.name : entry.section === "classes" ? `Contract class ${shown}` : `Unknown contract ${shown}`
	const columns = COLUMNS.filter(([, , has]) => has(entry.row)).map(([column]) => column)
	return `${name}: ${columns.join(", ")}`
}
</script>

<template>
	<CapabilityDisclosure label="Details" :tag="label" testid="cap-detail-toggle">
		<div :class="$style.table">
			<div :class="[$style.grid, $style.head]" aria-hidden="true">
				<span>Contract</span>
				<Icon v-for="[column, glyph] in COLUMNS" :key="column" :name="glyph" :size="14" :class="$style.head_glyph" />
				<span />
			</div>

			<template v-for="entry in entries" :key="entry.key">
				<div v-if="entry.kind === 'sub'" :class="$style.sub">{{ entry.text }}</div>

				<template v-else>
					<div :class="[$style.grid, $style.row, opened.has(entry.key) && $style.open]" @click="toggle(entry.key)">
						<RowTarget
							:labelledby="`${uid}-${entry.key}`"
							:aria-expanded="opened.has(entry.key)"
							data-testid="cap-details-row"
							:data-details-key="entry.key"
						/>

						<span :id="`${uid}-${entry.key}`" hidden>{{ spokenName(entry) }}</span>
						<span v-if="isNamed(entry)" :class="$style.name">{{ entry.row.name }}</span>
						<span v-else :class="$style.address">
							<span :class="$style.address_text" data-testid="capability-address">{{ shownAddress(entry.row.address) }}</span>
							<RowAction
								label="Copy address"
								tabindex="-1"
								data-testid="cap-details-copy"
								:data-details-key="entry.key"
								:class="$style.copy"
								@click="emit('copy', stripWireControl(entry.row.address ?? ''))"
							>
								<Icon name="copy" :size="12" :class="$style.copy_glyph" aria-hidden="true" />
							</RowAction>
						</span>

						<template v-for="[column, , has] in COLUMNS" :key="column">
							<Icon v-if="has(entry.row)" name="check" :size="15" :class="$style.yes" aria-hidden="true" />
							<span v-else :class="$style.no" aria-hidden="true" />
						</template>

						<Icon name="chevron" :size="14" :class="$style.chevron" aria-hidden="true" />
					</div>

					<div v-if="opened.has(entry.key)" data-testid="cap-details-fns" :class="$style.fns">
						<div v-if="entry.row.simulate.length" :class="$style.fn">
							<span :class="$style.fn_label">Simulate</span>
							<span :class="$style.fn_names">{{ functions(entry.row.simulate) }}</span>
						</div>
						<div v-if="entry.row.transact.length" :class="$style.fn">
							<span :class="$style.fn_label">Transact</span>
							<span :class="$style.fn_names">{{ functions(entry.row.transact) }}</span>
						</div>
					</div>
				</template>
			</template>

			<div :class="$style.foot">
				Function names come from the app. Anything it didn't list is refused instantly; you won't be asked.
			</div>
		</div>
	</CapabilityDisclosure>
</template>

<style module>
.table {
	display: flex;
	flex-direction: column;
}

/* Overrides the shared token: light draws this table's hairlines in its own, warmer hue. */
:global([theme="light"]) .table {
	--hairline-soft: rgba(124, 116, 104, 0.2);
}

.grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) repeat(6, 26px) 14px;
	align-items: center;
	column-gap: 4px;
}

.head {
	composes: type--label-section from global;
	padding-bottom: 6px;

	color: var(--nulo-secondary);
}

.head .head_glyph {
	justify-self: center;
}

.sub {
	composes: type--label-section from global;
	padding: 10px 0 5px;
	border-bottom: 1px solid var(--hairline-soft);

	color: var(--nulo-secondary);
}

.row {
	user-select: none;
	position: relative;
	min-height: 30px;
	border-bottom: 1px solid var(--hairline-soft);
	cursor: pointer;
}

.row:hover {
	background: var(--nulo-surface-low);
}

.row:has(> [data-row-target]:focus-visible) {
	outline: 1px solid var(--txt-primary);
	outline-offset: -1px;
}

.name {
	composes: type--name from global;
	overflow: hidden;

	font-size: 13px;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--txt-primary);
}

.address {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	color: var(--txt-primary);
}

.address_text {
	composes: type--meta from global;
}

/* The 24px box centres a 12px glyph: pulled in by the difference, the glyph sits 6px from the text. */
.address .copy {
	margin: -6px;
}

/* Three classes, so RowAction's hover colour never decides. */
.address .copy .copy_glyph {
	color: var(--nulo-outline);
}

.row .yes {
	justify-self: center;
	color: var(--nulo-secondary);
}

.no {
	justify-self: center;
	width: 8px;
	height: 1px;
	background: var(--nulo-outline);
}

.row .chevron {
	color: var(--nulo-outline);
	transition: transform 0.2s var(--bezier);
}

.row.open .chevron {
	transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
	.row .chevron {
		transition: none;
	}
}

.fns {
	display: flex;
	flex-direction: column;
	gap: 5px;

	padding: 7px 0 10px;
	border-bottom: 1px solid var(--hairline-soft);
}

.fn {
	composes: type--meta from global;
	display: grid;
	grid-template-columns: 66px minmax(0, 1fr);
	gap: 8px;

	line-height: 1.5;
}

.fn_label {
	composes: type--label-section from global;
	padding-top: 1px;

	color: var(--nulo-secondary);
}

.fn_names {
	overflow-wrap: anywhere;
	color: var(--txt-tertiary);
}

.foot {
	composes: type--body from global;
	margin-top: 10px;

	line-height: 1.45;
	color: var(--txt-tertiary);
}
</style>
