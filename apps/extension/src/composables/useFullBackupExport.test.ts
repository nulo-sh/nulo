import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { type Deferred, deferred } from "@nulo/wallet-core/utils"
import { createTestingPinia } from "@pinia/testing"
import { flushPromises } from "@vue/test-utils"
import { setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { installChromeStorage } from "../../tests/helpers/chrome-storage-mock"
import { type UseFullBackupExportOptions, useFullBackupExport } from "./useFullBackupExport"

/**
 * The supersede table: a run discarded at any await of a create, encrypt or download publishes
 * nothing, toasts nothing, releases no latch, opens no ceremony and leaves no client connected.
 * The assembler is real; the clients, the profile manager, the seal and the file write are fakes
 * the table holds at each await.
 */

const h = vi.hoisted(() => {
	const state = {
		built: [] as Array<{ kind: string; disconnect: ReturnType<typeof vi.fn> }>,
		contactSlice: undefined as (() => Promise<unknown>) | undefined,
		exportFullBackupKeys: vi.fn<(fence: unknown, password?: string, credentialData?: unknown) => Promise<unknown>>(),
	}
	function make(kind: string, extra: Record<string, unknown> = {}) {
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
			exportFullBackupKeys: (...args: [unknown, string?, unknown?]) => h.state.exportFullBackupKeys(...args),
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
	getPasskeyUnlockParams: vi.fn<(id: string) => Promise<{ credentialId: string; prfSalt: string }>>(),
	seal: vi.fn<(plaintext: string | null, password: string) => Promise<string>>(),
	downloadFile: vi.fn<(opts: { data: string; filename: string }) => Promise<void>>(),
	openToast: vi.fn(),
}))
vi.mock("@/utils/core", () => ({
	managers: {
		profile: {
			captureRunFence: () => m.captureRunFence(),
			assertRunFence: (fence: unknown) => m.assertRunFence(fence),
			getPasskeyUnlockParams: (id: string) => m.getPasskeyUnlockParams(id),
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

type ProfileType = "password" | "passkey"
type Api = ReturnType<typeof useFullBackupExport>

const FENCE = { profileId: "p1", epoch: 0, session: 1, incarnation: "worker-1" }
const material = () => ({
	masterKey: "mk",
	entropy: "ent",
	importedKeysKey: "ik",
	dekReplaced: false,
	unopenedImportedKeys: 2,
	accounts: [],
	importedKeyRows: [],
})
const SALT = Buffer.alloc(32, 3).toString("base64")
const CEREMONY_ANSWER = {
	id: Buffer.from("cred-1").toString("base64"),
	prf: Buffer.from(new Uint8Array(32).fill(6)).toString("base64"),
	prfSalt: SALT,
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
	dekReplaced: true,
	chainStateOmitted: false,
	unopenedImportedKeys: 0,
	importsOnAddedNetworks: { accounts: 1, networks: 1 },
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

/** What a later reader of the page could still get out of the run: the sealed file, and the text
 *  the next encrypt would seal. */
async function probeArtifacts(api: Api) {
	api.isBusy.value = false
	api.isDownloading.value = false
	api.backupStatus.value = "encrypted"
	api.password.value = "probe-pass"
	api.repeatedPassword.value = "probe-pass"
	m.downloadFile.mockClear()
	m.seal.mockClear()
	await api.downloadBackup()
	await api.handleEncrypt()
	return { downloads: m.downloadFile.mock.calls.length, sealedFrom: m.seal.mock.calls.map(([plaintext]) => plaintext) }
}

const exportCalls = () => h.state.exportFullBackupKeys.mock.calls.length

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
	installChromeStorage({}, { persist: false })
	vi.clearAllMocks()
	h.state.built.length = 0
	h.state.contactSlice = undefined
	h.state.exportFullBackupKeys.mockReset().mockImplementation(async () => material())
	m.captureRunFence.mockReset().mockImplementation(async () => FENCE)
	m.assertRunFence.mockReset().mockImplementation(async () => undefined)
	m.getPasskeyUnlockParams.mockReset().mockImplementation(async () => ({ credentialId: "cred-1", prfSalt: SALT }))
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
		at: "getPasskeyUnlockParams",
		types: ["passkey"],
		hold: (d, reached) => m.getPasskeyUnlockParams.mockImplementationOnce(parkAt(d, reached)),
		value: () => ({ credentialId: "cred-1", prfSalt: SALT }),
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
		hold: (d, reached) => h.state.exportFullBackupKeys.mockImplementationOnce(parkAt(d, reached)),
		value: () => material(),
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

	// openRun reads the fence's `profileId` after its last check, so a discard there lands in the hop
	// between openRun's return and the run's next step.
	it("a discard in the open-run hop stops the run before it builds clients or requests its keys", async () => {
		const { api, opts } = setup("password")
		let at: ReturnType<typeof snapshot> | undefined
		m.captureRunFence.mockImplementationOnce(async () => ({
			...FENCE,
			get profileId() {
				if (!at) {
					api.reset()
					plantSentinels(api)
					at = snapshot(opts)
				}
				return FENCE.profileId
			},
		}))
		await api.handleBackup()
		await flushPromises()

		expect(at).toBeDefined()
		expect(exportCalls()).toBe(0)
		expect(h.state.built).toHaveLength(0)
		await expectNothingPublished(api, opts, at as ReturnType<typeof snapshot>)
	})

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

		first.resolve(material())
		await firstRun
		await flushPromises()
		expect(api.isBusy.value).toBe(true)
		expect(api.backupStatus.value).toBe("progress")
		for (const { disconnect } of firstClients) expect(disconnect).toHaveBeenCalled()
		for (const { disconnect } of secondClients) expect(disconnect).not.toHaveBeenCalled()

		// The successor is still the active run, so the scrub closes its clients.
		api.reset()
		for (const { disconnect } of secondClients) expect(disconnect).toHaveBeenCalled()
		second.resolve(material())
		await secondRun
	})

	it("dispose ends the run and every later action is a no-op", async () => {
		const { api, opts } = setup("passkey")
		const held = deferred<unknown>()
		h.state.exportFullBackupKeys.mockReturnValueOnce(held.promise)
		const run = api.handleBackup()
		await flushPromises()

		api.dispose()
		for (const { disconnect } of h.state.built) expect(disconnect).toHaveBeenCalled()
		held.resolve(material())
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
		await api.downloadBackup()
		expect(m.captureRunFence).toHaveBeenCalledOnce()
		expect(m.seal).not.toHaveBeenCalled()
		expect(m.downloadFile).not.toHaveBeenCalled()
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

	it.each(["resolves", "rejects"] as const)("an encrypt dropped while the seal's session check runs, which then %s", async (settles) => {
		const { api, opts } = setup("password")
		await api.handleBackup()
		const held = deferred<void>()
		m.assertRunFence.mockReturnValueOnce(held.promise)
		const encrypt = api.handleEncrypt()
		await vi.waitFor(() => expect(m.assertRunFence).toHaveBeenCalledTimes(2))
		expect(m.seal).toHaveBeenCalledOnce()

		api.reset()
		plantSentinels(api)
		const at = snapshot(opts)
		if (settles === "resolves") held.resolve()
		else held.reject(new Error("Session ended"))
		await encrypt
		await expectNothingPublished(api, opts, at)
	})

	it.each(["resolves", "rejects"] as const)("a download dropped while its session check runs, which then %s", async (settles) => {
		const { api, opts } = setup("password")
		await api.handleBackup()
		await api.handleEncrypt()
		const held = deferred<void>()
		m.assertRunFence.mockReturnValueOnce(held.promise)
		const download = api.downloadBackup()
		await vi.waitFor(() => expect(m.assertRunFence).toHaveBeenCalledTimes(3))

		api.reset()
		plantSentinels(api)
		const at = snapshot(opts)
		if (settles === "resolves") held.resolve()
		else held.reject(new Error("Session ended"))
		await download
		expect(m.downloadFile).not.toHaveBeenCalled()
		await expectNothingPublished(api, opts, at)
	})

	it.each(["resolves", "rejects"] as const)("an update's session check dropped by a reset, which then %s", async (settles) => {
		const { api, opts } = setup("password")
		await api.handleBackup()
		const held = deferred<void>()
		m.assertRunFence.mockReturnValueOnce(held.promise)
		const follow = api.followProfileUpdate()
		await vi.waitFor(() => expect(m.assertRunFence).toHaveBeenCalledTimes(2))

		api.reset()
		plantSentinels(api)
		const at = snapshot(opts)
		if (settles === "resolves") held.resolve()
		else held.reject(new Error("Session ended"))
		await follow
		await expectNothingPublished(api, opts, at)
	})

	it.each(["resolves", "rejects"] as const)("a requested download lands, and only its toast is dropped, when it %s", async (settles) => {
		const { api, opts } = setup("password")
		await api.handleBackup()
		await api.handleEncrypt()
		const held = deferred<void>()
		m.downloadFile.mockReturnValueOnce(held.promise)
		const download = api.downloadBackup()
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
		expect(h.state.exportFullBackupKeys).toHaveBeenCalledExactlyOnceWith(FENCE, "pw")

		await api.downloadBackup()
		expect(m.downloadFile).not.toHaveBeenCalled()
		await api.handleEncrypt()
		expect(m.seal).toHaveBeenCalledWith(expect.stringContaining('"master-key":"mk"'), "pw")
		expect(api.backupStatus.value).toBe("encrypted")
		await api.downloadBackup()
		expect(m.downloadFile).toHaveBeenCalledWith(
			expect.objectContaining({ data: "SEALED", filename: expect.stringMatching(/^NuloEncryptedBackup_.+\.txt$/) }),
		)
	})

	// The file holds the recovery phrase, so a passkey profile's leaves only under a password typed
	// for it, which meets the new-password rule.
	it("passkey profile: one prompt at the row's input, the password body, and the file leaves only under a valid file password", async () => {
		const { api, opts } = setup("passkey")
		await api.handleBackup()
		expect(opts.runCeremony).toHaveBeenCalledExactlyOnceWith({
			mode: "get",
			credentialId: "cred-1",
			prfSalt: SALT,
			step: "export",
			profileName: "Test Profile",
		})
		expect(h.state.exportFullBackupKeys).toHaveBeenCalledExactlyOnceWith(FENCE, undefined, CEREMONY_ANSWER)
		expect(api.backupStatus.value).toBe("finished")
		await api.downloadBackup()
		expect(m.downloadFile).not.toHaveBeenCalled()

		for (const [password, repeated] of [
			["", ""],
			["1234567", "1234567"],
			["12345678", "12345679"],
		]) {
			api.password.value = password
			api.repeatedPassword.value = repeated
			expect(api.canEncrypt.value).toBe(false)
			await api.handleEncrypt()
		}
		expect(m.seal).not.toHaveBeenCalled()

		api.password.value = "12345678"
		api.repeatedPassword.value = "12345678"
		expect(api.canEncrypt.value).toBe(true)
		await api.handleEncrypt()
		const [plaintext, filePassword] = m.seal.mock.calls[0]
		expect(filePassword).toBe("12345678")
		const body = JSON.parse(plaintext as string)
		expect(body).toMatchObject({ "master-key": "mk", entropy: "ent", "imported-keys-dek": "ik" })
		expect(body).not.toHaveProperty("backup-mac")
		expect(body).not.toHaveProperty("imported-keys-dek-sealed")
		await api.downloadBackup()
		expect(m.downloadFile).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ data: "SEALED", filename: expect.stringMatching(/^NuloEncryptedBackup_.+\.txt$/) }),
		)
	})

	it("an accepted sealed download ends the run: done, with nothing left to download or seal", async () => {
		const { api } = setup("password")
		await api.handleBackup()
		await api.handleEncrypt()
		await api.downloadBackup()
		expect(readState(api)).toMatchObject({
			backupStatus: "downloaded",
			isDownloading: false,
			password: null,
			repeatedPassword: null,
		})
		expect(api.canDownload.value).toBe(false)
		expect(m.openToast).toHaveBeenCalledWith({ kind: "success", label: "Backup downloaded successfully" })
		for (const { kind, disconnect } of h.state.built) expect(disconnect, kind).toHaveBeenCalled()
		expect(await probeArtifacts(api)).toEqual({ downloads: 0, sealedFrom: [null] })
	})

	it("a refused sealed download keeps the sealed file and Download", async () => {
		const { api } = setup("password")
		await api.handleBackup()
		await api.handleEncrypt()
		m.downloadFile.mockRejectedValueOnce(new Error("refused"))
		await api.downloadBackup()
		expect(api.backupStatus.value).toBe("encrypted")
		expect(api.canDownload.value).toBe(true)
		await api.downloadBackup()
		expect(m.downloadFile.mock.calls.map(([file]) => file.data)).toEqual(["SEALED", "SEALED"])
		expect(api.backupStatus.value).toBe("downloaded")
	})

	// A new await is a new place a run can be superseded: add its row to the table, then this count.
	it("every await in the composable has a row above", () => {
		const code = readFileSync(resolve(__dirname, "useFullBackupExport.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
		expect(code.match(/\bawait\b/g)).toHaveLength(16)
	})
})
