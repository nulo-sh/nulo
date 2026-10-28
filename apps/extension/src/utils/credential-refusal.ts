import { InvalidPasswordError, PasskeyNotOpenedError, SameUnlockMethodError } from "@nulo/extension-messaging/errors"
import { classifyPasskeyFailure, isPasskeyCancel } from "@/utils/passkey-copy"

const refuses = (err: unknown): boolean =>
	err instanceof InvalidPasswordError ||
	err instanceof PasskeyNotOpenedError ||
	err instanceof SameUnlockMethodError ||
	classifyPasskeyFailure(err) !== "other" ||
	isPasskeyCancel(err)

/**
 * The person's credential was refused: a wrong password or passkey, a passkey with no PRF, an
 * unconfirmed or cancelled prompt, or an unlock method the profile already has. The page words it,
 * and nothing failed. Read on the error, then once on the `cause` a wrap keeps; a
 * `PasskeyUnconfirmedError` counts only through its cause.
 */
export function isCredentialRefusal(err: unknown): boolean {
	return refuses(err) || (err instanceof Error && refuses(err.cause))
}

/** Logs `line` with a credential step's failure: a refusal at debug, anything else at error. */
export function logCredentialFailure(line: string, error: unknown): void {
	if (isCredentialRefusal(error)) console.debug(line, { error })
	else console.error(line, { error })
}
