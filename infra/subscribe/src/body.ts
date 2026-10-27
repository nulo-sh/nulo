export const BODY_CAP_BYTES = 2048

/** The decoy field: hidden from people, filled by naive bots. */
export const HONEYPOT_FIELD = "website"

export type Fields = { email: string | null; honeypot: string }

/**
 * Reads at most `cap` bytes and stops pulling past it, so a body that lies about its
 * `Content-Length`, or sends none, costs the Worker no more than the cap.
 */
export async function readCapped(body: ReadableStream<Uint8Array> | null, cap: number): Promise<Uint8Array | "too-large" | "malformed"> {
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

function fromJson(text: string): Fields | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return null
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
	const { email, [HONEYPOT_FIELD]: honeypot } = parsed as Record<string, unknown>
	if (email !== undefined && typeof email !== "string") return null
	if (honeypot !== undefined && typeof honeypot !== "string") return null
	return { email: email ?? null, honeypot: (honeypot ?? "").trim() }
}

function fromForm(text: string): Fields {
	const params = new URLSearchParams(text)
	return { email: params.get("email"), honeypot: (params.get(HONEYPOT_FIELD) ?? "").trim() }
}

/** `null` for a body that is not UTF-8 form data or a JSON object of string fields. */
export function parseFields(contentType: string | null, bytes: Uint8Array): Fields | null {
	let text: string
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		return null
	}
	const mediaType = (contentType ?? "").split(";")[0].trim().toLowerCase()
	if (mediaType === "application/x-www-form-urlencoded") return fromForm(text)
	if (mediaType === "application/json") return fromJson(text)
	return null
}
