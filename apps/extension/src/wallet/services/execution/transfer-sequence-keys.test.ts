import { describe, expect, test } from "vitest"
import { type Tx, TransferType, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import { keysIntersect, recordedTxKeys, transferSequenceKeys, usedSequences } from "./transfer-sequence-keys"

const ME = "0xMe"
const BOB = "0xBob"
const TST = "0xTst"

const keys = (type: TransferType, extra: Partial<Parameters<typeof transferSequenceKeys>[0]> = {}) =>
	[...transferSequenceKeys({ me: ME, token: TST, type, recipient: BOB, initializing: false, used: new Set(), ...extra })].sort()

function tx(type: TransferType, over: Partial<Tx> = {}): Tx {
	return {
		account: ME,
		chainId: 1,
		status: TxStatus.Proposed,
		executionResult: TxExecutionResult.Success,
		calls: [{ contract: TST, method: "m", args: [], transfers: [{ token: {} as never, type, from: ME, to: BOB, amount: "1" }] }],
		...over,
	} as Tx
}

describe("transferSequenceKeys", () => {
	test("each transfer type holds the sequences it delivers on, first sends also the pair's handshake", () => {
		expect(keys(TransferType.Private)).toEqual(["handshake:0xbob", "handshake:0xme", "seq:0xtst:0xbob", "seq:0xtst:0xme"])
		expect(keys(TransferType.PublicToPrivate)).toEqual(["handshake:0xbob", "seq:0xtst:0xbob"])
		expect(keys(TransferType.PrivateToPublic)).toEqual(["handshake:0xme", "seq:0xtst:0xme"])
		expect(keys(TransferType.Public)).toEqual([])
	})

	test("a used sequence drops its handshake; a fee spender and initialization add their keys", () => {
		const used = new Set(["0xtst:0xbob", "0xtst:0xme"])
		expect(keys(TransferType.Private, { used })).toEqual(["seq:0xtst:0xbob", "seq:0xtst:0xme"])
		expect(keys(TransferType.Public, { feeSpender: "0xFpc", initializing: true })).toEqual(["fpc:0xfpc", "init"])
	})
})

describe("usedSequences", () => {
	test("only a mined, successful private delivery to the recipient counts; change never does", () => {
		expect([...usedSequences([tx(TransferType.Private)], ME)]).toEqual(["0xtst:0xbob"])
		expect([...usedSequences([tx(TransferType.PrivateToPublic)], ME)]).toEqual([])
		expect([...usedSequences([tx(TransferType.Private, { status: TxStatus.Pending })], ME)]).toEqual([])
		expect([...usedSequences([tx(TransferType.Private, { executionResult: TxExecutionResult.AppLogicReverted })], ME)]).toEqual([])
	})
})

describe("recordedTxKeys and keysIntersect", () => {
	test("a recorded transfer holds its sequences and assumes first-use handshakes", () => {
		expect([...recordedTxKeys(tx(TransferType.PublicToPrivate))]).toEqual(["init", "seq:0xtst:0xbob", "handshake:0xbob"])
	})

	test("a recorded transfer holds its fee spender's key; with none, no fee contract", () => {
		expect(keysIntersect(recordedTxKeys(tx(TransferType.Public, { feeSpender: "0xFPC" })), new Set(["fpc:0xfpc"]))).toBe(true)
		expect([...recordedTxKeys(tx(TransferType.Public))].some((k) => k.startsWith("fpc:"))).toBe(false)
	})

	test("any recorded tx may be the account's first, so it holds an initializing send", () => {
		expect(keysIntersect(recordedTxKeys(tx(TransferType.Public)), new Set(["init"]))).toBe(true)
	})

	test("a call with no transfers holds every sequence of its contract, and only that contract's", () => {
		const dapp = recordedTxKeys({ account: ME, calls: [{ contract: TST, method: "m", args: [] }] })
		expect(keysIntersect(dapp, new Set(["seq:0xtst:0xanyone"]))).toBe(true)
		expect(keysIntersect(new Set(["seq:0xtst:0xanyone"]), dapp)).toBe(true)
		expect(keysIntersect(dapp, new Set(["seq:0xalt:0xanyone", "handshake:0xanyone"]))).toBe(false)
	})

	test("a call with no transfers may be a fee contract spending the payer's notes", () => {
		const paidByFpc = recordedTxKeys({ account: ME, calls: [{ contract: "0xFPC", method: "pay_fee", args: [] }] })
		expect(keysIntersect(paidByFpc, new Set(["fpc:0xfpc"]))).toBe(true)
		expect(keysIntersect(paidByFpc, new Set(["fpc:0xother"]))).toBe(false)
	})
})
