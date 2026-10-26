import type { Account } from "@/wallet/services/account/client"

/** The part of a window's state an account row lands in. */
export interface AccountRowTarget {
	profile?: { id: string }
	network?: { chainId: number }
	accounts: Account[]
	account?: Account
}

/**
 * Puts a stored account row into a window's list, in place of the entry at its address or else at
 * the end, so a row reported twice is listed once. A row of another profile or chain changes
 * nothing. Which account is active never changes; the active account's own row is refreshed.
 */
export function applyAccountRow(target: AccountRowTarget, row: Account): void {
	if (row.profileId !== target.profile?.id || row.chainId !== target.network?.chainId) return
	const at = target.accounts.findIndex((a) => a.address === row.address)
	if (at === -1) target.accounts.push(row)
	else target.accounts[at] = row
	if (target.account?.address === row.address) target.account = row
}
