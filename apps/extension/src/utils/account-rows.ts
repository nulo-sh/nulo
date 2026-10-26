import type { Account } from "@/wallet/services/account/client"

/** The part of a window's state an account row lands in. */
export interface AccountRowTarget {
	profile?: { id: string }
	network?: { chainId: number }
	accounts: Account[]
	account?: Account
}

const inScope = (target: AccountRowTarget, row: Account) => row.profileId === target.profile?.id && row.chainId === target.network?.chainId

/**
 * Puts a stored account row another part of the wallet reported into a window's list, in place of
 * the entry at its address or else at the end. A row of another profile or chain changes nothing.
 * Which account is active never changes; the active account's own row is refreshed.
 */
export function applyAccountRow(target: AccountRowTarget, row: Account): void {
	if (!inScope(target, row)) return
	const at = target.accounts.findIndex((a) => a.address === row.address)
	if (at === -1) target.accounts.push(row)
	else target.accounts[at] = row
	if (target.account?.address === row.address) target.account = row
}

/** Lists the row this window's own create or import answered with, unless the service's event
 *  listed it first: that event, or a later one, may already hold a newer edit of the row. */
export function listOwnAccountRow(target: AccountRowTarget, row: Account): void {
	if (inScope(target, row) && !target.accounts.some((a) => a.address === row.address)) target.accounts.push(row)
}
