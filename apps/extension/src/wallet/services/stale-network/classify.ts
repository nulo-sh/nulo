import { seedForKind } from "@/wallet/services/network/seeds"
import type { ChainKind } from "@/wallet/services/network/spec"
import type { StaleEntry } from "./types"

export type ClassifiedNetwork = { id: string; chainId: number; l1ChainId: number; kind?: ChainKind }

/** `derivedAddress` is present exactly for the rows this build re-derives (Nulo_v1). */
export type ClassifiedAccount = {
	chainId: number
	l1ChainId: number
	index: number
	address: string
	derivedAddress?: string
}

export type UnclassifiableMismatch = { chainId: number; accountIndex: number; storedAddress: string; derivedAddress: string }

/** `unclassifiable` set means the profile stays blocked as a whole; `entries` is then meaningless. */
export type Classification = { entries: StaleEntry[]; unclassifiable: UnclassifiableMismatch | null }

/** A seeded row whose chain identity is behind this build's seed for its kind. Computed from the
 *  row and the build alone, so it holds from the worker's first instant, before any verdict. */
export function hasNetworkCause(row: { chainId: number; kind?: ChainKind }): boolean {
	const seed = seedForKind(row.kind)
	return seed !== undefined && row.chainId !== seed.chainId
}

type ChainVerdict = { kind: "clean" } | { kind: "moved" } | { kind: "unclassifiable"; mismatch: UnclassifiableMismatch }

/** A chain's mismatches are confinable only when one network row owns the chain, every derived
 *  row on it moved, and every account on it derives under that row's L1. */
function classifyChain(chainId: number, rows: ClassifiedNetwork[], accounts: ClassifiedAccount[]): ChainVerdict {
	const derived = accounts.filter((a) => a.derivedAddress !== undefined)
	const moved = derived.filter((a) => a.derivedAddress !== a.address)
	const first = moved[0]
	if (!first) return { kind: "clean" }
	const confined = rows.length === 1 && moved.length === derived.length && accounts.every((a) => a.l1ChainId === rows[0]!.l1ChainId)
	if (confined) return { kind: "moved" }
	return {
		kind: "unclassifiable",
		mismatch: { chainId, accountIndex: first.index, storedAddress: first.address, derivedAddress: first.derivedAddress! },
	}
}

/**
 * Per-chain staleness of one profile's storage against this build. Deterministic and offline: it
 * reads storage and the build's seeds, never a node.
 */
export function classifyChains(networks: ClassifiedNetwork[], accounts: ClassifiedAccount[]): Classification {
	const chainIds = [...new Set([...networks.map((n) => n.chainId), ...accounts.map((a) => a.chainId)])]
	const moved = new Set<number>()
	for (const chainId of chainIds) {
		const verdict = classifyChain(
			chainId,
			networks.filter((n) => n.chainId === chainId),
			accounts.filter((a) => a.chainId === chainId),
		)
		if (verdict.kind === "unclassifiable") return { entries: [], unclassifiable: verdict.mismatch }
		if (verdict.kind === "moved") moved.add(chainId)
	}
	const entries: StaleEntry[] = []
	for (const row of networks) {
		const networkReset = hasNetworkCause(row)
		const l1Moves = networkReset && row.l1ChainId !== seedForKind(row.kind)!.l1ChainId
		const addressesMoved = moved.has(row.chainId) || l1Moves
		if (networkReset || addressesMoved) entries.push({ networkId: row.id, chainId: row.chainId, networkReset, addressesMoved })
	}
	return { entries, unclassifiable: null }
}
