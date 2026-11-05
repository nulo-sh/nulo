import { BN254_FR_MODULUS as FR_MODULUS, isHex32 } from "@nulo/wallet-core/utils"

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
	if (!isHex32(hex)) return false
	const x = BigInt(hex)
	if (x >= FR_MODULUS) return false
	const ySquared = (((x * x * x - 17n) % FR_MODULUS) + FR_MODULUS) % FR_MODULUS
	// Euler's criterion: 0 has the root 0; any other value is a square iff this power is 1.
	return ySquared === 0n || modPow(ySquared, (FR_MODULUS - 1n) / 2n, FR_MODULUS) === 1n
}

const EDGE = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}]$/u

/** `text` less the white space and default-ignorable code points at its two ends, when that is a valid
 *  address, case kept; else undefined. The result is always an unaltered slice of `text`. */
export function bareAztecAddress(text: string): string | undefined {
	// By code point, so an edge character outside the BMP goes whole; a `[…]+$` regex would backtrack
	// quadratically on a long run of padding.
	const chars = Array.from(text)
	let start = 0
	let end = chars.length
	while (start < end && EDGE.test(chars[start])) start++
	while (end > start && EDGE.test(chars[end - 1])) end--
	const bare = chars.slice(start, end).join("")
	return isValidAztecAddress(bare) ? bare : undefined
}
