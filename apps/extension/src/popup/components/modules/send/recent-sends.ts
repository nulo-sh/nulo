import { isValidAztecAddress } from "@/utils/aztec-address"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { TransferType } from "@/wallet/services/transaction/spec"

/** The profile, network and account Send is paying from. */
export interface SendScope {
	profileId: string | undefined
	networkId: string | undefined
	accountAddress: string | undefined
}

/** A send from this popup that the node took. `arrival` is null for a record written before the
 *  journal kept the transfer's sides, whose arrival cannot be recovered. */
export interface PastSend {
	address: string
	tokenId: number
	amountRaw: bigint
	arrival: "private" | "public" | null
	at: number
}

const BASE_UNITS = /^\d+$/

function arrivalOf(type: TransferType | undefined): PastSend["arrival"] {
	switch (type) {
		case TransferType.Private:
		case TransferType.PublicToPrivate:
			return "private"
		case TransferType.PrivateToPublic:
		case TransferType.Public:
			return "public"
		default:
			return null
	}
}

function inScope(op: OperationRecord, scope: SendScope): boolean {
	if (!scope.profileId || !scope.networkId || !scope.accountAddress) return false
	return op.profileId === scope.profileId && op.networkId === scope.networkId && op.accountAddress === scope.accountAddress
}

function parseSend(op: OperationRecord, scope: SendScope, tokenIds: ReadonlySet<number>): PastSend | null {
	if (op.kind !== "transfer" || op.origin !== "popup" || op.progress.stage !== "succeeded") return null
	if (!inScope(op, scope)) return null
	const { recipientAddress: address, amountRaw, tokenId } = op
	if (!address || !isValidAztecAddress(address)) return null
	if (!amountRaw || !BASE_UNITS.test(amountRaw)) return null
	if (tokenId === undefined || !tokenIds.has(tokenId)) return null
	return { address, tokenId, amountRaw: BigInt(amountRaw), arrival: arrivalOf(op.transferType), at: op.terminalAt ?? op.updatedAt }
}

/**
 * The scope's succeeded popup transfers, newest first. A row is skipped unless its recipient is a
 * valid address, its amount whole base units and its token one the list holds: the journal keeps
 * loose strings, and a send replayed from one must name exactly what it named.
 */
export function parseSends(records: readonly OperationRecord[], scope: SendScope, tokenIds: ReadonlySet<number>): PastSend[] {
	return records
		.map((op) => parseSend(op, scope, tokenIds))
		.filter((send): send is PastSend => send !== null)
		.sort((a, b) => b.at - a.at)
}

const keyOf = (address: string): string => address.toLowerCase()

/** The newest send to each recipient, newest first, own accounts left out. */
export function recentRecipients(sends: readonly PastSend[], ownAddresses: readonly string[], limit = 4): PastSend[] {
	const own = new Set(ownAddresses.map(keyOf))
	const seen = new Set<string>()
	const rows: PastSend[] = []
	for (const send of sends) {
		const key = keyOf(send.address)
		if (own.has(key) || seen.has(key)) continue
		seen.add(key)
		rows.push(send)
		if (rows.length === limit) break
	}
	return rows
}

/** The newest send to `address`, or null. */
export function lastSendTo(sends: readonly PastSend[], address: string): PastSend | null {
	const key = keyOf(address)
	return sends.find((s) => keyOf(s.address) === key) ?? null
}

/** An address this wallet has a record of: a contact, one of its accounts, or a past send. */
export function isKnownAddress(
	address: string,
	known: { contacts: readonly { address?: string }[]; accounts: readonly { address?: string }[]; sends: readonly PastSend[] },
): boolean {
	const key = keyOf(address)
	const matches = (row: { address?: string }) => row.address !== undefined && keyOf(row.address) === key
	return known.contacts.some(matches) || known.accounts.some(matches) || known.sends.some(matches)
}

/** How long ago a send was, in the words a recent row reads. */
export function sentAgo(at: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - at) / 1000))
	if (seconds < 45) return "just now"
	const minutes = Math.round(seconds / 60)
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	if (hours < 24) return `${hours} h ago`
	const days = Math.round(hours / 24)
	return days === 1 ? "yesterday" : `${days} days ago`
}

/** "10 USDC, privately"; the amount alone for a record that kept no sides. */
export function sendWords(amount: string, symbol: string, arrival: PastSend["arrival"]): string {
	const base = `${amount} ${symbol}`
	if (arrival === null) return base
	return `${base}, ${arrival === "private" ? "privately" : "publicly"}`
}
