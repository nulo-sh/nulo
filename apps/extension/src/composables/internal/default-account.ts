/**
 * Creating a chain's default account reads a custom chain's node once. Start and a network switch
 * never stop on a node that does not answer: the account waits for it and `onUnreachable` runs.
 * A node that answers another L1 still refuses.
 *
 * Not auto-importable (the auto-import `dirs` scan is non-recursive).
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
