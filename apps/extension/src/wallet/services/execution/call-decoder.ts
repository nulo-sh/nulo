/**
 * Decodes a dApp call's field arguments against the contract artifact the PXE holds, for the
 * approval card. The selector ties the call to one function of that artifact, but the artifact is
 * the contract's own, so every name it yields is the contract's claim, not the wallet's. A call that
 * cannot be decoded says why and the card falls back to the raw fields. Display only — nothing
 * decoded here reaches execution.
 */

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import {
	type AbiDecoded,
	type AbiType,
	type ContractArtifact,
	type FunctionAbi,
	countArgumentsSize,
	decodeEachFromAbi,
	encodeArguments,
	isAztecAddressStruct,
	isBoundedVecStruct,
	isEthAddressStruct,
	isFunctionSelectorStruct,
	isOptionStruct,
	isWrappedFieldStruct,
} from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { AuthwitContent, DecodedCall, DecodedGrant, DecodedValue, DisplayCallInput } from "@nulo/wallet-bridge"
import { encodeAuthwitCall } from "./authwit-discoverer"
import { findFunctionByName, findFunctionBySelector } from "./contract-resolver"

export type ArtifactLookup = (contractAddress: string) => Promise<ContractArtifact | undefined>

/** A call past this many fields is not something a popup should decode row by row. */
const MAX_ARGS = 256
/** Leaves the card would have to hold for one call; an interface past this is not rendered. */
const MAX_DECODED_NODES = 1024
const MAX_TYPE_DEPTH = 32
const FIELD_RE = /^0x[0-9a-fA-F]{1,64}$/
const FIELD_TYPE: AbiType = { kind: "field" }

export async function decodeCallForDisplay(lookup: ArtifactLookup, call: DisplayCallInput): Promise<DecodedCall> {
	const artifact = await lookup(call.to).catch(() => undefined)
	if (!artifact) return { kind: "undecoded", reason: "unknown-contract" }
	const fn = await resolveFunction(artifact, call)
	if (!fn) return { kind: "undecoded", reason: "unknown-function" }
	return decodeFields(artifact, fn, toFields(call.args))
}

function decodeFields(artifact: ContractArtifact, fn: FunctionAbi, fields: Fr[] | undefined): DecodedCall {
	const types = fn.parameters.map((p) => p.type)
	if (types.reduce((n, t) => n + abiNodes(t), 0) > MAX_DECODED_NODES) return { kind: "undecoded", reason: "unavailable" }
	if (!fields || fields.length !== countArgumentsSize(fn)) return { kind: "undecoded", reason: "arguments" }
	try {
		const values = decodeEachFromAbi(types, fields)
		return {
			kind: "decoded",
			contract: artifact.name,
			fn: fn.name,
			params: fn.parameters.map((p, i) => ({ name: p.name, value: project(values[i], p.type) })),
		}
	} catch {
		return { kind: "undecoded", reason: "arguments" }
	}
}

/** A grant reads from the fields its message hash commits to, decoded against the function that
 *  encoded them (by name, as signing resolves it; another function may share its selector), and only
 *  when that decode encodes back to those fields. Only a `call`-kind content names a function to
 *  encode for; today's grant producer sends no other. */
export async function decodeGrantForDisplay(lookup: ArtifactLookup, content: AuthwitContent): Promise<DecodedGrant> {
	if (content?.kind !== "call" || typeof content.contract !== "string") return { kind: "undecoded", reason: "unavailable" }
	const artifact = await lookup(content.contract).catch(() => undefined)
	if (!artifact) return { kind: "undecoded", reason: "unknown-contract" }
	const fn = findFunctionByName(artifact, content.method)
	if (!fn) return { kind: "undecoded", reason: "unknown-function" }
	// The bound runs before encoding: a `str<N>` parameter encodes N fields whatever the argument.
	if (countArgumentsSize(fn) > MAX_ARGS) return { kind: "undecoded", reason: "arguments" }
	let call: DisplayCallInput
	let fields: Fr[]
	try {
		const encoded = await encodeAuthwitCall(fn, content.args)
		fields = encoded.fields
		call = {
			to: AztecAddress.fromStringUnsafe(content.contract).toString(),
			name: fn.name,
			selector: encoded.selector.toString(),
			args: fields.map((f) => f.toString()),
		}
	} catch {
		return { kind: "undecoded", reason: "arguments" }
	}
	const decoded = decodeFields(artifact, fn, fields)
	if (decoded.kind !== "decoded") return decoded
	return encodesBack(fn, fields) ? { kind: "decoded", call, decoded } : { kind: "undecoded", reason: "arguments" }
}

/** The decoder drops bits the encoder keeps (an `EthAddress` keeps 20 bytes, a boolean reads any
 *  nonzero field as true, a string character 16 bits), so two grants that sign different fields can
 *  decode alike; one whose decode does not encode back to its fields is not read. */
function encodesBack(fn: FunctionAbi, fields: readonly Fr[]): boolean {
	try {
		const values = decodeEachFromAbi(
			fn.parameters.map((p) => p.type),
			[...fields],
		)
		const again = encodeArguments(
			fn,
			values.map((v, i) => encodable(v, fn.parameters[i].type)),
		)
		return again.length === fields.length && again.every((f, i) => f.equals(fields[i]))
	} catch {
		return false
	}
}

/** A decoded value as the encoder takes it back: the two disagree only on a `BoundedVec`, which
 *  decodes as its `{ storage, len }` struct and encodes from its items. */
function encodable(value: AbiDecoded, type: AbiType): unknown {
	if (type.kind === "array") return Array.isArray(value) ? value.map((v) => encodable(v, type.type)) : value
	if (type.kind !== "struct" || decodesToInstance(type)) return value
	if (isOptionStruct(type)) return value === undefined ? undefined : encodable(value, type.fields[1].type)
	const record = (value ?? {}) as Record<string, AbiDecoded>
	if (isBoundedVecStruct(type)) return boundedVecItems(record, type)
	return Object.fromEntries(type.fields.map((f) => [f.name, encodable(record[f.name], f.type)]))
}

/** The structs the decoder returns as one value (an address, a selector, a field), not a record. */
const decodesToInstance = (type: AbiType): boolean =>
	isAztecAddressStruct(type) || isEthAddressStruct(type) || isFunctionSelectorStruct(type) || isWrappedFieldStruct(type)

function boundedVecItems(record: Record<string, AbiDecoded>, type: Extract<AbiType, { kind: "struct" }>): unknown[] {
	const storage = type.fields[0].type
	const items = Array.isArray(record.storage) ? record.storage.slice(0, Number(record.len)) : []
	return storage.kind === "array" ? items.map((v) => encodable(v, storage.type)) : items
}

/** A selector is what the PXE dispatches on, so it is the truth when present; the dApp-supplied name
 *  only stands in when there is no selector to check it against. */
async function resolveFunction(artifact: ContractArtifact, call: DisplayCallInput): Promise<FunctionAbi | undefined> {
	if (call.selector !== undefined) return findFunctionBySelector(artifact, call.selector).catch(() => undefined)
	return call.name !== undefined ? findFunctionByName(artifact, call.name) : undefined
}

/** How many leaves a value of `type` decodes into, one per array slot. The ABI, not the argument
 *  count, sets what `decodeEachFromAbi` allocates — an array of empty structs needs zero fields — so
 *  the bound is taken on the type before decoding. */
function abiNodes(type: AbiType, depth = 0): number {
	if (depth > MAX_TYPE_DEPTH) return Number.POSITIVE_INFINITY
	switch (type.kind) {
		case "array":
			return Math.max(1, type.length) * Math.max(1, abiNodes(type.type, depth + 1))
		case "tuple":
			return type.fields.reduce((n, f) => n + abiNodes(f, depth + 1), 1)
		case "struct":
			return type.fields.reduce((n, f) => n + abiNodes(f.type, depth + 1), 1)
		default:
			return 1
	}
}

function toFields(args: readonly string[]): Fr[] | undefined {
	if (!Array.isArray(args) || args.length > MAX_ARGS) return undefined
	if (!args.every((a) => typeof a === "string" && FIELD_RE.test(a))) return undefined
	try {
		return args.map((a) => Fr.fromString(a))
	} catch {
		return undefined
	}
}

function project(value: AbiDecoded, type: AbiType): DecodedValue {
	if (value === undefined) return { kind: "none" }
	if (type.kind === "struct") return projectStruct(value, type)
	if (type.kind === "array" || type.kind === "tuple") return projectList(value, type)
	if (type.kind === "boolean") return { kind: "boolean", value: value === true }
	if (type.kind === "string") return { kind: "string", value: String(value) }
	if (type.kind === "integer") return { kind: "integer", value: String(value) }
	return { kind: "field", value: fieldString(value) }
}

function projectStruct(value: AbiDecoded, type: Extract<AbiType, { kind: "struct" }>): DecodedValue {
	if (isAztecAddressStruct(type) || isEthAddressStruct(type)) return { kind: "address", value: String(value) }
	if (isFunctionSelectorStruct(type)) return { kind: "selector", value: String(value) }
	if (isWrappedFieldStruct(type)) return { kind: "field", value: fieldString(value) }
	if (isOptionStruct(type)) return project(value, type.fields[1].type)
	const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, AbiDecoded>
	return { kind: "struct", fields: type.fields.map((f) => ({ name: f.name, value: project(record[f.name], f.type) })) }
}

function projectList(value: AbiDecoded, type: Extract<AbiType, { kind: "array" | "tuple" }>): DecodedValue {
	const list = Array.isArray(value) ? value : []
	const typeAt = (i: number): AbiType => (type.kind === "array" ? type.type : (type.fields[i] ?? FIELD_TYPE))
	return { kind: "array", items: list.map((v, i) => project(v, typeAt(i))) }
}

/** A field prints as the 32-byte hex the wire carries, whether the decoder handed back a `bigint` or an `Fr`. */
function fieldString(value: AbiDecoded): string {
	if (typeof value === "bigint") return new Fr(value).toString()
	return String(value)
}
