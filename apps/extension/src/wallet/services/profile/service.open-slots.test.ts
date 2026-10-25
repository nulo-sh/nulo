/**
 * Every password path opens a row's slots through one opener that classifies the row first: a row
 * that is not a password row reaches no decryptor, whatever its `type` field or slots claim. Every
 * path that opens both slots then checks the stored words still derive the stored master.
 */
import { InvalidPasswordError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { getMnemonic } from "@nulo/wallet-core/utils"
import { asBase64MasterSecret, deriveMasterFromMnemonic, PasswordSecretBox } from "@nulo/wallet-crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { svc } from "../composition-harness"
import { ProfileService } from "./service"
import { PROFILE_STORAGE_ROOT } from "./spec"

const PASSWORD = "pass1234"

afterEach(() => vi.restoreAllMocks())

async function lockedPasswordProfile() {
	const api = new FakeBrowserApi()
	api.reset()
	const config = new ConfigStore()
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	const service = new ProfileService(config, new LoggerStore(config), api)
	services.add(service)
	await services.start()
	const { id } = await service.createProfile("P", PASSWORD)
	await service.lockActiveProfile()
	const keyOf = (rowId: string) => `${PROFILE_STORAGE_ROOT}@${rowId}`
	const read = async (rowId: string) =>
		JSON.parse((await api.storage.local.get(keyOf(rowId)))[keyOf(rowId)] as string) as Record<string, unknown>
	const writeTo = (rowId: string, row: Record<string, unknown>) => api.storage.local.set({ [keyOf(rowId)]: JSON.stringify(row) })
	const stored = await read(id)
	return { service, id, stored, read, writeTo, write: (row: Record<string, unknown>) => writeTo(id, row) }
}

/** Another profile under the same password: its slots open under this one's password too. */
async function sibling(service: ProfileService) {
	const { id } = await service.createProfile("Q", PASSWORD)
	await service.lockActiveProfile()
	return id
}

/** Each password path, with the refusal it gives when the opener returns nothing. */
const PATHS: [string, (s: ProfileService, id: string) => Promise<unknown>, (e: unknown) => void][] = [
	["unlockProfile", (s, id) => s.unlockProfile(id, PASSWORD), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	[
		"exportPlain",
		(s, id) => s.exportPlain(id, PASSWORD),
		(e) => expect(e).toMatchObject({ message: InvalidPasswordError.LEGACY_MESSAGE }),
	],
	["openBackupTransfer", (s, id) => s.openBackupTransfer(id, PASSWORD), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	["exportImportedKeysDek", (s, id) => s.exportImportedKeysDek(id, PASSWORD), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	[
		"exportMnemonic",
		(s, id) => s.exportMnemonic(id, PASSWORD),
		(e) => expect(e).toMatchObject({ message: "Invalid profile old password" }),
	],
	[
		"changeProfilePassword",
		(s, id) => s.changeProfilePassword(id, PASSWORD, "newpass99"),
		(e) => expect(e).toMatchObject({ message: "Invalid profile old password" }),
	],
]

/** Each path that opens both the master and the entropy slot. */
const PAIRED_PATHS: [string, (s: ProfileService, id: string) => Promise<unknown>][] = [
	["unlockProfile", (s, id) => s.unlockProfile(id, PASSWORD)],
	["exportPlain", (s, id) => s.exportPlain(id, PASSWORD)],
	["openBackupTransfer", (s, id) => s.openBackupTransfer(id, PASSWORD)],
	["exportMnemonic", (s, id) => s.exportMnemonic(id, PASSWORD)],
	["changeProfilePassword", (s, id) => s.changeProfilePassword(id, PASSWORD, "newpass99")],
]

describe("the password slot opener", () => {
	test.each<[string, (row: Record<string, unknown>) => Record<string, unknown>]>([
		["a row typed as neither unlock, its slots intact", (row) => ({ ...row, type: "bogus" })],
		["a password row missing its entropy slot", ({ entropy: _e, ...rest }) => rest],
		["a password row whose guard is not a string", (row) => ({ ...row, guard: 7 })],
	])(
		"%s reaches no decryptor on any password path",
		async (_label, damage) => {
			const { service, id, stored, write } = await lockedPasswordProfile()
			await write(damage(stored))
			const unseal = vi.spyOn(PasswordSecretBox.prototype, "unsealWithPasshash")
			for (const [path, call, refused] of PATHS) {
				const error = await call(service, id).then(
					() => undefined,
					(e: unknown) => e,
				)
				expect(error, path).toBeDefined()
				refused(error)
			}
			expect(unseal).not.toHaveBeenCalled()

			// Success control: the row as stored opens again; the integration suite opens every path.
			await write(stored)
			await expect(service.exportMnemonic(id, PASSWORD)).resolves.toHaveLength(24)
			expect(unseal).toHaveBeenCalledOnce()
		},
		60_000,
	)
})

// Purpose AADs stop a ciphertext moving between slots, not between two rows under one password, so
// the pairing check is what refuses another profile's authentic entropy.
describe("the words-to-master pairing check", () => {
	test("every path that opens both slots refuses a row holding another profile's entropy", async () => {
		const { service, id, stored, read, write } = await lockedPasswordProfile()
		const other = await read(await sibling(service))
		await write({ ...stored, entropy: other.entropy })
		for (const [path, call] of PAIRED_PATHS) {
			await expect(call(service, id), path).rejects.toThrow("Profile storage corrupted")
		}
		expect(await read(id)).toStrictEqual({ ...stored, entropy: other.entropy })

		// Success control: the row's own entropy opens again; the integration suite opens every path.
		await write(stored)
		await expect(service.exportMnemonic(id, PASSWORD)).resolves.toHaveLength(24)
	}, 60_000)

	test("a password restore's finalize refuses a restored row holding another profile's entropy", async () => {
		const { service, read, writeTo } = await lockedPasswordProfile()
		const other = await read(await sibling(service))
		const restore = async (fill: number) => {
			const entropy = new Uint8Array(32).fill(fill)
			const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
			const body = {
				type: "password" as const,
				masterKey: asBase64MasterSecret(Buffer.from(master).toString("base64")),
				entropy: Buffer.from(entropy).toString("base64"),
				importedKeysDek: Buffer.from(new Uint8Array(32).fill(0x55)).toString("base64"),
			}
			const out = await service.restore({ id: "ignored", name: "R", type: "password" }, body, PASSWORD)
			if ("restoreError" in out && out.restoreError) throw new Error(String(out.restoreError))
			return out.id
		}
		const tampered = await restore(0x31)
		await writeTo(tampered, { ...(await read(tampered)), entropy: other.entropy })
		await expect(service.finalizeRestore(tampered, PASSWORD)).rejects.toThrow("Profile storage corrupted")
		expect(await service.getActiveProfile()).toBeUndefined()

		// Success control: an untouched restore of another phrase finalizes.
		const untouched = await restore(0x32)
		await expect(service.finalizeRestore(untouched, PASSWORD)).resolves.toMatchObject({ profile: { id: untouched } })
	}, 60_000)
})
