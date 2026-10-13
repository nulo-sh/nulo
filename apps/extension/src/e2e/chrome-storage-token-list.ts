import type { TokenListSource } from "@/wallet/services/token-list/spec"

/**
 * Storage key the e2e token-list source reads: `{ url, publicKey }`, written by the running test.
 * Exported so fixtures import the exact literal; `_build-extension.yml` greps release bundles for it.
 */
export const TOKEN_LIST_SOURCE_KEY = "nulo:e2e:token-list"

export const E2E_TOKEN_LIST_KEY_ID = "nulo-e2e"

const LOCALHOST_URL = /^http:\/\/localhost:\d{1,5}\/[\w./-]*$/
const ED25519_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/

/**
 * Reads the e2e list source from `chrome.storage.session`. Armed builds REPLACE the production
 * endpoint and keys with it, so an absent or malformed value turns the fetcher off; it never falls
 * back to `tokens.nulo.sh`, which keeps the suites off the live host. Only `http://localhost`
 * passes: an armed build never fetches a list from the network, and `127.0.0.1` rides the host
 * permission, so a green suite would not prove the fetch needs none. The real control is that this
 * module is absent from shipped bundles (`config.ts`'s `E2E_TOKEN_LIST` and the release grep).
 */
export class ChromeStorageTokenListSource {
	public async get(): Promise<TokenListSource | undefined> {
		let raw: unknown
		try {
			raw = (await chrome.storage.session.get(TOKEN_LIST_SOURCE_KEY))[TOKEN_LIST_SOURCE_KEY]
		} catch {
			return undefined
		}
		if (!raw || typeof raw !== "object") return undefined
		const { url, publicKey } = raw as { url?: unknown; publicKey?: unknown }
		if (typeof url !== "string" || !LOCALHOST_URL.test(url)) return undefined
		if (typeof publicKey !== "string" || !ED25519_PUBLIC_KEY.test(publicKey)) return undefined
		return { url, keys: [{ keyId: E2E_TOKEN_LIST_KEY_ID, publicKey }] }
	}
}
