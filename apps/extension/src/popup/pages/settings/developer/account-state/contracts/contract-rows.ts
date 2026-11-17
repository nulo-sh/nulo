/**
 * What the Contracts page says of each contract the PXE holds. An origin is named only where the
 * wallet itself registered the contract (the PXE at boot, the account, the pinned fee contracts, a
 * token's interface); nothing records which app registered anything else.
 */
import type { ChipModel } from "@/components/composite/contract-chip"
import { type ChipContext, contractChipAt } from "@/popup/windows/execute/contract-chips"
import { type BlockExplorerType, getContractExplorerUrl } from "@/wallet/constants/explorers"
import type { ContractRow } from "@/wallet/services/account-state/client"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"
import { isSponsoredFpc } from "@/wallet/services/fpc/sponsored-fpc-address"

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
	/** Lower-cased: the chip's label and title, the person's or compiled-in name, the origin and both ids. */
	haystack: string
}

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
	if (isPrivateFpc(address) || isSponsoredFpc(address)) return "fees"
	if (tokens.some((t) => t.chainId === chainId && t.contract.toLowerCase() === address)) return "token"
	return "unknown"
}

/** An account and the PrivateFPC are never published, so no explorer has a page for either. */
export function contractExplorerUrl(
	row: ContractRow,
	origin: ContractOrigin,
	chainId: number | undefined,
	explorerId: BlockExplorerType | null | undefined,
): string | null {
	if (origin === "account" || isPrivateFpc(row.address)) return null
	return getContractExplorerUrl(chainId, explorerId, row.address)
}

/** A built-in reads by its compiled-in name where the person gave its address none; an unverified chip takes it. */
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
