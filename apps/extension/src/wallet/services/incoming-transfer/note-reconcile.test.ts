import { describe, expect, test } from "vitest"
import type { RawNote } from "@/wallet/services/note/spec"
import { type NoteBracket, decideNoteRow, isVerifiedBracket, movedRows, needsBracket, notesByNullifier } from "./note-reconcile"
import { type IncomingNoteRecord, noteRecordId } from "./spec"

const nullifier = (n: number) => `0x${n.toString(16).padStart(64, "0")}`

function row(n: number, at: { block: number; tx?: number; index?: number }): IncomingNoteRecord {
	return {
		kind: "note",
		id: noteRecordId("p1", "n1", nullifier(n)),
		siloedNullifier: nullifier(n),
		profileId: "p1",
		networkId: "n1",
		accountAddress: "0xa",
		contract: "0xc",
		owner: "0xa",
		amountRaw: "1",
		noteHash: "0xnh",
		txHash: "0xth",
		l2BlockNumber: at.block,
		txIndexInBlock: at.tx ?? 0,
		indexInTx: at.index ?? 0,
		hidden: false,
		discoveredAt: 0,
	}
}

function note(n: number, at: { block: number; tx?: number; index?: number }): RawNote {
	return {
		contract: "0xc",
		storageSlot: "0x1",
		txHash: "0xth",
		rawContent: [],
		siloedNullifier: nullifier(n),
		noteHash: "0xnh",
		l2BlockNumber: at.block,
		txIndexInBlock: at.tx ?? 0,
		noteIndexInTx: at.index ?? 0,
	}
}

const TIP = `0x${"ab".repeat(32)}`
const OTHER = `0x${"cd".repeat(32)}`

describe("note reconciliation, step 1: the unspent read", () => {
	test("a row at another block, transaction index or note index moves; one at its position does not", () => {
		const rows = [row(1, { block: 10 }), row(2, { block: 10 }), row(3, { block: 10 }), row(4, { block: 10 })]
		const active = notesByNullifier([
			note(1, { block: 11 }),
			note(2, { block: 10, tx: 1 }),
			note(3, { block: 10, index: 2 }),
			note(4, { block: 10 }),
		])
		expect(movedRows(rows, active).map(({ row, note }) => [row.siloedNullifier, note.l2BlockNumber])).toEqual([
			[nullifier(1), 11],
			[nullifier(2), 10],
			[nullifier(3), 10],
		])
	})

	test.each<[string, IncomingNoteRecord[], RawNote[], number | undefined, boolean]>([
		["every row present above the finalized tip", [row(1, { block: 60 })], [note(1, { block: 60 })], 50, false],
		["a present row at the finalized tip", [row(1, { block: 50 })], [note(1, { block: 50 })], 50, true],
		["a row missing from the read", [row(1, { block: 60 })], [], 50, true],
		["no tips: a present row at any height", [row(1, { block: 5 })], [note(1, { block: 5 })], undefined, false],
		["no tips: a missing row", [row(1, { block: 5 })], [], undefined, true],
	])("bracket needed, %s: %s", (_name, rows, active, finalized, expected) => {
		expect(needsBracket(rows, notesByNullifier(active), finalized)).toBe(expected)
	})
})

describe("note reconciliation, step 2: the bracketed read", () => {
	const verified: NoteBracket = { finalized: 50, synced: 70, verified: true }
	const unverified: NoteBracket = { ...verified, verified: false }

	test.each<[string, IncomingNoteRecord, RawNote | undefined, NoteBracket, boolean, ReturnType<typeof decideNoteRow>["kind"], boolean?]>([
		["at its position, at the finalized tip, verified", row(1, { block: 50 }), note(1, { block: 50 }), verified, false, "settle"],
		[
			"at its position, at the finalized tip, unverified",
			row(1, { block: 50 }),
			note(1, { block: 50 }),
			unverified,
			false,
			"wait",
			false,
		],
		["at its position, above the finalized tip", row(1, { block: 51 }), note(1, { block: 51 }), verified, false, "wait", true],
		["at another position, unverified", row(1, { block: 50 }), note(1, { block: 50, tx: 3 }), unverified, false, "move"],
		["missing at the synced block, verified, not struck", row(1, { block: 70 }), undefined, verified, false, "strike"],
		["missing at the synced block, verified, struck", row(1, { block: 70 }), undefined, verified, true, "delete"],
		["missing at the synced block, unverified, struck", row(1, { block: 70 }), undefined, unverified, true, "wait", false],
		["missing above the synced block, struck", row(1, { block: 71 }), undefined, verified, true, "wait", true],
	])("%s", (_name, r, n, bracket, struck, kind, reached) => {
		const decision = decideNoteRow(r, n, bracket, struck)
		expect(decision.kind).toBe(kind)
		if (decision.kind === "wait") expect(decision.reached).toBe(reached)
	})

	test.each<[string, string, string, boolean]>([
		["both synced reads at the tip", TIP, TIP, true],
		["both at the tip, other case", TIP.toUpperCase().replace("0X", "0x"), TIP, true],
		["the first read behind the tip", OTHER, TIP, false],
		["the second read past the tip", TIP, OTHER, false],
	])("verified bracket, %s", (_name, before, after, expected) => {
		expect(isVerifiedBracket({ number: 70, hash: before }, { number: 70, hash: after }, TIP)).toBe(expected)
	})
})
