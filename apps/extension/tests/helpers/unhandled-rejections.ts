/** Run `fn` with a process-level unhandledRejection collector installed.
 *  While the collector is installed, vitest DEFERS to it (its worker handler
 *  returns when another process listener exists), so collected rejections
 *  don't fail the run — the returned list is the signal. Tests WITHOUT the
 *  collector still get vitest's own unhandled-rejection reporting. The
 *  macrotask flush matters: Node emits unhandledRejection on the tick
 *  boundary, not the microtask queue. */
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
