import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../tests/helpers/chrome-storage-mock"

vi.mock("@/utils/core", () => {
	const profileMock = {
		getProfiles: vi.fn(async () => []),
		getActiveProfile: vi.fn(async () => null),
	}
	const networkMock = {
		disconnect: vi.fn(),
		getOrInitNetworks: vi.fn(async () => []),
		getActiveNetwork: vi.fn(async () => undefined),
		setActiveNetwork: vi.fn(async () => undefined),
	}
	const accountMock = {
		disconnect: vi.fn(),
		ensureDefaultAccount: vi.fn(async () => undefined),
		getAccounts: vi.fn(async () => []),
	}
	const listeners = new Set<(e: unknown) => void>()
	const networkResetMock = {
		getStaleNetwork: vi.fn(async (_networkId: string): Promise<unknown> => null),
		resetStaleNetwork: vi.fn(async (_networkId: string, _confirmed: unknown): Promise<unknown> => null),
		onStaleNetworkChanged: {
			add: (fn: (e: unknown) => void) => listeners.add(fn),
			remove: (fn: (e: unknown) => void) => listeners.delete(fn),
			invoke: (e: unknown) => {
				for (const fn of [...listeners]) fn(e)
			},
		},
		onDisconnected: { add: vi.fn(), remove: vi.fn() },
	}
	const managers = {
		profile: profileMock,
		network: networkMock,
		account: accountMock,
		networkReset: networkResetMock,
		uiPreference: { getSelectedAccount: vi.fn(async () => undefined), setSelectedAccount: vi.fn(async () => true) },
	}
	return {
		managers,
		// app.store reads the lazy clients via require*()/get*(). initNetworks/
		// initAccount REASSIGN `managers.network`/`.account` to the mocked
		// `new NetworkServiceClient()`/`new AccountServiceClient()` (which carry
		// getNodeStatus etc.), so these MUST read the CURRENT `managers.X` — close
		// over `managers`, not the original *Mock consts (matching the real impl).
		requireNetwork: () => managers.network,
		requireAccount: () => managers.account,
		getNetwork: () => managers.network,
		getAccount: () => managers.account,
		initTransactionService: vi.fn(),
	}
})

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`. Arrow factories error: "() => ... is not a constructor".
// Shared, reconfigurable network-client stub (defaults set in beforeEach) so tests can drive the
// no-active-pointer fallback path (getActiveNetwork → undefined, getPrimaryNetwork → X).
const netMock = vi.hoisted(() => ({
	disconnect: vi.fn(),
	getOrInitNetworks: vi.fn(),
	getActiveNetwork: vi.fn(),
	getPrimaryNetwork: vi.fn(),
	setActiveNetwork: vi.fn(),
	getNodeStatus: vi.fn(),
	getNetworks: vi.fn(),
}))
vi.mock("@/wallet/services/network/client", async () => ({
	NetworkServiceClient: vi.fn(function () {
		return netMock
	}),
	NodeStatus: (await import("@/wallet/services/network/spec")).NodeStatus,
}))

vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			ensureDefaultAccount: vi.fn(async () => undefined),
			getAccounts: vi.fn(async () => [{ address: "0xacc1", index: 0, visible: true }]),
		}
	}),
	AccountType: { Nulo_v1: "Nulo_v1" },
	DEFAULT_ACCOUNT_NAME: "Account 1",
}))

import { NodeUnreachableError } from "@nulo/extension-messaging/errors"
import { managers, initTransactionService } from "@/utils/core"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { useAppStore } from "@/stores/app.store"
import { createMemoryHistory, createRouter } from "vue-router"
import { createLockedState } from "@/popup/locked-state"
import { createPopupGuard } from "@/popup/route-guard"
import {
	isActivating,
	isActivatingOtherThan,
	isAnyActivating,
	supersedeProfileActivations,
	useProfileBootstrap,
} from "./useProfileBootstrap"

// app.store references `managers` as an auto-imported global at runtime
// (vite auto-import via src/utils/). In vitest the auto-import only covers
// vue + vue-router, so we mirror the symbol onto globalThis manually.
;(globalThis as { managers?: unknown }).managers = managers

/** The mocked reset client, typed as the mock it is. */
const reset = managers.networkReset as unknown as {
	getStaleNetwork: ReturnType<typeof vi.fn>
	resetStaleNetwork: ReturnType<typeof vi.fn>
	onStaleNetworkChanged: { invoke: (e: unknown) => void }
}

const fakeProfile = { id: "prof-1", name: "Test", type: "password" as const } as never

beforeEach(() => {
	// Extend the global chrome stub from tests/vitest.setup.ts to include
	// the `storage.local` surface that useSyncedRef calls at store init.
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: {
			connect: vi.fn(),
			onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
		},
	})
	installChromeStorage({}, { persist: false })
	setActivePinia(createPinia())
	vi.clearAllMocks()
	// Default network-client behavior (an ACTIVE pointer exists → no fallback); fallback tests override.
	netMock.getOrInitNetworks.mockResolvedValue([{ id: "n1", chainId: 1, kind: "testnet" }])
	netMock.getActiveNetwork.mockResolvedValue({ id: "n1", chainId: 1, kind: "testnet" })
	netMock.getPrimaryNetwork.mockResolvedValue(null)
	netMock.setActiveNetwork.mockResolvedValue(undefined)
	netMock.getNodeStatus.mockResolvedValue(0)
	reset.getStaleNetwork.mockResolvedValue(null)
	;(managers.profile.getProfiles as ReturnType<typeof vi.fn>).mockResolvedValue([fakeProfile])
	;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null)
})

const staleView = (over: Record<string, unknown> = {}) => ({
	networkId: "n1",
	name: "Testnet",
	cause: { networkReset: true, addressesMoved: false },
	blocked: false,
	accounts: [{ name: "Account 1", address: `0x${"1".repeat(64)}` }],
	unmovable: [],
	switchToSeedNode: false,
	probedEndpoint: null,
	...over,
})

const lastAccountClient = () =>
	vi.mocked(AccountServiceClient).mock.results.at(-1)?.value as { ensureDefaultAccount: ReturnType<typeof vi.fn> }

describe("useProfileBootstrap", () => {
	test("a quarantined active network loads no account and starts nothing: the takeover owns the screen", async () => {
		reset.getStaleNetwork.mockResolvedValue(staleView())
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		await bootstrapActiveProfile(fakeProfile)
		expect(appStore.staleNetwork?.networkId).toBe("n1")
		expect(appStore.accounts).toEqual([])
		expect(appStore.account).toBeUndefined()
		expect(lastAccountClient().ensureDefaultAccount).not.toHaveBeenCalled()
		expect(reset.resetStaleNetwork).not.toHaveBeenCalled()
	})

	test("a network never opened resets behind A4c, and the re-keyed row loads its accounts", async () => {
		reset.getStaleNetwork.mockResolvedValueOnce(staleView({ accounts: [] })).mockResolvedValue(null)
		reset.resetStaleNetwork.mockImplementationOnce(async (networkId: string) => {
			queueMicrotask(() =>
				reset.onStaleNetworkChanged.invoke({
					profileId: "prof-1",
					networkId,
					completed: { addressesMoved: false },
				}),
			)
			return null
		})
		netMock.getNetworks.mockResolvedValue([{ id: "n1", chainId: 2, kind: "testnet" }])
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		await bootstrapActiveProfile(fakeProfile)
		expect(reset.resetStaleNetwork).toHaveBeenCalledWith("n1", expect.objectContaining({ accountCount: 0 }))
		expect(appStore.network?.chainId).toBe(2)
		expect(appStore.staleNetwork).toBeNull()
		expect(lastAccountClient().ensureDefaultAccount).toHaveBeenCalledWith("prof-1", 2, "Nulo_v1", "Account 1")
	})

	test("a failed automatic run re-reads the view, so its paused journal shows R1 instead of nothing", async () => {
		const paused = staleView({ accounts: [], reset: { running: false, purged: true, doneCount: 0, imported: [] } })
		reset.getStaleNetwork.mockResolvedValueOnce(staleView({ accounts: [] })).mockResolvedValue(paused)
		reset.resetStaleNetwork.mockImplementationOnce(async (networkId: string) => {
			queueMicrotask(() => reset.onStaleNetworkChanged.invoke({ profileId: "prof-1", networkId, failed: true }))
			return null
		})
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		await bootstrapActiveProfile(fakeProfile)
		expect(appStore.staleNetwork).toEqual(paused)
		expect(lastAccountClient().ensureDefaultAccount).not.toHaveBeenCalled()
	})

	test("a node switch is never unattended: the view stays for A1 to confirm", async () => {
		reset.getStaleNetwork.mockResolvedValue(staleView({ accounts: [], switchToSeedNode: true }))
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		await bootstrapActiveProfile(fakeProfile)
		expect(reset.resetStaleNetwork).not.toHaveBeenCalled()
		expect(appStore.staleNetwork?.switchToSeedNode).toBe(true)
	})

	test("bootstrapActiveProfile sets appStore.profile", async () => {
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		await bootstrapActiveProfile(fakeProfile)
		expect(appStore.profile).toEqual(fakeProfile)
	})

	test("initNetworks: no active pointer → falls back to the PRIMARY network, NOT hardcoded testnet", async () => {
		// An imported profile has no active-network pointer yet (item 1b restores it later).
		netMock.getActiveNetwork.mockResolvedValue(undefined)
		netMock.getOrInitNetworks.mockResolvedValue([
			{ id: "tn", chainId: CHAIN_IDS.TESTNET, kind: "testnet" },
			{ id: "local", chainId: CHAIN_IDS.SANDBOX, kind: "local" },
		])
		netMock.getPrimaryNetwork.mockResolvedValue({ id: "local", chainId: CHAIN_IDS.SANDBOX, kind: "local" })
		const { initNetworks } = useProfileBootstrap()
		const appStore = useAppStore()
		await initNetworks()
		expect(appStore.network?.id).toBe("local")
		expect(appStore.network?.kind).not.toBe("testnet")
		expect(netMock.getPrimaryNetwork).toHaveBeenCalled()
		expect(netMock.setActiveNetwork).toHaveBeenCalledWith("local")
	})

	test("initNetworks: no active pointer AND no primary present → falls back to networks[0]", async () => {
		// Documented edge: a backup where the user had deleted the primary network.
		netMock.getActiveNetwork.mockResolvedValue(undefined)
		netMock.getOrInitNetworks.mockResolvedValue([
			{ id: "tn", chainId: CHAIN_IDS.TESTNET, kind: "testnet" },
			{ id: "local", chainId: 0, kind: "local" },
		])
		netMock.getPrimaryNetwork.mockResolvedValue(null)
		const { initNetworks } = useProfileBootstrap()
		const appStore = useAppStore()
		await initNetworks()
		expect(appStore.network?.id).toBe("tn")
		expect(netMock.setActiveNetwork).toHaveBeenCalledWith("tn")
	})

	test("bootstrapActiveProfile refreshes the profile list", async () => {
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		await bootstrapActiveProfile(fakeProfile)
		expect(managers.profile.getProfiles).toHaveBeenCalled()
		expect(appStore.profiles).toEqual([fakeProfile])
	})

	test("bootstrapActiveProfile wires the transaction service", async () => {
		const { bootstrapActiveProfile } = useProfileBootstrap()
		await bootstrapActiveProfile(fakeProfile)
		expect(initTransactionService).toHaveBeenCalled()
	})

	test("a concurrent bootstrap + hydrate for the same profile share ONE init (no client stomping)", async () => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile)
		// Hold initNetworks mid-flight so the second caller must JOIN the first run
		// rather than start its own network/account init that replaces the clients.
		let releaseNetworks!: () => void
		netMock.getOrInitNetworks.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseNetworks = () => resolve([{ id: "n1", chainId: 1, kind: "testnet" }])
				}),
		)

		const { bootstrapActiveProfile, hydrateKnownProfile } = useProfileBootstrap()
		const p1 = bootstrapActiveProfile(fakeProfile) // enters the core, awaits getOrInitNetworks
		await Promise.resolve()
		await Promise.resolve()
		const p2 = hydrateKnownProfile() // same profile → joins the in-flight core
		await Promise.resolve()

		releaseNetworks()
		await Promise.all([p1, p2])

		// Single-flighted: each shared client was constructed ONCE, not once per
		// caller (pre-fix, both ran initNetworks/initAccount and stomped the clients).
		expect(NetworkServiceClient).toHaveBeenCalledTimes(1)
		expect(AccountServiceClient).toHaveBeenCalledTimes(1)
	})

	test("a superseded cross-profile bootstrap stops before running initAccount with stale state", async () => {
		const p2 = { id: "prof-2", name: "Second", type: "password" as const } as never
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(p2) // p2 wins

		// P1's initNetworks hangs; P2's resolves — so P2 (the later activation)
		// completes while P1 is still mid-init.
		let releaseP1Networks!: () => void
		netMock.getOrInitNetworks
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						releaseP1Networks = () => resolve([{ id: "n1", chainId: 1, kind: "testnet" }])
					}),
			)
			.mockResolvedValue([{ id: "n2", chainId: 2, kind: "testnet" }])

		const appStore = useAppStore()
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const b1 = bootstrapActiveProfile(fakeProfile) // gen 1, hangs in initNetworks
		await Promise.resolve()
		await Promise.resolve()
		const b2 = bootstrapActiveProfile(p2) // gen 2 — supersedes P1
		await b2 // P2 completes: initNetworks + initAccount

		releaseP1Networks() // P1's initNetworks resolves → superseded → aborts mid-init
		await b1

		// Only P2 constructed an account client, and the shared network state
		// reflects P2 — the superseded P1 stopped at a fence and never wrote its
		// (now-stale) networks over P2's.
		expect(AccountServiceClient).toHaveBeenCalledTimes(1)
		expect(appStore.networks.map((n: { id: string }) => n.id)).toEqual(["n2"])
	})

	test("bootstrapActiveProfile flips isLogined to true and returns true when its profile stays active", async () => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile)
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		expect(appStore.isLogined).toBe(false)
		const stillActive = await bootstrapActiveProfile(fakeProfile)
		expect(appStore.isLogined).toBe(true)
		expect(stillActive).toBe(true)
	})

	test("bootstrapActiveProfile records the profile as the last active one when its session survives", async () => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile)
		const { bootstrapActiveProfile } = useProfileBootstrap()
		await bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledWith({ "nulo:ui:lastActiveProfile": "prof-1" }))
	})

	test("bootstrapActiveProfile leaves the last active profile alone when the session did not survive", async () => {
		const { bootstrapActiveProfile } = useProfileBootstrap()
		await bootstrapActiveProfile(fakeProfile)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
			expect.objectContaining({ "nulo:ui:lastActiveProfile": expect.anything() }),
		)
	})

	test("hydrateKnownProfile returns null when no active profile exists", async () => {
		const { hydrateKnownProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const result = await hydrateKnownProfile()
		expect(result).toBeNull()
		expect(appStore.isLogined).toBe(false)
	})

	test("hydrateKnownProfile bootstraps when an active profile exists", async () => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile)
		const { hydrateKnownProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const result = await hydrateKnownProfile()
		expect(result).toEqual(fakeProfile)
		expect(appStore.profile).toEqual(fakeProfile)
		expect(appStore.isLogined).toBe(true)
		expect(appStore.isSessionChecked).toBe(true)
	})

	// A lock right after a password change clears the active session while a stale
	// bootstrap is still running; that bootstrap must NOT resurrect isLogined afterward
	// (the lock must win). The end-guard re-reads the authoritative active profile
	// (getActiveProfile — serialized with lockActiveProfile under the profile service's
	// runExclusive) before the flip, and returns whether the profile is still active.
	test("bootstrapActiveProfile does not resurrect isLogined when the session was locked mid-bootstrap", async () => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null)
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const stillActive = await bootstrapActiveProfile(fakeProfile)
		expect(appStore.isLogined).toBe(false)
		expect(stillActive).toBe(false)
	})

	test("bootstrapActiveProfile does not set isLogined when a different profile became active mid-bootstrap", async () => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: "other",
			name: "Other",
			type: "password",
		} as never)
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const stillActive = await bootstrapActiveProfile(fakeProfile)
		expect(appStore.isLogined).toBe(false)
		expect(stillActive).toBe(false)
	})

	/** The service orders the final re-read before a queued lock, but the popup can receive the
	 *  read's "active" after the lock's event already sealed it. */
	const deferredReads = () => {
		const answers: Array<(profile: unknown) => void> = []
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockImplementation(
			() =>
				new Promise((resolve) => {
					answers.push(resolve)
				}),
		)
		return answers
	}

	test("a lock that seals while the final re-read is in flight wins over that read's late 'active'", async () => {
		const answers = deferredReads()
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const activation = bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(answers).toHaveLength(1))

		supersedeProfileActivations()
		answers[0](fakeProfile)

		expect(await activation).toBe(false)
		expect(appStore.isLogined).toBe(false)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
			expect.objectContaining({ "nulo:ui:lastActiveProfile": expect.anything() }),
		)
	})

	test("an activation counts as in flight until it settles, through its final session read, and a watcher sees it settle", async () => {
		const answers = deferredReads()
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const seen: boolean[] = []
		const seenAny: boolean[] = []
		const stop = watch(
			() => isActivating("prof-1"),
			(now) => seen.push(now),
			{ flush: "sync" },
		)
		const stopAny = watch(isAnyActivating, (now) => seenAny.push(now), { flush: "sync" })
		const activation = bootstrapActiveProfile(fakeProfile)
		expect(isActivatingOtherThan("created")).toBe(true)
		expect(isActivatingOtherThan("prof-1")).toBe(false)
		await vi.waitFor(() => expect(answers).toHaveLength(1))
		expect(isActivatingOtherThan("created")).toBe(true)

		answers[0](fakeProfile)
		await activation
		stop()
		stopAny()
		expect(isActivatingOtherThan("created")).toBe(false)
		expect(seen).toEqual([true, false])
		expect(seenAny).toEqual([true, false])
	})

	test("an activation superseded before it fails resolves false; one not superseded reports its failure", async () => {
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const failing = () => {
			let fail!: (err: Error) => void
			;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockImplementationOnce(
				() => new Promise((_resolve, reject) => (fail = reject)),
			)
			return (err: Error) => fail(err)
		}

		const failSuperseded = failing()
		const superseded = bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(managers.profile.getActiveProfile).toHaveBeenCalledTimes(1))
		supersedeProfileActivations()
		failSuperseded(new Error("timed out"))
		expect(await superseded).toBe(false)

		const failCurrent = failing()
		const current = bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(managers.profile.getActiveProfile).toHaveBeenCalledTimes(2))
		failCurrent(new Error("timed out"))
		await expect(current).rejects.toThrow("timed out")
	})

	describe("a core that fails while the profile list is in flight", () => {
		const unhandled = vi.fn()
		const settleTimers = () => new Promise((resolve) => setTimeout(resolve, 0))
		beforeEach(() => {
			unhandled.mockClear()
			process.on("unhandledRejection", unhandled)
		})
		afterEach(() => {
			process.off("unhandledRejection", unhandled)
		})

		test("is never an unhandled rejection, and the lock that caused it still resolves the activation false", async () => {
			let answerProfiles!: (profiles: unknown[]) => void
			;(managers.profile.getProfiles as ReturnType<typeof vi.fn>).mockImplementationOnce(
				() => new Promise((resolve) => (answerProfiles = resolve)),
			)
			netMock.getOrInitNetworks.mockRejectedValueOnce(new Error("Wallet locked"))
			const { bootstrapActiveProfile } = useProfileBootstrap()
			const activation = bootstrapActiveProfile(fakeProfile)
			await vi.waitFor(() => expect(netMock.getOrInitNetworks).toHaveBeenCalledTimes(1))
			await settleTimers()

			supersedeProfileActivations()
			answerProfiles([fakeProfile])
			expect(await activation).toBe(false)
			await settleTimers()
			expect(unhandled).not.toHaveBeenCalled()
		})

		test("control: one no lock supersedes still reports its failure, after the list lands", async () => {
			let answerProfiles!: (profiles: unknown[]) => void
			;(managers.profile.getProfiles as ReturnType<typeof vi.fn>).mockImplementationOnce(
				() => new Promise((resolve) => (answerProfiles = resolve)),
			)
			netMock.getOrInitNetworks.mockRejectedValueOnce(new Error("Wallet locked"))
			const { bootstrapActiveProfile } = useProfileBootstrap()
			const appStore = useAppStore()
			const activation = bootstrapActiveProfile(fakeProfile)
			await vi.waitFor(() => expect(netMock.getOrInitNetworks).toHaveBeenCalledTimes(1))
			await settleTimers()

			answerProfiles([fakeProfile])
			await expect(activation).rejects.toThrow("Wallet locked")
			expect(appStore.profiles).toEqual([fakeProfile])
			expect(unhandled).not.toHaveBeenCalled()
		})

		test("a list read that fails first leaves the core's later failure observed", async () => {
			let failCore!: (err: Error) => void
			netMock.getOrInitNetworks.mockImplementationOnce(() => new Promise((_resolve, reject) => (failCore = reject)))
			;(managers.profile.getProfiles as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Profile locked"))
			const { bootstrapActiveProfile } = useProfileBootstrap()
			await expect(bootstrapActiveProfile(fakeProfile)).rejects.toThrow("Profile locked")

			failCore(new Error("Wallet locked"))
			await settleTimers()
			expect(unhandled).not.toHaveBeenCalled()
		})
	})

	test("a hydration superseded by a lock commits nothing and reports no active profile", async () => {
		const answers = deferredReads()
		const { hydrateKnownProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const hydration = hydrateKnownProfile()
		await vi.waitFor(() => expect(answers).toHaveLength(1))
		answers[0](fakeProfile)
		await vi.waitFor(() => expect(answers).toHaveLength(2))

		supersedeProfileActivations()
		answers[1](fakeProfile)

		expect(await hydration).toBeNull()
		expect(appStore.isLogined).toBe(false)
		expect(appStore.isSessionChecked).toBe(true)
	})

	test("an unlock after the lock activates, while the activation the lock superseded commits nothing", async () => {
		const answers = deferredReads()
		const { bootstrapActiveProfile } = useProfileBootstrap()
		const appStore = useAppStore()
		const older = bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(answers).toHaveLength(1))
		supersedeProfileActivations()

		const newer = bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(answers).toHaveLength(2))
		answers[0](fakeProfile)
		expect(await older).toBe(false)
		expect(appStore.isLogined).toBe(false)

		answers[1](fakeProfile)
		expect(await newer).toBe(true)
		expect(appStore.isLogined).toBe(true)
	})

	test("the lock's push lands on the lock screen though a stale activation answered 'active' after the seal", async () => {
		const answers = deferredReads()
		const appStore = useAppStore()
		appStore.profile = fakeProfile
		appStore.isLogined = true
		appStore.isSessionChecked = true
		const page = { render: () => null }
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: "/popup/general", name: "popup-general", component: page, meta: { isAuthRequired: true } },
				{ path: "/popup/auth", name: "popup-auth", component: page },
			],
		})
		router.beforeEach(
			createPopupGuard(
				() => appStore,
				() => managers.profile as never,
				{ ready: async () => true, markProvisional: () => {}, settle: () => {}, replay: () => {} },
			),
		)
		await router.push("/popup/general")

		const { bootstrapActiveProfile } = useProfileBootstrap()
		const activation = bootstrapActiveProfile(fakeProfile)
		await vi.waitFor(() => expect(answers).toHaveLength(1))

		let landing: Promise<unknown> | undefined
		let answerProfiles!: (profiles: (typeof fakeProfile)[]) => void
		const lockedState = createLockedState({
			closePopups: () => undefined,
			onLocked: () => undefined,
			markLocked: () => {
				supersedeProfileActivations()
				appStore.isLogined = false
			},
			clearActivity: () => undefined,
			resetInFlight: () => undefined,
			resetContactImports: () => undefined,
			openProfileId: () => undefined,
			cachedProfiles: () => [fakeProfile],
			setProfiles: () => undefined,
			route: (path) => {
				landing = router.push(path)
			},
			selectedId: () => appStore.profile?.id,
			select: () => undefined,
			readLastActiveId: async () => undefined,
			routeName: () => undefined,
		})
		const lockEvent = lockedState.onLockEvent(
			() =>
				new Promise<(typeof fakeProfile)[]>((resolve) => {
					answerProfiles = resolve
				}),
			() => true,
		)
		answers[0](fakeProfile)
		await activation
		answerProfiles([fakeProfile])
		await lockEvent
		await landing

		expect(router.currentRoute.value.name).toBe("popup-auth")
		expect(appStore.isLogined).toBe(false)
	})
})

describe("useProfileBootstrap — a custom node that does not answer its identity read", () => {
	const IMPORTED = { address: "0ximported", index: 0, visible: true }
	const withAccountClient = (ensureDefaultAccount: () => Promise<unknown>) => {
		const getAccounts = vi.fn(async () => [IMPORTED])
		vi.mocked(AccountServiceClient).mockImplementationOnce(function () {
			return { disconnect: vi.fn(), ensureDefaultAccount, getAccounts }
		} as never)
		return getAccounts
	}

	beforeEach(() => {
		;(managers.profile.getActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile)
		netMock.getNodeStatus.mockReturnValue(new Promise(() => {}))
	})

	test("start finishes on the chain's own rows with the dot already inactive", async () => {
		const getAccounts = withAccountClient(async () => {
			throw new NodeUnreachableError()
		})
		const appStore = useAppStore()
		appStore.account = { address: "0xearlier" } as typeof appStore.account
		await expect(useProfileBootstrap().bootstrapActiveProfile(fakeProfile)).resolves.toBe(true)
		expect(appStore.isLogined).toBe(true)
		expect(appStore.networkStatus).toBe("Inactive")
		expect(getAccounts).toHaveBeenCalledWith("prof-1", 1, true)
		expect(appStore.accounts).toEqual([IMPORTED])
		expect(appStore.account?.address).toBe("0ximported")
	})

	test("a node that answers leaves the dot to its status read; any other failure still stops start", async () => {
		withAccountClient(async () => undefined)
		const appStore = useAppStore()
		await useProfileBootstrap().bootstrapActiveProfile(fakeProfile)
		expect(appStore.networkStatus).toBe("sync")

		setActivePinia(createPinia())
		withAccountClient(async () => {
			throw new Error("L1 identity mismatch")
		})
		await expect(useProfileBootstrap().bootstrapActiveProfile(fakeProfile)).rejects.toThrow("L1 identity mismatch")
		expect(useAppStore().isLogined).toBe(false)
	})
})
