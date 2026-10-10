import { reactive } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const accountInstance = {
	getAccounts: vi.fn(async () => [{ address: "0xACC", index: 0, visible: true }]),
}

vi.mock("@/utils/core", () => ({
	managers: { account: undefined as unknown },
	initTransactionService: vi.fn(),
}))

vi.mock("@/utils/lastActiveProfile", () => ({
	setLastActiveProfileId: vi.fn(async () => undefined),
}))

vi.mock("@/utils/storage", () => ({
	storageLocalSet: vi.fn(async () => true),
}))

vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return accountInstance
	}),
}))

import { BootstrapFailedError, UnlockTimeoutError } from "@/composables/unlockWait"
import { initTransactionService, managers } from "@/utils/core"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { storageLocalSet } from "@/utils/storage"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { activateCreatedProfile, makeCreateKeydownHandler } from "./new-profile-helpers"

type AppStoreLike = Parameters<typeof activateCreatedProfile>[1]["appStore"]
type RouterLike = Parameters<typeof activateCreatedProfile>[1]["router"]

const created = { id: "created" }

function makeAppStore(overrides: Partial<Record<string, unknown>> = {}) {
	return reactive({
		isLogined: false,
		profile: undefined as { id: string } | undefined,
		bootstrapFailure: null as { profileId: string; message: string } | null,
		network: { chainId: "1" } as { chainId: string } | undefined,
		accounts: [] as unknown[],
		account: { address: "0xACC" },
		onTxAdded: vi.fn(),
		onTxUpdated: vi.fn(),
		...overrides,
	})
}

/** The shell's bootstrap of `id`: it selects the profile at entry and flips `isLogined` last. */
function bootstrapped(store: ReturnType<typeof makeAppStore>, id: string) {
	store.profile = { id }
	store.isLogined = true
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

/** Starts the helper and records how it settled without awaiting it. */
function start(store: ReturnType<typeof makeAppStore>) {
	const router = { push: vi.fn() }
	const state: { outcome: unknown } = { outcome: "pending" }
	activateCreatedProfile(created, { appStore: store as unknown as AppStoreLike, router: router as unknown as RouterLike }).then(
		() => {
			state.outcome = "resolved"
		},
		(e) => {
			state.outcome = e
		},
	)
	return { router, state }
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.useFakeTimers()
	managers.account = undefined as never
})

afterEach(() => {
	vi.useRealTimers()
})

describe("activateCreatedProfile (popup manual sequence)", () => {
	test("a slow start-up: the created profile starts at once and is active 3 minutes later; the tail runs in order", async () => {
		const store = makeAppStore()
		const { router, state } = start(store)
		store.profile = created
		await vi.advanceTimersByTimeAsync(3 * 60_000)
		store.isLogined = true
		await vi.advanceTimersByTimeAsync(200)

		expect(state.outcome).toBe("resolved")
		expect(setLastActiveProfileId).toHaveBeenCalledWith("created")
		expect(accountInstance.getAccounts).toHaveBeenCalledWith("created", "1", true)
		expect(store.accounts).toEqual([{ address: "0xACC", index: 0, visible: true }])
		expect(storageLocalSet).toHaveBeenCalledWith({ "nulo:ui:activeAccount": "0xACC" })
		expect(initTransactionService).toHaveBeenCalled()
		expect(router.push).toHaveBeenCalledWith("/popup/general")
		// The active-profile id is persisted before accounts load, and the active-account write lands
		// before navigating (the durable state a reopened popup reads).
		const setIdOrder = vi.mocked(setLastActiveProfileId).mock.invocationCallOrder[0]!
		expect(setIdOrder).toBeLessThan(accountInstance.getAccounts.mock.invocationCallOrder[0]!)
		expect(vi.mocked(storageLocalSet).mock.invocationCallOrder[0]!).toBeLessThan(router.push.mock.invocationCallOrder[0]!)
	})

	test("another profile active and the created one never starting: rejects at the deadline, writes nothing", async () => {
		const store = makeAppStore()
		const { router, state } = start(store)
		bootstrapped(store, "other")
		await vi.advanceTimersByTimeAsync(29_999)
		expect(state.outcome).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)

		expect(state.outcome).toBeInstanceOf(UnlockTimeoutError)
		expect(store.profile).toEqual({ id: "other" })
		expect(setLastActiveProfileId).not.toHaveBeenCalled()
		expect(accountInstance.getAccounts).not.toHaveBeenCalled()
		expect(router.push).not.toHaveBeenCalled()
	})

	test("a bootstrap failure recorded for the created profile rejects at once, writes nothing", async () => {
		const store = makeAppStore()
		const { router, state } = start(store)
		store.profile = created
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBeInstanceOf(BootstrapFailedError)
		expect(setLastActiveProfileId).not.toHaveBeenCalled()
		expect(accountInstance.getAccounts).not.toHaveBeenCalled()
		expect(router.push).not.toHaveBeenCalled()
	})

	test("another profile opened while the accounts load: no accounts written, no route", async () => {
		const store = makeAppStore()
		const accounts = deferred<Array<{ address: string; index: number; visible: boolean }>>()
		accountInstance.getAccounts.mockReturnValueOnce(accounts.promise)
		const { router, state } = start(store)
		bootstrapped(store, "created")
		await vi.advanceTimersByTimeAsync(0)
		expect(accountInstance.getAccounts).toHaveBeenCalledTimes(1)

		bootstrapped(store, "other")
		accounts.resolve([{ address: "0xACC", index: 0, visible: true }])
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(store.accounts).toEqual([])
		expect(storageLocalSet).not.toHaveBeenCalled()
		expect(router.push).not.toHaveBeenCalled()
	})

	test("another profile opened while the active account is persisted: no route", async () => {
		const store = makeAppStore()
		const write = deferred<boolean>()
		vi.mocked(storageLocalSet).mockReturnValueOnce(write.promise)
		const { router, state } = start(store)
		bootstrapped(store, "created")
		await vi.advanceTimersByTimeAsync(0)
		expect(storageLocalSet).toHaveBeenCalledTimes(1)

		bootstrapped(store, "other")
		write.resolve(true)
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(router.push).not.toHaveBeenCalled()
	})

	test("keeps an account client the wallet already holds instead of abandoning it connected", async () => {
		const existing = { getAccounts: vi.fn(async () => [{ address: "0xEXISTING", index: 0, visible: true }]) }
		managers.account = existing as never
		const store = makeAppStore()
		bootstrapped(store, "created")
		const { router, state } = start(store)
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(AccountServiceClient).not.toHaveBeenCalled()
		expect(managers.account).toBe(existing)
		expect(existing.getAccounts).toHaveBeenCalledWith("created", "1", true)
		expect(store.accounts).toEqual([{ address: "0xEXISTING", index: 0, visible: true }])
		expect(router.push).toHaveBeenCalledWith("/popup/general")
	})

	test("throws 'Network not set' and does not load accounts or route when network is missing", async () => {
		const store = makeAppStore({ network: undefined })
		bootstrapped(store, "created")
		const { router, state } = start(store)
		await vi.advanceTimersByTimeAsync(0)

		expect((state.outcome as Error).message).toBe("Network not set")
		expect(accountInstance.getAccounts).not.toHaveBeenCalled()
		expect(router.push).not.toHaveBeenCalled()
	})
})

describe("makeCreateKeydownHandler (popup-create page wiring)", () => {
	test("Enter from a text input invokes onSubmit once", () => {
		const onSubmit = vi.fn()
		makeCreateKeydownHandler(onSubmit)({ key: "Enter", target: document.createElement("input") } as unknown as KeyboardEvent)
		expect(onSubmit).toHaveBeenCalledTimes(1)
	})

	test("Enter from a focused button does NOT invoke onSubmit (no double-fire)", () => {
		const onSubmit = vi.fn()
		makeCreateKeydownHandler(onSubmit)({ key: "Enter", target: document.createElement("button") } as unknown as KeyboardEvent)
		expect(onSubmit).not.toHaveBeenCalled()
	})

	test("a non-Enter key never invokes onSubmit", () => {
		const onSubmit = vi.fn()
		makeCreateKeydownHandler(onSubmit)({ key: "a", target: document.createElement("input") } as unknown as KeyboardEvent)
		expect(onSubmit).not.toHaveBeenCalled()
	})

	test.each([
		["a composing Enter", { isComposing: true }],
		["a repeat Enter", { repeat: true }],
		["an Enter a child already handled", { defaultPrevented: true }],
	] as const)("%s from a text input does NOT invoke onSubmit", (_name, fields) => {
		const onSubmit = vi.fn()
		makeCreateKeydownHandler(onSubmit)({ key: "Enter", target: document.createElement("input"), ...fields } as unknown as KeyboardEvent)
		expect(onSubmit).not.toHaveBeenCalled()
	})
})
