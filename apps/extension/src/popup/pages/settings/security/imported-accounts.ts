import type { Account } from "@/wallet/services/account/client"
import type { PendingReset, StaleNetworkView } from "@/wallet/services/network-reset/client"

/** An imported account deleting the profile removes, on the chain it lives on; `networked` is false
 *  when that chain has no network row. */
export type ImportedAccount = { name: string; address: string; chainId: number; networked: boolean }

/** The reads the list needs; each rejects on failure, and so does the list. */
export type ImportedAccountReads = {
	getNetworks(): Promise<ReadonlyArray<{ id: string; chainId: number }>>
	getImportedAccounts(profileId: string): Promise<Account[]>
	getPendingReset(): Promise<PendingReset | null>
	getStaleNetwork(networkId: string): Promise<Pick<StaleNetworkView, "reset"> | null>
}

/** What Delete Profile names, and whether a reset is pending, which full backup refuses. */
export type ImportedAccountsRead = { accounts: ImportedAccount[]; resetPending: boolean }

/** One account on one chain, however its address is cased. */
export const importedKey = (account: { chainId: number; address: string }): string => `${account.chainId}:${account.address.toLowerCase()}`

/**
 * Every readable imported account of `profileId` on every chain, network row or not, as the profile's
 * deletion erases them. A paused reset's journal-held imports count once its purge has removed their
 * live rows (before it, those rows are the accounts, at the address they had); a held import is keyed
 * on the network's chain, which the reset rewrites before it recreates any row, so a recreated one is
 * named once.
 */
export async function readImportedAccounts(reads: ImportedAccountReads, profileId: string): Promise<ImportedAccountsRead> {
	const [networks, pending, imported] = await Promise.all([
		reads.getNetworks(),
		reads.getPendingReset(),
		reads.getImportedAccounts(profileId),
	])
	const reset = pending && !pending.running ? (await reads.getStaleNetwork(pending.networkId))?.reset : undefined
	const held = reset?.purged ? (reset.heldImported ?? []) : []
	const networked = networks.flatMap((network) =>
		[...imported.filter((a) => a.chainId === network.chainId), ...(network.id === pending?.networkId ? held : [])].map(
			({ name, address }) => ({ name, address, chainId: network.chainId, networked: true }),
		),
	)
	const chains = new Set(networks.map((network) => network.chainId))
	const unnetworked = imported
		.filter((a) => !chains.has(a.chainId))
		.map(({ name, address, chainId }) => ({ name, address, chainId, networked: false }))
	const seen = new Set<string>()
	const accounts = [...networked, ...unnetworked].filter((account) => {
		const key = importedKey(account)
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
	return { accounts, resetPending: pending !== null }
}
