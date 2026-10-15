import { describe, expect, test, vi } from "vitest"
import type { Network } from "@/wallet/services/network/client"
import { createResetCompletion, type ResetCompletionDeps } from "./reset-completion"

const row = (id: string, chainId: number) => ({ id, chainId, name: id }) as unknown as Network

function harness() {
	const state = { live: true, networkId: "tn" as string | undefined, ownsRoute: true }
	let answer!: (networks: Network[]) => void
	let loaded!: () => void
	const deps: ResetCompletionDeps = {
		activeNetworkId: () => state.networkId,
		getNetworks: vi.fn(() => new Promise<Network[]>((r) => (answer = r))),
		setNetworks: vi.fn(),
		setNetwork: vi.fn(),
		accountLoaded: vi.fn(() => new Promise<void>((r) => (loaded = r))),
		ownsRoute: () => state.ownsRoute,
		toHome: vi.fn(),
	}
	const live = () => state.live
	const flush = () => new Promise((r) => setTimeout(r, 0))
	return {
		state,
		deps,
		live,
		completion: createResetCompletion(deps),
		answer: (n: Network[]) => answer(n),
		loaded: () => loaded(),
		flush,
	}
}

describe("createResetCompletion", () => {
	test("re-assigns the re-keyed active row, waits for its account load, then goes Home", async () => {
		const h = harness()
		const done = h.completion.completeReset("tn", h.live)
		const rekeyed = row("tn", 2)
		h.answer([rekeyed, row("ln", 1)])
		await h.flush()
		expect(h.deps.setNetworks).toHaveBeenCalledWith([rekeyed, row("ln", 1)])
		expect(h.deps.setNetwork).toHaveBeenCalledWith(rekeyed)
		expect(h.deps.toHome).not.toHaveBeenCalled()
		h.loaded()
		await done
		expect(h.deps.toHome).toHaveBeenCalledTimes(1)
	})

	test("a session that ended while the networks load writes nothing and goes nowhere", async () => {
		const h = harness()
		const done = h.completion.completeReset("tn", h.live)
		h.state.live = false
		h.answer([row("tn", 2)])
		await done
		expect(h.deps.setNetworks).not.toHaveBeenCalled()
		expect(h.deps.setNetwork).not.toHaveBeenCalled()
		expect(h.deps.accountLoaded).not.toHaveBeenCalled()
		expect(h.deps.toHome).not.toHaveBeenCalled()
	})

	test("an ended session, another active network, or a dApp window: no route after the account load", async () => {
		for (const change of [{ live: false }, { networkId: "ln" }, { ownsRoute: false }]) {
			const h = harness()
			const done = h.completion.completeReset("tn", h.live)
			h.answer([row("tn", 2)])
			await h.flush()
			Object.assign(h.state, change)
			h.loaded()
			await done
			expect(h.deps.toHome).not.toHaveBeenCalled()
		}
	})

	test("a reset of an inactive network refreshes the list and leaves the active row", async () => {
		const h = harness()
		h.state.networkId = "ln"
		const reloaded = h.completion.reloadNetwork("tn", h.live)
		h.answer([row("tn", 2)])
		await expect(reloaded).resolves.toBe(true)
		expect(h.deps.setNetworks).toHaveBeenCalled()
		expect(h.deps.setNetwork).not.toHaveBeenCalled()
	})
})
