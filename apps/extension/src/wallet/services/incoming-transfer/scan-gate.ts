/** What a scan request asks for. Requests for one waiting key merge by OR, so a forced or retried
 *  request is never weakened by a later plain one. */
export type ScanIntent = { force: boolean; retry: boolean }

type Pending = { intent: ScanIntent; waiters: (() => void)[] }

/**
 * Runs keyed scans at most `limit` at a time, in request order. A request for a waiting key merges
 * into its entry, so the queue never holds a key twice; a request for a running key waits behind
 * that run while other keys pass it. The runner reports its own failures: the gate frees the slot
 * and settles the waiters on either outcome.
 */
export class ScanGate {
	private readonly pending = new Map<string, Pending>()
	private readonly running = new Set<string>()

	public constructor(
		private readonly limit: number,
		private readonly run: (key: string, intent: ScanIntent) => Promise<void>,
	) {}

	/** Queue a scan of `key` with no waiter, so a request that is never admitted holds nothing. */
	public request(key: string, intent: ScanIntent): void {
		this.enqueue(key, intent)
		this.pump()
	}

	/** Queue a scan of `key`; settles when the run admitted for this request ends, or on `clear()`. */
	public requestAndWait(key: string, intent: ScanIntent): Promise<void> {
		const settled = new Promise<void>((resolve) => this.enqueue(key, intent).waiters.push(resolve))
		this.pump()
		return settled
	}

	/** Drop every waiting request and settle its waiters. Running scans keep their slots until they end. */
	public clear(): void {
		const dropped = [...this.pending.values()]
		this.pending.clear()
		for (const entry of dropped) for (const settle of entry.waiters) settle()
	}

	private enqueue(key: string, intent: ScanIntent): Pending {
		const entry = this.pending.get(key)
		if (entry) {
			entry.intent = { force: entry.intent.force || intent.force, retry: entry.intent.retry || intent.retry }
			return entry
		}
		const created: Pending = { intent: { ...intent }, waiters: [] }
		this.pending.set(key, created)
		return created
	}

	private pump(): void {
		for (const [key, entry] of this.pending) {
			if (this.running.size >= this.limit) return
			if (this.running.has(key)) continue
			this.pending.delete(key)
			this.running.add(key)
			this.start(key, entry)
		}
	}

	private start(key: string, entry: Pending): void {
		const done = () => {
			this.running.delete(key)
			for (const settle of entry.waiters) settle()
			this.pump()
		}
		let run: Promise<void>
		try {
			run = this.run(key, entry.intent)
		} catch (error) {
			run = Promise.reject(error)
		}
		run.then(done, done)
	}
}
