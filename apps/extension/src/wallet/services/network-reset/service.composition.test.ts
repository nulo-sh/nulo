/**
 * Composition test: one stale network reset through the real service graph. The reset, Network,
 * Account, Token, Fpc, AuthRegistry, Transaction, OperationJournal, DappSession and
 * IncomingTransfer services run on FakeBrowserApi; the profile and the services they only read are
 * canned stubs, the offscreen PXE clear is a call recorder, and derivation is stubbed (the bb WASM
 * does not load here). Stored rows are the oracle. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { GrumpkinScalar } from "@aztec-labs/foundation/curves/grumpkin"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"

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

import { asImportedKeysDek, sealImportedSigningKeyV2 } from "@nulo/wallet-crypto"
import type { RestoreGateHoldPoint } from "@/e2e/restore-gate"
import { FakeNodeFactory } from "@/core/testing/fake-node-factory"
import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { LoggerStore } from "@/wallet/logger"
import { ACCOUNT_INTEGRITY_COORDINATOR_NAME } from "@/wallet/services/account-integrity/coordinator"
import { AccountService } from "@/wallet/services/account/service"
import { accountRowId } from "@/wallet/services/account/spec"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { svc } from "@/wallet/services/composition-harness"
import { ConfigService } from "@/wallet/services/config/service"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { AccessLevel } from "@/wallet/services/dapp-session/spec"
import { ExecutionService } from "@/wallet/services/execution/service"
import { FpcService } from "@/wallet/services/fpc/service"
import type { PublicEventReader } from "@/wallet/services/incoming-transfer/public-event-indexer"
import { IncomingTransferRepository } from "@/wallet/services/incoming-transfer/repository"
import { IncomingTransferService } from "@/wallet/services/incoming-transfer/service"
import { noteRecordId } from "@/wallet/services/incoming-transfer/spec"
import { NetworkService } from "@/wallet/services/network/service"
import { NoteService } from "@/wallet/services/note/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { PriceService } from "@/wallet/services/price/service"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import { makeShallowPxeFake } from "@/wallet/services/pxe/shallow-port.fake"
import { TaskService } from "@/wallet/services/task/service"
import { TokenBalanceService } from "@/wallet/services/token-balance/service"
import { TokenService } from "@/wallet/services/token/service"
import { TOKEN_LIST_SERVICE_NAME } from "@/wallet/services/token-list/spec"
import { TransactionService } from "@/wallet/services/transaction/service"
import { TxStatus } from "@/wallet/services/transaction/spec"
import { NetworkResetService } from "./service"
import type { StaleNetworkChanged } from "./spec"

const OLD = 4321
const NEW = CHAIN_IDS.TESTNET
const L1 = TESTNET_L1_CHAIN_ID
const LOCAL = 0
const dekOf = () => asImportedKeysDek(new Uint8Array(32).fill(0x11) as Uint8Array<ArrayBuffer>)
const derived = (l1: number, index: number) => `0xn${(BigInt(l1) * 1000n + BigInt(index)).toString(16)}`
const SK = GrumpkinScalar.fromString(`0x${"0".repeat(62)}2a`)
const IMPORTED = `0xi${SK.toBigInt().toString(16)}`
const CONTRACT = `0x${"c3".repeat(32)}`

const reader: PublicEventReader = {
	fetchTransferPage: async () => ({ events: [], scannedThrough: null, hasMore: false, dropped: false }),
	getScanTips: async () => ({
		checkpointedBlockNumber: 1,
		checkpointedBlockHash: "0xc",
		finalizedBlockNumber: 1,
		proposedBlockHash: "0xp",
	}),
	getTokenClassStatus: async () => "standard",
	getLatestBlockNumber: async () => 1,
	getChainTipOnce: async () => 1,
}

type Hold = { at: RestoreGateHoldPoint; reached: Promise<void>; hit: () => void; released: Promise<void>; release: () => void }

function holdAt(at: RestoreGateHoldPoint): Hold {
	const hold = { at } as Hold
	hold.reached = new Promise<void>((resolve) => {
		hold.hit = resolve
	})
	hold.released = new Promise<void>((resolve) => {
		hold.release = resolve
	})
	return hold
}

async function harness(hold?: Hold) {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = () => new LoggerStore(new ConfigStore())
	const deletion = new ProfileDeletionState()
	const macKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const fence = () => ({ profileId: "p1", epoch: deletion.capture("p1"), session: 1 })
	const task = { complete: vi.fn(), fail: vi.fn(), startSubtask: vi.fn() }
	task.startSubtask.mockReturnValue(task)

	const services = new ServiceCollection()
	services.add(
		svc(ProfileService.name, {
			onProfileDeleted: new EventHandler(),
			onActiveProfileChanged: new EventHandler(),
			getActiveProfile: async () => ({ id: "p1", name: "P", type: "password" }),
			getProfiles: async () => [{ id: "p1" }],
			getDeletionState: () => deletion,
			captureExecutionFence: async () => fence(),
			captureRunFence: async () => ({ ...fence(), incarnation: "w1" }),
			assertRunFence: async () => {},
			isFenceLive: () => true,
			isRecoveryMode: () => false,
			getProfileSecret: async () => new Fr(42n),
			getProfileDek: async () => dekOf(),
			deriveDappSessionMacKey: async () => macKey,
		}),
	)
	const network = new NetworkService(logger(), api, new FakeNodeFactory())
	services.add(network)
	const account = new AccountService(logger(), api)
	services.add(account)
	services.add(new TransactionService(logger(), api))
	const shallow = makeShallowPxeFake()
	services.add(svc(TOKEN_LIST_SERVICE_NAME, { getSnapshot: () => undefined, onListChanged: new EventHandler() }))
	services.add(new TokenService(logger(), api, () => shallow.client, { getSeeds: async () => [] }))
	services.add(new FpcService(logger(), api))
	services.add(new AuthRegistryService(logger(), api))
	const journal = new OperationJournalService(logger(), api)
	services.add(journal)
	const sessions = new DappSessionService(logger(), api)
	services.add(sessions)
	services.add(new IncomingTransferService(logger(), api, 1_000_000, reader))
	services.add(svc(ExecutionService.name, {}))
	services.add(svc(TaskService.name, { startNewTask: () => task, getTaskSync: () => ({ status: 0 }) }))
	services.add(svc(NoteService.name, { getNotesRaw: async () => [], getBlockTimestamp: async () => undefined }))
	services.add(svc(ConfigService.name, { getValue: async () => undefined }))
	services.add(svc(TokenBalanceService.name, { requestBalanceRefresh: async () => ({ busy: true }) }))
	services.add(svc(PriceService.name, { getQuotes: async () => ({}) }))
	services.add(svc(ACCOUNT_INTEGRITY_COORDINATOR_NAME, { bootVerification: Promise.resolve() }))
	const reset = new NetworkResetService(logger(), api, {
		waitAt: async (at) => {
			if (hold?.at !== at) return
			hold.hit()
			await hold.released
		},
	})
	services.add(reset)
	await services.start()
	const pxeClears: Array<[string, number]> = []
	// biome-ignore lint/suspicious/noExplicitAny: the offscreen PXE is a process boundary, stubbed by reach-in
	;(network as any).pxeServiceClient = {
		clearChainState: async (profileId: string, chainId: number) => pxeClears.push([profileId, chainId]),
	}
	return { api, network, account, journal, sessions, reset, pxeClears }
}

type H = Awaited<ReturnType<typeof harness>>

const snapshot = async (h: H) => (await h.api.storage.local.get(null)) as Record<string, unknown>

/** The storage keys `write` adds, so rows a service writes through its own API can be tagged. */
async function keysAddedBy(h: H, write: () => Promise<unknown>): Promise<string[]> {
	const before = new Set(Object.keys(await snapshot(h)))
	await write()
	return Object.keys(await snapshot(h)).filter((k) => !before.has(k))
}

/** One chain's rows in every chain-scoped store, written as each service stores them. */
async function seedChain(h: H, networkId: string, chainId: number, l1ChainId: number, n: number): Promise<string[]> {
	const address = derived(l1ChainId, 0)
	const raw: Record<string, unknown> = {
		[`nulo:core:accounts@${accountRowId("p1", chainId, address)}`]: {
			profileId: "p1",
			chainId,
			address,
			index: 0,
			type: 0,
			l1ChainId,
			name: "Account 1",
			visible: true,
		},
		[`nulo:core:tokens@${n}`]: { id: n, profileId: "p1", chainId, contract: CONTRACT, name: "Token", symbol: "TKA", decimals: 18 },
		[`nulo:core:txs@0xt${n}`]: {
			chainId,
			profileId: "p1",
			networkId,
			account: address,
			nonce: "0x1",
			feePaymentMethod: 0,
			hash: `0xt${n}`,
			createdAt: 1,
			updatedAt: 1,
			status: TxStatus.Proven,
			origin: {},
			calls: [],
		},
		[`nulo:core:auth-registry@${n}`]: { id: n, profileId: "p1", chainId, account: address, hash: `0xa${n}`, content: {} },
		[`nulo:core:fpcs@f${n}`]: { id: `f${n}`, profileId: "p1", chainId, type: 2, address: `0xf${n}` },
	}
	await h.api.storage.local.set(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, JSON.stringify(v)])))
	const viaServices = await keysAddedBy(h, async () => {
		await h.journal.createOperation({ kind: "transfer", origin: "popup", profileId: "p1", networkId })
		await h.sessions.addDappSession({ url: `https://dapp${n}.example` }, [], [address], AccessLevel.Transactions, String(chainId))
		const repo = new IncomingTransferRepository(h.api)
		await repo.setTrust("p1", networkId, CONTRACT, "pending")
		await repo.upsertRecord({
			kind: "note",
			id: noteRecordId("p1", networkId, `0x${n.toString(16).padStart(64, "0")}`),
			profileId: "p1",
			networkId,
			accountAddress: address,
			contract: CONTRACT,
			tokenId: n,
			owner: address,
			amountRaw: "100",
			noteHash: `0x${"ab".repeat(32)}`,
			txHash: `0xt${n}`,
			l2BlockNumber: 1,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		})
	})
	return [...Object.keys(raw), ...viaServices]
}

/** A Testnet left behind on `OLD` (same L1, so addresses stay) beside a working Local Network,
 *  each with a row in every chain-scoped store; Testnet also holds a hidden account and an
 *  imported one. */
async function twoChains(h: H) {
	const row = (id: string, name: string, chainId: number, l1ChainId: number, kind: string, rpcUrl: string) => ({
		[`nulo:core:networks@${id}`]: JSON.stringify({
			id,
			profileId: "p1",
			name,
			chainId,
			l1ChainId,
			kind,
			primaryEndpointId: "e1",
			endpoints: [{ id: "e1", rpcUrl }],
		}),
	})
	await h.api.storage.local.set({
		...row("tn", "Testnet", OLD, L1, "testnet", TESTNET_RPC_URL),
		...row("ln", "Local Network", LOCAL, LOCAL_L1_CHAIN_ID, "local", "http://localhost:8080"),
		"nulo:core:active-network@p1": "tn",
		"nulo:core:stale-networks@p1": JSON.stringify({
			profileId: "p1",
			accountSetDigest: "d",
			entries: [{ networkId: "tn", chainId: OLD, networkReset: true, addressesMoved: false }],
		}),
	})
	const stale = await seedChain(h, "tn", OLD, L1, 1)
	const local = await seedChain(h, "ln", LOCAL, LOCAL_L1_CHAIN_ID, 2)
	const hidden = derived(L1, 1)
	const sealed = await sealImportedSigningKeyV2(dekOf(), OLD, IMPORTED, SK.toBuffer() as Uint8Array<ArrayBuffer>)
	const extra = {
		[`nulo:core:accounts@${accountRowId("p1", OLD, hidden)}`]: {
			profileId: "p1",
			chainId: OLD,
			address: hidden,
			index: 1,
			type: 0,
			l1ChainId: L1,
			name: "Savings",
			visible: false,
		},
		[`nulo:core:accounts@${accountRowId("p1", OLD, IMPORTED)}`]: {
			profileId: "p1",
			chainId: OLD,
			address: IMPORTED,
			index: 0,
			type: 1,
			l1ChainId: L1,
			name: "Imported 1",
			visible: true,
		},
		[`nulo:core:imported-account-keys@${accountRowId("p1", OLD, IMPORTED)}`]: {
			profileId: "p1",
			chainId: OLD,
			address: IMPORTED,
			encryptedSigningKey: sealed,
		},
	}
	await h.api.storage.local.set(Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, JSON.stringify(v)])))
	return { stale: [...stale, ...Object.keys(extra)], local }
}

function settled(h: H): Promise<StaleNetworkChanged> {
	return new Promise((resolve) => {
		const done = (e: StaleNetworkChanged) => {
			if (!e.completed && !e.failed) return
			h.reset.onStaleNetworkChanged.remove(done)
			resolve(e)
		}
		h.reset.onStaleNetworkChanged.add(done)
	})
}

async function startReset(h: H) {
	const view = await h.reset.getStaleNetwork("tn")
	if (!view) throw new Error("Testnet is not stale")
	const ended = settled(h)
	await h.reset.resetStaleNetwork("tn", {
		networkReset: view.cause.networkReset,
		addressesMoved: view.cause.addressesMoved,
		accountCount: view.accounts.length,
		unmovableCount: view.unmovable.length,
		switchToSeedNode: view.switchToSeedNode,
		probedEndpoint: view.probedEndpoint,
	})
	return { ended }
}

describe("a stale network reset through the real service graph", () => {
	test("wipes every store's rows for the old chain, leaves the other chain byte-identical, and re-creates the accounts", async () => {
		const h = await harness()
		const { stale, local } = await twoChains(h)
		const before = await snapshot(h)
		expect(stale.length).toBeGreaterThanOrEqual(12)
		expect(local.length).toBe(stale.length - 3)

		const { ended } = await startReset(h)
		await expect(ended).resolves.toMatchObject({ completed: { addressesMoved: false } })

		const after = await snapshot(h)
		expect(stale.filter((k) => k in after)).toEqual([])
		expect(Object.fromEntries(local.map((k) => [k, after[k]]))).toEqual(Object.fromEntries(local.map((k) => [k, before[k]])))
		expect(h.pxeClears).toEqual([["p1", OLD]])

		const moved = (await h.account.getAccountsRaw("p1")).filter((a) => a.chainId === NEW)
		expect(moved.map((a) => [a.type, a.index, a.name, a.visible, a.address]).sort()).toEqual([
			[0, 0, "Account 1", true, derived(L1, 0)],
			[0, 1, "Savings", false, derived(L1, 1)],
			[1, 0, "Imported 1", true, IMPORTED],
		])
		await expect(h.account.getAccountContract("p1", NEW, IMPORTED)).resolves.toBeDefined()
		expect(JSON.parse(after["nulo:core:networks@tn"] as string)).toMatchObject({
			id: "tn",
			name: "Testnet",
			chainId: NEW,
			l1ChainId: L1,
		})
		expect(after["nulo:core:active-network@p1"]).toBe("tn")
		expect(after["nulo:core:network-reset@p1"]).toBeUndefined()
		expect(after["nulo:core:stale-networks@p1"]).toBeUndefined()
		expect(await h.reset.takeResetNotice("p1")).toEqual({ networkId: "tn", addressesMoved: false })
	})

	test("while the reset holds the old chain mid-purge, the other network stays readable and editable", async () => {
		const hold = holdAt("network-reset-purging")
		const h = await harness(hold)
		await twoChains(h)
		const { ended } = await startReset(h)
		await hold.reached

		expect(await h.network.isChainLive("p1", OLD)).toBe(false)
		expect(await h.network.isChainLive("p1", LOCAL)).toBe(true)
		await expect(h.network.renameNetwork("ln", "Local 2")).resolves.toMatchObject({ name: "Local 2" })
		expect((await h.account.getAccounts("p1", LOCAL)).map((a) => a.address)).toEqual([derived(LOCAL_L1_CHAIN_ID, 0)])
		await expect(h.sessions.tryGetDappSessionByOriginAndChain("https://dapp2.example", String(LOCAL))).resolves.toBeDefined()

		hold.release()
		await expect(ended).resolves.toMatchObject({ completed: { addressesMoved: false } })
		expect((await h.account.getAccounts("p1", LOCAL)).map((a) => a.address)).toEqual([derived(LOCAL_L1_CHAIN_ID, 0)])
		expect(await h.network.isChainLive("p1", NEW)).toBe(true)
	})

	test("deleting a network keeps its dApp sessions: only a reset deletes them, and the next connect drops these", async () => {
		const h = await harness()
		await twoChains(h)
		await h.network.deleteNetwork("ln")
		expect(await h.account.getAccountsRaw("p1").then((rows) => rows.filter((a) => a.chainId === LOCAL))).toEqual([])
		await expect(h.sessions.tryGetDappSessionByOriginAndChain("https://dapp2.example", String(LOCAL))).resolves.toBeDefined()
	})
})
