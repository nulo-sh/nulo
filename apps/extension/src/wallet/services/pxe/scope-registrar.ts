import type { ScopeRegistrar } from "@nulo/aztec-runtime/pxe"
import type { AccountService } from "@/wallet/services/account/service"
import type { NetworkService } from "@/wallet/services/network/service"

/**
 * Loads the profile's own accounts into the PXE. Only addresses with an account row on that
 * profile and chain resolve, so a scope the wallet does not own fails instead of registering.
 * A chain being deleted refuses on both sides of the registration: its ops would otherwise
 * recreate the store the deletion just erased.
 */
export function createScopeRegistrar(
	accounts: Pick<AccountService, "getAccountContract">,
	networks: Pick<NetworkService, "isChainLive">,
): ScopeRegistrar {
	const assertLive = async (profileId: string, chainId: number) => {
		if (!(await networks.isChainLive(profileId, chainId))) throw new Error("the network was removed")
	}
	return async (pxe, network, scopes) => {
		await assertLive(network.profileId, network.chainId)
		for (const address of scopes) {
			const account = await accounts.getAccountContract(network.profileId, network.chainId, address)
			await account.ensureRegistered(pxe)
		}
		await assertLive(network.profileId, network.chainId)
	}
}
