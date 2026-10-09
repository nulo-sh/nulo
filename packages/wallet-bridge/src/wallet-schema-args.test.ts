/**
 * The schema parse over every dispatchable method: one call per method that the arity guards let
 * through and the parse refuses, and one wire-valid call per method that passes. Every value is a
 * real Aztec object serialized as the SDK sends it.
 */
import { WalletSchema } from "@aztec-labs/aztec.js/wallet"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { getSchemaParameters, parseWithOptionals } from "@aztec-labs/foundation/schemas"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
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

	test("a method with no schema entry is refused", async () => {
		await expect(assertWalletSchemaArgs("notAMethod" as MethodName, [])).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
	})
})
