export type SubscribeAnswer = "ok" | "invalid" | "retry"

export type Fetch = (input: string, init: RequestInit) => Promise<Response>

export const RETRY_MESSAGE = "That didn't go through. Try again in a minute."

// A stalled connection would otherwise hold the button disabled with nothing said.
const TIMEOUT_MS = 20_000

/** Only `200 { "ok": true }` is `ok`, so a page served in the Worker's place never reads as success. */
export async function postSubscribe(
	url: string,
	request: { headers?: Record<string, string>; body: BodyInit },
	fetchImpl: Fetch,
): Promise<SubscribeAnswer> {
	let response: Response
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: { Accept: "application/json", ...request.headers },
			body: request.body,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
	} catch {
		return "retry"
	}
	if (response.status === 400) return "invalid"
	if (response.status !== 200) return "retry"
	const reply: unknown = await response.json().catch(() => null)
	return typeof reply === "object" && reply !== null && (reply as { ok?: unknown }).ok === true ? "ok" : "retry"
}
