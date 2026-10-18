import { describe, expect, test } from "vitest"
import { isSecureDappOrigin } from "./dapp-origin"

describe("isSecureDappOrigin", () => {
	test.each(["https://a.example", "https://a.example:8443", "http://localhost:5174", "http://127.0.0.1:8080"])("admits %s", (origin) => {
		expect(isSecureDappOrigin(origin)).toBe(true)
	})

	test.each([
		["a plain-http host", "http://a.example"],
		["a plain-http address", "http://10.0.0.2"],
		["plain http on IPv6 loopback", "http://[::1]:3000"],
		["plain http on a localhost subdomain", "http://app.localhost:3000"],
		["an opaque origin", "null"],
		["upstream's unknown origin", "unknown"],
		["a file page", "file:///x"],
		["another extension", "chrome-extension://abc"],
		["a value that does not parse", "not a url"],
	])("refuses %s", (_label, origin) => {
		expect(isSecureDappOrigin(origin)).toBe(false)
	})
})
