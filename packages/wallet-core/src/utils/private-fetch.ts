/**
 * The `RequestInit` of the remote data the wallet fetches on its own, not a node call: no cookies,
 * no referrer and no HTTP cache, the promise the Privacy Policy publishes, and no redirect, so the
 * request reaches only the host it names and a host that moves fails until a release names it.
 * `cache: "no-store"`, not `"no-cache"`: no request carries a cache validator, and `"no-cache"`
 * would revalidate with the stored one.
 */
export function privateFetchInit(signal: AbortSignal, extra?: { headers?: HeadersInit }): RequestInit {
	return {
		headers: extra?.headers,
		credentials: "omit",
		referrerPolicy: "no-referrer",
		redirect: "error",
		cache: "no-store",
		signal,
	}
}
