/**
 * How far Nulo vouches for a contract, from the wallet's own evidence only: the signed list naming it
 * on the request's chain, or the PrivateFPC this build pins. Nothing a dApp sends can raise a level.
 */
import type { Ref } from "vue"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"
import type { ListedToken, TokenMarkLookup } from "./token-icon"

export type ContractLevel = "nulo" | "scan" | "none"

/** `pending` until the list answers; `scan` has no source yet, so nothing returns it. */
export type ContractReading =
	| { level: "pending" }
	| { level: "none"; flagged: boolean }
	| { level: "nulo"; source: "token"; symbol: string; name: string; icon?: string }
	| { level: "nulo"; source: "fpc" }
	| { level: "scan"; name: string }

type ListedAt = { chainId?: number; contract?: string }

/** The signed list as `useTokenFlags` reads it. */
export type ListReader = TokenMarkLookup & {
	mapped: Readonly<Ref<boolean>>
	listedAt: (token: ListedAt | undefined) => ListedToken | undefined
}

/**
 * A signed flag outranks every other evidence, the pin included, once the list has answered; the pin
 * needs no list, so it reads before the answer; a listed address counts only on its own chain.
 */
export function readContract(reader: ListReader, chainId: number | undefined, address: unknown): ContractReading {
	const token = { chainId, contract: address === undefined || address === null ? undefined : String(address) }
	const mapped = reader.mapped.value
	if (mapped && reader.isFlagged(token)) return { level: "none", flagged: true }
	if (isPrivateFpc(token.contract)) return { level: "nulo", source: "fpc" }
	if (!mapped) return { level: "pending" }
	const listed = reader.listedAt(token)
	if (!listed) return { level: "none", flagged: false }
	const icon = reader.iconFor(token)
	return { level: "nulo", source: "token", symbol: listed.symbol, name: listed.name, ...(icon ? { icon } : {}) }
}
