// @vitest-environment node

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { describe, expect, test } from "vitest"
import { FrozenSchnorrAccountArtifact } from "../account/frozen-artifact"
import { NuloAccount } from "../account/nulo-account"
import { assertWireArtifactClassId } from "./artifact-class-id"

const MISMATCH = "Contract artifact doesn't match instance's current class id"
const seed = Fr.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000002")

type WireFunction = { name: string; functionType: string; verificationKey?: string }
type WireArtifact = { functions: WireFunction[] }

/** The genuine pair in the JSON form a backup file carries. */
async function genuinePair(): Promise<{ instance: Record<string, unknown>; artifact: WireArtifact }> {
	const account = await NuloAccount.new(seed, { log: () => {} })
	const instance = (account as unknown as { instance: ContractInstanceWithAddress }).instance
	return { instance: JSON.parse(jsonStringify(instance)), artifact: JSON.parse(jsonStringify(FrozenSchnorrAccountArtifact)) }
}

function firstPrivate(artifact: WireArtifact): WireFunction {
	const fn = artifact.functions.find((f) => f.functionType === "private")
	if (!fn) throw new Error("fixture has no private function")
	return fn
}

describe("assertWireArtifactClassId", () => {
	test("the genuine pair passes", async () => {
		const { instance, artifact } = await genuinePair()
		await expect(assertWireArtifactClassId(instance, artifact)).resolves.toBeUndefined()
	}, 60_000)

	test.each<[string, (pair: Awaited<ReturnType<typeof genuinePair>>) => unknown]>([
		["an artifact of another class id", ({ artifact }) => (firstPrivate(artifact).name = "entrypoint_altered")],
		[
			"an artifact whose private function lacks its verification key",
			({ artifact }) => {
				const fn = firstPrivate(artifact)
				fn.name = "transfer_timeout_refused"
				fn.verificationKey = undefined
			},
		],
		["an artifact that fails the schema parse", ({ artifact }) => Object.assign(artifact, { functions: "none" })],
		["an instance that fails the schema parse", ({ instance }) => (instance.currentContractClassId = undefined)],
	])(
		"refuses %s with the fixed text",
		async (_label, tamper) => {
			const pair = await genuinePair()
			tamper(pair)
			const refusal = await assertWireArtifactClassId(pair.instance, pair.artifact).then(
				() => undefined,
				(err: Error) => err,
			)
			expect(refusal?.message).toBe(MISMATCH)
		},
		60_000,
	)
})
