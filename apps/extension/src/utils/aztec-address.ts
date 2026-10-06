import { isValidHex } from "@/utils/string"

/** BN254 scalar field modulus: the field an Aztec address lives in. */
const FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
	let result = 1n
	let b = base % modulus
	let e = exponent
	while (e > 0n) {
		if (e & 1n) result = (result * b) % modulus
		b = (b * b) % modulus
		e >>= 1n
	}
	return result
}

/**
 * Whether `hex` is an address that can receive private notes: `0x` + 64 hex digits whose value is
 * below the field modulus and is the x coordinate of a Grumpkin point (y² = x³ − 17 has a root).
 * Decides exactly what upstream `AztecAddress.isValid()` decides, without loading bb.js into the
 * popup. About half of all field elements fail, and a private transfer to one aborts in simulation.
 */
export function isValidAztecAddress(hex: string): boolean {
	if (!isValidHex(hex)) return false
	const x = BigInt(hex)
	if (x >= FR_MODULUS) return false
	const ySquared = (((x * x * x - 17n) % FR_MODULUS) + FR_MODULUS) % FR_MODULUS
	// Euler's criterion: 0 has the root 0; any other value is a square iff this power is 1.
	return ySquared === 0n || modPow(ySquared, (FR_MODULUS - 1n) / 2n, FR_MODULUS) === 1n
}
