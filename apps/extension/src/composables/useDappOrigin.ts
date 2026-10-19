import { computed, type Ref } from "vue"

/** The warning for a hostname `isSuspicious` flags; one string, so shown and announced copy cannot differ. */
export const HOSTNAME_WARNING =
	"This hostname contains non-ASCII or punycoded characters. Verify carefully. Some characters can imitate Latin letters."

function parse(url: string): URL | undefined {
	try {
		return new URL(url)
	} catch {
		return undefined
	}
}

/**
 * The dApp's identity as a grant is keyed by it: the serialized origin (scheme, host, a
 * non-default port), so two origins that share a host never read the same. A value with no
 * tuple origin (one that does not parse, or the opaque `"null"`) is shown as stored.
 * `isSuspicious` flags an IDN or punycode hostname for the homograph warning.
 */
export function useDappOrigin(dapp: Ref<{ url?: string } | undefined | null>) {
	const url = computed(() => dapp.value?.url ?? "")
	const parsed = computed(() => parse(url.value))

	const origin = computed(() => {
		const serialized = parsed.value?.origin
		return serialized && serialized !== "null" ? serialized : url.value
	})

	const isSuspicious = computed(() => {
		const h = parsed.value ? parsed.value.hostname : url.value
		for (const ch of h) {
			if (ch.charCodeAt(0) > 127) return true
		}
		return h.split(".").some((label) => label.startsWith("xn--"))
	})

	return { origin, isSuspicious }
}
