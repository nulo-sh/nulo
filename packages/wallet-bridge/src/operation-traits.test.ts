import { describe, expect, test } from "vitest"
import { OPERATION_TRAITS, carriesFeeSettings, isAccountScoped, isNetworkScoped, operationTraits } from "./operation-traits"

const PROTOTYPE_NAMES = ["constructor", "__proto__", "toString", "hasOwnProperty"]

describe("operationTraits", () => {
	test("answers each of the 18 kinds with its own entry", () => {
		const kinds = Object.keys(OPERATION_TRAITS) as (keyof typeof OPERATION_TRAITS)[]
		expect(kinds).toHaveLength(18)
		for (const kind of kinds) expect(operationTraits(kind)).toBe(OPERATION_TRAITS[kind])
	})

	test.each([...PROTOTYPE_NAMES, "aztec_unknown", "", 5, undefined])("names no kind for %o", (kind) => {
		expect(operationTraits(kind)).toBeUndefined()
	})

	test.each(PROTOTYPE_NAMES)("a %s kind is neither scope and carries no fee settings", (kind) => {
		const op = { kind }
		expect(isNetworkScoped(op)).toBe(false)
		expect(isAccountScoped(op)).toBe(false)
		expect(carriesFeeSettings(op)).toBe(false)
	})
})

describe("carriesFeeSettings", () => {
	test("is false for an absent element, true for the two sends", () => {
		expect(carriesFeeSettings(null)).toBe(false)
		expect(carriesFeeSettings(undefined)).toBe(false)
		expect(carriesFeeSettings({ kind: "send_transaction" })).toBe(true)
		expect(carriesFeeSettings({ kind: "aztec_sendTx" })).toBe(true)
		expect(carriesFeeSettings({ kind: "simulate_transaction" })).toBe(false)
	})
})
