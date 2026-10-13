/**
 * The schema parse over every dispatchable method: one call per method that the arity guards let
 * through and the parse refuses, and one wire-valid call per method that passes. Every value is a
 * real Aztec object serialized as the SDK sends it.
 */
import { WalletSchema } from "@aztec-labs/aztec.js/wallet"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { getSchemaParameters, parseWithOptionals } from "@aztec-labs/foundation/schemas"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { Capsule } from "@aztec-labs/stdlib/tx"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import { describe, expect, test } from "vitest"
import { METHOD_REGISTRY, type MethodName } from "./method-descriptors"
import { onWire, wireArtifact, wireCall, wireEventQuery, wireInstance, wirePayload, withHeader } from "./testing/wire"
import { assertWalletSchemaArgs } from "./wallet-schema-args"

const ACCOUNT = onWire(AztecAddress.fromBigIntUnsafe(0x0an)) as string
const TOKEN = onWire(AztecAddress.fromBigIntUnsafe(0x0bn)) as string
const FIELD = onWire(new Fr(0x0cn)) as string
/** Above the field modulus, so a transform throws a plain error that quotes it; its digits must
 *  never reach the refusal. */
const SENTINEL_DIGITS = "5e17e15e17e1"
const OVER_MODULUS = `0xffffffff${SENTINEL_DIGITS}${"0".repeat(44)}`

const call = wireCall(TOKEN, "transfer", [5n])
const payload = wirePayload([call])
const content = { caller: ACCOUNT, contract: TOKEN, method: "transfer", args: [ACCOUNT, "5"] }
const without = (value: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key))

const REFUSED: Array<[MethodName, unknown[]]> = [
	["getContractMetadata", [OVER_MODULUS]],
	["getContractClassMetadata", [OVER_MODULUS]],
	["getPrivateEvents", [without(wireEventQuery(TOKEN)[0], "eventSelector"), wireEventQuery(TOKEN)[1]]],
	["registerSender", [ACCOUNT, 5]],
	["registerContract", [without(wireInstance(TOKEN), "salt")]],
	["registerContractClass", [without(wireArtifact(), "functions")]],
	["simulateTx", [wirePayload([without(call, "selector")]), { from: ACCOUNT }]],
	["executeUtility", [call, { scopes: ACCOUNT }]],
	["profileTx", [payload, { from: ACCOUNT }]],
	["sendTx", [wirePayload([{ ...call, args: [OVER_MODULUS] }]), { from: ACCOUNT }]],
	["createAuthWit", [ACCOUNT, { caller: ACCOUNT, call: without(call, "name") }]],
	["requestCapabilities", [{ version: "1.0", capabilities: [] }]],
	["registerToken", [ACCOUNT, OVER_MODULUS]],
	["isTokenRegistered", [12345]],
	["grantPublicAuthwit", [ACCOUNT, without(content, "args")]],
]

const ALLOWED: Array<[MethodName, unknown[]]> = [
	["getChainInfo", []],
	["getAddressBook", []],
	["getAccounts", []],
	["getWalletFeatures", []],
	["getContractMetadata", [TOKEN]],
	["getContractClassMetadata", [FIELD]],
	["getPrivateEvents", wireEventQuery(TOKEN)],
	["registerSender", [ACCOUNT, null]],
	["registerContract", [wireInstance(TOKEN)]],
	["registerContractClass", [wireArtifact()]],
	["simulateTx", [payload, { from: ACCOUNT }]],
	["executeUtility", [call, { scopes: [ACCOUNT] }]],
	["profileTx", [payload, { from: ACCOUNT, profileMode: "gates" }]],
	["sendTx", [payload, { from: "NO_FROM" }]],
	["createAuthWit", [ACCOUNT, { consumer: TOKEN, innerHash: FIELD }]],
	[
		"requestCapabilities",
		[
			withHeader({
				capabilities: [
					{ type: "data", addressBook: true },
					{ type: "x-vendor", anything: 1 },
				],
			}),
		],
	],
	["registerToken", [ACCOUNT, TOKEN]],
	["isTokenRegistered", [TOKEN, "an extra trailing argument"]],
	["grantPublicAuthwit", [ACCOUNT, content]],
	["batch", [[{ name: "getContractMetadata", args: [OVER_MODULUS] }]]],
]

describe("assertWalletSchemaArgs", () => {
	test("the tables cover every registry method, each method that takes arguments refused once", () => {
		expect(new Set(ALLOWED.map(([method]) => method))).toEqual(new Set(Object.keys(METHOD_REGISTRY)))
		const takesNoArgs = ["getChainInfo", "getAddressBook", "getAccounts", "getWalletFeatures", "batch"]
		expect(new Set(REFUSED.map(([method]) => method))).toEqual(
			new Set(Object.keys(METHOD_REGISTRY).filter((method) => !takesNoArgs.includes(method))),
		)
	})

	test("the parser's own error quotes the value (control for the no-leak rows)", async () => {
		const parameters = getSchemaParameters(WalletSchema.getContractMetadata)
		await expect(parseWithOptionals([OVER_MODULUS], parameters)).rejects.toThrow(SENTINEL_DIGITS)
	})

	test.each(REFUSED)("%s: a call the arity guards admit is refused with the fixed error and no cause", async (method, args) => {
		const guard = METHOD_REGISTRY[method].argSchema
		expect(guard === undefined || guard(args)).toBe(true)
		const error = await assertWalletSchemaArgs(method, args).then(
			() => undefined,
			(e: unknown) => e,
		)
		expect(error).toBeInstanceOf(InvalidWalletArgumentsError)
		const refusal = error as InvalidWalletArgumentsError
		expect(refusal.message).toBe(`Invalid arguments for wallet method: ${method}`)
		expect(refusal.cause).toBeUndefined()
		expect(JSON.stringify({ ...refusal, message: refusal.message, stack: refusal.stack })).not.toContain(SENTINEL_DIGITS)
	})

	test.each(ALLOWED)("%s: a wire-valid call passes", async (method, args) => {
		await expect(assertWalletSchemaArgs(method, args)).resolves.toBeUndefined()
	})

	test("requestCapabilities: a known type with a bad field is refused; a missing manifest asks for nothing", async () => {
		const badKnown = withHeader({ capabilities: [{ type: "contracts", contracts: [OVER_MODULUS], canRegister: true }] })
		await expect(assertWalletSchemaArgs("requestCapabilities", [badKnown])).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		await expect(assertWalletSchemaArgs("requestCapabilities", [null])).resolves.toBeUndefined()
	})

	test.each([
		["caller", { ...content, caller: "SENTINEL" }],
		["contract", { ...content, contract: "SENTINEL" }],
	])("grantPublicAuthwit: a %s that is not an address is refused", async (_key, refused) => {
		await expect(assertWalletSchemaArgs("grantPublicAuthwit", [ACCOUNT, refused])).rejects.toThrow(
			"Invalid arguments for wallet method: grantPublicAuthwit",
		)
	})

	const ownToString = JSON.parse('{"toString":"x"}')
	const deep = (leaf: unknown) => {
		let tree = leaf
		for (let depth = 0; depth < 100_000; depth++) tree = [tree]
		return tree
	}
	test.each<[string, unknown]>([
		["at the top of an argument", ownToString],
		["nested in an object", { inner: ownToString }],
		["inside an array", [ACCOUNT, ownToString]],
		["under an own __proto__ key", JSON.parse('{"__proto__":{"toString":"x"}}')],
		["at the bottom of a 100,000-deep tree", deep(ownToString)],
	])("an object with an own toString %s is refused", async (_label, value) => {
		await expect(assertWalletSchemaArgs("grantPublicAuthwit", [ACCOUNT, { ...content, args: [value] }])).rejects.toThrow(
			"Invalid arguments for wallet method: grantPublicAuthwit",
		)
	})

	test("a requestCapabilities manifest holding an own toString is refused", async () => {
		const manifest = withHeader({ capabilities: [{ type: "x-vendor", toString: "x" }] })
		await expect(assertWalletSchemaArgs("requestCapabilities", [manifest])).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
	})

	test("an artifact whose storage has a field named toString registers; the instance beside it is still walked", async () => {
		const artifact = { ...wireArtifact(), storageLayout: JSON.parse(`{"toString":{"slot":"${FIELD}"}}`) }
		await expect(assertWalletSchemaArgs("registerContract", [wireInstance(TOKEN), artifact])).resolves.toBeUndefined()
		await expect(assertWalletSchemaArgs("registerContractClass", [artifact])).resolves.toBeUndefined()
		const instance = { ...wireInstance(TOKEN), toString: "x" }
		await expect(assertWalletSchemaArgs("registerContract", [instance, artifact])).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
	})

	test("an own valueOf alone, and a 100,000-deep tree without an own toString, pass (controls)", async () => {
		const ownValueOf = JSON.parse('{"valueOf":"x"}')
		expect(String(ownValueOf)).toBe("[object Object]")
		const args = { ...content, args: [ownValueOf, deep(ACCOUNT)] }
		await expect(assertWalletSchemaArgs("grantPublicAuthwit", [ACCOUNT, args])).resolves.toBeUndefined()
	})

	test("a method with no schema entry is refused", async () => {
		await expect(assertWalletSchemaArgs("notAMethod" as MethodName, [])).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
	})
})

describe("assertWalletSchemaArgs — an address in another spelling", () => {
	/** The same 32 bytes as the JSON form of a Node `Buffer`, which the address schema also admits. */
	const bufferShaped = (address: string) => ({ type: "Buffer", data: [...Buffer.from(address.slice(2), "hex")] })
	const intent = (caller: unknown) => ({ caller, call })
	const override = (address: unknown) => ({ contracts: { [TOKEN]: { instance: { ...wireInstance(TOKEN), address } } } })

	/** Every argument position a check, handler, window or signer reads as an address. */
	const POSITIONS: Array<[string, MethodName, (address: unknown) => unknown[]]> = [
		["isTokenRegistered[0]", "isTokenRegistered", (a) => [a]],
		["registerToken[0]", "registerToken", (a) => [a, TOKEN]],
		["registerToken[1]", "registerToken", (a) => [ACCOUNT, a]],
		["createAuthWit[0]", "createAuthWit", (a) => [a, { consumer: TOKEN, innerHash: FIELD }]],
		["createAuthWit[1].consumer", "createAuthWit", (a) => [ACCOUNT, { consumer: a, innerHash: FIELD }]],
		["createAuthWit[1].caller", "createAuthWit", (a) => [ACCOUNT, intent(a)]],
		["createAuthWit[1].call.to", "createAuthWit", (a) => [ACCOUNT, { caller: ACCOUNT, call: { ...call, to: a } }]],
		["createAuthWit[1].caller, both branches", "createAuthWit", (a) => [ACCOUNT, { ...intent(a), consumer: TOKEN, innerHash: FIELD }]],
		["grantPublicAuthwit[0]", "grantPublicAuthwit", (a) => [a, content]],
		["grantPublicAuthwit[1].caller", "grantPublicAuthwit", (a) => [ACCOUNT, { ...content, caller: a }]],
		["grantPublicAuthwit[1].contract", "grantPublicAuthwit", (a) => [ACCOUNT, { ...content, contract: a }]],
		["sendTx[0].calls[0].to", "sendTx", (a) => [wirePayload([{ ...call, to: a }]), { from: ACCOUNT }]],
		["sendTx[1].from", "sendTx", (a) => [payload, { from: a }]],
		["simulateTx[1].overrides, a contract instance", "simulateTx", (a) => [payload, { from: ACCOUNT, overrides: override(a) }]],
		["executeUtility[0].to", "executeUtility", (a) => [{ ...call, to: a }, { scopes: [ACCOUNT] }]],
		["getContractMetadata[0]", "getContractMetadata", (a) => [a]],
		["getPrivateEvents[1].contractAddress", "getPrivateEvents", (a) => [wireEventQuery(TOKEN)[0], { contractAddress: a, scopes: [] }]],
		["registerSender[0]", "registerSender", (a) => [a, null]],
		["registerContract[0].address", "registerContract", (a) => [{ ...wireInstance(TOKEN), address: a }]],
	]

	test.each(POSITIONS)("%s: a Buffer-shaped address is refused", async (_label, method, args) => {
		await expect(assertWalletSchemaArgs(method, args(bufferShaped(TOKEN)))).rejects.toThrow(
			`Invalid arguments for wallet method: ${method}`,
		)
	})

	test.each(POSITIONS)("%s: the same address as the SDK writes it passes (control)", async (_label, method, args) => {
		await expect(assertWalletSchemaArgs(method, args(TOKEN))).resolves.toBeUndefined()
	})

	test.each([
		["base64", Buffer.from(TOKEN.slice(2), "hex").toString("base64")],
		["unprefixed hex", TOKEN.slice(2)],
		["upper-case hex", `0x${TOKEN.slice(2).toUpperCase()}`],
	])("registerToken[1]: an address in %s is refused", async (_label, spelling) => {
		await expect(assertWalletSchemaArgs("registerToken", [ACCOUNT, spelling])).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
	})

	test("registerContract: an instance without its address is refused, one with an artifact passes (control)", async () => {
		await expect(assertWalletSchemaArgs("registerContract", [without(wireInstance(TOKEN), "address")])).rejects.toBeInstanceOf(
			InvalidWalletArgumentsError,
		)
		await expect(assertWalletSchemaArgs("registerContract", [wireInstance(TOKEN), wireArtifact()])).resolves.toBeUndefined()
	})

	test("sendTx: a payload carrying a capsule, whose packed encoding holds an address, passes (control)", async () => {
		const capsule = onWire(new Capsule(AztecAddress.fromBigIntUnsafe(0x0bn), new Fr(1n), [new Fr(2n)]))
		await expect(assertWalletSchemaArgs("sendTx", [{ ...payload, capsules: [capsule] }, { from: ACCOUNT }])).resolves.toBeUndefined()
	})
})
