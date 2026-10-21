/**
 * Every row the permission window can show: its group, icon, title, lines, switch, flag and
 * default. Pure, so the window and Settings read one table and the defaults match what the
 * dispatcher enforces.
 */
import type { GlyphName } from "@nulo/design/core/glyphs.ts"
import type { ContractsCapability, SimulationCapability, TransactionCapability } from "@nulo/wallet-bridge"
import {
	authorizationsEffective,
	coversAnyContract,
	fieldAddressKey,
	isAnyContractScope,
	isFieldAddress,
	sameFieldAddress,
} from "@nulo/wallet-bridge"
import { isObjectLike } from "@nulo/wallet-core/utils"

export type RowKey =
	| "account-address"
	| "simulation"
	| "contracts"
	| "contract-details"
	| "contract-classes"
	| "authorizations"
	| "address-book"
	| "private-events"
	| "unknown"
	| "transaction"

/** The order rows take inside a group, as the row list draws them. */
export const ROW_ORDER: readonly RowKey[] = [
	"account-address",
	"simulation",
	"contracts",
	"contract-details",
	"contract-classes",
	"authorizations",
	"address-book",
	"private-events",
	"unknown",
	"transaction",
]

export type RowGroup = "without-asking" | "if-you-allow" | "always-asks"

/** What always asks leads, so the window's guarantee reads before what the app may do alone. */
export const GROUP_ORDER: readonly RowGroup[] = ["always-asks", "if-you-allow", "without-asking"]

export const GROUP_LABELS: Record<RowGroup, string> = {
	"without-asking": "Without asking, it can",
	"if-you-allow": "If you allow, it can",
	"always-asks": "Always asks you first",
}

/** A `term` segment is the visible word of the dotted "authorization" glossary entry. */
export type SubSegment = { text: string } | { term: string }

export type PermissionRowEntry = {
	key: RowKey
	group: RowGroup
	icon: GlyphName
	title: string
	/** The line under the title; a switch row reads it while on, and `subOff` while off. */
	subOn?: SubSegment[]
	subOff?: SubSegment[]
	/** The switch's accessible name; a row without one has no switch. */
	switchLabel?: string
	flagged: boolean
	chip?: string
}

export const ANY_CONTRACT = "Any contract"
export const ANY_CLASS = "Any class"

/** A contract the wallet names, its address lower-cased. */
export type KnownName = { address: string; name: string }

/** A listed contract keyed as the scope check compares it; any other string by its lower case,
 *  which can only overstate reach. */
export function contractKey(contract: string): string {
	return fieldAddressKey(contract) ?? contract.toLowerCase()
}

/** One listed contract the wallet names reads as its name; anything else is counted, so a title
 *  never grows with the request and two spellings of one address count once. */
export function reachOf(contracts: readonly string[], names: readonly KnownName[]): string {
	const keys = new Set(contracts.map(contractKey))
	const [only] = keys
	const name = keys.size === 1 ? names.find((entry) => entry.address === only)?.name : undefined
	return name ?? `${keys.size} ${keys.size === 1 ? "contract" : "contracts"}`
}

const DATA_OFF: SubSegment[] = [{ text: "Not shared. The app may ask again later." }]
const AUTH_ON: SubSegment[] = [{ text: "Nulo signs its " }, { term: "authorizations" }, { text: " without asking." }]
const AUTH_OFF: SubSegment[] = [{ text: "You confirm each " }, { term: "authorization" }, { text: " first." }]
const AUTH_BROAD_ON: SubSegment[] = [{ text: "For any call, on any contract." }]
const AUTH_BROAD_OFF: SubSegment[] = [
	{ text: "You confirm each " },
	{ term: "authorization" },
	{ text: " first. Off because it listed any contract." },
]
const PRIVATE_BALANCES: SubSegment[] = [{ text: "Results can include your private balances." }]
const EVENTS_ON: SubSegment[] = [{ text: "Private messages its contracts sent to your accounts, like a transfer you received." }]
const UNKNOWN_SUB: SubSegment[] = [{ text: "Nulo can't tell you what it allows." }]

/** The segments as one plain string, for surfaces that show no dotted term. */
export function plainText(segments: readonly SubSegment[] | undefined): string {
	return (segments ?? []).map((segment) => ("term" in segment ? segment.term : segment.text)).join("")
}

const LISTING_SUB: SubSegment[] = [{ text: "It always knows the account you connect with." }]

/** `canGet` controls listing only: a session with a simulation grant learns its account from any
 *  simulation's results. */
export function accountAddressRow(): PermissionRowEntry {
	return {
		key: "account-address",
		group: "without-asking",
		icon: "eye",
		title: "Let this app list all your accounts",
		subOn: LISTING_SUB,
		flagged: false,
	}
}

/** Either sub-scope reaching any contract makes the row "any contract"; only transactions can
 *  make authorizations broad, since utilities never authorize a call intent. */
export function simulationRow(cap: SimulationCapability): PermissionRowEntry {
	const scopes = [cap.transactions, cap.utilities].filter((holder) => holder !== undefined)
	const any = scopes.some((holder) => isAnyContractScope(holder.scope))
	return {
		key: "simulation",
		group: "without-asking",
		icon: "play",
		title: any ? "Run simulations on any contract" : "Run simulations and read the results",
		subOn: PRIVATE_BALANCES,
		flagged: any,
		...(any ? { chip: ANY_CONTRACT } : {}),
	}
}

/** Registering implies reading metadata, so a request with both shows only the add row. */
export function contractsRow(cap: ContractsCapability, names: readonly KnownName[]): PermissionRowEntry | undefined {
	if (cap.canRegister === true) {
		const any = cap.contracts === "*"
		return {
			key: "contracts",
			group: "without-asking",
			icon: "add",
			title: any ? "Add any contract to your wallet" : "Add contracts to your wallet",
			flagged: any,
			...(any ? { chip: ANY_CONTRACT } : {}),
		}
	}
	if (cap.canGetMetadata === true) {
		const listed = Array.isArray(cap.contracts) ? cap.contracts : undefined
		return {
			key: "contract-details",
			group: "without-asking",
			icon: "info",
			title: listed ? `See details of ${reachOf(listed, names)} in your wallet` : "See details of any contract in your wallet",
			flagged: listed === undefined,
			...(listed ? {} : { chip: ANY_CONTRACT }),
		}
	}
	return undefined
}

/** Classes have no names, so a list is only counted. A lookup answers from two sources: the node, on
 *  whether the class is published, and this wallet's own records, on whether it holds the artifact. */
export function contractClassesRow(networkName: string, classes: "*" | readonly string[]): PermissionRowEntry {
	const count = Array.isArray(classes) ? new Set(classes.map(contractKey)).size : undefined
	return {
		key: "contract-classes",
		group: "without-asking",
		icon: "code",
		title:
			count === undefined
				? `Look up contract code on ${networkName}`
				: `Look up the code of ${count} contract ${count === 1 ? "class" : "classes"} on ${networkName}`,
		subOn: [{ text: "Whether it is on chain, and if this wallet has its code." }],
		flagged: count === undefined,
		...(count === undefined ? { chip: ANY_CLASS } : {}),
	}
}

/** With no transaction or simulation scope every authorization asks, so a switch would do
 *  nothing and the row says so instead. */
export function authorizationsRow(state: { broad: boolean; noScope: boolean }): PermissionRowEntry {
	const base = { key: "authorizations", icon: "signature", title: "Act for you in transactions you approve" } as const
	if (state.noScope) return { ...base, group: "always-asks", subOn: AUTH_OFF, flagged: false }
	return {
		...base,
		group: "if-you-allow",
		subOn: state.broad ? AUTH_BROAD_ON : AUTH_ON,
		subOff: state.broad ? AUTH_BROAD_OFF : AUTH_OFF,
		switchLabel: "Authorizations without asking",
		flagged: state.broad,
	}
}

export function addressBookRow(state: { broadRequest: boolean }): PermissionRowEntry {
	return {
		key: "address-book",
		group: "if-you-allow",
		icon: "contacts",
		title: "See your address book",
		subOn: [{ text: "Every name and address you saved." }],
		subOff: DATA_OFF,
		switchLabel: "Share address book",
		flagged: state.broadRequest,
	}
}

export function privateEventsRow(contracts: "*" | readonly string[], names: readonly KnownName[]): PermissionRowEntry {
	const listed = Array.isArray(contracts) ? contracts : undefined
	const any = listed === undefined
	return {
		key: "private-events",
		group: "if-you-allow",
		icon: "mail-lock",
		title: listed ? `See private events from ${reachOf(listed, names)}` : "See private events from any contract",
		subOn: EVENTS_ON,
		subOff: DATA_OFF,
		switchLabel: "Share private events",
		flagged: any,
		...(any ? { chip: ANY_CONTRACT } : {}),
	}
}

export function unknownRow(count: number, state: { broadRequest: boolean }): PermissionRowEntry {
	return {
		key: "unknown",
		group: "if-you-allow",
		icon: "help",
		title: `Use ${count} ${count === 1 ? "permission" : "permissions"} Nulo doesn't recognize`,
		subOn: UNKNOWN_SUB,
		subOff: UNKNOWN_SUB,
		switchLabel: "Unknown permission",
		flagged: state.broadRequest,
	}
}

export function transactionRow(cap: TransactionCapability, names: readonly KnownName[]): PermissionRowEntry {
	const scope = Array.isArray(cap.scope) && !isAnyContractScope(cap.scope) ? cap.scope : undefined
	return {
		key: "transaction",
		group: "always-asks",
		icon: "check",
		title: `Every transaction, on ${
			scope
				? reachOf(
						scope.map((pattern) => pattern.contract),
						names,
					)
				: "any contract"
		}`,
		flagged: false,
	}
}

/** A request whose transactions or simulations reach any contract: the address-book and unknown
 *  rows are flagged only then. */
export function isBroadRequest(caps: readonly unknown[]): boolean {
	return (
		coversAnyContract(caps) ||
		caps.some((cap) => isObjectLike(cap) && cap.type === "simulation" && simulationRow(cap as SimulationCapability).flagged)
	)
}

/** Mirrors the dispatcher: without a transaction or `simulation.transactions` scope no call intent
 *  is ever covered, so every authorization opens the confirmation window. */
export function holdsCallScope(caps: readonly unknown[]): boolean {
	return caps.some((cap) => {
		if (!isObjectLike(cap)) return false
		if (cap.type === "transaction") return true
		return cap.type === "simulation" && isObjectLike(cap.transactions) && Boolean(cap.transactions.scope)
	})
}

export function holdsCanCreateAuthWit(caps: readonly unknown[]): boolean {
	return caps.some((cap) => isObjectLike(cap) && cap.type === "accounts" && Boolean(cap.canCreateAuthWit))
}

/**
 * The authorizations switch's starting state. A first grant starts On unless the grants reach any
 * contract; a re-request starts from the consent the window was opened with, over the grants the
 * app would hold after Allow.
 */
export function authorizationsDefault(input: { firstGrant: boolean; consent: unknown; resulting: readonly unknown[] }): boolean {
	if (input.firstGrant) return !coversAnyContract(input.resulting)
	return authorizationsEffective(input.consent, input.resulting)
}

/** A consent that signs silently today but would stop once the request widens the scopes to any
 *  contract, so the window asks about it again. */
export function consentLostOnWidening(consent: unknown, held: readonly unknown[], resulting: readonly unknown[]): boolean {
	return holdsCanCreateAuthWit(held) && authorizationsEffective(consent, held) && !authorizationsEffective(consent, resulting)
}

/**
 * The private-events switch's starting state: On only when every listed contract is inside a call
 * scope of the grants after Allow, where the app already reaches it. A contract or scope the window
 * cannot place counts as outside, so the default fails Off.
 */
export function privateEventsDefault(contracts: "*" | readonly string[], resulting: readonly unknown[]): boolean {
	if (!Array.isArray(contracts)) return false
	const scopes = callScopes(resulting)
	return contracts.every((contract) => isFieldAddress(contract) && scopes.some((scope) => scopeReaches(scope, contract)))
}

/** The transaction and `simulation.transactions` scopes, as `holdsCallScope` counts them. */
function callScopes(caps: readonly unknown[]): unknown[] {
	return caps.flatMap((cap) => {
		if (!isObjectLike(cap)) return []
		if (cap.type === "transaction") return [cap.scope]
		return cap.type === "simulation" && isObjectLike(cap.transactions) ? [cap.transactions.scope] : []
	})
}

function scopeReaches(scope: unknown, contract: string): boolean {
	if (scope === "*") return true
	if (!Array.isArray(scope) || !scope.every(isPattern)) return false
	return scope.some((pattern) => pattern.contract === "*" || sameFieldAddress(pattern.contract, contract))
}

function isPattern(value: unknown): value is { contract: string; function: string } {
	return isObjectLike(value) && typeof value.contract === "string" && typeof value.function === "string"
}
