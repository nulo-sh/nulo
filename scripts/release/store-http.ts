/**
 * How the store runners read an answer and word a failure. The contract both keep: no request,
 * header, token or raw exception reaches the log, and a body that is not JSON is reported by its
 * status alone.
 */

/** A store API answer: its status, and its body parsed as JSON, or null when the body is not JSON. */
export interface ApiResponse {
	status: number
	json: unknown
}

/** Reads `res` whole; a body that fails mid-read rejects, so the caller reports the request, not the body. */
export async function readApiResponse(res: Response): Promise<ApiResponse> {
	const text = await res.text()
	let json: unknown = null
	try {
		json = JSON.parse(text)
	} catch {
		json = null
	}
	return { status: res.status, json }
}

/** Why a request that threw failed: a timeout by its limit, anything else by its class name alone. */
export function requestFailure(what: string, e: unknown, timeoutMs: number): string {
	const name = e instanceof Error ? e.name : "Error"
	return `${what}: request failed (${name === "TimeoutError" || name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : name})`
}

/** The reason to refuse an answer whose body is not a JSON object, or null when it is one. */
export function unreadableAnswer(what: string, res: ApiResponse): string | null {
	return res.json === null || typeof res.json !== "object" ? `${what}: HTTP ${res.status} with a non-JSON body` : null
}
