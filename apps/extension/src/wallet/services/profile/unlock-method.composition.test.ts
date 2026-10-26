/**
 * Composition test: the REAL ProfileService (real PBKDF2, HKDF and AES-GCM) and ContactService over
 * one `FakeBrowserApi`, the passkey service stubbed to materialize the answer it is handed. A second
 * boot over the same storage stands for a restarted worker. What a profile chooses or changes as its
 * unlock never touches what it sealed: a contact written under one unlock reads back under the next,
 * and only under it. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler, getMnemonic } from "@nulo/wallet-core/utils"
import { asBase64MasterSecret, deriveMasterFromMnemonic, PasskeyCredential, type PasskeyCredentialData } from "@nulo/wallet-crypto"
import { describe, expect, test } from "vitest"
import { fakePasskeyAnswer, freshPrfSalt } from "../../../../tests/helpers/fake-passkey"
import { ServiceCollection } from "@/wallet/base"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { ProfileService } from "./service"
import type { UnlockCredential } from "./spec"

const PW = "pass1234"
const NEW_PW = "newpass99"
const ADDR = `0x${"ab".repeat(32)}`

function fakeConfig(strict: boolean): IConfig {
	const values: Record<string, unknown> = { sessionTtl: 1_800_000, strictSecurityMode: strict, debugMode: false }
	return { onUpdate: new EventHandler<ConfigProp>(), get: ((key: string) => values[key]) as IConfig["get"] }
}

/** One worker over `api`. */
async function boot(api: FakeBrowserApi, strict = true) {
	const config = fakeConfig(strict)
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, { materializeCredential: (data: PasskeyCredentialData) => PasskeyCredential.create(data) }))
	const profiles = new ProfileService(config, logger, api)
	const contacts = new ContactService(logger, api)
	services.add(profiles)
	services.add(contacts)
	await services.start()
	profiles.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
	return { profiles, contacts }
}
type Worker = Awaited<ReturnType<typeof boot>>

function freshApi(): FakeBrowserApi {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

const answer = async (credentialId: string) => fakePasskeyAnswer(credentialId, freshPrfSalt())
const names = async (worker: Worker) => (await worker.contacts.getContacts()).map(({ name }) => name)
const unlockWith = (worker: Worker, id: string, credential: UnlockCredential) =>
	"password" in credential
		? worker.profiles.unlockProfile(id, credential.password)
		: worker.profiles.unlockPasskeyProfile(id, credential.passkey)

/** Every stored contact row, as stored. */
const contactRows = async (api: FakeBrowserApi) =>
	Object.entries(await api.storage.local.get()).filter(([key]) => key.startsWith("nulo:core:contacts@"))

/** No stored contact row holds a name in the clear. */
async function nothingInTheClear(api: FakeBrowserApi, name: string): Promise<void> {
	const stored = await contactRows(api)
	expect(stored.length).toBeGreaterThan(0)
	expect(JSON.stringify(stored)).not.toContain(name)
}

/** A full backup's profile body for a fixed phrase. */
async function backupBody() {
	const entropy = new Uint8Array(32).fill(23)
	const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	return {
		type: "password" as const,
		masterKey: asBase64MasterSecret(Buffer.from(master).toString("base64")),
		entropy: Buffer.from(entropy).toString("base64"),
		importedKeysDek: Buffer.from(new Uint8Array(32).fill(0x66)).toString("base64"),
	}
}

describe("the unlock a profile chooses or changes — the real service graph", () => {
	test("a phrase imported under a passkey seals its contacts, which a restarted worker opens with that passkey only", async () => {
		const api = freshApi()
		const first = await boot(api)
		const words = await getMnemonic(new Uint8Array(32).fill(41))
		const passkey = await answer("cred-import")
		const { id } = await first.profiles.importMnemonic("PK", words, undefined, false, passkey)
		await first.contacts.addContact("Alice", ADDR)
		await nothingInTheClear(api, "Alice")

		const restarted = await boot(api)
		await expect(restarted.profiles.unlockPasskeyProfile(id, await fakePasskeyAnswer("cred-import", freshPrfSalt()))).rejects.toThrow()
		await restarted.profiles.unlockPasskeyProfile(id, passkey)
		expect(await names(restarted)).toEqual(["Alice"])
	}, 60_000)

	test("a backup restored under a passkey reads the contacts its restore wrote, after a restart too", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const passkey = await answer("cred-restore")
		const out = await worker.profiles.restore(
			{ id: "abc12345", name: "R", type: "password" },
			await backupBody(),
			undefined,
			false,
			passkey,
		)
		await worker.contacts.restore([{ id: "c-1", profileId: out.id, name: "Alice", address: ADDR, abbr: "A" }])
		await worker.profiles.finalizeRestore(out.id, undefined, passkey)
		expect(await names(worker)).toEqual(["Alice"])

		const restarted = await boot(api)
		await restarted.profiles.unlockPasskeyProfile(out.id, passkey)
		expect(await names(restarted)).toEqual(["Alice"])
	}, 60_000)

	test.each([
		["a password profile to a passkey", "password", "passkey"],
		["a passkey profile to a password", "passkey", "password"],
		["a passkey profile to a new passkey", "passkey", "passkey"],
	] as const)(
		"%s keeps the row keys: the contact sealed before reads after, and after a restart under the new unlock only",
		async (_, from, to) => {
			const api = freshApi()
			const worker = await boot(api)
			const current: UnlockCredential = from === "password" ? { password: PW } : { passkey: await answer("cred-old") }
			const next: UnlockCredential = to === "password" ? { password: NEW_PW } : { passkey: await answer("cred-new") }
			const { id } =
				"password" in current
					? await worker.profiles.createProfile("P", current.password)
					: await worker.profiles.createPasskeyProfile("P", current.passkey)
			await worker.contacts.addContact("Alice", ADDR)
			const sealedBefore = await contactRows(api)

			await worker.profiles.changeUnlockMethod(id, current, next)
			expect(await names(worker)).toEqual(["Alice"])
			expect(await contactRows(api)).toEqual(sealedBefore)

			const restarted = await boot(api)
			await expect(unlockWith(restarted, id, current)).rejects.toThrow()
			await unlockWith(restarted, id, next)
			expect(await names(restarted)).toEqual(["Alice"])
			await nothingInTheClear(api, "Alice")
		},
		90_000,
	)

	test("a profile deleted while its prompt was open stays deleted, and the change writes nothing", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const { id } = await worker.profiles.createProfile("P", PW)
		await worker.contacts.addContact("Alice", ADDR)
		const next = await answer("cred-late")
		await worker.profiles.deleteProfile(id)
		const after = JSON.stringify(await api.storage.local.get())

		await expect(worker.profiles.changeUnlockMethod(id, { password: PW }, { passkey: next })).rejects.toThrow()
		expect(JSON.stringify(await api.storage.local.get())).toBe(after)
	}, 60_000)

	test("with strict mode off a passkey profile's session survives a restart and reads its contacts; with it on, none does", async () => {
		const api = freshApi()
		const first = await boot(api, false)
		const passkey = await answer("cred-bearer")
		const { id } = await first.profiles.createPasskeyProfile("PK", passkey)
		await first.contacts.addContact("Alice", ADDR)

		const lenient = await boot(api, false)
		expect((await lenient.profiles.getActiveProfile())?.id).toBe(id)
		expect(await names(lenient)).toEqual(["Alice"])

		const strict = await boot(api, true)
		expect(await strict.profiles.getActiveProfile()).toBeUndefined()
		expect(strict.profiles.rowKeys(id)).toBeUndefined()
	}, 60_000)
})
