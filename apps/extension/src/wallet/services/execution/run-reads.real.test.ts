// @vitest-environment node
/**
 * A build's reads against the REAL account's asks: a read sent ahead answers the build only when
 * its key is the one `NuloAccount` produces, so a change to the account's arguments reds here
 * instead of silently turning every read sent ahead into one more request. Node environment because
 * foundation's poseidon fails under jsdom.
 */

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { GasFees } from "@aztec-labs/stdlib/gas"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { NuloAccount } from "@nulo/aztec-runtime/account"
import { beforeAll, describe, expect, test, vi } from "vitest"
import { feeCapFor } from "./fee/fee-cap"
import { RunReads } from "./run-reads"

const setup = () => {
	const asked = {
		getPredictedMinFees: vi.fn(async (_usage?: string) => [new GasFees(3n, 5n)]),
		getCurrentMinFees: vi.fn(async () => new GasFees(3n, 5n)),
		getNullifierMembershipWitness: vi.fn(async (_block: string, _nullifier: Fr): Promise<unknown> => ({ found: true })),
	}
	return { node: asked as unknown as AztecNode, asked, reads: new RunReads() }
}

describe("two builds and a cap, on the real account", () => {
	let nulo: NuloAccount

	beforeAll(async () => {
		nulo = await NuloAccount.new(new Fr(42n), { log: () => {} } as never, "account")
		// The subject is what the account asks the node; registration and both build tails are
		// stubbed on the instance so no PXE or entrypoint machinery runs.
		const seams = nulo as unknown as Record<string, unknown>
		seams.ensureRegistered = vi.fn(async () => {})
		seams.ensureContractRegistered = vi.fn(async () => {})
		seams.buildWithInitialization = vi.fn(async () => ({}))
		seams.entrypoint = { createTxExecutionRequest: vi.fn(async () => ({})) }
	}, 60_000)

	const buildOn = (node: AztecNode, gasSettings?: { maxFeesPerGas: { feePerDaGas: string; feePerL2Gas: string } }) =>
		nulo.buildTxExecutionRequest(node, {} as never, { calls: [] } as never, {} as never, {} as never, gasSettings)

	test("each build reads the nullifier and its minimum fee once, ahead; the cap reads its own after", async () => {
		const { node, asked, reads } = setup()

		await buildOn(reads.forBuild(node, { account: nulo, contracts: [], minFees: true }))
		expect(asked.getNullifierMembershipWitness).toHaveBeenCalledTimes(1)
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(1)

		// A cap is priced on the node a build hands on, never on the build's view: a new read.
		asked.getPredictedMinFees.mockResolvedValueOnce([new GasFees(30n, 50n)])
		expect(await feeCapFor(node, { payer: "account", multiplier: 1 })).toEqual(new GasFees(30n, 50n))
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(2)

		const own = { maxFeesPerGas: { feePerDaGas: "0x1e", feePerL2Gas: "0x32" } }
		await buildOn(reads.forBuild(node, { account: nulo, contracts: [], minFees: false }), own)
		expect(asked.getNullifierMembershipWitness).toHaveBeenCalledTimes(2)
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(2)
	})

	test("a node without the prediction: the build's fallback read is the one sent ahead", async () => {
		const { node, asked, reads } = setup()
		const missing = Object.assign(new Error("Method not found"), { cause: { code: -32601 } })
		asked.getPredictedMinFees.mockRejectedValue(missing)
		const build = reads.forBuild(node, { account: nulo, contracts: [], minFees: true })
		await new Promise((resolve) => setTimeout(resolve, 0))
		await buildOn(build)
		expect(asked.getCurrentMinFees).toHaveBeenCalledTimes(1)
	})
})
