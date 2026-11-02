import { describe, expect, test } from "vitest"
import type { IncomingNoteRecord, IncomingTransferRecord } from "@/wallet/services/incoming-transfer/spec"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { type Tx, TxStatus } from "@/wallet/services/transaction/spec"
import {
	buildActivityRows,
	filterPendingDoubleRender,
	journalRecordInScope,
	type MinimalChainTx,
	rowOnToken,
	txOnToken,
} from "./activity-rows"

function tx(createdAt: number, hash: string): Tx {
	return { hash, createdAt, account: "0xa", calls: [] } as unknown as Tx
}

function journal(overrides: Partial<OperationRecord>): OperationRecord {
	return {
		id: "j1",
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		accountAddress: "0xa",
		networkId: "net-1",
		progress: { stage: "cancelled" },
		error: null,
		terminalAt: 1_000,
		attempts: 0,
		createdAt: 0,
		updatedAt: 1_000,
		...overrides,
	} as OperationRecord
}

function incoming({ key = "0xn1", ...overrides }: Partial<IncomingNoteRecord> & { key?: string }): IncomingTransferRecord {
	return {
		kind: "note",
		id: `note:p1|net-1|${key}`,
		profileId: "p1",
		networkId: "net-1",
		accountAddress: "0xa",
		contract: "0xt",
		tokenId: 1,
		owner: "0xa",
		amountRaw: "100",
		noteHash: "0xh",
		txHash: "0xtx",
		l2BlockNumber: 1,
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: false,
		discoveredAt: 1_000,
		...overrides,
	}
}

describe("buildActivityRows — three-source merge", () => {
	const ACTIVE = { accountAddress: "0xa", profileId: "p1", networkId: "net-1" }

	test("empty input → empty output", () => {
		expect(buildActivityRows({ transactions: [], terminalJournalOps: [], incomingTransfers: [] })).toEqual([])
	})

	test("merges tx + journal + incoming into one list", () => {
		const rows = buildActivityRows({
			transactions: [tx(3_000, "0xtx1")],
			terminalJournalOps: [journal({ terminalAt: 2_000 })],
			incomingTransfers: [incoming({ discoveredAt: 1_000 })],
			...ACTIVE,
		})
		expect(rows).toHaveLength(3)
		expect(rows.map((r) => r.type)).toEqual(["tx", "journal", "incoming"])
	})

	test("sorts newest-first by sortKey across types", () => {
		const rows = buildActivityRows({
			transactions: [tx(1_000, "0xtx-old")],
			terminalJournalOps: [journal({ id: "j-new", terminalAt: 5_000 })],
			incomingTransfers: [incoming({ key: "0xn-mid", discoveredAt: 3_000 })],
			...ACTIVE,
		})
		expect(rows.map((r) => r.sortKey)).toEqual([5_000, 3_000, 1_000])
	})

	test("journal scoping: drops succeeded stage", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [journal({ progress: { stage: "succeeded", txHash: "0xchain" } })],
			incomingTransfers: [],
			...ACTIVE,
		})
		expect(rows).toHaveLength(0)
	})

	test("journal scoping: drops non-activity kinds", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [journal({ kind: "token_import" } as unknown as Partial<OperationRecord>)],
			incomingTransfers: [],
			...ACTIVE,
		})
		expect(rows).toHaveLength(0)
	})

	test("journal scoping: drops other-account records", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [journal({ accountAddress: "0xother" })],
			incomingTransfers: [],
			...ACTIVE,
		})
		expect(rows).toHaveLength(0)
	})

	test("journal scoping: drops non-terminal records", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [journal({ terminalAt: null, progress: { stage: "proving", enteredProveAt: 0 } })],
			incomingTransfers: [],
			...ACTIVE,
		})
		expect(rows).toHaveLength(0)
	})

	test("incoming rows are passed through (service-layer-filtered)", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [],
			incomingTransfers: [incoming({ key: "0xa" }), incoming({ key: "0xb", discoveredAt: 2_000 })],
		})
		expect(rows).toHaveLength(2)
		expect(rows.every((r) => r.type === "incoming")).toBe(true)
	})

	test("each row carries a unique key per source", () => {
		const rows = buildActivityRows({
			transactions: [tx(1_000, "0xtx1")],
			terminalJournalOps: [journal({ id: "j1" })],
			incomingTransfers: [incoming({ key: "0xn1" })],
			...ACTIVE,
		})
		const keys = rows.map((r) => r.key)
		expect(new Set(keys).size).toBe(keys.length)
		expect(keys).toContain("tx:0xtx1")
		expect(keys).toContain("journal:j1")
		expect(keys).toContain("incoming:note:p1|net-1|0xn1")
	})

	// ── Cross-account render-scope filters (defense-in-depth) ──

	test("tx scoping: drops other-account tx when accountAddress is supplied", () => {
		const rows = buildActivityRows({
			transactions: [{ ...tx(3_000, "0xmine"), account: "0xa" } as Tx, { ...tx(2_000, "0xtheirs"), account: "0xother" } as Tx],
			terminalJournalOps: [],
			incomingTransfers: [],
			accountAddress: "0xa",
		})
		expect(rows.map((r) => (r.type === "tx" ? r.tx.hash : ""))).toEqual(["0xmine"])
	})

	test("tx scoping: drops wrong-chain tx when chainId is supplied", () => {
		const rows = buildActivityRows({
			transactions: [
				{ ...tx(3_000, "0xright"), account: "0xa", chainId: 1 } as Tx,
				{ ...tx(2_000, "0xwrong"), account: "0xa", chainId: 2 } as Tx,
			],
			terminalJournalOps: [],
			incomingTransfers: [],
			accountAddress: "0xa",
			chainId: 1,
		})
		expect(rows.map((r) => (r.type === "tx" ? r.tx.hash : ""))).toEqual(["0xright"])
	})

	test("incoming scoping: drops other-account incoming when accountAddress is supplied", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [],
			incomingTransfers: [incoming({ key: "0xmine" }), incoming({ key: "0xtheirs", accountAddress: "0xother" })],
			accountAddress: "0xa",
		})
		expect(rows.map((r) => (r.type === "incoming" && r.inc.kind === "note" ? r.inc.id : ""))).toEqual(["note:p1|net-1|0xmine"])
	})

	test("incoming scoping: drops wrong-network incoming when networkId is supplied", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [],
			incomingTransfers: [incoming({ key: "0xhere", networkId: "net-1" }), incoming({ key: "0xelsewhere", networkId: "net-2" })],
			accountAddress: "0xa",
			networkId: "net-1",
		})
		expect(rows.map((r) => (r.type === "incoming" && r.inc.kind === "note" ? r.inc.id : ""))).toEqual(["note:p1|net-1|0xhere"])
	})
})

/** Wraps a record so every string-keyed property read is logged, in order. */
function recorded<T extends object>(target: T, log: string[]): T {
	return new Proxy(target, {
		get(t, key, receiver) {
			if (typeof key === "string") log.push(key)
			return Reflect.get(t, key, receiver)
		},
	})
}

describe("buildActivityRows — scope pins", () => {
	const scoped = { accountAddress: "0xa", chainId: 1, networkId: "net-1", profileId: "p1" }

	test("tx: a foreign profile is dropped; an unstamped one stays", () => {
		const rows = buildActivityRows({
			transactions: [
				{ ...tx(3_000, "0xmine"), chainId: 1, profileId: "p1" } as Tx,
				{ ...tx(2_000, "0xtheirs"), chainId: 1, profileId: "p2" } as Tx,
				{ ...tx(1_000, "0xunstamped"), chainId: 1 } as Tx,
			],
			terminalJournalOps: [],
			incomingTransfers: [],
			...scoped,
		})
		expect(rows.map((r) => r.key)).toEqual(["tx:0xmine", "tx:0xunstamped"])
	})

	test("tx: chain id 0 is a known chain, not an unknown one", () => {
		const rows = buildActivityRows({
			transactions: [{ ...tx(3_000, "0xzero"), chainId: 0 } as Tx, { ...tx(2_000, "0xone"), chainId: 1 } as Tx],
			terminalJournalOps: [],
			incomingTransfers: [],
			accountAddress: "0xa",
			chainId: 0,
		})
		expect(rows.map((r) => r.key)).toEqual(["tx:0xzero"])
	})

	test("an unknown scope keeps every tx and every incoming record", () => {
		const rows = buildActivityRows({
			transactions: [{ ...tx(3_000, "0xany"), account: "0xother", chainId: 9, profileId: "p9" } as Tx],
			terminalJournalOps: [],
			incomingTransfers: [incoming({ key: "0xany", accountAddress: "0xother", networkId: "net-9", profileId: "p9" })],
		})
		expect(rows.map((r) => r.key)).toEqual(["tx:0xany", "incoming:note:p1|net-1|0xany"])
	})

	test("a terminal journal row from another network is dropped, as Home drops it", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [
				journal({ id: "here", networkId: "net-1" }),
				journal({ id: "there", networkId: "net-2", terminalAt: 900 }),
			],
			incomingTransfers: [],
			...scoped,
		})
		expect(rows.map((r) => r.key)).toEqual(["journal:here"])
	})

	test("a terminal journal row with no networkId is kept under a known network", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [journal({ id: "legacy", networkId: undefined })],
			incomingTransfers: [],
			...scoped,
		})
		expect(rows.map((r) => r.key)).toEqual(["journal:legacy"])
	})

	test("with no active network only the terminal journal row with no networkId is kept", () => {
		const rows = buildActivityRows({
			transactions: [],
			terminalJournalOps: [
				journal({ id: "a", networkId: "net-1" }),
				journal({ id: "b", networkId: "net-2", terminalAt: 900 }),
				journal({ id: "legacy", networkId: undefined, terminalAt: 800 }),
			],
			incomingTransfers: [],
			...scoped,
			networkId: undefined,
		})
		expect(rows.map((r) => r.key)).toEqual(["journal:legacy"])
	})

	const incomingKeys = (records: IncomingTransferRecord[], scope: Record<string, unknown> = scoped) =>
		buildActivityRows({ transactions: [], terminalJournalOps: [], incomingTransfers: records, ...scope }).map((r) => r.key)

	test("an incoming record stamped with another profile is dropped under a known scope, beside an identical kept one", () => {
		expect(incomingKeys([incoming({ key: "0xmine" }), incoming({ key: "0xtheirs", profileId: "p2", discoveredAt: 900 })])).toEqual([
			"incoming:note:p1|net-1|0xmine",
		])
	})

	test("an unknown scope profile keeps an incoming record stamped with any profile", () => {
		expect(incomingKeys([incoming({ key: "0xtheirs", profileId: "p2" })], { ...scoped, profileId: undefined })).toEqual([
			"incoming:note:p1|net-1|0xtheirs",
		])
	})

	test("an empty profile id is a known id on either side of the incoming profile check", () => {
		expect(
			incomingKeys([incoming({ key: "0xempty", profileId: "" }), incoming({ key: "0xtheirs", profileId: "p2", discoveredAt: 900 })], {
				...scoped,
				profileId: "",
			}),
		).toEqual(["incoming:note:p1|net-1|0xempty"])
		expect(incomingKeys([incoming({ key: "0xmine" }), incoming({ key: "0xempty", profileId: "", discoveredAt: 900 })])).toEqual([
			"incoming:note:p1|net-1|0xmine",
		])
	})
})

describe("journalRecordInScope — the one rule every journal surface applies", () => {
	const ACTIVE = { accountAddress: "0xa", profileId: "p1", networkId: "net-1" }

	test("a record stamped with the active profile and network shows", () => {
		expect(journalRecordInScope(journal({}), ACTIVE)).toBe(true)
	})

	test.each([
		["another profile", { profileId: "p2" }],
		["another network", { networkId: "net-2" }],
		["another account", { accountAddress: "0xother" }],
	])("a record stamped with %s does not", (_name, stamp) => {
		expect(journalRecordInScope(journal(stamp), ACTIVE)).toBe(false)
	})

	test("with no active profile no record shows, though its account and network match", () => {
		expect(journalRecordInScope(journal({}), { ...ACTIVE, profileId: undefined })).toBe(false)
	})

	test("with no active network a network-stamped record does not show and an unstamped one does", () => {
		const noNetwork = { ...ACTIVE, networkId: undefined }
		expect(journalRecordInScope(journal({}), noNetwork)).toBe(false)
		expect(journalRecordInScope(journal({ networkId: undefined }), noNetwork)).toBe(true)
	})

	test("a record with no network stamp shows on every network", () => {
		expect(journalRecordInScope(journal({ networkId: undefined }), { ...ACTIVE, networkId: "net-2" })).toBe(true)
	})
})

describe("buildActivityRows — read order", () => {
	const scoped = { accountAddress: "0xa", chainId: 1, networkId: "net-1", profileId: "p1" }
	const txReads = (over: Record<string, unknown>, scope: Record<string, unknown> = scoped) => {
		const log: string[] = []
		buildActivityRows({
			transactions: [recorded({ ...tx(1, "0xh"), chainId: 1, profileId: "p1", ...over } as Tx, log)],
			terminalJournalOps: [],
			incomingTransfers: [],
			...scope,
		})
		return log
	}
	const incomingReads = (over: Partial<IncomingNoteRecord>, scope: Record<string, unknown> = scoped) => {
		const log: string[] = []
		buildActivityRows({ transactions: [], terminalJournalOps: [], incomingTransfers: [recorded(incoming(over), log)], ...scope })
		return log
	}

	test("a tx stops at the first failed check, and a kept one reads its key after its scope", () => {
		expect(txReads({ account: "0xother" })).toEqual(["account"])
		expect(txReads({ chainId: 2 })).toEqual(["account", "chainId"])
		expect(txReads({ profileId: "p2" })).toEqual(["account", "chainId", "profileId"])
		expect(txReads({})).toEqual(["account", "chainId", "profileId", "hash", "createdAt"])
		expect(txReads({}, {})).toEqual(["profileId", "hash", "createdAt"])
	})

	test("an incoming record stops at the first failed check, and a kept one reads its sort key before its id", () => {
		expect(incomingReads({ accountAddress: "0xother" })).toEqual(["accountAddress"])
		expect(incomingReads({ networkId: "net-2" })).toEqual(["accountAddress", "networkId"])
		expect(incomingReads({ profileId: "p2" })).toEqual(["accountAddress", "networkId", "profileId"])
		expect(incomingReads({})).toEqual(["accountAddress", "networkId", "profileId", "blockTimestamp", "discoveredAt", "id"])
		expect(incomingReads({ blockTimestamp: 7 })).toEqual([
			"accountAddress",
			"networkId",
			"profileId",
			"blockTimestamp",
			"blockTimestamp",
			"id",
		])
		expect(incomingReads({}, {})).toEqual(["profileId", "blockTimestamp", "discoveredAt", "id"])
	})
})

describe("a token's rows", () => {
	const usdc = { id: 1, contract: "0xusdc" }
	const onContract = (hash: string, contract: string) => ({ ...tx(1, hash), calls: [{ contract }] }) as unknown as Tx
	const rows = buildActivityRows({
		transactions: [onContract("0x1", "0xusdc"), onContract("0x2", "0xeurc")],
		terminalJournalOps: [journal({ id: "j1", tokenId: 1 }), journal({ id: "j2", tokenId: 2 })],
		incomingTransfers: [incoming({ key: "0xa1", tokenId: 1 }), incoming({ key: "0xa2", tokenId: 2 })],
		accountAddress: "0xa",
		profileId: "p1",
		networkId: "net-1",
	})

	test("are its journal and incoming records by id and its txs by contract, never another token's", () => {
		expect(rows).toHaveLength(6)
		expect(
			rows
				.filter((row) => rowOnToken(row, usdc))
				.map((row) => row.key)
				.sort(),
		).toEqual(["incoming:note:p1|net-1|0xa1", "journal:j1", "tx:0x1"])
	})

	test("a tx with no calls belongs to no token", () => {
		expect(txOnToken({ calls: undefined } as unknown as Tx, "0xusdc")).toBe(false)
		expect(txOnToken(onContract("0x3", "0xusdc"), "0xusdc")).toBe(true)
	})
})

// Disappearing-card regression: T1 transitions to `succeeded` while T2 is
// still in-flight; T1's pending chain tx must remain visible so the user
// keeps seeing the row until the chain tx confirms. v2 Layer A made this
// live coverage — the runtime now populates `submitting.txHash` at all four
// execution-service call sites, and Home's feed and History both filter
// their chain txs through this helper (no blanket fallback).
describe("filterPendingDoubleRender", () => {
	const op = (overrides: Partial<OperationRecord>) => journal({ tokenId: 42, ...overrides })
	const t1Hash = "0xtxhash1"
	const t2Hash = "0xtxhash2"

	function tx(hash: string, status: TxStatus): MinimalChainTx {
		return { hash, status }
	}

	test("pending chain tx with no in-flight journal matches → stays visible", () => {
		const txs = [tx(t1Hash, TxStatus.Pending)]
		expect(filterPendingDoubleRender(txs, []).map((t) => t.hash)).toEqual([t1Hash])
	})

	test("pending chain tx that matches a `submitting` journal op → suppressed", () => {
		const txs = [tx(t1Hash, TxStatus.Pending)]
		const inFlight = [op({ id: "j1", kind: "dapp_execute", terminalAt: null, progress: { stage: "submitting", txHash: t1Hash } })]
		expect(filterPendingDoubleRender(txs, inFlight)).toEqual([])
	})

	test("pending T1 chain tx stays visible when T2 is queued (T2 has no txHash) — the lost-card pin", () => {
		const txs = [tx(t1Hash, TxStatus.Pending)]
		const inFlight = [
			op({
				id: "j2",
				kind: "dapp_execute",
				terminalAt: null,
				progress: { stage: "queued" },
				sessionId: "s1",
			}),
		]
		expect(filterPendingDoubleRender(txs, inFlight).map((t) => t.hash)).toEqual([t1Hash])
	})

	test("pending T1 chain tx stays visible when T2 is proving (no txHash yet) — covers the user-reported gap", () => {
		// Mirrors the QA-reported sequence: T1 succeeded, T2 still proving.
		// T1's pending chain tx must keep T1 on screen until it confirms.
		const txs = [tx(t1Hash, TxStatus.Pending)]
		const inFlight = [op({ id: "j2", kind: "dapp_execute", terminalAt: null, progress: { stage: "proving", enteredProveAt: 0 } })]
		expect(filterPendingDoubleRender(txs, inFlight).map((t) => t.hash)).toEqual([t1Hash])
	})

	test("submitting-stage journal records WITHOUT txHash don't suppress anything", () => {
		// `submitting.txHash` is optional in the schema. A record between FSM
		// entry and txHash population should NOT swallow unrelated pending txs.
		const txs = [tx(t1Hash, TxStatus.Pending)]
		const inFlight = [op({ id: "j1", kind: "dapp_execute", terminalAt: null, progress: { stage: "submitting" } })]
		expect(filterPendingDoubleRender(txs, inFlight).map((t) => t.hash)).toEqual([t1Hash])
	})

	test("non-pending chain txs are always visible regardless of in-flight set", () => {
		// Use any non-Pending status (Proposed, Proven, Finalized). The
		// filter only acts on Pending.
		const txs = [tx(t1Hash, TxStatus.Proven), tx(t2Hash, TxStatus.Finalized)]
		const inFlight = [op({ id: "j1", kind: "dapp_execute", terminalAt: null, progress: { stage: "submitting", txHash: t1Hash } })]
		// t1Hash matches but its chain tx is Proven, not Pending, so it stays.
		expect(
			filterPendingDoubleRender(txs, inFlight)
				.map((t) => t.hash)
				.sort(),
		).toEqual([t1Hash, t2Hash].sort())
	})

	test("multi-record in-flight set suppresses only the matching pending tx", () => {
		const txs = [tx(t1Hash, TxStatus.Pending), tx(t2Hash, TxStatus.Pending)]
		const inFlight = [
			op({ id: "j1", kind: "dapp_execute", terminalAt: null, progress: { stage: "submitting", txHash: t1Hash } }),
			op({ id: "j2", kind: "dapp_execute", terminalAt: null, progress: { stage: "queued" }, sessionId: "s1" }),
		]
		expect(filterPendingDoubleRender(txs, inFlight).map((t) => t.hash)).toEqual([t2Hash])
	})

	test("two concurrent journal records both at `submitting` → both matching pending chain txs suppressed", () => {
		// v2 Layer A: covers the multi-pending case the pre-v2 blanket-suppress
		// was masking. Two concurrent sendTx ops each reach `submitting` (each
		// carrying its own canonical txHash). Both matching pending chain txs
		// must be suppressed; non-matching chain txs stay visible.
		const t3Hash = "0xtxhash3"
		const txs = [tx(t1Hash, TxStatus.Pending), tx(t2Hash, TxStatus.Pending), tx(t3Hash, TxStatus.Pending)]
		const inFlight = [
			op({ id: "j1", kind: "dapp_execute", terminalAt: null, progress: { stage: "submitting", txHash: t1Hash } }),
			op({ id: "j2", kind: "dapp_execute", terminalAt: null, progress: { stage: "submitting", txHash: t2Hash } }),
		]
		expect(filterPendingDoubleRender(txs, inFlight).map((t) => t.hash)).toEqual([t3Hash])
	})
})
