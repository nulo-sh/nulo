import { readTokenList } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { EXPECTED_HEADERS, LIST_PATH, TOKENS_HOST } from "./policy"

// Black-box probe of the deployed host from outside, with no Cloudflare credentials: what a wallet
// would get. A zone-level change (a challenge rule, a rewriter, a stale deploy) fails by its effect.
// Gated on TOKEN_LIST_HOST_LIVE=1, since it needs the network. Coverage is sampled: one path, one
// bot-shaped and one extension-shaped request, from this runner.
const BOT_UA = "python-requests/2.32"
const REQUEST_MS = 10_000
const TEST_MS = 60_000
const get = (url: string, headers: Record<string, string> = {}) =>
	fetch(url, { redirect: "manual", signal: AbortSignal.timeout(REQUEST_MS), headers: { "user-agent": BOT_UA, ...headers } })

describe.skipIf(process.env.TOKEN_LIST_HOST_LIVE !== "1")("the deployed token-list host", () => {
	test(
		"serves a list that verifies against the pinned keys, under the exact policy and with no edge mitigation",
		async () => {
			const res = await get(`https://${TOKENS_HOST}${LIST_PATH}`, { origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" })
			expect(res.status).toBe(200)
			expect(res.headers.get("cf-mitigated")).toBeNull()
			expect(res.headers.get("content-type")).toMatch(/^application\/json/)
			for (const [name, value] of Object.entries(EXPECTED_HEADERS)) expect(res.headers.get(name)).toBe(value)
			const list = await readTokenList(await res.text())
			expect(list.entries.length).toBeGreaterThan(0)
		},
		TEST_MS,
	)

	test(
		"plain http is a redirect to https, not served",
		async () => {
			const res = await get(`http://${TOKENS_HOST}${LIST_PATH}`)
			expect([301, 308]).toContain(res.status)
			expect(res.headers.get("location")).toBe(`https://${TOKENS_HOST}${LIST_PATH}`)
		},
		TEST_MS,
	)

	test(
		"serves nothing else",
		async () => {
			for (const path of ["/", "/index.html", "/v1/", "/_headers"])
				expect((await get(`https://${TOKENS_HOST}${path}`)).status).toBe(404)
		},
		TEST_MS,
	)
})
