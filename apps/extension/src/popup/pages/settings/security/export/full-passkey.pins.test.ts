/**
 * Pins for full.vue's passkey path (ceremony cancel, refusal and failure, own-window handling, the
 * file password a passkey profile's file leaves under) and its password-export edge cases
 * (recovery mode, wrong password), which the main suite's password-path tests don't fix.
 * Scaffolding mirrors full.test.ts (client modules mocked at the import level).
 */
import { SessionEndedError, UserRejectedError } from "@nulo/extension-messaging/errors"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { installChromeStorage } from "../../../../../../tests/helpers/chrome-storage-mock"
import { pressOn } from "../../../../../../tests/helpers/press-key"
import { useAppStore } from "@/stores/app.store"
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
			exportFullBackupKeys: (...args: [unknown, string?, unknown?]) => exportFullBackupKeys(...args),
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

const MATERIAL = {
	masterKey: "mk",
	entropy: "en",
	importedKeysKey: "dk",
	dekReplaced: false,
	unopenedImportedKeys: 0,
	importedKeyRows: [] as unknown[],
	accounts: [] as unknown[],
}
const exportFullBackupKeys = vi.hoisted(() =>
	vi.fn(
		async (_fence: unknown, _password?: string, _credentialData?: unknown): Promise<Record<string, unknown>> => ({
			masterKey: "mk",
			entropy: "en",
			importedKeysKey: "dk",
			dekReplaced: false,
			unopenedImportedKeys: 0,
			importedKeyRows: [],
			accounts: [],
		}),
	),
)
const seal = vi.hoisted(() => vi.fn(async (_plaintext: string, _password: string) => "SEALED"))
vi.mock("@/utils/full-backup-helpers", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	sealFullBackupText: (plaintext: string, password: string) => seal(plaintext, password),
}))
const FENCE = { profileId: "p1", epoch: 0, session: 1, incarnation: "worker-1" }
const captureRunFence = vi.hoisted(() => vi.fn<() => Promise<unknown>>())
const SALT = Buffer.alloc(32, 3).toString("base64")
const getPasskeyUnlockParams = vi.fn(async (_id: string) => ({ credentialId: "cred-1", prfSalt: SALT }))
const assertRunFence = vi.hoisted(() => vi.fn(async (_fence: unknown): Promise<void> => undefined))
/** The service's profile updates, as this page hears them. */
const updates = vi.hoisted(() => {
	const listeners = new Set<(profile: unknown) => void>()
	return {
		listeners,
		emit: (profile: unknown) => {
			for (const listener of listeners) listener(profile)
		},
	}
})
vi.mock("@/utils/core", () => ({
	managers: {
		networkReset: {
			getPendingReset: async () => null,
			onStaleNetworkChanged: { add: () => undefined, remove: () => undefined },
		},
		profile: {
			captureRunFence: () => captureRunFence(),
			assertRunFence: (fence: unknown) => assertRunFence(fence),
			getPasskeyUnlockParams: (id: string) => getPasskeyUnlockParams(id),
			onProfileUpdated: {
				add: (listener: (profile: unknown) => void) => updates.listeners.add(listener),
				remove: (listener: (profile: unknown) => void) => updates.listeners.delete(listener),
			},
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
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.needsOwnWindow() }))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow,
	ownWindowRoute: () => surface.ownRoute(),
}))

const runCeremony = vi.fn<() => Promise<unknown>>()
const CEREMONY_ANSWER = {
	id: Buffer.from("cred-1").toString("base64"),
	prf: Buffer.from(new Uint8Array(32).fill(6)).toString("base64"),
	prfSalt: SALT,
}
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
	installChromeStorage({}, { persist: false })
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
					inheritAttrs: false,
					template:
						"<div><input v-bind='$attrs' :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" /><slot name='bottom' /></div>",
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
		expect(exportFullBackupKeys).not.toHaveBeenCalled()
	})

	it("an unconfirmed prompt resets the agreement and says so, without navigating", async () => {
		runCeremony.mockRejectedValueOnce(new DOMException("not allowed", "NotAllowedError"))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(wrapper.find("[data-testid='agree-continue-btn']").exists()).toBe(true)
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Passkey not confirmed. Try again." })
		expect(routerGo).not.toHaveBeenCalled()
		expect(exportFullBackupKeys).not.toHaveBeenCalled()
	})

	it("ceremony failure toasts the generic passkey copy and navigates back", async () => {
		runCeremony.mockRejectedValueOnce(new Error("authenticator exploded"))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to authenticate by passkey" })
		expect(routerGo).toHaveBeenCalledWith(-1)
		expect(exportFullBackupKeys).not.toHaveBeenCalled()
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

	it("a passkey export asks the service with the row's answer, and names the key loss only when the key was replaced", async () => {
		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
		exportFullBackupKeys.mockResolvedValueOnce({ ...MATERIAL, dekReplaced: true })
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await flushPromises()
		expect(runCeremony).toHaveBeenCalledWith({
			mode: "get",
			credentialId: "cred-1",
			prfSalt: SALT,
			step: "export",
			profileName: "Test Profile",
		})
		expect(exportFullBackupKeys).toHaveBeenCalledWith(FENCE, undefined, CEREMONY_ANSWER)
		await vi.waitFor(() => expect(wrapper.text()).toContain("Imported keys are not in this backup"))
		expect(wrapper.text()).toContain("restore this file (or your recovery phrase) into a new profile, then delete this one")
		expect(wrapper.text()).not.toContain("Local chain data is not in this backup")
		expect(openToast).not.toHaveBeenCalled()

		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
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

	it("a failed export on a password profile flags wrong-password, no toast/navigation", async () => {
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

describe("export/full.vue — imported accounts that will not restore", () => {
	const UNOPENED = "Some imported accounts are not in this backup"
	const LOST = "Imported keys are not in this backup"

	async function passwordExport(material: Record<string, unknown>) {
		exportFullBackupKeys.mockResolvedValueOnce({
			masterKey: "mk",
			entropy: "en",
			importedKeysKey: "dk",
			importedKeyRows: [],
			accounts: [],
			dekReplaced: false,
			unopenedImportedKeys: 0,
			...material,
		})
		const wrapper = mountPage("password")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await wrapper.find("[data-testid='unlock-password-input']").setValue("pass1234")
		await wrapper.find("[data-testid='unlock-submit-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		return wrapper
	}

	async function passkeyExport(material: Record<string, unknown>) {
		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
		exportFullBackupKeys.mockResolvedValueOnce({ ...MATERIAL, ...material })
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		return wrapper
	}

	it.each([
		["password", passwordExport],
		["passkey", passkeyExport],
	] as const)("a %s export names one, three or no unopened imported accounts", async (_kind, run) => {
		const one = await run({ unopenedImportedKeys: 1 })
		expect(one.text()).toContain(UNOPENED)
		expect(one.text()).toContain("1 imported account could not be opened, so it will not be restored.")
		expect(one.text()).toContain("Import their keys again after the restore.")

		const three = await run({ unopenedImportedKeys: 3 })
		expect(three.text()).toContain("3 imported accounts could not be opened, so they will not be restored.")

		expect((await run({ unopenedImportedKeys: 0 })).text()).not.toContain(UNOPENED)
	})

	it.each([
		["password", passwordExport],
		["passkey", passkeyExport],
	] as const)("a %s export whose DEK was replaced shows only that loss", async (_kind, run) => {
		const wrapper = await run({ dekReplaced: true, unopenedImportedKeys: 2 })
		expect(wrapper.text()).toContain(LOST)
		expect(wrapper.text()).not.toContain(UNOPENED)
	})

	it.each([
		["password", passwordExport],
		["passkey", passkeyExport],
	] as const)("a %s export counts an imported account on chain 1337, not one on the local network", async (_kind, run) => {
		const row = (chainId: number) => ({ profileId: "p1", chainId, address: `0x${chainId}`, encryptedSigningKey: "sealed" })
		const account = (chainId: number) => ({ profileId: "p1", chainId, address: `0x${chainId}`, type: 1, name: "Imp" })
		const wrapper = await run({ importedKeyRows: [row(1337), row(0)], accounts: [account(1337), account(0)] })
		expect(wrapper.get("[data-testid='backup-imported-network-banner']").text()).toContain(
			"1 imported account is on a network you added.",
		)
	})

	it("a passkey file carries the account and key rows the count was made over", async () => {
		const rows = [{ profileId: "p1", chainId: 0, address: "0xaa", encryptedSigningKey: "sealed-row" }]
		const accounts = [{ profileId: "p1", chainId: 0, address: "0xaa", name: "Imp" }]
		const wrapper = await passkeyExport({ unopenedImportedKeys: 1, importedKeyRows: rows, accounts })
		await wrapper.get("[data-testid='backup-encrypt-password-input']").setValue("pass1234")
		await wrapper.get("[data-testid='backup-encrypt-password-confirm-input']").setValue("pass1234")
		await wrapper.get("[data-testid='protect-password-btn']").trigger("click")
		await vi.waitFor(() => expect(seal).toHaveBeenCalledTimes(1))
		const { data } = JSON.parse(seal.mock.calls[0][0]) as { data: Record<string, unknown> }
		expect(data["imported-account-keys"]).toEqual(rows)
		expect(data.account).toEqual(accounts)
		expect(clients.account?.backup).not.toHaveBeenCalled()
	})
})

// The file holds the recovery phrase and every key, so a passkey profile's leaves only encrypted,
// under a password typed for it that meets the new-password rule.
describe("export/full.vue — a passkey profile's file leaves only under its own password", () => {
	type Wrapper = ReturnType<typeof mountPage>
	const downloadButton = (wrapper: Wrapper) => wrapper.get("[data-testid='download-backup-btn']")
	const protectButton = (wrapper: Wrapper) => wrapper.get("[data-testid='protect-password-btn']")

	async function reachBackupReady(): Promise<Wrapper> {
		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		return wrapper
	}

	async function typePair(wrapper: Wrapper, password: string, repeated: string) {
		await wrapper.get("[data-testid='backup-encrypt-password-input']").setValue(password)
		await wrapper.get("[data-testid='backup-encrypt-password-confirm-input']").setValue(repeated)
	}

	it("Download stays off before the file is encrypted, by click or by Enter, and asks nothing", async () => {
		const wrapper = await reachBackupReady()
		expect(wrapper.text()).toContain("Choose a password for this file. You'll need it to restore the backup.")
		expect(downloadButton(wrapper).attributes("disabled")).toBeDefined()
		await downloadButton(wrapper).trigger("click")
		pressOn(downloadButton(wrapper).element as HTMLElement, "Enter")
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
		expect(usePopupStore().isOpened("confirm")).toBe(false)
	})

	it.each([
		["", "", "At least 8 characters"],
		["1234567", "1234567", "At least 8 characters"],
		["12345678", "12345679", "Passwords don't match"],
	])("Protect stays off for %j / %j, and the hint says %s", async (password, repeated, hint) => {
		const wrapper = await reachBackupReady()
		await typePair(wrapper, password, repeated)
		expect(wrapper.get("[data-testid='backup-encrypt-password-hint']").text()).toBe(hint)
		expect(protectButton(wrapper).attributes("disabled")).toBeDefined()
		await protectButton(wrapper).trigger("click")
		await flushPromises()
		expect(seal).not.toHaveBeenCalled()
	})

	it("the file leaves sealed under the password typed here, carrying the password body", async () => {
		const wrapper = await reachBackupReady()
		await typePair(wrapper, "pass1234", "pass1234")
		expect(wrapper.get("[data-testid='backup-encrypt-password-hint']").text()).toBe("Strong password")
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
		expect(wrapper.text()).toMatch(/Don't forget your\s+password, as it will be required to restore your backup\./)
		const [plaintext, password] = seal.mock.calls[0]
		expect(password).toBe("pass1234")
		const body = JSON.parse(plaintext) as Record<string, unknown>
		expect(body).toMatchObject({ "master-key": "mk", entropy: "en", "imported-keys-dek": "dk" })
		expect(body).not.toHaveProperty("backup-mac")

		await downloadButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
		expect(downloadFile.mock.calls[0][0]).toMatchObject({ data: "SEALED", filename: expect.stringMatching(/^NuloEncryptedBackup_/) })
		expect(usePopupStore().isOpened("confirm")).toBe(false)
	})

	it("a change of the profile's unlock made elsewhere starts the page over before the file is protected", async () => {
		const wrapper = await reachBackupReady()
		useAppStore().profile = { id: "p1", type: "password", name: "Test Profile" } as never
		await flushPromises()
		expect(wrapper.find("[data-testid='agree-continue-btn']").exists()).toBe(true)
		expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(false)
		pressOn(wrapper.element as HTMLElement, "Enter")
		await flushPromises()
		expect(seal).not.toHaveBeenCalled()
		expect(downloadFile).not.toHaveBeenCalled()
	})

	it("a rename made elsewhere keeps the backup ready, and it still leaves under the password typed here", async () => {
		const wrapper = await reachBackupReady()
		useAppStore().profile = { id: "p1", type: "passkey", name: "Renamed" } as never
		await flushPromises()
		await typePair(wrapper, "pass1234", "pass1234")
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(seal).toHaveBeenCalledTimes(1))
		expect(seal.mock.calls[0][1]).toBe("pass1234")
	})

	it("a switch during the passkey prompt ends that prompt, and the new profile's backup runs", async () => {
		let endPrompt: (err: Error) => void = () => undefined
		runCeremony.mockReturnValueOnce(
			new Promise<never>((_resolve, reject) => {
				endPrompt = reject
			}),
		)
		rejectCeremony.mockImplementationOnce((err: Error) => endPrompt(err))
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(runCeremony).toHaveBeenCalledTimes(1))
		expect(rejectCeremony).not.toHaveBeenCalled()

		useAppStore().profile = { id: "p2", type: "passkey", name: "Other" } as never
		expect(rejectCeremony).toHaveBeenCalledTimes(1)
		await flushPromises()
		// The ended prompt's run is stale: it toasts nothing and leaves the new agreement step alone.
		expect(openToast).not.toHaveBeenCalled()
		expect(routerGo).not.toHaveBeenCalled()
		captureRunFence.mockResolvedValueOnce({ ...FENCE, profileId: "p2", session: 2 })
		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
	})
})

describe("export/full.vue — a password profile's file opens with the password the profile has when it is sealed", () => {
	type Wrapper = ReturnType<typeof mountPage>
	const CHANGED = { kind: "info", label: "Profile password changed in another window." }
	const protectButton = (wrapper: Wrapper) => wrapper.get("[data-testid='protect-password-btn']")

	async function reachProtect(): Promise<Wrapper> {
		const wrapper = mountPage("password")
		await wrapper.get("[data-testid='agree-continue-btn']").trigger("click")
		await wrapper.get("[data-testid='unlock-password-input']").setValue("pass1234")
		await wrapper.get("[data-testid='unlock-submit-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		return wrapper
	}

	async function expectStartedOver(wrapper: Wrapper) {
		await vi.waitFor(() => expect(wrapper.find("[data-testid='agree-continue-btn']").exists()).toBe(true))
		expect(wrapper.find("[data-testid='download-backup-btn']").exists()).toBe(false)
		pressOn(wrapper.element as HTMLElement, "Enter")
		await flushPromises()
		expect(downloadFile).not.toHaveBeenCalled()
	}

	beforeEach(() => {
		assertRunFence.mockReset()
		assertRunFence.mockResolvedValue(undefined)
		updates.listeners.clear()
	})

	/** From here on the service answers that the backup's session no longer stands, as after a
	 *  password change, which reopens it. */
	const sessionReopened = () => assertRunFence.mockRejectedValue(new SessionEndedError())

	it("a password changed elsewhere before Protect starts the page over and says so, whatever name this window last heard", async () => {
		const wrapper = await reachProtect()
		sessionReopened()
		// Renamed elsewhere earlier: this window's store still holds the old name.
		updates.emit({ id: "p1", type: "password", name: "Work" })
		await expectStartedOver(wrapper)
		expect(openToast).toHaveBeenCalledWith(CHANGED)
		expect(seal).not.toHaveBeenCalled()
	})

	it("a password changed elsewhere after Protect starts the page over before Download, and says so", async () => {
		const wrapper = await reachProtect()
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
		sessionReopened()
		updates.emit({ id: "p1", type: "password", name: "Test Profile" })
		await expectStartedOver(wrapper)
		expect(openToast).toHaveBeenCalledWith(CHANGED)
	})

	it("a seal finished after the backup's session ended publishes nothing and starts the page over", async () => {
		const wrapper = await reachProtect()
		const sealed: string[] = []
		seal.mockImplementationOnce(async () => {
			sealed.push("sealed")
			return "SEALED"
		})
		assertRunFence.mockImplementation(async (fence) => {
			// The backup's own check, made before the seal, stands; the seal's, after it, does not.
			if (sealed.length) throw new SessionEndedError()
			expect(fence).toBe(FENCE)
		})
		await protectButton(wrapper).trigger("click")
		await expectStartedOver(wrapper)
		expect(assertRunFence).toHaveBeenLastCalledWith(FENCE)
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to encrypt the backup" })
	})

	it("a Download after the backup's session ended, with no update heard, leaves no file and starts the page over", async () => {
		const wrapper = await reachProtect()
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
		sessionReopened()
		await wrapper.get("[data-testid='download-backup-btn']").trigger("click")
		await expectStartedOver(wrapper)
		expect(assertRunFence).toHaveBeenLastCalledWith(FENCE)
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to download backup" })
	})

	it("a rename made elsewhere keeps the backup ready, even to the name this window shows", async () => {
		const wrapper = await reachProtect()
		updates.emit({ id: "p1", type: "password", name: "Test Profile" })
		await flushPromises()
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
		expect(seal.mock.calls[0][1]).toBe("pass1234")
		await wrapper.get("[data-testid='download-backup-btn']").trigger("click")
		await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
		expect(openToast).not.toHaveBeenCalledWith(CHANGED)
	})

	it("before a backup and after its download, an update leaves the page as it is", async () => {
		const wrapper = mountPage("password")
		await wrapper.get("[data-testid='agree-continue-btn']").trigger("click")
		await wrapper.get("[data-testid='unlock-password-input']").setValue("pass1234")
		sessionReopened()
		updates.emit({ id: "p1", type: "password", name: "Test Profile" })
		await flushPromises()
		expect((wrapper.get("[data-testid='unlock-password-input']").element as HTMLInputElement).value).toBe("pass1234")
		expect(assertRunFence).not.toHaveBeenCalled()

		assertRunFence.mockReset()
		assertRunFence.mockResolvedValue(undefined)
		await wrapper.get("[data-testid='unlock-submit-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
		await wrapper.get("[data-testid='download-backup-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='backup-close-btn']").exists()).toBe(true))
		sessionReopened()
		const checks = assertRunFence.mock.calls.length
		updates.emit({ id: "p1", type: "password", name: "Test Profile" })
		await flushPromises()
		expect(wrapper.find("[data-testid='backup-close-btn']").exists()).toBe(true)
		expect(assertRunFence).toHaveBeenCalledTimes(checks)
		expect(openToast).not.toHaveBeenCalledWith(CHANGED)
	})

	it("a passkey profile's file keeps its own password through a change of its passkey made elsewhere", async () => {
		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
		const wrapper = mountPage("passkey")
		await wrapper.get("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))
		updates.emit({ id: "p1", type: "passkey", name: "Test Profile" })
		await flushPromises()
		await wrapper.get("[data-testid='backup-encrypt-password-input']").setValue("pass1234")
		await wrapper.get("[data-testid='backup-encrypt-password-confirm-input']").setValue("pass1234")
		await protectButton(wrapper).trigger("click")
		await vi.waitFor(() => expect(wrapper.text()).toContain("Backup is successfully encrypted"))
		expect(openToast).not.toHaveBeenCalled()
	})
})

describe("export/full.vue — the encrypt pair", () => {
	it("asks a password manager for a new password on both fields", async () => {
		runCeremony.mockResolvedValueOnce(CEREMONY_ANSWER)
		const wrapper = mountPage("passkey")
		await wrapper.find("[data-testid='agree-continue-btn']").trigger("click")
		await vi.waitFor(() => expect(wrapper.find("[data-testid='protect-password-btn']").exists()).toBe(true))

		for (const id of ["backup-encrypt-password-input", "backup-encrypt-password-confirm-input"]) {
			expect(wrapper.get(`[data-testid='${id}']`).attributes("autocomplete")).toBe("new-password")
		}
	})
})
