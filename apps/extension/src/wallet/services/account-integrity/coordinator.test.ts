/**
 * Unit pins for `AccountIntegrityCoordinator` — the ORCHESTRATION contract (withhold on
 * mismatch, persist a durable blocking record, heal on green, close the session on a runtime
 * report). The derivation itself is injected (jsdom cannot run bb.js poseidon); the REAL frozen
 * derivation is covered by the aztec-runtime KAT/freeze suites and the network canary.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { AccountAddressInconsistencyError } from "@nulo/extension-messaging/errors"
import { asMasterSecretBytes, keyedSegment } from "@nulo/wallet-crypto"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { describe, expect, test } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService, AccountType, type Account } from "@/wallet/services/account/service"
import { NetworkService, type Network } from "@/wallet/services/network/service"
import { ProfileService } from "@/wallet/services/profile/service"
import { StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import { loggedAfter } from "../../../../tests/helpers/logged"
import { CHAIN_IDS, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { svc } from "../composition-harness"
import { AccountIntegrityBlockedRepository, AccountIntegrityVerifiedStampRepository } from "./blocked-repository"
import { AccountIntegrityCoordinator, type DeriveAddress } from "./coordinator"
import { accountSetDigest } from "./types"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

const MASTER = asMasterSecretBytes(new Uint8Array(32).fill(7) as Uint8Array<ArrayBuffer>)
/** One key for every profile, as the profile fakes hold it. */
const ROW_KEY_FAKE = await rowKeysForEveryProfile()
/** What the coordinator stores for an account set: its digest, keyed under p1's row keys. */
const keyedDigestOf = (rows: Account[]) => keyedSegment(ROW_KEY_FAKE.rowKeys("p1")!, accountSetDigest(rows))

function row(overrides: Partial<Account> = {}): Account {
	return {
		profileId: "p1",
		chainId: 0,
		address: "0xaaaa",
		index: 0,
		type: AccountType.Nulo_v1,
		l1ChainId: 0,
		name: "A",
		visible: true,
		...overrides,
	}
}

async function build(opts: {
	rows: Account[]
	derive: DeriveAddress
	/** Simulates a silently-rehydrated session present at coordinator start. */
	activeProfileId?: string
	/** Simulates a delete that completed during the off-lock verify: the guarded writer skips it. */
	deletedProfileId?: string
	/** The guarded block writer rejects with this. */
	persistError?: Error
	api?: FakeBrowserApi
	networks?: Network[]
	/** Replaces the static `rows` read, for an account set that changes between reads. */
	accountsRaw?: () => Promise<Account[]>
}) {
	const api = opts.api ?? new FakeBrowserApi()
	if (!opts.api) api.reset()
	const locks: string[] = []
	const services = new ServiceCollection()
	const repo = new AccountIntegrityBlockedRepository(api.storage.local)
	services.add(
		svc(ProfileService.name, {
			...ROW_KEY_FAKE,
			setIntegrityDelegate: () => {},
			lockProfileIfActive: async (id: string) => {
				locks.push(id)
			},
			// The off-lock boot path routes block writes through this locked, still-exists-guarded
			// writer. `opts.deletedProfileId` simulates a delete that completed during verify — the
			// write is then SKIPPED (no orphan block for a gone profile).
			persistIntegrityBlockIfLive: async (record: Parameters<typeof repo.set>[0]) => {
				if (opts.persistError) throw opts.persistError
				if (record.profileId === opts.deletedProfileId) return
				await repo.set(record)
			},
			persistIntegrityVerdictIfLive: async (id: string, write: () => Promise<unknown>) =>
				id === opts.deletedProfileId ? undefined : write(),
			getActiveProfile: async () => (opts.activeProfileId ? { id: opts.activeProfileId, name: "P", type: "password" } : undefined),
			getProfileSecret: async () => Fr.fromBuffer(Buffer.from(MASTER)),
		}),
	)
	services.add(
		svc(AccountService.name, { getAccountsRaw: opts.accountsRaw ?? (async () => opts.rows), setRuntimeMismatchDelegate: () => {} }),
	)
	services.add(svc(NetworkService.name, { getNetworksRaw: async () => opts.networks ?? [] }))
	const logger = new LoggerStore(new ConfigStore())
	const coordinator = new AccountIntegrityCoordinator(logger, api, opts.derive)
	services.add(coordinator)
	await services.start()
	await coordinator.bootVerification
	const stamps = new AccountIntegrityVerifiedStampRepository(api.storage.local)
	return { coordinator, repo, stamps, locks, api, logger, stale: new StaleNetworkRepository(api.storage.local) }
}

describe("AccountIntegrityCoordinator", () => {
	test("green verify passes, and heals a stale blocking record", async () => {
		const { coordinator, repo } = await build({ rows: [row()], derive: async () => "0xaaaa" })
		await repo.set({
			profileId: "p1",
			chainId: 0,
			accountIndex: 0,
			storedAddress: "0xaaaa",
			derivedAddress: "0xstale",
			regimeId: "nulo-v6",
			walletVersion: "0.0.0",
			detectedAt: 1,
		})
		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect(await repo.isBlocked("p1")).toBe(false)
	})

	test("tampered stored address → throws typed error + persists the blocking record", async () => {
		const { coordinator, repo } = await build({
			rows: [row({ address: "0xTAMPERED", chainId: 3, index: 2 })],
			derive: async () => "0xreal",
		})
		await expect(coordinator.verifyBeforeSessionOpen("p1", MASTER)).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect(await repo.isBlocked("p1")).toBe(true)
		const record = await repo.get("p1")
		expect(record?.storedAddress).toBe("0xTAMPERED")
		expect(record?.derivedAddress).toBe("0xreal")
		expect(record?.chainId).toBe(3)
		expect(record?.accountIndex).toBe(2)
		expect(record?.regimeId).toBe("nulo-v6.2")
	})

	test("checks every stored account across chains; first mismatch wins", async () => {
		const derived = new Map([
			["0:0", "0xaaaa"],
			["7:0", "0xdrifted"],
		])
		const seen: string[] = []
		const { coordinator, repo } = await build({
			rows: [row(), row({ chainId: 7, l1ChainId: 7, address: "0xbbbb" })],
			derive: async (_master, account) => {
				seen.push(`${account.l1ChainId}:${account.index}`)
				return derived.get(`${account.l1ChainId}:${account.index}`) ?? "0xnone"
			},
		})
		await expect(coordinator.verifyBeforeSessionOpen("p1", MASTER)).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect(seen).toEqual(["0:0", "7:0"])
		expect((await repo.get("p1"))?.chainId).toBe(7)
	})

	test("non-Nulo_v1 rows are skipped (no derivation exists for them)", async () => {
		const seen: number[] = []
		const { coordinator } = await build({
			rows: [row(), row({ type: 99 as AccountType, address: "0xother", index: 1 })],
			derive: async (_master, account) => {
				seen.push(account.index)
				return "0xaaaa"
			},
		})
		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect(seen).toEqual([0])
	})

	test("boot verify: a rehydrated session with a MISMATCHED account is blocked + locked at start", async () => {
		const { repo, locks } = await build({
			rows: [row({ address: "0xDRIFTED" })],
			derive: async () => "0xreal",
			activeProfileId: "p1",
		})
		expect(await repo.isBlocked("p1")).toBe(true)
		expect(locks).toEqual(["p1"])
	})

	test("boot verify: NO orphan block if the profile was deleted during the off-lock verify", async () => {
		// Mismatch detected, but the guarded writer reports the profile as gone (deleted mid-verify)
		// → the block is NOT written, so a deleted profile leaves no unclearable record.
		const { repo, locks } = await build({
			rows: [row({ address: "0xDRIFTED" })],
			derive: async () => "0xreal",
			activeProfileId: "p1",
			deletedProfileId: "p1",
		})
		expect(await repo.isBlocked("p1")).toBe(false)
		// The close is still attempted (harmless no-op for a gone profile).
		expect(locks).toEqual(["p1"])
	})

	test("boot verify: a derivation that throws is logged as the error's projection, not its string", async () => {
		const { logger, locks } = await build({
			rows: [row()],
			derive: async () => {
				throw new Error("bb wasm unavailable")
			},
			activeProfileId: "p1",
		})
		expect(loggedAfter(logger, "boot integrity verification failed")).toEqual([
			{ error: { name: "Error", message: "bb wasm unavailable" } },
		])
		expect(locks).toEqual([])
	})

	test("boot verify: a block persist that throws is logged as the error's projection, and the session still closes", async () => {
		const { repo, locks, logger } = await build({
			rows: [row({ address: "0xDRIFTED" })],
			derive: async () => "0xreal",
			activeProfileId: "p1",
			persistError: new Error("storage full"),
		})
		expect(loggedAfter(logger, "integrity block persist failed")).toEqual([{ error: { name: "Error", message: "storage full" } }])
		expect(await repo.isBlocked("p1")).toBe(false)
		expect(locks).toEqual(["p1"])
	})

	test("boot verify: a green pass stamps the build so the NEXT boot skips re-deriving", async () => {
		let derives = 0
		const derive: DeriveAddress = async () => {
			derives++
			return "0xaaaa"
		}
		const { api } = await build({ rows: [row()], derive, activeProfileId: "p1" })
		expect(derives).toBe(1)
		// Same persisted storage, fresh coordinator = the next SW boot on the SAME build.
		await build({ rows: [row()], derive, activeProfileId: "p1", api })
		expect(derives).toBe(1)
	})

	test("boot verify: no active session is a no-op", async () => {
		let derives = 0
		await build({
			rows: [row()],
			derive: async () => {
				derives++
				return "0xaaaa"
			},
		})
		expect(derives).toBe(0)
	})

	// A green deriver: returns each row's OWN stored address, so verification passes and stamps.
	const greenDerive =
		(counter: { n: number }): DeriveAddress =>
		async (_master, account) => {
			counter.n++
			return account.index === 0 ? "0xaaaa" : "0xsecond"
		}

	test("boot verify: an ACCOUNT-SET change on the same build invalidates the stamp (re-verifies)", async () => {
		const c = { n: 0 }
		const derive = greenDerive(c)
		// First boot: one account, verified green + stamped.
		const { api } = await build({ rows: [row()], derive, activeProfileId: "p1" })
		expect(c.n).toBe(1)
		// Same build + same persisted storage, but the account SET changed (a second row) — the
		// storage-derived digest differs from the stamp, so the boot re-derives instead of skipping.
		await build({ rows: [row(), row({ address: "0xsecond", index: 1 })], derive, activeProfileId: "p1", api })
		expect(c.n).toBe(3) // 1 (first boot) + 2 (both rows re-derived on the second boot)
	})

	test("boot verify: a stamp holding the plain digest a 1.0.x build wrote re-derives once, then keys it", async () => {
		const c = { n: 0 }
		const derive = greenDerive(c)
		const { api, stamps } = await build({ rows: [row()], derive, activeProfileId: "p1" })
		const stamp = await stamps.get("p1")
		await stamps.set("p1", { walletVersion: stamp!.walletVersion, accountSetDigest: accountSetDigest([row()]) })
		await build({ rows: [row()], derive, activeProfileId: "p1", api })
		expect(c.n).toBe(2)
		expect((await stamps.get("p1"))?.accountSetDigest).toBe(await keyedDigestOf([row()]))
		await build({ rows: [row()], derive, activeProfileId: "p1", api })
		expect(c.n).toBe(2)
	})

	test("boot verify: an UNCHANGED account set on the same build skips (digest match)", async () => {
		const c = { n: 0 }
		const derive = greenDerive(c)
		const rows = [row(), row({ address: "0xsecond", index: 1 })]
		const { api } = await build({ rows, derive, activeProfileId: "p1" })
		expect(c.n).toBe(2)
		await build({ rows, derive, activeProfileId: "p1", api })
		expect(c.n).toBe(2) // no re-derive: same build + same digest
	})
})

const TESTNET_ROW: Network = {
	id: "tn",
	profileId: "p1",
	chainId: CHAIN_IDS.TESTNET,
	l1ChainId: TESTNET_L1_CHAIN_ID,
	name: "Testnet",
	primaryEndpointId: "e1",
	endpoints: [{ id: "e1", rpcUrl: "https://rpc.example" }],
	kind: "testnet",
}
const onTestnet = (over: Partial<Account> = {}) => row({ chainId: TESTNET_ROW.chainId, l1ChainId: TESTNET_ROW.l1ChainId, ...over })
const BLOCK = {
	profileId: "p1",
	chainId: 0,
	accountIndex: 0,
	storedAddress: "0xaaaa",
	derivedAddress: "0xstale",
	regimeId: "nulo-v6",
	walletVersion: "0.0.0",
	detectedAt: 1,
}

describe("AccountIntegrityCoordinator — chain-aware verdicts", () => {
	test("a chain whose every address moved opens, writes the record and clears a prior block", async () => {
		const rows = [onTestnet(), onTestnet({ index: 1, address: "0xbbbb", visible: false })]
		const { coordinator, repo, stale, stamps } = await build({ rows, networks: [TESTNET_ROW], derive: async () => "0xmoved" })
		await repo.set(BLOCK)
		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect(await repo.isBlocked("p1")).toBe(false)
		expect((await stale.getRecord("p1"))?.entries).toEqual([
			{ networkId: "tn", chainId: TESTNET_ROW.chainId, networkReset: false, addressesMoved: true },
		])
		expect(await stamps.get("p1")).toBeDefined()
	})

	test("Mainnet with every address moved writes a record, not a block", async () => {
		const mainnet: Network = { ...TESTNET_ROW, id: "mn", chainId: CHAIN_IDS.MAINNET, l1ChainId: 1, kind: "mainnet" }
		const { coordinator, repo, stale } = await build({
			rows: [row({ chainId: CHAIN_IDS.MAINNET, l1ChainId: 1 })],
			networks: [mainnet],
			derive: async () => "0xmoved",
		})
		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect(await repo.isBlocked("p1")).toBe(false)
		expect((await stale.getRecord("p1"))?.entries).toEqual([
			{ networkId: "mn", chainId: CHAIN_IDS.MAINNET, networkReset: false, addressesMoved: true },
		])
	})

	test("a chain with only some addresses moved blocks the profile and writes no record", async () => {
		const rows = [onTestnet(), onTestnet({ index: 1, address: "0xbbbb" })]
		const { coordinator, repo, stale } = await build({
			rows,
			networks: [TESTNET_ROW],
			derive: async (_m, a) => (a.index === 0 ? "0xaaaa" : "0xmoved"),
		})
		await expect(coordinator.verifyBeforeSessionOpen("p1", MASTER)).rejects.toBeInstanceOf(AccountAddressInconsistencyError)
		expect((await repo.get("p1"))?.accountIndex).toBe(1)
		expect(await stale.getRecord("p1")).toBeUndefined()
	})

	test("a green pass removes a record the build no longer earns", async () => {
		const { coordinator, stale } = await build({ rows: [onTestnet()], networks: [TESTNET_ROW], derive: async () => "0xaaaa" })
		const moved = { networkId: "tn", chainId: TESTNET_ROW.chainId, networkReset: false, addressesMoved: true }
		await stale.mergeEntry("p1", moved, "d", async () => "d")
		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect(await stale.getRecord("p1")).toBeUndefined()
	})

	test("boot verify: a resettable chain is quarantined and the session stays open", async () => {
		const { locks, repo, stale } = await build({
			rows: [onTestnet()],
			networks: [TESTNET_ROW],
			derive: async () => "0xmoved",
			activeProfileId: "p1",
		})
		expect(locks).toEqual([])
		expect(await repo.isBlocked("p1")).toBe(false)
		expect((await stale.getRecord("p1"))?.entries).toHaveLength(1)
	})

	test("boot verify: a profile deleted during the verify gets no record", async () => {
		const { stale } = await build({
			rows: [onTestnet()],
			networks: [TESTNET_ROW],
			derive: async () => "0xmoved",
			activeProfileId: "p1",
			deletedProfileId: "p1",
		})
		expect(await stale.getRecord("p1")).toBeUndefined()
	})

	test("an account set that changes once is re-read and re-classified", async () => {
		const first = [onTestnet()]
		const second = [onTestnet(), onTestnet({ index: 1, address: "0xbbbb" })]
		const reads = [first, second, second, second]
		const { coordinator, stale, stamps } = await build({
			rows: first,
			accountsRaw: async () => reads.shift() ?? second,
			networks: [TESTNET_ROW],
			derive: async () => "0xmoved",
		})
		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect((await stale.getRecord("p1"))?.accountSetDigest).toBe(await keyedDigestOf(second))
		expect((await stamps.get("p1"))?.accountSetDigest).toBe(await keyedDigestOf(second))
	})

	test("an account set that changes twice refuses the open and clears, stamps and writes nothing", async () => {
		let n = 0
		const { coordinator, repo, stale, stamps } = await build({
			rows: [],
			accountsRaw: async () => [onTestnet({ index: n, address: `0x${n++}` })],
			networks: [TESTNET_ROW],
			derive: async () => "0xmoved",
		})
		await repo.set(BLOCK)
		await expect(coordinator.verifyBeforeSessionOpen("p1", MASTER)).rejects.toThrow(/^ERR_ACCOUNTS_CHANGED: /)
		expect(await repo.isBlocked("p1")).toBe(true)
		expect(await stamps.get("p1")).toBeUndefined()
		expect(await stale.getRecord("p1")).toBeUndefined()
	})
})

describe("AccountIntegrityCoordinator — operation-time classification", () => {
	test("a moved chain merges its entry, keeps the other chains' entries and closes nothing", async () => {
		const local: Network = { ...TESTNET_ROW, id: "ln", chainId: 0, l1ChainId: 31337, kind: "local" }
		const { coordinator, locks, stale, repo } = await build({
			rows: [onTestnet(), row({ l1ChainId: 31337 })],
			networks: [TESTNET_ROW, local],
			derive: async (_m, a) => (a.l1ChainId === TESTNET_ROW.l1ChainId ? "0xmoved" : "0xaaaa"),
		})
		const other = { networkId: "x", chainId: 9, networkReset: true, addressesMoved: false }
		await stale.mergeEntry("p1", other, "d", async () => "d")
		expect(await coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(true)
		expect((await stale.getRecord("p1"))?.entries).toEqual([
			other,
			{ networkId: "tn", chainId: TESTNET_ROW.chainId, networkReset: false, addressesMoved: true },
		])
		expect(locks).toEqual([])
		expect(await repo.isBlocked("p1")).toBe(false)
	})

	test("a verdict read before the accounts changed refuses the operation and writes nothing", async () => {
		const before = [onTestnet()]
		const after = [{ ...onTestnet(), chainId: TESTNET_ROW.chainId + 1 }]
		let reads = 0
		const { coordinator, locks, stale, repo } = await build({
			rows: before,
			accountsRaw: async () => (reads++ === 0 ? before : after),
			networks: [TESTNET_ROW],
			derive: async () => "0xmoved",
		})
		reads = 0
		expect(await coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(true)
		expect(await stale.getRecord("p1")).toBeUndefined()
		expect(locks).toEqual([])
		expect(await repo.isBlocked("p1")).toBe(false)
	}, 30_000)

	test("a chain that derives clean now refuses the operation and writes nothing", async () => {
		const { coordinator, locks, stale, repo } = await build({
			rows: [onTestnet()],
			networks: [TESTNET_ROW],
			derive: async () => "0xaaaa",
		})
		expect(await coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(true)
		expect(await stale.getRecord("p1")).toBeUndefined()
		expect(locks).toEqual([])
		expect(await repo.isBlocked("p1")).toBe(false)
	}, 30_000)

	test("both digest writers store a keyed digest that names no address, and an account-set change still invalidates it", async () => {
		const accounts = [onTestnet({ address: "0xMARKER" }), row({ l1ChainId: 31337, address: "0xOTHERMARKER" })]
		let current = accounts
		const local: Network = { ...TESTNET_ROW, id: "ln", chainId: 0, l1ChainId: 31337, kind: "local" }
		const derive: DeriveAddress = async (_m, a) => (a.l1ChainId === TESTNET_ROW.l1ChainId ? "0xmoved" : "0xOTHERMARKER")
		const { coordinator, api, stale, stamps } = await build({
			rows: accounts,
			accountsRaw: async () => current,
			networks: [TESTNET_ROW, local],
			derive,
		})
		const noMarker = async () => expect(JSON.stringify(await api.storage.local.get(null))).not.toMatch(/MARKER/i)

		await coordinator.verifyBeforeSessionOpen("p1", MASTER)
		expect((await stamps.get("p1"))?.accountSetDigest).toBe(await keyedDigestOf(accounts))
		expect((await stale.getRecord("p1"))?.accountSetDigest).toBe(await keyedDigestOf(accounts))
		await noMarker()

		await stale.clearProfile("p1")
		expect(await coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(true)
		expect((await stale.getRecord("p1"))?.accountSetDigest).toBe(await keyedDigestOf(accounts))
		await noMarker()

		// One more account: the stored digest no longer matches the set, so the record is not rewritten.
		await stale.clearProfile("p1")
		current = [...accounts, onTestnet({ index: 1, address: "0xTHIRDMARKER" })]
		const reads = [accounts]
		const merged = await build({
			rows: accounts,
			accountsRaw: async () => reads.shift() ?? current,
			networks: [TESTNET_ROW, local],
			derive,
			api,
		})
		expect(await merged.coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(true)
		expect(await stale.getRecord("p1")).toBeUndefined()
	}, 30_000)

	test("a mixed chain, or a chain with no network row, is not confined", async () => {
		const mixed = await build({
			rows: [onTestnet(), onTestnet({ index: 1, address: "0xbbbb" })],
			networks: [TESTNET_ROW],
			derive: async (_m, a) => (a.index === 0 ? "0xaaaa" : "0xmoved"),
		})
		expect(await mixed.coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(false)
		expect(await mixed.stale.getRecord("p1")).toBeUndefined()
		const orphan = await build({ rows: [onTestnet()], derive: async () => "0xmoved" })
		expect(await orphan.coordinator.classifyRuntimeMismatch("p1", TESTNET_ROW.chainId)).toBe(false)
	})
})
