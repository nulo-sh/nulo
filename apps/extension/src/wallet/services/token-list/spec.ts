import type { PinnedKey, PriceFeeds, TokenListEntry, TokenListPair } from "@nulo/token-list"

export const TOKEN_LIST_SERVICE_NAME = "token-list"

/** ValueStorage key of the fetcher's state: the last verified envelope and its schedule. */
export const TOKEN_LIST_STORAGE_KEY = "nulo:core:token-list"

export const TOKEN_LIST_REFRESH_ALARM_NAME = "nulo:token-list:refresh"

export const TOKEN_LIST_URL = "https://tokens.nulo.sh/v1/list.json"

/** The verified list the wallet acts on: the bundled-class entries, at most 16 per chain, every
 *  flagged pair, which is never an entry, and the feed of each price id an entry keeps. */
export type TokenListSnapshot = {
	sequence: number
	keyId: string
	entries: readonly TokenListEntry[]
	flagged: readonly TokenListPair[]
	priceFeeds: PriceFeeds
}

export type TokenListSource = { url: string; keys: readonly PinnedKey[] }

/** What a refresh did; the only detail that reaches a log line. */
export type RefreshOutcome =
	| "accepted"
	| "unchanged"
	| "older-sequence"
	| "refused"
	| "verify-unsupported"
	| "oversize"
	| "http-status"
	| "network"

/** What one refresh did: its request's outcome, or why it made none. */
export type RefreshResult = RefreshOutcome | "terms-not-current" | "off" | "error"

export type Methods = {
	refresh(): RefreshResult
}

export type Events = Record<never, never>
