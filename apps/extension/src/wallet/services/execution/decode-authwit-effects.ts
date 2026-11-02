/**
 * The authwit decode loop all three discovery paths share (the standalone discoverer, the folded
 * probe, the NO_FROM send): each offchain effect that decodes as a `CallAuthorizationRequest` on
 * behalf of the signing account is hashed over the given chain and recorded, in effect order; any
 * effect that fails is skipped. The wallet signs only as the sending account: a request naming
 * another account is never hashed, since that account's witness, which the dApp carries, is the
 * one its check reads. An effect from the authorization registry refuses the whole set before
 * anything decodes: the registry asks only to change an account's public authorizations, which
 * only the wallet's own authorization action may do. Callers keep their own early return for "no
 * effects" above the live-chain fetch, and any dedupe.
 */

import { CallAuthorizationRequest, computeAuthWitMessageHash } from "@aztec-labs/aztec.js/authorization"
import type { ChainInfo } from "@aztec-labs/entrypoints/interfaces"
import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { AuthRegistryRefusalError } from "@nulo/extension-messaging/errors"
import { type DiscoveredAuthwit, isAuthRegistry } from "@nulo/wallet-bridge"
import { type DecodedAuthRequest, toDiscoveredAuthwit } from "./discovered-authwit"

/** The decode and hash seams; unit tests inject fakes so they run without Barretenberg. */
export interface AuthwitDecodeCrypto {
	fromFields(data: Fr[]): Promise<DecodedAuthRequest>
	computeMessageHash(intent: { consumer: AztecAddress; innerHash: Fr }, chainInfo: { chainId: Fr; version: Fr }): Promise<Fr>
}

const REAL_CRYPTO: AuthwitDecodeCrypto = {
	fromFields: (data) => CallAuthorizationRequest.fromFields(data),
	computeMessageHash: (intent, chainInfo) => computeAuthWitMessageHash(intent, chainInfo),
}

export interface DecodedAuthwits {
	/** Each request on behalf of the signer, hashed, in effect order: what the wallet signs. */
	readonly signable: { record: DiscoveredAuthwit; messageHash: Fr }[]
	/** Whether any effect decoded as a request, whoever it names. */
	readonly requested: boolean
}

export async function decodeAuthwitEffects(
	effects: readonly { data: Fr[]; contractAddress: AztecAddress }[],
	chainInfo: ChainInfo,
	signer: AztecAddress,
	crypto: AuthwitDecodeCrypto = REAL_CRYPTO,
): Promise<DecodedAuthwits> {
	if (effects.some((effect) => isAuthRegistry(effect.contractAddress))) {
		throw new AuthRegistryRefusalError("Scope violation: a transaction's authorization request targets the authorization registry")
	}
	const signable: { record: DiscoveredAuthwit; messageHash: Fr }[] = []
	let requested = false
	for (const effect of effects) {
		try {
			const authRequest = await crypto.fromFields(effect.data)
			requested = true
			if (authRequest.onBehalfOf.toString() !== signer.toString()) continue
			const messageHash = await crypto.computeMessageHash(
				{ consumer: effect.contractAddress, innerHash: authRequest.innerHash as Fr },
				chainInfo,
			)
			signable.push({ record: toDiscoveredAuthwit(effect.contractAddress, authRequest, messageHash), messageHash })
		} catch {}
	}
	return { signable, requested }
}
