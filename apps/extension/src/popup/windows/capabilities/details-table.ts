/**
 * The Details table: every contract and contract class the grants reach, once, with a mark per
 * permission that includes it and the functions each call permission lists for it. Pure, over the
 * grants the app would hold after Allow and the contracts the wallet names, so a retained grant is
 * listed and a name never comes from the request.
 */
import { isObjectLike } from "@nulo/wallet-core/utils"
import { ANY_CONTRACT, contractKey, type KnownName } from "./permission-rows"

export type DetailsRow = {
	/** The contract or class id as the app sent it; absent on the "Any contract" row. */
	address?: string
	/** The wallet's name for it, or "Any contract"; absent for a contract the wallet doesn't know. */
	name?: string
	/** Each column's functions as sent, "*" read as "Any function"; empty when not in the column. */
	simulate: string[]
	add: boolean
	transact: string[]
	details: boolean
	events: boolean
	code: boolean
}

export type DetailsTable = {
	known: DetailsRow[]
	unknown: DetailsRow[]
	/** Classes have no names, so they are listed apart and never named. */
	classes: DetailsRow[]
	anyContract: DetailsRow | null
	/** What follows "Details ·". */
	label: string
}

const ANY_FUNCTION = "Any function"

type Collected = { listed: Map<string, DetailsRow>; classes: Map<string, DetailsRow>; anyContract: DetailsRow | null }

const emptyRow = (fields: { address?: string; name?: string }): DetailsRow => ({
	...fields,
	simulate: [],
	add: false,
	transact: [],
	details: false,
	events: false,
	code: false,
})

export function buildDetailsTable(grants: readonly unknown[], knownContracts: readonly KnownName[]): DetailsTable {
	const into: Collected = { listed: new Map(), classes: new Map(), anyContract: null }
	for (const cap of grants) if (isObjectLike(cap)) collect(into, cap)
	const names = new Map(knownContracts.map((entry) => [entry.address, entry.name]))
	const rows = [...into.listed.entries()].map(([key, row]) => {
		const name = names.get(key)
		return name === undefined ? row : { ...row, name }
	})
	const classes = [...into.classes.values()]
	return {
		known: rows.filter((row) => row.name !== undefined),
		unknown: rows.filter((row) => row.name === undefined),
		classes,
		anyContract: into.anyContract,
		label: tableLabel(rows.length, classes.length, into.anyContract !== null),
	}
}

function collect(into: Collected, cap: Record<string, unknown>): void {
	switch (cap.type) {
		case "simulation":
			for (const part of [cap.transactions, cap.utilities]) if (isObjectLike(part)) addScope(into, part.scope, "simulate")
			break
		case "transaction":
			addScope(into, cap.scope, "transact")
			break
		case "contracts":
			collectContracts(into, cap)
			break
		case "data":
			collectEvents(into, cap.privateEvents)
			break
		case "contractClasses":
			collectClasses(into, cap)
			break
	}
}

/** A scope or pattern the wallet cannot read as one contract shows as any contract, so the table
 *  never shows less reach than the grant could have. */
function addScope(into: Collected, scope: unknown, column: "simulate" | "transact"): void {
	const patterns = Array.isArray(scope) ? scope : [{ contract: "*", function: "*" }]
	for (const pattern of patterns) {
		const record = isObjectLike(pattern) ? pattern : {}
		const fn = typeof record.function === "string" && record.function !== "*" ? record.function : ANY_FUNCTION
		const list = rowFor(into, record.contract)[column]
		if (!list.includes(fn)) list.push(fn)
	}
}

/** Each mark follows its own flag, as the dispatcher checks `canRegister` and `canGetMetadata` apart. */
function collectContracts(into: Collected, cap: Record<string, unknown>): void {
	if (cap.canRegister !== true && cap.canGetMetadata !== true) return
	for (const contract of listOrAny(cap.contracts)) {
		const row = rowFor(into, contract)
		if (cap.canRegister === true) row.add = true
		if (cap.canGetMetadata === true) row.details = true
	}
}

function collectEvents(into: Collected, privateEvents: unknown): void {
	if (!isObjectLike(privateEvents)) return
	for (const contract of listOrAny(privateEvents.contracts)) rowFor(into, contract).events = true
}

function collectClasses(into: Collected, cap: Record<string, unknown>): void {
	if (cap.canGetMetadata !== true) return
	for (const id of listOrAny(cap.classes)) {
		if (typeof id !== "string" || id === "*") {
			anyRow(into).code = true
			continue
		}
		const key = contractKey(id)
		const row = into.classes.get(key) ?? emptyRow({ address: id })
		row.code = true
		into.classes.set(key, row)
	}
}

/** A list as sent; anything else, "*" included, reads as any. */
function listOrAny(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : ["*"]
}

function anyRow(into: Collected): DetailsRow {
	into.anyContract ??= emptyRow({ name: ANY_CONTRACT })
	return into.anyContract
}

/** One row per contract, in the order the grants first name it, keyed as `contractKey` keys it. */
function rowFor(into: Collected, contract: unknown): DetailsRow {
	if (typeof contract !== "string" || contract === "*") return anyRow(into)
	const key = contractKey(contract)
	const row = into.listed.get(key) ?? emptyRow({ address: contract })
	into.listed.set(key, row)
	return row
}

/** Contracts are counted; a table with no contract row counts its classes in their own words. */
function tableLabel(listedCount: number, classCount: number, reachesAny: boolean): string {
	if (reachesAny) return "any contract"
	if (listedCount === 0 && classCount > 0) return `${classCount} ${classCount === 1 ? "contract class" : "contract classes"}`
	return `${listedCount} ${listedCount === 1 ? "contract" : "contracts"}`
}
