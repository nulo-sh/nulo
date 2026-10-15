import { describe, expect, test } from "vitest"
import { egressGuardArgs } from "../../tests/e2e/fixtures/browser/chrome"

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

	test("the live hosts, alone of the outside names, bypass the guard and resolve", () => {
		const args = egressGuardArgs(4321, ["lb.drpc.live", "tokens.nulo.sh"])
		expect(args).toContain("--proxy-server=http://127.0.0.1:4321")
		expect(args).toContain("--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1];lb.drpc.live;tokens.nulo.sh")
		expect(args.find((arg) => arg.startsWith("--host-resolver-rules="))).toBe(
			"--host-resolver-rules=MAP egress-canary.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1, EXCLUDE lb.drpc.live, EXCLUDE tokens.nulo.sh",
		)
	})
})
