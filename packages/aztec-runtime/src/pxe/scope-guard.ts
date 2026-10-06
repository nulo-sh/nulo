import type { PXE } from "@aztec-labs/pxe/client/bundle"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { PxeScopeUnregisteredError } from "@nulo/extension-messaging/errors"

/**
 * Refuses a PXE call that would sync a scope the PXE holds no keys for. The PXE syncs such a scope
 * with only a warning, and the HandshakeRegistry sync inside it advances that scope's cursor past
 * every handshake it cannot decrypt: one early sync after an import loses the notes for good.
 * Sound only under the chain write lock the caller then holds through the PXE call.
 */
export async function assertScopesRegistered(pxe: PXE, scopes: readonly AztecAddress[]): Promise<void> {
	if (scopes.length === 0) return
	const registered = new Set((await pxe.getRegisteredAccounts()).map((account) => account.address.toString()))
	if (scopes.some((scope) => !registered.has(scope.toString()))) throw new PxeScopeUnregisteredError()
}
