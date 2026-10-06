import { describe, expect, test } from "vitest"
import { scrubUrls } from "./scrub-urls"

describe("scrubUrls", () => {
	test("keeps scheme and host, drops path, query and userinfo", () => {
		expect(scrubUrls("fetch failed: https://user:pw@rpc.example.com/v2/KEY?apikey=abc")).toBe("fetch failed: https://rpc.example.com")
	})

	test("keeps sentence punctuation after a URL outside it", () => {
		expect(scrubUrls("node (wss://node.example.com/ws/KEY).")).toBe("node (wss://node.example.com).")
		expect(scrubUrls("see http://[::1]:8080/secret!?")).toBe("see http://[::1]:8080!?")
	})

	test("a URL that does not parse becomes a placeholder", () => {
		expect(scrubUrls("bad https://exa^mple/key")).toBe("bad [url]")
	})

	test("a long punctuation run inside a URL stays linear", () => {
		const hostile = `https://a.example/${"!".repeat(200_000)}x`
		const started = performance.now()
		expect(scrubUrls(hostile)).toBe("https://a.example")
		expect(performance.now() - started).toBeLessThan(1_000)
	})
})
