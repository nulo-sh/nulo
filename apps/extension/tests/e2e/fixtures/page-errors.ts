/**
 * The `pageerror` payload as the `Error` the fixtures record, or `undefined` for the benign
 * service-worker port-close cascade: a fire-and-forget RPC in flight during an MV3 worker restart
 * rejects with "Client disconnected", the same noise the `console` filter drops. The cascade is
 * always an `Error`, so the filter never reads a primitive.
 *
 * Puppeteer's CDP driver emits a page's primitive throw or rejection value as is (BiDi always
 * emits an `Error`), and builds every other payload itself, so `String` of what reaches here
 * cannot throw.
 */
export function pageErrorOf(payload: unknown): Error | undefined {
	if (!(payload instanceof Error)) return new Error(String(payload))
	return payload.message.includes("Client disconnected") ? undefined : payload
}
