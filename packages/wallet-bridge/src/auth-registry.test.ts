import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { describe, expect, test } from "vitest"
import { isAuthRegistryGrantCall } from "./auth-registry"

const REGISTRY = STANDARD_AUTH_REGISTRY_ADDRESS.toString()
const OTHER = `0x${"0b".repeat(32)}`

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
