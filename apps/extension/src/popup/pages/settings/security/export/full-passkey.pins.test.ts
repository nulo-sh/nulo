/**
 * Pins for full.vue's passkey path (ceremony cancel, refusal and failure,
 * own-window handling, the sealed DEK, the confirmation before a plain
 * download) and its password-export edge cases (recovery mode, wrong
 * password), which the main suite's password-path tests don't fix.
 * Scaffolding mirrors full.test.ts (client modules mocked at the import level).
 */
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { EncryptionKey } from "@nulo/wallet-crypto"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pressOn } from "../../../../../../tests/helpers/press-key"
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import FullExportPage from "./full.vue"

function sliceClient() {
	return { backup: vi.fn(async (): Promise<unknown> => []), disconnect: vi.fn() }
}
const clients: Record<string, ReturnType<typeof sliceClient>> = {}
const named = (n: string) => {
	clients[n] = clients[n] ?? sliceClient()
	return clients[n]
}

vi.mock("@/wallet/services/profile/client", () => ({
	PROFILE_SERVICE_NAME: "profile",
	ProfileServiceClient: vi.fn(function () {
		return named("profile")
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NETWORK_SERVICE_NAME: "network",
	NetworkServiceClient: vi.fn(function () {
		return named("network")
	}),
}))
vi.mock("@/wallet/services/account/client", () => ({
	ACCOUNT_SERVICE_NAME: "account",
	IMPORTED_KEYS_SERVICE_NAME: "imported-account-keys",
	AccountServiceClient: vi.fn(function () {
		return {
			...named("account"),
			backupImportedKeys: vi.fn(async () => []),
			exportFullBackupKeys: (fence: unknown, password: string) => exportFullBackupKeys(fence, password),
		}
	}),
}))
vi.mock("@/wallet/services/transaction/client", () => ({
	TRANSACTION_SERVICE_NAME: "transaction",
	TransactionServiceClient: vi.fn(function () {
		return named("transaction")
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TOKEN_SERVICE_NAME: "token",
	TokenServiceClient: vi.fn(function () {
		return named("token")
	}),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	TOKEN_BALANCE_SERVICE_NAME: "token-balance",
	TokenBalanceServiceClient: vi.fn(function () {
		return named("token-balance")
	}),
}))
vi.mock("@/wallet/services/account-state/client", () => ({
	ACCOUNT_STATE_SERVICE_NAME: "account-state",
	AccountStateServiceClient: vi.fn(function () {
		return named("account-state")
	}),
}))
vi.mock("@/wallet/services/auth-registry/client", () => ({
	AUTH_REGISTRY_SERVICE_NAME: "auth-registry",
	AuthRegistryServiceClient: vi.fn(function () {
		return named("auth-registry")
	}),
}))
vi.mock("@/wallet/services/fpc/client", () => ({
	FPC_SERVICE_NAME: "fpc",
	FpcServiceClient: vi.fn(function () {
		return named("fpc")
	}),
}))
vi.mock("@/wallet/services/contact/client", () => ({
	CONTACT_SERVICE_NAME: "contact",
	ContactServiceClient: vi.fn(function () {
		return named("contact")
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	CONFIG_SERVICE_NAME: "config",
	ConfigServiceClient: vi.fn(function () {
		return named("config")
	}),
}))

const exportFullBackupKeys = vi.hoisted(() => vi.fn<(fence: unknown, password: string) => Promise<unknown>>())
const FENCE = { profileId: "p1", epoch: 0, session: 1, incarnation: "worker-1" }
const captureRunFence = vi.hoisted(() => vi.fn<() => Promise<unknown>>())
const getPasskeyCredentialId = vi.fn(async (_id: string) => "cred-1")
const exportPasskeyBackupMaterial = vi.fn(async (_id: string, _credentialData: unknown) => ({
	credentialId: "cred-1",
	dekSealed: "sealed",
	dekReplaced: false,
}))
vi.mock("@/utils/core", () => ({
	managers: {
		profile: {
			captureRunFence: () => captureRunFence(),
			assertRunFence: async () => undefined,
			getPasskeyCredentialId: (id: string) => getPasskeyCredentialId(id),
			exportPasskeyBackupMaterial: (id: string, credentialData: unknown) => exportPasskeyBackupMaterial(id, credentialData),
		},
	},
}))

type DownloadArgs = { data: string; filename: string; compressionFormat?: string }
const downloadFile = vi.hoisted(() => vi.fn<(opts: DownloadArgs) => Promise<void>>(async () => undefined))
vi.mock("@/utils", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	downloadFile: (opts: DownloadArgs) => downloadFile(opts),
}))

const openToast = vi.fn()
vi.mock("@/composables/toast.js", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useToast: () => ({ openToast }),
}))

const routerGo = vi.fn()
vi.mock("vue-router", () => ({
	useRouter: () => ({ go: routerGo, push: vi.fn() }),
}))

const surface = vi.hoisted(() => ({ needsOwnWindow: vi.fn(() => false), ownRoute: vi.fn((): string | undefined => undefined) }))
const moveToOwnWindow = vi.hoisted(() => vi.fn(async () => true))
vi.mock("@/utils/browser-surface", () => ({ passkeyNeedsOwnWindow: () => surface.needsOwnWindow() }))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow,
	ownWindowRoute: () => surface.ownRoute(),
}))

const runCeremony = vi.fn<() => Promise<unknown>>()
const rejectCeremony = vi.fn()
vi.mock("@/composables/usePasskeyCeremony", () => ({
	usePasskeyCeremony: () => ({
		request: { value: null },
		runCeremony: (...args: unknown[]) => runCeremony(...(args as [])),
		onResolve: vi.fn(),
		onReject: (err: Error) => rejectCeremony(err),
	}),
}))

beforeEach(() => {
	const c = (globalThis as { chrome?: { storage: Record<string, unknown> } }).chrome
	if (c) {
		c.storage.local = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
		c.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
	}
	vi.clearAllMocks()
	captureRunFence.mockReset()
	captureRunFence.mockResolvedValue(FENCE)
	surface.needsOwnWindow.mockReturnValue(false)
	surface.ownRoute.mockReturnValue(undefined)
})

function mountPage(profileType: "passkey" | "password", recoveryMode = false) {
	return mount(FullExportPage, {
		global: {
			plugins: [
				createTestingPinia({
					initialState: {
						app: { profile: { id: "p1", type: profileType, name: "Test Profile", recoveryMode }, network: { id: "net1" } },
					},
					stubActions: false,
				}),
			],
			stubs: {
				CollapsingHeroLayout: { template: "<div><slot /><slot name='bottom' /></div>" },
				SecretUnlockSection: {
					props: ["modelValue", "error"],
					emits: ["update:modelValue", "clearError"],
					template:
						"<input data-testid='unlock-password-input' :data-error='String(!!error)' :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />",
				},
				PasskeyCeremonyDialog: true,
				Banner: { template: "<div><slot name='title' /><slot name='description' /></div>" },
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Spinner: true,
				Input: {
					props: ["modelValue"],
					emits: ["update:modelValue"],
					template: "<input :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />",
				},
				Transition: false,
			},
		},
	})
}

describe("export/full.vue — passkey acquisition + wrong-password pins", () => {
	it("ceremony cancel is SILENT: agreement gate resets, no toast, no navigation", async () => {
		runCeremony.mockRejectedValueOnce(new UserRejectedError("user cancelled"))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		// The agree CTA is back (isAgreed reset) so the user can retry or leave.
		expect(wrapper.find("[data-testid='agree-continue-btn']").exists()).toBe(true)
		expect(openToast).not.toHaveBeenCalled()
		expect(routerGo).not.toHaveBeenCalled()
		expect(exportPasskeyBackupMaterial).not.toHaveBeenCalled()
	})

	it("an unconfirmed prompt resets the agreement and says so, without navigating", async () => {
		runCeremony.mockRejectedValueOnce(new DOMException("not allowed", "NotAllowedError"))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(wrapper.find("[data-testid='agree-continue-btn']").exists()).toBe(true)
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Passkey not confirmed. Try again." })
		expect(routerGo).not.toHaveBeenCalled()
		expect(exportPasskeyBackupMaterial).not.toHaveBeenCalled()
	})

	it("ceremony failure toasts the generic passkey copy and navigates back", async () => {
		runCeremony.mockRejectedValueOnce(new Error("authenticator exploded"))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to authenticate by passkey" })
		expect(routerGo).toHaveBeenCalledWith(-1)
		expect(exportPasskeyBackupMaterial).not.toHaveBeenCalled()
	})

	it("in an own window, a failed passkey step resets to the agreement with its toast instead of going back", async () => {
		surface.ownRoute.mockReturnValue("/popup/settings/security/export/full")
		runCeremony.mockRejectedValueOnce(new Error("authenticator exploded"))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to authenticate by passkey" })
		expect(wrapper.find("[data-testid='agree-continue-btn']").exists()).toBe(true)
		expect(routerGo).not.toHaveBeenCalled()
	})

	it("in Firefox's toolbar panel, a passkey export moves to its own window; a password export stays", async () => {
		surface.needsOwnWindow.mockReturnValue(true)
		mountPage("passkey")
		expect(moveToOwnWindow).toHaveBeenCalledWith("/popup/settings/security/export/full")

		moveToOwnWindow.mockClear()
		mountPage("password")
		expect(moveToOwnWindow).not.toHaveBeenCalled()
	})

	it("a passkey export carries the service's sealed DEK (fresh or stored) into the file and names the loss only when it was replaced", async () => {
		runCeremony.mockResolvedValueOnce({ id: "cred-1" })
		exportPasskeyBackupMaterial.mockResolvedValueOnce({ credentialId: "cred-1", dekSealed: "fresh-sealed", dekReplaced: true })
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(exportPasskeyBackupMaterial).toHaveBeenCalledWith("p1", { id: "cred-1" })
		// The local Banner stub drops attrs, so assert on the copy the loss banner renders once
		// the assembly settles (real assembleFullBackup runs over the stubbed slice clients).
		await vi.waitFor(() => expect(wrapper.text()).toContain("Imported keys are not in this backup"))
		// The passkey sequence: the damaged profile must go before the same credential can restore.
		expect(wrapper.text()).toContain("delete this profile from the wallet, then restore the file with that passkey")
		expect(wrapper.text()).not.toContain("Local chain data is not in this backup")
		expect(openToast).not.toHaveBeenCalled()

		// A healthy slot: no loss banner.
		runCeremony.mockResolvedValueOnce({ id: "cred-1" })
		exportPasskeyBackupMaterial.mockResolvedValueOnce({ credentialId: "cred-1", dekSealed: "stored-sealed", dekReplaced: false })
		const healthy = mountPage("passkey")
		await healthy.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(healthy.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		expect(healthy.text()).not.toContain("are not in this backup")
	})

	it("a password export in recovery mode with an INTACT slot names only the omitted chain state — never a key loss", async () => {
		exportFullBackupKeys.mockResolvedValueOnce({
			masterKey: "mk",
			entropy: "en",
			importedKeysKey: "dk",
			importedKeyRows: [],
			accounts: [],
			dekReplaced: false,
		})
		const wrapper = mountPage("password", true)
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await wrapper.find("[data-testid='unlock-password-input']").setValue("pass1234")
		await wrapper.find("[data-testid='unlock-submit-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Local chain data is not in this backup"))
		expect(wrapper.text()).not.toContain("Imported keys are not in this backup")
	})

	it("a failed discriminated export on a password profile flags wrong-password, no toast/navigation", async () => {
		exportFullBackupKeys.mockRejectedValueOnce(new Error("Invalid profile old password"))
		const wrapper = mountPage("password")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await wrapper.find("[data-testid='unlock-password-input']").setValue("wrong")
		await wrapper.find("[data-testid='unlock-submit-btn']").trigger("click")
		await flushPromises()
		expect(wrapper.find("[data-testid='unlock-password-input']").attributes("data-error")).toBe("true")
		expect(openToast).not.toHaveBeenCalled()
		expect(routerGo).not.toHaveBeenCalled()
	})
})

describe("export/full.vue — a passkey profile's plain download asks first", () => {
	type Wrapper = ReturnType<typeof mountPage>
	const downloadButton = (wrapper: Wrapper) => wrapper.get("[data-testid='download-backup-btn']")

	async function reachBackupReady(): Promise<Wrapper> {
		runCeremony.mockResolvedValueOnce({ id: "cred-1" })
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		return wrapper
	}

	/** What ConfirmPopup does on Cancel: close, without the callback, and clear the request. */
	function cancelConfirm() {
		usePopupStore().close("confirm")
		useCacheStore().confirm = {}
	}

	/** A passkey profile's encryption: the first Protect reveals the password fields, the second seals. */
	async function encrypt(wrapper: Wrapper) {
		await wrapper.find("[data-testid='protect-password-btn']").trigger("click")
		await wrapper.find("[data-testid='backup-encrypt-password-input']").setValue("pass1234")
		await wrapper.find("[data-testid='backup-encrypt-password-confirm-input']").setValue("pass1234")
		await wrapper.find("[data-testid='protect-password-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
	}

	afterEach(() => vi.restoreAllMocks())

	it("Download opens the confirmation that names what the file exposes; Cancel writes nothing, Download anyway writes the plain file", async () => {
		const wrapper = await reachBackupReady()
		expect(downloadButton(wrapper).attributes("disabled")).toBeUndefined()
		expect(wrapper.text()).toContain("Without a password, the file is saved in plain text.")

		await downloadButton(wrapper).trigger("click")
		expect(usePopupStore().isOpened("confirm")).toBe(true)
		expect(useCacheStore().confirm).toMatchObject({
			pre_title: "Not encrypted",
			title: "Download without a password?",
			description:
				"This file will show your accounts, contacts and activity to anyone who opens it. It holds no key that can move funds without your passkey.",
			confirm_color: "red",
			confirm_variant: "cta_destructive",
			confirm_text: "Download anyway",
		})
		cancelConfirm()
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()

		await downloadButton(wrapper).trigger("click")
		;(useCacheStore().confirm as { callback: () => void }).callback()
		await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
		const { data, filename } = downloadFile.mock.calls[0][0]
		expect(filename).toMatch(/^NuloBackup_/)
		expect((JSON.parse(data) as Record<string, unknown>)["master-key"]).toBe("cred-1")
	})

	it("a confirmation answered after the page left writes nothing", async () => {
		const wrapper = await reachBackupReady()
		await downloadButton(wrapper).trigger("click")
		const { callback } = useCacheStore().confirm as { callback: () => void }
		wrapper.unmount()
		callback()
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
	})

	it("a confirmation answered after the page switched to a password profile writes nothing", async () => {
		const wrapper = await reachBackupReady()
		await downloadButton(wrapper).trigger("click")
		const { callback } = useCacheStore().confirm as { callback: () => void }
		useAppStore().profile = { id: "p2", type: "password", name: "Other" } as never
		callback()
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
	})

	it("a confirmation from before a switch writes nothing, even once the new profile's backup is ready", async () => {
		const wrapper = await reachBackupReady()
		await downloadButton(wrapper).trigger("click")
		const { callback } = useCacheStore().confirm as { callback: () => void }
		useAppStore().profile = { id: "p2", type: "passkey", name: "Other" } as never
		await flushPromises()
		captureRunFence.mockResolvedValueOnce({ ...FENCE, profileId: "p2", session: 2 })
		runCeremony.mockResolvedValueOnce({ id: "cred-1" })
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		callback()
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()

		await downloadButton(wrapper).trigger("click")
		;(useCacheStore().confirm as { callback: () => void }).callback()
		await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
	})

	it("a switch during the passkey prompt ends that prompt, and the new profile's backup runs", async () => {
		runCeremony.mockReturnValueOnce(new Promise<never>(() => {}))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(runCeremony).toHaveBeenCalledTimes(1))
		expect(rejectCeremony).not.toHaveBeenCalled()

		useAppStore().profile = { id: "p2", type: "passkey", name: "Other" } as never
		expect(rejectCeremony).toHaveBeenCalledTimes(1)
		await flushPromises()
		captureRunFence.mockResolvedValueOnce({ ...FENCE, profileId: "p2", session: 2 })
		runCeremony.mockResolvedValueOnce({ id: "cred-1" })
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
	})

	it("a confirmation answered after the file was encrypted writes nothing", async () => {
		vi.spyOn(EncryptionKey, "getPasshash").mockResolvedValue(new Uint8Array(32) as never)
		vi.spyOn(EncryptionKey, "fromPasshash").mockResolvedValue({ encrypt: async () => new Uint8Array(29) } as never)
		const wrapper = await reachBackupReady()
		await downloadButton(wrapper).trigger("click")
		const { callback } = useCacheStore().confirm as { callback: () => void }
		await encrypt(wrapper)
		callback()
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
	})

	it("Enter on Download asks instead of downloading, and a repeat Enter does neither", async () => {
		const wrapper = await reachBackupReady()
		pressOn(downloadButton(wrapper).element as HTMLElement, "Enter", { repeat: true })
		await flushPromises()
		expect(usePopupStore().isOpened("confirm")).toBe(false)

		pressOn(downloadButton(wrapper).element as HTMLElement, "Enter")
		await flushPromises()
		expect(usePopupStore().isOpened("confirm")).toBe(true)
		expect(downloadFile).not.toHaveBeenCalled()
	})

	it("once the file is encrypted, Download saves it without asking", async () => {
		vi.spyOn(EncryptionKey, "getPasshash").mockResolvedValue(new Uint8Array(32) as never)
		vi.spyOn(EncryptionKey, "fromPasshash").mockResolvedValue({ encrypt: async () => new Uint8Array(29) } as never)
		const wrapper = await reachBackupReady()
		await encrypt(wrapper)

		await downloadButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
		expect(downloadFile.mock.calls[0][0].filename).toMatch(/^NuloEncryptedBackup_/)
		expect(usePopupStore().isOpened("confirm")).toBe(false)
	})
})
