/** What the Header's account group shows. */
export type HeaderAccountState = "shown" | "loading" | "hidden"

export interface HeaderAccountInput {
	profileId: string | undefined
	network: { id: string; chainId: number } | undefined
	/** The network the active stale view names, if any. */
	staleNetworkId: string | undefined
	account: { profileId: string; chainId: number } | undefined
}

/**
 * A quarantined network's rows are never shown, so its Header has no account group. On a live
 * network, only an account of the active profile and chain is shown; until it loads (the first
 * paint, any switch) a skeleton holds its place, never the previous network's account.
 */
export function headerAccountState({ profileId, network, staleNetworkId, account }: HeaderAccountInput): HeaderAccountState {
	if (!network || staleNetworkId === network.id) return "hidden"
	return account?.profileId === profileId && account?.chainId === network.chainId ? "shown" : "loading"
}
