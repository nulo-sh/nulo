/**
 * The send-chaos seed from `NULO_E2E_CHAOS_SEED`: a random draw when unset, else the value itself.
 *
 * Only a nonnegative decimal safe integer is a seed, since anything else would replay some other
 * seed while the log named this one. No 32-bit bound: the nightly passes its run id, which the
 * PRNG reduces modulo 2^32.
 */
export function chaosSeed(raw: string | undefined): number {
	if (!raw) return Math.floor(Math.random() * 2 ** 31)
	const seed = Number(raw)
	if (!/^\d+$/.test(raw) || !Number.isSafeInteger(seed)) {
		throw new Error(`NULO_E2E_CHAOS_SEED=${JSON.stringify(raw)} is not a decimal integer seed`)
	}
	return seed
}
