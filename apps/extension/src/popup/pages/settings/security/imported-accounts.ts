import { type Account, AccountType } from "@/wallet/services/account/client"
import type { PendingReset, StaleNetworkView } from "@/wallet/services/network-reset/client"

/** An imported account deleting the profile removes, on the chain it lives on. */
export type ImportedAccount = { name: string; address: string; chainId: number }

/** The reads the list needs; each rejects on failure, and so does the list. */
export type ImportedAccountReads = {
	getNetworks(): Promise<ReadonlyArray<{ id: string; chainId: number }>>
	getAccounts(profileId: string, chainId: number, all: boolean): Promise<Account[]>
	getPendingReset(): Promise<PendingReset | null>
	getStaleNetwork(networkId: string): Promise<Pick<StaleNetworkView, "reset"> | null>
}

/** What Delete Profile names, and whether a reset is pending, which full backup refuses. */
export type ImportedAccountsRead = { accounts: ImportedAccount[]; resetPending: boolean }

/**
 * Every imported account of `profileId`, hidden ones included, chain by chain in network order, with
 * a paused reset's journal-held imports under their network. A held import is keyed on the network's
 * chain, which the reset rewrites before it recreates any row, so a recreated one is named once.
 */
export async function readImportedAccounts(reads: ImportedAccountReads, profileId: string): Promise<ImportedAccountsRead> {
	const [networks, pending] = await Promise.all([reads.getNetworks(), reads.getPendingReset()])
	const held = pending && !pending.running ? ((await reads.getStaleNetwork(pending.networkId))?.reset?.heldImported ?? []) : []
	const perNetwork = await Promise.all(
		networks.map(async (network) => {
			const live = (await reads.getAccounts(profileId, network.chainId, true)).filter((a) => a.type === AccountType.Imported)
			const journal = network.id === pending?.networkId ? held : []
			return [...live, ...journal].map(({ name, address }) => ({ name, address, chainId: network.chainId }))
		}),
	)
	const seen = new Set<string>()
	const accounts = perNetwork.flat().filter((account) => {
		const key = `${account.chainId}:${account.address.toLowerCase()}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
	return { accounts, resetPending: pending !== null }
}
