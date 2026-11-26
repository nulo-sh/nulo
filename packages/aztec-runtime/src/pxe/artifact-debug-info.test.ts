// @vitest-environment node

import { readFileSync } from "node:fs"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { type ContractArtifact, ContractArtifactSchema, loadContractArtifact } from "@aztec-labs/stdlib/abi"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import { describe, expect, test } from "vitest"
import { FrozenSchnorrAccountArtifact } from "../account/frozen-artifact"
import { withoutDebugInfo } from "./artifact-debug-info"

/** The aztec-standards Token as compiled, debug info included: the build strips its own copy. */
function compiledToken(): ContractArtifact {
	const file = resolvePackageAsset("@aztec-foundation/aztec-standards", "artifacts/target/token_contract-Token.json", {
		from: import.meta.url,
	})
	return loadContractArtifact(JSON.parse(readFileSync(file, "utf8")))
}

const classId = async (artifact: ContractArtifact) => (await getContractClassFromArtifact(artifact)).id.toString()

describe("withoutDebugInfo", () => {
	test.each<[string, () => ContractArtifact]>([
		["the aztec-standards Token", compiledToken],
		["the Schnorr account", () => FrozenSchnorrAccountArtifact],
	])(
		"leaves %s's class id unchanged, in the loaded and the wire form",
		async (_label, load) => {
			const artifact = load()
			const stripped = withoutDebugInfo(artifact)
			const wire = withoutDebugInfo(JSON.parse(jsonStringify(artifact)))
			expect(await classId(stripped)).toBe(await classId(artifact))
			expect(await classId(await ContractArtifactSchema.parseAsync(wire))).toBe(await classId(artifact))
		},
		60_000,
	)

	test("keeps no debug info and shrinks an artifact compiled with it, leaving the input untouched", () => {
		const artifact = compiledToken()
		const before = jsonStringify(artifact)
		expect(artifact.functions.some((fn) => fn.debugSymbols.length > 0)).toBe(true)
		const stripped = withoutDebugInfo(artifact)
		expect(stripped.functions.every((fn) => fn.debugSymbols === "" && !("debug" in fn))).toBe(true)
		expect(stripped.fileMap).toEqual({})
		expect(jsonStringify(stripped).length).toBeLessThan(before.length / 2)
		expect(jsonStringify(artifact)).toBe(before)
	})
})
