import { isValidAztecAddress } from "@/utils/aztec-address"
import { sanitizeString, trimAddress } from "@/utils/string"

/** The contact form's name limit, so a file round-trips every name the form can save. */
const IMPORT_NAME_MAX = 25

const IMPORT_ADDRESS_MAX = 66

export type ImportRow = { name: string; address: string; isSender: boolean }

type SavedContact = { id: string; name: string; address: string }
type StagedRow = { name: string; address: string }

/**
 * Minimal rows from a parsed file. Never spread the hostile input object: extra properties would
 * ride into staging and storage. A non-string field becomes "" and drops its row alone. Addresses
 * are lowercased, as the wallet emits them. A row survives only if no row kept before it has its
 * name (by `contactNameKey`) or its address, so the screen never shows two rows that would write the
 * same contact.
 */
export function normalizeImportRows(rawContacts: ReadonlyArray<Record<string, unknown> | null>): ImportRow[] {
	const names = new Set<string>()
	const addresses = new Set<string>()
	const rows: ImportRow[] = []
	for (const raw of rawContacts) {
		const row = toImportRow(raw)
		if (!row.name || !row.address.trim()) continue
		const name = contactNameKey(row.name)
		if (names.has(name) || addresses.has(row.address)) continue
		names.add(name)
		addresses.add(row.address)
		rows.push(row)
	}
	return rows
}

const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu
const WHITESPACE_RUN = /\p{White_Space}+/gu

/** A contact name read from a file, a backup or an import edit: untrusted display text. Invisible
 *  characters go, any whitespace becomes a space before the character filter (which would delete it
 *  and join the words), and the runs the filter leaves become one space, all before the cut, so
 *  none of them is stored or costs a character. Visible letters and their case are kept. The cut
 *  counts UTF-16 units, as the form does, but a letter outside the BMP that it would split is
 *  dropped whole: half of one is not a character, and the next import strips it, so the name would
 *  never read back as saved. */
export function sanitizeImportName(name: string): string {
	const visible = sanitizeString(name.replace(INVISIBLE, "").replace(WHITESPACE_RUN, " ")).replace(/ {2,}/g, " ").trim()
	return visible
		.slice(0, IMPORT_NAME_MAX)
		.replace(/[\uD800-\uDBFF]$/, "")
		.trim()
}

/** Case folding for matching: per code point, lower, upper, lower. It puts exactly the code points
 *  Unicode default case folding treats as one letter in one class (ß, ss and ẞ; σ and ς), though it
 *  may name the class differently (Cherokee folds to lowercase here). The round trip would also join
 *  dotless ı to i, which default folding keeps apart, so ı is left as it is. */
function foldCase(s: string): string {
	let folded = ""
	for (const c of s) folded += c === "\u0131" ? c : c.toLowerCase().toUpperCase().toLowerCase()
	return folded
}

/**
 * The key two contact names are the same name by: no invisible characters, compatibility forms
 * (NFKC), case folded, whitespace runs as one space, trimmed. Letters that only look alike across
 * scripts (Cyrillic А, Latin A) keep different keys. Invisible characters go first so one between a
 * letter and its accent cannot stop NFKC composing them; NFKC and folding never produce one.
 */
export function contactNameKey(name: string): string {
	return foldCase(name.replace(INVISIBLE, "").normalize("NFKC")).replace(WHITESPACE_RUN, " ").trim()
}

function toImportRow(raw: Record<string, unknown> | null): ImportRow {
	const name = raw?.name
	const address = raw?.address
	return {
		name: typeof name === "string" ? sanitizeImportName(name) : "",
		address: typeof address === "string" ? sanitizeString(address, IMPORT_ADDRESS_MAX).toLowerCase() : "",
		isSender: raw?.isSender === true,
	}
}

export interface SavedContactIndex {
	byName: Map<string, SavedContact[]>
	byAddress: Map<string, SavedContact[]>
}

/** Names key by `contactNameKey`, addresses lowercase. Lists, not single entries: older data can hold
 *  two saved contacts under one name key or one address. */
export function indexSavedContacts(saved: readonly SavedContact[]): SavedContactIndex {
	const byName = new Map<string, SavedContact[]>()
	const byAddress = new Map<string, SavedContact[]>()
	for (const c of saved) {
		append(byName, contactNameKey(c.name), c)
		append(byAddress, c.address.toLowerCase(), c)
	}
	return { byName, byAddress }
}

function append(map: Map<string, SavedContact[]>, key: string, contact: SavedContact): void {
	const list = map.get(key)
	if (list) list.push(contact)
	else map.set(key, [contact])
}

export type ContactMatchKind = "new" | "unchanged" | "address-change" | "name-change" | "conflict"

export interface ContactMatch {
	kind: ContactMatchKind
	/** The one saved contact a write would update; null for `new` and `conflict`. */
	target: SavedContact | null
}

/** What a row does to the saved contacts, judged over every saved contact it matches by name or by
 *  address: more than one is a conflict, which no write may resolve by picking one. */
export function matchSavedContacts(row: StagedRow, index: SavedContactIndex): ContactMatch {
	const byName = index.byName.get(contactNameKey(row.name)) ?? []
	const byAddress = index.byAddress.get(row.address.toLowerCase()) ?? []
	const matched = new Map([...byName, ...byAddress].map((c) => [c.id, c]))
	if (matched.size > 1) return { kind: "conflict", target: null }
	const [target] = matched.values()
	if (!target) return { kind: "new", target: null }
	if (byName.length && byAddress.length) return { kind: "unchanged", target }
	return { kind: byName.length ? "address-change" : "name-change", target }
}

export type ImportRowKind = ContactMatchKind | "invalid"

export interface ClassifiedImportRow {
	kind: ImportRowKind
	importable: boolean
	/** Only a contact the book does not have yet starts selected; every change to a saved one waits
	 *  for the user. */
	selected: boolean
	/** The saved contact the row would write, as judged when it was shown. */
	targetId: string | null
	savedName: string | null
	savedAddress: string | null
}

export function classifyImportRow(row: StagedRow, index: SavedContactIndex): ClassifiedImportRow {
	const { kind, target } = isValidAztecAddress(row.address) ? matchSavedContacts(row, index) : { kind: "invalid" as const, target: null }
	return {
		kind,
		importable: kind !== "invalid" && kind !== "conflict",
		selected: kind === "new",
		targetId: target?.id ?? null,
		savedName: target?.name ?? null,
		savedAddress: target?.address ?? null,
	}
}

/** A row as the selection screen hands it back: the decision the user saw travels with it. */
export type ReviewedImportRow = StagedRow & {
	isSender?: boolean
	kind?: ImportRowKind
	targetId?: string | null
	savedName?: string | null
	savedAddress?: string | null
}

export interface ImportWrite<T> {
	row: T
	targetId: string | null
}

interface TakenKeys {
	names: Set<string>
	addresses: Set<string>
	targets: Set<string>
}

/**
 * The writes a confirmed selection makes, in order, against the saved contacts as they are now. A row
 * is refused when it no longer does what the screen showed (the book changed since), when it matches
 * two saved contacts, or when it would write a name, an address or a saved contact that an earlier
 * admitted row writes. Keys are taken at admission, before any write runs, so a failed write still
 * holds them.
 */
export function planImportWrites<T extends ReviewedImportRow>(
	rows: readonly T[],
	index: SavedContactIndex,
): { admitted: ImportWrite<T>[]; refused: T[] } {
	const taken: TakenKeys = { names: new Set(), addresses: new Set(), targets: new Set() }
	const admitted: ImportWrite<T>[] = []
	const refused: T[] = []
	for (const row of rows) {
		const write = admit(row, index, taken)
		if (write) admitted.push({ row, targetId: write.targetId })
		else refused.push(row)
	}
	return { admitted, refused }
}

/** Whether the row still does what the screen showed: same kind, same saved contact, and that contact
 *  still holding the name and address the screen showed as its old values. A conflict never does,
 *  whatever it was shown as. */
export function stillAsShown(row: ReviewedImportRow, index: SavedContactIndex): boolean {
	const { kind, target } = matchSavedContacts(row, index)
	if (kind === "conflict" || kind !== row.kind || (target?.id ?? null) !== (row.targetId ?? null)) return false
	return !target || (target.name === row.savedName && target.address === row.savedAddress)
}

function admit(row: ReviewedImportRow, index: SavedContactIndex, taken: TakenKeys): { targetId: string | null } | null {
	if (!stillAsShown(row, index)) return null
	const targetId = row.targetId ?? null
	const name = contactNameKey(row.name)
	const address = row.address.toLowerCase()
	if (taken.names.has(name) || taken.addresses.has(address) || (targetId && taken.targets.has(targetId))) return null
	taken.names.add(name)
	taken.addresses.add(address)
	if (targetId) taken.targets.add(targetId)
	return { targetId }
}

/** How an address change reads: the usual short forms, or both full addresses when the short forms
 *  agree (two different addresses can share the visible head and tail), so a change never reads as
 *  two identical strings. */
export function addressChangeText(saved: string, incoming: string): { saved: string; incoming: string; full: boolean } {
	const short = { saved: trimAddress(saved), incoming: trimAddress(incoming) }
	if (short.saved.toLowerCase() !== short.incoming.toLowerCase()) return { ...short, full: false }
	return { saved, incoming, full: true }
}
