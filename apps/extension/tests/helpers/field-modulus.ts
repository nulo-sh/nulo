/** Address-field values around the BN254 field modulus, spelled out so that a wrong shared constant
 *  cannot pass: the last one below it, the modulus, the one above it, and one digit short. */
export const BELOW_MODULUS = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000"
export const MODULUS = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001"
export const ABOVE_MODULUS = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000002"
export const DIGITS_63 = BELOW_MODULUS.slice(0, -1)
