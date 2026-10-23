/**
 * Composition test: the REAL ProfileService (real PBKDF2, HKDF and AES-GCM), ContactService,
 * DappSessionService and ProfileDeletionCoordinator over one `FakeBrowserApi`, with stubs for the
 * services the deletion drives that hold no sealed root and a dumb PXE client. A second boot over
 * the same storage stands for a restarted worker: strict mode keeps no session across it, so it
 * holds no row keys until an unlock. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler, getMnemonic } from "@nulo/wallet-core/utils"
import { asBase64MasterSecret, deriveMasterFromMnemonic, openRow } from "@nulo/wallet-crypto"
import { ServiceCollection } from "@/wallet/base"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { AccessLevel } from "@/wallet/services/dapp-session/spec"
import { ProfileDeletionCoordinator } from "@/wallet/services/profile-deletion/coordinator"
import { ProfileService } from "@/wallet/services/profile/service"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import { AUTH_REGISTRY_SERVICE_NAME } from "@/wallet/services/auth-registry/spec"
import { FPC_SERVICE_NAME } from "@/wallet/services/fpc/spec"
import { INCOMING_TRANSFER_SERVICE_NAME } from "@/wallet/services/incoming-transfer/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { OPERATION_JOURNAL_SERVICE_NAME } from "@/wallet/services/operation-journal/spec"
import { UI_PREFERENCE_SERVICE_NAME } from "@/wallet/services/ui-preference/spec"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { parseEnvelope } from "./sealed-entity-storage"

vi.mock("@/wallet/services/pxe/client", () => ({
	PxeServiceClient: vi.fn(function () {
		return { clearProfileState: async () => {} }
	}),
}))

const PW = "pass1234"
const ORIGIN = "https://dapp.example"
const CHAIN = "0x1"
const ADDR = `0x${"ab".repeat(32)}`
const ROOTS = ["nulo:core:contacts", "nulo:core:dappSessions"]

function fakeConfig(): IConfig {
	const values: Record<string, unknown> = { sessionTtl: 1_800_000, strictSecurityMode: true, debugMode: false }
	return { onUpdate: new EventHandler<ConfigProp>(), get: ((key: string) => values[key]) as IConfig["get"] }
}

const noop = async () => {}
const none = async () => []

/** One worker over `api`: the sealed roots' services and the deletion they take part in. */
async function boot(api: FakeBrowserApi) {
	const config = fakeConfig()
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	const profiles = new ProfileService(config, logger, api)
	services.add(profiles)
	services.add(svc(NETWORK_SERVICE_NAME, { registerChainPurgeSubscriber: () => {}, getNetworksRaw: none, purgeForProfile: noop }))
	services.add(svc(ACCOUNT_SERVICE_NAME, { getAccountsRaw: none, rawAddressesForProfile: none, purgeForProfile: noop }))
	services.add(svc(TOKEN_SERVICE_NAME, { getTokensRaw: none, rawTokenIdsForProfile: none, purgeForProfile: noop }))
	services.add(svc(TRANSACTION_SERVICE_NAME, { purgeForAccounts: noop }))
	services.add(svc(AUTH_REGISTRY_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(TOKEN_BALANCE_SERVICE_NAME, { purgeForTokens: noop }))
	services.add(svc(INCOMING_TRANSFER_SERVICE_NAME, { clearProfile: noop }))
	services.add(svc(FPC_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(OPERATION_JOURNAL_SERVICE_NAME, { purgeForProfile: noop }))
	services.add(svc(UI_PREFERENCE_SERVICE_NAME, { purgeForProfile: noop }))
	const contacts = new ContactService(logger, api)
	const sessions = new DappSessionService(logger, api)
	services.add(contacts)
	services.add(sessions)
	services.add(new ProfileDeletionCoordinator(logger, api.storage.local))
	await services.start()
	return { profiles, contacts, sessions }
}
type Worker = Awaited<ReturnType<typeof boot>>

function freshApi(): FakeBrowserApi {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

/** Every stored row of both sealed roots, parsed. */
async function rows(api: FakeBrowserApi): Promise<Array<{ key: string; value: Record<string, unknown> }>> {
	return Object.entries(await api.storage.local.get())
		.filter(([key]) => ROOTS.some((root) => key.startsWith(`${root}@`)))
		.map(([key, raw]) => ({ key, value: JSON.parse(raw as string) as Record<string, unknown> }))
}
const sealedRow = (value: Record<string, unknown>) => parseEnvelope(value) !== undefined
const rowsOf = async (api: FakeBrowserApi, profileId: string) => (await rows(api)).filter(({ value }) => value.profileId === profileId)

/** Rewrites every stored row as the plaintext a build that did not seal wrote. */
async function toLegacy(api: FakeBrowserApi, worker: Worker): Promise<void> {
	for (const { key, value } of await rows(api)) {
		const envelope = parseEnvelope(value)
		const keys = envelope && worker.profiles.rowKeys(envelope.profileId)
		if (!envelope || !keys) continue
		const root = key.slice(0, key.indexOf("@"))
		await api.storage.local.set({
			[key]: await openRow(keys, envelope.sealed, { root, storageKey: key, profileId: envelope.profileId }),
		})
	}
}

/** A contact and a dApp session for the active profile. */
async function seed(worker: Worker, name: string): Promise<void> {
	const profile = await worker.profiles.getActiveProfile()
	if (!profile) throw new Error("seed needs an unlocked profile")
	await worker.contacts.addContact(name, ADDR)
	await worker.sessions.addDappSession({ name: "dApp", url: ORIGIN }, [], [], AccessLevel.Transactions, CHAIN, profile.id)
}

/** A valid password restore secret for a fixed recovery phrase. */
async function restoreSecret() {
	const entropy = new Uint8Array(32).fill(11)
	const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	return {
		type: "password" as const,
		masterKey: asBase64MasterSecret(Buffer.from(master).toString("base64")),
		entropy: Buffer.from(entropy).toString("base64"),
		importedKeysDek: Buffer.from(new Uint8Array(32).fill(0x55)).toString("base64"),
	}
}

describe("sealed contacts and dApp sessions — the real service graph", () => {
	test("an unlock seals its own profile's plaintext rows to the values they held, and only those", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await seed(first, "Alice")
		await first.profiles.createProfile("Q", PW)
		await seed(first, "Bob")
		await toLegacy(api, first)
		const legacy = await rows(api)
		expect(legacy.some(({ value }) => sealedRow(value))).toBe(false)

		const restarted = await boot(api)
		await restarted.profiles.unlockProfile(p.id, PW)
		await vi.waitFor(async () => expect((await rowsOf(api, p.id)).every(({ value }) => sealedRow(value))).toBe(true))

		const pLegacy = legacy.filter(({ value }) => value.profileId === p.id).map(({ value }) => value)
		expect(await restarted.contacts.getContacts()).toEqual(pLegacy.filter((row) => "name" in row))
		expect(await restarted.sessions.getDappSessions()).toEqual(pLegacy.filter((row) => "dappMetadata" in row))
		expect(await rows(api)).toEqual(expect.arrayContaining(legacy.filter(({ value }) => value.profileId !== p.id)))
		expect(JSON.stringify(await rowsOf(api, p.id))).not.toContain("Alice")
	}, 60_000)

	test("a restore writes sealed contacts before its finalize, and the finalized profile reads them", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const out = await worker.profiles.restore({ id: "abc12345", name: "R", type: "password" }, await restoreSecret(), PW)
		await worker.contacts.restore([{ id: "c-1", profileId: out.id, name: "Alice", address: ADDR, abbr: "A" }])
		expect((await rows(api)).map(({ value }) => parseEnvelope(value)?.profileId)).toEqual([out.id])

		await worker.profiles.finalizeRestore(out.id, PW)
		expect((await worker.contacts.getContacts()).map(({ name }) => name)).toEqual(["Alice"])
	}, 60_000)

	test("deleting a locked profile in a worker that never opened it removes its rows, sealed or not, and keeps the other's", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await seed(first, "Alice")
		await first.contacts.addContact("Carol", ADDR)
		const carol = (await first.contacts.getContacts()).find(({ name }) => name === "Carol")
		const carolKey = `nulo:core:contacts@${carol?.id}`
		const q = await first.profiles.createProfile("Q", PW)
		await seed(first, "Bob")
		const carolSealed = (await api.storage.local.get(carolKey))[carolKey]
		await toLegacy(api, first)
		await api.storage.local.set({ [carolKey]: carolSealed })

		const restarted = await boot(api)
		await restarted.profiles.unlockProfile(q.id, PW)
		await vi.waitFor(async () => expect((await rowsOf(api, q.id)).every(({ value }) => sealedRow(value))).toBe(true))
		expect(restarted.profiles.rowKeys(p.id)).toBeUndefined()
		await restarted.profiles.deleteProfile(p.id)

		expect(await rowsOf(api, p.id)).toEqual([])
		expect((await restarted.contacts.getContacts()).map(({ name }) => name)).toEqual(["Bob"])
		expect(await restarted.sessions.getDappSessions()).toHaveLength(1)
	}, 60_000)

	test("recovery mode reads contacts and hides sessions, and its unlock seals both", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await seed(first, "Alice")
		await toLegacy(api, first)
		const profileKey = `nulo:core:profiles@${p.id}`
		const healthy = (await api.storage.local.get(profileKey))[profileKey] as string
		await api.storage.local.set({ [profileKey]: JSON.stringify({ ...JSON.parse(healthy), dekSealed: "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" }) })

		const degraded = await boot(api)
		await degraded.profiles.unlockProfile(p.id, PW)
		expect(degraded.profiles.isRecoveryMode(p.id)).toBe(true)
		await vi.waitFor(async () => expect((await rows(api)).every(({ value }) => sealedRow(value))).toBe(true))
		expect((await degraded.contacts.getContacts()).map(({ name }) => name)).toEqual(["Alice"])
		expect(await degraded.sessions.getDappSessions()).toEqual([])
		expect(await rows(api)).toHaveLength(2)

		await api.storage.local.set({ [profileKey]: healthy })
		const repaired = await boot(api)
		await repaired.profiles.unlockProfile(p.id, PW)
		expect(await repaired.sessions.getDappSessions()).toHaveLength(1)
	}, 60_000)

	test("a refusal deletes the app's rows after a lock and after a switch, and is unavailable without the row key", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		const target = { origin: ORIGIN, chainId: CHAIN, profileId: p.id }
		const sessionsOf = async () => (await rowsOf(api, p.id)).filter(({ key }) => key.startsWith("nulo:core:dappSessions@"))

		await seed(first, "Alice")
		await first.profiles.createProfile("Q", PW)
		expect(await first.sessions.refuseVerification(target)).toBe("revoked")
		expect(await sessionsOf()).toEqual([])

		await first.profiles.unlockProfile(p.id, PW)
		await seed(first, "Alice")
		await first.profiles.lockActiveProfile()
		expect(await first.sessions.refuseVerification(target)).toBe("revoked")
		expect(await sessionsOf()).toEqual([])

		await first.profiles.unlockProfile(p.id, PW)
		await seed(first, "Alice")
		const restarted = await boot(api)
		expect(await restarted.sessions.refuseVerification(target)).toBe("unavailable")
		expect(await sessionsOf()).toHaveLength(1)
	}, 60_000)

	test("a plaintext session edited at rest is dropped, not sealed into a served grant", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		await seed(first, "Alice")
		await toLegacy(api, first)
		const [session] = (await rows(api)).filter(({ key }) => key.startsWith("nulo:core:dappSessions@"))
		if (!session) throw new Error("seeded one session")
		await api.storage.local.set({
			[session.key]: JSON.stringify({ ...session.value, dappMetadata: { name: "dApp", url: "https://evil.example" } }),
		})

		const restarted = await boot(api)
		await restarted.profiles.unlockProfile(p.id, PW)
		expect(await restarted.sessions.getDappSessions()).toEqual([])
		await vi.waitFor(async () => expect(Object.keys(await api.storage.local.get(session.key))).toEqual([]))
	}, 60_000)
})
