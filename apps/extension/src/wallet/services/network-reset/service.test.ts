/**
 * NetworkResetService against the real Network and Account services on `FakeBrowserApi`, with the
 * real imported-key box. Derivation is stubbed (bb WASM does not run here): a derived account's
 * address encodes its L1, type and index, and an imported key's address encodes the key.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { GrumpkinScalar } from "@aztec-labs/foundation/curves/grumpkin"
import { RecoveryModeError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("@nulo/wallet-crypto", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	deriveAccountSeed: async (_master: unknown, l1ChainId: number, type: number, index: number) =>
		new Fr(BigInt(l1ChainId) * 1000n + BigInt(type) * 100n + BigInt(index)),
}))
vi.mock("@nulo/aztec-runtime/account", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	NuloAccount: {
		new: async (secret: Fr) => ({ address: { toString: () => `0xn${secret.toBigInt().toString(16)}` } }),
		fromSigningKey: async (sk: GrumpkinScalar) => ({ address: { toString: () => `0xi${sk.toBigInt().toString(16)}` } }),
	},
}))

import { asImportedKeysDek, sealImportedSigningKeyV2, unsealImportedSigningKeyV2 } from "@nulo/wallet-crypto"
import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import type { RestoreGateHoldPoint } from "@/e2e/restore-gate"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ACCOUNT_INTEGRITY_COORDINATOR_NAME } from "@/wallet/services/account-integrity/coordinator"
import { AccountService } from "@/wallet/services/account/service"
import { type Account, accountRowId } from "@/wallet/services/account/spec"
import { NetworkService } from "@/wallet/services/network/service"
import type { Network } from "@/wallet/services/network/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import type { ResetJournal } from "@/wallet/services/stale-network/types"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import { FakeNodeFactory } from "@/core/testing/fake-node-factory"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { svc } from "../composition-harness"
import { recordWrites } from "../storage-write-log"
import { NetworkResetService } from "./service"
import type { ResetConfirmation, StaleNetworkChanged, StaleNetworkView } from "./spec"

const OLD = 4321
const NEW = CHAIN_IDS.TESTNET
const L1 = TESTNET_L1_CHAIN_ID
const MY_NODE = "https://my-node.example"
const DEK_FILL = 0x11
const dekOf = () => asImportedKeysDek(new Uint8Array(32).fill(DEK_FILL) as Uint8Array<ArrayBuffer>)
const derived = (l1: number, index: number) => `0xn${(BigInt(l1) * 1000n + BigInt(index)).toString(16)}`
const SK1 = GrumpkinScalar.fromString(`0x${"0".repeat(62)}2a`)
const SK2 = GrumpkinScalar.fromString(`0x${"0".repeat(62)}2b`)
const importedAddr = (sk: GrumpkinScalar) => `0xi${sk.toBigInt().toString(16)}`

type Gate = { at: RestoreGateHoldPoint; reached: Promise<void>; release: () => void }

function holdAt(at: RestoreGateHoldPoint): Gate {
	let reached!: () => void
	let release!: () => void
	const reachedP = new Promise<void>((r) => {
		reached = r
	})
	const released = new Promise<void>((r) => {
		release = r
	})
	return Object.assign({ at, reached: reachedP, release }, { hit: reached, released })
}

async function harness(opts: { gate?: Gate; recovery?: () => boolean } = {}) {
	const api = new FakeBrowserApi()
	api.reset()
	const deletion = new ProfileDeletionState()
	let session = 1
	const handedDeks: Uint8Array[] = []
	const services = new ServiceCollection()
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			onProfileDeleted: new EventHandler(),
			onActiveProfileChanged: new EventHandler(),
			getActiveProfile: async () => ({ id: "p1", name: "P", type: "password" }),
			getDeletionState: () => deletion,
			captureExecutionFence: async () => ({ profileId: "p1", epoch: deletion.capture("p1"), session }),
			captureRunFence: async () => ({ profileId: "p1", epoch: deletion.capture("p1"), session, incarnation: "w1" }),
			assertRunFence: async (fence: { session: number }) => {
				if (fence.session !== session) throw new SessionEndedError()
			},
			isFenceLive: (fence: { session: number; profileId: string; epoch: number }) =>
				fence.session === session && deletion.isCurrent(fence.profileId, fence.epoch),
			isRecoveryMode: () => opts.recovery?.() ?? false,
			getProfileSecret: async () => new Fr(42n),
			getProfileDek: async () => {
				const dek = dekOf()
				handedDeks.push(dek)
				return dek
			},
		}),
	)
	const factory = new FakeNodeFactory()
	const network = new NetworkService(new LoggerStore(new ConfigStore()), api, factory)
	services.add(network)
	const account = new AccountService(new LoggerStore(new ConfigStore()), api)
	services.add(account)
	const purgeForAccounts = vi.fn(async (_addresses: readonly string[], _profileId?: string, _chainId?: number) => {})
	services.add(svc(TRANSACTION_SERVICE_NAME, { purgeForAccounts }))
	const purgeForChain = vi.fn(async (_profileId: string, _chainId: number) => {})
	services.add(svc(DAPP_SESSION_SERVICE_NAME, { purgeForChain }))
	const repo = new StaleNetworkRepository(api.storage.local)
	const seedDefaultTokens = vi.fn(async () => {
		journalAtSeeding.push(await repo.getJournal("p1"))
	})
	const journalAtSeeding: Array<ResetJournal | undefined> = []
	services.add(svc(TOKEN_SERVICE_NAME, { seedDefaultTokens }))
	services.add(svc(ACCOUNT_INTEGRITY_COORDINATOR_NAME, { bootVerification: Promise.resolve() }))
	const gate = opts.gate as (Gate & { hit: () => void; released: Promise<void> }) | undefined
	const reset = new NetworkResetService(new LoggerStore(new ConfigStore()), api, {
		waitAt: async (at) => {
			if (!gate || gate.at !== at) return
			gate.hit()
			await gate.released
		},
	})
	services.add(reset)
	await services.start()
	const pxe = vi.fn(async (_profileId: string, _chainId: number) => {})
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in, the offscreen PXE is stubbed
	;(network as any).pxeServiceClient = { clearChainState: pxe }
	const events: StaleNetworkChanged[] = []
	reset.onStaleNetworkChanged.add((e) => events.push(e))
	const settled = () =>
		new Promise<StaleNetworkChanged>((resolve) => {
			const done = (e: StaleNetworkChanged) => {
				if (e.completed || e.failed) {
					reset.onStaleNetworkChanged.remove(done)
					resolve(e)
				}
			}
			reset.onStaleNetworkChanged.add(done)
		})
	return {
		api,
		reset,
		network,
		account,
		repo,
		factory,
		pxe,
		purgeForAccounts,
		purgeForChain,
		seedDefaultTokens,
		journalAtSeeding,
		handedDeks,
		events,
		settled,
		deletion,
		endSession: () => {
			session++
		},
	}
}

type H = Awaited<ReturnType<typeof harness>>

async function putNetwork(h: H, row: Partial<Network> & { id: string }): Promise<Network> {
	const full: Network = {
		profileId: "p1",
		chainId: 0,
		l1ChainId: LOCAL_L1_CHAIN_ID,
		name: row.id,
		primaryEndpointId: "e1",
		endpoints: [{ id: "e1", rpcUrl: TESTNET_RPC_URL }],
		kind: "custom",
		...row,
	}
	await h.api.storage.local.set({ [`nulo:core:networks@${full.id}`]: JSON.stringify(full) })
	return full
}

async function putAccount(h: H, row: Partial<Account> & { chainId: number; address: string; index: number }): Promise<Account> {
	const full: Account = { profileId: "p1", type: 0, l1ChainId: L1, name: `Account ${row.index + 1}`, visible: true, ...row }
	await h.api.storage.local.set({ [`nulo:core:accounts@${accountRowId("p1", full.chainId, full.address)}`]: JSON.stringify(full) })
	return full
}

async function putImported(
	h: H,
	chainId: number,
	sk: GrumpkinScalar,
	index: number,
	over: { address?: string; sealed?: string; name?: string } = {},
) {
	const address = over.address ?? importedAddr(sk)
	const sealed = over.sealed ?? (await sealImportedSigningKeyV2(dekOf(), chainId, address, sk.toBuffer() as Uint8Array<ArrayBuffer>))
	await putAccount(h, { chainId, address, index, type: 1, name: over.name ?? `Imported ${index + 1}` })
	await h.api.storage.local.set({
		[`nulo:core:imported-account-keys@${accountRowId("p1", chainId, address)}`]: JSON.stringify({
			profileId: "p1",
			chainId,
			address,
			encryptedSigningKey: sealed,
		}),
	})
	return address
}

async function putRecord(h: H, entries: Array<{ networkId: string; chainId: number; networkReset: boolean; addressesMoved: boolean }>) {
	await h.api.storage.local.set({ "nulo:core:stale-networks@p1": JSON.stringify({ profileId: "p1", accountSetDigest: "d", entries }) })
}

/** Testnet left behind on `OLD` with the seed's L1 (addresses unchanged), two derived accounts
 *  (one hidden), two imported ones, and a live Local Network with its own account. */
async function staleTestnet(h: H, over: Partial<Network> = {}) {
	await putNetwork(h, { id: "tn", name: "Testnet", chainId: OLD, l1ChainId: L1, kind: "testnet", ...over })
	await putNetwork(h, { id: "ln", name: "Local Network", chainId: 0, kind: "local" })
	await h.api.storage.local.set({ "nulo:core:active-network@p1": "tn" })
	await putAccount(h, { chainId: OLD, address: derived(L1, 0), index: 0 })
	await putAccount(h, { chainId: OLD, address: derived(L1, 1), index: 1, visible: false })
	await putImported(h, OLD, SK1, 0)
	await putImported(h, OLD, SK2, 1)
	await putAccount(h, { chainId: 0, address: derived(LOCAL_L1_CHAIN_ID, 0), index: 0, l1ChainId: LOCAL_L1_CHAIN_ID })
}

const confirmationOf = (view: StaleNetworkView): ResetConfirmation => ({
	networkReset: view.cause.networkReset,
	addressesMoved: view.cause.addressesMoved,
	accountCount: view.accounts.length,
	unmovableCount: view.unmovable.length,
	switchToSeedNode: view.switchToSeedNode,
	probedEndpoint: view.probedEndpoint,
})

async function startReset(h: H, networkId = "tn") {
	const view = await h.reset.getStaleNetwork(networkId)
	if (!view) throw new Error("not stale")
	return h.reset.resetStaleNetwork(networkId, confirmationOf(view))
}

const storedKeys = async (h: H, prefix: string) =>
	Object.entries(await h.api.storage.local.get(null))
		.filter(([k]) => k.startsWith(prefix))
		.sort(([a], [b]) => (a < b ? -1 : 1))

const accountsOn = async (h: H, chainId: number) => (await h.account.getAccountsRaw("p1")).filter((a) => a.chainId === chainId)

const journalOf = (over: Partial<ResetJournal> = {}): ResetJournal => ({
	profileId: "p1",
	networkId: "tn",
	fromChainId: OLD,
	toChainId: NEW,
	l1ChainId: L1,
	cause: { networkReset: true, addressesMoved: false },
	purged: false,
	switchToSeedNode: false,
	probedEndpoint: null,
	accounts: [
		{ type: 0, index: 0, name: "Account 1", visible: true, oldAddress: derived(L1, 0), done: false },
		{ type: 0, index: 1, name: "Account 2", visible: false, oldAddress: derived(L1, 1), done: false },
	],
	...over,
})

const putJournal = (h: H, journal: ResetJournal) => h.api.storage.local.set({ "nulo:core:network-reset@p1": JSON.stringify(journal) })

afterEach(() => vi.useRealTimers())

describe("NetworkResetService — the view", () => {
	test("a network reset lists every account in index order, hidden included, with no node line on the seed's node", async () => {
		const h = await harness()
		await staleTestnet(h)
		const view = await h.reset.getStaleNetwork("tn")
		expect(view).toMatchObject({
			networkId: "tn",
			name: "Testnet",
			cause: { networkReset: true, addressesMoved: false },
			blocked: false,
			unmovable: [],
			switchToSeedNode: false,
			probedEndpoint: null,
		})
		// Index order, the address breaking ties, as the account list orders them.
		expect(view?.accounts.map((a) => a.name)).toEqual(["Imported 1", "Account 1", "Imported 2", "Account 2"])
		expect(h.factory.singleAttempt).toEqual([])
		expect(await h.reset.getStaleNetwork("ln")).toBeNull()
	})

	test("the network cause is recomputed from the row, never read from the record", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: NEW, l1ChainId: L1, kind: "testnet" })
		await putAccount(h, { chainId: NEW, address: "0xold", index: 0 })
		await putRecord(h, [{ networkId: "tn", chainId: NEW, networkReset: true, addressesMoved: true }])
		expect((await h.reset.getStaleNetwork("tn"))?.cause).toEqual({ networkReset: false, addressesMoved: true })
		await putRecord(h, [{ networkId: "tn", chainId: NEW, networkReset: true, addressesMoved: false }])
		expect(await h.reset.getStaleNetwork("tn")).toBeNull()
	})

	test("an imported key that does not open is unmovable; one that derives another address moves the addresses", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putImported(h, OLD, SK1, 2, { address: "0xbroken", sealed: "not-a-ciphertext", name: "Broken" })
		let view = await h.reset.getStaleNetwork("tn")
		expect(view?.unmovable).toEqual(["Broken"])
		expect(view?.accounts.map((a) => a.name)).not.toContain("Broken")
		expect(view?.cause.addressesMoved).toBe(false)
		await putImported(h, OLD, SK2, 3, { address: "0xstored-elsewhere", name: "Moved" })
		view = await h.reset.getStaleNetwork("tn")
		expect(view?.cause.addressesMoved).toBe(true)
	})

	test("names a row already on the target chain, another network's pending reset, and blocks Mainnet", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putNetwork(h, { id: "mine", name: "My Testnet", chainId: NEW, l1ChainId: L1 })
		expect((await h.reset.getStaleNetwork("tn"))?.heldBy).toEqual({ name: "My Testnet" })

		await putJournal(h, journalOf({ networkId: "ln", fromChainId: 0, toChainId: 0, l1ChainId: LOCAL_L1_CHAIN_ID }))
		expect((await h.reset.getStaleNetwork("tn"))?.otherPending).toEqual({ networkId: "ln", name: "Local Network" })

		await putNetwork(h, { id: "mn", name: "Mainnet", chainId: 77, l1ChainId: 1 })
		await putAccount(h, { chainId: 77, address: "0xmain", index: 0, l1ChainId: 1 })
		await putRecord(h, [{ networkId: "mn", chainId: 77, networkReset: false, addressesMoved: true }])
		expect(await h.reset.getStaleNetwork("mn")).toMatchObject({ blocked: true, switchToSeedNode: false, probedEndpoint: null })
	})
})

describe("NetworkResetService — what deleting a paused network deletes", () => {
	const importedEntry = (index: number, name: string, oldAddress: string, done: boolean) => ({
		type: 1 as const,
		index,
		name,
		visible: true,
		oldAddress,
		newAddress: `${oldAddress}-new`,
		encryptedSigningKey: "sealed",
		done,
	})

	test("names the journal's imported accounts, moved or not, and no derived one", async () => {
		const h = await harness()
		await staleTestnet(h)
		const [derivedOne, derivedTwo] = journalOf().accounts
		await putJournal(
			h,
			journalOf({
				accounts: [
					derivedOne,
					importedEntry(0, "Savings", importedAddr(SK1), true),
					derivedTwo,
					importedEntry(1, "Trading", importedAddr(SK2), false),
				],
			}),
		)
		expect((await h.reset.getStaleNetwork("tn"))?.reset?.imported).toEqual(["Savings", "Trading"])

		const d = await harness()
		await putNetwork(d, { id: "tn", name: "Testnet", chainId: OLD, l1ChainId: L1, kind: "testnet" })
		await putAccount(d, { chainId: OLD, address: derived(L1, 0), index: 0 })
		await putJournal(d, journalOf())
		expect((await d.reset.getStaleNetwork("tn"))?.reset?.imported).toEqual([])
	})

	test("after the rewrite, also names an imported row on the new chain the journal does not name, cleaned", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: NEW, l1ChainId: L1, kind: "testnet" })
		await putImported(h, NEW, SK1, 0, { address: `${importedAddr(SK1)}-new` })
		await putImported(h, NEW, SK2, 1, { name: "Ho\u202eld\u200b" })
		await putImported(h, NEW, SK1, 2, { address: "0xunnamed", name: "\u202e★" })
		await putJournal(h, journalOf({ purged: true, accounts: [importedEntry(0, "Savings", importedAddr(SK1), true)] }))
		expect((await h.reset.getStaleNetwork("tn"))?.reset?.imported).toEqual(["Savings", "Hold", "Imported account"])
	})
})

describe("NetworkResetService — the node decision (A6)", () => {
	const userNode = (h: H, info: { l1ChainId: number; rollupVersion: number } | Error) => {
		const getNodeInfo = info instanceof Error ? vi.fn().mockRejectedValue(info) : vi.fn().mockResolvedValue(info)
		return vi.spyOn(h.factory, "createSingleAttemptNode").mockReturnValue({ getNodeInfo } as unknown as AztecNode)
	}
	const onMyNode = { primaryEndpointId: "u1", endpoints: [{ id: "u1", rpcUrl: MY_NODE }] }

	test("a user node that serves the seed's chain is kept, probed once within 5 s and then cached", async () => {
		const h = await harness()
		await staleTestnet(h, onMyNode)
		const probe = userNode(h, { l1ChainId: L1, rollupVersion: (NEW ^ L1) >>> 0 })
		const view = await h.reset.getStaleNetwork("tn")
		expect(view).toMatchObject({ switchToSeedNode: false, probedEndpoint: { id: "u1", url: MY_NODE } })
		await h.reset.getStaleNetwork("tn")
		expect(probe).toHaveBeenCalledTimes(1)
		expect(probe).toHaveBeenCalledWith(MY_NODE, 5000)
	})

	test.each<[string, { l1ChainId: number; rollupVersion: number } | Error]>([
		["reports another chain", { l1ChainId: L1, rollupVersion: 1 }],
		["does not answer within its budget", new Error("aborted")],
	])("a user node that %s moves the network to the seed's node", async (_label, info) => {
		const h = await harness()
		await staleTestnet(h, onMyNode)
		userNode(h, info)
		expect(await h.reset.getStaleNetwork("tn")).toMatchObject({ switchToSeedNode: true, probedEndpoint: { id: "u1", url: MY_NODE } })
	})

	test("a primary changed after the view is probed again and fails the confirmation", async () => {
		const h = await harness()
		await staleTestnet(h, {
			primaryEndpointId: "u1",
			endpoints: [
				{ id: "u1", rpcUrl: MY_NODE },
				{ id: "u2", rpcUrl: "https://two.example" },
			],
		})
		const probe = userNode(h, { l1ChainId: L1, rollupVersion: (NEW ^ L1) >>> 0 })
		const view = await h.reset.getStaleNetwork("tn")
		await h.network.setPrimaryEndpoint("tn", "u2")
		await expect(h.reset.resetStaleNetwork("tn", confirmationOf(view!))).rejects.toThrow(/^ERR_STALE_CHANGED/)
		expect(probe).toHaveBeenCalledTimes(2)
		expect(await h.repo.getJournal("p1")).toBeUndefined()
	})

	test("a primary change that commits between the fresh view and the capture refuses with nothing written", async () => {
		const h = await harness()
		await staleTestnet(h, {
			primaryEndpointId: "u1",
			endpoints: [
				{ id: "u1", rpcUrl: MY_NODE },
				{ id: "u2", rpcUrl: "https://two.example" },
			],
		})
		userNode(h, { l1ChainId: L1, rollupVersion: (NEW ^ L1) >>> 0 })
		const view = await h.reset.getStaleNetwork("tn")
		const reseal = h.account.resealImportedForReset.bind(h.account)
		vi.spyOn(h.account, "resealImportedForReset").mockImplementation(async (...args) => {
			await h.network.setPrimaryEndpoint("tn", "u2")
			return reseal(...args)
		})
		await expect(h.reset.resetStaleNetwork("tn", confirmationOf(view!))).rejects.toThrow(/^ERR_STALE_CHANGED/)
		expect(await h.repo.getJournal("p1")).toBeUndefined()
		expect(h.pxe).not.toHaveBeenCalled()
	})
})

describe("NetworkResetService — admission and capture", () => {
	test("each imported key is resealed under (new chain, new address) only, and every DEK copy is wiped", async () => {
		const gate = holdAt("network-reset-purging")
		const h = await harness({ gate })
		await staleTestnet(h)
		await startReset(h)
		await gate.reached
		const journal = (await h.repo.getJournal("p1"))!
		const imported = journal.accounts.filter((a) => a.type === 1)
		expect(imported.map((a) => a.newAddress)).toEqual([importedAddr(SK1), importedAddr(SK2)])
		for (const [entry, sk] of [
			[imported[0]!, SK1],
			[imported[1]!, SK2],
		] as const) {
			const opened = await unsealImportedSigningKeyV2(dekOf(), NEW, entry.newAddress!, entry.encryptedSigningKey!)
			expect(Buffer.from(opened).equals(sk.toBuffer())).toBe(true)
			await expect(unsealImportedSigningKeyV2(dekOf(), OLD, entry.newAddress!, entry.encryptedSigningKey!)).rejects.toThrow()
			await expect(unsealImportedSigningKeyV2(dekOf(), NEW, "0xother", entry.encryptedSigningKey!)).rejects.toThrow()
		}
		expect(h.handedDeks.length).toBeGreaterThan(0)
		for (const dek of h.handedDeks) expect(dek.every((b) => b === 0)).toBe(true)
		gate.release()
	})

	test("the journal keeps the unmovable names, so the running view never reads as a never-opened network", async () => {
		const gate = holdAt("network-reset-purging")
		const h = await harness({ gate })
		await staleTestnet(h)
		await putImported(h, OLD, SK1, 2, { address: "0xbroken", sealed: "not-a-ciphertext", name: "Broken" })
		await startReset(h)
		await gate.reached
		expect((await h.repo.getJournal("p1"))?.unmovable).toEqual(["Broken"])
		expect(await h.reset.getStaleNetwork("tn")).toMatchObject({ unmovable: ["Broken"], reset: { running: true } })
		gate.release()
	})

	test("a recovery-mode session refuses before anything changes", async () => {
		const h = await harness({ recovery: () => true })
		await staleTestnet(h)
		const before = await storedKeys(h, "nulo:core:")
		await expect(startReset(h)).rejects.toBeInstanceOf(RecoveryModeError)
		expect(await storedKeys(h, "nulo:core:")).toEqual(before)
		expect(await h.reset.getPendingReset()).toBeNull()
	})

	test("an imported key that does not open is left out of the journal and removed with the chain (A14)", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putImported(h, OLD, SK1, 2, { address: "0xbroken", sealed: "not-a-ciphertext", name: "Broken" })
		const done = h.settled()
		await startReset(h)
		expect((await done).completed).toBeDefined()
		expect((await h.account.getAccountsRaw("p1")).map((a) => a.address)).not.toContain("0xbroken")
		expect(h.purgeForAccounts).toHaveBeenCalledWith(expect.arrayContaining(["0xbroken"]), "p1", OLD)
		expect((await accountsOn(h, NEW)).map((a) => a.name).sort()).toEqual(["Account 1", "Account 2", "Imported 1", "Imported 2"])
	})

	test("refuses a stale confirmation, Mainnet, a non-stale network, a held target and another pending reset", async () => {
		const h = await harness()
		await staleTestnet(h)
		const view = (await h.reset.getStaleNetwork("tn"))!
		await expect(h.reset.resetStaleNetwork("tn", { ...confirmationOf(view), accountCount: 3 })).rejects.toThrow(/^ERR_STALE_CHANGED/)
		await expect(h.reset.resetStaleNetwork("ln", confirmationOf(view))).rejects.toThrow(/^ERR_NOT_RESETTABLE/)

		await putNetwork(h, { id: "mn", name: "Mainnet", chainId: 77, l1ChainId: 1 })
		await putRecord(h, [{ networkId: "mn", chainId: 77, networkReset: false, addressesMoved: true }])
		const mainnet = (await h.reset.getStaleNetwork("mn"))!
		await expect(h.reset.resetStaleNetwork("mn", confirmationOf(mainnet))).rejects.toThrow(/^ERR_NOT_RESETTABLE/)

		await putNetwork(h, { id: "mine", name: "My Testnet", chainId: NEW, l1ChainId: L1 })
		await expect(h.reset.resetStaleNetwork("tn", confirmationOf((await h.reset.getStaleNetwork("tn"))!))).rejects.toThrow(
			/^ERR_NOT_RESETTABLE/,
		)
		await h.api.storage.local.remove("nulo:core:networks@mine")

		await putJournal(h, journalOf({ networkId: "ln", fromChainId: 0, toChainId: 0, l1ChainId: LOCAL_L1_CHAIN_ID }))
		await expect(h.reset.resetStaleNetwork("tn", confirmationOf(view))).rejects.toThrow(/^ERR_RESET_IN_PROGRESS/)
		expect(h.pxe).not.toHaveBeenCalled()
		expect(await h.reset.getPendingReset()).toEqual({ networkId: "ln", running: false })
	})

	test("a capture that cannot reseal every account shown, or finds one on Mainnet's L1, refuses with nothing written", async () => {
		const h = await harness()
		await staleTestnet(h)
		const reseal = vi.spyOn(h.account, "resealImportedForReset").mockResolvedValueOnce(new Map())
		await expect(startReset(h)).rejects.toThrow(/^ERR_STALE_CHANGED/)
		reseal.mockRestore()
		await putAccount(h, { chainId: OLD, address: derived(1, 5), index: 5, l1ChainId: 1 })
		await expect(startReset(h)).rejects.toThrow(/^ERR_NOT_RESETTABLE: Mainnet/)
		expect(await h.repo.getJournal("p1")).toBeUndefined()
		expect(h.pxe).not.toHaveBeenCalled()
	})

	test("a custom network whose node does not confirm its L1 refuses with nothing written (R4)", async () => {
		const h = await harness()
		await putNetwork(h, { id: "dv", name: "My Devnet", chainId: 55, l1ChainId: 5, endpoints: [{ id: "e1", rpcUrl: MY_NODE }] })
		await putAccount(h, { chainId: 55, address: "0xold", index: 0, l1ChainId: 5 })
		await putRecord(h, [{ networkId: "dv", chainId: 55, networkReset: false, addressesMoved: true }])
		h.factory.setOverrides(MY_NODE, {
			getNodeInfo: vi.fn().mockRejectedValue(new Error("down")) as unknown as AztecNode["getNodeInfo"],
		})
		await expect(startReset(h, "dv")).rejects.toThrow(/^ERR_NODE_UNREACHABLE/)
		expect(await h.repo.getJournal("p1")).toBeUndefined()
		expect(await h.reset.getPendingReset()).toBeNull()
		expect(h.events.at(-1)).toEqual({ profileId: "p1", networkId: "dv", running: false })
	})

	test("two calls run once; the second joins the flight", async () => {
		const gate = holdAt("network-reset-purging")
		const h = await harness({ gate })
		await staleTestnet(h)
		const view = (await h.reset.getStaleNetwork("tn"))!
		const [a, b] = await Promise.all([
			h.reset.resetStaleNetwork("tn", confirmationOf(view)),
			h.reset.resetStaleNetwork("tn", confirmationOf(view)),
		])
		expect(a.reset?.running).toBe(true)
		expect(b.reset?.running).toBe(true)
		await gate.reached
		await expect(h.reset.resetStaleNetwork("ln", confirmationOf(view))).rejects.toThrow(/^ERR_RESET_IN_PROGRESS/)
		const done = h.settled()
		gate.release()
		await done
		expect(h.pxe).toHaveBeenCalledTimes(1)
		await expect(h.reset.resetStaleNetwork("ln", confirmationOf(view))).rejects.toThrow(/^ERR_NOT_RESETTABLE/)
	})
})

describe("NetworkResetService — the run", () => {
	test("a network reset moves every account to the seed chain, keeps Local, and finishes in order", async () => {
		const h = await harness()
		await staleTestnet(h)
		const localBefore = [...(await storedKeys(h, "nulo:core:accounts@")).filter(([k]) => k.includes(":0:"))]
		const writes = recordWrites(h.api.storage.local, "nulo:core:")
		const done = h.settled()
		await startReset(h)
		expect(await done).toEqual({ profileId: "p1", networkId: "tn", running: false, completed: { addressesMoved: false } })
		writes.restore()

		const row = (await h.network.getNetworksRaw("p1")).find((n) => n.id === "tn")!
		expect(row).toMatchObject({ chainId: NEW, l1ChainId: L1, name: "Testnet" })
		expect(await accountsOn(h, OLD)).toEqual([])
		const moved = (await accountsOn(h, NEW)).sort((a, b) => a.type - b.type || a.index - b.index)
		expect(moved.map((a) => [a.type, a.index, a.name, a.visible, a.address])).toEqual([
			[0, 0, "Account 1", true, derived(L1, 0)],
			[0, 1, "Account 2", false, derived(L1, 1)],
			[1, 0, "Imported 1", true, importedAddr(SK1)],
			[1, 1, "Imported 2", true, importedAddr(SK2)],
		])
		await expect(h.account.getAccountContract("p1", NEW, importedAddr(SK2))).resolves.toMatchObject({})
		expect([...(await storedKeys(h, "nulo:core:accounts@")).filter(([k]) => k.includes(":0:"))]).toEqual(localBefore)
		expect(h.pxe.mock.calls).toEqual([["p1", OLD]])
		expect(h.purgeForAccounts).toHaveBeenCalledWith(
			expect.arrayContaining([derived(L1, 0), derived(L1, 1), importedAddr(SK1), importedAddr(SK2)]),
			"p1",
			OLD,
		)
		expect(h.purgeForChain.mock.calls).toEqual([["p1", OLD]])

		const finish = writes.log.filter((w) => /network-reset/.test(w))
		expect(finish.slice(-2)).toEqual(["set:nulo:core:network-reset-done@p1", "remove:nulo:core:network-reset@p1"])
		expect(h.journalAtSeeding).toEqual([undefined])
		expect(await h.reset.takeResetNotice("p2")).toBeNull()
		expect(await h.reset.takeResetNotice("p1")).toEqual({ networkId: "tn", addressesMoved: false })
		expect(await h.reset.takeResetNotice("p1")).toBeNull()
	})

	test("the record entry is removed before the journal", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putRecord(h, [
			{ networkId: "tn", chainId: OLD, networkReset: true, addressesMoved: false },
			{ networkId: "zz", chainId: 9, networkReset: false, addressesMoved: true },
		])
		const writes = recordWrites(h.api.storage.local, "nulo:core:")
		const done = h.settled()
		await startReset(h)
		await done
		writes.restore()
		const entry = writes.log.lastIndexOf("set:nulo:core:stale-networks@p1")
		const journalGone = writes.log.indexOf("remove:nulo:core:network-reset@p1")
		expect(entry).toBeGreaterThan(-1)
		expect(entry).toBeLessThan(journalGone)
		expect((await h.repo.getRecord("p1"))?.entries.map((e) => e.networkId)).toEqual(["zz"])
	})

	test("an address change re-creates the derived accounts at their true addresses, with no notice when there are none", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: NEW, l1ChainId: L1, kind: "testnet" })
		await putAccount(h, { chainId: NEW, address: "0xold0", index: 0 })
		await putAccount(h, { chainId: NEW, address: "0xold1", index: 1, name: "Savings" })
		await putRecord(h, [{ networkId: "tn", chainId: NEW, networkReset: false, addressesMoved: true }])
		let done = h.settled()
		await startReset(h)
		expect((await done).completed).toEqual({ addressesMoved: true })
		expect((await accountsOn(h, NEW)).map((a) => [a.index, a.name, a.address]).sort()).toEqual([
			[0, "Account 1", derived(L1, 0)],
			[1, "Savings", derived(L1, 1)],
		])
		expect(await h.repo.getRecord("p1")).toBeUndefined()
		expect(await h.reset.takeResetNotice("p1")).toEqual({ networkId: "tn", addressesMoved: true })

		const empty = await harness()
		await putNetwork(empty, { id: "tn", name: "Testnet", chainId: OLD, l1ChainId: L1, kind: "testnet" })
		done = empty.settled()
		await startReset(empty)
		expect((await done).completed).toBeDefined()
		expect(await empty.reset.takeResetNotice("p1")).toBeNull()
	})
})

describe("NetworkResetService — resume and forged journals", () => {
	async function resume(h: H) {
		const done = h.settled()
		await h.reset.resetStaleNetwork("tn", {
			networkReset: false,
			addressesMoved: false,
			accountCount: 0,
			unmovableCount: 0,
			switchToSeedNode: false,
			probedEndpoint: null,
		})
		return done
	}

	test("from a captured journal: confirmed is ignored and the run completes", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putJournal(h, journalOf())
		expect((await resume(h)).completed).toBeDefined()
		expect((await accountsOn(h, NEW)).map((a) => a.address).sort()).toEqual([derived(L1, 0), derived(L1, 1)].sort())
	})

	test("after the purge ran and before `purged` was saved: the purge runs again and the run completes", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putJournal(h, journalOf())
		await h.network.purgeChain("p1", OLD, "tn")
		h.pxe.mockClear()
		expect((await resume(h)).completed).toBeDefined()
		expect(h.pxe).toHaveBeenCalledWith("p1", OLD)
		expect((await accountsOn(h, NEW)).length).toBe(2)
	})

	test.each<[string, Partial<ResetJournal>]>([
		["a network reset", { fromChainId: OLD, toChainId: NEW }],
		["both causes", { fromChainId: OLD, toChainId: NEW, cause: { networkReset: true, addressesMoved: true } }],
	])("from `purged` with the rewrite not landed (%s): rewrites without purging", async (_label, over) => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: OLD, l1ChainId: L1, kind: "testnet" })
		await putJournal(h, journalOf({ ...over, purged: true }))
		expect((await resume(h)).completed).toEqual({ addressesMoved: over.cause?.addressesMoved ?? false })
		expect(h.pxe).not.toHaveBeenCalled()
		expect((await h.network.getNetworksRaw("p1"))[0]?.chainId).toBe(NEW)
		expect((await accountsOn(h, NEW)).length).toBe(2)
	})

	test("address-only after the accounts were deleted, and from a partial `done`: no duplicate rows", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: NEW, l1ChainId: L1, kind: "testnet" })
		const journal = journalOf({ fromChainId: NEW, toChainId: NEW, purged: true, cause: { networkReset: false, addressesMoved: true } })
		journal.accounts[0]!.done = true
		await putAccount(h, { chainId: NEW, address: derived(L1, 0), index: 0 })
		await putJournal(h, journal)
		const recreate = vi.spyOn(h.account, "recreateForReset")
		expect((await resume(h)).completed).toBeDefined()
		expect((await accountsOn(h, NEW)).map((a) => a.index).sort()).toEqual([0, 1])
		expect(recreate.mock.calls.map(([, , entry]) => entry.index)).toEqual([1])
	})

	test("a resume whose row is gone is refused and keeps the journal", async () => {
		const h = await harness()
		await putJournal(h, journalOf())
		await putNetwork(h, { id: "ln", name: "Local Network", chainId: 0, kind: "local" })
		await h.api.storage.local.set({ "nulo:core:networks@tn": JSON.stringify({ id: "tn" }) })
		await expect(resume(h)).rejects.toThrow(/^ERR_NOT_RESETTABLE/)
		expect(await h.repo.getJournal("p1")).toBeDefined()
		expect(await h.reset.getPendingReset()).toEqual({ networkId: "tn", running: false })
		expect(h.pxe).not.toHaveBeenCalled()
	})

	test.each<[string, Partial<ResetJournal>]>([
		["names another row's chain", { fromChainId: 0 }],
		["claims Mainnet's L1", { l1ChainId: 1 }],
		["claims an L1 that is not the seed's", { l1ChainId: 5 }],
		["is a network cause with no chain change", { toChainId: OLD }],
		["targets a chain that is not the seed's", { toChainId: 999 }],
	])("a forged journal that %s purges nothing and writes no account", async (_label, over) => {
		const h = await harness()
		await staleTestnet(h)
		await putJournal(h, journalOf(over))
		const before = await storedKeys(h, "nulo:core:accounts@")
		expect((await resume(h)).failed).toBe(true)
		expect(h.pxe).not.toHaveBeenCalled()
		expect(await storedKeys(h, "nulo:core:accounts@")).toEqual(before)
	})

	test.each([false, true])(
		"a chain-0 journal on an L1 other than the local one is refused and kept, purging nothing (purged: %s)",
		async (purged) => {
			const h = await harness()
			await putNetwork(h, { id: "tn", name: "Zero", chainId: 0, l1ChainId: L1 })
			await putAccount(h, { chainId: 0, address: derived(L1, 0), index: 0 })
			await putJournal(h, journalOf({ fromChainId: 0, toChainId: 0, purged, cause: { networkReset: false, addressesMoved: true } }))
			const before = await storedKeys(h, "nulo:core:accounts@")
			expect((await resume(h)).failed).toBe(true)
			expect(h.pxe).not.toHaveBeenCalled()
			expect(h.purgeForAccounts).not.toHaveBeenCalled()
			expect(h.purgeForChain).not.toHaveBeenCalled()
			expect(await storedKeys(h, "nulo:core:accounts@")).toEqual(before)
			expect(await h.repo.getJournal("p1")).toBeDefined()
		},
	)

	test("a chain-0 journal on the local L1 resumes and completes", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Zero", chainId: 0, l1ChainId: LOCAL_L1_CHAIN_ID })
		const journal = journalOf({
			fromChainId: 0,
			toChainId: 0,
			l1ChainId: LOCAL_L1_CHAIN_ID,
			cause: { networkReset: false, addressesMoved: true },
		})
		journal.accounts = [{ type: 0, index: 0, name: "Account 1", visible: true, oldAddress: "0xold", done: false }]
		await putJournal(h, journal)
		expect((await resume(h)).completed).toBeDefined()
		expect((await accountsOn(h, 0)).map((a) => a.address)).toEqual([derived(LOCAL_L1_CHAIN_ID, 0)])
	})

	test("a forged address-only journal for a custom network on Mainnet's L1 purges nothing", async () => {
		const h = await harness()
		await putNetwork(h, { id: "mn", name: "Mainnet", chainId: 77, l1ChainId: 1 })
		await putAccount(h, { chainId: 77, address: "0xmain", index: 0, l1ChainId: 1 })
		await putJournal(
			h,
			journalOf({
				networkId: "mn",
				fromChainId: 77,
				toChainId: 77,
				l1ChainId: 1,
				cause: { networkReset: false, addressesMoved: true },
			}),
		)
		const done = h.settled()
		await h.reset.resetStaleNetwork("mn", {
			networkReset: false,
			addressesMoved: false,
			accountCount: 0,
			unmovableCount: 0,
			switchToSeedNode: false,
			probedEndpoint: null,
		})
		expect((await done).failed).toBe(true)
		expect(h.pxe).not.toHaveBeenCalled()
		expect((await accountsOn(h, 77)).map((a) => a.address)).toEqual(["0xmain"])
	})

	test("a forged journal that claims `purged` purges nothing", async () => {
		const h = await harness()
		await staleTestnet(h)
		await putJournal(h, journalOf({ purged: true }))
		await resume(h)
		expect(h.pxe).not.toHaveBeenCalled()
		expect(h.purgeForAccounts).not.toHaveBeenCalled()
		expect(h.purgeForChain).not.toHaveBeenCalled()
	})

	test("an imported entry whose ciphertext does not open, or derives another address, writes no account", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: NEW, l1ChainId: L1, kind: "testnet" })
		const sealedForOther = await sealImportedSigningKeyV2(dekOf(), NEW, "0xi99", SK1.toBuffer() as Uint8Array<ArrayBuffer>)
		for (const entry of [
			{ newAddress: importedAddr(SK1), encryptedSigningKey: "garbage" },
			{ newAddress: "0xi99", encryptedSigningKey: sealedForOther },
		]) {
			await putJournal(
				h,
				journalOf({
					fromChainId: NEW,
					purged: true,
					cause: { networkReset: false, addressesMoved: true },
					accounts: [{ type: 1, index: 0, name: "I", visible: true, oldAddress: "0xx", done: false, ...entry }],
				}),
			)
			expect((await resume(h)).failed).toBe(true)
			expect(await accountsOn(h, NEW)).toEqual([])
		}
	})

	test("a lock keeps the journal; a deletion that removes it ends the run without writing it back", async () => {
		const gate = holdAt("network-reset-purged")
		const h = await harness({ gate })
		await staleTestnet(h)
		let done = h.settled()
		await startReset(h)
		await gate.reached
		h.endSession()
		gate.release()
		expect((await done).failed).toBe(true)
		expect((await h.repo.getJournal("p1"))?.purged).toBe(true)
		expect(await h.reset.getPendingReset()).toEqual({ networkId: "tn", running: false })

		const gate2 = holdAt("network-reset-account")
		const h2 = await harness({ gate: gate2 })
		await staleTestnet(h2)
		done = h2.settled()
		await startReset(h2)
		await gate2.reached
		await h2.repo.clearProfile("p1")
		gate2.release()
		expect((await done).failed).toBe(true)
		expect(await h2.repo.getJournal("p1")).toBeUndefined()
	})

	test("a deletion that begins before the journal is written leaves no journal and purges nothing", async () => {
		const h = await harness()
		await staleTestnet(h)
		const commit = h.network.commitResetCapture.bind(h.network)
		vi.spyOn(h.network, "commitResetCapture").mockImplementation(async (...args) => {
			h.deletion.beginDeletion("p1")
			return commit(...args)
		})
		await expect(startReset(h)).rejects.toBeInstanceOf(SessionEndedError)
		expect(await h.repo.getJournal("p1")).toBeUndefined()
		expect(await accountsOn(h, OLD)).toHaveLength(4)
		expect(h.pxe).not.toHaveBeenCalled()
	})

	test("a network added on the new chain during capture refuses the reset before anything is purged", async () => {
		const h = await harness()
		await staleTestnet(h)
		const commit = h.network.commitResetCapture.bind(h.network)
		vi.spyOn(h.network, "commitResetCapture").mockImplementation(async (...args) => {
			await putNetwork(h, { id: "late", name: "Late", chainId: NEW, l1ChainId: L1 })
			return commit(...args)
		})
		await expect(startReset(h)).rejects.toThrow(/^ERR_NOT_RESETTABLE: another network holds the new chain/)
		expect(await h.repo.getJournal("p1")).toBeUndefined()
		expect(await accountsOn(h, OLD)).toHaveLength(4)
		expect(h.pxe).not.toHaveBeenCalled()
	})
})

describe("NetworkResetService — the run lock and the notice", () => {
	test("the lock is set for the whole run and cleared after success, a failure and a refusal; it is never persisted", async () => {
		const gate = holdAt("network-reset-account")
		const h = await harness({ gate })
		await staleTestnet(h)
		await h.api.storage.local.set({ "nulo:core:active-network@p1": "ln" })
		const done = h.settled()
		await startReset(h)
		await gate.reached
		expect(await h.reset.getPendingReset()).toEqual({ networkId: "tn", running: true })
		expect((await h.reset.getStaleNetwork("tn"))?.reset).toMatchObject({ running: true, purged: true, doneCount: 1 })
		await expect(h.network.deleteNetwork("tn")).rejects.toThrow(/^RESET_RUNNING/)

		const other = new NetworkResetService(new LoggerStore(new ConfigStore()), h.api)
		const services = new ServiceCollection()
		for (const name of [
			PROFILE_SERVICE_NAME,
			TRANSACTION_SERVICE_NAME,
			TOKEN_SERVICE_NAME,
			DAPP_SESSION_SERVICE_NAME,
			ACCOUNT_INTEGRITY_COORDINATOR_NAME,
		]) {
			services.add(
				svc(name, {
					getActiveProfile: async () => ({ id: "p1" }),
					bootVerification: Promise.resolve(),
				}),
			)
		}
		services.add(svc("network", { setResetRunProbe: () => {}, getNetworksRaw: async () => [] }))
		services.add(svc("account", {}))
		services.add(other)
		await services.start()
		expect(await other.getPendingReset()).toEqual({ networkId: "tn", running: false })

		gate.release()
		await done
		expect(await h.reset.getPendingReset()).toBeNull()

		h.endSession()
		await putNetwork(h, { id: "t2", name: "Other", chainId: 66, l1ChainId: 5 })
		await putAccount(h, { chainId: 66, address: "0xq", index: 0, l1ChainId: 5 })
		await putRecord(h, [{ networkId: "t2", chainId: 66, networkReset: false, addressesMoved: true }])
		h.factory.setOverrides(TESTNET_RPC_URL, {
			getNodeInfo: vi.fn().mockRejectedValue(new Error("down")) as unknown as AztecNode["getNodeInfo"],
		})
		await expect(startReset(h, "t2")).rejects.toThrow(/^ERR_NODE_UNREACHABLE/)
		expect(await h.reset.getPendingReset()).toBeNull()
	})

	test("waitForRunEnd resolves when the run ends, or after 60 s", async () => {
		const gate = holdAt("network-reset-purging")
		const h = await harness({ gate })
		await staleTestnet(h)
		await expect(h.reset.waitForRunEnd()).resolves.toBeUndefined()
		await startReset(h)
		await gate.reached
		vi.useFakeTimers()
		let waited = false
		const wait = h.reset.waitForRunEnd().then(() => {
			waited = true
		})
		await vi.advanceTimersByTimeAsync(59_999)
		expect(waited).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		await wait
		expect(waited).toBe(true)
		vi.useRealTimers()

		const second = h.reset.waitForRunEnd()
		const done = h.settled()
		gate.release()
		await done
		await second
	})

	test("a notice is withheld while its network's journal exists, then taken once", async () => {
		const h = await harness()
		await putJournal(h, journalOf())
		await h.repo.withLock("p1", () => h.repo.setNoticeLocked("p1", { networkId: "tn", addressesMoved: false }))
		expect(await h.reset.takeResetNotice("p1")).toBeNull()
		await h.repo.withLock("p1", () => h.repo.deleteJournalLocked("p1"))
		const [a, b] = await Promise.all([h.reset.takeResetNotice("p1"), h.reset.takeResetNotice("p1")])
		expect([a, b].filter(Boolean)).toEqual([{ networkId: "tn", addressesMoved: false }])
	})

	test("a record change emits for each network whose entry changed", async () => {
		const h = await harness()
		await putRecord(h, [{ networkId: "tn", chainId: OLD, networkReset: true, addressesMoved: false }])
		await putRecord(h, [
			{ networkId: "tn", chainId: OLD, networkReset: true, addressesMoved: false },
			{ networkId: "ln", chainId: 0, networkReset: false, addressesMoved: true },
		])
		expect(h.events).toEqual([
			{ profileId: "p1", networkId: "tn" },
			{ profileId: "p1", networkId: "ln" },
		])
	})
})

describe("AccountService.recreateForReset", () => {
	test("a derived account keeps its index, name and visibility, never probes, and is written once", async () => {
		const h = await harness()
		await putNetwork(h, { id: "dv", name: "Devnet", chainId: 55, l1ChainId: 5 })
		const probe = vi.spyOn(h.network, "resolveVerifiedL1ChainId")
		const added = vi.fn()
		h.account.onAccountAdded.add(added)
		const entry = { type: 0 as const, index: 3, name: "Savings", visible: false, oldAddress: "0xold", done: false }
		await h.account.recreateForReset("p1", 55, entry, 5)
		await h.account.recreateForReset("p1", 55, entry, 5)
		expect((await accountsOn(h, 55)).map((a) => [a.index, a.name, a.visible, a.address, a.l1ChainId])).toEqual([
			[3, "Savings", false, derived(5, 3), 5],
		])
		expect(probe).not.toHaveBeenCalled()
		expect(added).toHaveBeenCalledTimes(1)
	})

	test("a derived account whose address another row holds is left to it: nothing is written at any index", async () => {
		const h = await harness()
		await putNetwork(h, { id: "dv", name: "Devnet", chainId: 55, l1ChainId: 5 })
		const held = await putImported(h, 55, SK1, 0, { address: derived(5, 3) })
		const added = vi.fn()
		h.account.onAccountAdded.add(added)
		const entry = { type: 0 as const, index: 3, name: "Savings", visible: true, oldAddress: "0xold", done: false }
		await h.account.recreateForReset("p1", 55, entry, 5)
		expect((await accountsOn(h, 55)).map((a) => [a.type, a.index, a.address])).toEqual([[1, 0, held]])
		expect(added).not.toHaveBeenCalled()
	})

	test("an imported account writes its key row before its account row, and only once", async () => {
		const h = await harness()
		await putNetwork(h, { id: "tn", name: "Testnet", chainId: NEW, l1ChainId: L1, kind: "testnet" })
		const address = importedAddr(SK1)
		const sealed = await sealImportedSigningKeyV2(dekOf(), NEW, address, SK1.toBuffer() as Uint8Array<ArrayBuffer>)
		const entry = {
			type: 1 as const,
			index: 0,
			name: "Imported 1",
			visible: true,
			oldAddress: "0xold",
			newAddress: address,
			encryptedSigningKey: sealed,
			done: false,
		}
		const writes = recordWrites(h.api.storage.local, "nulo:core:")
		await h.account.recreateForReset("p1", NEW, entry, L1)
		await h.account.recreateForReset("p1", NEW, entry, L1)
		writes.restore()
		const id = accountRowId("p1", NEW, address)
		expect(writes.log.filter((w) => w.includes(id))).toEqual([
			`set:nulo:core:imported-account-keys@${id}`,
			`set:nulo:core:accounts@${id}`,
		])
		await expect(h.account.getAccountContract("p1", NEW, address)).resolves.toMatchObject({})
	})
})
