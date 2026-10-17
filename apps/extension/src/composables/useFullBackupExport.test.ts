import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { type Deferred, deferred } from "@nulo/wallet-core/utils"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises } from "@vue/test-utils"
import { setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAppStore } from "@/stores/app.store"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import { type UseFullBackupExportOptions, useFullBackupExport } from "./useFullBackupExport"

/**
 * The supersede table: a run discarded at any await of a create, encrypt or download publishes
 * nothing, toasts nothing, releases no latch, opens no ceremony and leaves no client connected.
 * The assembler and the passkey MAC are real; the clients, the profile manager, the seal and the
 * file write are fakes the table holds at each await.
 */

const h = vi.hoisted(() => {
	const state = {
		built: [] as Array<{ kind: string; disconnect: ReturnType<typeof vi.fn> }>,
		onBuild: undefined as (() => void) | undefined,
		contactSlice: undefined as (() => Promise<unknown>) | undefined,
		exportFullBackupKeys: vi.fn<(fence: unknown, password: string) => Promise<unknown>>(),
		exportPasskeyBackupKeys: vi.fn<(fence: unknown, credentialData: unknown) => Promise<unknown>>(),
	}
	function make(kind: string, extra: Record<string, unknown> = {}) {
		const hook = state.onBuild
		state.onBuild = undefined
		hook?.()
		const client = {
			backup: vi.fn(async () => (kind === "contact" && state.contactSlice ? state.contactSlice() : [])),
			disconnect: vi.fn(),
			...extra,
		}
		state.built.push({ kind, disconnect: client.disconnect })
		return client
	}
	return { state, make }
})

// Vitest requires `function` expressions for mocks instantiated with `new`.
vi.mock("@/wallet/services/profile/client", () => ({
	PROFILE_SERVICE_NAME: "profile",
	ProfileServiceClient: vi.fn(function () {
		return h.make("profile")
	}),
}))
vi.mock("@/wallet/services/account/client", () => ({
	ACCOUNT_SERVICE_NAME: "account",
	IMPORTED_KEYS_SERVICE_NAME: "imported-account-keys",
	AccountServiceClient: vi.fn(function () {
		return h.make("account", {
			backupImportedKeys: vi.fn(async () => []),
			exportFullBackupKeys: (fence: unknown, password: string) => h.state.exportFullBackupKeys(fence, password),
			exportPasskeyBackupKeys: (fence: unknown, credentialData: unknown) => h.state.exportPasskeyBackupKeys(fence, credentialData),
		})
	}),
}))
vi.mock("@/wallet/services/transaction/client", () => ({
	TRANSACTION_SERVICE_NAME: "transaction",
	TransactionServiceClient: vi.fn(function () {
		return h.make("transaction")
	}),
}))
vi.mock("@/wallet/services/token/client", () => ({
	TOKEN_SERVICE_NAME: "token",
	TokenServiceClient: vi.fn(function () {
		return h.make("token")
	}),
}))
vi.mock("@/wallet/services/token-balance/client", () => ({
	TOKEN_BALANCE_SERVICE_NAME: "token-balance",
	TokenBalanceServiceClient: vi.fn(function () {
		return h.make("token-balance")
	}),
}))
vi.mock("@/wallet/services/account-state/client", () => ({
	ACCOUNT_STATE_SERVICE_NAME: "account-state",
	AccountStateServiceClient: vi.fn(function () {
		return h.make("account-state")
	}),
}))
vi.mock("@/wallet/services/auth-registry/client", () => ({
	AUTH_REGISTRY_SERVICE_NAME: "auth-registry",
	AuthRegistryServiceClient: vi.fn(function () {
		return h.make("auth-registry")
	}),
}))
vi.mock("@/wallet/services/contact/client", () => ({
	CONTACT_SERVICE_NAME: "contact",
	ContactServiceClient: vi.fn(function () {
		return h.make("contact")
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	CONFIG_SERVICE_NAME: "config",
	ConfigServiceClient: vi.fn(function () {
		return h.make("config")
	}),
}))

const m = vi.hoisted(() => ({
	captureRunFence: vi.fn<() => Promise<unknown>>(),
	assertRunFence: vi.fn<(fence: unknown) => Promise<void>>(),
	getPasskeyCredentialId: vi.fn<(id: string) => Promise<string>>(),
	seal: vi.fn<(plaintext: string | null, password: string) => Promise<string>>(),
	downloadFile: vi.fn<(opts: { data: string; filename: string }) => Promise<void>>(),
	openToast: vi.fn(),
	requestConfirm: vi.fn<(request: { callback: () => void }) => void>(),
}))
vi.mock("@/utils/core", () => ({
	managers: {
		profile: {
			captureRunFence: () => m.captureRunFence(),
			assertRunFence: (fence: unknown) => m.assertRunFence(fence),
			getPasskeyCredentialId: (id: string) => m.getPasskeyCredentialId(id),
		},
	},
}))
vi.mock("@/utils/full-backup-helpers", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	sealFullBackupText: (plaintext: string | null, password: string) => m.seal(plaintext, password),
}))
vi.mock("@/utils", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	downloadFile: (opts: { data: string; filename: string }) => m.downloadFile(opts),
}))
vi.mock("@/composables/toast.js", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useToast: () => ({ openToast: m.openToast }),
}))
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ requestConfirm: m.requestConfirm }) }))

type ProfileType = "password" | "passkey"
type Api = ReturnType<typeof useFullBackupExport>

const FENCE = { profileId: "p1", epoch: 0, session: 1, incarnation: "worker-1" }
const material = (masterKey = "mk") => ({
	masterKey,
	entropy: "ent",
	importedKeysKey: "ik",
	dekReplaced: false,
	unopenedImportedKeys: 2,
	accounts: [],
	importedKeyRows: [],
})
const PASSKEY_KEYS = {
	credentialId: "cred-1",
	dekSealed: "sealed",
	dekReplaced: false,
	unopenedImportedKeys: 2,
	accounts: [],
	importedKeyRows: [],
}
/** A credential with its PRF output, so the real passkey MAC runs. */
const CEREMONY_ANSWER = {
	id: Buffer.from("cred-1").toString("base64"),
	prf: Buffer.from(new Uint8Array(32).fill(6)).toString("base64"),
} as PasskeyCredentialData

/** Values no backup run writes (it writes "" or "finished", releases the latch, sets the warnings
 *  from the material above, raises the wrong-password flag, drops the agreement), so any write a
 *  superseded run makes shows against them. */
const SENTINELS = {
	isAgreed: true,
	backupStatus: "encrypting",
	isBusy: true,
	isDownloading: true,
	showRecommendation: false,
	isWrongPassword: false,
	isPasswordMismatch: false,
	dekReplaced: true,
	chainStateOmitted: false,
	unopenedImportedKeys: 0,
	password: "sentinel",
	repeatedPassword: "sentinel",
} as const
type StateKey = keyof typeof SENTINELS

function plantSentinels(api: Api) {
	for (const key of Object.keys(SENTINELS) as StateKey[]) (api[key] as { value: unknown }).value = SENTINELS[key]
}
function readState(api: Api) {
	return Object.fromEntries((Object.keys(SENTINELS) as StateKey[]).map((key) => [key, api[key].value]))
}

function setup(type: ProfileType) {
	setActivePinia(
		createTestingPinia({
			initialState: {
				app: { profile: { id: "p1", type, name: "Test Profile", recoveryMode: true }, network: { id: "net1", chainId: 7 } },
			},
			stubActions: false,
		}),
	)
	const opts = {
		runCeremony: vi.fn<UseFullBackupExportOptions["runCeremony"]>(async () => CEREMONY_ANSWER),
		leaveAfterPasskeyFailure: vi.fn(),
	}
	const api = useFullBackupExport(opts)
	api.isAgreed.value = true
	api.password.value = "pw"
	return { api, opts }
}

/** What a later reader of the page could still get out of the run: the plain file, the sealed
 *  file, and the text the next encrypt would seal. */
async function probeArtifacts(api: Api) {
	const store = useAppStore()
	// Only a passkey profile's plain file may leave, so the probe reads it as one.
	store.profile = { ...store.profile, type: "passkey" } as ProfileInfo
	api.isBusy.value = false
	api.isDownloading.value = false
	api.password.value = "probe"
	api.repeatedPassword.value = "probe"
	m.downloadFile.mockClear()
	m.seal.mockClear()
	await api.downloadBackup(false)
	await api.downloadBackup(true)
	await api.handleEncrypt()
	return { downloads: m.downloadFile.mock.calls.length, sealedFrom: m.seal.mock.calls.map(([plaintext]) => plaintext) }
}

const exportCalls = () => h.state.exportFullBackupKeys.mock.calls.length + h.state.exportPasskeyBackupKeys.mock.calls.length

/** Counts at the moment of the supersede, so the assertions see only what the dropped run did. */
function snapshot(opts: ReturnType<typeof setup>["opts"]) {
	return {
		toasts: m.openToast.mock.calls.length,
		ceremonies: opts.runCeremony.mock.calls.length,
		exports: exportCalls(),
		built: h.state.built.length,
	}
}

async function expectNothingPublished(api: Api, opts: ReturnType<typeof setup>["opts"], at: ReturnType<typeof snapshot>) {
	expect(readState(api)).toEqual(SENTINELS)
	expect(m.openToast).toHaveBeenCalledTimes(at.toasts)
	expect(opts.runCeremony).toHaveBeenCalledTimes(at.ceremonies)
	expect(opts.leaveAfterPasskeyFailure).not.toHaveBeenCalled()
	expect(h.state.built).toHaveLength(at.built)
	for (const { kind, disconnect } of h.state.built) expect(disconnect, kind).toHaveBeenCalled()
	expect(await probeArtifacts(api)).toEqual({ downloads: 0, sealedFrom: [null] })
}

beforeEach(() => {
	const c = (globalThis as { chrome?: { storage: Record<string, unknown> } }).chrome
	if (c) {
		c.storage.local = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
		c.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
	}
	vi.clearAllMocks()
	h.state.built.length = 0
	h.state.onBuild = undefined
	h.state.contactSlice = undefined
	h.state.exportFullBackupKeys.mockReset().mockImplementation(async () => material())
	h.state.exportPasskeyBackupKeys.mockReset().mockImplementation(async () => PASSKEY_KEYS)
	m.captureRunFence.mockReset().mockImplementation(async () => FENCE)
	m.assertRunFence.mockReset().mockImplementation(async () => undefined)
	m.getPasskeyCredentialId.mockReset().mockImplementation(async () => "cred-1")
	m.seal.mockReset().mockImplementation(async () => "SEALED")
	m.downloadFile.mockReset().mockImplementation(async () => undefined)
})

type Hold = {
	at: string
	types: ProfileType[]
	/** Parks the run at this await until `d` settles; `reached` fires when the run gets there. */
	hold(d: Deferred<unknown>, reached: () => void, type: ProfileType, opts: ReturnType<typeof setup>["opts"]): void
	value(type: ProfileType): unknown
}

const parkAt =
	<T>(d: Deferred<unknown>, reached: () => void) =>
	() => {
		reached()
		return d.promise as Promise<T>
	}

const HOLDS: Hold[] = [
	{
		at: "captureRunFence",
		types: ["password", "passkey"],
		hold: (d, reached) => m.captureRunFence.mockImplementationOnce(parkAt(d, reached)),
		value: () => FENCE,
	},
	{
		at: "getPasskeyCredentialId",
		types: ["passkey"],
		hold: (d, reached) => m.getPasskeyCredentialId.mockImplementationOnce(parkAt(d, reached)),
		value: () => "cred-1",
	},
	{
		at: "runCeremony",
		types: ["passkey"],
		hold: (d, reached, _type, opts) => opts.runCeremony.mockImplementationOnce(parkAt(d, reached)),
		value: () => CEREMONY_ANSWER,
	},
	{
		at: "the key export",
		types: ["password", "passkey"],
		hold: (d, reached, type) =>
			(type === "passkey" ? h.state.exportPasskeyBackupKeys : h.state.exportFullBackupKeys).mockImplementationOnce(
				parkAt(d, reached),
			),
		value: (type) => (type === "passkey" ? PASSKEY_KEYS : material()),
	},
	{
		at: "a slice read",
		types: ["password", "passkey"],
		hold: (d, reached) => {
			h.state.contactSlice = parkAt(d, reached)
		},
		value: () => [],
	},
	{
		at: "assertRunFence",
		types: ["password", "passkey"],
		hold: (d, reached) => m.assertRunFence.mockImplementationOnce(parkAt(d, reached)),
		value: () => undefined,
	},
]

const CREATE_ROWS = (["password", "passkey"] as const).flatMap((type) =>
	HOLDS.filter((row) => row.types.includes(type)).flatMap((row) =>
		(["resolves", "rejects"] as const).map((settles) => ({ type, row, settles })),
	),
)

describe("useFullBackupExport — a create superseded at an await", () => {
	it.each(CREATE_ROWS)("$type profile, at $row.at, which then $settles", async ({ type, row, settles }) => {
		const { api, opts } = setup(type)
		const held = deferred<unknown>()
		let parked = false
		row.hold(held, () => (parked = true), type, opts)
		const run = api.handleBackup()
		// The assembler hashes through WebCrypto, which settles outside the microtask queue.
		await vi.waitFor(() => expect(parked).toBe(true))

		api.reset()
		plantSentinels(api)
		const at = snapshot(opts)
		if (settles === "resolves") held.resolve(row.value(type))
		else held.reject(new Error("refused"))
		await run
		await flushPromises()

		expect(exportCalls()).toBe(at.exports)
		await expectNothingPublished(api, opts, at)
	})

	// The open-run hop: a discard after the run's last check before its key export still reaches the
	// export once, as today; the service's run fence or the next check drops the result.
	it.each(["password", "passkey"] as const)(
		"%s profile, while the run opens its clients: one export, nothing published",
		async (type) => {
			const { api, opts } = setup(type)
			let at: ReturnType<typeof snapshot> | undefined
			h.state.onBuild = () => {
				api.reset()
				plantSentinels(api)
				at = snapshot(opts)
			}
			await api.handleBackup()
			await flushPromises()

			expect(exportCalls()).toBe(1)
			expect(h.state.built).toHaveLength(10)
			await expectNothingPublished(api, opts, { ...(at as ReturnType<typeof snapshot>), built: 10 })
		},
	)

	it("a dropped run leaves its successor's latch and clients alone", async () => {
		const { api } = setup("password")
		const first = deferred<unknown>()
		h.state.exportFullBackupKeys.mockReturnValueOnce(first.promise)
		const firstRun = api.handleBackup()
		await flushPromises()
		api.reset()

		const second = deferred<unknown>()
		h.state.exportFullBackupKeys.mockReturnValueOnce(second.promise)
		api.password.value = "pw"
		const secondRun = api.handleBackup()
		await flushPromises()
		const firstClients = h.state.built.slice(0, 10)
		const secondClients = h.state.built.slice(10)
		expect(secondClients).toHaveLength(10)

		first.resolve(material("mk-first"))
		await firstRun
		await flushPromises()
		expect(api.isBusy.value).toBe(true)
		expect(api.backupStatus.value).toBe("progress")
		for (const { disconnect } of firstClients) expect(disconnect).toHaveBeenCalled()
		for (const { disconnect } of secondClients) expect(disconnect).not.toHaveBeenCalled()

		second.resolve(material("mk-second"))
		await secondRun
		expect(api.backupStatus.value).toBe("finished")
		expect(api.isBusy.value).toBe(false)
		for (const { disconnect } of secondClients) expect(disconnect).toHaveBeenCalledOnce()
		await api.handleEncrypt()
		expect(JSON.parse(m.seal.mock.calls[0][0] as string)["master-key"]).toBe("mk-second")
	})

	it("dispose ends the run and every later action is a no-op", async () => {
		const { api, opts } = setup("passkey")
		const held = deferred<unknown>()
		h.state.exportPasskeyBackupKeys.mockReturnValueOnce(held.promise)
		const run = api.handleBackup()
		await flushPromises()

		api.dispose()
		for (const { disconnect } of h.state.built) expect(disconnect).toHaveBeenCalled()
		held.resolve(PASSKEY_KEYS)
		await run
		await flushPromises()
		expect(api.backupStatus.value).toBe("progress")
		expect(api.isBusy.value).toBe(true)
		expect(m.openToast).not.toHaveBeenCalled()
		expect(opts.leaveAfterPasskeyFailure).not.toHaveBeenCalled()

		api.isBusy.value = false
		api.backupStatus.value = "finished"
		await api.handleBackup()
		await api.handleEncrypt()
		await api.downloadBackup(false)
		api.handleDownloadClick()
		expect(m.captureRunFence).toHaveBeenCalledOnce()
		expect(m.seal).not.toHaveBeenCalled()
		expect(m.downloadFile).not.toHaveBeenCalled()
		expect(m.requestConfirm).not.toHaveBeenCalled()
	})
})

describe("useFullBackupExport — encrypt and download superseded", () => {
	it.each(["resolves", "rejects"] as const)("an encrypt dropped while it seals, which then %s", async (settles) => {
		const { api, opts } = setup("password")
		await api.handleBackup()
		const held = deferred<string>()
		m.seal.mockReturnValueOnce(held.promise)
		const encrypt = api.handleEncrypt()
		await flushPromises()

		api.reset()
		plantSentinels(api)
		const at = snapshot(opts)
		if (settles === "resolves") held.resolve("SEALED-LATE")
		else held.reject(new Error("refused"))
		await encrypt
		await expectNothingPublished(api, opts, at)
	})

	it.each(["resolves", "rejects"] as const)("a requested download lands, and only its toast is dropped, when it %s", async (settles) => {
		const { api, opts } = setup("password")
		await api.handleBackup()
		await api.handleEncrypt()
		const held = deferred<void>()
		m.downloadFile.mockReturnValueOnce(held.promise)
		const download = api.downloadBackup(true)
		await flushPromises()

		api.reset()
		plantSentinels(api)
		const at = snapshot(opts)
		if (settles === "resolves") held.resolve()
		else held.reject(new Error("refused"))
		await download
		expect(m.downloadFile).toHaveBeenCalledOnce()
		expect(m.downloadFile.mock.calls[0][0].data).toBe("SEALED")
		await expectNothingPublished(api, opts, at)
	})

	it("a plain-download confirm answered after the run ended downloads nothing, even over a newer run", async () => {
		const { api } = setup("passkey")
		await api.handleBackup()
		api.handleDownloadClick()
		const { callback } = m.requestConfirm.mock.calls[0][0]

		api.reset()
		await api.handleBackup()
		expect(api.backupStatus.value).toBe("finished")
		callback()
		await flushPromises()
		expect(m.downloadFile).not.toHaveBeenCalled()
	})
})

describe("useFullBackupExport — a current run", () => {
	it("password profile: the file leaves only sealed, and the run's clients close", async () => {
		const { api } = setup("password")
		await api.handleBackup()
		expect(readState(api)).toMatchObject({
			backupStatus: "finished",
			isBusy: false,
			showRecommendation: true,
			chainStateOmitted: true,
			unopenedImportedKeys: 2,
		})
		for (const { kind, disconnect } of h.state.built) expect(disconnect, kind).toHaveBeenCalledOnce()
		expect(m.assertRunFence).toHaveBeenCalledWith(FENCE)

		await api.downloadBackup(false)
		expect(m.downloadFile).not.toHaveBeenCalled()
		await api.handleEncrypt()
		expect(m.seal).toHaveBeenCalledWith(expect.stringContaining('"master-key":"mk"'), "pw")
		expect(api.backupStatus.value).toBe("encrypted")
		await api.downloadBackup(true)
		expect(m.downloadFile).toHaveBeenCalledWith(
			expect.objectContaining({ data: "SEALED", filename: expect.stringMatching(/^NuloEncryptedBackup_.+\.txt$/) }),
		)
	})

	it("passkey profile: one ceremony, and the plain file after the confirm", async () => {
		const { api, opts } = setup("passkey")
		await api.handleBackup()
		expect(opts.runCeremony).toHaveBeenCalledWith({ mode: "get", credentialId: "cred-1", step: "export", profileName: "Test Profile" })
		expect(api.backupStatus.value).toBe("finished")

		api.handleDownloadClick()
		m.requestConfirm.mock.calls[0][0].callback()
		await flushPromises()
		const file = JSON.parse(m.downloadFile.mock.calls[0][0].data)
		expect(file["master-key"]).toBe("cred-1")
		expect(file.entropy).toBeUndefined()
	})

	// A new await is a new place a run can be superseded: add its row to the table, then this count.
	it("every await in the composable has a row above", () => {
		const source = readFileSync(resolve(__dirname, "useFullBackupExport.ts"), "utf8")
		expect(source.match(/\bawait\b/g)).toHaveLength(12)
	})
})
