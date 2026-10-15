/**
 * No live session to capture an execution fence under: the wallet is locked. A plain `Error` with
 * the message callers have always matched, so nothing outside the worker sees a new type: an RPC
 * flattens it to that message and a dApp receives the unclassified constant. Only the wallet's own
 * journal reads the class.
 */
export class WalletLockedError extends Error {
	public constructor() {
		super("Wallet locked")
		this.name = "WalletLockedError"
	}
}
