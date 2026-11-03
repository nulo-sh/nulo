import { deferred, getMnemonic } from "@nulo/wallet-core/utils"
import {
	computeWalletFingerprint,
	deriveMasterFromMnemonic,
	EncryptionKey,
	generateImportedKeysDek,
	PasswordSecretBox,
} from "@nulo/wallet-crypto"
import { afterEach, expect, test, vi } from "vitest"
import { type OpenedSlots, ProfileSecretCodec } from "./profile-secret-codec"
import { newPasswordRow } from "./profile-row"

const PASSWORD = "pass1234"

afterEach(() => vi.restoreAllMocks())

const allZero = (bytes: Uint8Array | ArrayBuffer) => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).every((b) => b === 0)

test("the slots stay intact while the body runs and are zero once it settles, a rejection included", async () => {
	const codec = new ProfileSecretCodec(new PasswordSecretBox())
	const entropy = crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>
	const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	const dek = generateImportedKeysDek()
	const sealed = await codec.sealUnder({ passhash: await EncryptionKey.getPasshash(PASSWORD) }, master, entropy, dek)
	const walletFingerprint = await computeWalletFingerprint(master)
	const row = await newPasswordRow(
		{ id: "p", name: "P", slots: sealed.slots, dekSealed: sealed.dekSealed, walletFingerprint },
		master,
		dek,
	)
	const passhashOf = EncryptionKey.getPasshash.bind(EncryptionKey)
	const passhashes: ArrayBuffer[] = []
	vi.spyOn(EncryptionKey, "getPasshash").mockImplementation(async (password) => {
		const passhash = await passhashOf(password)
		passhashes.push(passhash)
		return passhash
	})
	const key = { password: PASSWORD }
	const wrongKey = new Error("wrong key")
	const refusal = () => wrongKey

	const entered = deferred<OpenedSlots>()
	const release = deferred()
	const refused = new Error("body refused")
	const run = codec.withOpenedSlots(row, key, refusal, async (opened) => {
		entered.resolve(opened)
		await release.promise
		throw refused
	})
	const opened = await entered.promise
	const held = [opened.secret, opened.entropy, passhashes[0]]
	expect(held.map(allZero)).toStrictEqual([false, false, false])
	release.resolve()
	await expect(run).rejects.toBe(refused)
	expect(held.map(allZero)).toStrictEqual([true, true, true])

	// Success control.
	let kept: Uint8Array[] = []
	const words = await codec.withOpenedSlots(row, key, refusal, async (o) => {
		kept = [o.secret, o.entropy]
		return getMnemonic(o.entropy)
	})
	expect(words).toStrictEqual(await getMnemonic(entropy))
	expect([...kept, passhashes[1]].map(allZero)).toStrictEqual([true, true, true])

	const body = vi.fn(async () => "never")
	await expect(codec.withOpenedSlots(row, { password: "wrong-pass1" }, refusal, body)).rejects.toBe(wrongKey)
	expect(body).not.toHaveBeenCalled()
}, 60_000)
