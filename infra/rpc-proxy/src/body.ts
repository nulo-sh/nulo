import { NODE_METHODS } from "./methods"

/**
 * The client caps a batch's summed UTF-16 length under 1 MiB, and every wallet call is ASCII, so a
 * body it sends is at most 100 bytes of array punctuation over 1 MiB; the extra KiB covers that.
 */
export const BODY_CAP_BYTES = 1024 * 1024 + 1024

/** The client's own batch ceiling: no request needs more. */
export const MAX_CALLS = 100

/** Cancels on the first chunk past `cap`, whatever `Content-Length` claims. */
export async function readCapped(
	body: ReadableStream<Uint8Array> | null,
	cap: number,
): Promise<Uint8Array<ArrayBuffer> | "too-large" | "malformed"> {
	if (!body) return new Uint8Array(0)
	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let size = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			size += value.byteLength
			if (size > cap) {
				reader.cancel().catch(() => {})
				return "too-large"
			}
			chunks.push(value)
		}
	} catch {
		return "malformed"
	}
	const bytes = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return bytes
}

export type CallsRefusal = { code: -32700 | -32600 | -32601; message: string }

function entryRefusal(entry: unknown): CallsRefusal | null {
	if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return { code: -32600, message: "invalid request" }
	const { method } = entry as { method?: unknown }
	if (typeof method !== "string") return { code: -32600, message: "invalid request" }
	return NODE_METHODS.has(method) ? null : { code: -32601, message: "method not allowed" }
}

/**
 * `null` when the body is UTF-8 JSON holding one call or 1 to `MAX_CALLS` calls, each naming a node
 * method; otherwise the refusal for the whole body, since one bad entry refuses all of it.
 */
export function parseCalls(bytes: Uint8Array): CallsRefusal | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
	} catch {
		return { code: -32700, message: "parse error" }
	}
	const entries = Array.isArray(parsed) ? parsed : [parsed]
	if (Array.isArray(parsed) && (entries.length === 0 || entries.length > MAX_CALLS)) return { code: -32600, message: "invalid request" }
	for (const entry of entries) {
		const refusal = entryRefusal(entry)
		if (refusal) return refusal
	}
	return null
}
