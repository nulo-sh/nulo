import { AppCapabilitiesSchema, CapabilitySchema, MessageHashOrIntentSchema, WalletSchema } from "@aztec-labs/aztec.js/wallet"
import { getSchemaParameters, parseWithOptionals } from "@aztec-labs/foundation/schemas"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { ContractInstanceWithAddressSchema } from "@aztec-labs/stdlib/contract"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import { applyNuloSchemaPatch } from "@nulo/wallet-sdk-schema-patch/apply"
import { isRecord } from "@nulo/wallet-core/utils"
import { projectRequestedCapabilities } from "./capability-negotiation"
import type { MethodName } from "./method-descriptors"

// biome-ignore lint/suspicious/noExplicitAny: WalletSchema entries are upstream-typed per method; only their input tuples are read here.
type SchemaEntry = any

/** A private patched copy: the global `WalletSchema` depends on the host's import order, and test
 *  files mock the `register` entry empty, so neither may turn this parse into a pass. */
const SCHEMA: Record<string, SchemaEntry> = { ...WalletSchema }
applyNuloSchemaPatch(SCHEMA)

/** Methods the schema parse does not cover, each with the reason. */
const NOT_PARSED: Partial<Record<MethodName, string>> = {
	batch: "each leg re-enters dispatch and is parsed there, after its own capability check",
}

/** The contract-artifact argument the own-`toString` walk skips: its `storageLayout` is keyed by the
 *  contract's storage-field names, where `toString` is legal, and the parse refuses an object in
 *  every artifact field the wallet reads as a string. */
const ARTIFACT_ARG: Partial<Record<MethodName, number>> = { registerContract: 1, registerContractClass: 0 }

const CAPABILITY_HEADER = AppCapabilitiesSchema.omit({ capabilities: true })
const KNOWN_CAPABILITY_TYPES: ReadonlySet<string> = new Set(CapabilitySchema.options.map((option) => option.shape.type.value))
const CALL_INTENT = MessageHashOrIntentSchema.options[1]

/**
 * Refuses an argument list the wallet API's schema refuses, after cutting it to the schema's own
 * arity (extra trailing args stay ignored). A pass/fail predicate: the parsed value is discarded,
 * so every later layer reads the exact wire args, which is why an address is admitted only in the
 * one spelling the parse writes for it. A method with no schema entry is refused, and every
 * refusal is one fixed error with no cause.
 */
export async function assertWalletSchemaArgs(method: MethodName, args: readonly unknown[]): Promise<void> {
	if (NOT_PARSED[method] !== undefined) return
	try {
		const parameters = getSchemaParameters(SCHEMA[method])
		const wire = args.slice(0, parameters.def.items.length)
		const withoutArtifact = (values: readonly unknown[]) => values.filter((_, index) => index !== ARTIFACT_ARG[method])
		assertNoOwnToString(withoutArtifact(wire))
		if (method === "requestCapabilities") {
			await parseCapabilityRequest(wire[0])
			return
		}
		const parsed = await parseWithOptionals(wire, parameters)
		assertCanonicalAddresses(withoutArtifact(parsed), withoutArtifact(wire))
		if (method === "createAuthWit") assertCanonicalAddresses(await parseCallIntentKeys(wire[1]), wire[1])
		// The method's schema takes a preimage and strips `address`, which the scope check and the
		// executor read.
		if (method === "registerContract") assertCanonicalAddresses(await ContractInstanceWithAddressSchema.parseAsync(wire[0]), wire[0])
	} catch {
		throw InvalidWalletArgumentsError.forMethod(method)
	}
}

/** Refuses an address the parse produced unless the wire carries exactly its `toString()`: readers
 *  compare and convert the raw wire value, so another spelling the schema admits (base64, a
 *  Buffer-shaped object, other hex) would get a second answer. A parsed object whose wire value is
 *  a primitive is a packed encoding (a capsule, a field) and is not entered. */
function assertCanonicalAddresses(parsed: unknown, wire: unknown): void {
	const pending: Array<[unknown, unknown]> = [[parsed, wire]]
	while (pending.length > 0) {
		const [value, onWire] = pending.pop() as [unknown, unknown]
		if (value instanceof AztecAddress) {
			if (onWire !== value.toString()) throw new Error("an address not in its canonical spelling")
			continue
		}
		if (!isTraversable(value) || (typeof onWire !== "object" && onWire !== undefined)) continue
		for (const [key, child] of Object.entries(value)) pending.push([child, (onWire as Record<string, unknown> | null)?.[key]])
	}
}

function isTraversable(value: unknown): value is object {
	return typeof value === "object" && value !== null && !ArrayBuffer.isView(value) && !(value instanceof Map) && !(value instanceof Set)
}

/** Wire args come from `JSON.parse`, so an own `toString` is data, never a function, and makes
 *  `String()` or a template literal over its object throw. An own `valueOf` alone falls back to the
 *  inherited `toString` and cannot. Iterative, since a hostile tree can be deeper than the stack. */
function assertNoOwnToString(root: unknown): void {
	const pending: unknown[] = [root]
	while (pending.length > 0) {
		const value = pending.pop()
		if (typeof value !== "object" || value === null) continue
		if (Object.hasOwn(value, "toString")) throw new Error("an argument with an own toString")
		for (const child of Object.values(value)) pending.push(child)
	}
}

/** An object manifest is a header and is parsed with every capability of a known type, through the
 *  schema and then the wallet's own stricter projection, so every bad field earns the same refusal.
 *  A capability of a type the schema does not know passes untouched, so the connect window can
 *  still show it as unknown. A missing manifest has no header to parse: it asks for nothing. */
async function parseCapabilityRequest(manifest: unknown): Promise<void> {
	if (manifest == null) return
	await CAPABILITY_HEADER.parseAsync(manifest)
	const capabilities = (manifest as Record<string, unknown>).capabilities
	if (!Array.isArray(capabilities)) throw new Error("capabilities must be an array")
	for (const capability of capabilities) {
		if (!isRecord(capability) || typeof capability.type !== "string") throw new Error("capability without a type")
		if (KNOWN_CAPABILITY_TYPES.has(capability.type)) await CapabilitySchema.parseAsync(capability)
	}
	projectRequestedCapabilities(capabilities)
}

/** The intent union takes its inner-hash branch first and strips other keys, while the scope check,
 *  the window and the signer all read the call branch whenever `caller` or `call` is present, so
 *  such an intent must parse as a call intent too. */
async function parseCallIntentKeys(intent: unknown): Promise<unknown> {
	if (isRecord(intent) && ("caller" in intent || "call" in intent)) return CALL_INTENT.parseAsync(intent)
	return undefined
}
