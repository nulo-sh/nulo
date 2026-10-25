/** A response body over its caller's byte budget. */
export class ResponseTooLargeError extends Error {
	public constructor(public readonly maxBytes: number) {
		super(`Response body is over its ${maxBytes}-byte budget`)
		this.name = "ResponseTooLargeError"
	}
}

/**
 * Reads `response`'s body as UTF-8 text, decoded as `Response.json()` decodes it, and refuses with
 * {@link ResponseTooLargeError} past `maxBytes`: a declared `content-length` over the budget before any
 * read, a streamed body at the first chunk past it. Either refusal cancels the body. A response with no
 * body reads as `""`.
 */
export async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
	if (Number(response.headers.get("content-length")) > maxBytes) {
		response.body?.cancel().catch(() => {})
		throw new ResponseTooLargeError(maxBytes)
	}
	const reader = response.body?.getReader()
	if (!reader) return ""
	const chunks: Uint8Array[] = []
	let size = 0
	for (let read = await reader.read(); !read.done; read = await reader.read()) {
		size += read.value.byteLength
		if (size > maxBytes) {
			reader.cancel().catch(() => {})
			throw new ResponseTooLargeError(maxBytes)
		}
		chunks.push(read.value)
	}
	const bytes = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return new TextDecoder().decode(bytes)
}
