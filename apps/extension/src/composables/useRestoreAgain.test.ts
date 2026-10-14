/**
 * Restore again over the real validation gate and the real reminder record (a storage stub with
 * FIFO locks); only the service clients are fakes.
 */
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import { EncryptionKey } from "@nulo/wallet-crypto"
import { isProxy, nextTick, reactive, ref } from "vue"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { NodeStatus } from "@/wallet/services/network/spec"

const accountStateClient = { restore: vi.fn(), disconnect: vi.fn() }
const networkClient = {
	seedDefaultsForProfile: vi.fn(),
	setActiveForProfile: vi.fn(),
	probeNodeStatus: vi.fn(),
	disconnect: vi.fn(),
}
const FENCE = { profileId: "p1", epoch: 0, session: 1, incarnation: "w1" }
const session = { live: true }
const profileClient = {
	captureRunFence: vi.fn(async () => FENCE),
	assertRunFence: vi.fn(async () => {
		if (!session.live) throw new SessionEndedError()
	}),
	disconnect: vi.fn(),
}

// Vitest 4 requires `function` expressions for mocks instantiated with `new`.
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: vi.fn(function () {
		return accountStateClient
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return networkClient
	}),
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return profileClient
	}),
}))
// The import's own suite pins one backup-safe migration (v1 → v2), so every backup here migrates.
vi.mock("@/wallet/storage/migrations", async () => {
	const { defineRowMapMigration } = await vi.importActual<typeof import("@/wallet/services/backup/row-map-migration")>(
		"@/wallet/services/backup/row-map-migration",
	)
	const v2 = defineRowMapMigration({
		version: 2,
		description: "test: rename contact legacyName to name",
		rowMaps: { "nulo:core:contacts": { rename: { legacyName: "name" } } },
	})
	return { BASELINE_VERSION: 1, realMigrations: [], migrations: [], backupMigrations: [v2] }
})

import { ACCOUNT_STATE_SKIP_DEADLINE, normalizeAccountStateSlice } from "@/wallet/services/account-state/normalize"
import { sealFullBackupText } from "@/utils/full-backup-helpers"
import { restoreOutcomeKey } from "@/utils/profile-ui-keys"
import { armRestoreOutcome, clearRestoreOutcome, finishRestoreOutcome } from "@/utils/restore-outcome"
import { planRestoreAgain } from "./full-backup-restore"
import { useRestoreAgain } from "./useRestoreAgain"

const KEY = restoreOutcomeKey("p1")
const SENDER = { address: `0x${"ab".repeat(32)}` }
const item = (chainId: number) => ({ networkId: `exported-${chainId}`, chainId, senders: [SENDER], contracts: [] })
const TESTNET = { id: "N1", profileId: "p1", chainId: 1, name: "Testnet" }
const LOCAL = { id: "N2", profileId: "p1", chainId: 2, name: "Local Network" }
const OTHER = { id: "N3", profileId: "p1", chainId: 3, name: "Other" }

async function buildBackup(overrides: Record<string, unknown> = {}) {
	const { data, ...body } = overrides
	const backup = {
		"compat-epoch": 5,
		"backup-schema-version": 1,
		data: {
			profile: { id: "src", name: "Imported", type: "password" },
			contact: [],
			transaction: [{ hash: "h1", chainId: 1 }],
			"account-state": [item(1), item(2), item(3)],
			...((data as Record<string, unknown>) ?? {}),
		},
		...body,
	}
	return { ...backup, checksum: await EncryptionKey.getHashHex(JSON.stringify(backup)) }
}

let store: Map<string, unknown>

function stubStorage() {
	store = new Map()
	const tails = new Map<string, Promise<unknown>>()
	vi.stubGlobal("navigator", {
		locks: {
			request: (name: string, fn: () => Promise<unknown>) => {
				const run = (tails.get(name) ?? Promise.resolve()).then(fn)
				tails.set(
					name,
					run.catch(() => {}),
				)
				return run
			},
		},
	})
	vi.stubGlobal("chrome", {
		...globalThis.chrome,
		storage: {
			local: {
				get: vi.fn(async (key: string) => (store.has(key) ? { [key]: structuredClone(store.get(key)) } : {})),
				set: vi.fn(async (items: Record<string, unknown>) => {
					for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v))
				}),
				remove: vi.fn(async (keys: string | string[]) => {
					for (const k of [keys].flat()) store.delete(k)
				}),
			},
		},
	})
}

/** Answers each restore call per network; the networks of a call are its items'. */
function answerRestore(answer: (networkId: string) => unknown) {
	accountStateClient.restore.mockImplementation(async (items: Array<{ networkId: string }>) => answer(items[0].networkId))
}
const answered = (networkId: string) => [{ networkId, senders: [SENDER], contracts: [] }]
const ranOutOfTime = (networkId: string) => [
	{ networkId, senders: [], contracts: [], restoreError: `${ACCOUNT_STATE_SKIP_DEADLINE} (1 registration(s) not attempted)` },
]

function makeOpts(rows: unknown[] = [TESTNET, LOCAL, OTHER]) {
	const active = ref<string | undefined>("p1")
	const networks = reactive(rows.map((row) => ({ ...(row as object) })))
	return {
		active,
		networks,
		opts: {
			profileService: profileClient,
			networkService: networkClient,
			activeProfileId: () => active.value,
			networks: () => networks as never,
			pickFile: vi.fn(async () => undefined),
			fillError: vi.fn(),
			clearError: vi.fn(),
			openToast: vi.fn(),
			showErrorLog: vi.fn(),
			leave: vi.fn(),
		},
	}
}

/** A mounted page over a reminder armed for `armed`, with `backup` picked. */
async function open(armed: string[] = ["N1", "N2"], backup?: Record<string, unknown>) {
	const original = await buildBackup()
	const run = (await armRestoreOutcome("p1", original.checksum, armed)) as string
	const env = makeOpts()
	const page = useRestoreAgain(env.opts)
	await page.start()
	page.selectedBackup.value = { name: "b.json", backup: backup ?? original, type: "plain", profileType: "password" }
	return { ...env, page, run, original }
}

beforeEach(() => {
	stubStorage()
	session.live = true
	accountStateClient.restore.mockReset()
	answerRestore(answered)
	networkClient.probeNodeStatus.mockReset().mockResolvedValue(NodeStatus.Active)
	profileClient.captureRunFence.mockClear()
	profileClient.assertRunFence.mockClear()
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("planRestoreAgain", () => {
	test("keeps only the account state of the named networks' chains, bound to their ids; every other slice drops", () => {
		const data = { "account-state": [item(1), item(2), item(9)], transaction: [{ hash: "h" }], contact: [{ id: "c" }] }
		expect(planRestoreAgain(data, [TESTNET, LOCAL])).toEqual({
			"account-state": [
				{ ...item(1), networkId: "N1" },
				{ ...item(2), networkId: "N2" },
			],
		})
		expect(data["account-state"][0].networkId, "the verified data is never rewritten").toBe("exported-1")
	})

	test("a backup without account state plans nothing", () => {
		expect(planRestoreAgain({ transaction: [] }, [TESTNET])).toEqual({})
	})

	test.each([
		["not an array", { bad: true }],
		["over the item cap", Array.from({ length: 17 }, () => item(1))],
		[
			"duplicates over the per-network cap",
			[1, 2].map(() => ({
				...item(1),
				senders: Array.from({ length: 40 }, (_, i) => ({ address: `0x${i.toString(16).padStart(64, "0")}` })),
			})),
		],
	])("a hostile slice (%s) reaches the normalizer's violations", (_label, slice) => {
		const planned = planRestoreAgain({ "account-state": slice }, [TESTNET])
		expect(normalizeAccountStateSlice(planned["account-state"] as never).violations.length).toBeGreaterThan(0)
	})
})

describe("useRestoreAgain: refusals change nothing", () => {
	test.each([
		[
			"another valid backup",
			{ data: { profile: { id: "src", name: "Other", type: "password" } } },
			"This isn't the backup you restored",
		],
		["an old compat epoch", { "compat-epoch": 2 }, "Incompatible backup"],
		["a schema newer than the wallet", { "backup-schema-version": 999 }, "Backup is too new"],
		["a failed migration", { data: { mystery: [] } }, "Import failed"],
	])("%s shows its copy", async (_label, overrides, title) => {
		const { page, opts } = await open(["N1", "N2"], await buildBackup(overrides))
		const before = structuredClone(store.get(KEY))

		await page.restoreBackup()

		expect(opts.fillError).toHaveBeenCalledWith("full_backup", title, expect.any(String))
		expect(page.restoreStatus.value).toBe("failed")
		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(store.get(KEY)).toEqual(before)
	})

	test("a tampered body shows the integrity message", async () => {
		const { page, opts, original } = await open()
		const before = structuredClone(store.get(KEY))
		page.selectedBackup.value = {
			name: "b.json",
			backup: { ...original, data: { ...original.data, "account-state": [item(1)] } },
			type: "plain",
			profileType: "password",
		}

		await page.restoreBackup()

		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Backup Integrity Check Failed", expect.any(String))
		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(store.get(KEY)).toEqual(before)
	})

	test("a wrong decryption password shows the import's error and never restores", async () => {
		const { page, opts, original } = await open()
		const before = structuredClone(store.get(KEY))
		page.selectedBackup.value = {
			name: "b.txt",
			backup: await sealFullBackupText(JSON.stringify(original), "right password"),
			type: "encrypted",
			profileType: null,
		}
		page.decryptionPassword.value = "wrong password"

		await page.decryptBackup()
		await page.restoreBackup()

		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Decryption Failed", expect.any(String))
		expect(page.selectedBackup.value?.profileType).toBeNull()
		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(store.get(KEY)).toEqual(before)
	})
})

describe("useRestoreAgain: scope", () => {
	test("the restore carries only the admitted networks, their raw rows and their items, under the page's fence", async () => {
		const { page, run } = await open(["N1", "N2"])
		// Another page settled Local Network after this one read the reminder.
		await finishRestoreOutcome("p1", run, ["N2"])

		await page.restoreBackup()

		expect(accountStateClient.restore).toHaveBeenCalledOnce()
		const [items, networks, fence] = accountStateClient.restore.mock.calls[0]
		expect(items).toEqual([{ networkId: "N1", senders: [SENDER], contracts: [] }])
		expect(networks).toEqual([TESTNET])
		expect(isProxy(networks[0]), "a proxy cannot cross Firefox's port").toBe(false)
		expect(fence).toEqual(FENCE)
	})
})

describe("useRestoreAgain: outcomes", () => {
	test("all restored: the reminder goes, the toast names the networks, and the page returns Home", async () => {
		const { page, opts } = await open()

		await page.restoreBackup()

		expect(store.has(KEY)).toBe(false)
		expect(opts.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "success", label: "Testnet and Local Network restored" })
		expect(opts.leave).toHaveBeenCalledOnce()
	})

	test("a network that ran out of time stays named, with the import's warning and Retry", async () => {
		answerRestore((id) => (id === "N2" ? ranOutOfTime(id) : answered(id)))
		const { page, opts, run } = await open()

		await page.restoreBackup()

		expect(store.get(KEY)).toMatchObject({ run, networkIds: ["N2"], leaseUntil: 0 })
		expect(page.restoreStatus.value).toBe("finished")
		expect(page.canRetry.value).toBe(true)
		expect(page.warningText.value).toBe(
			"Local Network didn't answer in time, so what was saved for it may not be restored. You can retry or continue.",
		)
		expect(opts.leave).not.toHaveBeenCalled()
	})

	test("a network on another chain is not retryable and shows the restore-again line", async () => {
		networkClient.probeNodeStatus.mockImplementation(async (id: string) => (id === "N2" ? NodeStatus.InvalidChain : NodeStatus.Active))
		const { page, run } = await open()

		await page.restoreBackup()

		expect(store.get(KEY)).toMatchObject({ run, networkIds: ["N2"] })
		expect(page.canRetry.value).toBe(false)
		expect(page.warningText.value).toBe("Local Network couldn't be restored from this backup. You can review the details or continue.")
		expect(page.isRestoreHasErrors.value).toBe(true)
	})

	test("a Retry that fails again shows the line; one that restores goes Home", async () => {
		let calls = 0
		answerRestore((id) => (id === "N2" && ++calls <= 2 ? ranOutOfTime(id) : answered(id)))
		const { page, opts } = await open()
		await page.restoreBackup()

		await page.retryRestore()
		expect(page.retryFailedAgain.value).toBe(true)
		expect(page.retryResult.value).toBe("Retry didn't work · Local Network still not restored")
		expect(page.canRetry.value).toBe(true)

		await page.retryRestore()
		expect(store.has(KEY)).toBe(false)
		expect(opts.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "success", label: "Testnet and Local Network restored" })
		expect(opts.leave).toHaveBeenCalledOnce()
	})

	test("Continue returns Home and leaves the reminder as the run left it", async () => {
		answerRestore((id) => (id === "N2" ? ranOutOfTime(id) : answered(id)))
		const { page, opts } = await open()
		await page.restoreBackup()
		const left = structuredClone(store.get(KEY))

		page.continueHome()

		expect(opts.leave).toHaveBeenCalledOnce()
		expect(store.get(KEY)).toEqual(left)
	})
})

describe("useRestoreAgain: races", () => {
	test("a reminder dismissed before Restore returns Home with no restore call", async () => {
		const { page, opts } = await open()
		await clearRestoreOutcome("p1")

		await page.restoreBackup()

		expect(opts.leave).toHaveBeenCalledOnce()
		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(store.has(KEY)).toBe(false)
	})

	test("another run's reminder is left untouched", async () => {
		const { page, opts, original } = await open()
		await armRestoreOutcome("p1", original.checksum, ["N1"])
		const other = structuredClone(store.get(KEY))

		await page.restoreBackup()

		expect(opts.leave).toHaveBeenCalledOnce()
		expect(accountStateClient.restore).not.toHaveBeenCalled()
		expect(store.get(KEY)).toEqual(other)
	})

	test("a profile switch mid-run returns Home, and the run writes nothing once its session ended", async () => {
		let release: () => void = () => {}
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		accountStateClient.restore.mockImplementation(async (items: Array<{ networkId: string }>) => {
			await held
			return answered(items[0].networkId)
		})
		const { page, opts, active } = await open()
		const restoring = page.restoreBackup()
		await vi.waitFor(() => expect(accountStateClient.restore).toHaveBeenCalled())
		const admitted = structuredClone(store.get(KEY))

		session.live = false
		active.value = "p2"
		await nextTick()
		expect(opts.leave).toHaveBeenCalledOnce()

		release()
		await restoring
		expect(store.get(KEY)).toEqual(admitted)
		expect(opts.openToast).not.toHaveBeenCalled()
		expect(opts.leave).toHaveBeenCalledOnce()
	})

	test.each([
		["no reminder", [] as string[], [TESTNET, LOCAL]],
		["every named network deleted", ["N1"], [LOCAL]],
	])("%s returns Home on open", async (_label, armed, rows) => {
		const original = await buildBackup()
		if (armed.length) await armRestoreOutcome("p1", original.checksum, armed)
		const { opts } = makeOpts(rows)
		const page = useRestoreAgain(opts)
		await page.start()
		await nextTick()
		expect(opts.leave).toHaveBeenCalledOnce()
	})

	test("a list still loading neither names nor leaves; the loaded list names the networks", async () => {
		const original = await buildBackup()
		await armRestoreOutcome("p1", original.checksum, ["N1"])
		const { opts, networks } = makeOpts([])
		const page = useRestoreAgain(opts)
		await page.start()
		await nextTick()
		expect(page.networkNames.value).toEqual([])
		expect(opts.leave).not.toHaveBeenCalled()

		networks.push({ ...TESTNET })
		await nextTick()
		expect(page.networkNames.value).toEqual(["Testnet"])
	})
})
