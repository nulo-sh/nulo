/** Resolves after `ms`, or as soon as `signal` aborts; never rejects. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve()
		const done = (): void => {
			clearTimeout(timer)
			signal.removeEventListener("abort", done)
			resolve()
		}
		const timer = setTimeout(done, ms)
		signal.addEventListener("abort", done, { once: true })
	})
}
