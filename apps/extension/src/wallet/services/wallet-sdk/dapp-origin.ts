import { isLoopbackHost } from "@nulo/wallet-core/utils"

/**
 * Whether a dApp at `origin` may reach a consent window: an `https:` origin, or plain `http:` on
 * the two loopback hosts `isLoopbackHost` names, for a dApp served from this machine. Every other
 * value is refused, a value that does not parse and the opaque `"null"` included, so a grant is
 * only ever keyed by an origin the network cannot rewrite in transit.
 */
export function isSecureDappOrigin(origin: string): boolean {
	let url: URL
	try {
		url = new URL(origin)
	} catch {
		return false
	}
	if (url.protocol === "https:") return true
	return url.protocol === "http:" && isLoopbackHost(url.hostname)
}
