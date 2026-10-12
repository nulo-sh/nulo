/** Runs `fn` and returns every unhandled rejection raised meanwhile. Vitest defers to this listener,
 *  so the caller must assert the returned list; the macrotask flush is there because the event
 *  arrives on the tick boundary, not in the microtask queue. */
export async function collectUnhandledRejections(fn: () => Promise<void>): Promise<unknown[]> {
	const seen: unknown[] = []
	const onRejection = (reason: unknown) => {
		seen.push(reason)
	}
	process.on("unhandledRejection", onRejection)
	try {
		await fn()
		await new Promise((resolve) => setTimeout(resolve, 0))
	} finally {
		process.off("unhandledRejection", onRejection)
	}
	return seen
}
