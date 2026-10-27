/**
 * Every password path opens a row's slots through one opener that classifies the row first: a row
 * that is not a password row reaches no decryptor, whatever its `type` field or slots claim. Every
 * path that opens both slots then checks the stored words still derive the stored master.
 */
import { InvalidPasswordError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { getMnemonic } from "@nulo/wallet-core/utils"
import { asBase64MasterSecret, deriveMasterFromMnemonic, EncryptionKey, PasswordSecretBox } from "@nulo/wallet-crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { svc } from "../composition-harness"
import { ProfileService } from "./service"
import { PROFILE_STORAGE_ROOT } from "./spec"

const PASSWORD = "pass1234"
const NEW_PASSWORD = "newpass99"

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

/** Restores a password profile from the backup body of a phrase whose entropy is all `fill`. */
async function restored(service: ProfileService, fill: number) {
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

const settled = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(e: unknown) => e,
	)
// A passhash is a raw ArrayBuffer.
const allZero = (bytes: Uint8Array | ArrayBuffer) => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).every((b) => b === 0)

type Path = (s: ProfileService, id: string, password?: string) => Promise<unknown>

/** Each password path, with the refusal it gives when the opener returns nothing. */
const PATHS: [string, Path, (e: unknown) => void][] = [
	["unlockProfile", (s, id, pw = PASSWORD) => s.unlockProfile(id, pw), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	[
		"exportPlain",
		(s, id, pw = PASSWORD) => s.exportPlain(id, pw),
		(e) => expect(e).toMatchObject({ message: InvalidPasswordError.LEGACY_MESSAGE }),
	],
	["openBackupTransfer", (s, id, pw = PASSWORD) => s.openBackupTransfer(id, pw), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	[
		"exportImportedKeysDek",
		(s, id, pw = PASSWORD) => s.exportImportedKeysDek(id, pw),
		(e) => expect(e).toBeInstanceOf(InvalidPasswordError),
	],
	[
		"exportMnemonic",
		(s, id, pw = PASSWORD) => s.exportMnemonic(id, pw),
		(e) => expect(e).toMatchObject({ message: "Invalid profile old password" }),
	],
	// Last: its success moves the profile to the new password.
	[
		"changeProfilePassword",
		(s, id, pw = PASSWORD) => s.changeProfilePassword(id, pw, NEW_PASSWORD),
		(e) => expect(e).toMatchObject({ message: "Invalid profile old password" }),
	],
]

/** Each path that opens both the master and the entropy slot. */
const PAIRED_PATHS: [string, (s: ProfileService, id: string) => Promise<unknown>][] = [
	["unlockProfile", (s, id) => s.unlockProfile(id, PASSWORD)],
	["exportPlain", (s, id) => s.exportPlain(id, PASSWORD)],
	["openBackupTransfer", (s, id) => s.openBackupTransfer(id, PASSWORD)],
	["exportMnemonic", (s, id) => s.exportMnemonic(id, PASSWORD)],
	["changeProfilePassword", (s, id) => s.changeProfilePassword(id, PASSWORD, NEW_PASSWORD)],
]

describe("the password slot opener", () => {
	test.each<[string, (row: Record<string, unknown>) => Record<string, unknown>]>([
		["a row typed as neither unlock, its slots intact", (row) => ({ ...row, type: "bogus" })],
		["a password row missing its entropy slot", ({ entropy: _e, ...rest }) => rest],
		["a password row whose guard is not a string", (row) => ({ ...row, guard: 7 })],
	])(
		"%s reaches no decryptor on any password path",
		async (_label, damage) => {
			const { service, id, stored, read, write, writeTo } = await lockedPasswordProfile()
			const restoring = await restored(service, 0x31)
			await write(damage(stored))
			await writeTo(restoring, damage(await read(restoring)))
			// Every slot and DEK frame a password opens is an `EncryptionKey` frame.
			const decrypt = vi.spyOn(EncryptionKey.prototype, "decrypt")
			for (const [path, call, refused] of PATHS) {
				const error = await settled(call(service, id))
				expect(error, path).toBeDefined()
				refused(error)
			}
			expect(await settled(service.finalizeRestore(restoring, PASSWORD)), "finalizeRestore").toBeInstanceOf(Error)
			expect(decrypt).not.toHaveBeenCalled()

			// Success control: the row as stored opens its three slots again; the integration suite
			// opens every path.
			await write(stored)
			await expect(service.exportMnemonic(id, PASSWORD)).resolves.toHaveLength(24)
			expect(decrypt).toHaveBeenCalledTimes(3)
		},
		60_000,
	)
})

describe("an empty password", () => {
	test("gets each password path's own wrong-password refusal; exportPlain asks for a password", async () => {
		const { service, id } = await lockedPasswordProfile()
		for (const [path, call, refused] of PATHS) {
			const error = await settled(call(service, id, ""))
			expect(error, path).toBeDefined()
			if (path === "exportPlain") expect(error).toMatchObject({ message: "Password is required" })
			else refused(error)
		}
		// Success control: the profile's own password still opens.
		await expect(service.exportMnemonic(id, PASSWORD)).resolves.toHaveLength(24)
	}, 60_000)
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

describe("the opener's buffers", () => {
	test("the passhash, master and entropy it opens are zero once each path returns, refused or not", async () => {
		const { service, id } = await lockedPasswordProfile()
		const passhashOf = EncryptionKey.getPasshash.bind(EncryptionKey)
		const unsealWith = PasswordSecretBox.prototype.unsealWithPasshash
		const held: (Uint8Array | ArrayBuffer)[] = []
		// A password change also derives the new password's passhash, which its seal owns.
		vi.spyOn(EncryptionKey, "getPasshash").mockImplementation(async (password) => {
			const passhash = await passhashOf(password)
			if (password !== NEW_PASSWORD) held.push(passhash)
			return passhash
		})
		vi.spyOn(PasswordSecretBox.prototype, "unsealWithPasshash").mockImplementation(async function (this: PasswordSecretBox, ...args) {
			const opened = await unsealWith.apply(this, args)
			if (opened) held.push(opened.secret, opened.entropy)
			return opened
		})
		for (const [path, call] of PATHS) {
			for (const password of ["wrong-pass1", PASSWORD]) {
				held.length = 0
				const error = await settled(call(service, id, password))
				expect(error === undefined, `${path} ${password}`).toBe(password === PASSWORD)
				await service.lockActiveProfile()
				// A passhash on every path; the master and entropy too on success.
				expect(held.length, `${path} ${password}`).toBeGreaterThanOrEqual(password === PASSWORD ? 3 : 1)
				expect(held.map(allZero), `${path} ${password}`).toStrictEqual(held.map(() => true))
			}
		}
	}, 120_000)
})
