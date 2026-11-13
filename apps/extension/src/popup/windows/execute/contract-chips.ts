/**
 * A contract position in the approval window as its chip draws it: the level from the signed list the
 * window reads, the press's link from the explorer the person picked.
 */
import { type ChipModel, contractChipOf } from "@/components/composite/contract-chip"
import { type ListReader, readContract } from "@/utils/contract-level"
import { tokenMarkOf } from "@/utils/token-icon"
import { type BlockExplorerType, explorerDisplayName, getContractExplorerUrl } from "@/wallet/constants/explorers"
import type { TokenInfo } from "@/wallet/services/token/client"
import { tokenAt, wire } from "./call-surface"

export type ChipContext = {
	/** Without the list's reader no level is known, so every chip but none reads as pending. */
	reader?: ListReader
	chainId?: number
	tokens?: readonly TokenInfo[]
	explorerId?: BlockExplorerType | null
}

export type ContractChipView = { model: ChipModel; explorer: { url: string; name: string } | null }

/** `selfName` is the name the decoded contract's own code gives it. */
export function contractChipAt(ctx: ChipContext, contract: unknown, selfName?: string): ContractChipView {
	const address = wire(contract, 80)
	const reading = ctx.reader ? readContract(ctx.reader, ctx.chainId, address) : ({ level: "pending" } as const)
	const held = tokenMarkOf(ctx.reader, tokenAt(ctx.tokens, ctx.chainId, address))
	const url = getContractExplorerUrl(ctx.chainId, ctx.explorerId, address)
	return {
		model: contractChipOf(reading, address, { held, selfName }),
		explorer: url ? { url, name: explorerDisplayName(ctx.explorerId) } : null,
	}
}
