/**
 * Create and import of one address take turns on that address's row lock, and a create never
 * writes over a row that stands. The derivation is mocked so a create at index 0 derives the
 * address the import file carries, which is what an account exported from a same-phrase install
 * does, and every later index derives `NEXT`.
 */

import { describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ServiceCollection } from "@/wallet/base"
import { LoggerStore } from "@/wallet/logger"
import { ConfigStore } from "@/wallet/config"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { svc } from "../composition-harness"
import { recordWrites } from "../storage-write-log"
import { AccountService } from "./service"
import { AccountType, accountRowId, type Account } from "./spec"

const SHARED = "0xshared"
const NEXT = "0xnext"

vi.mock("@nulo/wallet-crypto", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	deriveAccountSeed: async (_master: unknown, _l1: number, _type: number, index: number) => new Fr(BigInt(index) + 1n),
	sealImportedSigningKeyV2: async () => "sealed",
}))
vi.mock("@nulo/aztec-runtime/account", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	NuloAccount: {
		new: async (secret: Fr) => ({ address: { toString: () => (secret.toBigInt() === 1n ? SHARED : NEXT) } }),
	},
}))

const accountKey = (address: string) => `nulo:core:accounts@${accountRowId("p1", 1, address)}`
const keyRowKey = (address: string) => `nulo:core:imported-account-keys@${accountRowId("p1", 1, address)}`

const importedRow = (address: string): Account => ({
	profileId: "p1",
	chainId: 1,
	address,
	index: 0,
	type: AccountType.Imported,
	l1ChainId: 1,
	name: "Imported account",
	visible: true,
})

function gate() {
	let open!: () => void
	let reached!: () => void
	const opened = new Promise<void>((r) => {
		open = r
	})
	const parked = new Promise<void>((r) => {
		reached = r
	})
	return { open, opened, parked, reached }
}

/** Enough macrotasks for every in-memory await chain of one call to run as far as it can. */
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

async function makeHarness(over: { chainLive?: (call: number) => boolean | Promise<boolean> } = {}) {
	const api = new FakeBrowserApi()
	api.reset()
	let liveCalls = 0
	const services = new ServiceCollection()
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			onProfileDeleted: new EventHandler(),
			getDeletionState: () => new ProfileDeletionState(),
			getProfileSecret: async () => new Fr(42n),
			getProfileDek: async () => new Uint8Array(32).fill(1),
		}),
	)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			registerChainPurgeSubscriber: () => {},
			isChainQuarantined: async () => false,
			isChainLive: async () => over.chainLive?.(++liveCalls) ?? true,
			resolveVerifiedL1ChainId: async () => 1,
			getL1ChainIdStored: async () => 1,
		}),
	)
	const service = new AccountService(new LoggerStore(new ConfigStore()), api)
	services.add(service)
	await services.start()
	vi.spyOn(service as unknown as { decodeAccountExport: () => Promise<unknown> }, "decodeAccountExport").mockResolvedValue({
		signingKey: { toBuffer: () => new Uint8Array(32).fill(5) },
		address: SHARED,
	})
	const raw = async () => (await api.storage.local.get(null)) as Record<string, string>
	return {
		api,
		service,
		create: () => service.createAccount("p1", 1, AccountType.Nulo_v1, "Account 1"),
		importShared: () => service.importAccount("p1", 1, "body", SHARED, "pw", "Mine"),
		row: async (address: string): Promise<Account | undefined> => {
			const value = (await raw())[accountKey(address)]
			return value === undefined ? undefined : JSON.parse(value)
		},
		hasKey: async (address: string) => keyRowKey(address) in (await raw()),
		seed: (entries: Record<string, unknown>) =>
			api.storage.local.set(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]))),
	}
}

describe("create and import of one address", () => {
	test("a create over an imported address keeps that row and its key and writes the next index", async () => {
		const h = await makeHarness()
		const key = { profileId: "p1", chainId: 1, address: SHARED, encryptedSigningKey: "s" }
		await h.seed({ [accountKey(SHARED)]: importedRow(SHARED), [keyRowKey(SHARED)]: key })

		const created = await h.create()

		expect(created).toMatchObject({ address: NEXT, index: 1, type: AccountType.Nulo_v1 })
		expect(await h.row(SHARED)).toEqual(importedRow(SHARED))
		expect(await h.hasKey(SHARED)).toBe(true)
		expect(await h.row(NEXT)).toEqual(created)
	})

	test("a create that meets an import holding the address waits, then lands on the next index; both rows stand", async () => {
		const h = await makeHarness()
		const area = h.api.storage.local
		const realSet = area.set.bind(area)
		const held = gate()
		let armed = true
		area.set = async (entries) => {
			if (armed && keyRowKey(SHARED) in entries) {
				armed = false
				held.reached()
				await held.opened
			}
			await realSet(entries)
		}
		const { log } = recordWrites(area, "nulo:core:accounts@")

		const importing = h.importShared()
		await held.parked
		const creating = h.create()
		await settle()
		expect(log).toEqual([])

		held.open()
		const [, created] = await Promise.all([importing, creating])
		expect(created).toMatchObject({ address: NEXT, index: 1 })
		expect(await h.row(SHARED)).toMatchObject({ type: AccountType.Imported, name: "Mine" })
		expect(await h.hasKey(SHARED)).toBe(true)
		expect(await h.row(NEXT)).toEqual(created)
	})

	test("a row the codec hides at the derived address is skipped, not overwritten", async () => {
		const h = await makeHarness()
		await h.seed({ [accountKey(SHARED)]: { garbage: true } })

		const created = await h.create()

		expect(created).toMatchObject({ address: NEXT, index: 1 })
		expect(await h.row(SHARED)).toEqual({ garbage: true })
	})

	test("the default account over an imported address is the next index, and a second call returns it", async () => {
		const h = await makeHarness()
		await h.seed({ [accountKey(SHARED)]: importedRow(SHARED) })

		const first = await h.service.ensureDefaultAccount("p1", 1, AccountType.Nulo_v1, "Account 1")
		const second = await h.service.ensureDefaultAccount("p1", 1, AccountType.Nulo_v1, "Account 1")

		expect(first).toMatchObject({ address: NEXT, index: 1 })
		expect(second).toEqual(first)
		expect(await h.row(SHARED)).toEqual(importedRow(SHARED))
	})

	test("an import after a create of its address is refused before any write; the derived row stands", async () => {
		const h = await makeHarness()
		const created = await h.create()
		const { log } = recordWrites(h.api.storage.local, "nulo:core:")

		await expect(h.importShared()).rejects.toThrow(/^This account is already in your wallet$/)
		expect(log).toEqual([])
		expect(await h.row(SHARED)).toEqual(created)
	})

	test("two concurrent creates still take indices 0 and 1", async () => {
		const h = await makeHarness()
		const accounts = await Promise.all([h.create(), h.create()])
		expect(accounts.map((a) => [a.index, a.address]).sort()).toEqual([
			[0, SHARED],
			[1, NEXT],
		])
	})
})

describe("reconcileImportedAccounts", () => {
	test("control: a keyless imported row with no create is purged, deleted and reported", async () => {
		const h = await makeHarness()
		await h.seed({ [accountKey(SHARED)]: importedRow(SHARED) })
		const purged: unknown[] = []
		h.service.registerAccountPurgeSubscriber(async (_profileId, scopes) => {
			purged.push(scopes)
		})

		expect(await h.service.reconcileImportedAccounts("p1")).toEqual([{ chainId: 1, address: SHARED }])
		expect(purged).toEqual([[{ chainId: 1, address: SHARED }]])
		expect(await h.row(SHARED)).toBeUndefined()
	})
})
