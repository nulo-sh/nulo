import { AppCapabilitiesSchema, CapabilitySchema, WalletSchema } from "@aztec-labs/aztec.js/wallet"
import { getSchemaParameters, parseWithOptionals } from "@aztec-labs/foundation/schemas"
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

const CAPABILITY_HEADER = AppCapabilitiesSchema.omit({ capabilities: true })
const KNOWN_CAPABILITY_TYPES: ReadonlySet<string> = new Set(CapabilitySchema.options.map((option) => option.shape.type.value))

/**
 * Refuses an argument list the wallet API's schema refuses, after cutting it to the schema's own
 * arity (extra trailing args stay ignored). A pass/fail predicate: the parsed value is discarded,
 * so every later layer reads the exact wire args. A method with no schema entry is refused, and
 * every refusal is one fixed error with no cause.
 */
export async function assertWalletSchemaArgs(method: MethodName, args: readonly unknown[]): Promise<void> {
	if (NOT_PARSED[method] !== undefined) return
	try {
		if (method === "requestCapabilities") {
			await parseCapabilityRequest(args[0])
			return
		}
		const parameters = getSchemaParameters(SCHEMA[method])
		await parseWithOptionals(args.slice(0, parameters.def.items.length), parameters)
	} catch {
		throw InvalidWalletArgumentsError.forMethod(method)
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
