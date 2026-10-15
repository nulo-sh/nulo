export type RpcTransportVerdict =
	| { allowed: true }
	| { allowed: false; refusal: "userinfo" }
	| { allowed: false; refusal: "non-loopback-http"; host: string }
	| { allowed: false; refusal: "scheme"; scheme: string }

/**
 * The wallet's RPC transport rule: no userinfo, then `https:` to any host and `http:` only to
 * loopback as `URL.hostname` spells it (IPv6 keeps its brackets, so `[::1]` is the literal).
 * WHATWG parses `https://user@evil.com@safe.com` as username `user@evil.com` on host `safe.com`:
 * the userinfo is the part a person reads, so it is a phishing vector, and it is a credential.
 */
export function rpcTransportVerdict(url: URL): RpcTransportVerdict {
	if (url.username !== "" || url.password !== "") return { allowed: false, refusal: "userinfo" }
	const scheme = url.protocol.slice(0, -1)
	if (scheme === "https") return { allowed: true }
	if (scheme === "http") {
		const host = url.hostname.toLowerCase()
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return { allowed: true }
		return { allowed: false, refusal: "non-loopback-http", host }
	}
	return { allowed: false, refusal: "scheme", scheme }
}
