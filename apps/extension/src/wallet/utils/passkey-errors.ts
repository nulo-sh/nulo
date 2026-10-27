/**
 * What a passkey step can fail with besides the browser's own errors. Kept apart from the ceremony
 * runner, so the screens that word these failures load no WebAuthn code.
 */

/** The authenticator returned no PRF output, so this passkey cannot hold a Nulo wallet. */
export class PasskeyPrfError extends Error {
	public constructor(message: string) {
		super(message)
		this.name = "PasskeyPrfError"
	}
}

/**
 * A create minted a credential, then the assertion that reads its PRF failed (`cause`).
 * `confirmMinted(credentialId, prfSalt)` finishes the step without minting another, at the input
 * the create asked for.
 */
export class PasskeyUnconfirmedError extends Error {
	public constructor(
		public readonly credentialId: string,
		public readonly prfSalt: string,
		cause: unknown,
	) {
		super("Passkey created but not confirmed", { cause })
		this.name = "PasskeyUnconfirmedError"
	}
}
