/** Counts the abort listeners still registered on `signal`. A `once` listener leaves when the
 *  signal aborts, as the platform drops it. */
export function trackAbortListeners(signal: AbortSignal): () => number {
	const live = new Set<EventListenerOrEventListenerObject>()
	const once = new Set<EventListenerOrEventListenerObject>()
	signal.addEventListener("abort", () => {
		for (const listener of once) live.delete(listener)
		once.clear()
	})
	const add = signal.addEventListener.bind(signal)
	const remove = signal.removeEventListener.bind(signal)
	signal.addEventListener = ((
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	) => {
		if (!listener) return
		if (type === "abort") {
			live.add(listener)
			if (typeof options === "object" && options.once) once.add(listener)
		}
		add(type, listener, options)
	}) as AbortSignal["addEventListener"]
	signal.removeEventListener = ((
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	) => {
		if (!listener) return
		if (type === "abort") {
			live.delete(listener)
			once.delete(listener)
		}
		remove(type, listener, options)
	}) as AbortSignal["removeEventListener"]
	return () => live.size
}
