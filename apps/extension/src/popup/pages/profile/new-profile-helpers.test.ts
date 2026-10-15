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

vi.mock("@/composables/useProfileBootstrap", () => ({
	isActivatingOtherThan: vi.fn(() => false),
	supersedeProfileActivations: vi.fn(),
}))

vi.mock("@/utils/storage", () => ({
	storageLocalSet: vi.fn(async () => true),
}))

vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return accountInstance
	}),
}))

import { isActivatingOtherThan, supersedeProfileActivations } from "@/composables/useProfileBootstrap"
import { initTransactionService, managers } from "@/utils/core"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { storageLocalSet } from "@/utils/storage"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { activateCreatedProfile, makeCreateKeydownHandler } from "./new-profile-helpers"

type AppStoreLike = Parameters<typeof activateCreatedProfile>[1]["appStore"]
type RouterLike = Parameters<typeof activateCreatedProfile>[1]["router"]

const created = { id: "created", name: "New", type: "password" } as unknown as Parameters<typeof activateCreatedProfile>[0]
const HAND_OFF_TOAST = {
	kind: "error",
	label: "Something went wrong",
	sub: "Open the wallet again to unlock your new profile.",
}

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
function start(store: ReturnType<typeof makeAppStore>, selectedOnEntry?: string) {
	const router = { push: vi.fn(), currentRoute: { value: { name: "popup-profile-new" as string } } }
	const openToast = vi.fn()
	const state: { outcome: unknown } = { outcome: "pending" }
	const deps = { appStore: store as unknown as AppStoreLike, router: router as unknown as RouterLike, openToast, selectedOnEntry }
	activateCreatedProfile(created, deps).then(
		() => {
			state.outcome = "resolved"
		},
		(e) => {
			state.outcome = e
		},
	)
	return { router, openToast, state }
}

/** The unlock-screen hand-off: the created profile selected and recorded as last active. */
function expectUnlockHandOff(store: ReturnType<typeof makeAppStore>, router: { push: unknown }, openToast: unknown) {
	expect(store.profile).toEqual(created)
	expect(supersedeProfileActivations).toHaveBeenCalledTimes(1)
	expect(setLastActiveProfileId).toHaveBeenCalledWith("created", { unless: expect.any(Function) })
	expect(router.push).toHaveBeenCalledTimes(1)
	expect(router.push).toHaveBeenCalledWith("/popup/auth")
	expect(openToast).toHaveBeenCalledTimes(1)
	expect(openToast).toHaveBeenCalledWith(HAND_OFF_TOAST)
}

/** The open-profile hand-off: nothing recorded for the created profile; the open one's home. */
function expectHomeHandOff(store: ReturnType<typeof makeAppStore>, router: { push: unknown }, openToast: unknown, openId: string) {
	expect(store.profile).toEqual({ id: openId })
	expect(setLastActiveProfileId).not.toHaveBeenCalledWith("created", expect.anything())
	expect(supersedeProfileActivations).not.toHaveBeenCalled()
	expect(router.push).toHaveBeenCalledTimes(1)
	expect(router.push).toHaveBeenCalledWith("/popup/general")
	expect(openToast).toHaveBeenCalledTimes(1)
	expect(openToast).toHaveBeenCalledWith(HAND_OFF_TOAST)
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(isActivatingOtherThan).mockReturnValue(false)
	vi.useFakeTimers()
	managers.account = undefined as never
})

afterEach(() => {
	vi.useRealTimers()
})

describe("activateCreatedProfile (popup manual sequence)", () => {
	test("a start-up inside the limit: the created profile starts at once and is active 59 s later; the tail runs in order", async () => {
		const store = makeAppStore()
		const { router, openToast, state } = start(store)
		store.profile = created
		await vi.advanceTimersByTimeAsync(59_000)
		store.isLogined = true
		await vi.advanceTimersByTimeAsync(200)

		expect(state.outcome).toBe("resolved")
		expect(setLastActiveProfileId).toHaveBeenCalledWith("created")
		expect(accountInstance.getAccounts).toHaveBeenCalledWith("created", "1", true)
		expect(store.accounts).toEqual([{ address: "0xACC", index: 0, visible: true }])
		expect(storageLocalSet).toHaveBeenCalledWith({ "nulo:ui:activeAccount": "0xACC" })
		expect(initTransactionService).toHaveBeenCalled()
		expect(router.push).toHaveBeenCalledWith("/popup/general")
		expect(openToast).not.toHaveBeenCalled()
		// The active-profile id is persisted before accounts load, and the active-account write lands
		// before navigating (the durable state a reopened popup reads).
		const setIdOrder = vi.mocked(setLastActiveProfileId).mock.invocationCallOrder[0]!
		expect(setIdOrder).toBeLessThan(accountInstance.getAccounts.mock.invocationCallOrder[0]!)
		expect(vi.mocked(storageLocalSet).mock.invocationCallOrder[0]!).toBeLessThan(router.push.mock.invocationCallOrder[0]!)
	})

	test("a bootstrap failure: the unlock screen with the created profile selected, and the toast once", async () => {
		const store = makeAppStore()
		const { router, openToast, state } = start(store)
		store.profile = created
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(supersedeProfileActivations).toHaveBeenCalledTimes(1)
		expectUnlockHandOff(store, router, openToast)
		expect(accountInstance.getAccounts).not.toHaveBeenCalled()
	})

	test("a start that never comes: at 30 s the unlock screen with the created profile selected over the one selected before", async () => {
		const store = makeAppStore({ profile: { id: "locked" } })
		const { router, openToast, state } = start(store, "locked")
		await vi.advanceTimersByTimeAsync(29_999)
		expect(state.outcome).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)

		expect(state.outcome).toBe("resolved")
		expectUnlockHandOff(store, router, openToast)
	})

	test("a slow start: 60 s after the create returns, the unlock screen", async () => {
		const store = makeAppStore()
		const { router, openToast, state } = start(store)
		store.profile = created
		await vi.advanceTimersByTimeAsync(59_999)
		expect(state.outcome).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)

		expect(state.outcome).toBe("resolved")
		expectUnlockHandOff(store, router, openToast)
	})

	test("a person who left the page meanwhile is not moved: no route, toast, pointer or supersede", async () => {
		const store = makeAppStore()
		const { router, openToast, state } = start(store)
		router.currentRoute.value.name = "popup-send"
		store.profile = created
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(router.push).not.toHaveBeenCalled()
		expect(openToast).not.toHaveBeenCalled()
		expect(setLastActiveProfileId).not.toHaveBeenCalled()
		expect(supersedeProfileActivations).not.toHaveBeenCalled()
	})

	test("another profile open when the created one never starts: its home and the toast, nothing recorded", async () => {
		const store = makeAppStore()
		const { router, openToast, state } = start(store)
		bootstrapped(store, "other")
		await vi.advanceTimersByTimeAsync(30_000)

		expect(state.outcome).toBe("resolved")
		expectHomeHandOff(store, router, openToast, "other")
	})

	test("the profile selected before the page opened, opening meanwhile, when the start never comes: its home", async () => {
		vi.mocked(isActivatingOtherThan).mockReturnValue(true)
		const store = makeAppStore({ profile: { id: "locked" } })
		const { router, openToast, state } = start(store, "locked")
		await vi.advanceTimersByTimeAsync(30_000)

		expect(state.outcome).toBe("resolved")
		expect(isActivatingOtherThan).toHaveBeenCalledWith("created")
		expectHomeHandOff(store, router, openToast, "locked")
	})

	test("control: a profile selected before the page opened, not open, is no other profile; the unlock screen", async () => {
		const store = makeAppStore({ profile: { id: "locked" } })
		const { router, openToast, state } = start(store, "locked")
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expectUnlockHandOff(store, router, openToast)
	})

	test("a person who leaves during the pointer write: the write is skipped, nothing selected, routed or shown", async () => {
		const store = makeAppStore({ profile: { id: "locked" } })
		const { router, openToast, state } = start(store, "locked")
		vi.mocked(setLastActiveProfileId).mockImplementationOnce(async (_id, options) => {
			router.currentRoute.value.name = "popup-auth"
			expect(options?.unless?.()).toBe(true)
		})
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(store.profile).toEqual({ id: "locked" })
		expect(router.push).not.toHaveBeenCalled()
		expect(openToast).not.toHaveBeenCalled()
	})

	test("another profile opening during the pointer write: the write is skipped and the popup goes to its home", async () => {
		const store = makeAppStore()
		vi.mocked(setLastActiveProfileId).mockImplementationOnce(async (_id, options) => {
			bootstrapped(store, "other")
			expect(options?.unless?.()).toBe(true)
		})
		const { router, openToast, state } = start(store)
		store.profile = created
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(store.profile).toEqual({ id: "other" })
		expect(router.push).toHaveBeenCalledTimes(1)
		expect(router.push).toHaveBeenCalledWith("/popup/general")
		expect(openToast).toHaveBeenCalledWith(HAND_OFF_TOAST)
	})

	test("another profile opened while the accounts load: no accounts written; its home and the toast", async () => {
		const store = makeAppStore()
		const accounts = deferred<Array<{ address: string; index: number; visible: boolean }>>()
		accountInstance.getAccounts.mockReturnValueOnce(accounts.promise)
		const { router, openToast, state } = start(store)
		bootstrapped(store, "created")
		await vi.advanceTimersByTimeAsync(0)
		expect(accountInstance.getAccounts).toHaveBeenCalledTimes(1)

		bootstrapped(store, "other")
		accounts.resolve([{ address: "0xACC", index: 0, visible: true }])
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(store.accounts).toEqual([])
		expect(storageLocalSet).not.toHaveBeenCalled()
		expect(router.push).toHaveBeenCalledTimes(1)
		expect(router.push).toHaveBeenCalledWith("/popup/general")
		expect(openToast).toHaveBeenCalledWith(HAND_OFF_TOAST)
	})

	test("the hand-off settles only once the page has left; a navigation that fails rejects, so the latch holds", async () => {
		const store = makeAppStore()
		const { router, openToast, state } = start(store)
		const leaving = deferred<unknown>()
		router.push.mockReturnValueOnce(leaving.promise)
		store.profile = created
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)
		expect(router.push).toHaveBeenCalledWith("/popup/auth")
		expect(state.outcome).toBe("pending")

		const cancelled = new Error("Navigation cancelled")
		leaving.resolve(cancelled)
		await vi.advanceTimersByTimeAsync(0)
		expect(state.outcome).toBe(cancelled)
		expect(openToast).toHaveBeenCalledWith(HAND_OFF_TOAST)
	})

	test("the hand-off's own failure rejects, routes nowhere and shows no toast", async () => {
		const store = makeAppStore()
		vi.mocked(setLastActiveProfileId).mockRejectedValueOnce(new Error("storage"))
		const { router, openToast, state } = start(store)
		store.profile = created
		store.bootstrapFailure = { profileId: "created", message: "boom" }
		await vi.advanceTimersByTimeAsync(0)

		expect((state.outcome as Error).message).toBe("storage")
		expect(router.push).not.toHaveBeenCalled()
		expect(openToast).not.toHaveBeenCalled()
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

	test("a step after the created profile opened fails: no accounts loaded; its home and the toast", async () => {
		const store = makeAppStore({ network: undefined })
		bootstrapped(store, "created")
		const { router, openToast, state } = start(store)
		await vi.advanceTimersByTimeAsync(0)

		expect(state.outcome).toBe("resolved")
		expect(accountInstance.getAccounts).not.toHaveBeenCalled()
		expect(supersedeProfileActivations).not.toHaveBeenCalled()
		expect(router.push).toHaveBeenCalledTimes(1)
		expect(router.push).toHaveBeenCalledWith("/popup/general")
		expect(openToast).toHaveBeenCalledWith(HAND_OFF_TOAST)
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
