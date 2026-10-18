import { FEE_JUICE_ADDRESS } from "@aztec-labs/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { OriginType, TransferType } from "@/wallet/services/transaction/spec"
import type { TxOrigin } from "@/wallet/services/transaction/spec"
import { FEE_METHODS, pickPrimaryIndex, pickPrimaryMethod } from "./primary-method"
import { TRANSFER_LABELS, type TransferKind, transferLabel } from "./token-transfer-vocabulary"
import { type ListedToken, type SettledCall, settledReading } from "./tx-amount"

export { FEE_METHODS, pickPrimaryMethod }

/** Keyed by a dApp-chosen function name, so a `Map`: a plain object answers `constructor`. */
const MINT_LABELS: ReadonlyMap<string, string> = new Map([
	["mint_to_public", "Mint (public)"],
	["mint_to_private", "Mint (private)"],
])

/** The other curated labels; transfer labels come from the descriptor-derived vocabulary. */
const METHOD_LABELS: ReadonlyMap<string, string> = new Map([
	["shield", "Shield"],
	["unshield", "Unshield"],
	["redeem_shield", "Redeem shield"],
	["claim_and_end_setup", "Claim Fee Juice"],
	["claim", "Claim Fee Juice"],
])

/** The L2 Fee Juice contract (a protocol constant). Labels below are meaningful ONLY on it. */
const FEE_JUICE_L2_ADDRESS = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS).toString().toLowerCase()

/** Methods whose "Claim Fee Juice" label is protocol-specific — a third-party contract's
 *  identically-named `claim`/`claim_and_end_setup` must NOT inherit fee-juice semantics on a
 *  trust surface (it would misdescribe what the user is authorizing). */
const FEE_JUICE_ONLY_LABELS = new Set(["claim", "claim_and_end_setup"])

/** The wallet's label for a name that claims a token transfer or mint, the six a reading must earn. */
export const tokenMovementLabel = (method: string): string | null => transferLabel(method) ?? MINT_LABELS.get(method) ?? null

const curatedLabel = (method: string): string | null => tokenMovementLabel(method) ?? METHOD_LABELS.get(method) ?? null

/**
 * Look up the wallet-curated friendly label for `method`. Returns `null` for anything not in the allowlist —
 * call sites that need a fallback (e.g. the journal title) use
 * `humanizeMethodName` instead, which title-cases unknowns. The
 * capability popup uses `getMethodLabel` because tautological
 * title-casing of a dApp-controlled function name on a trust-sensitive
 * surface would only add noise.
 */
export function getMethodLabel(method: string, contract?: string): string | null {
	// Fee-juice-only labels apply solely on the FeeJuice protocol contract. When a contract is given
	// and it isn't that one, suppress the label so a third-party `claim` isn't mislabeled as fee juice.
	if (FEE_JUICE_ONLY_LABELS.has(method) && contract !== undefined && contract.toLowerCase() !== FEE_JUICE_L2_ADDRESS) {
		return null
	}
	return curatedLabel(method)
}

/**
 * Maps a method name/selector to a human-readable label.
 * - Known Aztec methods get friendly labels; given `contract`, a label that belongs to one protocol
 *   contract (the fee-juice `claim`) applies only there
 * - Hex selectors get truncated
 * - Generic snake_case gets title-cased
 */
export function humanizeMethodName(method: string, contract?: string): string {
	return getMethodLabel(method, contract) ?? plainMethodName(method)
}

/** A call's title in the wallet's words: a transfer or mint label only on a call the wallet read as
 *  that movement; a name that claims one otherwise reads as its contract spells it. */
export function callTitle(method: string, contract: string | undefined, read: boolean): string {
	return !read && tokenMovementLabel(method) !== null ? plainMethodName(method) : humanizeMethodName(method, contract)
}

/** A name as its contract spells it, with no wallet label: a hex selector truncated, snake_case title-cased. */
export function plainMethodName(method: string): string {
	if (!method) return "Unknown"
	if (/^0x[0-9a-fA-F]+$/.test(method)) {
		return method.length > 10 ? `${method.slice(0, 10)}...` : method
	}
	return method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Find the user's primary call, skipping fee/entrypoint infrastructure calls.
 * Thin wrapper around the shared `pickPrimaryMethod` helper — the method
 * name comes from there; this returns the matching call object so
 * downstream consumers can read `contract` / `transfers` / `args`.
 *
 * Generic over the call shape so consumers (e.g. `app.store.ts` operating
 * on `Tx['calls']`, which has `transfers`) keep their full type rather than
 * being narrowed to the bare `{contract, method, args}` carrier.
 *
 * Behavior preserved exactly: empty input → undefined; an all-fee-only call
 * list returns the first call verbatim (pinned as a BUG PIN in the helper's
 * test file).
 */
export function getPrimaryCall<T extends { method: string }>(calls: T[]): T | undefined {
	if (!calls?.length) return undefined
	// Index-based, not find-by-name: when the primary's NAME also appears in the fee payload (the
	// paired FeeJuice claim), a name find would return the fee call's object - wrong contract/transfers.
	const idx = pickPrimaryIndex(calls)
	return idx === undefined ? calls[0] : calls[idx]
}

/** A transaction's category: how the wallet reads its primary call against the listed `tokens`. */
export function getTxCategory(calls: SettledCall[], tokens: readonly ListedToken[]): "transfer" | "mint" | "tx" {
	const call = getPrimaryCall(calls)
	return call === undefined ? "tx" : (settledReading(call, tokens) ?? "tx")
}

/** The token function each of the wallet's own transfer types runs, by the enum's number and by its
 *  name: a stored row may carry either, and `0` and `"0"` share an own key. */
const OWN_TRANSFER_KINDS: Readonly<Record<number | string, TransferKind>> = {
	[TransferType.Private]: "transferPrivate",
	[TransferType.PrivateToPublic]: "transferPrivateToPublic",
	[TransferType.Public]: "transferPublic",
	[TransferType.PublicToPrivate]: "transferPublicToPrivate",
	Private: "transferPrivate",
	PrivateToPublic: "transferPrivateToPublic",
	Public: "transferPublic",
	PublicToPrivate: "transferPublicToPrivate",
}

/** A settled call's title: a transfer the wallet sent itself by its recorded type, whatever its
 *  function is named; any other call by `callTitle` with the wallet's reading of it. */
export function settledCallTitle(call: SettledCall, tokens: readonly ListedToken[]): string {
	const type: unknown = call.transfers?.[0]?.type
	if ((typeof type === "number" || typeof type === "string") && Object.hasOwn(OWN_TRANSFER_KINDS, type)) {
		return TRANSFER_LABELS[OWN_TRANSFER_KINDS[type]]
	}
	return callTitle(call.method, call.contract, settledReading(call, tokens) !== null)
}

/** A transaction's title: its primary call's. */
export function getTxTitle(calls: SettledCall[], tokens: readonly ListedToken[]): string {
	const primary = getPrimaryCall(calls)
	return primary ? settledCallTitle(primary, tokens) : "Transaction"
}

/** The label of a dApp that names itself nothing. */
export const DAPP_LABEL = "dApp"

/**
 * Returns dApp name for DAPP origin, null for UI/other.
 */
export function getOriginLabel(origin?: TxOrigin): string | null {
	if (!origin || origin.type !== OriginType.DAPP) return null
	return origin.name || DAPP_LABEL
}

// TransferType enum values: Private=0, PrivateToPublic=1, Public=2, PublicToPrivate=3
const TRANSFER_TYPE_LABELS: Record<number | string, string> = {
	0: "Private → Private",
	1: "Private → Public",
	2: "Public → Public",
	3: "Public → Private",
	Private: "Private → Private",
	PrivateToPublic: "Private → Public",
	Public: "Public → Public",
	PublicToPrivate: "Public → Private",
}

/**
 * Returns a human-readable transfer type label.
 */
export function formatTransferType(type: number | string): string {
	// A stored row's `type`, so own keys only; `0` and `"0"` share a key, which a `Map` would split.
	return Object.hasOwn(TRANSFER_TYPE_LABELS, type) ? TRANSFER_TYPE_LABELS[type] : String(type)
}
