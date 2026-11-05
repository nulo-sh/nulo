import { describe, expect, test } from "bun:test"
import { candidates, denied } from "../setup/build-token"

describe("build-token", () => {
	test("every candidate names the Worker or its tag, flat ones first", () => {
		const list = candidates("acct", "nulo-x", "tag1")
		expect(list).toHaveLength(8)
		for (const c of list) expect(JSON.stringify(c)).toMatch(/nulo-x|tag1/)
		expect(Object.keys(list[0])[0]).toBe("com.cloudflare.edge.worker.script.acct_nulo-x")
		expect(Object.keys(list[4])[0]).toBe("com.cloudflare.api.account.acct")
	})

	test("only 401 and 403 count as a refusal", () => {
		expect([401, 403].every(denied)).toBe(true)
		expect([200, 400, 404, 500].some(denied)).toBe(false)
	})
})
