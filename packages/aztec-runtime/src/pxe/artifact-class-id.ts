/**
 * Class-id checks: recompute a `ContractArtifact`'s class id and compare it to the expected `Fr`.
 *
 * - `verifyArtifactClassId` returns the artifact on match and `undefined` on mismatch or recompute
 *   failure, so artifact resolution ("pxe-local" → "known") can fall through to the next source.
 * - `assertArtifactClassId` throws on mismatch and lets a recompute failure propagate unchanged, for
 *   registration, where a mismatched artifact must be refused at the boundary.
 * - `assertWireArtifactClassId` parses a wire-form pair first and maps every failure to the fixed
 *   mismatch text, for registration inputs that crossed a trust boundary as JSON.
 *
 * Pure: no chrome.*, no network, no storage, no cache. Just a Poseidon-heavy compute via upstream
 * `getContractClassFromArtifact`. Tests inject fixture artifacts directly.
 */

import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import { type ContractArtifact, ContractArtifactSchema } from "@aztec-labs/stdlib/abi"
import { ContractInstanceWithAddressSchema, getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"

const CLASS_ID_MISMATCH = "Contract artifact doesn't match instance's current class id"

export type ClassIdVerifyLogger = (level: "warn" | "debug", msg: string, ...rest: unknown[]) => void

/**
 * DI port for class-id verification. Production uses
 * `DefaultArtifactClassIdVerifier`. Tests inject fakes that bypass
 * Poseidon recompute (faster + works with fixture artifacts that
 * lack the structure needed by upstream `getContractClassFromArtifact`).
 */
export interface ArtifactClassIdVerifier {
	verify(artifact: ContractArtifact, expected: Fr, log?: ClassIdVerifyLogger): Promise<ContractArtifact | undefined>
}

/** Production implementation: delegates to the pure `verifyArtifactClassId` helper. */
export class DefaultArtifactClassIdVerifier implements ArtifactClassIdVerifier {
	public verify(artifact: ContractArtifact, expected: Fr, log?: ClassIdVerifyLogger): Promise<ContractArtifact | undefined> {
		return verifyArtifactClassId(artifact, expected, log)
	}
}

/**
 * Recompute artifact's class id and compare to `expected`. Returns
 * the artifact on match; returns `undefined` (with logging) on
 * mismatch or recompute failure.
 *
 * Computation cost: ~10-50ms per artifact (Poseidon hashing). For hot
 * paths, callers should pair this with a `Set<string>` cache keyed by
 * `expected.toString()` so a once-verified class-id isn't recomputed
 * on every lookup.
 */
export async function verifyArtifactClassId(
	artifact: ContractArtifact,
	expected: Fr,
	log?: ClassIdVerifyLogger,
): Promise<ContractArtifact | undefined> {
	try {
		const computed = await getContractClassFromArtifact(artifact)
		if (!computed.id.equals(expected)) {
			log?.("warn", "Artifact class id mismatch", {
				expected: expected.toString(),
				computed: computed.id.toString(),
			})
			return undefined
		}
		return artifact
	} catch (err) {
		log?.("warn", "Artifact class id recompute failed", err)
		return undefined
	}
}

/**
 * Throws unless `artifact` hashes to `expected`. Compares the ids' string forms, and lets a recompute
 * failure propagate as thrown: registration refuses with the upstream error, not a mismatch.
 * Stateless by contract: never route it through a class-id cache.
 */
export async function assertArtifactClassId(artifact: ContractArtifact, expected: Fr): Promise<void> {
	const contractClass = await getContractClassFromArtifact(artifact)
	if (contractClass.id.toString() !== expected.toString()) {
		throw new Error(CLASS_ID_MISMATCH)
	}
}

/**
 * Throws unless the wire-form artifact hashes to the wire-form instance's current class id. A schema
 * parse, hash or comparison failure all throw the one fixed mismatch text: the upstream messages
 * carry artifact-chosen names, which would reach logs and any classifier that reads the message.
 */
export async function assertWireArtifactClassId(instance: unknown, artifact: unknown): Promise<void> {
	try {
		const { currentContractClassId } = await ContractInstanceWithAddressSchema.parseAsync(instance)
		await assertArtifactClassId(await ContractArtifactSchema.parseAsync(artifact), currentContractClassId)
	} catch {
		throw new Error(CLASS_ID_MISMATCH)
	}
}
