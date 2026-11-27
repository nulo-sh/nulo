/**
 * Pure normalizer for the backup `account-state` slice — the ONE trust
 * boundary both consumers share (the import page's connectivity preflight and
 * `AccountStateService.restore`). The slice is attacker-controlled backup
 * content that is deliberately NOT schema'd by the backup registry
 * (non-storage pass-through), so every bound lives here: item/network/child
 * caps, duplicate-network merging, and malformed-entry collapse into
 * fixed-size violation records (never one record per hostile entry).
 *
 * Two formats decode into the same items: format 1, an array whose contracts each carry their own
 * artifact, and format 2, `{format: 2, classes, items}`, where a contract finds its artifact in the
 * class table by its instance's `currentContractClassId`. The part carries its own format: it is no
 * stored key, so the storage migrator never reads it.
 */

import type { ContractArtifact } from "@aztec-labs/stdlib/abi"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { isHex32 } from "@nulo/wallet-core/field"
import { isObjectLike, isRecord } from "@nulo/wallet-core/guards"
import { jsonStringify } from "@nulo/wallet-core/utils"
import {
	type BackupFileRest,
	MAX_BACKUP_FILE_BYTES,
	MAX_SEALABLE_TEXT_BYTES,
	SLICE_PRETTY_INDENT,
	utf8Length,
} from "@/utils/full-backup-helpers"
import { RANDOM_ID_LENGTH } from "@/wallet/services/id-allocators"
import { isPxeProvidedContract } from "./pxe-provided"
import {
	type AccountStateRestoreRecord,
	type AccountStateSlice,
	type AccountStateSliceV2,
	type BackupContract,
	type BackupContractClass,
	type BackupSender,
	isAccountStateV2,
	type RestoredContract,
} from "./spec"

export { isAccountStateV2 }

export const ACCOUNT_STATE_CAPS = {
	maxNetworks: 8,
	maxInputItems: 16,
	maxSendersPerNetwork: 64,
	maxContractsPerNetwork: 32,
	// UTF-16 code units of the slice as written (not bytes: a cheap, still-hard bound), class table
	// included. Format 2 stores each class's artifact once, so the part grows with distinct classes;
	// a format-1 backup stores one per contract and per network, and a 3-network one made before the
	// export left out what every PXE boot registers measured 33.8M, so this bound cannot come down
	// without refusing it. Raising it breaks two constraints:
	//   - It must stay well under MAX_BACKUP_FILE_BYTES (64MiB) and under the ~48MiB of plaintext
	//     a base64-sealed encrypted backup can carry, or the whole-file cap always trips first and
	//     this stops being a bound at all.
	//   - The export-time warning derives from it as 80% of this value, so a larger cap silently
	//     raises the threshold past the payload we actually ship and disables the early signal.
	maxSliceCodeUnits: 40 * 1024 * 1024,
	maxErrorMessageLength: 200,
} as const

/** Constant skip/violation copy — never derived from slice content. */
export const ACCOUNT_STATE_SKIP_UNREACHABLE = "Skipped: couldn't reach the network"
export const ACCOUNT_STATE_SKIP_WRONG_NETWORK = "Skipped: this endpoint serves a different network"
export const ACCOUNT_STATE_SKIP_DEADLINE = "Skipped: ran out of time reaching the network"

/** The copy for a part this build cannot read, the same whatever its shape. */
const UNREADABLE_SLICE = "malformed account-state slice (not an array)"

/** A contract as the restore registers it. `artifact` is absent when a format-2 part's class table
 *  holds no usable entry for its class; within one decoded part, every contract of a class shares
 *  one artifact object. */
export interface NormalizedContract {
	address: string
	instance: ContractInstanceWithAddress
	artifact?: ContractArtifact
}

export interface NormalizedAccountStateItem {
	networkId: string
	senders: BackupSender[]
	contracts: NormalizedContract[]
}

/** Top-level error record in the exact result shape `collectRestoreErrors`
 *  consumes — empty child arrays, the error at item level. */
export interface AccountStateViolationRecord extends AccountStateRestoreRecord {
	contracts: RestoredContract[]
	restoreError: string
}

export interface NormalizedAccountState {
	items: NormalizedAccountStateItem[]
	violations: AccountStateViolationRecord[]
}

function violation(networkId: string, message: string): AccountStateViolationRecord {
	return { networkId, senders: [], contracts: [], restoreError: message }
}

function isValidSender(entry: unknown): entry is BackupSender {
	return isObjectLike(entry) && typeof entry.address === "string" && entry.address.length > 0 && entry.address.length <= 200
}

function isValidContractEntry(entry: unknown): entry is Omit<BackupContract, "artifact"> {
	if (!isObjectLike(entry)) return false
	const c = entry
	// Deep instance/artifact validation stays PXE's job (it re-validates on
	// registration); presence + address shape is the boundary's concern.
	return typeof c.address === "string" && c.address.length > 0 && c.address.length <= 200 && !!c.instance
}

type ContractReader = (entry: unknown) => NormalizedContract | undefined

const readContractV1: ContractReader = (entry) =>
	isValidContractEntry(entry) && !!(entry as Record<string, unknown>).artifact
		? { address: entry.address, instance: entry.instance, artifact: (entry as BackupContract).artifact }
		: undefined

/** A format-2 entry's own `artifact` key is never read: its code comes from the class table only. */
const readContractV2: ContractReader = (entry) =>
	isValidContractEntry(entry) ? { address: entry.address, instance: entry.instance } : undefined

/** The instance's current class id in the form `Fr.toString()` writes, which is what the JSON wire
 *  carries; the export holds the `Fr` itself. Any other form names no class. */
function instanceClassId(instance: unknown): string | undefined {
	const raw = isObjectLike(instance) ? instance.currentContractClassId : undefined
	const id = typeof raw === "string" ? raw : isRecord(raw) && typeof raw.toString === "function" ? raw.toString() : undefined
	return typeof id === "string" && isHex32(id) && id === id.toLowerCase() ? id : undefined
}

/** The part's size as the import's cap reads it: code units of its JSON, taken of the part as the file
 *  carries it (an export's wire form, or the part an import parsed). */
export function accountStatePartCodeUnits(part: unknown): number {
	return JSON.stringify(part).length
}

export function truncateErrorMessage(message: string): string {
	return message.length <= ACCOUNT_STATE_CAPS.maxErrorMessageLength
		? message
		: `${message.slice(0, ACCOUNT_STATE_CAPS.maxErrorMessageLength - 1)}…`
}

/**
 * Normalize an untrusted account-state slice: merge duplicate networkIds
 * (so duplicates cannot bypass per-network caps), enforce every cap, and
 * collapse malformed/excess content into bounded violation records.
 */
export function normalizeAccountStateSlice(raw: unknown): NormalizedAccountState {
	const v2 = isAccountStateV2(raw)
	const rawItems = v2 ? raw.items : raw
	if (!Array.isArray(rawItems)) return { items: [], violations: [violation("(slice)", UNREADABLE_SLICE)] }
	if (rawItems.length === 0) return { items: [], violations: [] }

	let sliceCodeUnits: number
	try {
		sliceCodeUnits = accountStatePartCodeUnits(raw)
	} catch {
		return { items: [], violations: [violation("(slice)", "malformed account-state slice (not serializable)")] }
	}
	if (sliceCodeUnits > ACCOUNT_STATE_CAPS.maxSliceCodeUnits) {
		return { items: [], violations: [violation("(slice)", `account-state slice too large (${sliceCodeUnits} code units)`)] }
	}

	const violations: AccountStateViolationRecord[] = []

	const inputItems = rawItems.slice(0, ACCOUNT_STATE_CAPS.maxInputItems)
	if (rawItems.length > ACCOUNT_STATE_CAPS.maxInputItems) {
		violations.push(
			violation("(slice)", `${rawItems.length - ACCOUNT_STATE_CAPS.maxInputItems} account-state item(s) over the cap were dropped`),
		)
	}

	const byNetwork = mergeSliceItems(inputItems, violations, v2 ? readContractV2 : readContractV1)
	const items = applyNetworkCaps(byNetwork, violations)
	if (v2) attachClassArtifacts(items, raw.classes)
	return { items, violations }
}

/**
 * Gives each format-2 contract its class's artifact. Runs after the caps, over the class ids the
 * kept contracts reference, so an unreferenced table entry costs one key lookup and is never read
 * further. The first entry with an object artifact wins for its class id. A class with no usable
 * entry leaves its contracts without an artifact, for the restore to resolve or refuse one by one.
 */
function attachClassArtifacts(items: NormalizedAccountStateItem[], rawClasses: unknown): void {
	const contracts = items.flatMap((item) => item.contracts)
	const table = readClassTable(rawClasses, new Set(contracts.flatMap((c) => instanceClassId(c.instance) ?? [])))
	for (const c of contracts) {
		const artifact = table.get(instanceClassId(c.instance) ?? "")
		if (artifact) c.artifact = artifact
	}
}

function readClassTable(rawClasses: unknown, referenced: ReadonlySet<string>): Map<string, ContractArtifact> {
	const table = new Map<string, ContractArtifact>()
	for (const entry of Array.isArray(rawClasses) ? rawClasses : []) {
		const classId = isRecord(entry) ? entry.classId : undefined
		if (typeof classId !== "string" || !referenced.has(classId) || table.has(classId)) continue
		const artifact = (entry as Record<string, unknown>).artifact
		if (isRecord(artifact)) table.set(classId, artifact as unknown as ContractArtifact)
	}
	return table
}

/** What `encodeAccountState` reads: an export's items or a decoded part's. */
type EncodableItem = { networkId: string; chainId?: number; senders: BackupSender[]; contracts: NormalizedContract[] }

/**
 * Encodes items as a format-2 part: each class's artifact once, contracts without code. When any
 * class maps to more than one distinct artifact object anywhere in `items`, or a contract carrying
 * an artifact names no class id, it returns `items` whole as format 1, so every copy travels with
 * its own contract and is checked on its own. Items a format-2 part decoded into share one object
 * per class and stay compact. The format-1 return drops an entry without code, so it is reached only
 * by items whose every contract carries code: a format-2 decode never maps one class to two objects.
 */
export function encodeAccountState<T extends EncodableItem>(items: readonly T[]): AccountStateSliceV2 | T[] {
	const table = new Map<string, ContractArtifact>()
	for (const item of items) {
		for (const c of item.contracts) {
			if (!c.artifact) continue
			const classId = instanceClassId(c.instance)
			const known = classId === undefined ? undefined : table.get(classId)
			if (classId === undefined || (known !== undefined && known !== c.artifact)) return [...items]
			table.set(classId, c.artifact)
		}
	}
	return {
		format: 2,
		classes: [...table].map(([classId, artifact]) => ({ classId, artifact })),
		items: items.map(({ contracts, ...rest }) => ({
			...rest,
			contracts: contracts.map(({ address, instance }) => ({ address, instance })),
		})),
	}
}

/** A size in the three measures a written part must pass: the import's code units, and UTF-8 bytes
 *  of its compact and its pretty text where the file holds it. */
type PartSize = { codeUnits: number; bytes: number; pretty: number }

/** One class-table entry: its wire form, kept to build the measured part, and what it adds. */
type SizedClass = { index: number; classId: string; name: unknown; wire: unknown; size: PartSize }

/** A class entry is printed two levels into the part, and a non-empty pretty table adds its own
 *  line breaks and the indent of its closing bracket. */
const ENTRY_PRETTY_INDENT = SLICE_PRETTY_INDENT + 4
const TABLE_PRETTY_BYTES = SLICE_PRETTY_INDENT + 2

/** What the export left out, in the order it went, and the part's size as the import measures it. */
export interface FittedAccountState {
	part: AccountStateSlice
	codeUnits: number
	left: { name: unknown; codeUnits: number }[]
}

function lineBreaks(text: string): number {
	let count = 0
	for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) count++
	return count
}

/** The size of a wire value printed at the part's place in the file. */
function wireSize(compact: string, wire: unknown): PartSize {
	const pretty = JSON.stringify(wire, null, 2)
	return {
		codeUnits: compact.length,
		bytes: utf8Length(compact),
		pretty: utf8Length(pretty) + SLICE_PRETTY_INDENT * lineBreaks(pretty),
	}
}

/** What a written part may take: the import's cap less what its remap of each item's `networkId` to
 *  a seeded network's id can add, and what the `rest` of the file leaves under both file checks. */
function partBudget(items: unknown, rest: BackupFileRest): PartSize {
	const seededId = RANDOM_ID_LENGTH + 2
	const remapGrowth = (Array.isArray(items) ? items : []).reduce(
		(n: number, item) => n + Math.max(0, seededId - (JSON.stringify((item as { networkId?: unknown })?.networkId)?.length ?? 0)),
		0,
	)
	return {
		codeUnits: ACCOUNT_STATE_CAPS.maxSliceCodeUnits - remapGrowth,
		bytes: MAX_SEALABLE_TEXT_BYTES - rest.compactBytes,
		pretty: MAX_BACKUP_FILE_BYTES - rest.prettyBytes,
	}
}

const fits = (size: PartSize, budget: PartSize) =>
	size.codeUnits <= budget.codeUnits && size.bytes <= budget.bytes && size.pretty <= budget.pretty

function sizeClass(entry: BackupContractClass, index: number): SizedClass {
	const compact = jsonStringify(entry)
	const wire = JSON.parse(compact) as unknown
	const pretty = JSON.stringify(wire, null, 2)
	return {
		index,
		classId: entry.classId,
		name: entry.artifact?.name,
		wire,
		size: {
			codeUnits: compact.length + 1,
			bytes: utf8Length(compact) + 1,
			pretty: utf8Length(pretty) + ENTRY_PRETTY_INDENT * (lineBreaks(pretty) + 1) + 2,
		},
	}
}

/** The part with `count` classes whose sizes sum to `kept`: each entry's size counts one comma, which
 *  the last one does not write, and a non-empty table's pretty brackets take their own lines. */
function withClasses(base: PartSize, kept: PartSize, count: number): PartSize {
	if (count === 0) return base
	return {
		codeUnits: base.codeUnits + kept.codeUnits - 1,
		bytes: base.bytes + kept.bytes - 1,
		pretty: base.pretty + kept.pretty + TABLE_PRETTY_BYTES,
	}
}

/** App classes before the wallet's own, then largest in the file first, then by class id. */
function removalOrder(classes: readonly SizedClass[], own: ReadonlySet<string>): SizedClass[] {
	return [...classes].sort(
		(a, b) =>
			Number(own.has(a.classId)) - Number(own.has(b.classId)) ||
			b.size.pretty - a.size.pretty ||
			(a.classId < b.classId ? -1 : a.classId > b.classId ? 1 : 0),
	)
}

/**
 * The part as the export writes it: every item, entry and sender, and the class table less whole
 * entries until the part fits the import's cap and its file passes the export's checks on the sealed
 * and the pretty text, given the `rest` of the file. A part that already fits comes back as the same
 * object. Classes go in {@link removalOrder}; the kept ones keep their order. `walletClassIds` is
 * read only when a class must go. Throws when the items alone are over the import's cap, or when the
 * measured part disagrees with its sizes; a part whose file fails a file check even with no classes
 * comes back with none, for the export's own check to refuse.
 */
export async function fitAccountStatePart(
	part: AccountStateSlice,
	rest: BackupFileRest,
	walletClassIds: () => Promise<ReadonlySet<string>>,
): Promise<FittedAccountState> {
	if (!isAccountStateV2(part)) return { part, codeUnits: assertFormat1Fits(part, rest), left: [] }
	const classes = part.classes.map(sizeClass)
	const baseCompact = jsonStringify({ ...part, classes: [] })
	const wireBase = JSON.parse(baseCompact) as AccountStateSliceV2
	const base = wireSize(baseCompact, wireBase)
	const budget = partBudget(wireBase.items, rest)
	const kept = { codeUnits: 0, bytes: 0, pretty: 0 }
	const add = (c: SizedClass, sign: 1 | -1) => {
		kept.codeUnits += sign * c.size.codeUnits
		kept.bytes += sign * c.size.bytes
		kept.pretty += sign * c.size.pretty
	}
	for (const c of classes) add(c, 1)
	const left = new Set<SizedClass>()
	if (classes.length > 0 && !fits(withClasses(base, kept, classes.length), budget)) {
		for (const c of removalOrder(classes, await walletClassIds())) {
			if (fits(withClasses(base, kept, classes.length - left.size), budget)) break
			left.add(c)
			add(c, -1)
		}
	}
	const keptClasses = classes.filter((c) => !left.has(c))
	const codeUnits = accountStatePartCodeUnits({ ...wireBase, classes: keptClasses.map((c) => c.wire) })
	if (codeUnits !== withClasses(base, kept, keptClasses.length).codeUnits) {
		throw new Error("The contract part's size does not match its measure")
	}
	if (codeUnits > budget.codeUnits) throw new Error("The contract part is too large without contract code")
	if (left.size === 0) return { part, codeUnits, left: [] }
	return {
		part: { ...part, classes: keptClasses.map((c) => part.classes[c.index]) },
		codeUnits,
		left: [...left].map((c) => ({ name: c.name, codeUnits: c.size.codeUnits - 1 })),
	}
}

/** A format-1 part carries its code in its entries, so nothing can leave it: it is written only
 *  when it already fits. The export writes format 2 whenever each class has one artifact. */
function assertFormat1Fits(part: readonly unknown[], rest: BackupFileRest): number {
	const compact = jsonStringify(part)
	const size = wireSize(compact, JSON.parse(compact))
	if (!fits(size, partBudget(part, rest))) throw new Error("The contract part is too large to write")
	return size.codeUnits
}

/**
 * The part an import sends for decoded `items`: an array when every contract carries an artifact and
 * no artifact object serves two of them, as a format-1 part decodes, since a class table would only
 * add bytes; otherwise encoded.
 * Either way it is no larger than the part the items were read from, so it stays under the cap.
 */
export function restorePayload<T extends EncodableItem>(items: readonly T[]): AccountStateSliceV2 | T[] {
	const artifacts = items.flatMap((item) => item.contracts.map((c) => c.artifact))
	const objects = artifacts.filter(isObjectLike)
	const ownCopies = artifacts.every((a) => a !== undefined) && new Set(objects).size === objects.length
	return ownCopies ? [...items] : encodeAccountState(items)
}

/** Duplicate-networkId merge over the capped input, collapsing malformed
 *  items/children into bounded counter violations (appended in place). */
function mergeSliceItems(
	inputItems: unknown[],
	violations: AccountStateViolationRecord[],
	readContract: ContractReader,
): Map<string, NormalizedAccountStateItem> {
	let malformedItems = 0
	let malformedChildren = 0
	const byNetwork = new Map<string, NormalizedAccountStateItem>()
	for (const item of inputItems) {
		const networkId = isObjectLike(item) ? item.networkId : undefined
		if (typeof networkId !== "string" || networkId.length === 0 || networkId.length > 100) {
			malformedItems++
			continue
		}
		const merged = byNetwork.get(networkId) ?? { networkId, senders: [], contracts: [] }
		malformedChildren += mergeItemChildren(item as Record<string, unknown>, merged, violations, readContract)
		byNetwork.set(networkId, merged)
	}
	if (malformedItems > 0) violations.push(violation("(slice)", `${malformedItems} malformed account-state item(s) dropped`))
	if (malformedChildren > 0) violations.push(violation("(slice)", `${malformedChildren} malformed sender/contract entries dropped`))
	return byNetwork
}

/** Folds one item's sender/contract children into its merged entry, returning
 *  the malformed-child count (the caller aggregates it into ONE bounded
 *  violation across the whole slice). */
function mergeItemChildren(
	item: Record<string, unknown>,
	merged: NormalizedAccountStateItem,
	violations: AccountStateViolationRecord[],
	readContract: ContractReader,
): number {
	let malformedChildren = 0
	const rawSenders = item.senders
	const rawContracts = item.contracts
	if (!Array.isArray(rawSenders) || !Array.isArray(rawContracts)) {
		// The old per-item "malformed (not arrays)" record vanished in the
		// collector; it now surfaces as a bounded top-level violation.
		violations.push(violation(merged.networkId, "malformed account-state item (senders/contracts not arrays)"))
	}
	for (const s of Array.isArray(rawSenders) ? rawSenders : []) {
		if (isValidSender(s)) merged.senders.push({ address: s.address })
		else malformedChildren++
	}
	for (const c of Array.isArray(rawContracts) ? rawContracts : []) {
		const contract = readContract(c)
		if (contract) merged.contracts.push(contract)
		else malformedChildren++
	}
	return malformedChildren
}

/** Network-count + per-network child caps over the merged map, recording a
 *  violation per over-cap network (appended in place). */
function applyNetworkCaps(
	byNetwork: Map<string, NormalizedAccountStateItem>,
	violations: AccountStateViolationRecord[],
): NormalizedAccountStateItem[] {
	const items: NormalizedAccountStateItem[] = []
	for (const item of byNetwork.values()) {
		if (items.length >= ACCOUNT_STATE_CAPS.maxNetworks) {
			violations.push(violation(item.networkId, "network over the account-state network cap — its registrations were dropped"))
			continue
		}
		const overSenders = item.senders.length - ACCOUNT_STATE_CAPS.maxSendersPerNetwork
		const overContracts = item.contracts.length - ACCOUNT_STATE_CAPS.maxContractsPerNetwork
		if (overSenders > 0 || overContracts > 0) {
			violations.push(
				violation(
					item.networkId,
					`over the per-network cap: ${Math.max(overSenders, 0)} sender(s) + ${Math.max(overContracts, 0)} contract(s) dropped`,
				),
			)
		}
		items.push({
			networkId: item.networkId,
			senders: item.senders.slice(0, ACCOUNT_STATE_CAPS.maxSendersPerNetwork),
			contracts: item.contracts.slice(0, ACCOUNT_STATE_CAPS.maxContractsPerNetwork),
		})
	}
	return items
}

/** Networks (deduped, capped) that carry at least one entry only the import can register: a
 *  sender, or a contract no PXE boot registers by itself. The ONLY networks worth a probe. */
export function registrableNetworkIds(normalized: NormalizedAccountState): string[] {
	return normalized.items
		.filter((i) => i.senders.length > 0 || i.contracts.some((c) => !isPxeProvidedContract(c.address)))
		.map((i) => i.networkId)
}

/** Whether an error's shape indicates the network (not the payload) failed —
 *  the trigger for per-network fail-fast. Conservative on purpose: payload
 *  validation errors must never classify as connectivity. */
export function isConnectivityErrorMessage(message: string): boolean {
	// Bare `timeout`/`refused` stay deliberately broad — narrowing them (e.g. to
	// `timeout after`) lets messages like "RPC timeout" defeat the per-network
	// fail-fast, and the deadline alone would then eat the whole budget.
	return /timed out|timeout|Error fetching from host|Failed to fetch|fetch failed|ECONNREFUSED|refused|ERR_CONNECTION|network error/i.test(
		message,
	)
}

/** The full account-state result shape for a wholly-skipped network. */
export function skippedNetworkRecord(networkId: string, message: string): AccountStateRestoreRecord {
	return { networkId, senders: [], contracts: [], restoreError: message }
}
