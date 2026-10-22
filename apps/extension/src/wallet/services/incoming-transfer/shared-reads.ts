/**
 * One read per key for every caller that asks while it is in flight. A read that succeeded keeps
 * serving for `ttlMs` after it settled (0: never past its own flight); a failed one is shared only
 * while in flight, so the next caller reads again. A clock set back counts as expired, so a settled
 * read is never served longer than `ttlMs` of wall time.
 */
export class SharedReads<V> {
	private readonly reads = new Map<string, { read: Promise<V>; settledAt?: number }>()

	public constructor(private readonly ttlMs: number) {}

	public get(key: string, read: () => Promise<V>): Promise<V> {
		const recent = this.reads.get(key)
		if (recent && (recent.settledAt === undefined || isFresh(Date.now() - recent.settledAt, this.ttlMs))) return recent.read
		const entry: { read: Promise<V>; settledAt?: number } = {
			read: read().then(
				(value) => {
					entry.settledAt = Date.now()
					return value
				},
				(error: unknown) => {
					if (this.reads.get(key) === entry) this.reads.delete(key)
					throw error
				},
			),
		}
		this.reads.set(key, entry)
		return entry.read
	}

	/** Forget every read, in flight or settled: a caller after this reads again. */
	public clear(): void {
		this.reads.clear()
	}
}

function isFresh(ageMs: number, ttlMs: number): boolean {
	return ageMs >= 0 && ageMs < ttlMs
}
