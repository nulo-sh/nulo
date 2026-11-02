import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import type { NetworkActivationResult } from "@/utils/guarded-network-activation"
import { type SwitchAnnounceStore, switchAndAnnounce } from "./switch-toast"

const ALPHA = { id: "alpha", chainId: 1, name: "Alpha" }
const TESTNET = { id: "tn", chainId: 2, name: "Testnet" }
const TWIN = { id: "twin", chainId: 1, name: "Alpha Mirror" }
const onAlpha = { profileId: "p1", chainId: 1, name: "Account 1", address: "0xa1" }
const onTestnet = { profileId: "p1", chainId: 2, name: "Account 1", address: "0xb2" }

const storeOn = (over: Partial<SwitchAnnounceStore> = {}): SwitchAnnounceStore => ({
	isLogined: true,
	profile: { id: "p1" },
	network: ALPHA,
	staleNetwork: null,
	account: onAlpha,
	...over,
})

/** A switch whose activation commits the network, then `land` runs, then the run settles when `settle` is called. */
function harness(store: SwitchAnnounceStore, opts: { result?: NetworkActivationResult; land?: () => void; landEarly?: boolean } = {}) {
	const run = deferred<boolean>()
	const openToast = vi.fn()
	// As the shell's wait: the latest run's settle, then the switch's own live check.
	const settled = vi.fn((live: () => boolean) => run.promise.then((latest) => latest && live()))
	const activate = vi.fn(async (target: typeof TESTNET) => {
		if ((opts.result ?? "activated") !== "activated") return opts.result as NetworkActivationResult
		store.network = target
		if (opts.landEarly) opts.land?.()
		return "activated" as const
	})
	const settle = async (latest = true) => {
		if (!opts.landEarly) opts.land?.()
		run.resolve(latest)
		await vi.waitFor(() => expect(settled).toHaveBeenCalled())
		await new Promise((r) => setTimeout(r, 0))
	}
	return { openToast, settled, activate, settle }
}

describe("switchAndAnnounce", () => {
	test("toasts once the switch run settles, with the line when the header's address changed", async () => {
		const store = storeOn()
		const h = harness(store, { land: () => (store.account = onTestnet) })
		const done = switchAndAnnounce(TESTNET, { store, ...h })
		await new Promise((r) => setTimeout(r, 0))
		expect(h.openToast).not.toHaveBeenCalled()
		await h.settle()
		await done
		expect(h.openToast).toHaveBeenCalledTimes(1)
		expect(h.openToast).toHaveBeenCalledWith({
			kind: "success",
			label: "Active network updated",
			sub: "Account 1 has a different address on Testnet.",
		})
	})

	test("an account that lands before the activation resolves still gets the line: the address is read before it starts", async () => {
		const store = storeOn()
		const h = harness(store, { landEarly: true, land: () => (store.account = onTestnet) })
		const done = switchAndAnnounce(TESTNET, { store, ...h })
		await h.settle()
		await done
		expect(h.openToast).toHaveBeenCalledWith(expect.objectContaining({ sub: "Account 1 has a different address on Testnet." }))
	})

	test("no line when the address stays, when the header showed none before, or when the account never shows", async () => {
		const cases: Array<{ store: SwitchAnnounceStore; target: typeof TESTNET; land?: (s: SwitchAnnounceStore) => void }> = [
			// A network on the same chain keeps the account and its address.
			{ store: storeOn(), target: TWIN },
			// The header held a skeleton: nothing was shown to differ from.
			{ store: storeOn({ account: { ...onTestnet, chainId: 9 } }), target: TESTNET, land: (s) => (s.account = onTestnet) },
			// A quarantined network showed no account group.
			{ store: storeOn({ staleNetwork: { networkId: "alpha" } }), target: TESTNET, land: (s) => (s.account = onTestnet) },
			// The run ended (or failed) with the target's account still unloaded.
			{ store: storeOn(), target: TESTNET },
		]
		for (const { store, target, land } of cases) {
			const h = harness(store, { land: () => land?.(store) })
			const done = switchAndAnnounce(target, { store, ...h })
			await new Promise((r) => setTimeout(r, 0))
			expect(h.openToast).not.toHaveBeenCalled()
			await h.settle()
			await done
			expect(h.openToast.mock.calls).toEqual([[{ kind: "success", label: "Active network updated" }]])
		}
	})

	test("nothing opens once the run is replaced, the session locks, the profile changes or the network moves on", async () => {
		const outcomes: Array<{ latest: boolean; after?: (s: SwitchAnnounceStore) => void }> = [
			{ latest: false },
			{ latest: true, after: (s) => (s.isLogined = false) },
			{ latest: true, after: (s) => (s.profile = { id: "p2" }) },
			{ latest: true, after: (s) => (s.network = ALPHA) },
		]
		for (const { latest, after } of outcomes) {
			const store = storeOn()
			const h = harness(store, {
				land: () => {
					store.account = onTestnet
					after?.(store)
				},
			})
			const done = switchAndAnnounce(TESTNET, { store, ...h })
			await h.settle(latest)
			await done
			expect(h.openToast).not.toHaveBeenCalled()
		}
		// Control: the same switch, untouched, announces.
		const store = storeOn()
		const h = harness(store, { land: () => (store.account = onTestnet) })
		const done = switchAndAnnounce(TESTNET, { store, ...h })
		await h.settle()
		await done
		expect(h.openToast).toHaveBeenCalledTimes(1)
	})

	test("the live check it hands the shell covers the login, the profile and the target network", async () => {
		const flips: Array<(s: SwitchAnnounceStore) => void> = [
			(s) => (s.isLogined = false),
			(s) => (s.profile = { id: "p2" }),
			(s) => (s.network = ALPHA),
		]
		for (const flip of flips) {
			const store = storeOn()
			const h = harness(store)
			void switchAndAnnounce(TESTNET, { store, ...h })
			await vi.waitFor(() => expect(h.settled).toHaveBeenCalled())
			const live = h.settled.mock.calls[0]?.[0] as () => boolean
			expect(live()).toBe(true)
			flip(store)
			expect(live()).toBe(false)
		}
	})

	test("a refused, unconfirmed or stale activation neither waits nor toasts: the composable owns that feedback", async () => {
		for (const result of ["blocked", "unconfirmed", "stale"] as const) {
			const store = storeOn()
			const h = harness(store, { result })
			await switchAndAnnounce(TESTNET, { store, ...h })
			expect(h.settled).not.toHaveBeenCalled()
			expect(h.openToast).not.toHaveBeenCalled()
		}
	})
})
