import { effectScope } from "vue"
import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { DuplicateWalletError, UserRejectedError } from "@nulo/extension-messaging/errors"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"

vi.mock("@/utils/core", () => {
	const profileMock = {
		getProfiles: vi.fn(async () => [] as Array<{ name: string }>),
		importMnemonic: vi.fn(async () => ({ id: "p1", name: "Imported", type: "password" })),
	}
	return { managers: { profile: profileMock } }
})

vi.mock("@/utils", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/utils")>()), pickFile: vi.fn() }))
// Spied, not replaced: the seed path's error surface keeps only the message, and this sees the error.
vi.mock("@nulo/wallet-core/utils", async (importOriginal) => {
	const original = await importOriginal<typeof import("@nulo/wallet-core/utils")>()
	return { ...original, errorMessageFromUnknown: vi.fn(original.errorMessageFromUnknown) }
})

import { managers } from "@/utils/core"
import { pickFile } from "@/utils"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
import { PasskeyPrfError } from "@/wallet/utils/passkey-errors"
import { useProfileImportFlow, type UseProfileImportFlowOptions } from "./useProfileImportFlow"

const profileApi = managers.profile as unknown as Record<string, ReturnType<typeof vi.fn>>

/** Run the composable inside an owned effect scope so its internal `watch` is
 *  disposed between tests; return the flow + a scope-stopper. The flow starts on the Password tab
 *  unless `onPasskey`. */
function makeFlow(overrides: Partial<UseProfileImportFlowOptions> = {}, onPasskey = false) {
	const opts: UseProfileImportFlowOptions = {
		completeImport: vi.fn(async () => undefined),
		showErrorLog: vi.fn(),
		openToast: vi.fn(),
		...overrides,
	}
	const scope = effectScope()
	let flow!: ReturnType<typeof useProfileImportFlow>
	scope.run(() => {
		flow = useProfileImportFlow(opts)
	})
	if (!onPasskey) flow.unlockMethod.value = "password"
	return { flow, opts, stop: () => scope.stop() }
}

/** A phrase the import accepts: 24 words on the wordlist with a valid checksum. */
const SEED_24 = `${"abandon ".repeat(23)}art`
const tick = () => new Promise((r) => setTimeout(r, 0))

/** Types a phrase and waits for its verdict, as a person sees the hint before pressing Import. */
async function typePhrase(flow: ReturnType<typeof useProfileImportFlow>, phrase: string) {
	flow.seedPhrase.value = phrase
	await vi.waitFor(() => expect(flow.phraseVerdict.value.kind).not.toBe("pending"))
}

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
	vi.clearAllMocks()
	profileApi.getProfiles.mockResolvedValue([])
	// The flow reads cacheStore/popupStore for the duplicate-phrase confirm dialog.
	setActivePinia(createPinia())
})

describe("useProfileImportFlow", () => {
	test("seed happy path imports and completes once", async () => {
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await flow.handleImportSeed()
		expect(profileApi.importMnemonic).toHaveBeenCalledWith("MyProfile", SEED_24.split(" "), "password123", false, undefined)
		expect(opts.completeImport).toHaveBeenCalledTimes(1)
		expect(flow.isImporting.value).toBe(false)
	})

	test("latch: two synchronous seed calls import only once", async () => {
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await Promise.all([flow.handleImportSeed(), flow.handleImportSeed()])
		expect(profileApi.importMnemonic).toHaveBeenCalledTimes(1)
		expect(opts.completeImport).toHaveBeenCalledTimes(1)
	})

	test("a first-run seed import shows no name field and is named Main", async () => {
		const { flow } = makeFlow()
		await flushPromises()
		expect(flow.nameFieldState.value).toBe("hidden")
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await flow.handleImportSeed()
		expect(profileApi.importMnemonic).toHaveBeenCalledWith("Main", SEED_24.split(" "), "password123", false, undefined)
	})

	test("a selected backup's name prefills an untouched field: named → nameless → named", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Main" }])
		const { flow } = makeFlow()
		await flushPromises()
		const pick = pickFile as unknown as ReturnType<typeof vi.fn>
		const backupFile = (profile: Record<string, unknown>) =>
			new File([JSON.stringify({ data: { profile: { type: "password", ...profile } } })], "b.json", { type: "application/json" })

		pick.mockResolvedValueOnce(backupFile({ name: "Alpha" }))
		await flow.pickBackupFile()
		await flushPromises()
		expect(flow.profileName.value).toBe("Alpha")

		pick.mockResolvedValueOnce(backupFile({}))
		await flow.pickBackupFile()
		await flushPromises()
		expect(flow.profileName.value).toBe("Profile 2")

		pick.mockResolvedValueOnce(backupFile({ name: "Beta" }))
		await flow.pickBackupFile()
		await flushPromises()
		expect(flow.profileName.value).toBe("Beta")
	})

	test("a cleared name blocks the import and resets the latch", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Main" }])
		const { flow, opts } = makeFlow()
		await flushPromises()
		flow.profileName.value = ""
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await flow.handleImportSeed()
		expect(profileApi.importMnemonic).not.toHaveBeenCalled()
		expect(opts.completeImport).not.toHaveBeenCalled()
		expect(flow.isImporting.value).toBe(false)
		expect(flow.nameError.value).toBeTruthy()
	})

	test("duplicate name blocks the import", async () => {
		profileApi.getProfiles.mockResolvedValue([{ name: "Taken" }])
		const { flow, opts } = makeFlow()
		flow.profileName.value = "Taken"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await flow.handleImportSeed()
		expect(profileApi.importMnemonic).not.toHaveBeenCalled()
		expect(opts.completeImport).not.toHaveBeenCalled()
		expect(flow.nameError.value).toBeTruthy()
	})

	test("(A1) generic import error uses the unified shape, not [object Object]", async () => {
		profileApi.importMnemonic.mockRejectedValueOnce(new Error("boom"))
		const { flow } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await flow.handleImportSeed()
		expect(flow.error.value).toEqual({ type: "unknown", title: "Import failed", tooltip: "boom" })
		// The title is a real string, never the Error object -> no "[object Object]".
		expect(String(flow.error.value.title)).not.toBe("[object Object]")
	})

	test("(Quirk 1) completeImport fires exactly once per import — composable never bootstraps", async () => {
		// The composable has no bootstrap dependency; activation happens solely
		// through the injected completeImport. Pinning call-count == 1 catches a
		// regression that an end-state-only assertion would miss.
		const { flow, opts } = makeFlow()
		flow.profileName.value = "MyProfile"
		flow.selectedImportOption.value = "seed"
		flow.password.value = "password123"
		flow.repeatedPassword.value = "password123"
		await typePhrase(flow, SEED_24)
		await flow.handleImportSeed()
		expect(opts.completeImport).toHaveBeenCalledTimes(1)
		expect(opts.completeImport).toHaveBeenCalledWith({ id: "p1", name: "Imported", type: "password" })
	})

	// Duplicate-recovery-phrase warn-and-confirm (owner policy: warned choice, never a hard block).
	describe("duplicate-phrase confirm", () => {
		/** Drive the ConfirmPopup the way the real popup does: invoke the stashed callback. */
		async function confirmDialog() {
			const { useCacheStore } = await import("@/stores/cache.store")
			const { usePopupStore } = await import("@/stores/popup.store")
			expect(usePopupStore().isOpened("confirm")).toBe(true)
			const confirm = useCacheStore().confirm as { callback?: () => void; title?: string; description?: string }
			expect(confirm.title).toBeTruthy()
			confirm.callback?.()
			return confirm
		}
		/** Dismiss it: the popup store close IS the cancel signal (ConfirmPopup has no cancel hook), and
		 *  the popup replaces the request object as it closes. */
		async function dismissDialog() {
			const { usePopupStore } = await import("@/stores/popup.store")
			const { useCacheStore } = await import("@/stores/cache.store")
			usePopupStore().close("confirm")
			useCacheStore().confirm = {}
		}

		test("seed: a duplicate throws → dialog → confirm retries with allowDuplicate", async () => {
			profileApi.importMnemonic
				.mockRejectedValueOnce(new DuplicateWalletError(undefined, { existingProfileName: "Main" }))
				.mockResolvedValueOnce({ id: "p2", name: "Dup", type: "password" })
			const { flow, opts } = makeFlow()
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await typePhrase(flow, SEED_24)

			const p = flow.handleImportSeed()
			await tick()
			const confirm = await confirmDialog()
			// The dialog NAMES the colliding profile (never key material).
			expect(String(confirm.description)).toContain("Main")
			await p

			expect(profileApi.importMnemonic).toHaveBeenCalledTimes(2)
			expect(profileApi.importMnemonic).toHaveBeenLastCalledWith("MyProfile", SEED_24.split(" "), "password123", true, undefined)
			expect(opts.completeImport).toHaveBeenCalledTimes(1)
		})

		test("seed: declining the dialog abandons the import (no retry, no completeImport)", async () => {
			profileApi.importMnemonic.mockRejectedValueOnce(new DuplicateWalletError(undefined, { existingProfileName: "Main" }))
			const { flow, opts } = makeFlow()
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await typePhrase(flow, SEED_24)

			const p = flow.handleImportSeed()
			await tick()
			await dismissDialog()
			await p

			expect(profileApi.importMnemonic).toHaveBeenCalledTimes(1)
			expect(opts.completeImport).not.toHaveBeenCalled()
			expect(flow.isImporting.value).toBe(false)
		})

		test("seed: a second warning after a dismissed one carries its own request and retries on confirm", async () => {
			profileApi.importMnemonic
				.mockRejectedValueOnce(new DuplicateWalletError(undefined, { existingProfileName: "Main" }))
				.mockRejectedValueOnce(new DuplicateWalletError(undefined, { existingProfileName: "Savings" }))
				.mockResolvedValueOnce({ id: "p2", name: "Dup", type: "password" })
			const { flow, opts } = makeFlow()
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await typePhrase(flow, SEED_24)

			const first = flow.handleImportSeed()
			await tick()
			await dismissDialog()
			await first

			const second = flow.handleImportSeed()
			await tick()
			expect(profileApi.importMnemonic).toHaveBeenCalledTimes(2)
			const confirm = (await confirmDialog()) as { description?: string; confirm_text?: string }
			expect(String(confirm.description)).toContain("Savings")
			expect(confirm.confirm_text).toBe("Add anyway")
			await second

			expect(profileApi.importMnemonic).toHaveBeenCalledTimes(3)
			expect(profileApi.importMnemonic).toHaveBeenLastCalledWith("MyProfile", SEED_24.split(" "), "password123", true, undefined)
			expect(opts.completeImport).toHaveBeenCalledTimes(1)
		})

		test("a NON-duplicate error still routes to the generic error surface (no dialog)", async () => {
			profileApi.importMnemonic.mockRejectedValueOnce(new Error("boom"))
			const { flow } = makeFlow()
			flow.profileName.value = "MyProfile"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await typePhrase(flow, SEED_24)
			await flow.handleImportSeed()
			expect(flow.error.value.tooltip).toBe("boom")
			expect(profileApi.importMnemonic).toHaveBeenCalledTimes(1)
		})
	})

	describe("a phrase imported under a passkey", () => {
		const ANSWER = { id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" } as unknown as PasskeyCredentialData
		/** A flow on the Passkey tab with a 24-word phrase and a name, and no password typed. */
		async function passkeyFlow() {
			const made = makeFlow({}, true)
			made.flow.profileName.value = "MyProfile"
			await typePhrase(made.flow, SEED_24)
			return made
		}

		test("a phrase opens on Passkey; Import asks a new passkey for the profile, then imports under its answer", async () => {
			const { flow, opts } = await passkeyFlow()
			expect(flow.unlockMethod.value).toBe("passkey")
			expect(flow.isAllowedToImportBySeedPhrase.value).toBe(true)
			const run = flow.handleImportSeed()
			await vi.waitFor(() =>
				expect(flow.ceremonyRequest.value).toMatchObject({ mode: "create", step: "import", profileName: "MyProfile" }),
			)
			expect(profileApi.importMnemonic).not.toHaveBeenCalled()
			flow.onCeremonyResolve(ANSWER)
			await run
			expect(profileApi.importMnemonic).toHaveBeenCalledExactlyOnceWith("MyProfile", SEED_24.split(" "), undefined, false, ANSWER)
			expect(opts.completeImport).toHaveBeenCalledOnce()
		})

		test("with a passkey the person already has, the card asks a discovery; on the Password tab nothing runs", async () => {
			const { flow } = await passkeyFlow()
			const run = flow.handleImportSeedWithExistingPasskey()
			await vi.waitFor(() => expect(flow.ceremonyRequest.value?.mode).toBe("discover"))
			flow.onCeremonyResolve(ANSWER)
			await run
			expect(profileApi.importMnemonic).toHaveBeenCalledExactlyOnceWith("MyProfile", SEED_24.split(" "), undefined, false, ANSWER)
			flow.unlockMethod.value = "password"
			flow.password.value = "password123"
			flow.repeatedPassword.value = "password123"
			await flow.handleImportSeedWithExistingPasskey()
			expect(profileApi.importMnemonic).toHaveBeenCalledOnce()
		})

		test("a cancelled card imports nothing, reports nothing, and leaves the form filled", async () => {
			const { flow, opts } = await passkeyFlow()
			const run = flow.handleImportSeed()
			await vi.waitFor(() => expect(flow.ceremonyRequest.value).not.toBeNull())
			flow.onCeremonyReject(new UserRejectedError())
			await run
			expect(profileApi.importMnemonic).not.toHaveBeenCalled()
			expect(opts.openToast).not.toHaveBeenCalled()
			expect([flow.profileName.value, flow.seedPhrase.value, flow.unlockMethod.value, flow.error.value.type]).toEqual([
				"MyProfile",
				SEED_24,
				"passkey",
				"",
			])
			expect(flow.isImporting.value).toBe(false)
		})

		test("a card with no PRF shows the page's copy, and the error it throws keeps the refusal as its cause", async () => {
			const { flow } = await passkeyFlow()
			const run = flow.handleImportSeed()
			await vi.waitFor(() => expect(flow.ceremonyRequest.value).not.toBeNull())
			const refusal = new PasskeyPrfError("Passkey PRF not available")
			flow.onCeremonyReject(refusal)
			await run
			expect(flow.error.value).toMatchObject({ type: "unknown", tooltip: "This passkey can't unlock Nulo." })
			expect(vi.mocked(errorMessageFromUnknown).mock.calls.at(-1)?.[0]).toMatchObject({
				message: "This passkey can't unlock Nulo.",
				cause: refusal,
			})
		})

		test("a failed card reports and imports nothing", async () => {
			const { flow } = await passkeyFlow()
			const run = flow.handleImportSeed()
			await vi.waitFor(() => expect(flow.ceremonyRequest.value).not.toBeNull())
			flow.onCeremonyReject(new Error("authenticator broke"))
			await run
			expect(profileApi.importMnemonic).not.toHaveBeenCalled()
			expect(flow.error.value).toMatchObject({ type: "unknown", tooltip: "authenticator broke" })
		})

		test("the duplicate warning's confirm imports under the same answer, asking no second card", async () => {
			profileApi.importMnemonic
				.mockRejectedValueOnce(new DuplicateWalletError(undefined, { existingProfileName: "Main" }))
				.mockResolvedValueOnce({ id: "p2", name: "Dup", type: "passkey" })
			const { flow } = await passkeyFlow()
			const run = flow.handleImportSeed()
			await vi.waitFor(() => expect(flow.ceremonyRequest.value).not.toBeNull())
			flow.onCeremonyResolve(ANSWER)
			await vi.waitFor(() => expect(profileApi.importMnemonic).toHaveBeenCalledOnce())
			await tick()
			const { useCacheStore } = await import("@/stores/cache.store")
			;(useCacheStore().confirm as { callback?: () => void }).callback?.()
			await run
			expect(profileApi.importMnemonic).toHaveBeenLastCalledWith("MyProfile", SEED_24.split(" "), undefined, true, ANSWER)
			expect(flow.ceremonyRequest.value).toBeNull()
		})

		test("a backup opens the choice on the method it was made with; a cleared form opens on Passkey again", async () => {
			const { flow } = await passkeyFlow()
			const pick = pickFile as unknown as ReturnType<typeof vi.fn>
			const backupFile = (type: string) =>
				new File([JSON.stringify({ data: { profile: { type, name: "B" } } })], "b.json", { type: "application/json" })
			pick.mockResolvedValueOnce(backupFile("password"))
			await flow.pickBackupFile()
			await flushPromises()
			expect(flow.unlockMethod.value).toBe("password")
			flow.unlockMethod.value = "passkey"
			pick.mockResolvedValueOnce(backupFile("passkey"))
			await flow.pickBackupFile()
			await flushPromises()
			expect(flow.unlockMethod.value).toBe("passkey")
			pick.mockResolvedValueOnce(backupFile("password"))
			await flow.pickBackupFile()
			await flushPromises()
			expect(flow.unlockMethod.value).toBe("password")
			flow.unlockMethod.value = "passkey"
			pick.mockResolvedValueOnce(backupFile("password"))
			await flow.pickBackupFile()
			await flushPromises()
			expect(flow.unlockMethod.value, "a second backup of the same type").toBe("password")
			flow.handleBack()
			expect(flow.unlockMethod.value).toBe("passkey")
		})

		test.each([
			["a word off the wordlist", `${"abandon ".repeat(23)}nulo`],
			["a bad checksum", "abandon ".repeat(24).trim()],
		])("a phrase the import refuses (%s) keeps Import closed and asks no passkey", async (_, phrase) => {
			const { flow } = await passkeyFlow()
			await typePhrase(flow, phrase)
			expect(flow.isAllowedToImportBySeedPhrase.value).toBe(false)
			await flow.handleImportSeed()
			expect(flow.ceremonyRequest.value).toBeNull()
			expect(profileApi.importMnemonic).not.toHaveBeenCalled()
		})
	})

	describe("the phrase's verdict", () => {
		/** A Password-tab flow with a valid new password, so only the phrase gates Import. */
		function passwordFlow() {
			const made = makeFlow()
			made.flow.password.value = "password123"
			made.flow.repeatedPassword.value = "password123"
			return made
		}

		test("a bad checksum keeps Import closed with its own verdict; the valid phrase padded and double-spaced opens it", async () => {
			const { flow } = passwordFlow()
			await typePhrase(flow, "abandon ".repeat(24).trim())
			expect([flow.phraseVerdict.value, flow.isAllowedToImportBySeedPhrase.value]).toEqual([{ kind: "checksum" }, false])
			await typePhrase(flow, `  ${SEED_24.replaceAll(" ", "  ")} `)
			expect([flow.phraseVerdict.value, flow.isAllowedToImportBySeedPhrase.value]).toEqual([{ kind: "valid" }, true])
			await flow.handleImportSeed()
			expect(profileApi.importMnemonic).toHaveBeenCalledWith("Main", SEED_24.split(" "), "password123", false, undefined)
		})

		test("an edit closes Import at once, and a valid verdict it overtook never comes back", async () => {
			const { flow } = passwordFlow()
			await typePhrase(flow, SEED_24)
			expect(flow.isAllowedToImportBySeedPhrase.value).toBe(true)
			const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
			const held = Promise.withResolvers<void>()
			vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementationOnce(async (...args) => {
				await held.promise
				return digest(...args)
			})
			flow.seedPhrase.value = `${SEED_24} `
			expect([flow.phraseVerdict.value.kind, flow.isAllowedToImportBySeedPhrase.value]).toEqual(["pending", false])
			await flow.handleImportSeed()
			expect(profileApi.importMnemonic).not.toHaveBeenCalled()
			await typePhrase(flow, SEED_24.split(" ").slice(1).join(" "))
			held.resolve()
			await flushPromises()
			expect([flow.phraseVerdict.value, flow.isAllowedToImportBySeedPhrase.value]).toEqual([{ kind: "count", count: 23 }, false])
		})

		test("a verdict that cannot be read keeps Import closed", async () => {
			const { flow } = passwordFlow()
			vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("digest unavailable"))
			flow.seedPhrase.value = SEED_24
			await flushPromises()
			await tick()
			expect([flow.phraseVerdict.value.kind, flow.isAllowedToImportBySeedPhrase.value]).toEqual(["pending", false])
		})
	})

	test("the backup import's Retry passes through, idle until an import leaves a network to retry", async () => {
		const { flow, stop } = makeFlow()
		expect(flow.canRetryAccountState.value).toBe(false)
		expect(flow.isRetryingAccountState.value).toBe(false)
		expect(flow.unrestoredNetworkNames.value).toEqual([])
		expect(flow.hasOtherRestoreErrors.value).toBe(false)
		await expect(flow.retryAccountState()).resolves.toBeUndefined()
		stop()
	})

	test("dispose() is callable and the composable registers no onUnmounted", () => {
		// Constructed outside a component setup; if it registered onUnmounted Vue
		// would warn. dispose() (name-field shake-timer cleanup) must be safe to
		// call directly from the parent's onBeforeUnmount.
		const { flow, stop } = makeFlow()
		expect(() => flow.dispose()).not.toThrow()
		stop()
	})
})
