/**
 * A profile chooses its unlock after a phrase import or a backup restore, and changes it later,
 * through the real ProfileService with real crypto: the master, the DEK and the generation stay the
 * profile's, exactly one unlock opens the row before and after, and every refusal leaves the row's
 * bytes as they were. Only storage writes and the session open are wrapped, to fail them.
 */
import { InvalidPasswordError, RetiredProfileError, UnlockMethodChangedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler, getMnemonic } from "@nulo/wallet-core/utils"
import {
	asBase64MasterSecret,
	deriveMasterFromMnemonic,
	EncryptionKey,
	PasskeyCredential,
	type PasskeyCredentialData,
} from "@nulo/wallet-crypto"
import fc from "fast-check"
import { afterEach, describe, expect, test, vi } from "vitest"
import { fakePasskeyAnswer, freshPrfSalt } from "../../../../tests/helpers/fake-passkey"
import { ServiceCollection } from "@/wallet/base"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { svc } from "../composition-harness"
import { ProfileService } from "./service"
import type { SessionManager } from "./session-manager"
import { PROFILE_STORAGE_ROOT, type UnlockCredential } from "./spec"

const PASSWORD = "pass1234"
const NEW_PASSWORD = "newpass99"
const PASSKEY_DID_NOT_OPEN = /Passkey did not open this profile/

afterEach(() => vi.restoreAllMocks())

function fakeConfig(strict: boolean): IConfig {
	const values: Record<string, unknown> = { sessionTtl: 1_800_000, strictSecurityMode: strict, debugMode: false }
	return { onUpdate: new EventHandler<ConfigProp>(), get: ((key: string) => values[key]) as IConfig["get"] }
}

/** Boots a worker; given an `api`, over its store, as a restart does. */
async function boot(opts: { api?: FakeBrowserApi; strict?: boolean } = {}) {
	const api = opts.api ?? new FakeBrowserApi()
	if (!opts.api) api.reset()
	const config = fakeConfig(opts.strict ?? true)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, { materializeCredential: (data: PasskeyCredentialData) => PasskeyCredential.create(data) }))
	const service = new ProfileService(config, new LoggerStore(config), api)
	services.add(service)
	await services.start()
	service.setDeletionDelegate({ snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }), runFor: async () => {} })
	const key = (id: string) => `${PROFILE_STORAGE_ROOT}@${id}`
	const raw = async (id: string) => (await api.storage.local.get(key(id)))[key(id)] as string | undefined
	const row = async (id: string) => JSON.parse((await raw(id)) as string) as Record<string, unknown>
	const write = (id: string, value: Record<string, unknown>) => api.storage.local.set({ [key(id)]: JSON.stringify(value) })
	const internals = service as unknown as {
		sessionManager: SessionManager
		lock: { withLock: <T>(fn: (isCurrent: () => boolean) => Promise<T>) => Promise<T> }
	}
	return { api, service, key, raw, row, write, internals }
}
type Env = Awaited<ReturnType<typeof boot>>

const newAnswer = (credentialId = "cred-new") => fakePasskeyAnswer(credentialId, freshPrfSalt())
const asPasskey = (passkey: PasskeyCredentialData): UnlockCredential => ({ passkey })

/** The words and master of a phrase whose entropy is all `fill`. */
async function phrase(fill: number) {
	const words = await getMnemonic(new Uint8Array(32).fill(fill))
	return { words, master: Buffer.from(await deriveMasterFromMnemonic(words)).toString("base64") }
}

/** A full backup's profile body for the phrase of `fill`. */
async function backupBody(fill: number) {
	const entropy = new Uint8Array(32).fill(fill)
	const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	return {
		type: "password" as const,
		masterKey: asBase64MasterSecret(Buffer.from(master).toString("base64")),
		entropy: Buffer.from(entropy).toString("base64"),
		importedKeysDek: Buffer.from(new Uint8Array(32).fill(0x55)).toString("base64"),
	}
}

/** What opens `id` now: its master and DEK under `credential`. */
async function openedBy(env: Env, id: string, credential: UnlockCredential) {
	const [password, answer] = "password" in credential ? [credential.password, undefined] : [undefined, credential.passkey]
	return {
		master: await env.service.exportPlain(id, password, answer),
		dek: Array.from(await env.service.exportImportedKeysDek(id, password, answer)),
	}
}

describe("a phrase import and a backup restore choose their unlock", () => {
	test("a phrase imported with a passkey holds the master the same phrase gets with a password", async () => {
		const env = await boot()
		const { words, master } = await phrase(0x31)
		const answer = await newAnswer()
		const info = await env.service.importMnemonic("PK", words, undefined, false, answer)
		expect(info.type).toBe("passkey")
		const stored = await env.row(info.id)
		expect([stored.credentialId, stored.prfSalt]).toEqual([answer.id, answer.prfSalt])
		expect((await env.service.getActiveProfile())?.id).toBe(info.id)
		expect(await env.service.exportPlain(info.id, undefined, answer)).toBe(master)
		await expect(env.service.exportPlain(info.id, PASSWORD)).rejects.toThrow()

		const other = await boot()
		const withPassword = await other.service.importMnemonic("PW", words, PASSWORD)
		expect(await other.service.exportPlain(withPassword.id, PASSWORD)).toBe(master)
	}, 30_000)

	test("an import whose answer was evaluated at another profile's input writes nothing", async () => {
		const env = await boot()
		const first = await newAnswer("cred-shared")
		await env.service.createPasskeyProfile("A", first)
		const before = await env.api.storage.local.get(null)
		const { words } = await phrase(0x32)
		await expect(
			env.service.importMnemonic("B", words, undefined, false, await fakePasskeyAnswer("cred-shared", first.prfSalt)),
		).rejects.toThrow(/already belongs to another profile/)
		expect(await env.api.storage.local.get(null)).toStrictEqual(before)
	}, 30_000)

	test("a backup restored with a passkey opens under that answer and finalizes only with it", async () => {
		const env = await boot()
		const body = await backupBody(0x41)
		const answer = await newAnswer()
		const restored = await env.service.restore({ id: "ignored", name: "R", type: "password" }, body, undefined, false, answer)
		if ("restoreError" in restored && restored.restoreError) throw new Error(String(restored.restoreError))
		expect((await env.row(restored.id)).type).toBe("passkey")
		await expect(env.service.finalizeRestore(restored.id, PASSWORD)).rejects.toThrow(/Profile type changed/)
		await expect(env.service.finalizeRestore(restored.id, undefined, await newAnswer())).rejects.toThrow(PASSKEY_DID_NOT_OPEN)
		const finalized = await env.service.finalizeRestore(restored.id, undefined, answer)
		expect(finalized.profile.type).toBe("passkey")
		expect(await env.service.exportPlain(restored.id, undefined, answer)).toBe(body.masterKey)
	}, 30_000)

	test("a restore with neither a password nor an answer is refused before it writes", async () => {
		const env = await boot()
		const before = await env.api.storage.local.get(null)
		await expect(env.service.restore({ id: "ignored", name: "R", type: "password" }, await backupBody(0x42))).rejects.toThrow(
			/Password is required/,
		)
		expect(await env.api.storage.local.get(null)).toStrictEqual(before)
	})
})

describe("changeUnlockMethod", () => {
	async function passwordProfile(env: Env) {
		return (await env.service.createProfile("P", PASSWORD)).id
	}
	async function passkeyProfile(env: Env) {
		const answer = await newAnswer("cred-old")
		return { id: (await env.service.createPasskeyProfile("K", answer)).id, answer }
	}

	test.each([
		["a password profile moves to a passkey", "password"],
		["a passkey profile moves to a password", "passkey"],
		["a passkey profile moves to a new passkey", "passkey→passkey"],
	] as const)(
		"%s, keeping its master, DEK, generation and session",
		async (_, from) => {
			const env = await boot()
			const { id, current } =
				from === "password"
					? { id: await passwordProfile(env), current: { password: PASSWORD } as UnlockCredential }
					: await passkeyProfile(env).then(({ id, answer }) => ({ id, current: asPasskey(answer) }))
			const next: UnlockCredential = from === "passkey" ? { password: NEW_PASSWORD } : asPasskey(await newAnswer())
			const before = await env.row(id)
			const opened = await openedBy(env, id, current)
			const serial = env.internals.sessionManager.peekLiveSerial()

			const info = await env.service.changeUnlockMethod(id, current, next)

			const after = await env.row(id)
			expect(info.type).toBe("password" in next ? "password" : "passkey")
			expect(after.type).toBe(info.type)
			for (const kept of ["id", "name", "pxeGeneration", "walletFingerprint"]) expect(after[kept]).toBe(before[kept])
			if ("password" in next) expect(Object.keys(after)).not.toEqual(expect.arrayContaining(["credentialId"]))
			if ("password" in next) expect("prfSalt" in after).toBe(false)
			expect(await openedBy(env, id, next)).toEqual(opened)
			await expect(openedBy(env, id, current)).rejects.toThrow()
			const active = await env.service.getActiveProfile()
			expect(active?.type).toBe(info.type)
			expect(env.internals.sessionManager.peekLiveSerial()).not.toBe(serial)
			expect(Array.from((await env.service.getProfileDek(id)) ?? [])).toEqual(opened.dek)
		},
		60_000,
	)

	describe("refusals leave the row's bytes as they were", () => {
		type Arrange = (env: Env) => Promise<{ id: string; current: UnlockCredential; next: UnlockCredential }>
		const fromPassword: Arrange = async (env) => ({
			id: await passwordProfile(env),
			current: { password: PASSWORD },
			next: asPasskey(await newAnswer()),
		})
		test.each<[string, Arrange, RegExp | (new (...args: never[]) => Error)]>([
			[
				"a wrong current password",
				async (env) => ({ ...(await fromPassword(env)), current: { password: "wrong-pass" } }),
				InvalidPasswordError,
			],
			[
				"a passkey answer for another input",
				async (env) => {
					const { id } = await passkeyProfile(env)
					return { id, current: asPasskey(await fakePasskeyAnswer("cred-old", freshPrfSalt())), next: { password: NEW_PASSWORD } }
				},
				PASSKEY_DID_NOT_OPEN,
			],
			[
				"another passkey's answer",
				async (env) => {
					const { id, answer } = await passkeyProfile(env)
					return {
						id,
						current: asPasskey(await fakePasskeyAnswer("cred-other", answer.prfSalt)),
						next: { password: NEW_PASSWORD },
					}
				},
				PASSKEY_DID_NOT_OPEN,
			],
			[
				"a password where the row takes a passkey",
				async (env) => ({ id: (await passkeyProfile(env)).id, current: { password: PASSWORD }, next: { password: NEW_PASSWORD } }),
				InvalidPasswordError,
			],
			[
				"a new password under 8 characters",
				async (env) => {
					const { id, answer } = await passkeyProfile(env)
					return { id, current: asPasskey(answer), next: { password: "short" } }
				},
				/at least 8 characters/,
			],
			[
				"a password to a password",
				async (env) => ({ ...(await fromPassword(env)), next: { password: NEW_PASSWORD } }),
				/changes its password/,
			],
			[
				"a new passkey at an input another profile opens under",
				async (env) => {
					const taken = await fakePasskeyAnswer("cred-b", freshPrfSalt())
					await env.service.createPasskeyProfile("B", taken)
					const arranged = await fromPassword(env)
					await env.service.unlockProfile(arranged.id, PASSWORD)
					return { ...arranged, next: asPasskey(await fakePasskeyAnswer("cred-a", taken.prfSalt)) }
				},
				/already belongs to another profile/,
			],
			[
				"a degraded row: its DEK slot does not open",
				async (env) => {
					const arranged = await fromPassword(env)
					await env.write(arranged.id, { ...(await env.row(arranged.id)), dekSealed: "AAAA" })
					return arranged
				},
				/Imported-keys key unrecoverable/,
			],
			[
				"a degraded row: its MAC does not cover the DEK slot",
				async (env) => {
					const arranged = await fromPassword(env)
					await env.write(arranged.id, { ...(await env.row(arranged.id)), envelopeMac: Buffer.alloc(32, 7).toString("base64") })
					return arranged
				},
				/before changing the unlock method/,
			],
			[
				"a row whose words do not derive its master",
				async (env) => {
					const arranged = await fromPassword(env)
					const sibling = (await env.service.createProfile("Q", PASSWORD)).id
					await env.write(arranged.id, { ...(await env.row(arranged.id)), entropy: (await env.row(sibling)).entropy })
					return arranged
				},
				/Profile storage corrupted/,
			],
			[
				"a retired row",
				async (env) => {
					const arranged = await fromPassword(env)
					const { guard: _g, secret: _s, entropy: _e, envelopeMac: _m, ...rest } = await env.row(arranged.id)
					await env.write(arranged.id, { ...rest, type: "passkey", credentialId: "Y3JlZA==" })
					return arranged
				},
				RetiredProfileError,
			],
			[
				"an unreadable row",
				async (env) => {
					const arranged = await fromPassword(env)
					const { guard: _g, ...rest } = await env.row(arranged.id)
					await env.write(arranged.id, rest)
					return arranged
				},
				/Profile storage corrupted/,
			],
		])(
			"%s",
			async (_, arrange, refusal) => {
				const env = await boot()
				const { id, current, next } = await arrange(env)
				const before = await env.raw(id)
				const activeBefore = await env.service.getActiveProfile()
				await expect(env.service.changeUnlockMethod(id, current, next)).rejects.toThrow(refusal as never)
				expect(await env.raw(id)).toBe(before)
				expect((await env.service.getActiveProfile())?.id).toBe(activeBefore?.id)
			},
			60_000,
		)

		test("a row changed during the unlocked derivation", async () => {
			const env = await boot()
			const { id, current, next } = await fromPassword(env)
			const derive = EncryptionKey.getPasshash.bind(EncryptionKey)
			vi.spyOn(EncryptionKey, "getPasshash").mockImplementationOnce(async (password) => {
				await env.service.changeProfileName(id, "Renamed")
				return derive(password)
			})
			const before = await env.row(id)
			await expect(env.service.changeUnlockMethod(id, current, next)).rejects.toThrow(/Invalid profile id/)
			expect(await env.row(id)).toStrictEqual({ ...before, name: "Renamed" })
		}, 30_000)

		test("a row deleted during the unlocked derivation stays deleted", async () => {
			const env = await boot()
			const { id, current, next } = await fromPassword(env)
			const derive = EncryptionKey.getPasshash.bind(EncryptionKey)
			vi.spyOn(EncryptionKey, "getPasshash").mockImplementationOnce(async (password) => {
				await env.service.deleteProfile(id)
				return derive(password)
			})
			await expect(env.service.changeUnlockMethod(id, current, next)).rejects.toThrow(/Invalid profile id/)
			expect(await env.raw(id)).toBeUndefined()
		}, 30_000)

		test("a commit that lost the lock to its watchdog", async () => {
			const env = await boot()
			const { id, current, next } = await fromPassword(env)
			const withLock = env.internals.lock.withLock.bind(env.internals.lock)
			let calls = 0
			vi.spyOn(env.internals.lock, "withLock").mockImplementation((fn) =>
				withLock((isCurrent) => fn(++calls === 2 ? () => false : isCurrent)),
			)
			const before = await env.raw(id)
			await expect(env.service.changeUnlockMethod(id, current, next)).rejects.toThrow(/Invalid profile id/)
			expect(calls).toBe(2)
			expect(await env.raw(id)).toBe(before)
		}, 30_000)

		test("a write that rejects with nothing stored rethrows and keeps the session", async () => {
			const env = await boot()
			const { id, current, next } = await fromPassword(env)
			const before = await env.raw(id)
			const set = env.api.storage.local.set.bind(env.api.storage.local)
			vi.spyOn(env.api.storage.local, "set").mockImplementation(async (items) => {
				if (env.key(id) in items) throw new Error("quota")
				return set(items)
			})
			await expect(env.service.changeUnlockMethod(id, current, next)).rejects.toThrow(/^quota$/)
			expect(await env.raw(id)).toBe(before)
			expect((await env.service.getActiveProfile())?.type).toBe("password")
		}, 30_000)
	})

	describe("after the write, a failure is a changed method", () => {
		test("a write that rejects after it stored is a change made", async () => {
			const env = await boot()
			const id = await passwordProfile(env)
			const next = asPasskey(await newAnswer())
			const set = env.api.storage.local.set.bind(env.api.storage.local)
			vi.spyOn(env.api.storage.local, "set").mockImplementation(async (items) => {
				await set(items)
				if (env.key(id) in items) throw new Error("reply lost")
			})
			expect((await env.service.changeUnlockMethod(id, { password: PASSWORD }, next)).type).toBe("passkey")
			expect((await env.service.getActiveProfile())?.type).toBe("passkey")
		}, 30_000)

		test("a write whose outcome cannot be read back closes the session and reports the change", async () => {
			const env = await boot()
			const id = await passwordProfile(env)
			const local = env.api.storage.local
			const [set, get] = [local.set.bind(local), local.get.bind(local)]
			let failed = false
			vi.spyOn(local, "set").mockImplementation(async (items) => {
				if (env.key(id) in items && !failed) {
					failed = true
					throw new Error("quota")
				}
				return set(items)
			})
			vi.spyOn(local, "get").mockImplementation(async (keys) => {
				if (failed && keys === env.key(id)) throw new Error("read failed")
				return get(keys as never)
			})
			await expect(env.service.changeUnlockMethod(id, { password: PASSWORD }, asPasskey(await newAnswer()))).rejects.toBeInstanceOf(
				UnlockMethodChangedError,
			)
			expect(await env.service.getActiveProfile()).toBeUndefined()
		}, 30_000)

		test("a session that does not reopen is closed, and the new unlock opens the row", async () => {
			const env = await boot()
			const id = await passwordProfile(env)
			const next = await newAnswer()
			vi.spyOn(env.internals.sessionManager, "open").mockResolvedValueOnce(undefined)
			await expect(env.service.changeUnlockMethod(id, { password: PASSWORD }, asPasskey(next))).rejects.toBeInstanceOf(
				UnlockMethodChangedError,
			)
			expect(await env.service.getActiveProfile()).toBeUndefined()
			expect((await env.service.unlockPasskeyProfile(id, next)).type).toBe("passkey")
		}, 30_000)
	})
})

describe("verifyProfilePassword", () => {
	test("answers the profile's own password, refuses another, and opens nothing", async () => {
		const env = await boot()
		const { id } = await env.service.createProfile("P", PASSWORD)
		const serial = env.internals.sessionManager.peekLiveSerial()
		await expect(env.service.verifyProfilePassword(id, PASSWORD)).resolves.toBeUndefined()
		await expect(env.service.verifyProfilePassword(id, "wrong-pass")).rejects.toBeInstanceOf(InvalidPasswordError)
		expect(env.internals.sessionManager.peekLiveSerial()).toBe(serial)
	}, 30_000)

	test("a damaged pairing is not a wrong password, and a passkey row has no password", async () => {
		const env = await boot()
		const { id } = await env.service.createProfile("P", PASSWORD)
		const sibling = (await env.service.createProfile("Q", PASSWORD)).id
		await env.write(id, { ...(await env.row(id)), entropy: (await env.row(sibling)).entropy })
		await expect(env.service.verifyProfilePassword(id, PASSWORD)).rejects.toThrow(/Profile storage corrupted/)
		const passkey = await env.service.createPasskeyProfile("K", await newAnswer())
		await expect(env.service.verifyProfilePassword(passkey.id, PASSWORD)).rejects.toThrow(/does not unlock with a password/)
	}, 30_000)
})

describe("the session bearer of a passkey profile", () => {
	test("restores after a restart, and never once strict mode is on", async () => {
		const lenient = await boot({ strict: false })
		const answer = await newAnswer()
		const { id } = await lenient.service.createPasskeyProfile("K", answer)
		expect((await (await boot({ api: lenient.api, strict: false })).service.getActiveProfile())?.id).toBe(id)
		expect(await (await boot({ api: lenient.api, strict: true })).service.getActiveProfile()).toBeUndefined()
	}, 30_000)

	test("a row an unlock cannot open restores no session", async () => {
		const env = await boot({ strict: false })
		const { id } = await env.service.createPasskeyProfile("K", await newAnswer())
		const { guard: _g, secret: _s, entropy: _e, envelopeMac: _m, prfSalt: _p, ...retired } = await env.row(id)
		await env.write(id, retired)
		expect(await (await boot({ api: env.api, strict: false })).service.getActiveProfile()).toBeUndefined()
	}, 30_000)
})

describe("generated inputs", () => {
	/** Every field a row may carry, and a damaged value for it. */
	const damage = fc.constantFrom(
		"guard",
		"secret",
		"entropy",
		"dekSealed",
		"envelopeMac",
		"walletFingerprint",
		"credentialId",
		"prfSalt",
		"type",
		"name",
	)
	const flip = (value: unknown) =>
		typeof value === "string" && value.length > 4 ? `${value.slice(0, 2)}${value[2] === "A" ? "B" : "A"}${value.slice(3)}` : "x"

	test("a change converts only a row an unlock opens; any other row is refused byte for byte", async () => {
		const env = await boot()
		const password = (await env.service.createProfile("P", PASSWORD)).id
		const answer = await newAnswer("cred-k")
		const passkey = (await env.service.createPasskeyProfile("K", answer)).id
		const pristine = { [password]: await env.row(password), [passkey]: await env.row(passkey) }
		const masters = {
			[password]: await env.service.exportPlain(password, PASSWORD),
			[passkey]: await env.service.exportPlain(passkey, undefined, answer),
		}
		const MAC_BOUND = new Set([
			"guard",
			"secret",
			"entropy",
			"dekSealed",
			"envelopeMac",
			"walletFingerprint",
			"credentialId",
			"prfSalt",
			"type",
		])

		const damaged = (row: Record<string, unknown>, field: string | undefined) =>
			field && field in row ? { ...row, [field]: flip(row[field]) } : row
		const opens = (row: Record<string, unknown>, field: string | undefined) => !(field && field in row && MAC_BOUND.has(field))

		/** The row the case changes, the unlock that opens it, and the one it moves to. */
		const caseOf = async (onPasskey: boolean, toNewPasskey: boolean) => {
			if (!onPasskey) return { id: password, current: { password: PASSWORD }, next: asPasskey(await newAnswer("cred-n")) }
			const next = toNewPasskey ? asPasskey(await newAnswer("cred-n")) : { password: NEW_PASSWORD }
			return { id: passkey, current: asPasskey(answer), next }
		}
		const run = async (onPasskey: boolean, field: string | undefined, toNewPasskey: boolean) => {
			const { id, current, next } = await caseOf(onPasskey, toNewPasskey)
			await env.write(id, damaged(pristine[id], field))
			const before = await env.raw(id)
			const changed = await env.service.changeUnlockMethod(id, current, next).then(
				() => true,
				() => false,
			)
			expect(changed).toBe(opens(pristine[id], field))
			// A refused row keeps its bytes; a changed one opens under the new unlock to its own master.
			if (changed) expect((await openedBy(env, id, next)).master).toBe(masters[id])
			else expect(await env.raw(id)).toBe(before)
			await env.write(id, pristine[id])
		}

		await fc.assert(fc.asyncProperty(fc.boolean(), fc.option(damage, { nil: undefined }), fc.boolean(), run), { numRuns: 14 })
	}, 180_000)

	test("two profiles on one passkey keep their own inputs and open only their own master through any changes", async () => {
		const env = await boot()
		const a0 = await fakePasskeyAnswer("cred-shared", freshPrfSalt())
		const b0 = await fakePasskeyAnswer("cred-shared", freshPrfSalt())
		const a = (await env.service.createPasskeyProfile("A", a0)).id
		const b = (await env.service.createPasskeyProfile("B", b0)).id
		const masters = { [a]: await env.service.exportPlain(a, undefined, a0), [b]: await env.service.exportPlain(b, undefined, b0) }
		const pristine = { [a]: await env.row(a), [b]: await env.row(b) }

		await fc.assert(
			fc.asyncProperty(fc.array(fc.constantFrom(a, b), { minLength: 1, maxLength: 3 }), async (steps) => {
				const held: Record<string, UnlockCredential> = { [a]: asPasskey(a0), [b]: asPasskey(b0) }
				for (const id of steps) {
					const next: UnlockCredential =
						"passkey" in held[id]
							? { password: NEW_PASSWORD }
							: asPasskey(await fakePasskeyAnswer("cred-shared", freshPrfSalt()))
					await env.service.changeUnlockMethod(id, held[id], next)
					held[id] = next
				}
				const salts = [await env.row(a), await env.row(b)].map((row) => row.prfSalt).filter(Boolean)
				expect(new Set(salts).size).toBe(salts.length)
				for (const [own, other] of [
					[a, b],
					[b, a],
				]) {
					expect((await openedBy(env, own, held[own])).master).toBe(masters[own])
					if ("passkey" in held[other])
						await expect(
							env.service.exportPlain(own, undefined, (held[other] as { passkey: PasskeyCredentialData }).passkey),
						).rejects.toThrow()
				}
				await env.write(a, pristine[a])
				await env.write(b, pristine[b])
			}),
			{ numRuns: 6 },
		)
	}, 240_000)
})
