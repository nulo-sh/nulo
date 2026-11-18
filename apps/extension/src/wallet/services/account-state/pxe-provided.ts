/**
 * Contracts every PXE registers by itself at boot: the protocol contracts and upstream's preloaded
 * standard contracts. The export leaves them out, and the import skips them in an older backup, so a
 * network whose slice holds only these is neither probed nor booted. Nothing here derives from slice
 * content: the set is compiled in from upstream's constants.
 */

import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/handshake-registry/constants"
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from "@aztec-labs/standard-contracts/multi-call-entrypoint/constants"

/** Protocol contracts sit at fixed low addresses, not preimage-derived ones, so a backup's copy
 *  would fail registration's address check anyway (1 to 3 today, inside the historic bound). */
const MAX_PROTOCOL_ADDRESS = 6n

/** The addresses `createPXE`'s default `preloadedContractsProvider` registers, read from the
 *  address-only leaves because its getters load every artifact; `pxe-provided.test.ts` pins the two. */
export const PRELOADED_CONTRACT_ADDRESSES: ReadonlySet<bigint> = new Set(
	[STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS, STANDARD_AUTH_REGISTRY_ADDRESS, STANDARD_HANDSHAKE_REGISTRY_ADDRESS].map((address) =>
		address.toBigInt(),
	),
)

/** Display names for the built-ins, compiled in; `pxe-provided.test.ts` pins the protocol entries to
 *  upstream's `ProtocolContractAddress`. */
const PXE_PROVIDED_NAMES: ReadonlyMap<bigint, string> = new Map([
	[1n, "Contract Class Registry"],
	[2n, "Contract Instance Registry"],
	[3n, "Fee Juice"],
	[STANDARD_AUTH_REGISTRY_ADDRESS.toBigInt(), "Auth Registry"],
	[STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS.toBigInt(), "Multi Call Entrypoint"],
	[STANDARD_HANDSHAKE_REGISTRY_ADDRESS.toBigInt(), "Handshake Registry"],
])

export function pxeProvidedName(address: string): string | undefined {
	try {
		return PXE_PROVIDED_NAMES.get(AztecAddress.fromStringUnsafe(address).toBigInt())
	} catch {
		return undefined
	}
}

export function isPxeProvidedAddress(value: bigint): boolean {
	return (value >= 0n && value <= MAX_PROTOCOL_ADDRESS) || PRELOADED_CONTRACT_ADDRESSES.has(value)
}

/** False for an address the restore's own parse refuses: that entry is still work, and its
 *  registration reports the parse error. */
export function isPxeProvidedContract(address: string): boolean {
	try {
		return isPxeProvidedAddress(AztecAddress.fromStringUnsafe(address).toBigInt())
	} catch {
		return false
	}
}
