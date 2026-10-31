import { effectScope } from "vue"
import { flushPromises } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { deferred } from "@nulo/wallet-core/utils"

vi.mock("@/utils/core", () => {
	const profileMock = {
		getProfiles: vi.fn(async () => [] as Array<{ name: string }>),
		createProfile: vi.fn(async () => ({ id: "p1", name: "Created", type: "password" })),
		generateProfileId: vi.fn(async () => "p1"),
		createPasskeyProfile: vi.fn(async () => ({ id: "p1", name: "Created", type: "passkey" })),
	}
	return { managers: { profile: profileMock } }
})

vi.mock("@/wallet/utils/create-passkey-profile", () => ({
	createPasskeyProfileInPage: vi.fn(async () => ({
		profile: { id: "p1", name: "Created", type: "passkey" },
		credentialData: { id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" },
	})),
}))

vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: vi.fn(() => false) }))

import { managers } from "@/utils/core"
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { createPasskeyProfileInPage } from "@/wallet/utils/create-passkey-profile"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import { useProfileCreateFlow, type UseProfileCreateFlowOptions } from "./useProfileCreateFlow"

const profileApi = managers.profile as unknown as Record<string, ReturnType<typeof vi.fn>>
const passkeyRetry = createPasskeyProfileInPage as unknown as ReturnType<typeof vi.fn>

function makeFlow(overrides: Partial<UseProfileCreateFlowOptions> = {}) {
	const opts: UseProfileCreateFlowOptions = {
		onCreated: vi.fn(async () => undefined),
		notifyCreateFailed: vi.fn(),
		openToast: vi.fn(),
		...overrides,
	}
	const scope = effectScope()
	let flow!: ReturnType<typeof useProfileCreateFlow>
	scope.run(() => {
		flow = useProfileCreateFlow(opts)
	})
	return { flow, opts, stop: () => scope.stop() }
}

beforeEach(() => {
	vi.clearAllMocks()
	profileApi.getProfiles.mockResolvedValue([])
	vi.mocked(closesOnFocusLoss).mockReturnValue(false)
})

describe("useProfileCreateFlow", () => {
	test("both create pages open on Passkey", () => {
		expect(makeFlow().flow.authMethod.value).toBe("passkey")
	})

	test("password create happy path creates + activates once", async () => {
		const { flow, opts } = makeFlow()
		flow.authMethod.value = "password"
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flow.handleCreate()
		expect(profileApi.createProfile).toHaveBeenCalledWith("MyProfile", "password123")
		expect(opts.onCreated).toHaveBeenCalledTimes(1)
		expect(opts.onCreated).toHaveBeenCalledWith({ id: "p1", name: "Created", type: "password" }, undefined, "password123")
		expect(flow.isCreating.value).toBe(false)
	})

	// The phrase stage opens the new profile's recovery phrase with this answer, so no second prompt runs.
	test("an in-page passkey create activates once and hands on the answer it was made from", async () => {
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.authMethod.value = "passkey"
		await flow.handleCreate()
		expect(passkeyRetry).toHaveBeenCalledTimes(1)
		expect(passkeyRetry.mock.calls[0]?.[0]).toBe("MyProfile")
		expect(opts.onCreated).toHaveBeenCalledExactlyOnceWith(
			{ id: "p1", name: "Created", type: "passkey" },
			{ id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" },
			undefined,
		)
	})

	test("in Firefox's toolbar panel, passkey create goes to the background once, with no in-page ceremony", async () => {
		vi.mocked(closesOnFocusLoss).mockReturnValue(true)
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.authMethod.value = "passkey"
		await flow.handleCreate()
		expect(profileApi.createPasskeyProfile).toHaveBeenCalledTimes(1)
		expect(profileApi.createPasskeyProfile).toHaveBeenCalledWith("MyProfile", undefined, false)
		expect(profileApi.generateProfileId).not.toHaveBeenCalled()
		expect(passkeyRetry).not.toHaveBeenCalled()
		expect(opts.onCreated).toHaveBeenCalledExactlyOnceWith({ id: "p1", name: "Created", type: "passkey" }, undefined, undefined)
	})

	describe("with a passkey the person already has", () => {
		test("the page asks a discovery and confirms no credential an earlier create saved", async () => {
			const { flow, opts } = makeFlow()
			passkeyRetry.mockRejectedValueOnce(
				new PasskeyUnconfirmedError("Y3JlZA==", "c2F2ZWQ=", new DOMException("no", "NotAllowedError")),
			)
			flow.profileName.value = "MyProfile"
			await flow.handleCreate()
			await flow.handleCreateWithExistingPasskey()
			expect(passkeyRetry.mock.calls.at(-1)).toEqual(["MyProfile", expect.anything(), undefined, true])
			expect(opts.onCreated).toHaveBeenCalledOnce()
		})

		test("in Firefox's toolbar panel the background asks it", async () => {
			vi.mocked(closesOnFocusLoss).mockReturnValue(true)
			const { flow } = makeFlow()
			flow.profileName.value = "MyProfile"
			await flow.handleCreateWithExistingPasskey()
			expect(profileApi.createPasskeyProfile).toHaveBeenCalledExactlyOnceWith("MyProfile", undefined, true)
		})

		test("on the Password tab it does nothing", async () => {
			const { flow, opts } = makeFlow()
			flow.authMethod.value = "password"
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await flow.handleCreateWithExistingPasskey()
			expect(profileApi.createProfile).not.toHaveBeenCalled()
			expect(passkeyRetry).not.toHaveBeenCalled()
			expect(opts.onCreated).not.toHaveBeenCalled()
		})
	})

	describe("a run seals the unlock it was admitted with", () => {
		/** Runs `submit` with the profile-name read held until `change` has edited the form. */
		async function changeFormMidRun(submit: () => Promise<void> | undefined, change: () => void) {
			const names = deferred<Array<{ name: string }>>()
			profileApi.getProfiles.mockReturnValueOnce(names.promise)
			const run = submit()
			change()
			names.resolve([])
			await run
		}

		test.each([
			["handleCreate", false],
			["handleCreateWithExistingPasskey", true],
		] as const)("%s admitted on Passkey creates the passkey profile once", async (handler, existing) => {
			const { flow, opts } = makeFlow()
			flow.profileName.value = "MyProfile"
			await changeFormMidRun(flow[handler], () => {
				flow.authMethod.value = "password"
				flow.password.value = "typed after"
				flow.repeatedPassword.value = "typed after"
			})
			expect(passkeyRetry).toHaveBeenCalledOnce()
			expect(passkeyRetry.mock.calls[0]?.[3]).toBe(existing)
			expect(profileApi.createProfile).not.toHaveBeenCalled()
			expect(opts.onCreated).toHaveBeenCalledOnce()
		})

		test("admitted on Password, it creates under the admitted password and hands that password on", async () => {
			const { flow, opts } = makeFlow()
			flow.authMethod.value = "password"
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await changeFormMidRun(flow.handleCreate, () => {
				flow.authMethod.value = "passkey"
				flow.password.value = "typed after"
			})
			expect(passkeyRetry).not.toHaveBeenCalled()
			expect(profileApi.createProfile).toHaveBeenCalledExactlyOnceWith("MyProfile", "password123")
			expect(opts.onCreated).toHaveBeenCalledExactlyOnceWith(
				{ id: "p1", name: "Created", type: "password" },
				undefined,
				"password123",
			)
		})
	})

	test("latch: two synchronous submits create only once", async () => {
		const { flow, opts } = makeFlow()
		flow.authMethod.value = "password"
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await Promise.all([flow.handleCreate(), flow.handleCreate()])
		expect(profileApi.createProfile).toHaveBeenCalledTimes(1)
		expect(opts.onCreated).toHaveBeenCalledTimes(1)
	})

	test("a first profile shows no name field and is created as Main", async () => {
		const { flow } = makeFlow()
		flow.authMethod.value = "password"
		await flushPromises()
		expect(flow.nameFieldState.value).toBe("hidden")
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flow.handleCreate()
		expect(profileApi.createProfile).toHaveBeenCalledWith("Main", "password123")
	})

	test("a later profile shows the field prefilled; clearing it blocks creation and resets the latch", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Main" }])
		const { flow, opts } = makeFlow()
		await flushPromises()
		expect(flow.nameFieldState.value).toBe("shown")
		expect(flow.profileName.value).toBe("Profile 2")
		flow.profileName.value = ""
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flow.handleCreate()
		expect(profileApi.createProfile).not.toHaveBeenCalled()
		expect(opts.onCreated).not.toHaveBeenCalled()
		expect(flow.isCreating.value).toBe(false)
		expect(flow.nameError.value).toBeTruthy()
	})

	test("a rejected profile read releases the latch and notifies; a retry creates", async () => {
		const { flow, opts } = makeFlow()
		flow.authMethod.value = "password"
		await flushPromises()
		profileApi.getProfiles.mockRejectedValueOnce(new Error("worker gone"))
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flow.handleCreate()
		expect(opts.notifyCreateFailed).toHaveBeenCalledWith(false)
		expect(profileApi.createProfile).not.toHaveBeenCalled()
		expect(flow.isCreating.value).toBe(false)
		await flow.handleCreate()
		expect(profileApi.createProfile).toHaveBeenCalledWith("Main", "password123")
	})

	test("duplicate name blocks creation", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Taken" }])
		const { flow, opts } = makeFlow()
		flow.profileName.value = "Taken"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await flow.handleCreate()
		expect(profileApi.createProfile).not.toHaveBeenCalled()
		expect(opts.onCreated).not.toHaveBeenCalled()
	})

	test("passkey user-cancel is silent (no failure notification)", async () => {
		passkeyRetry.mockRejectedValueOnce(new UserRejectedError("cancelled"))
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.authMethod.value = "passkey"
		await flow.handleCreate()
		expect(opts.notifyCreateFailed).not.toHaveBeenCalled()
		expect(opts.onCreated).not.toHaveBeenCalled()
		expect(flow.isCreating.value).toBe(false)
	})

	test("a passkey prompt that was not confirmed toasts one line and blames no authenticator", async () => {
		passkeyRetry.mockRejectedValueOnce(new DOMException("not allowed", "NotAllowedError"))
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.authMethod.value = "passkey"
		await flow.handleCreate()
		expect(opts.openToast).toHaveBeenCalledWith({ kind: "error", label: "Passkey not confirmed. Try again." })
		expect(opts.notifyCreateFailed).not.toHaveBeenCalled()
		expect(flow.isCreating.value).toBe(false)
	})

	test.each([
		["a passkey the person already has", true, new PasskeyPrfError("Passkey PRF not available")],
		["a new passkey", false, new PasskeyUnconfirmedError("Y3JlZA==", "c2FsdA==", new PasskeyPrfError("Passkey PRF not available"))],
	])("%s that gives no PRF toasts the unlock's line and raises no notice", async (_case, existing, failure) => {
		passkeyRetry.mockRejectedValueOnce(failure)
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.authMethod.value = "passkey"
		await (existing ? flow.handleCreateWithExistingPasskey() : flow.handleCreate())
		expect(opts.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "This passkey can't unlock Nulo." })
		expect(opts.notifyCreateFailed).not.toHaveBeenCalled()
		expect(flow.isCreating.value).toBe(false)
	})

	test.each(["password", "passkey"] as const)(
		"a %s create that fails after the page left raises no notice and no toast",
		async (method) => {
			let reject!: (e: unknown) => void
			const pending = () => new Promise<never>((_, r) => (reject = r))
			if (method === "password") profileApi.createProfile.mockImplementationOnce(pending)
			else passkeyRetry.mockImplementationOnce(pending)
			const { flow, opts } = makeFlow()
			flow.authMethod.value = method
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			const submitted = flow.handleCreate()
			await flushPromises()
			flow.dispose()
			reject(new Error("boom"))
			await submitted
			expect(opts.notifyCreateFailed).not.toHaveBeenCalled()
			expect(opts.openToast).not.toHaveBeenCalled()
		},
	)

	test("password create failure notifies with isPasskey=false, whatever the tab shows by then", async () => {
		const failed = deferred<never>()
		profileApi.createProfile.mockReturnValueOnce(failed.promise)
		const { flow, opts } = makeFlow()
		flow.authMethod.value = "password"
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		const submitted = flow.handleCreate()
		await flushPromises()
		expect(profileApi.createProfile).toHaveBeenCalledOnce()
		flow.authMethod.value = "passkey"
		failed.reject(new Error("boom"))
		await submitted
		expect(opts.notifyCreateFailed).toHaveBeenCalledWith(false)
		expect(opts.onCreated).not.toHaveBeenCalled()
		expect(flow.isCreating.value).toBe(false)
	})

	test("passkey create failure notifies with isPasskey=true", async () => {
		passkeyRetry.mockRejectedValueOnce(new Error("authenticator exploded"))
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.authMethod.value = "passkey"
		await flow.handleCreate()
		expect(opts.notifyCreateFailed).toHaveBeenCalledWith(true)
	})

	test("isAllowedToContinue: passkey always true; password needs length + match", () => {
		const { flow } = makeFlow()
		flow.authMethod.value = "passkey"
		expect(flow.isAllowedToContinue.value).toBe(true)
		flow.authMethod.value = "password"
		flow.password.value = "short"
		expect(flow.isAllowedToContinue.value).toBe(false)
		flow.password.value = "password123"
		flow.repeatedPassword.value = "different"
		expect(flow.isAllowedToContinue.value).toBe(false)
		flow.repeatedPassword.value = "password123"
		expect(flow.isAllowedToContinue.value).toBe(true)
	})

	test("strengthHint reflects password state", () => {
		const { flow } = makeFlow()
		flow.authMethod.value = "passkey"
		expect(flow.strengthHint.value).toBe("")
		flow.authMethod.value = "password"
		flow.password.value = "short"
		expect(flow.strengthHint.value).toBe("At least 8 characters")
		flow.password.value = "password123"
		flow.repeatedPassword.value = "nope"
		expect(flow.strengthHint.value).toBe("Passwords don't match")
		flow.repeatedPassword.value = "password123"
		expect(flow.strengthHint.value).toBe("Strong password")
	})

	describe("passkey retry after a created-but-unconfirmed credential", () => {
		const saved = { credentialId: "Y3JlZA==", prfSalt: "c2F2ZWQ=" }
		const notConfirmed = () => new PasskeyUnconfirmedError(saved.credentialId, saved.prfSalt, new DOMException("no", "NotAllowedError"))
		const noPrf = () => new PasskeyUnconfirmedError(saved.credentialId, saved.prfSalt, new PasskeyPrfError("Passkey PRF not available"))

		async function attempt(flow: ReturnType<typeof makeFlow>["flow"], name: string) {
			flow.profileName.value = name
			flow.authMethod.value = "passkey"
			await flow.handleCreate()
			return passkeyRetry.mock.calls.at(-1)?.[2]
		}

		test("a retry after 'not confirmed' confirms the saved credential; a second refusal keeps it", async () => {
			const { flow } = makeFlow()
			passkeyRetry.mockRejectedValueOnce(notConfirmed()).mockRejectedValueOnce(notConfirmed())
			expect(await attempt(flow, "MyProfile")).toBeUndefined()
			expect(await attempt(flow, "MyProfile")).toEqual(saved)
			expect(await attempt(flow, "MyProfile")).toEqual(saved)
			expect(await attempt(flow, "MyProfile")).toBeUndefined()
		})

		test("a cancel during the confirmation stays silent and keeps the credential for the retry", async () => {
			const { flow, opts } = makeFlow()
			passkeyRetry.mockRejectedValueOnce(new PasskeyUnconfirmedError(saved.credentialId, saved.prfSalt, new UserRejectedError()))
			await attempt(flow, "MyProfile")
			expect(await attempt(flow, "MyProfile")).toEqual(saved)
			expect(opts.openToast).not.toHaveBeenCalled()
			expect(opts.notifyCreateFailed).not.toHaveBeenCalled()
		})

		test.each([
			["the authenticator gave no PRF", noPrf, "MyProfile"],
			["the name changed", notConfirmed, "Renamed"],
		])("control: a retry after %s runs a fresh create", async (_label, failure, retryName) => {
			const { flow } = makeFlow()
			passkeyRetry.mockRejectedValueOnce(failure())
			await attempt(flow, "MyProfile")
			expect(await attempt(flow, retryName)).toBeUndefined()
		})
	})

	test("an activation that fails keeps the latch and logs a fixed line, never the error", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const { flow } = makeFlow({ onCreated: vi.fn(async () => Promise.reject(new Error("Network not set"))) })
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await expect(flow.handleCreate()).resolves.toBeUndefined()
		expect(flow.isCreating.value).toBe(true)
		expect(warn).toHaveBeenCalledExactlyOnceWith("profile activation failed")
		warn.mockRestore()
	})

	test("dispose() is callable and the composable registers no onUnmounted", () => {
		const { flow, stop } = makeFlow()
		expect(() => flow.dispose()).not.toThrow()
		stop()
	})
})
