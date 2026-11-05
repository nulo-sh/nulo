/** How the header dot reads a node: green, red or grey. */
export type NetworkStatusTone = "connected" | "unreachable" | "waiting"

/** `status` is the app store's `networkStatus`: a `NodeStatus` name, `"sync"` while read, or unset. */
export function networkStatusTone(status: string | undefined): NetworkStatusTone {
	if (status === "Active") return "connected"
	// A node that answers for another chain is as unusable as one that does not answer.
	if (status === "Inactive" || status === "InvalidChain") return "unreachable"
	return "waiting"
}

const WORDS: Record<NetworkStatusTone, string> = {
	connected: "Connected",
	unreachable: "Cannot reach the network",
	waiting: "Waiting for the network",
}

/** The dot's colour in words, for a screen reader and for Manage Networks' active row. */
export const networkStatusWord = (status: string | undefined): string => WORDS[networkStatusTone(status)]
