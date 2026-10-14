import { feeJuiceAddress } from "@/wallet/utils/fee-juice"
import { getAuthRegistryAddress } from "@/wallet/utils/auth-registry"
import type { DefaultTokenSeed } from "@/wallet/services/token/default-tokens"

export type KnownContract = { address: string; name: string }

/**
 * The contracts the permission window lists as "Nulo knows", addresses lower-cased. Names come only
 * from this table and from listed defaults whose current pins this profile's seeding verified on
 * chain: stored FPC rows are user-renamable, the token store holds dApp-registered rows, and a list
 * entry alone is only a claim, so a name read from any of them could dress a contract up as one
 * Nulo vouches for.
 */
export function knownContracts(
	protocolFpcs: { sponsored: string; private: string },
	verifiedDefaults: readonly DefaultTokenSeed[],
): KnownContract[] {
	const table: KnownContract[] = [
		{ address: feeJuiceAddress, name: "Fee Juice" },
		{ address: protocolFpcs.sponsored, name: "Sponsored fee payer" },
		{ address: protocolFpcs.private, name: "Private fee payer" },
		{ address: getAuthRegistryAddress().toString(), name: "Auth registry" },
		...verifiedDefaults.map((seed) => ({ address: seed.contract, name: seed.displayName })),
	]
	return table.map((entry) => ({ address: entry.address.toLowerCase(), name: entry.name }))
}
