import { AuthRegistryArtifact } from "@aztec-labs/standard-contracts/auth-registry"
import { FunctionSelector } from "@aztec-labs/stdlib/abi"
import { describe, expect, test } from "vitest"
import { AUTH_REGISTRY_GRANT_SELECTORS } from "./auth-registry"

describe("the pinned grant selectors", () => {
	test.each(["set_authorized", "set_reject_all", "set_authorized_private"])("%s is pinned as the artifact computes it", async (name) => {
		const fn = [...AuthRegistryArtifact.functions, ...(AuthRegistryArtifact.nonDispatchPublicFunctions ?? [])].find(
			(f) => f.name === name,
		)
		expect(fn).toBeDefined()
		const computed = await FunctionSelector.fromNameAndParameters(name, fn?.parameters ?? [])
		expect(AUTH_REGISTRY_GRANT_SELECTORS.has(computed.toString())).toBe(true)
	})

	test("the set holds exactly the three grant selectors", () => {
		expect(AUTH_REGISTRY_GRANT_SELECTORS.size).toBe(3)
	})
})
