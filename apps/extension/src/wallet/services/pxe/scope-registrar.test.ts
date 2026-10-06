import type { IPXE } from "@nulo/aztec-runtime/pxe"
import { describe, expect, test, vi } from "vitest"
import { createScopeRegistrar } from "./scope-registrar"

const pxe = {} as IPXE
const network = { profileId: "p1", chainId: 31337, rpcUrl: "http://n/1", pxeGeneration: "gen-A" }

function makeDeps(liveness: boolean[] = [true, true]) {
	const ensureRegistered = vi.fn(async () => {})
	const getAccountContract = vi.fn(async (_p: string, _c: number, address: string) => {
		if (address === "0xforeign") throw new Error("unknown account address")
		return { ensureRegistered } as never
	})
	const isChainLive = vi.fn(async () => liveness.shift() ?? true)
	return { ensureRegistered, getAccountContract, isChainLive }
}

describe("createScopeRegistrar", () => {
	test("registers each scope as the profile's account on the op's chain", async () => {
		const deps = makeDeps()
		await createScopeRegistrar(deps, deps)(pxe, network, ["0xa", "0xb"])
		expect(deps.getAccountContract.mock.calls).toEqual([
			["p1", 31337, "0xa"],
			["p1", 31337, "0xb"],
		])
		expect(deps.ensureRegistered.mock.calls).toEqual([[pxe], [pxe]])
	})

	test("an address with no account row fails and registers nothing", async () => {
		const deps = makeDeps()
		await expect(createScopeRegistrar(deps, deps)(pxe, network, ["0xforeign", "0xa"])).rejects.toThrowError("unknown account address")
		expect(deps.ensureRegistered).not.toHaveBeenCalled()
	})

	test("a chain being deleted registers nothing", async () => {
		const deps = makeDeps([false])
		await expect(createScopeRegistrar(deps, deps)(pxe, network, ["0xa"])).rejects.toThrowError("the network was removed")
		expect(deps.getAccountContract).not.toHaveBeenCalled()
	})

	test("a chain deleted during registration refuses the retry", async () => {
		const deps = makeDeps([true, false])
		await expect(createScopeRegistrar(deps, deps)(pxe, network, ["0xa"])).rejects.toThrowError("the network was removed")
		expect(deps.ensureRegistered).toHaveBeenCalledTimes(1)
	})
})
