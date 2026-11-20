/**
 * How far Nulo vouches for a contract, from the wallet's own evidence only: the signed list naming it
 * on the request's chain, one of the two fee contracts this build pins, or one of the protocol's own
 * contracts. Nothing a dApp sends can raise a level.
 */
import type { Ref } from "vue"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"
import { isSponsoredFpc } from "@/wallet/services/fpc/sponsored-fpc-address"
import { protocolContractName } from "./protocol-contracts"
import type { ListedToken, TokenMarkLookup } from "./token-icon"

export type ContractLevel = "nulo" | "scan" | "none"

/** `pending` until the list answers; `scan` has no source yet, so nothing returns it. */
export type ContractReading =
	| { level: "pending" }
	| { level: "none"; flagged: boolean }
	| { level: "nulo"; source: "token"; symbol: string; name: string; icon?: string; bridgeIcon?: string }
	| { level: "nulo"; source: "fpc" | "sponsor" }
	| { level: "nulo"; source: "protocol"; name: string }
	| { level: "scan"; name: string }

type ListedAt = { chainId?: number; contract?: string }

/** The signed list as `useTokenFlags` reads it. */
export type ListReader = TokenMarkLookup & {
	mapped: Readonly<Ref<boolean>>
	listedAt: (token: ListedAt | undefined) => ListedToken | undefined
}

/** A protocol contract's reading, which needs neither the list nor a chain. */
export function readProtocolContract(address: unknown): Extract<ContractReading, { source: "protocol" }> | undefined {
	const name = protocolContractName(address)
	return name === undefined ? undefined : { level: "nulo", source: "protocol", name }
}

/**
 * A signed flag outranks every other evidence, the pins and protocol contracts included, once the list
 * has answered; neither needs the list, so they read before the answer; a listed address counts only
 * on its own chain.
 */
export function readContract(reader: ListReader, chainId: number | undefined, address: unknown): ContractReading {
	const token = { chainId, contract: address === undefined || address === null ? undefined : String(address) }
	const mapped = reader.mapped.value
	if (mapped && reader.isFlagged(token)) return { level: "none", flagged: true }
	if (isPrivateFpc(token.contract)) return { level: "nulo", source: "fpc" }
	if (isSponsoredFpc(token.contract)) return { level: "nulo", source: "sponsor" }
	const protocol = readProtocolContract(token.contract)
	if (protocol) return protocol
	if (!mapped) return { level: "pending" }
	const listed = reader.listedAt(token)
	if (!listed) return { level: "none", flagged: false }
	const icon = reader.iconFor(token)
	const bridgeIcon = reader.bridgeIconFor(token)
	return {
		level: "nulo",
		source: "token",
		symbol: listed.symbol,
		name: listed.name,
		...(icon ? { icon } : {}),
		...(bridgeIcon ? { bridgeIcon } : {}),
	}
}
