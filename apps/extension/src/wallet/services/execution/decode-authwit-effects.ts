/**
 * The authwit decode loop all three discovery paths share (the standalone discoverer, the folded
 * probe, the NO_FROM send): each offchain effect that decodes as a `CallAuthorizationRequest` is
 * recorded in effect order; any effect that fails is skipped. A request naming the signer is
 * returned to sign, as the wallet signs only as the sending account. One naming another account of
 * the send's scopes is listed when the transaction carries its witness, and refuses the send when it
 * does not, since the wallet will not sign it. Any other request is dropped. `onBehalfOf` does not
 * attest to the check the contract runs, so a validated simulation stays the boundary. An effect
 * from the authorization registry refuses the whole set before anything decodes: the registry asks
 * only to change an account's public authorizations, which only the wallet's own authorization
 * action may do. Callers keep their own early return for "no effects" above the live-chain fetch,
 * and any dedupe.
 */

import { CallAuthorizationRequest, computeAuthWitMessageHash } from "@aztec-labs/aztec.js/authorization"
import type { ChainInfo } from "@aztec-labs/entrypoints/interfaces"
import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { AuthRegistryRefusalError, UnattachedAuthorizationRefusalError } from "@nulo/extension-messaging/errors"
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

/** The send a run simulated, as the decoder reads it. */
export interface AuthwitSend {
	/** The account the wallet signs as. */
	readonly signer: AztecAddress
	/** The accounts whose private state the send reads, the signer among them; the bridge admitted
	 *  each as an approved account of the session. */
	readonly scopes: readonly AztecAddress[]
	/** The request hashes of the witnesses the simulated request carries ({@link carriedHashes}). */
	readonly carried: ReadonlySet<string>
}

export interface DecodedAuthwits {
	/** Each request on behalf of the signer, hashed, in effect order: what the wallet signs. */
	readonly signable: { record: DiscoveredAuthwit; messageHash: Fr }[]
	/** Each request on behalf of another account of the scopes whose witness the transaction
	 *  carries, once per account and hash, with `onBehalfOf` set: listed, never signed. */
	readonly consumed: DiscoveredAuthwit[]
	/** Whether any effect decoded as a request, whoever it names. */
	readonly requested: boolean
}

/** The request hashes of the witnesses a simulated request carries. */
export function carriedHashes(txRequest: { authWitnesses: readonly { requestHash: { toString(): string } }[] }): ReadonlySet<string> {
	return new Set(txRequest.authWitnesses.map((witness) => witness.requestHash.toString()))
}

export async function decodeAuthwitEffects(
	effects: readonly { data: Fr[]; contractAddress: AztecAddress }[],
	chainInfo: ChainInfo,
	send: AuthwitSend,
	crypto: AuthwitDecodeCrypto = REAL_CRYPTO,
): Promise<DecodedAuthwits> {
	if (effects.some((effect) => isAuthRegistry(effect.contractAddress))) {
		throw new AuthRegistryRefusalError("Scope violation: a transaction's authorization request targets the authorization registry")
	}
	const signer = send.signer.toString()
	const others = new Set<string>(send.scopes.map((scope) => scope.toString()).filter((scope) => scope !== signer))
	const signable: { record: DiscoveredAuthwit; messageHash: Fr }[] = []
	const consumed = new Map<string, DiscoveredAuthwit>()
	let requested = false
	let unattached = false
	for (const effect of effects) {
		try {
			const authRequest = await crypto.fromFields(effect.data)
			requested = true
			const onBehalfOf = authRequest.onBehalfOf.toString()
			if (onBehalfOf !== signer && !others.has(onBehalfOf)) continue
			const messageHash = await crypto.computeMessageHash(
				{ consumer: effect.contractAddress, innerHash: authRequest.innerHash as Fr },
				chainInfo,
			)
			const record = toDiscoveredAuthwit(effect.contractAddress, authRequest, messageHash)
			if (onBehalfOf === signer) signable.push({ record, messageHash })
			else if (send.carried.has(record.messageHash)) consumed.set(`${onBehalfOf}:${record.messageHash}`, { ...record, onBehalfOf })
			else unattached = true
		} catch {}
	}
	// After the loop, so the per-effect catch cannot swallow it.
	if (unattached) throw new UnattachedAuthorizationRefusalError()
	return { signable, consumed: [...consumed.values()], requested }
}
