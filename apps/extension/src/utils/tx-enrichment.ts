import { FEE_JUICE_ADDRESS } from "@aztec-labs/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { OriginType } from "@/wallet/services/transaction/spec"
import type { TxOrigin } from "@/wallet/services/transaction/spec"
import type { TokenInfo } from "@/wallet/services/token/spec"
import { FEE_METHODS, pickPrimaryIndex, pickPrimaryMethod } from "./primary-method"
import { transferLabel } from "./token-transfer-vocabulary"
import { type SettledCall, settledReading } from "./tx-amount"

export { FEE_METHODS, pickPrimaryMethod }

const MINT_LABELS: Record<string, string> = {
	mint_to_public: "Mint (public)",
	mint_to_private: "Mint (private)",
}

/** The other curated labels; transfer labels come from the descriptor-derived vocabulary. */
const METHOD_LABELS: Record<string, string> = {
	shield: "Shield",
	unshield: "Unshield",
	redeem_shield: "Redeem shield",
	claim_and_end_setup: "Claim Fee Juice",
	claim: "Claim Fee Juice",
}

/** The L2 Fee Juice contract (a protocol constant). Labels below are meaningful ONLY on it. */
const FEE_JUICE_L2_ADDRESS = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS).toString().toLowerCase()

/** Methods whose "Claim Fee Juice" label is protocol-specific — a third-party contract's
 *  identically-named `claim`/`claim_and_end_setup` must NOT inherit fee-juice semantics on a
 *  trust surface (it would misdescribe what the user is authorizing). */
const FEE_JUICE_ONLY_LABELS = new Set(["claim", "claim_and_end_setup"])

/** The wallet's label for a name that claims a token transfer or mint, the six a reading must earn. */
export const tokenMovementLabel = (method: string): string | null => transferLabel(method) ?? MINT_LABELS[method] ?? null

const curatedLabel = (method: string): string | null => tokenMovementLabel(method) ?? METHOD_LABELS[method] ?? null

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

type ListedToken = Pick<TokenInfo, "contract" | "classId">

/** A transaction's category: how the wallet reads its primary call against the listed `tokens`. */
export function getTxCategory(calls: SettledCall[], tokens: readonly ListedToken[]): "transfer" | "mint" | "tx" {
	const call = getPrimaryCall(calls)
	return call === undefined ? "tx" : (settledReading(call, tokens) ?? "tx")
}

/** A transaction's title: "Transfer" for a transfer the wallet read, else its primary call's title. */
export function getTxTitle(calls: SettledCall[], tokens: readonly ListedToken[]): string {
	const primary = getPrimaryCall(calls)
	if (!primary) return "Transaction"
	const reading = settledReading(primary, tokens)
	if (reading === "transfer") return "Transfer"
	return callTitle(primary.method, primary.contract, reading === "mint")
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
	return TRANSFER_TYPE_LABELS[type] ?? String(type)
}
