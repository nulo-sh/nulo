/**
 * Settles as `work` does, or with `onTimeout()`'s value or throw once `ms` pass first. The timer is
 * cleared on either outcome. `work` is not cancelled, and its later rejection stays observed.
 * Returns the bare race: cleanup chained onto it would delay every caller by extra microtask turns.
 */
export function raceTimeout<T, U>(work: Promise<T>, ms: number, onTimeout: () => U): Promise<T | U> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const expiry = new Promise<U>((resolve, reject) => {
		timer = setTimeout(() => {
			try {
				resolve(onTimeout())
			} catch (error) {
				reject(error)
			}
		}, ms)
	})
	const clear = () => clearTimeout(timer)
	work.then(clear, clear)
	return Promise.race([work, expiry])
}

/**
 * `"settled"` once `promise` fulfils or rejects, `"aborted"` once `signal` aborts first, or at once
 * when it already has; never rejects. `promise` is observed on every path, and the abort listener
 * is removed on either outcome.
 */
export function raceAbort(promise: Promise<unknown>, signal: AbortSignal): Promise<"settled" | "aborted"> {
	return new Promise((resolve) => {
		const onAbort = () => resolve("aborted")
		const settle = () => {
			signal.removeEventListener("abort", onAbort)
			resolve("settled")
		}
		promise.then(settle, settle)
		if (signal.aborted) return resolve("aborted")
		signal.addEventListener("abort", onAbort, { once: true })
	})
}
