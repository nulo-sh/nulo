/**
 * Unit pins for the trust-point primitives on `AuthRegistryService`:
 * `recordPendingAuthwits` / `reconcileAuthwits` / `assertWithinCap` / the scoped sync +
 * reconcile paths / `restore`. These touch only the `authwits` EntityStorage + the internal
 * lock, so the service is constructed directly (no `init()`/deps) over an in-memory
 * `FakeBrowserApi`, or over stub peers where `ensureInitialized()` gates the call.
 *
 * The end-to-end recording + reconcile path is covered by the `authwit-lifecycle`
 * network e2e; these pin the unit behavior the e2e can't isolate (dedup, the
 * mined→confirm / dropped→remove transitions, the per-scope ceiling, the tuple scoping).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TxStatus as AztecTxStatus } from "@aztec-labs/stdlib/tx"
import { JobCancelledError, SessionEndedError, TermsAcceptanceRequiredError } from "@nulo/extension-messaging/errors"
import { JobCancelledSentinel } from "@nulo/wallet-core/jobs"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import type { AuthwitContent } from "@/wallet/services/execution/spec"
import { EXECUTION_SERVICE_NAME } from "@/wallet/services/execution/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { TASK_SERVICE_NAME, TaskStatus } from "@/wallet/services/task/spec"
import { startedTaskService } from "@/wallet/services/task/test-task-service"
import { OriginType, TRANSACTION_SERVICE_NAME, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import { getAuthRegistryAddress } from "@/wallet/utils/auth-registry"
import { awaitedBus } from "../../../../tests/helpers/held-read"
import { svc } from "../composition-harness"
import { recordWrites } from "../storage-write-log"
import { GRANT_BLOCK_WAIT_MS } from "./grant-block"
import { AuthRegistryService, MAX_TRACKED_AUTHWITS_PER_ACCOUNT } from "./service"
import { type Authwit, authwitStatusRowId } from "./spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

/** One key for every profile; the conversion event stays inert. */
const ROW_KEY_SURFACE = await rowKeysForEveryProfile()

const noopLogger = { log: () => {} }
const A = "0xowner"
const P1 = { profileId: "p1", chainId: 1, account: A }
const content = { kind: "call" } as unknown as AuthwitContent
/** The deletion epoch of a profile no deletion has touched. */
const LIVE_EPOCH = 0
/** A grant transaction hash a receipt read accepts. */
const TX1 = `0x${"01".repeat(32)}`

function makeService(): AuthRegistryService {
	// AuthRegistryService binds its two EntityStorage tables to the injected
	// browserApi port; FakeBrowserApi provides an in-memory storage.local.
	// reset() clears the global fake-browser backing between tests.
	const api = new FakeBrowserApi()
	api.reset()
	return withRowKeys(new AuthRegistryService(noopLogger as never, api))
}

/** A service built without `init()` still seals: its stores read the profile service's keys. */
function withRowKeys(s: AuthRegistryService, deletionState = new ProfileDeletionState()): AuthRegistryService {
	;(s as unknown as { profileService: unknown }).profileService = { ...ROW_KEY_SURFACE, getDeletionState: () => deletionState }
	return s
}

/** Direct-storage read (no active-profile gate) — the unit tests below construct the service
 *  without `init()`, so `getAuthwits` (which requires an active profile) is not reachable. */
const rowsOf = async (s: AuthRegistryService, scope = P1): Promise<Authwit[]> =>
	(await (s as unknown as { rowsForScope: (x: typeof P1) => Promise<Authwit[]> }).rowsForScope(scope)) ?? []

describe("AuthRegistryService — pending/reconcile/cap", () => {
	let svc: AuthRegistryService
	beforeEach(() => {
		svc = makeService()
	})

	test("recordPendingAuthwits writes pending, tx-linked rows stamped with the scope tuple", async () => {
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const rows = await rowsOf(svc)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ profileId: "p1", chainId: 1, account: A, hash: "0xh1", pending: true, txHash: TX1 })
	})

	test("recordPendingAuthwits is idempotent on (scope, hash) (no duplicate on retry)", async () => {
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		expect(await rowsOf(svc)).toHaveLength(1)
	})

	test("the same hash under another profile or chain is a distinct row, not a dedup hit", async () => {
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await svc.recordPendingAuthwits({ ...P1, profileId: "p2" }, [{ hash: "0xh1", content }], "0xtx2", LIVE_EPOCH)
		await svc.recordPendingAuthwits({ ...P1, chainId: 2 }, [{ hash: "0xh1", content }], "0xtx3", LIVE_EPOCH)
		expect(await rowsOf(svc)).toHaveLength(1)
		expect(await rowsOf(svc, { ...P1, profileId: "p2" })).toHaveLength(1)
		expect(await rowsOf(svc, { ...P1, chainId: 2 })).toHaveLength(1)
	})

	test("recordPendingAuthwits allocates ids over the PHYSICAL key space — a codec-hidden row is never overwritten", async () => {
		const api = new FakeBrowserApi()
		const s = withRowKeys(new AuthRegistryService(noopLogger as never, api))
		await api.storage.local.set({ "nulo:core:auth-registry@1": JSON.stringify({ id: 1, account: A, hash: "0xhidden", content: null }) })
		await s.recordPendingAuthwits(P1, [{ hash: "0xnew", content }], "0xtx", LIVE_EPOCH)
		const raw = (await api.storage.local.get(null)) as Record<string, string>
		expect(JSON.parse(raw["nulo:core:auth-registry@1"])).toMatchObject({ hash: "0xhidden", content: null })
		expect((await rowsOf(s)).map((r) => r.id)).toEqual([2])
	})

	test("reconcileAuthwits('mined') clears pending → confirmed (durable, kept), and announces the confirmed row", async () => {
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const updated: Authwit[] = []
		svc.onAuthwitUpdated.add((a) => void updated.push(a))
		await svc.reconcileAuthwits(P1, TX1, "mined")
		const rows = await rowsOf(svc)
		expect(rows).toHaveLength(1)
		expect(rows[0].pending).toBe(false)
		expect(updated).toEqual([rows[0]])
	})

	test("reconcileAuthwits('dropped') removes the pending row (grant never landed), announcing a delete and no update", async () => {
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const updated: Authwit[] = []
		const deleted: Authwit[] = []
		svc.onAuthwitUpdated.add((a) => void updated.push(a))
		svc.onAuthwitDeleted.add((a) => void deleted.push(a))
		await svc.reconcileAuthwits(P1, TX1, "dropped")
		expect(await rowsOf(svc)).toHaveLength(0)
		expect(deleted.map((a) => a.hash)).toEqual(["0xh1"])
		expect(updated).toEqual([])
	})

	test("reconcileAuthwits only touches rows for the matching txHash AND the tx's own scope tuple", async () => {
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await svc.recordPendingAuthwits(P1, [{ hash: "0xh2", content }], "0xtx2", LIVE_EPOCH)
		// Equal hashes across profiles/chains: another profile's tx with the same txHash must not
		// confirm or drop this profile's rows.
		await svc.recordPendingAuthwits({ ...P1, profileId: "p2" }, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await svc.recordPendingAuthwits({ ...P1, chainId: 2 }, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await svc.reconcileAuthwits(P1, TX1, "dropped")
		expect((await rowsOf(svc)).map((r) => r.hash)).toEqual(["0xh2"])
		expect(await rowsOf(svc, { ...P1, profileId: "p2" })).toHaveLength(1)
		expect(await rowsOf(svc, { ...P1, chainId: 2 })).toHaveLength(1)
	})

	describe("a send authorized before its profile's deletion began writes no row", () => {
		const freshService = () => {
			const api = new FakeBrowserApi()
			api.reset()
			const deletion = new ProfileDeletionState()
			return { s: withRowKeys(new AuthRegistryService(noopLogger as never, api), deletion), deletion }
		}

		test("refused at entry, the profile's id released for reuse too", async () => {
			const { s, deletion } = freshService()
			const epoch = deletion.capture("p1")
			deletion.beginDeletion("p1")
			deletion.release("p1")
			await expect(s.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, epoch)).rejects.toThrow(/being deleted/)
			expect(await rowsOf(s)).toEqual([])
		})

		test("refused at commit when the deletion begins while the row is prepared", async () => {
			const { s, deletion } = freshService()
			const store = (s as unknown as { authwits: { prepare: (...args: unknown[]) => Promise<unknown> } }).authwits
			const prepare = store.prepare.bind(store)
			vi.spyOn(store, "prepare").mockImplementation(async (...args) => {
				const write = await prepare(...args)
				deletion.beginDeletion("p1")
				return write
			})
			await expect(s.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, deletion.capture("p1"))).rejects.toThrow(
				/being deleted/,
			)
			expect(await rowsOf(s)).toEqual([])
		})

		test("control: an epoch captured after an earlier deletion of the id writes the row", async () => {
			const { s, deletion } = freshService()
			deletion.beginDeletion("p1")
			deletion.release("p1")
			await s.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, deletion.capture("p1"))
			expect((await rowsOf(s)).map((r) => r.hash)).toEqual(["0xh1"])
		})
	})

	test("assertWithinCap blocks pre-send: existing + unique-new over the ceiling throws (per-build, deduped, per scope)", async () => {
		const existing = Array.from({ length: MAX_TRACKED_AUTHWITS_PER_ACCOUNT - 1 }, (_, i) => ({ hash: `0xe${i}`, content }))
		await svc.recordPendingAuthwits(P1, existing, "0xtxe", LIVE_EPOCH) // 255 tracked
		// 255 existing + 2 unique-new = 257 > 256 ⇒ blocked (the per-action bug would pass this).
		await expect(svc.assertWithinCap(P1, ["0xnew1", "0xnew2"])).rejects.toThrow(/exceed the .* tracked public-authwit limit/)
		// 255 existing + 1 unique-new ("0xe0" is already tracked → deduped) = 256 ≤ 256 ⇒ ok.
		await expect(svc.assertWithinCap(P1, ["0xe0", "0xnew1"])).resolves.toBeUndefined()
		// The ceiling is per scope: the same address on another profile/chain starts empty.
		await expect(svc.assertWithinCap({ ...P1, profileId: "p2" }, ["0xnew1", "0xnew2"])).resolves.toBeUndefined()
	})
})

const receiptNode = (status = AztecTxStatus.PROPOSED, blockNumber: number | undefined = 1) => ({
	getTxReceipt: vi.fn(async () => ({ status, blockNumber })),
})

/** Stub-peer harness: the real lifecycle over stubs (init registers the two purge subscribers
 *  + the tx listener). `network` is what `getNetwork` resolves — owned by p1 on chain 1. */
async function makeHarness(opts: { node?: unknown; grantNode?: unknown; activeProfile?: { id: string } | undefined } = {}) {
	const api = new FakeBrowserApi()
	api.reset()
	const deletionState = new ProfileDeletionState()
	const txUpdated = awaitedBus<unknown>()
	let active: { id: string } | undefined = "activeProfile" in opts ? opts.activeProfile : { id: "p1" }
	let session = 1
	const network = {
		id: "net-1",
		profileId: "p1",
		chainId: 1,
		l1ChainId: 1,
		name: "N",
		endpoints: [{ id: "e", rpcUrl: "http://n/1" }],
		primaryEndpointId: "e",
	}
	const nodeForUrl = vi.fn(async (_url: string) => opts.node)
	const grantNodeForUrl = vi.fn(async (_url: string) => opts.grantNode ?? receiptNode())
	const services = new ServiceCollection()
	const captureExecutionFence = vi.fn(async (): Promise<ExecutionFence> => {
		if (!active) throw new Error("Wallet locked")
		return { profileId: active.id, epoch: deletionState.capture(active.id), session }
	})
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			...ROW_KEY_SURFACE,
			getDeletionState: () => deletionState,
			getActiveProfile: async () => active,
			captureExecutionFence,
		}),
	)
	const getNetwork = vi.fn(async () => network)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			getNetwork,
			// The node is resolved by the network's OWN endpoint, never the active profile's chain.
			getNodeForUrl: nodeForUrl,
			getSingleAttemptNodeForUrl: grantNodeForUrl,
			getNode: async () => {
				throw new Error("getNode(chainId) resolves the ACTIVE profile's endpoint — the registry must pin the owned network's URL")
			},
			registerChainPurgeSubscriber: () => {},
		}),
	)
	services.add(svc(ACCOUNT_SERVICE_NAME, { registerAccountPurgeSubscriber: () => {} }))
	// The execution side of the contract: a send under an ended session is refused before it runs.
	const executeSendTransaction = vi.fn(async (...args: unknown[]) => {
		if ((args[4] as ExecutionFence).session !== session) throw new SessionEndedError()
		return "0xtx"
	})
	const estimateSendTransactionFee = vi.fn(async (..._args: unknown[]) => ({ maxFee: "1" }))
	const cancelEstimate = vi.fn(async (_token: string) => {})
	services.add(svc(EXECUTION_SERVICE_NAME, { executeSendTransaction, estimateSendTransactionFee, cancelEstimate }))
	services.add(svc(TRANSACTION_SERVICE_NAME, { onTransactionUpdated: txUpdated }))
	const task = () => ({ complete() {}, completeIfTracked() {}, fail() {}, startSubtask: task })
	services.add(svc(TASK_SERVICE_NAME, { startNewTask: task }))
	const service = new AuthRegistryService(new LoggerStore(new ConfigStore()) as never, api)
	services.add(service)
	await services.start()
	return {
		api,
		deletionState,
		service,
		txUpdated,
		nodeForUrl,
		grantNodeForUrl,
		captureExecutionFence,
		getNetwork,
		executeSendTransaction,
		estimateSendTransactionFee,
		cancelEstimate,
		setActive: (p: { id: string } | undefined) => (active = p),
		/** A lock followed by an unlock of the same profile: a new session. */
		reunlock: () => {
			session += 1
		},
	}
}

describe("AuthRegistryService sends run under the session the user acted in", () => {
	const FEE = { paymentMethod: { kind: "fj" } } as never

	test("revoke and the registry toggle capture before their first read, and send under that capture", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		h.executeSendTransaction.mockRejectedValue(new Error("stop after send"))
		h.captureExecutionFence.mockClear()
		h.getNetwork.mockClear()

		await expect(h.service.revokeAuthwits("net-1", A, [1], FEE)).rejects.toThrow("stop after send")
		await expect(h.service.setRegistryEnabled("net-1", A, false, FEE)).rejects.toThrow("stop after send")

		const captures = h.captureExecutionFence.mock
		for (const i of [0, 1]) {
			expect(captures.invocationCallOrder[i]).toBeLessThan(h.getNetwork.mock.invocationCallOrder[i] as number)
			expect(h.executeSendTransaction.mock.calls[i]?.[4]).toBe(await captures.results[i]?.value)
		}
	})

	test("a session that ends and re-unlocks while the authwit read is parked is refused at the send, never re-captured", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const storage = (h.service as unknown as { authwits: { get: (key: string) => Promise<unknown> } }).authwits
		const read = storage.get.bind(storage)
		let releaseRead: () => void = () => {}
		let parked = false
		vi.spyOn(storage, "get").mockImplementationOnce(async (key: string) => {
			parked = true
			await new Promise<void>((resolve) => {
				releaseRead = resolve
			})
			return read(key)
		})
		h.captureExecutionFence.mockClear()

		const revoke = h.service.revokeAuthwits("net-1", A, [1], FEE)
		await vi.waitFor(() => expect(parked).toBe(true))
		h.reunlock()
		releaseRead()

		await expect(revoke).rejects.toBeInstanceOf(SessionEndedError)
		expect(h.captureExecutionFence).toHaveBeenCalledTimes(1)
		expect(h.executeSendTransaction).toHaveBeenCalledTimes(1)
		expect(h.executeSendTransaction.mock.calls[0]?.[4]).toMatchObject({ session: 1 })
	})
})

describe("AuthRegistryService names a send's journal record to the caller that keyed it", () => {
	const FEE = { paymentMethod: { kind: "fj" } } as never

	async function harnessWithEvents() {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const started: unknown[] = []
		h.service.onSendStarted.add((event) => started.push(event))
		const internals = h.service as unknown as Record<string, unknown> & { transactionService: Record<string, unknown> }
		internals.transactionService.waitForTx = async () => {}
		internals.nodeFor = async () => ({})
		internals.waitForTxProven = async () => {}
		internals.verifyRevoked = async () => {}
		internals.applyStatus = async () => {}
		return { h, started }
	}

	test.each([
		["revokeAuthwits", (h: Awaited<ReturnType<typeof makeHarness>>) => h.service.revokeAuthwits("net-1", A, [1], FEE, "key-1")],
		[
			"setRegistryEnabled",
			(h: Awaited<ReturnType<typeof makeHarness>>) => h.service.setRegistryEnabled("net-1", A, false, FEE, "key-1"),
		],
	])("%s emits the key and the journal id once the record exists, once", async (_name, send) => {
		const { h, started } = await harnessWithEvents()
		h.executeSendTransaction.mockImplementation(async (...args: unknown[]) => {
			;(args[3] as { onJournalCreated: (id: string) => void }).onJournalCreated("journal-1")
			return "0xtx"
		})
		await send(h)
		expect(started).toEqual([{ correlation: "key-1", journalId: "journal-1" }])
	})

	test("a send that fails before its record exists emits nothing; a call with no key passes no hook", async () => {
		const { h, started } = await harnessWithEvents()
		h.executeSendTransaction.mockRejectedValueOnce(new Error("refused before the claim"))
		await expect(h.service.revokeAuthwits("net-1", A, [1], FEE, "key-1")).rejects.toThrow("refused before the claim")
		await h.service.setRegistryEnabled("net-1", A, false, FEE)
		expect(started).toEqual([])
		expect(h.executeSendTransaction.mock.calls.at(-1)?.[3]).toBeUndefined()
	})
})

describe("AuthRegistryService purges — each method's scope, survivors and order", () => {
	const ROOT = "nulo:core:auth-registry@"
	const STATUS_ROOT = "nulo:core:auth-registry-enabled@"
	const B = "0xother"
	const typed = {
		in: { id: 1, profileId: "p1", chainId: 1, account: A },
		sibling: { id: 2, profileId: "p2", chainId: 1, account: A },
		otherChain: { id: 3, profileId: "p1", chainId: 2, account: A },
		otherAddress: { id: 4, profileId: "p1", chainId: 1, account: B },
	}
	const malformed = {
		in: { id: 90, profileId: "p1", chainId: 1, account: A, hash: 5, content },
		out: { id: 91, profileId: "p2", chainId: 1, account: A, hash: 5, content },
	}
	const statusKeys = {
		in: `${STATUS_ROOT}${authwitStatusRowId("p1", 1, A)}`,
		sibling: `${STATUS_ROOT}${authwitStatusRowId("p2", 1, A)}`,
		otherChain: `${STATUS_ROOT}${authwitStatusRowId("p1", 2, A)}`,
		otherAddress: `${STATUS_ROOT}${authwitStatusRowId("p1", 1, B)}`,
	}

	async function seeded() {
		const h = await makeHarness()
		const entries: Record<string, string> = {}
		for (const row of Object.values(typed)) entries[`${ROOT}${row.id}`] = JSON.stringify({ ...row, hash: `0x${row.id}`, content })
		for (const row of Object.values(malformed)) entries[`${ROOT}${row.id}`] = JSON.stringify(row)
		for (const key of Object.values(statusKeys)) entries[key] = JSON.stringify(true)
		await h.api.storage.local.set(entries)
		const writes = recordWrites(h.api.storage.local, "nulo:core:auth-registry")
		h.service.onAuthwitDeleted.add((a) => {
			writes.log.push(`emit:${a.id}`)
		})
		const survivors = async () =>
			Object.keys((await h.api.storage.local.get(null)) as Record<string, unknown>)
				.filter((k) => k.startsWith("nulo:core:auth-registry"))
				.sort()
		return { h, writes, survivors }
	}

	const removed = (id: number) => [`remove:${ROOT}${id}`, `emit:${id}`]

	test("purgeForAccounts removes only the (profile, chain, address) tuple", async () => {
		const { h, writes, survivors } = await seeded()
		await h.service.purgeForAccounts([{ chainId: 1, address: A }], "p1")
		writes.restore()
		expect(writes.log).toEqual([...removed(1), `remove:${ROOT}90`, `remove:${statusKeys.in}`])
		expect(await survivors()).toEqual(
			[`${ROOT}2`, `${ROOT}3`, `${ROOT}4`, `${ROOT}91`, statusKeys.sibling, statusKeys.otherChain, statusKeys.otherAddress].sort(),
		)
	})

	test("purgeForProfile removes the profile's rows on every chain and address", async () => {
		const { h, writes, survivors } = await seeded()
		await h.service.purgeForProfile("p1")
		writes.restore()
		expect(writes.log).toEqual([
			...removed(1),
			...removed(3),
			...removed(4),
			`remove:${ROOT}90`,
			`remove:${statusKeys.in}`,
			`remove:${statusKeys.otherChain}`,
			`remove:${statusKeys.otherAddress}`,
		])
		expect(await survivors()).toEqual([`${ROOT}2`, `${ROOT}91`, statusKeys.sibling].sort())
	})

	test("purgeChain removes the profile's rows on that chain only", async () => {
		const { h, writes, survivors } = await seeded()
		await h.service.purgeChain("p1", 1)
		writes.restore()
		expect(writes.log).toEqual([
			...removed(1),
			...removed(4),
			`remove:${ROOT}90`,
			`remove:${statusKeys.in}`,
			`remove:${statusKeys.otherAddress}`,
		])
		expect(await survivors()).toEqual([`${ROOT}2`, `${ROOT}3`, `${ROOT}91`, statusKeys.sibling, statusKeys.otherChain].sort())
	})
})

describe("AuthRegistryService sealing at rest", () => {
	const ROOT = "nulo:core:auth-registry@"
	const STATUS_ROOT = "nulo:core:auth-registry-enabled@"
	const B = "0xotheraccount"
	const flagKey = (profileId: string, account: string) => `${STATUS_ROOT}${authwitStatusRowId(profileId, 1, account)}`

	/** p1's and p2's plaintext authwits and disabled flags, then p1's unlock-time conversion. */
	async function converted() {
		const h = await makeHarness()
		await h.api.storage.local.set({
			[`${ROOT}1`]: JSON.stringify({ id: 1, profileId: "p1", chainId: 1, account: A, hash: "0xh1", content }),
			[`${ROOT}2`]: JSON.stringify({ id: 2, profileId: "p2", chainId: 1, account: A, hash: "0xh2", content }),
			[flagKey("p1", A)]: "false",
			[flagKey("p1", B)]: "false",
			[flagKey("p2", A)]: "false",
		})
		await (h.service as unknown as { sealLegacyRows(profileId: string): Promise<void> }).sealLegacyRows("p1")
		const stored = async () => (await h.api.storage.local.get(null)) as Record<string, string>
		return { h, stored }
	}

	test("unlock seals the profile's authwits and flags, and no flag key of it names an account", async () => {
		const { h, stored } = await converted()
		const all = await stored()
		expect(Object.keys(JSON.parse(all[`${ROOT}1`]))).toEqual(["profileId", "sealed"])
		expect(JSON.parse(all[`${ROOT}2`]).profileId).toBe("p2")
		const flags = Object.keys(all).filter((k) => k.startsWith(STATUS_ROOT))
		const mine = flags.filter((k) => JSON.parse(k.slice(STATUS_ROOT.length))[1] === "p1")
		expect(mine).toHaveLength(2)
		for (const key of mine) {
			expect(key).not.toContain(A)
			expect(key).not.toContain(B)
			expect(Object.keys(JSON.parse(all[key]))).toEqual(["profileId", "sealed"])
		}
		expect(all[flagKey("p2", A)]).toBe("false")
		expect(await h.service.getRegistryEnabled(1, A)).toBe(false)
		expect(await h.service.getAuthwits(1, A)).toMatchObject([{ id: 1, hash: "0xh1" }])
	})

	test("an account purge after the conversion removes that account's sealed authwits and flag only", async () => {
		const { h, stored } = await converted()
		await h.service.purgeForAccounts([{ chainId: 1, address: A }], "p1")
		const all = await stored()
		expect(all[`${ROOT}1`]).toBeUndefined()
		expect(all[`${ROOT}2`]).toBeDefined()
		expect(await h.service.getRegistryEnabled(1, A)).toBe(true)
		expect(await h.service.getRegistryEnabled(1, B)).toBe(false)
		expect(all[flagKey("p2", A)]).toBe("false")
	})

	test("clearing a flag still plaintext removes it: a bare boolean row is the profile's own twin", async () => {
		const h = await makeHarness()
		await h.api.storage.local.set({ [flagKey("p1", A)]: "false" })
		const flags = (h.service as unknown as { statuses: { delete(id: string, owner: string): Promise<void> } }).statuses
		await flags.delete(authwitStatusRowId("p1", 1, A), "p1")
		expect(await h.service.getRegistryEnabled(1, A)).toBe(true)
		expect(Object.keys(await h.api.storage.local.get(null)).filter((k) => k.startsWith(STATUS_ROOT))).toEqual([])
	})
})

describe("AuthRegistryService revoke and registry toggle — refusals, settlement order, cancel", () => {
	const FEE = { paymentMethod: { kind: "fj" } } as never

	function instrument(h: Awaited<ReturnType<typeof makeHarness>>) {
		const log: string[] = []
		const internals = h.service as unknown as Record<string, unknown> & {
			taskService: { startNewTask: (content: unknown) => unknown }
			transactionService: Record<string, unknown>
		}
		internals.taskService.startNewTask = (taskContent: unknown) => {
			log.push(`task:${(taskContent as { constructor: { name: string } }).constructor.name}`)
			return {
				complete: () => log.push("complete"),
				completeIfTracked: () => log.push("complete"),
				fail: () => log.push("fail"),
				cancel: () => log.push("cancel"),
			}
		}
		internals.transactionService.waitForTx = async (txHash: string) => {
			log.push(`waitForTx:${txHash}`)
		}
		internals.nodeFor = async () => {
			log.push("nodeFor")
			return {}
		}
		internals.singleAttemptNodeFor = async () => ({
			getTxReceipt: async (txHash: { toString: () => string }) => {
				log.push(`receipt:${txHash.toString()}`)
				return { status: AztecTxStatus.PROPOSED, blockNumber: 1 }
			},
		})
		internals.waitForTxProven = async (_node: unknown, txHash: string) => {
			log.push(`proven:${txHash}`)
			return 2
		}
		internals.verifyRevoked = async (_network: unknown, _node: unknown, scope: unknown, rows: Authwit[], revokeBlock: number) => {
			log.push(`verify:${JSON.stringify(scope)}:${rows.map((r) => r.id).join(",")}:${revokeBlock}`)
		}
		internals.applyStatus = async (_node: unknown, scope: unknown) => {
			log.push(`applyStatus:${JSON.stringify(scope)}`)
		}
		h.executeSendTransaction.mockImplementation(async (...args: unknown[]) => {
			log.push(`send:${JSON.stringify(args[0])}:${JSON.stringify(args[1])}:${args[3]}:${JSON.stringify(args[4])}`)
			return "0xtx"
		})
		return log
	}

	test("the cap and each ownership check refuse before any task or send", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await h.service.recordPendingAuthwits({ ...P1, profileId: "p2" }, [{ hash: "0xh2", content }], "0xtx2", LIVE_EPOCH)
		await h.service.recordPendingAuthwits({ ...P1, chainId: 2 }, [{ hash: "0xh3", content }], "0xtx3", LIVE_EPOCH)
		await h.service.recordPendingAuthwits({ ...P1, account: "0xother" }, [{ hash: "0xh4", content }], "0xtx4", LIVE_EPOCH)
		const log = instrument(h)
		const tooMany = Array.from({ length: 29 }, (_, i) => i)
		await expect(h.service.revokeAuthwits("net-1", A, tooMany, FEE)).rejects.toThrow(
			/^Cannot revoke more than 28 authwits per single tx$/,
		)
		for (const id of [2, 3, 4, 99]) {
			await expect(h.service.revokeAuthwits("net-1", A, [id], FEE)).rejects.toThrow(new RegExp(`^Authwit #${id} doesn't exist$`))
		}
		expect(log).toEqual([])
		expect(h.executeSendTransaction).not.toHaveBeenCalled()
	})

	test("each estimate is of the transaction its send builds, refused as the send is, and cancels through the service", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		await h.service.recordPendingAuthwits({ ...P1, profileId: "p2" }, [{ hash: "0xh2", content }], "0xtx2", LIVE_EPOCH)
		instrument(h)

		await h.service.estimateRevokeFee("net-1", A, [1], FEE, "tok-1", "slot-1")
		await h.service.revokeAuthwits("net-1", A, [1], FEE)
		await h.service.estimateRegistryToggleFee("net-1", A, false, FEE, "tok-2")
		await h.service.setRegistryEnabled("net-1", A, false, FEE)
		const estimated = h.estimateSendTransactionFee.mock.calls
		const sent = h.executeSendTransaction.mock.calls
		expect(estimated.map((c) => c[0])).toEqual(sent.map((c) => c[0]))
		expect(estimated.map((c) => c.slice(1))).toEqual([
			["tok-1", "slot-1"],
			["tok-2", undefined],
		])

		await expect(
			h.service.estimateRevokeFee(
				"net-1",
				A,
				Array.from({ length: 29 }, (_, i) => i),
				FEE,
			),
		).rejects.toThrow(/^Cannot revoke more than 28 authwits per single tx$/)
		await expect(h.service.estimateRevokeFee("net-1", A, [2], FEE)).rejects.toThrow(/^Authwit #2 doesn't exist$/)
		expect(h.estimateSendTransactionFee).toHaveBeenCalledTimes(2)

		await h.service.cancelFeeEstimate("tok-1")
		expect(h.cancelEstimate).toHaveBeenCalledWith("tok-1")
	})

	test("a revoke settles in order: task, grant receipt, send under the captured fence, tx, proven, verify, complete", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const log = instrument(h)
		await h.service.revokeAuthwits("net-1", A, [1], FEE)
		const fence = JSON.stringify(await h.captureExecutionFence.mock.results.at(-1)?.value)
		const request = {
			kind: "send_transaction",
			networkId: "net-1",
			accountAddress: A,
			feeSettings: FEE,
			actions: [{ kind: "call", contract: getAuthRegistryAddress().toString(), method: "set_authorized", args: ["0xh1", false] }],
		}
		expect(log).toEqual([
			"task:RevokeAuthwitsContent",
			`receipt:${TX1}`,
			`send:${JSON.stringify(request)}:${JSON.stringify({ type: OriginType.UI })}:undefined:${fence}`,
			"waitForTx:0xtx",
			"nodeFor",
			"proven:0xtx",
			`verify:${JSON.stringify(P1)}:1:2`,
			"complete",
		])
	})

	test("a registry toggle settles in the same order with its own action and sync", async () => {
		const h = await makeHarness()
		const log = instrument(h)
		await h.service.setRegistryEnabled("net-1", A, false, FEE)
		const fence = JSON.stringify(await h.captureExecutionFence.mock.results.at(-1)?.value)
		const request = {
			kind: "send_transaction",
			networkId: "net-1",
			accountAddress: A,
			feeSettings: FEE,
			actions: [{ kind: "call", contract: getAuthRegistryAddress().toString(), method: "set_reject_all", args: [true] }],
		}
		expect(log).toEqual([
			"task:StepContent",
			`send:${JSON.stringify(request)}:${JSON.stringify({ type: OriginType.UI })}:undefined:${fence}`,
			"waitForTx:0xtx",
			"nodeFor",
			"proven:0xtx",
			`applyStatus:${JSON.stringify(P1)}`,
			"complete",
		])
	})

	test.each([
		["a profile switch clears its task", true],
		["control: its task stays tracked", false],
	])("a registry toggle stores the status the node reads and resolves when %s (real TaskService)", async (_name, switches) => {
		const h = await makeHarness({ node: {} })
		const { tasks, switchToProfile } = await startedTaskService("p1")
		const internals = h.service as unknown as Record<string, unknown> & { transactionService: Record<string, unknown> }
		internals.taskService = tasks
		internals.transactionService.waitForTx = async () => {}
		internals.waitForTxProven = async () => {
			if (switches) switchToProfile("p2")
		}
		const util = await import("@/wallet/utils/auth-registry")
		vi.spyOn(util, "isAuthRegistryEnabled").mockResolvedValue(false)

		await expect(h.service.setRegistryEnabled("net-1", A, false, FEE)).resolves.toBeUndefined()
		expect(await h.service.getRegistryEnabled(1, A)).toBe(false)
		expect((await tasks.getTasks()).map((task) => task.status)).toEqual(switches ? [] : [TaskStatus.Completed])
		vi.restoreAllMocks()
	})

	test("a send failure fails the task; a cancellation cancels it and surfaces JobCancelledError", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const log = instrument(h)
		const boom = new Error("boom")
		h.executeSendTransaction.mockRejectedValueOnce(boom).mockRejectedValueOnce(new JobCancelledSentinel("job-1"))
		await expect(h.service.revokeAuthwits("net-1", A, [1], FEE)).rejects.toBe(boom)
		await expect(h.service.setRegistryEnabled("net-1", A, false, FEE)).rejects.toBeInstanceOf(JobCancelledError)
		expect(log).toEqual(["task:RevokeAuthwitsContent", `receipt:${TX1}`, "fail", "task:StepContent", "cancel"])
	})
})

describe("AuthRegistryService.revokeAuthwits waits for each grant's block, then verifies and prunes", () => {
	const FEE = { paymentMethod: { kind: "fj" } } as never
	const TX2 = `0x${"02".repeat(32)}`
	const REVOKE_BLOCK = 5
	const NOT_IN_BLOCK = "Authwit #1's grant is not in a block yet. Revoke it again later."
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	/** P1's `pending` row #1, granted in TX1, revoked in a transaction proven in `REVOKE_BLOCK`; every
	 *  hash reads unauthorized unless the test says otherwise. */
	async function revoking(grantNode: unknown = receiptNode(AztecTxStatus.PROPOSED, REVOKE_BLOCK)) {
		const h = await makeHarness({ node: {}, grantNode })
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const internals = h.service as unknown as Record<string, unknown> & { transactionService: Record<string, unknown> }
		internals.transactionService.waitForTx = async () => {}
		internals.waitForTxProven = async () => REVOKE_BLOCK
		const util = await import("@/wallet/utils/auth-registry")
		const consumable = vi.spyOn(util, "isAuthwitConsumable").mockResolvedValue(false)
		const revoke = () => h.service.revokeAuthwits("net-1", A, [1], FEE)
		return { h, internals, consumable, revoke, hashes: async () => (await rowsOf(h.service)).map((row) => row.hash) }
	}

	test.each([AztecTxStatus.PENDING, AztecTxStatus.DROPPED])(
		"a pending row's revoke whose grant reads %s is sent only once the grant reads a block",
		async (first) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "Date"] })
			const grantNode = { getTxReceipt: vi.fn() }
			grantNode.getTxReceipt
				.mockResolvedValueOnce({ status: first })
				.mockResolvedValue({ status: AztecTxStatus.PROPOSED, blockNumber: 3 })
			const { h, revoke } = await revoking(grantNode)
			const run = revoke()
			// The rows open through real WebCrypto, which no fake timer advances.
			await vi.waitFor(() => expect(grantNode.getTxReceipt).toHaveBeenCalledTimes(1))
			expect(h.executeSendTransaction).not.toHaveBeenCalled()
			await vi.advanceTimersByTimeAsync(1_000)
			await run
			expect(grantNode.getTxReceipt.mock.invocationCallOrder[1]).toBeLessThan(
				h.executeSendTransaction.mock.invocationCallOrder[0] as number,
			)
		},
	)

	test("control: a confirmed row's revoke reads no receipt before its send", async () => {
		const { h, revoke } = await revoking()
		await h.service.reconcileAuthwits(P1, TX1, "mined")
		h.executeSendTransaction.mockRejectedValueOnce(new Error("stop after send"))
		await expect(revoke()).rejects.toThrow("stop after send")
		expect(h.grantNodeForUrl).not.toHaveBeenCalled()
	})

	test.each([
		["has no grant transaction", "untracked"],
		["has a grant still pending when polling stops", "pending"],
		["has a grant whose every read fails", "unreadable"],
	])("a pending row that %s is refused before any send", async (_name, kind) => {
		vi.useFakeTimers({ toFake: ["setTimeout", "Date"] })
		const grantNode = {
			getTxReceipt: vi.fn(async () => {
				if (kind === "unreadable") throw new Error("node unreachable")
				return { status: AztecTxStatus.PENDING }
			}),
		}
		const { h, revoke, hashes } = await revoking(grantNode)
		if (kind === "untracked") {
			const [row] = await rowsOf(h.service)
			await h.api.storage.local.set({ [`nulo:core:auth-registry@${row.id}`]: JSON.stringify({ ...row, txHash: undefined }) })
		}
		const run = revoke().catch((error: unknown) => error)
		if (kind !== "untracked") await vi.waitFor(() => expect(grantNode.getTxReceipt).toHaveBeenCalled())
		await vi.advanceTimersByTimeAsync(GRANT_BLOCK_WAIT_MS + 1_000)
		expect(await run).toEqual(new Error(NOT_IN_BLOCK))
		expect(h.executeSendTransaction).not.toHaveBeenCalled()
		expect(await hashes()).toEqual(["0xh1"])
	})

	test.each([
		["still dropped", { status: AztecTxStatus.DROPPED }],
		["in a block above the revoke's", { status: AztecTxStatus.PROPOSED, blockNumber: REVOKE_BLOCK + 1 }],
	])(
		"a grant still dropped when polling stops holds back no other row: sent once, its row kept when it re-reads %s, the call rejected",
		async (_name, reread) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "Date"] })
			const grantNode = { getTxReceipt: vi.fn() }
			const { h, hashes } = await revoking(grantNode)
			grantNode.getTxReceipt.mockImplementation(async () =>
				h.executeSendTransaction.mock.calls.length ? reread : { status: AztecTxStatus.DROPPED },
			)
			await h.service.recordPendingAuthwits(P1, [{ hash: "0xh2", content }], TX2, LIVE_EPOCH)
			await h.service.reconcileAuthwits(P1, TX2, "mined")
			const run = h.service.revokeAuthwits("net-1", A, [1, 2], FEE).catch((error: unknown) => error)
			await vi.waitFor(() => expect(grantNode.getTxReceipt).toHaveBeenCalled())
			await vi.advanceTimersByTimeAsync(GRANT_BLOCK_WAIT_MS + 1_000)
			expect(await run).toEqual(new Error(NOT_IN_BLOCK))
			expect(h.executeSendTransaction).toHaveBeenCalledOnce()
			expect(await hashes()).toEqual(["0xh1"])
		},
	)

	test("a hash still authorized after the proof fails the revoke and keeps its row", async () => {
		const { revoke, consumable, hashes } = await revoking()
		consumable.mockResolvedValue(true)
		await expect(revoke()).rejects.toThrow("Authwit #1 is still authorized after the revoke")
		expect(await hashes()).toEqual(["0xh1"])
	})

	test("control: rows read unauthorized are pruned, a pending one whose grant is at or below the revoke's block included", async () => {
		const { h, hashes } = await revoking()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh2", content }], TX2, LIVE_EPOCH)
		await h.service.reconcileAuthwits(P1, TX2, "mined")
		await h.service.revokeAuthwits("net-1", A, [1, 2], FEE)
		expect(await hashes()).toEqual([])
	})

	test.each([
		["a block above the revoke's", { status: AztecTxStatus.PROPOSED, blockNumber: REVOKE_BLOCK + 1 }],
		["dropped", { status: AztecTxStatus.DROPPED }],
		["a failed read", new Error("node unreachable")],
	])("a pending row whose grant re-reads as %s is kept and the revoke fails", async (_name, reread) => {
		const grantNode = { getTxReceipt: vi.fn() }
		grantNode.getTxReceipt.mockResolvedValueOnce({ status: AztecTxStatus.PROPOSED, blockNumber: 1 })
		if (reread instanceof Error) grantNode.getTxReceipt.mockRejectedValueOnce(reread)
		else grantNode.getTxReceipt.mockResolvedValueOnce(reread)
		const { revoke, hashes } = await revoking(grantNode)
		await expect(revoke()).rejects.toThrow(NOT_IN_BLOCK)
		expect(await hashes()).toEqual(["0xh1"])
	})

	test.each([
		["its pending flag cleared by reconciliation: pruned", "reconciled", []],
		["its id taken by a row from another grant transaction: kept", "replaced", ["0xh1"]],
	])("a row changed between the authorization read and the lock, %s", async (_name, change, left) => {
		const { h, consumable, revoke, hashes } = await revoking()
		consumable.mockImplementation(async () => {
			if (change === "reconciled") await h.service.reconcileAuthwits(P1, TX1, "mined")
			else {
				const [row] = await rowsOf(h.service)
				await h.api.storage.local.set({ [`nulo:core:auth-registry@${row.id}`]: JSON.stringify({ ...row, txHash: TX2 }) })
			}
			return false
		})
		await revoke()
		expect(await hashes()).toEqual(left)
	})

	test.each([
		["a profile switch clears its task", true],
		["control: its task stays tracked", false],
	])("a revoke prunes its rows and resolves when %s (real TaskService)", async (_name, switches) => {
		const { h, internals, revoke, hashes } = await revoking()
		const { tasks, switchToProfile } = await startedTaskService("p1")
		internals.taskService = tasks
		internals.waitForTxProven = async () => {
			if (switches) switchToProfile("p2")
			return REVOKE_BLOCK
		}
		await expect(revoke()).resolves.toBeUndefined()
		expect(await hashes()).toEqual([])
		expect((await tasks.getTasks()).map((task) => task.status)).toEqual(switches ? [] : [TaskStatus.Completed])
		expect(h.executeSendTransaction).toHaveBeenCalledOnce()
	})
})

describe("AuthRegistryService under a refused Terms acceptance", () => {
	const FEE = { paymentMethod: { kind: "fj" } } as never

	test("a revoke and a registry toggle surface the typed refusal and change nothing they own", async () => {
		const h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
		const before = await h.service.getAuthwits(1, A)
		h.executeSendTransaction.mockRejectedValue(new TermsAcceptanceRequiredError())

		await expect(h.service.revokeAuthwits("net-1", A, [1], FEE)).rejects.toBeInstanceOf(TermsAcceptanceRequiredError)
		await expect(h.service.setRegistryEnabled("net-1", A, false, FEE)).rejects.toBeInstanceOf(TermsAcceptanceRequiredError)

		expect(await h.service.getAuthwits(1, A)).toEqual(before)
		expect(await h.service.getRegistryEnabled(1, A)).toBe(true)
	})
})

describe("AuthRegistryService.reconcileFromTx — scoped by the tx's provenance; dropped is non-destructive", () => {
	let h: Awaited<ReturnType<typeof makeHarness>>

	beforeEach(async () => {
		h = await makeHarness()
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xh1", content }], TX1, LIVE_EPOCH)
	})

	const emitTx = (tx: Record<string, unknown>) => h.txUpdated.dispatch({ profileId: "p1", chainId: 1, account: A, ...tx })

	test("a Dropped tx does NOT remove pending rows — dropped is reversible (resurrection), so the row stays pending", async () => {
		await emitTx({ hash: TX1, status: TxStatus.Dropped, updatedAt: Date.now() })
		expect(await h.service.getAuthwits(1, A)).toHaveLength(1)
	})

	test("a settled reverted tx removes the pending row (genuinely terminal)", async () => {
		await emitTx({ hash: TX1, status: TxStatus.Proven, executionResult: TxExecutionResult.AppLogicReverted, updatedAt: Date.now() })
		expect(await h.service.getAuthwits(1, A)).toHaveLength(0)
	})

	test("Proven + Success confirms the pending row (kept, no longer pending)", async () => {
		await emitTx({ hash: TX1, status: TxStatus.Proven, executionResult: TxExecutionResult.Success, updatedAt: Date.now() })
		const rows = await h.service.getAuthwits(1, A)
		expect(rows).toHaveLength(1)
		expect(rows[0].pending).toBeFalsy()
	})

	test("a settled tx from ANOTHER profile/chain with the same hash touches nothing; a tx without provenance is skipped", async () => {
		await emitTx({ hash: TX1, profileId: "p2", status: TxStatus.Proven, executionResult: TxExecutionResult.AppLogicReverted })
		await emitTx({ hash: TX1, chainId: 2, status: TxStatus.Proven, executionResult: TxExecutionResult.AppLogicReverted })
		await emitTx({ hash: TX1, profileId: undefined, status: TxStatus.Proven, executionResult: TxExecutionResult.AppLogicReverted })
		const rows = await h.service.getAuthwits(1, A)
		expect(rows).toHaveLength(1)
		expect(rows[0].pending).toBe(true)
	})
})

describe("AuthRegistryService.syncRegistry — scoped sync with a re-read under the lock", () => {
	test("a node answering non-consumable for chain 1 deletes only that scope's CONFIRMED rows; pending + other scopes survive", async () => {
		const node = { getTxReceipt: vi.fn(), getChainTips: vi.fn() }
		const h = await makeHarness({ node })
		const util = await import("@/wallet/utils/auth-registry")
		vi.spyOn(util, "isAuthwitConsumable").mockResolvedValue(false)
		vi.spyOn(util, "isAuthRegistryEnabled").mockResolvedValue(true)

		await h.service.recordPendingAuthwits(P1, [{ hash: "0xconfirmed", content }], "0xtxa", LIVE_EPOCH)
		await h.service.reconcileAuthwits(P1, "0xtxa", "mined")
		await h.service.recordPendingAuthwits(P1, [{ hash: "0xpending", content }], "0xtxb", LIVE_EPOCH)
		await h.service.recordPendingAuthwits({ ...P1, chainId: 2 }, [{ hash: "0xother-chain", content }], "0xtxc", LIVE_EPOCH)
		await h.service.reconcileAuthwits({ ...P1, chainId: 2 }, "0xtxc", "mined")
		await h.service.recordPendingAuthwits({ ...P1, profileId: "p2" }, [{ hash: "0xother-profile", content }], "0xtxd", LIVE_EPOCH)
		await h.service.reconcileAuthwits({ ...P1, profileId: "p2" }, "0xtxd", "mined")

		await h.service.syncRegistry("net-1", A)

		expect(h.nodeForUrl).toHaveBeenCalledWith("http://n/1")
		expect((await h.service.getAuthwits(1, A)).map((r) => r.hash)).toEqual(["0xpending"])
		expect((await h.service.getAuthwits(2, A)).map((r) => r.hash)).toEqual(["0xother-chain"])
		h.setActive({ id: "p2" })
		expect((await h.service.getAuthwits(1, A)).map((r) => r.hash)).toEqual(["0xother-profile"])
		vi.restoreAllMocks()
	})

	test("a deferred node reply during which the row's id is replaced by a foreign-tuple row deletes NOTHING", async () => {
		const node = {}
		const h = await makeHarness({ node })
		const util = await import("@/wallet/utils/auth-registry")
		let release!: () => void
		const parked = new Promise<void>((r) => (release = r))
		vi.spyOn(util, "isAuthwitConsumable").mockImplementation(async () => {
			await parked
			return false
		})
		vi.spyOn(util, "isAuthRegistryEnabled").mockResolvedValue(true)

		await h.service.recordPendingAuthwits(P1, [{ hash: "0xconfirmed", content }], "0xtxa", LIVE_EPOCH)
		await h.service.reconcileAuthwits(P1, "0xtxa", "mined")
		const [row] = await h.service.getAuthwits(1, A)

		const sync = h.service.syncRegistry("net-1", A)
		await new Promise((r) => setTimeout(r, 5))
		// Purge + restore during the await: the numeric id now holds a p2 row.
		await h.service.purgeForProfile("p1")
		await h.api.storage.local.set({
			[`nulo:core:auth-registry@${row.id}`]: JSON.stringify({ ...row, profileId: "p2", hash: "0xforeign", pending: false }),
		})
		release()
		await sync

		h.setActive({ id: "p2" })
		expect((await h.service.getAuthwits(1, A)).map((r) => r.hash)).toEqual(["0xforeign"])
		vi.restoreAllMocks()
	})
})

describe("AuthRegistryService.restore — hostile-row validation + scoped dedup", () => {
	let service: AuthRegistryService
	let api: FakeBrowserApi
	beforeEach(async () => {
		const h = await makeHarness()
		service = h.service
		api = h.api
	})

	const authwit = (account: string, hash: string, chainId = 1, profileId = "p1"): Authwit => ({
		id: 0,
		profileId,
		chainId,
		account,
		hash,
		content,
	})

	test("records a schema-invalid row (content not an object) as restoreError, never writes it", async () => {
		// content must be a non-null object; a hostile backup authwit with content:null
		// would pass EntityStorage's write but be codec-hidden on read. restore() must
		// parse-reject it up front so it never reaches storage.
		const bad = { id: 0, profileId: "p1", chainId: 1, account: A, hash: "0xh", content: null } as unknown as Authwit

		const [restored] = await service.restore([bad], "p1")

		expect(restored.restoreError).toBeTruthy()
		expect(await service.getAuthwits(1, A)).toHaveLength(0)
	})

	test("a malformed row (non-string hash) does not abort the batch — the valid sibling lands", async () => {
		const bad = { id: 0, profileId: "p1", chainId: 1, account: A, hash: 123, content } as unknown as Authwit

		const restored = await service.restore([bad, authwit(A, "0xgood")], "p1")

		expect(restored[0].restoreError).toBeTruthy()
		expect(restored[1].restoreError).toBeUndefined()
		expect((await service.getAuthwits(1, A)).map((r) => r.hash)).toEqual(["0xgood"])
	})

	test("a missing chainId is a restoreError (the scope tuple is required, never defaulted)", async () => {
		const bad = { id: 0, account: A, hash: "0xh", content } as unknown as Authwit
		const [restored] = await service.restore([bad], "p1")
		expect(restored.restoreError).toBeTruthy()
	})

	test("a foreign profileId on a backup row is FORCED to the threaded id — never trusted", async () => {
		const [restored] = await service.restore([authwit(A, "0xh", 1, "p-hostile")], "p1")
		expect(restored.restoreError).toBeUndefined()
		expect(restored.profileId).toBe("p1")
		expect((await service.getAuthwits(1, A)).map((r) => r.profileId)).toEqual(["p1"])
	})

	/** The journal is keyed BY the embedded numeric id — an aliased copy of row 5
	 *  under key 9 must read as absent, so revoke(9) refuses instead of touching row 5. */
	test("an id-aliased row (5 copied under key 9) reads as absent — revoke(9) refuses", async () => {
		// Five rows so the journal holds an honest row at key @5 (ids mint sequentially).
		await service.recordPendingAuthwits(
			P1,
			[
				{ hash: "0xh1", content },
				{ hash: "0xh2", content },
				{ hash: "0xh3", content },
				{ hash: "0xh4", content },
				{ hash: "0xh5", content },
			],
			"0xtx",
			LIVE_EPOCH,
		)
		const all = await api.storage.local.get()
		const rowFiveKey = Object.keys(all).find((k) => k === "nulo:core:auth-registry@5")
		expect(rowFiveKey).toBeTruthy()
		// Copy row 5 VERBATIM (embedded id stays 5) under key 9.
		await api.storage.local.set({ "nulo:core:auth-registry@9": all[rowFiveKey!] })

		await expect(service.revokeAuthwits("net-1", A, [9], undefined as never)).rejects.toThrow(/doesn't exist/)
		// The original row is untouched and still lists.
		expect((await service.getAuthwits(1, A)).map((r) => r.hash)).toEqual(["0xh1", "0xh2", "0xh3", "0xh4", "0xh5"])
	}, 15_000)

	// Restore dedupes on the compound (profileId, chainId, account, hash), matching the
	// live-write path's invariant. Duplicates from a cloned/re-imported backup
	// otherwise each mint a fresh id and silently burn per-scope cap headroom.

	test("an intra-batch duplicate (chain, account, hash) is restoreError-tagged; the first lands", async () => {
		const restored = await service.restore([authwit(A, "0xdup"), authwit(A, "0xdup")], "p1")
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toBeTruthy()
		expect(await service.getAuthwits(1, A)).toHaveLength(1)
	})

	test("a tuple already in storage (live-recorded) blocks its restore", async () => {
		await service.recordPendingAuthwits(P1, [{ hash: "0xlive", content }], "0xtx", LIVE_EPOCH)
		const [restored] = await service.restore([authwit(A, "0xlive")], "p1")
		expect(restored.restoreError).toBeTruthy()
		expect(await service.getAuthwits(1, A)).toHaveLength(1)
	})

	test("a same-address SIBLING profile's existing (account, hash) does NOT block this profile's restore", async () => {
		await service.recordPendingAuthwits({ ...P1, profileId: "p2" }, [{ hash: "0xshared", content }], "0xtx", LIVE_EPOCH)
		const [restored] = await service.restore([authwit(A, "0xshared")], "p1")
		expect(restored.restoreError).toBeUndefined()
		expect(await service.getAuthwits(1, A)).toHaveLength(1)
	})

	test("the same hash under TWO accounts, or one account on TWO chains, restores clean — the key is the tuple, not bare-hash", async () => {
		const restored = await service.restore(
			[authwit("0xalice", "0xshared"), authwit("0xbob", "0xshared"), authwit("0xalice", "0xshared", 2)],
			"p1",
		)
		expect(restored.every((r) => r.restoreError === undefined)).toBe(true)
		expect(await service.getAuthwits(1, "0xalice")).toHaveLength(1)
		expect(await service.getAuthwits(1, "0xbob")).toHaveLength(1)
		expect(await service.getAuthwits(2, "0xalice")).toHaveLength(1)
	})

	test("delimiter-forged pairs are distinct — ('a::b','c') and ('a','b::c') both land", async () => {
		// An in-band string delimiter would collapse these two identities; the
		// JSON-array encoding keeps them injective.
		const restored = await service.restore([authwit("a::b", "c"), authwit("a", "b::c")], "p1")
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toBeUndefined()
	})

	test("a hostile decodable row at MAX_SAFE_INTEGER fails the ROW — no hang, no hidden write", async () => {
		// Past MAX_SAFE_INTEGER the float cursor stops advancing (id++ is a
		// no-op): an unguarded skip loop spins forever under the service lock,
		// and an unguarded write lands key-identity-hidden on read. Both
		// boundary keys are seeded so the loop's own guard (not just the
		// post-loop check) is what exits.
		const max = Number.MAX_SAFE_INTEGER
		await api.storage.local.set({
			[`nulo:core:auth-registry@${max}`]: JSON.stringify({
				id: max,
				profileId: "p1",
				chainId: 1,
				account: A,
				hash: "0xmax",
				content: {},
			}),
			[`nulo:core:auth-registry@${max + 1}`]: JSON.stringify({ junk: true }),
		})
		const restored = await service.restore([authwit(A, "0xnew1"), authwit(A, "0xnew2")], "p1")
		expect(restored[0].restoreError).toBeTruthy()
		expect(restored[1].restoreError).toBeTruthy()
		// Nothing landed at (or past) the unsafe boundary beyond the seeds.
		const raw = await api.storage.local.get(null)
		const authKeys = Object.keys(raw).filter((k) => k.startsWith("nulo:core:auth-registry@"))
		expect(authKeys).toHaveLength(2)
	}, 10_000)

	test("a codec-hidden raw row's tuple still blocks its duplicate, and its key is never overwritten", async () => {
		// Seed a raw row that carries a valid tuple but a codec-breaking content — decoded
		// reads hide it, yet its identity must still dedupe and its numeric key stay occupied.
		await api.storage.local.set({
			"nulo:core:auth-registry@1": JSON.stringify({
				id: 1,
				profileId: "p1",
				chainId: 1,
				account: A,
				hash: "0xhidden",
				content: null,
			}),
		})
		const restored = await service.restore([authwit(A, "0xhidden"), authwit(A, "0xnew")], "p1")
		expect(restored[0].restoreError).toBeTruthy() // hidden tuple blocks its duplicate
		expect(restored[1].restoreError).toBeUndefined()
		// The hidden row's raw bytes are intact (key @1 not clobbered by the cursor).
		const raw = (await api.storage.local.get("nulo:core:auth-registry@1"))["nulo:core:auth-registry@1"]
		expect(JSON.parse(raw as string)).toMatchObject({ id: 1, hash: "0xhidden", content: null })
	})

	test("legacy rows without provenance are codec-hidden (kept, never read, never purged by scope)", async () => {
		await api.storage.local.set({
			"nulo:core:auth-registry@3": JSON.stringify({ id: 3, account: A, hash: "0xlegacy", content }),
		})
		expect(await service.getAuthwits(1, A)).toHaveLength(0)
		await service.purgeForProfile("p1")
		expect("nulo:core:auth-registry@3" in ((await api.storage.local.get(null)) as Record<string, unknown>)).toBe(true)
	})
})

describe("AuthRegistryService.restore — deletion fence (threaded profileId)", () => {
	const rows = [
		{ id: 0, profileId: "p1", chainId: 1, account: "0xacc", hash: "0xh1", content },
		{ id: 0, profileId: "p1", chainId: 1, account: "0xacc", hash: "0xh2", content },
	]

	test("a deleteProfile beginning DURING the restore rejects every later row write", async () => {
		const h = await makeHarness()
		const origSet = h.api.storage.local.set.bind(h.api.storage.local)
		let fired = false
		h.api.storage.local.set = async (items: Record<string, unknown>) => {
			await origSet(items)
			if (!fired) {
				fired = true
				h.deletionState.beginDeletion("p1")
			}
		}
		const restored = await h.service.restore(rows, "p1")
		expect(restored[0].restoreError).toBeUndefined()
		expect(restored[1].restoreError).toMatch(/deleted/)
		expect(await h.service.getAuthwits(1, "0xacc")).toHaveLength(1)
	})

	test("fails closed when the created-profile id is missing", async () => {
		const h = await makeHarness()
		for (const bad of ["", undefined, 5]) {
			await expect(h.service.restore(rows, bad as never)).rejects.toThrow(/^restore requires the created profile id$/)
		}
		expect(await h.service.getAuthwits(1, "0xacc")).toHaveLength(0)
	})

	test("positive control: no deletion → both rows land", async () => {
		const h = await makeHarness()
		const restored = await h.service.restore(rows, "p1")
		expect(restored.every((r) => r.restoreError === undefined)).toBe(true)
	})
})
