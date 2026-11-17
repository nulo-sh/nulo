/**
 * No live session, or no row keys for the profile the work belongs to. A plain `Error`, so a popup
 * RPC flattens it to its message; a dApp is answered `WALLET_LOCKED` (`toWalletResponseError`).
 */
export class WalletLockedError extends Error {
	public static readonly CODE = "WALLET_LOCKED"

	public constructor() {
		super("Wallet locked")
		this.name = "WalletLockedError"
	}
}
