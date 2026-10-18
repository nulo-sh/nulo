/**
 * Tolerates only `NodeUnreachableError`: no account is created and `onUnreachable` runs; any other
 * error, an identity mismatch included, rethrows. Not auto-importable (the `dirs` scan is non-recursive).
 */
import { NodeUnreachableError } from "@nulo/extension-messaging/errors"
import { AccountType, DEFAULT_ACCOUNT_NAME } from "@/wallet/services/account/client"

export interface DefaultAccountClient {
	ensureDefaultAccount(profileId: string, chainId: number, type: AccountType, name: string): Promise<unknown>
}

export async function ensureDefaultAccountOrWait(
	client: DefaultAccountClient,
	profileId: string,
	chainId: number,
	onUnreachable: () => void,
): Promise<void> {
	try {
		await client.ensureDefaultAccount(profileId, chainId, AccountType.Nulo_v1, DEFAULT_ACCOUNT_NAME)
	} catch (err) {
		if (!(err instanceof NodeUnreachableError)) throw err
		onUnreachable()
	}
}
