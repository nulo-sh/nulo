import type { RefreshResult } from "@/wallet/services/token-list/spec"

/** What the manual refresh's line says: before a press, while it runs, then what the refresh did. */
export type ListRefreshState = "idle" | "running" | "updated" | "current" | "unreachable" | "failed" | "terms"

/** Only a network failure reads as unreached: an HTTP error means the host answered. */
export const LIST_REFRESH_STATE = {
	accepted: "updated",
	unchanged: "current",
	network: "unreachable",
	"http-status": "failed",
	"older-sequence": "failed",
	refused: "failed",
	oversize: "failed",
	"verify-unsupported": "failed",
	off: "failed",
	error: "failed",
	"terms-not-current": "terms",
} as const satisfies Record<RefreshResult, ListRefreshState>

export const LIST_REFRESH_COPY: Readonly<Record<ListRefreshState, string>> = {
	idle: "Default tokens and their prices",
	running: "Checking the list",
	updated: "Token list updated.",
	// A host can hold a newer list back, so the wallet only knows nothing newer was served.
	current: "No newer token list.",
	unreachable: "Could not reach the token list. Try again later.",
	failed: "Could not update the token list. Try again later.",
	terms: "Accept the Terms to download the token list.",
}

export const LIST_REFRESH_DANGER: ReadonlySet<ListRefreshState> = new Set(["unreachable", "failed"])
