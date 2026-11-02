/** Field facts checked without bb.js; shape, field range and curve membership stay separate predicates. */

const HEX_32 = /^0x[0-9a-fA-F]{64}$/

/** `0x` + 64 hex digits in either case. Says nothing of its range. */
export const isHex32 = (value: string): boolean => HEX_32.test(value)

/** The BN254 scalar field modulus (Aztec's `Fr.MODULUS`): an Aztec address is a field element below it. */
export const BN254_FR_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n
