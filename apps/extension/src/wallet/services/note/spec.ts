// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
export const NOTE_SERVICE_NAME = "note"

export type Note = {
	/** The contract address this note is created in. */
	contract: string
	/** The specific storage location of the note on the contract. */
	storageSlot: string
	/** The hash of the tx the note was created in. */
	txHash: string
	/** Data stored inside the note (decoded if it's a known type, or encoded otherwise). */
	rawContent: string[]
	/** Guessed type of the note (e.g., "UintNote", "NFTNote"). */
	type?: string
	/** Friendly name of the parent contract (e.g., "Aztec Token", "Private FPC"),
	 *  populated when the contract's class id is in the bundled-standards set. */
	contractName?: string
	/** Location in the contract storage. */
	location?: string
	/** Parsed (according to the guessed type) content. */
	content?: Record<string, string>
	/** When set, this note failed to parse — the page renders a fallback card. */
	renderError?: string
}

/** Note shape extended with the identity + ordering fields that the popup-friendly `Note` shape
 *  lacks. Used by background-side consumers (incoming-transfer discovery) that need a per-note
 *  identity for idempotent records and the block-index tuple for ordering. */
export type RawNote = Note & {
	/** The leaf the note's creation inserts into the note hash tree. It survives a re-mine, even
	 *  under a fee-bump replacement with another tx hash, and differs for any other note at the same
	 *  position; the key of incoming-transfer records. */
	uniqueNoteHash: string
	/** Note's commitment hash. Stable per note. */
	noteHash: string
	/** L2 block the note was created in. Ordering field. */
	l2BlockNumber: number
	/** Index of the parent tx within the block. Ordering tiebreaker. */
	txIndexInBlock: number
	/** Index of the note within the tx. Ordering tiebreaker. */
	noteIndexInTx: number
}

/** Which notes a raw read returns: unspent only, or spent ones too, unmarked. */
export type NoteReadStatus = "active" | "active-or-nullified"

/** The block the PXE last synced to. */
export type SyncedBlock = { number: number; hash: string }

export type Methods = {
	/**
	 * Returns a list of private notes (popup-friendly shape).
	 * @param networkId Network id.
	 * @param account Account address.
	 * @param contract Contract address the note belongs to.
	 */
	getNotes(networkId: string, account: string, contract?: string): Note[]
	/**
	 * Same as `getNotes` plus each note's identity + ordering fields, for background-side consumers
	 * that key records by `uniqueNoteHash` or order by `(l2BlockNumber, txIndexInBlock,
	 * noteIndexInTx)`. Rejects when a note's identity cannot be computed. `status` defaults to
	 * `"active"`.
	 */
	getNotesRaw(networkId: string, account: string, contract?: string, status?: NoteReadStatus): RawNote[]
	/**
	 * Chain-derived UTC seconds for an L2 block. Returns `undefined` when
	 * the node can't resolve it. Thin wrapper over PxeService so the
	 * incoming-transfer service can populate `IncomingTransferRecord.blockTimestamp`
	 * without taking a PXE-service dependency directly.
	 */
	getBlockTimestamp(networkId: string, blockNumber: number): number | undefined
	/**
	 * The PXE's synced block, read without syncing. A notes read syncs first but swallows a failed
	 * sync, so a caller that must know which block a read answered from brackets it with this.
	 */
	getSyncedBlock(networkId: string): SyncedBlock
}
