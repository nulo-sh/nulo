/**
 * Reduce every URL in a free-text string to its scheme and host.
 *
 * Error messages are the most common place an endpoint URL surfaces, and commercial RPC providers
 * routinely carry the API key in the path or query (and occasionally in userinfo). Dropping
 * everything after the authority takes all three. Which host failed — the part that actually
 * diagnoses the error — survives.
 *
 * Lives here rather than beside the logger because both the log pipeline and the dApp-facing error
 * envelope need it, and the envelope is deliberately free of logger dependencies.
 */

/**
 * URL-ish runs in free text. Covers `ws://`/`wss://` (the Aztec node transport) alongside http(s):
 * an endpoint carrying an API key is just as credential-bearing over a socket as over HTTP.
 *
 * The character class deliberately allows `[` and `]` so an IPv6 authority (`http://[::1]:8080/…`)
 * matches WHOLE — excluding them truncated the match at the bracket and left the credential-bearing
 * path sitting in the message. Trailing punctuation is trimmed afterwards instead.
 *
 * Protocol-relative `//host/path` is NOT matched: in free text it is indistinguishable from a
 * comment or a doubled path separator, and mangling those was worse than the rare miss.
 */
const URL_LIKE = /\b(?:https?|wss?):\/\/[^\s'"<>]+/gi

/** Sentence punctuation that follows a URL far more often than it belongs to one. */
const TRAILING_PUNCTUATION = new Set(").,;:!?}")

/** A scan from the end, not `/[…]+$/`: that regex is quadratic on a long punctuation run that does not reach the end. */
function trailingPunctuation(candidate: string): string {
	let end = candidate.length
	while (end > 0 && TRAILING_PUNCTUATION.has(candidate[end - 1] as string)) end--
	return candidate.slice(end)
}

export function scrubUrls(text: string): string {
	return text.replace(URL_LIKE, (candidate) => {
		const trailing = trailingPunctuation(candidate)
		const url = trailing ? candidate.slice(0, -trailing.length) : candidate
		try {
			const { protocol, host } = new URL(url)
			return `${protocol}//${host}${trailing}`
		} catch {
			return `[url]${trailing}`
		}
	})
}
