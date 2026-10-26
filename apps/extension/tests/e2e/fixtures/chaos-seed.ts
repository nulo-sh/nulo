/**
 * A chaos file's seed from `NULO_E2E_CHAOS_SEED`: a random draw when unset or empty, else the
 * value itself.
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

/** mulberry32: a small seeded PRNG, so a logged seed replays the same actions. */
export function prng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
