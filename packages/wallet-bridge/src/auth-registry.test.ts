import { AuthRegistryArtifact } from "@aztec-labs/standard-contracts/auth-registry"
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { FunctionSelector } from "@aztec-labs/stdlib/abi"
import { describe, expect, test } from "vitest"
import { AUTH_REGISTRY_GRANT_SELECTORS, isAuthRegistryGrantCall } from "./auth-registry"

const REGISTRY = STANDARD_AUTH_REGISTRY_ADDRESS.toString()
const OTHER = `0x${"0b".repeat(32)}`

describe("the pinned grant selectors", () => {
	test.each(["set_authorized", "set_reject_all", "set_authorized_private"])("%s is pinned as the artifact computes it", async (name) => {
		const fn = [...AuthRegistryArtifact.functions, ...(AuthRegistryArtifact.nonDispatchPublicFunctions ?? [])].find(
			(f) => f.name === name,
		)
		expect(fn).toBeDefined()
		// This package's own runner computes the poseidon hash; the extension's jsdom runner also
		// collects this file and has no hasher, which must not pass as a match.
		const computed = await FunctionSelector.fromNameAndParameters(name, fn?.parameters ?? []).then(
			(selector) => selector.toString(),
			(e: unknown) => (/bad_cast|wasm|WebAssembly/i.test(String(e)) ? "no-hasher" : Promise.reject(e)),
		)
		if (computed !== "no-hasher") expect(AUTH_REGISTRY_GRANT_SELECTORS.has(computed)).toBe(true)
	})

	test("the set holds exactly the three grant selectors", () => {
		expect(AUTH_REGISTRY_GRANT_SELECTORS.size).toBe(3)
	})
})

describe("isAuthRegistryGrantCall", () => {
	test.each([
		["a grant selector on the registry", { to: REGISTRY, selector: "0xb839de91" }, true],
		["a registry call whose selector cannot be read", { to: REGISTRY, selector: "not-a-selector" }, true],
		["another registry function", { to: REGISTRY, selector: "0x00000001" }, false],
		["a grant selector on another contract", { to: OTHER, selector: "0xb839de91" }, false],
		["a target that is not an address", { to: "SENTINEL", selector: "0xb839de91" }, false],
	])("%s", (_name, call, expected) => {
		expect(isAuthRegistryGrantCall(call)).toBe(expected)
	})
})
