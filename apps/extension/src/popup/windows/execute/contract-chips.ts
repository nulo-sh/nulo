/**
 * A contract position in the approval window as its chip draws it: the level from the signed list the
 * window reads, the person's own name for the address, the press's link from the explorer the person
 * picked.
 */
import { type ChipModel, contractChipOf } from "@/components/composite/contract-chip"
import { type ContractReading, type ListReader, readContract } from "@/utils/contract-level"
import { tokenMarkOf } from "@/utils/token-icon"
import { type BlockExplorerType, explorerDisplayName, getContractExplorerUrl } from "@/wallet/constants/explorers"
import type { TokenInfo } from "@/wallet/services/token/client"
import { tokenAt, wire } from "./call-surface"

/** The person's own names for addresses, keyed by the lower-cased address; `loading` until the
 *  window's read answers. */
export type NameBook = ReadonlyMap<string, string> | "loading"

export type ChipContext = {
	/** Without the list's reader no level is known, so every chip but none reads as pending. */
	reader?: ListReader
	chainId?: number
	tokens?: readonly TokenInfo[]
	explorerId?: BlockExplorerType | null
	/** Absent, no chip reads by a name; loading, a chip that could is pending. */
	names?: NameBook
}

export type ContractChipView = { model: ChipModel; explorer: { url: string; name: string } | null }

/**
 * A contact by `@` and its name, then an account by its name: `AddressDisplay`'s order and spelling.
 * Case does not make another address, so both key by the lower-cased address.
 */
export function nameBookOf(
	contacts: readonly { name: string; address: string }[],
	accounts: readonly { name?: string; address: string }[],
): ReadonlyMap<string, string> {
	const book = new Map<string, string>()
	for (const { name, address } of contacts) if (name && !book.has(address.toLowerCase())) book.set(address.toLowerCase(), `@${name}`)
	for (const { name, address } of accounts) if (name && !book.has(address.toLowerCase())) book.set(address.toLowerCase(), name)
	return book
}

/** An unverified, unflagged chip may still take a name, so it waits on a book that is loading. */
const settled = (reading: ContractReading, names: NameBook | undefined): ContractReading =>
	names === "loading" && reading.level === "none" && !reading.flagged ? { level: "pending" } : reading

/** `selfName` is the name the decoded contract's own code gives it. */
export function contractChipAt(ctx: ChipContext, contract: unknown, selfName?: string): ContractChipView {
	const address = wire(contract, 80)
	const read = ctx.reader ? readContract(ctx.reader, ctx.chainId, address) : ({ level: "pending" } as const)
	const reading = settled(read, ctx.names)
	const name = typeof ctx.names === "object" ? ctx.names.get(address.toLowerCase()) : undefined
	const held = tokenMarkOf(ctx.reader, tokenAt(ctx.tokens, ctx.chainId, address))
	const url = getContractExplorerUrl(ctx.chainId, ctx.explorerId, address)
	return {
		model: contractChipOf(reading, address, { held, selfName, name }),
		explorer: url ? { url, name: explorerDisplayName(ctx.explorerId) } : null,
	}
}
