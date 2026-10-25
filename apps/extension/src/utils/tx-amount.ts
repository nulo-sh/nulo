import { sameFieldAddress } from "@nulo/wallet-bridge"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"
import type { TokenInfo } from "@/wallet/services/token/spec"
import type { TxCall, TxTransfer } from "@/wallet/services/transaction/spec"
import { pickPrimaryIndex } from "./primary-method"
import { findTransferSignature } from "./token-transfer-vocabulary"
import { isValidDecimals, knownDecimals } from "./token-amount"

export type TxAmount = { units: bigint; decimals: number; symbol: string }

/** A call as the settled rule reads it: of its arguments, only how many. */
export type SettledCall = Pick<TxCall, "contract" | "method" | "classId" | "transfers"> & { args: { readonly length: number } }
export type ListedToken = Pick<TokenInfo, "contract" | "classId">

/** The aztec-standards Token's mints, each `(recipient or commitment, amount: u128)`. */
const STANDARD_MINTS: ReadonlySet<string> = new Set(["mint_to_public", "mint_to_private", "mint_to_commitment"])
const U128_BOUND = 2n ** 128n

/** A symbol a contract or a restored record set, fit to show; anything but text shows as none. */
export const displaySymbol = (symbol: unknown): string => sanitizeWireString(typeof symbol === "string" ? symbol : "", 32)

function fromTransfer({ amount, token }: TxTransfer): TxAmount | null {
	if (!isValidDecimals(token?.decimals) || typeof amount !== "string" || !/^\d{1,80}$/.test(amount)) return null
	return { units: BigInt(amount), decimals: token.decimals, symbol: displaySymbol(token.symbol) }
}

function u128(arg: unknown): bigint | null {
	if (typeof arg !== "string" || !/^(?:\d{1,39}|0x[0-9a-fA-F]{1,64})$/.test(arg)) return null
	const units = BigInt(arg)
	return units < U128_BOUND ? units : null
}

/** A class id is a field element, like an address: a missing or malformed side never matches. */
function samePinnedClass(token: Pick<TokenInfo, "classId">, call: Pick<TxCall, "classId">): boolean {
	return token.classId !== undefined && call.classId !== undefined && sameFieldAddress(token.classId, call.classId)
}

/** The listed token `call` targets, only when the call recorded the class that token was added with. */
function pinnedListedToken<T extends ListedToken>(call: SettledCall, tokens: readonly T[]): T | undefined {
	const token = tokens.find((t) => t.contract === call.contract)
	return token !== undefined && samePinnedClass(token, call) ? token : undefined
}

/**
 * What the wallet can say a settled call moved: a transfer it sent itself, or a transfer or mint by
 * the vocabulary's name and arity on a listed token whose class the call recorded; anything else is
 * null. The record keeps no selector, decode or sender, so a listed token's same-name function, or a
 * transfer that hid its sender, can read as a movement the approval window showed plain.
 */
export function settledReading(call: SettledCall, tokens: readonly ListedToken[]): "transfer" | "mint" | null {
	if (call.transfers?.length) return "transfer"
	if (pinnedListedToken(call, tokens) === undefined) return null
	const arity = call.args.length
	if (findTransferSignature(call.method, arity) !== undefined) return "transfer"
	return STANDARD_MINTS.has(call.method) && arity === 2 ? "mint" : null
}

/**
 * The amount a settled transaction record states, or null: a transfer from its own record; a mint
 * known by its method's name and arity, in the decimals of the listed token it calls, only when the
 * build recorded the class that token was added with, so an upgraded contract's mint reads as none.
 */
export function txAmount(
	calls: readonly TxCall[] | undefined,
	tokens: readonly Pick<TokenInfo, "contract" | "classId" | "decimals" | "symbol" | "hasDecimals">[],
): TxAmount | null {
	if (!calls?.length) return null
	const primary = calls[pickPrimaryIndex(calls) ?? 0]
	const transfer = primary.transfers?.[0]
	if (transfer) return fromTransfer(transfer)
	if (!STANDARD_MINTS.has(primary.method) || primary.args?.length !== 2) return null
	// With a second mint in the transaction the wallet cannot say which amount is the person's.
	if (calls.some((c) => c !== primary && STANDARD_MINTS.has(c.method))) return null
	const token = pinnedListedToken(primary, tokens)
	const decimals = knownDecimals(token)
	const units = u128(primary.args[1])
	if (!token || decimals === null || units === null) return null
	return { units, decimals, symbol: displaySymbol(token.symbol) }
}
