import { describe, expect, test } from "vitest"
import { egressGuardArgs, routingArgs } from "../../tests/e2e/fixtures/browser/chrome"

describe("chrome egress routing", () => {
	test("proxies everything but loopback, with the implicit bypasses removed first", () => {
		const args = egressGuardArgs(4321)
		expect(args).toContain("--proxy-server=http://127.0.0.1:4321")
		expect(args).toContain("--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1]")
	})

	test("resolves no outside name, the canary only to loopback, and keeps the guard's own address", () => {
		const rules = egressGuardArgs(4321).find((arg) => arg.startsWith("--host-resolver-rules="))
		expect(rules).toBe(
			"--host-resolver-rules=MAP egress-canary.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1",
		)
	})

	test("an artifact run keeps its price-host block alone, and cannot also be guarded", () => {
		expect(routingArgs(undefined, true)).toEqual(["--host-resolver-rules=MAP api.coingecko.com 127.0.0.1:1"])
		expect(routingArgs(undefined, false)).toEqual([])
		expect(() => routingArgs({ guardPort: 1 }, true)).toThrow(/both behind the egress guard and an artifact run/)
	})
})
