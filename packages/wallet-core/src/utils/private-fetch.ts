/**
 * The `RequestInit` of every request the wallet makes to a remote host it names: no cookies, no
 * referrer and no HTTP cache, the promise the Privacy Policy publishes, and no redirect, so the
 * request reaches only that host and a host that moves fails until a release names the new one.
 * `cache: "no-store"`, not `"no-cache"`: no request carries a cache validator, and `"no-cache"`
 * would revalidate with the stored one. Of `extra`, only `headers` is read.
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
