/**
 * The chain state a popup transfer consumes that a concurrent send of the same account must not.
 *
 * Aztec 6 delivers the token's private notes with constrained delivery: a send at index `i > 0` of
 * a (token, sender, recipient) sequence proves that the nullifier of `i - 1` exists, and index 0
 * creates or validates the (sender, recipient) handshake, a registry note every token shares and
 * each use nullifies. A fee contract that spends the payer's notes, and the account's own
 * initialization, are shared across tokens too. Two in-flight sends that share a key collide.
 */

import { type Tx, TransferType, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"

/** `seq:<token>:<recipient>`, `seq:<contract>:*`, `handshake:<recipient>`, `fpc:<address>` or `init`. */
export type SequenceKey = string

const lower = (s: string): string => s.toLowerCase()
const seqKey = (token: string, target: string): SequenceKey => `seq:${lower(token)}:${lower(target)}`
const usedKey = (token: string, target: string): string => `${lower(token)}:${lower(target)}`

/** Who receives a constrained note from `me`: the recipient of a private note, and me for change. */
export function deliveryTargets(type: TransferType, me: string, recipient: string): string[] {
	switch (type) {
		case TransferType.Private:
			return [recipient, me]
		case TransferType.PublicToPrivate:
			return [recipient]
		case TransferType.PrivateToPublic:
			return [me]
		default:
			return []
	}
}

export const minedSuccessfully = (tx: Pick<Tx, "status" | "executionResult">): boolean =>
	tx.status >= TxStatus.Proposed && tx.executionResult === TxExecutionResult.Success

const deliversToRecipient = (type: TransferType): boolean => type === TransferType.Private || type === TransferType.PublicToPrivate

export interface TransferKeyInput {
	me: string
	token: string
	type: TransferType
	recipient: string
	/** A fee contract that may spend my notes: any FPC but the protocol sponsor. */
	feeSpender?: string
	/** The account's initialization nullifier is not on chain yet. */
	initializing: boolean
	/** (token, target) sequences already advanced by a mined send, from {@link usedSequences}. */
	used: ReadonlySet<string>
}

export function transferSequenceKeys(input: TransferKeyInput): Set<SequenceKey> {
	const keys = new Set<SequenceKey>()
	for (const target of deliveryTargets(input.type, input.me, input.recipient)) {
		keys.add(seqKey(input.token, target))
		if (!input.used.has(usedKey(input.token, target))) keys.add(`handshake:${lower(target)}`)
	}
	if (input.feeSpender) keys.add(`fpc:${lower(input.feeSpender)}`)
	if (input.initializing) keys.add("init")
	return keys
}

/**
 * Sequences this account advanced: a successful mined tx that delivered a private note to the
 * recipient. Change is not evidence: an exact spend makes none. Rows stop being polled once mined,
 * so a block pruned after that still reads as mined here.
 */
export function usedSequences(history: readonly Tx[], me: string): Set<string> {
	const used = new Set<string>()
	for (const tx of history) {
		if (!minedSuccessfully(tx)) continue
		for (const call of tx.calls) {
			for (const t of call.transfers ?? []) {
				if (deliversToRecipient(t.type) && lower(t.from) === lower(me)) used.add(usedKey(call.contract, t.to))
			}
		}
	}
	return used
}

/**
 * Keys of a submitted tx known only from its record, read conservatively: it may be the account's
 * first tx, its handshakes are assumed first use, and a call with no transfers (a dApp tx, or the
 * fee call in its calls) may use any sequence of its contract or spend the payer's notes through it.
 * A popup transfer's record names no fee contract.
 */
export function recordedTxKeys(tx: Pick<Tx, "account" | "calls">): Set<SequenceKey> {
	const keys = new Set<SequenceKey>(["init"])
	for (const call of tx.calls) {
		if (!call.transfers?.length) {
			keys.add(`seq:${lower(call.contract)}:*`)
			keys.add(`fpc:${lower(call.contract)}`)
			continue
		}
		for (const t of call.transfers) {
			for (const k of transferSequenceKeys({
				me: tx.account,
				token: call.contract,
				type: t.type,
				recipient: t.to,
				initializing: false,
				used: new Set(),
			})) {
				keys.add(k)
			}
		}
	}
	return keys
}

/** Whether two key sets share a key; `seq:<contract>:*` matches every sequence of that contract. */
export function keysIntersect(a: ReadonlySet<SequenceKey>, b: ReadonlySet<SequenceKey>): boolean {
	for (const k of a) {
		if (b.has(k) || (k.startsWith("seq:") && b.has(wildcardOf(k)))) return true
		if (k.endsWith(":*") && [...b].some((other) => wildcardOf(other) === k)) return true
	}
	return false
}

const wildcardOf = (k: SequenceKey): SequenceKey => (k.startsWith("seq:") ? `${k.slice(0, k.lastIndexOf(":"))}:*` : k)
