export type RpcTransportVerdict =
	| { allowed: true }
	| { allowed: false; refusal: "userinfo" }
	| { allowed: false; refusal: "http-host"; host: string }
	| { allowed: false; refusal: "scheme"; scheme: string }

/**
 * The wallet's RPC transport rule: no userinfo, then `https:` to any host and `http:` only to
 * `localhost` and `127.0.0.1` as `URL.hostname` spells them. Plain HTTP to `[::1]` is refused:
 * the extension's `connect-src` cannot admit it (both browsers ignore an `http://[::1]` source).
 * WHATWG parses `https://user@evil.com@safe.com` as username `user@evil.com` on host `safe.com`:
 * the userinfo is the part a person reads, so it is a phishing vector, and it is a credential.
 */
export function rpcTransportVerdict(url: URL): RpcTransportVerdict {
	if (url.username !== "" || url.password !== "") return { allowed: false, refusal: "userinfo" }
	const scheme = url.protocol.slice(0, -1)
	if (scheme === "https") return { allowed: true }
	if (scheme === "http") {
		const host = url.hostname.toLowerCase()
		if (isLoopbackHost(host)) return { allowed: true }
		return { allowed: false, refusal: "http-host", host }
	}
	return { allowed: false, refusal: "scheme", scheme }
}

/** Whether a parsed `URL.hostname` names this machine: exactly `localhost` or `127.0.0.1`, the two
 *  hosts the transport rule admits over plain HTTP. Any other spelling (a trailing dot, a
 *  `*.localhost` name, another `127.x` address, `[::1]`) is not loopback here. */
export function isLoopbackHost(hostname: string): boolean {
	const host = hostname.toLowerCase()
	return host === "localhost" || host === "127.0.0.1"
}

/** Spaces, control characters and invisible format characters (zero-width, bidirectional controls,
 *  the byte-order mark, fillers). Each can make the URL a person reads differ from the one dialed:
 *  URL parsing silently drops some of them and percent-encodes the rest. */
const HIDDEN_URL_CHARACTER = /[\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u

/** True when a hidden character sits inside the URL. The edges are exempt: they are what
 *  `String.prototype.trim` strips, the common paste accident, which the schema trims away. */
export function hasHiddenUrlCharacter(raw: string): boolean {
	return HIDDEN_URL_CHARACTER.test(raw.trim())
}
