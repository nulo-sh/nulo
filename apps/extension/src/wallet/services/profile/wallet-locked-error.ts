/**
 * No live session to capture an execution fence under: the wallet is locked. A plain `Error` with
 * the message callers have always matched, so a popup RPC still flattens it to that message and no
 * in-wallet path sees a new type. A dApp is answered `WALLET_LOCKED` (`toWalletResponseError`).
 */
export class WalletLockedError extends Error {
	public static readonly CODE = "WALLET_LOCKED"

	public constructor() {
		super("Wallet locked")
		this.name = "WalletLockedError"
	}
}
