/**
 * What every release runner sends to the GitHub REST API, and the error a refused answer becomes.
 * Status, redirect and timeout policy stay with each caller, beside its `fetch`.
 */

/** The token, `accept` and the pinned API version. The token goes wherever the caller's URL points: pass GitHub hosts only. */
export function githubHeaders(token: string, accept = "application/vnd.github+json"): Record<string, string> {
	return { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" }
}

/** `METHOD path: HTTP n` with the query dropped, plus GitHub's own `message` when the body is JSON that carries one. */
export async function refusal(res: Response, method: string, url: string): Promise<Error> {
	const detail = ((await res.json().catch(() => null)) as { message?: unknown } | null)?.message
	return new Error(`${method} ${url.split("?")[0]}: HTTP ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}`)
}
