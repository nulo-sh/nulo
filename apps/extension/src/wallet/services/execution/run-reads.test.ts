import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { GasFees, ManaUsageEstimate } from "@aztec-labs/stdlib/gas"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { describe, expect, test, vi } from "vitest"
import { RunReads } from "./run-reads"

const A = AztecAddress.fromStringUnsafe(`0x${"0a".repeat(32)}`)
const B = AztecAddress.fromStringUnsafe(`0x${"0b".repeat(32)}`)
const NULLIFIER = Fr.fromString("0x1234")

/** A node whose members are prototype methods reading a private field, as a class instance's are:
 *  a member called on anything but the node itself throws. */
class FakeNode {
	#fees = [new GasFees(3n, 5n)]
	public readonly label = "node"
	public async getNodeInfo(): Promise<unknown> {
		return { fees: this.#fees.length }
	}
	public async getContract(address: AztecAddress): Promise<unknown> {
		return { of: address.toString(), fees: this.#fees.length }
	}
	public async getPredictedMinFees(_usage?: string): Promise<GasFees[]> {
		return this.#fees
	}
	public async getCurrentMinFees(): Promise<GasFees> {
		return this.#fees[0]
	}
	public async getNullifierMembershipWitness(_block: string, _nullifier: Fr): Promise<unknown> {
		return { found: this.#fees.length }
	}
	public async getPublicStorageAt(_block: string, _contract: AztecAddress, _slot: unknown): Promise<number> {
		return this.#fees.length
	}
}

const setup = () => {
	const fake = new FakeNode()
	const asked = {
		getNodeInfo: vi.spyOn(fake, "getNodeInfo"),
		getContract: vi.spyOn(fake, "getContract"),
		getPredictedMinFees: vi.spyOn(fake, "getPredictedMinFees"),
		getCurrentMinFees: vi.spyOn(fake, "getCurrentMinFees"),
		getNullifierMembershipWitness: vi.spyOn(fake, "getNullifierMembershipWitness"),
		getPublicStorageAt: vi.spyOn(fake, "getPublicStorageAt"),
	}
	return { node: fake as unknown as AztecNode, asked, reads: new RunReads() }
}

const account = (reads: { witness?: boolean } = {}) => ({
	requiresInitialization: vi.fn(async (node: AztecNode) => {
		if (reads.witness !== false) await node.getNullifierMembershipWitness("latest", NULLIFIER)
		return false
	}),
})

/** A build's node with nothing sent ahead but the account's (absent) read. */
const quiet = { account: account({ witness: false }), contracts: [], minFees: false }

describe("the node one build reads through", () => {
	test("the build's own asks are answered by the ones sent ahead", async () => {
		const { node, asked, reads } = setup()
		const build = reads.forBuild(node, { account: account(), contracts: [A.toString(), B.toString()], minFees: true })
		// Sent before anything is awaited: in one tick, so one request on a batching client.
		expect(asked.getContract).toHaveBeenCalledTimes(2)
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(1)
		expect(await build.getContract(A)).toEqual({ of: A.toString(), fees: 1 })
		await build.getContract(B)
		await build.getPredictedMinFees(ManaUsageEstimate.Limit)
		await build.getNullifierMembershipWitness("latest", NULLIFIER)
		expect(asked.getContract).toHaveBeenCalledTimes(2)
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(1)
		expect(asked.getNullifierMembershipWitness).toHaveBeenCalledTimes(1)
	})

	test("a read is asked once per argument, in flight or answered", async () => {
		const { node, asked, reads } = setup()
		const build = reads.forBuild(node, quiet)
		const [first, second] = [build.getContract(A), build.getContract(A)]
		expect(second).toBe(first)
		await first
		await build.getContract(A)
		await build.getContract(B)
		expect(asked.getContract).toHaveBeenCalledTimes(2)
	})

	test("the run's next build asks the node again: no answer outlives its build", async () => {
		const { node, asked, reads } = setup()
		const ahead = { account: account(), contracts: [A.toString()], minFees: true }
		await reads.forBuild(node, ahead).getContract(A)
		await reads.forBuild(node, ahead).getContract(A)
		expect(asked.getContract).toHaveBeenCalledTimes(2)
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(2)
		expect(asked.getNullifierMembershipWitness).toHaveBeenCalledTimes(2)
	})

	test("node info and every other member reach the node each time, called on the node itself", async () => {
		const { node, asked, reads } = setup()
		const build = reads.forBuild(node, quiet)
		expect(await build.getNodeInfo()).toEqual({ fees: 1 })
		await build.getNodeInfo()
		await build.getPublicStorageAt("latest", A, Fr.ZERO)
		await build.getPublicStorageAt("latest", A, Fr.ZERO)
		expect(asked.getNodeInfo).toHaveBeenCalledTimes(2)
		expect(asked.getPublicStorageAt).toHaveBeenCalledTimes(2)
		expect((build as unknown as FakeNode).label).toBe("node")
	})

	test("a member a frozen node fixes is handed back as it is", () => {
		const { reads } = setup()
		const frozen = Object.freeze({ getContract: async () => undefined }) as unknown as AztecNode
		expect(reads.forBuild(frozen, quiet).getContract).toBe(frozen.getContract)
	})

	test("an argument with no text of its own is asked each time", async () => {
		const { node, asked, reads } = setup()
		const build = reads.forBuild(node, quiet)
		const plain = { address: A } as unknown as AztecAddress
		const list = [A] as unknown as AztecAddress
		const bare = Object.create(null) as AztecAddress
		for (const loose of [plain, plain, list, list, bare, bare]) await build.getContract(loose).catch(() => {})
		expect(asked.getContract).toHaveBeenCalledTimes(6)
	})

	test("a caller's own fee cap: no minimum fee is read ahead", async () => {
		const { node, asked, reads } = setup()
		reads.forBuild(node, { account: account(), contracts: [], minFees: false })
		await Promise.resolve()
		expect(asked.getPredictedMinFees).not.toHaveBeenCalled()
		expect(asked.getCurrentMinFees).not.toHaveBeenCalled()
	})

	test("a read sent ahead that fails raises nothing; the build asks again and reports it", async () => {
		const { node, asked, reads } = setup()
		asked.getContract.mockRejectedValue(new Error("node down"))
		asked.getPredictedMinFees.mockRejectedValue(new Error("node down"))
		const build = reads.forBuild(node, {
			account: account({ witness: false }),
			contracts: [A.toString(), "not an address"],
			minFees: true,
		})
		await new Promise((resolve) => setTimeout(resolve, 0))
		await expect(build.getContract(A)).rejects.toThrowError("node down")
		await expect(build.getPredictedMinFees(ManaUsageEstimate.Limit)).rejects.toThrowError("node down")
		expect(asked.getContract).toHaveBeenCalledTimes(2)
		expect(asked.getPredictedMinFees).toHaveBeenCalledTimes(2)
	})

	test("a closed run sends nothing ahead and hands on the node itself", () => {
		const { node, asked, reads } = setup()
		reads.close()
		const lazy = account()
		expect(reads.forBuild(node, { account: lazy, contracts: [A.toString()], minFees: true })).toBe(node)
		expect(lazy.requiresInitialization).not.toHaveBeenCalled()
		expect(asked.getContract).not.toHaveBeenCalled()
		expect(asked.getPredictedMinFees).not.toHaveBeenCalled()
	})
})
