/**
 * Real-wiring pins for restoreBackup/pickBackupFile/decryptBackup: they drive the whole composable
 * over the scaffold useFullBackupImport.test.ts drives, shared through
 * tests/helpers/backup-import-harness.ts (each file keeps its own `vi.mock` lines: they hoist per
 * file).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { computeBackupMac, EncryptionKey, PasskeyCredential } from "@nulo/wallet-crypto"
import { RpcDisconnectedError } from "@nulo/extension-messaging/errors"
import {
	AS_SENDER,
	accountClient,
	accountStateClient,
	authRegistryClient,
	buildBackup,
	configClient,
	contactClient,
	FENCE,
	makeOpts,
	networkClient,
	profileClient,
	resetBackupImportHarness,
	tokenBalanceClient,
	tokenClient,
	transactionClient,
} from "../../tests/helpers/backup-import-harness"

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/utils/restore-outcome", async () => (await import("../../tests/helpers/backup-import-harness")).restoreOutcomeModule)
vi.mock("@/wallet/services/profile/client", async () => (await import("../../tests/helpers/backup-import-harness")).profileClientModule)
vi.mock("@/wallet/services/network/client", async () => (await import("../../tests/helpers/backup-import-harness")).networkClientModule)
vi.mock("@/wallet/services/account/client", async () => (await import("../../tests/helpers/backup-import-harness")).accountClientModule)
vi.mock("@/wallet/services/token/client", async () => (await import("../../tests/helpers/backup-import-harness")).tokenClientModule)
vi.mock(
	"@/wallet/services/transaction/client",
	async () => (await import("../../tests/helpers/backup-import-harness")).transactionClientModule,
)
vi.mock(
	"@/wallet/services/token-balance/client",
	async () => (await import("../../tests/helpers/backup-import-harness")).tokenBalanceClientModule,
)
vi.mock(
	"@/wallet/services/account-state/client",
	async () => (await import("../../tests/helpers/backup-import-harness")).accountStateClientModule,
)
vi.mock(
	"@/wallet/services/auth-registry/client",
	async () => (await import("../../tests/helpers/backup-import-harness")).authRegistryClientModule,
)
vi.mock("@/wallet/services/contact/client", async () => (await import("../../tests/helpers/backup-import-harness")).contactClientModule)
vi.mock("@/wallet/services/config/client", async () => (await import("../../tests/helpers/backup-import-harness")).configClientModule)
vi.mock("@/wallet/services/account/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).accountSpecModule(importOriginal),
)
vi.mock(
	"@/wallet/services/account-state/spec",
	async () => (await import("../../tests/helpers/backup-import-harness")).accountStateSpecModule,
)
vi.mock("@/utils/background-liveness", async () => (await import("../../tests/helpers/backup-import-harness")).livenessModule)
vi.mock("@/wallet/services/auth-registry/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).authRegistrySpecModule(importOriginal),
)
vi.mock("@/wallet/services/config/spec", async () => (await import("../../tests/helpers/backup-import-harness")).configSpecModule)
vi.mock("@/wallet/services/contact/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).contactSpecModule(importOriginal),
)
vi.mock("@/wallet/services/network/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).networkSpecModule(importOriginal),
)
vi.mock("@/wallet/services/token-balance/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).tokenBalanceSpecModule(importOriginal),
)
vi.mock("@/wallet/services/token/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).tokenSpecModule(importOriginal),
)
vi.mock("@/wallet/services/transaction/spec", async (importOriginal) =>
	(await import("../../tests/helpers/backup-import-harness")).transactionSpecModule(importOriginal),
)
vi.mock("@/wallet/storage/migrations", async () => (await import("../../tests/helpers/backup-import-harness")).migrationsModule())

// Imported AFTER mocks are registered.
import { useFullBackupImport } from "./useFullBackupImport"
import { readLiveness } from "@/utils/background-liveness"
import { FilePickCanceledError } from "@/utils/files"

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(resetBackupImportHarness)

// ── Real-wiring pins ────────────────────────────────────────────────────────

function happyWiring() {
	profileClient.restore.mockResolvedValue({ id: "new-id", name: "Imported", type: "password" })
	networkClient.seedDefaultsForProfile.mockResolvedValue([{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }])
	accountClient.restore.mockResolvedValue([{ address: "0xaaaa", chainId: 1 }])
}

async function mountWithBackup(overrides: Record<string, unknown> = {}, opts = makeOpts()) {
	const c = useFullBackupImport(opts)
	const backup = await buildBackup(overrides)
	c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
	return { c, opts, backup }
}

describe("stage-order law (real wiring, happy path with every slice)", () => {
	it("runs profile → networks → active-pointer → accounts → imported keys → tokens → six services → reconcile → finalize → account-state → token re-read → completeImport, in order", async () => {
		const order: string[] = []
		const track = (name: string, client: { restore: ReturnType<typeof vi.fn> }) => {
			const prev = client.restore.getMockImplementation() as ((...a: never[]) => Promise<unknown>) | undefined
			client.restore.mockImplementation(async (...a: unknown[]) => {
				order.push(name)
				return prev ? prev(...(a as never[])) : []
			})
		}
		happyWiring()
		track("profile", profileClient as never)
		networkClient.seedDefaultsForProfile.mockImplementation(async () => {
			order.push("network")
			return [{ id: "new-net-1", name: "Testnet", rpcUrl: "https://t/", chainId: 1 }]
		})
		track("account", accountClient as never)
		track("token", tokenClient as never)
		track("transaction", transactionClient)
		track("token-balance", tokenBalanceClient)
		track("auth-registry", authRegistryClient)
		track("contact", contactClient)
		track("config", configClient)
		track("account-state", accountStateClient)
		networkClient.setActiveForProfile.mockImplementation(async () => {
			order.push("active-pointer")
			return "new-net-1"
		})
		accountClient.restoreImportedKeys.mockImplementation(async () => {
			order.push("imported-keys")
			return []
		})
		// Recorded a macrotask after the call: an import that did not await the re-read runs on and
		// completes first.
		tokenClient.refreshRestoredTokens.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0))
			order.push("token-refresh")
		})
		accountClient.reconcileImportedAccounts.mockImplementation(async () => {
			order.push("reconcile")
			return []
		})
		profileClient.finalizeRestore.mockImplementation(async () => {
			order.push("finalize")
			return { profile: { id: "new-id" }, fence: FENCE }
		})

		const opts = makeOpts()
		const markersAtComplete: unknown[] = []
		opts.completeImport.mockImplementation(async () => {
			order.push("complete")
			markersAtComplete.push(cRef?.restoreStatus.value, cRef?.restoreStage.value)
		})
		let cRef: ReturnType<typeof useFullBackupImport> | undefined
		const { c } = await mountWithBackup(
			{
				"active-chain-id": 1,
				data: {
					"imported-account-keys": [{ profileId: "src-profile-id", chainId: 1, address: "0xaaaa" }],
					transaction: [{ account: "0xaaaa", chainId: 1, hash: "h1" }],
					"token-balance": [],
					"auth-registry": [{ id: 1, account: "0xaaaa" }],
					contact: [],
					config: [{ key: "k", value: true }],
					"account-state": [{ networkId: "src-net-1", chainId: 1, contracts: [], senders: [AS_SENDER] }],
				},
			},
			opts,
		)
		cRef = c
		await c.restoreBackup()

		// Both finished markers are already set when completeImport observes them.
		expect(markersAtComplete).toEqual(["finished", "finished"])
		expect(order).toEqual([
			"profile",
			"network",
			"active-pointer",
			"account",
			"imported-keys",
			"token",
			"transaction",
			"token-balance",
			"auth-registry",
			"contact",
			"config",
			"reconcile",
			"finalize",
			"account-state",
			"token-refresh",
			"complete",
		])
		// Completion payload: completeImport receives the restored profile, with both
		// finished markers already set at call time.
		expect(opts.completeImport).toHaveBeenCalledWith(expect.objectContaining({ id: "new-id" }))
		expect(c.restoreStatus.value).toBe("finished")
		expect(c.restoreStage.value).toBe("finished")
		// Clean auto-complete leaves importedProfile UNSET (it is only set on the partial-errors path).
		expect(c.importedProfile.value).toBeNull()
	})

	it("the account-state tail receives the seeded rows, and work on an unseeded chain is dropped before any probe", async () => {
		happyWiring()
		networkClient.seedDefaultsForProfile.mockResolvedValue([
			{ id: "new-net-1", name: "A", rpcUrl: "https://a/", chainId: 1 },
			{ id: "src-net-2", name: "B", rpcUrl: "https://b/", chainId: 2, restoreError: "nope" },
		])
		const { c } = await mountWithBackup({
			data: {
				"account-state": [
					{ networkId: "src-net-1", chainId: 1, contracts: [], senders: [AS_SENDER] },
					// Work targeting a chain no seed serves: dropped and reported, never probed.
					{ networkId: "src-net-9", chainId: 9, contracts: [], senders: [AS_SENDER] },
				],
			},
		})
		await c.restoreBackup()
		expect(accountStateClient.restore).toHaveBeenCalled()
		const nets = (accountStateClient.restore.mock.calls[0] as unknown[])[1] as Array<{ id: string }>
		expect(nets.map((n) => n.id)).toEqual(["new-net-1"])
		const probed = networkClient.probeNodeStatus.mock.calls.map((call) => call[0])
		expect(probed).toEqual(["new-net-1"])
		expect(c.isRestoreHasErrors.value).toBe(true)
	})
})

describe("epoch-4 secret gates — rejections AND permissiveness", () => {
	it("password backup missing entropy fails with the exact copy", async () => {
		happyWiring()
		const backup = await buildBackup()
		const { checksum: _c, entropy: _e, ...body } = backup as Record<string, unknown>
		const fixed = { ...body, checksum: await EncryptionKey.getHashHex(JSON.stringify(body)) }
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: fixed, kind: "plain", profileType: "password" }
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "This backup is missing its recovery-phrase entropy.")
		expect(c.restoreStatus.value).toBe("failed")
	})

	it("password backup missing the imported-keys DEK fails with the exact copy", async () => {
		happyWiring()
		const backup = await buildBackup()
		const { checksum: _c, "imported-keys-dek": _dek, ...body } = backup as Record<string, unknown>
		const fixed = { ...body, checksum: await EncryptionKey.getHashHex(JSON.stringify(body)) }
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "x.json", backup: fixed, kind: "plain", profileType: "password" }
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "This backup is missing its imported-keys key.")
	})

	it("PERMISSIVENESS: a password backup with an EXTRA sealed DEK still imports (asymmetry preserved)", async () => {
		happyWiring()
		const { c, opts } = await mountWithBackup({ "imported-keys-dek-sealed": "c2VhbGVk" })
		await c.restoreBackup()
		expect(c.restoreStatus.value).toBe("finished")
		expect(opts.fillError).not.toHaveBeenCalled()
	})
})

describe("stage/status matrix on the failure paths", () => {
	it("no-seeds rollback keeps the stage at restoring:networks (NO rolling-back emission) with the exact copy", async () => {
		happyWiring()
		networkClient.seedDefaultsForProfile.mockResolvedValue([])
		const { c, opts } = await mountWithBackup()
		await c.restoreBackup()
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStage.value).toBe("restoring:networks")
		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "Couldn't seed the default networks for this backup")
	})

	it("duplicate-account rollback also keeps the pre-accounts stage (historical, preserved)", async () => {
		happyWiring()
		accountClient.restore.mockRejectedValue(new Error("Duplicate account"))
		const { c, opts } = await mountWithBackup()
		await c.restoreBackup()
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStage.value).toBe("restoring:networks")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "An account from this backup is already in your wallet")
	})

	it("duplicate-confirm decline abandons cleanly: status '', no profile, no error", async () => {
		happyWiring()
		const opts = { ...makeOpts(), confirmDuplicate: vi.fn(async () => undefined) }
		const c = useFullBackupImport(opts as never)
		const backup = await buildBackup()
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "password" }
		await c.restoreBackup()
		expect(c.restoreStatus.value).toBe("")
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
	})

	it("a rejected active-pointer write never fails the import", async () => {
		happyWiring()
		networkClient.setActiveForProfile.mockRejectedValue(new Error("not owned"))
		const { c } = await mountWithBackup({ "active-chain-id": 1 })
		await c.restoreBackup()
		expect(c.restoreStatus.value).toBe("finished")
	})

	it("finalize failure keeps the profile (no rollback) with the exact copy", async () => {
		happyWiring()
		profileClient.finalizeRestore.mockRejectedValue(new Error("kdf broke"))
		const { c, opts } = await mountWithBackup()
		await c.restoreBackup()
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(c.restoreStatus.value).toBe("failed")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Couldn't open the imported profile", "kdf broke")
	})

	it("a post-finalize account-state failure is ABSORBED into error records — profile kept, partial-errors path", async () => {
		happyWiring()
		accountStateClient.restore.mockRejectedValue(new Error("pxe down"))
		const { c } = await mountWithBackup({
			data: { "account-state": [{ networkId: "src-net-1", contracts: [], senders: [AS_SENDER] }] },
		})
		await c.restoreBackup()
		// The bounded chain-sync tail converts the failure into skip/violation records; the
		// import finishes degraded, the profile is KEPT, and the errors screen gates Continue.
		expect(profileClient.deleteProfile).not.toHaveBeenCalled()
		expect(c.restoreStatus.value).toBe("finished")
		expect(c.isRestoreHasErrors.value).toBe(true)
		expect(c.importedProfile.value).toMatchObject({ id: "new-id" })
	})

	it("a PRE-finalize mid-flight throw rolls back the created profile (createdProfileId was already visible)", async () => {
		happyWiring()
		const boom = new Error("boom")
		tokenClient.restore.mockRejectedValue(boom)
		const { c } = await mountWithBackup()
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			await c.restoreBackup()
			const message = "[full-backup] restore failed:"
			expect(logged.mock.calls.filter(([m]) => m === message)).toEqual([[message, { error: boom }]])
		} finally {
			logged.mockRestore()
		}
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStage.value).toBe("rolled-back")
	})

	it("bounded rollback: two failed deletes then success still lands rolled-back", async () => {
		happyWiring()
		tokenClient.restore.mockRejectedValue(new Error("boom"))
		profileClient.deleteProfile
			.mockRejectedValueOnce(new Error("t1"))
			.mockRejectedValueOnce(new Error("t2"))
			.mockResolvedValueOnce(undefined)
		const { c } = await mountWithBackup()
		await c.restoreBackup()
		expect(profileClient.deleteProfile).toHaveBeenCalledTimes(3)
		expect(c.restoreStage.value).toBe("rolled-back")
	})

	it("liveness-gate read failure fails CLOSED to cleanup-pending", async () => {
		happyWiring()
		const gone = new RpcDisconnectedError("gone")
		tokenClient.restore.mockRejectedValue(gone)
		vi.mocked(readLiveness).mockRejectedValueOnce(new Error("storage read failed"))
		const { c, opts } = await mountWithBackup()
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			await c.restoreBackup()
			const message = "[full-backup] restore failed; rollback incomplete:"
			expect(logged.mock.calls.filter(([m]) => m === message)).toEqual([[message, { error: gone }]])
		} finally {
			logged.mockRestore()
		}
		expect(c.restoreStage.value).toBe("rollback-failed")
		expect(opts.fillError).toHaveBeenCalledWith(
			"full_backup",
			"Import incomplete",
			expect.stringContaining("couldn't be removed automatically"),
		)
	})
})

describe("error-log conservation", () => {
	it("the log RESETS at restore start and APPENDS across sources", async () => {
		happyWiring()
		tokenClient.restore.mockResolvedValue([{ id: 1, chainId: 1, contract: "0xT", restoreError: "row broke" }])
		const { c } = await mountWithBackup({
			data: { token: [{ id: 1, chainId: 1 }], "token-balance": [{ id: 9, token: 999, account: "0xaaaa" }] },
		})
		c.restoreErrorLog.value = { stale: [{ old: true }] }
		await c.restoreBackup()
		expect(c.restoreErrorLog.value.stale).toBeUndefined()
		expect(c.restoreErrorLog.value["token-balance"]?.length).toBeGreaterThan(0)
		expect(c.restoreErrorLog.value.token?.length).toBeGreaterThan(0)
		// Partial-errors path: finished status, importedProfile SET (manual continue).
		expect(c.restoreStatus.value).toBe("finished")
		expect(c.importedProfile.value).toMatchObject({ id: "new-id" })
	})
})

describe("pickBackupFile / decryptBackup behavior pins", () => {
	it("progress guard: a running restore blocks a new pick entirely", async () => {
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.restoreStatus.value = "progress"
		await c.pickBackupFile()
		expect(opts.pickFile).not.toHaveBeenCalled()
	})

	it("a null pick DROPS the previous selection (no stale import CTA)", async () => {
		const opts = makeOpts()
		opts.pickFile.mockResolvedValue(null)
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "old.json", backup: {}, kind: "plain", profileType: "password" }
		await c.pickBackupFile()
		expect(c.selectedBackup.value).toBeNull()
	})

	it("a closed chooser keeps the chosen backup and shows no error", async () => {
		const opts = makeOpts()
		opts.pickFile.mockRejectedValue(new FilePickCanceledError())
		const c = useFullBackupImport(opts)
		const chosen = { name: "old.json", backup: {}, kind: "plain" as const, profileType: "password" }
		c.selectedBackup.value = chosen
		c.parsedBackupName.value = "Old"
		await c.pickBackupFile()
		expect(c.selectedBackup.value).toStrictEqual(chosen)
		expect(c.parsedBackupName.value).toBe("Old")
		expect(opts.fillError).not.toHaveBeenCalled()
	})

	it("a plain pick publishes the SANITIZED embedded name and clears the password fields", async () => {
		const opts = makeOpts()
		const body = JSON.stringify({ data: { profile: { name: "Nice\u202Ename", type: "password" } } })
		opts.pickFile.mockResolvedValue(new File([body], "b.json", { type: "application/json" }))
		const c = useFullBackupImport(opts)
		c.decryptionPassword.value = "leftover"
		await c.pickBackupFile()
		expect(c.parsedBackupName.value).toBe("Nicename")
		expect(opts.password.value).toBe("")
		expect(c.decryptionPassword.value).toBe("")
		expect(opts.clearError).toHaveBeenCalled()
	})

	it("a throwing pick surfaces the read-failure copy", async () => {
		const opts = makeOpts()
		const io = new Error("io")
		opts.pickFile.mockRejectedValue(io)
		const c = useFullBackupImport(opts)
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			await c.pickBackupFile()
			expect(logged.mock.calls).toEqual([["Failed to read backup file:", { error: io }]])
		} finally {
			logged.mockRestore()
		}
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Failed to read the backup file")
	})

	it("decryptBackup: success replaces the selection, publishes the sanitized name; wrong password fills the exact copy", async () => {
		const inner = { data: { profile: { type: "password", name: "Enc\u200bName" } } }
		const key = await EncryptionKey.fromPassword("pw12345678")
		const sealed = Buffer.from(await key.encrypt(new TextEncoder().encode(JSON.stringify(inner)))).toString("base64")
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.selectedBackup.value = { name: "e.txt", backup: sealed, kind: "sealed", profileType: null }
		c.decryptionPassword.value = "wrong-password"
		await c.decryptBackup()
		expect(opts.fillError).toHaveBeenCalledWith(
			"full_backup",
			"Decryption Failed",
			"The provided password is incorrect or the backup file is corrupted. Please try again with the correct password or select another file.",
		)

		c.decryptionPassword.value = "pw12345678"
		await c.decryptBackup()
		expect((c.selectedBackup.value?.backup as { data?: { profile?: { type?: string } } })?.data?.profile?.type).toBe("password")
		expect(c.selectedBackup.value?.profileType).toBe("password")
		expect(c.parsedBackupName.value).toBe("EncName")
	})

	it("a nameless decrypt or pick clears the previous backup's name", async () => {
		const inner = { data: { profile: { type: "password" } } }
		const key = await EncryptionKey.fromPassword("pw12345678")
		const sealed = Buffer.from(await key.encrypt(new TextEncoder().encode(JSON.stringify(inner)))).toString("base64")
		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		c.parsedBackupName.value = "Previous"
		c.selectedBackup.value = { name: "e.txt", backup: sealed, kind: "sealed", profileType: null }
		c.decryptionPassword.value = "pw12345678"
		await c.decryptBackup()
		expect(c.parsedBackupName.value).toBeNull()

		c.parsedBackupName.value = "Previous"
		opts.pickFile.mockResolvedValue(new File([JSON.stringify(inner)], "b.json", { type: "application/json" }))
		await c.pickBackupFile()
		expect(c.parsedBackupName.value).toBeNull()
	})
})

describe("epoch-4 passkey gates", () => {
	const CRED_ID = Buffer.from(new Uint8Array(16).fill(7)).toString("base64")
	const CREDENTIAL = { id: CRED_ID, prf: Buffer.from(new Uint8Array(32).fill(5)).toString("base64") }

	async function passkeyBackup(mutate: (body: Record<string, unknown>) => void) {
		const base = await buildBackup({
			"master-key": CRED_ID,
			"imported-keys-dek-sealed": Buffer.from(new Uint8Array(48).fill(3)).toString("base64"),
			data: { profile: { id: "src-profile-id", name: "Imported", type: "passkey" } },
		})
		const { checksum: _c, entropy: _e, "imported-keys-dek": _dek, ...body } = base as Record<string, unknown>
		mutate(body)
		const checksum = await EncryptionKey.getHashHex(JSON.stringify(body))
		return { ...body, checksum, "backup-mac": await computeBackupMac(await PasskeyCredential.create(CREDENTIAL), checksum) }
	}

	function mountPasskey(backup: unknown) {
		const runCeremony = vi.fn(async () => CREDENTIAL as never)
		const opts = { ...makeOpts({ password: "", repeatedPassword: "" }), runCeremony }
		const c = useFullBackupImport(opts as never)
		c.selectedBackup.value = { name: "x.json", backup, kind: "plain", profileType: "passkey" }
		return { c, opts, runCeremony }
	}

	it("a passkey backup WITH an entropy field fails with the exact copy", async () => {
		const backup = await passkeyBackup((body) => {
			body.entropy = Buffer.from(new Uint8Array(32).fill(9)).toString("base64")
		})
		const { c, opts } = mountPasskey(backup)
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "A passkey backup must not carry an entropy field.")
		expect(c.restoreStatus.value).toBe("failed")
	})

	it("a passkey backup missing its sealed DEK fails with the exact copy", async () => {
		const backup = await passkeyBackup((body) => {
			body["imported-keys-dek-sealed"] = undefined
		})
		const { c, opts } = mountPasskey(backup)
		await c.restoreBackup()
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "This backup is missing its imported-keys key.")
	})

	it("PERMISSIVENESS: a passkey backup with an EXTRA plain DEK still imports", async () => {
		happyWiring()
		const backup = await passkeyBackup((body) => {
			body["imported-keys-dek"] = Buffer.from(new Uint8Array(32).fill(2)).toString("base64")
		})
		const { c, opts, runCeremony } = mountPasskey(backup)
		await c.restoreBackup()
		expect(runCeremony).toHaveBeenCalledWith(expect.objectContaining({ mode: "get", credentialId: CRED_ID, step: "restore" }))
		expect(c.restoreStatus.value).toBe("finished")
		expect(opts.fillError).not.toHaveBeenCalled()
	})
})

describe("decrypt publication race — the last await seam", () => {
	it("a re-pick landing between the helper's final fence and the caller's continuation is NOT overwritten", async () => {
		const innerJson = JSON.stringify({ data: { profile: { type: "password", name: "RaceName" } } })
		const key = await EncryptionKey.fromPassword("pw12345678")
		const sealed = Buffer.from(await key.encrypt(new TextEncoder().encode(innerJson))).toString("base64")

		const opts = makeOpts()
		const c = useFullBackupImport(opts)
		const original = { name: "e.txt", backup: sealed, kind: "sealed" as const, profileType: null }
		const replacement = { name: "new.json", backup: {}, kind: "plain" as const, profileType: "password" }
		c.selectedBackup.value = original
		c.decryptionPassword.value = "pw12345678"

		// The re-pick is queued from the helper's parse of the decrypted body, which runs after its
		// last stale check and before it returns, so the microtask runs ahead of the caller's
		// continuation: only the caller's own fence can keep the replacement.
		const realParse = JSON.parse
		const parse = vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
			if (text === innerJson) {
				queueMicrotask(() => {
					c.selectedBackup.value = replacement
				})
			}
			return realParse(text, reviver)
		})

		await c.decryptBackup()
		parse.mockRestore()

		// The replacement selection must survive (structural: the ref stores a reactive
		// proxy of the assigned object); the decrypted publication must not land.
		expect(c.selectedBackup.value).toStrictEqual(replacement)
		expect(c.parsedBackupName.value).not.toBe("RaceName")
	})
})

/** The message a native throw carries in THIS engine. Callers bind the production expression's
 *  local names, since JavaScriptCore and SpiderMonkey quote them in the text. */
function nativeMessage(run: () => unknown): string {
	try {
		run()
	} catch (err) {
		return (err as Error).message
	}
	throw new Error("reference expression did not throw")
}

describe("restore wiring handoffs", () => {
	it("hands the account restore exactly the remapped account rows, as its only argument", async () => {
		happyWiring()
		const { c } = await mountWithBackup()
		await c.restoreBackup()
		expect(accountClient.restore.mock.calls).toEqual([
			[
				[
					{
						profileId: "new-id",
						chainId: 1,
						address: "0xaaaa",
						index: 0,
						type: 0,
						l1ChainId: 1,
						name: "Account 1",
						visible: true,
					},
				],
			],
		])
	})

	it("hands the token restore exactly the token rows, as its only argument", async () => {
		happyWiring()
		const { c } = await mountWithBackup({ data: { token: [{ id: 1, chainId: 1, contract: "0xT" }] } })
		await c.restoreBackup()
		expect(tokenClient.restore.mock.calls).toEqual([[[{ id: 1, chainId: 1, contract: "0xT" }]]])
	})

	it("re-links balances only for a non-empty token-balance slice", async () => {
		happyWiring()
		const absent = await mountWithBackup()
		await absent.c.restoreBackup()
		expect(absent.opts.completeImport).toHaveBeenCalledTimes(1)
		expect(absent.c.restoreErrorLog.value).not.toHaveProperty("token-balance")
		expect(tokenBalanceClient.restore).not.toHaveBeenCalled()

		// An undefined token result throws inside the re-link, so an empty slice must never reach it.
		tokenClient.restore.mockResolvedValue(undefined)
		const empty = await mountWithBackup({ data: { "token-balance": [] } })
		await empty.c.restoreBackup()
		expect(empty.opts.completeImport).toHaveBeenCalledTimes(1)
		expect(empty.c.restoreErrorLog.value).not.toHaveProperty("token-balance")
		expect(tokenBalanceClient.restore.mock.calls).toEqual([[[], "new-id"]])
	})

	it("records errors in stage order, the re-link's drops before the token rows, in the token stage's tick", async () => {
		happyWiring()
		accountClient.restore.mockResolvedValue([
			{ address: "0xaaaa", chainId: 1 },
			{ address: "0xbbbb", chainId: 1, restoreError: "account broke" },
		])
		accountClient.restoreImportedKeys.mockResolvedValueOnce([{ chainId: 1, restoreError: "key broke" }] as never)
		tokenClient.restore.mockResolvedValue([
			{ id: "n1", chainId: 1, contract: "0xT" },
			{ id: 2, chainId: 1, contract: "0xU", restoreError: "token broke" },
		])
		tokenBalanceClient.restore.mockResolvedValue([{ id: 10, restoreError: "balance broke" }])
		transactionClient.restore.mockResolvedValue([{ chainId: 1, restoreError: "tx broke" }])
		let keysAfterTokenDisconnect: string[] | undefined
		const { c } = await mountWithBackup({
			data: {
				"imported-account-keys": [{ profileId: "src-profile-id", chainId: 1, address: "0xaaaa" }],
				token: [
					{ id: 1, chainId: 1, contract: "0xT" },
					{ id: 2, chainId: 1, contract: "0xU" },
				],
				"token-balance": [
					{ id: 10, token: 1, account: "0xaaaa" },
					{ id: 11, token: 999, account: "0xaaaa" },
				],
				transaction: [{ account: "0xaaaa", chainId: 1, hash: "h1" }],
			},
		})
		// The token stage's own disconnect; the tail's re-read disconnects the client again later.
		tokenClient.disconnect.mockImplementationOnce(() =>
			queueMicrotask(() => {
				keysAfterTokenDisconnect = Object.keys(c.restoreErrorLog.value)
			}),
		)
		await c.restoreBackup()

		expect(Object.keys(c.restoreErrorLog.value)).toEqual(["account", "imported-account-keys", "token-balance", "token", "transaction"])
		const balanceRows = c.restoreErrorLog.value["token-balance"] as Array<Record<string, unknown>>
		expect(balanceRows).toHaveLength(2)
		expect(balanceRows[0]).toEqual({ row: 1, restoreError: "Token balance could not be re-linked to a restored token" })
		expect(balanceRows[1]).toMatchObject({ row: 0, restoreError: "balance broke" })
		expect(keysAfterTokenDisconnect).toEqual(["account", "imported-account-keys", "token-balance", "token"])
	})

	it("an undefined account result fails the import with the engine's own text for its loop", async () => {
		happyWiring()
		accountClient.restore.mockResolvedValue(undefined)
		const { c, opts } = await mountWithBackup()
		await c.restoreBackup()
		const newAccounts = undefined as unknown as unknown[]
		const expected = nativeMessage(() => {
			for (const a of newAccounts) if (a) break
		})
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStage.value).toBe("rolled-back")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", expected)
	})

	it("an undefined token result with balances to re-link fails with the engine's own text", async () => {
		happyWiring()
		tokenClient.restore.mockResolvedValue(undefined)
		const { c, opts } = await mountWithBackup({
			data: { token: [{ id: 1, chainId: 1, contract: "0xT" }], "token-balance": [{ id: 9, token: 1, account: "0xaaaa" }] },
		})
		await c.restoreBackup()
		const newTokens = undefined as unknown as unknown[]
		const expected = nativeMessage(() => newTokens.length)
		expect(profileClient.deleteProfile).toHaveBeenCalledWith("new-id")
		expect(c.restoreStage.value).toBe("rolled-back")
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Import failed", expected)
	})

	it("hands each slice client its own surviving rows and the created profile id", async () => {
		happyWiring()
		tokenClient.restore.mockResolvedValue([{ id: "n1", chainId: 1, contract: "0xT" }])
		const { c, opts } = await mountWithBackup({
			data: {
				token: [{ id: 1, chainId: 1, contract: "0xT" }],
				transaction: [{ account: "0xaaaa", chainId: 1, hash: "tx-marker" }],
				"token-balance": [{ id: 10, token: 1, account: "0xaaaa", publicBalance: "7" }],
				"auth-registry": [{ id: 1, account: "0xaaaa", chainId: 1, hash: "authwit-marker" }],
				contact: [{ id: "c1", legacyName: "contact-marker", address: "0x01" }],
				config: [{ key: "k", value: "config-marker" }],
			},
		})
		await c.restoreBackup()
		expect(opts.fillError).not.toHaveBeenCalled()
		expect(transactionClient.restore.mock.calls).toEqual([
			[[{ account: "0xaaaa", chainId: 1, hash: "tx-marker", networkId: "new-net-1" }], "new-id"],
		])
		expect(tokenBalanceClient.restore.mock.calls).toEqual([
			[[{ id: 10, token: "n1", account: "0xaaaa", publicBalance: "7" }], "new-id"],
		])
		expect(authRegistryClient.restore.mock.calls).toEqual([
			[[{ id: 1, account: "0xaaaa", chainId: 1, hash: "authwit-marker" }], "new-id"],
		])
		expect(contactClient.restore.mock.calls).toEqual([[[{ id: "c1", name: "contact-marker", address: "0x01" }], "new-id"]])
		expect(configClient.restore.mock.calls).toEqual([[[{ key: "k", value: "config-marker" }], "new-id"]])
	})

	it("a duplicate-account rollback finishes every delete attempt before the account client closes", async () => {
		happyWiring()
		accountClient.restore.mockRejectedValue(new Error("Duplicate account"))
		profileClient.deleteProfile.mockRejectedValueOnce(new Error("t1")).mockResolvedValueOnce(undefined)
		const { c, opts } = await mountWithBackup()
		await c.restoreBackup()
		expect(profileClient.deleteProfile).toHaveBeenCalledTimes(2)
		const lastDelete = profileClient.deleteProfile.mock.invocationCallOrder[1]
		expect(accountClient.disconnect.mock.invocationCallOrder[0]).toBeGreaterThan(lastDelete)
		expect(opts.fillError).toHaveBeenCalledWith("full_backup", "Can't import", "An account from this backup is already in your wallet")
	})
})
