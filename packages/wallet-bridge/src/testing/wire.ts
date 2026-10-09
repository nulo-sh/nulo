/**
 * dApp call arguments as the wire carries them: real Aztec objects serialized with `jsonStringify`,
 * which is what the wallet SDK sends. The dispatcher parses these against the wallet API's schema,
 * so a test that reaches past the parse needs them instead of friendly literals.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { FunctionCall, FunctionSelector, FunctionType } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { PublicKeys } from "@aztec-labs/stdlib/keys"
import { ExecutionPayload } from "@aztec-labs/stdlib/tx"

/** A value as the dApp channel delivers it. */
export function onWire<T>(value: T): unknown {
	return JSON.parse(jsonStringify(value))
}

/** One function call on the wire; `args` are field values. */
export function wireCall(to: string, name: string, args: readonly bigint[] = []): Record<string, unknown> {
	const call = new FunctionCall(
		name,
		AztecAddress.fromStringUnsafe(to),
		FunctionSelector.fromField(new Fr(0x1234n)),
		FunctionType.PRIVATE,
		false,
		false,
		args.map((arg) => new Fr(arg)),
	)
	return onWire(call) as Record<string, unknown>
}

/** An execution payload of the given wire calls, as `sendTx`, `simulateTx` and `profileTx` take it. */
export function wirePayload(calls: readonly Record<string, unknown>[], feePayer?: string): Record<string, unknown> {
	const payload = onWire(ExecutionPayload.empty()) as Record<string, unknown>
	return { ...payload, calls: [...calls], ...(feePayer === undefined ? {} : { feePayer }) }
}

/** A contract instance preimage with its address, as `registerContract` takes it. */
export function wireInstance(address: string): Record<string, unknown> {
	const preimage = {
		version: 2,
		salt: new Fr(7n),
		deployer: AztecAddress.ZERO,
		originalContractClassId: new Fr(8n),
		initializationHash: new Fr(9n),
		immutablesHash: new Fr(10n),
		publicKeys: PublicKeys.default(),
	}
	return { ...(onWire(preimage) as Record<string, unknown>), address }
}

/** A 32-byte address whose every byte is `byte`, lower-case as the wire carries it. */
export function wireAddress(byte: string): string {
	return `0x${byte.repeat(32)}`
}

/** A capability request with the header the dispatcher parses before any window opens. */
export function withHeader<T extends object>(manifest: T): T & { version: "1.0"; metadata: { name: string; version: string } } {
	return { version: "1.0", metadata: { name: "Test dApp", version: "1.0.0" }, ...manifest }
}

/** `getPrivateEvents`' two arguments for one contract's events. */
export function wireEventQuery(contractAddress: string): [Record<string, unknown>, Record<string, unknown>] {
	return [
		{ eventSelector: "0x00000001", abiType: { kind: "field" }, fieldNames: ["amount"] },
		{ contractAddress, scopes: [] },
	]
}

/** The smallest artifact the schema accepts, for a call that must get past the parse. */
export function wireArtifact(): Record<string, unknown> {
	return {
		name: "Empty",
		functions: [],
		nonDispatchPublicFunctions: [],
		outputs: { structs: {}, globals: {} },
		storageLayout: {},
		fileMap: {},
	}
}
