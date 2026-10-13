import type { PinnedKey, TokenListEntry } from "@nulo/token-list"

export const TOKEN_LIST_SERVICE_NAME = "token-list"

export const TOKEN_LIST_REFRESH_ALARM_NAME = "nulo:token-list:refresh"

export const TOKEN_LIST_URL = "https://tokens.nulo.sh/v1/list.json"

/** The verified list the wallet acts on: the bundled-class entries, at most 16 per chain. */
export type TokenListSnapshot = { sequence: number; keyId: string; entries: readonly TokenListEntry[] }

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
