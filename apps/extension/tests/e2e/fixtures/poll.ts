export interface PollOptions<T> {
	/** What the poll waits for; the timeout error starts with it. */
	label: string
	timeoutMs: number
	intervalMs: number
	/** How the timeout error renders the last value; JSON by default. */
	show?: (value: T) => string
}

/** The poll's budget ran out on a value `done` refused. `last` is that value. */
export class PollTimeoutError extends Error {
	public override readonly name = "PollTimeoutError"

	public constructor(
		public readonly label: string,
		public readonly timeoutMs: number,
		public readonly last: unknown,
		shown: string,
	) {
		super(`${label}: not within ${timeoutMs} ms; last: ${shown}`)
	}
}

/**
 * The e2e layer's one deadline loop: `probe` runs at once and then every `intervalMs` until `done`
 * accepts its value, which it returns. A probe's throw ends the poll with that error, so a terminal
 * failure fails at once. A value refused once `timeoutMs` has passed throws `PollTimeoutError`.
 * Phases sharing one deadline pass `deadline - Date.now()`; a caller whose contract is the last state
 * or best effort catches `PollTimeoutError` itself.
 */
export async function pollUntil<T>(probe: () => Promise<T>, done: (value: T) => boolean, opts: PollOptions<T>): Promise<T> {
	const deadline = Date.now() + opts.timeoutMs
	for (;;) {
		const value = await probe()
		if (done(value)) return value
		if (Date.now() >= deadline) throw new PollTimeoutError(opts.label, opts.timeoutMs, value, render(value, opts.show))
		await new Promise((resolve) => setTimeout(resolve, opts.intervalMs))
	}
}

/** A renderer that throws (a BigInt under JSON) must not replace the timeout it describes. */
function render<T>(value: T, show: ((value: T) => string) | undefined): string {
	try {
		return show ? show(value) : (JSON.stringify(value) ?? String(value))
	} catch {
		return String(value)
	}
}
