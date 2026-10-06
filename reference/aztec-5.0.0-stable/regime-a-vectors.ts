/**
 * Regime-A reference vectors: the seed→signingKey construction, computed from the INSTALLED
 * 5.0.0-rc.2 upstream — the reference implementation of the recipe. The 5.0.0 derivation helper
 * must reproduce these EXACTLY (the construction is version-independent).
 * Run from the repository root: `bun reference/aztec-5.0.0-stable/regime-a-vectors.ts`.
 */
import { DomainSeparator } from "@aztec/constants"
import { sha512ToGrumpkinScalar } from "@aztec/foundation/crypto/sha512"
import { Fr } from "@aztec/foundation/curves/bn254"
import { deriveSigningKey } from "@aztec/stdlib/keys"

const seeds = [
	"0x0000000000000000000000000000000000000000000000000000000000000042",
	"0x0000000000000000000000000000000000000000000000000000000000001337",
]

const out = {
	source: "@aztec/stdlib@5.0.0-rc.2 deriveSigningKey (installed node_modules)",
	construction: "sha512ToGrumpkinScalar([seed, DomainSeparator.IVSK_M])",
	domainSeparator: { name: "IVSK_M", value: Number(DomainSeparator.IVSK_M) },
	vectors: seeds.map((s) => {
		const seed = Fr.fromHexString(s)
		const viaDeriveSigningKey = deriveSigningKey(seed).toString()
		const viaPrimitive = sha512ToGrumpkinScalar([seed, DomainSeparator.IVSK_M]).toString()
		if (viaDeriveSigningKey !== viaPrimitive) throw new Error(`construction mismatch for ${s}`)
		return { seed: s, signingKey: viaDeriveSigningKey }
	}),
}
console.log(JSON.stringify(out, null, "\t"))
