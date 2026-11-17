/**
 * What the Contracts page says of each contract the PXE holds. An origin is inferred, never recorded:
 * it is named only for a contract the wallet itself registers (the PXE at boot, an account, a fee
 * contract Nulo offers on the chain, a token's interface), else it reads as not recorded.
 */
import type { ChipModel } from "@/components/composite/contract-chip"
import { type ChipContext, contractChipAt } from "@/popup/windows/execute/contract-chips"
import { type BlockExplorerType, getContractExplorerUrl } from "@/wallet/constants/explorers"
import type { ContractRow } from "@/wallet/services/account-state/client"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"
import { isSponsoredFpc } from "@/wallet/services/fpc/sponsored-fpc-address"
import { offersSponsoredFpc } from "@/wallet/services/fpc/sponsored-fpc-chains"

export type ContractOrigin = "builtIn" | "account" | "fees" | "token" | "unknown"

export const ORIGIN_WORDS: Readonly<Record<ContractOrigin, string>> = {
	builtIn: "Built into every wallet",
	account: "Your account",
	fees: "Added by Nulo, for fees",
	token: "Added with your token",
	unknown: "Origin not recorded",
}

export type RowEvidence = {
	/** The chip's reading, without an explorer: the row's own action carries the link, and withholds it. */
	chip: Omit<ChipContext, "explorerId" | "names">
	/** The person's own names for addresses, keyed by the lower-cased address. */
	names: ReadonlyMap<string, string>
	/** The profile's accounts on this chain. */
	accounts: readonly { address: string }[]
	explorerId: BlockExplorerType | null | undefined
}

export type ContractRowView = {
	row: ContractRow
	origin: ContractOrigin
	chip: ChipModel
	explorerUrl: string | null
	haystack: string
}

/** Nulo discovers the canonical sponsor only where it is published; elsewhere a dApp put it there. */
const offeredSponsor = (address: string, chainId: number | undefined): boolean =>
	isSponsoredFpc(address) && chainId !== undefined && offersSponsoredFpc(chainId)

/** First match wins, so a token row never relabels an account or a pinned fee contract. */
export function contractOriginOf(
	row: ContractRow,
	accounts: ReadonlySet<string>,
	tokens: readonly { chainId: number; contract: string }[],
	chainId: number | undefined,
): ContractOrigin {
	const address = row.address.toLowerCase()
	if (row.builtIn) return "builtIn"
	if (accounts.has(address)) return "account"
	if (isPrivateFpc(address) || offeredSponsor(address, chainId)) return "fees"
	if (tokens.some((t) => t.chainId === chainId && t.contract.toLowerCase() === address)) return "token"
	return "unknown"
}

/** No explorer has a page for an account, the PrivateFPC or a sponsor on a chain where none is published. */
export function contractExplorerUrl(
	row: ContractRow,
	origin: ContractOrigin,
	chainId: number | undefined,
	explorerId: BlockExplorerType | null | undefined,
): string | null {
	const unpublished =
		origin === "account" || isPrivateFpc(row.address) || (isSponsoredFpc(row.address) && !offeredSponsor(row.address, chainId))
	if (unpublished) return null
	return getContractExplorerUrl(chainId, explorerId, row.address)
}

/** A built-in's compiled-in name stands in the name book, so only an unverified chip reads by it. */
export function contractRowViews(rows: readonly ContractRow[], evidence: RowEvidence): ContractRowView[] {
	const names = new Map(evidence.names)
	for (const row of rows) if (row.name && !names.has(row.address.toLowerCase())) names.set(row.address.toLowerCase(), row.name)
	const accounts = new Set(evidence.accounts.map((a) => a.address.toLowerCase()))
	const { chainId } = evidence.chip
	return rows.map((row) => {
		const origin = contractOriginOf(row, accounts, evidence.chip.tokens ?? [], chainId)
		const { model } = contractChipAt({ ...evidence.chip, names }, row.address)
		const ownName = names.get(row.address.toLowerCase())
		return {
			row,
			origin,
			chip: model,
			explorerUrl: contractExplorerUrl(row, origin, chainId, evidence.explorerId),
			haystack: [model.label, model.title, ownName, ORIGIN_WORDS[origin], row.address, row.classId]
				.filter(Boolean)
				.join(" ")
				.toLowerCase(),
		}
	})
}

export function matchingRows(views: readonly ContractRowView[], term: string | undefined): readonly ContractRowView[] {
	const needle = term?.trim().toLowerCase()
	return needle ? views.filter((v) => v.haystack.includes(needle)) : views
}
