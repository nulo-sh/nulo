import { describe, expect, test } from "vitest"
import { hasHiddenUrlCharacter, rpcTransportVerdict } from "./rpc-url"

describe("rpcTransportVerdict", () => {
	test.each([
		["https://user@rpc.example.com", { allowed: false, refusal: "userinfo" }],
		["https://user:pass@host.example", { allowed: false, refusal: "userinfo" }],
		["https://:pass@host.example", { allowed: false, refusal: "userinfo" }],
		["https://@b.example", { allowed: true }],
		["http://[::1]:8080", { allowed: true }],
		["http://LOCALHOST.:8080", { allowed: false, refusal: "non-loopback-http", host: "localhost." }],
		["ws://localhost:8080", { allowed: false, refusal: "scheme", scheme: "ws" }],
	])("%j → %j", (url, verdict) => {
		expect(rpcTransportVerdict(new URL(url))).toEqual(verdict)
	})
})

describe("hasHiddenUrlCharacter", () => {
	test.each([
		["an ASCII space in the path", "https://rpc.example/p q"],
		["a non-breaking space in the query", "https://rpc.example/?k=a\u00A0b"],
		["a C0 control", "https://rpc.example/\u0001"],
		["DEL", "https://rpc.example/p\u007F"],
		["NEL at the end, which trim keeps", "https://rpc.example/\u0085"],
		["a tab inside the path, which URL drops silently", "https://rpc.example/p\tq"],
		["a line separator", "https://rpc.example/p\u2028q"],
		["an ideographic space", "https://rpc.example/p\u3000q"],
		["a zero-width space", "https://rpc.ex\u200Bample/"],
		["a word joiner", "https://rpc.example/p\u2060q"],
		["a byte-order mark inside", "https://rpc.example/\uFEFFp"],
		["a right-to-left override", "https://rpc.example/\u202Ep"],
		["a right-to-left mark", "https://rpc.example/p\u200F"],
	])("refuses %s", (_, url) => {
		expect(hasHiddenUrlCharacter(url)).toBe(true)
	})

	test.each([
		["an encoded space", "https://rpc.example/p%20q"],
		["plain loopback", "http://localhost:8080"],
		["spaces at both edges", "  https://rpc.example/  "],
		["a non-breaking space and a byte-order mark at the edges", "\uFEFFhttps://rpc.example/\u00A0"],
	])("accepts %s", (_, url) => {
		expect(hasHiddenUrlCharacter(url)).toBe(false)
	})
})
