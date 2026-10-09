import { computed, type Ref } from "vue"

/** What a window shows, and its emoji check announces, under a hostname `isSuspicious` flags. */
export const HOSTNAME_WARNING =
	"This hostname contains non-ASCII or punycoded characters. Verify carefully. Some characters can imitate Latin letters."

/**
 * Anti-phishing helper: extract the normalized hostname from a dApp URL
 * and surface a "suspicious" flag for IDN / punycode hostnames so the
 * UI can render a warning chip alongside.
 */
export function useDappHostname(dapp: Ref<{ url?: string } | undefined | null>) {
	const hostname = computed(() => {
		const url = dapp.value?.url
		if (!url) return ""
		try {
			return new URL(url).hostname
		} catch {
			return url
		}
	})

	const isSuspicious = computed(() => {
		const h = hostname.value
		for (const ch of h) {
			if (ch.charCodeAt(0) > 127) return true
		}
		return h.split(".").some((label) => label.startsWith("xn--"))
	})

	return { hostname, isSuspicious }
}
