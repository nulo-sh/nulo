import { CHAIN_IDS } from "@/utils/chain-ids"

/** The chains with a published canonical Sponsored FPC instance. An allow-list: a chain added later,
 *  or a custom one, gets no sponsor until a release names it, since a listed sponsor with no instance
 *  fails every fee it is picked for. */
const SPONSORED_FPC_CHAINS: ReadonlySet<number> = new Set([CHAIN_IDS.TESTNET, CHAIN_IDS.SANDBOX])

export const offersSponsoredFpc = (chainId: number): boolean => SPONSORED_FPC_CHAINS.has(chainId)
