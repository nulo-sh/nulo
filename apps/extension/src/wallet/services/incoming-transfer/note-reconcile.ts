import type { RawNote, SyncedBlock } from "@/wallet/services/note/spec"
import type { IncomingNoteRecord } from "./spec"

/**
 * What one scan decides about an unsettled note row from the PXE's spent-or-unspent read.
 * `wait.reached` is false while a rerun at the same tips could decide the row, so the target must
 * not be skipped until the tips move; a struck row counts the same way.
 */
export type NoteRowDecision =
	| { kind: "settle" }
	| { kind: "move"; note: RawNote }
	| { kind: "strike" }
	| { kind: "delete" }
	| { kind: "wait"; reached: boolean }

/** The bracketed read's frame: the finalized tip, the PXE's synced block after the read, and
 *  whether both synced reads carried the chain's proposed tip. */
export type NoteBracket = { finalized: number; synced: number; verified: boolean }

/** A same-height re-mine moves a note's transaction or note index, so all three are its position. */
export function atPosition(row: IncomingNoteRecord, note: RawNote): boolean {
	return row.l2BlockNumber === note.l2BlockNumber && row.txIndexInBlock === note.txIndexInBlock && row.indexInTx === note.noteIndexInTx
}

export function notesByNullifier(notes: RawNote[]): Map<string, RawNote> {
	return new Map(notes.map((n) => [n.siloedNullifier, n]))
}

/** The rows the unspent read shows at another position. Nothing else is decided from it: it is not
 *  bracketed, and a row missing from it may be spent. */
export function movedRows(rows: IncomingNoteRecord[], active: Map<string, RawNote>): Array<{ row: IncomingNoteRecord; note: RawNote }> {
	const moved: Array<{ row: IncomingNoteRecord; note: RawNote }> = []
	for (const row of rows) {
		const note = active.get(row.siloedNullifier)
		if (note && !atPosition(row, note)) moved.push({ row, note })
	}
	return moved
}

/** Whether a row needs the bracketed read: missing from the unspent read, or at or below the
 *  finalized tip, where it may settle. Without a finalized tip only a missing row needs it. */
export function needsBracket(rows: IncomingNoteRecord[], active: Map<string, RawNote>, finalized: number | undefined): boolean {
	return rows.some((row) => !active.has(row.siloedNullifier) || (finalized !== undefined && row.l2BlockNumber <= finalized))
}

/** The PXE's block stream swallows a failed sync, so a read can answer from a stale anchor; it is
 *  trusted only when the synced block on both sides of it is the tip the scan read from the node. */
export function isVerifiedBracket(before: SyncedBlock, after: SyncedBlock, proposedBlockHash: string): boolean {
	const tip = proposedBlockHash.toLowerCase()
	return before.hash.toLowerCase() === tip && after.hash.toLowerCase() === tip
}

/**
 * A row seen at its position on a finalized block settles; seen elsewhere, it moves. A row missing
 * at or below the synced block is struck, and deleted only when an earlier scan struck it too: a
 * re-included transaction can bring the note back after one absence, and discovery never re-adds a
 * note spent before it is seen again. Settling, striking and deleting need a verified bracket; a
 * missing row above the synced block waits for a new block.
 */
export function decideNoteRow(row: IncomingNoteRecord, note: RawNote | undefined, bracket: NoteBracket, struck: boolean): NoteRowDecision {
	if (note) {
		if (!atPosition(row, note)) return { kind: "move", note }
		if (row.l2BlockNumber > bracket.finalized) return { kind: "wait", reached: true }
		return bracket.verified ? { kind: "settle" } : { kind: "wait", reached: false }
	}
	if (row.l2BlockNumber > bracket.synced) return { kind: "wait", reached: true }
	if (!bracket.verified) return { kind: "wait", reached: false }
	return struck ? { kind: "delete" } : { kind: "strike" }
}
