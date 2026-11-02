/**
 * A contract address as a grant lists it and a call names it, and the one comparison between the
 * two. Leaf module: it imports only the field modulus and the hex shape.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { isHex32 } from "@nulo/wallet-core/utils"

/** `0x` + 64 hex digits in either case, below the field modulus: the only listed-contract form
 *  projection admits. */
export function isFieldAddress(value: unknown): value is string {
	return typeof value === "string" && isHex32(value) && BigInt(value) < Fr.MODULUS
}

/** The lower-case spelling `AztecAddress.toString()` writes, or `undefined` for any other string.
 *  A 32-byte value has exactly one lower-case 64-digit spelling, so equal keys are equal values. */
export function fieldAddressKey(value: string): string | undefined {
	return isFieldAddress(value) ? value.toLowerCase() : undefined
}

/**
 * Whether `a` and `b` are the same 32-byte value; false whenever either is not a field address, so
 * two malformed values never match. Every grant-to-call contract comparison goes through this:
 * comparing two `fieldAddressKey` results directly would match two malformed values.
 */
export function sameFieldAddress(a: string, b: string): boolean {
	const key = fieldAddressKey(a)
	return key !== undefined && key === fieldAddressKey(b)
}
