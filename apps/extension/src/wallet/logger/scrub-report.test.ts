import { describe, expect, test } from "vitest"
import { trimAddress } from "@/utils/string"
import { scrubReportData, scrubReportText } from "./utils"

const ADDRESS = "0x1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a7988"
const DIGITS = ADDRESS.slice(2)
const chunks = (hex: string, size: number) => hex.match(new RegExp(`.{1,${size}}`, "g")) ?? []
/** No run of 9 or more hex digits, the address's own digits nowhere. */
const leaksNothing = (text: string) => {
	expect(text).not.toMatch(/[0-9a-f]{9,}/i)
	for (const piece of chunks(DIGITS, 8)) expect(text).not.toContain(piece)
}

describe("scrubReportText", () => {
	test.each([
		["a full address", `note owner ${ADDRESS} not found`],
		["the header's short form", `from ${trimAddress(ADDRESS, 6, 4)} to`],
		["the default short form", `from ${trimAddress(ADDRESS)} to`],
		["an ellipsis short form", `from 0x1f2e3d…7988 to`],
		["an address wrapped across a space", `owner 0x${DIGITS.slice(0, 32)} ${DIGITS.slice(32)} end`],
		["an address wrapped across an escaped line break", `owner 0x${DIGITS.slice(0, 32)}\\n${DIGITS.slice(32)} end`],
		["an address wrapped across a raw line break", `owner 0x${DIGITS.slice(0, 32)}\n${DIGITS.slice(32)} end`],
		["an address wrapped across U+2028", `owner 0x${DIGITS.slice(0, 32)} ${DIGITS.slice(32)} end`],
		["an address a formatter grouped by four", `owner 0x${chunks(DIGITS, 4).join(" ")} end`],
		["an address split by U+200B", `owner 0x${chunks(DIGITS, 6).join("​")} end`],
		["an address split by tabs", `owner 0x${chunks(DIGITS, 8).join("\t")} end`],
		["an address split by tabs, JSON-escaped twice", JSON.stringify(JSON.stringify({ owner: `0x${chunks(DIGITS, 8).join("\t")}` }))],
		["an unprefixed hash", `hash ${DIGITS} end`],
		["an L1 address", "recipient 0x52908400098527886E0F7030069857D2E4169EE7 end"],
	])("blanks %s", (_label, line) => {
		const out = scrubReportText(line)
		expect(out).toContain("[hex]")
		leaksNothing(out)
	})

	test("keeps a URL's scheme and host only, its token gone", () => {
		const out = scrubReportText("fetch failed: https://rpc.example.com/v2/sk-live-abc123?apiKey=s3cr3t done")
		expect(out).toBe("fetch failed: https://rpc.example.com done")
	})

	test("blanks an extension URL whole: a Firefox install's host is its own", () => {
		const out = scrubReportText(
			"import failed: moz-extension://0e9f1c2a-3b4d-4e5f-8a6b-7c8d9e0f1a2b/assets/pxe.js and blob:chrome-extension://abc/x",
		)
		expect(out).toBe("import failed: [extension-url] and blob:[extension-url]")
	})

	test("a nested envelope string loses its address and URL and keeps its code", () => {
		const nested = JSON.stringify({ code: -32603, message: `node at wss://n.example/key/zzz rejected ${ADDRESS}` })
		const out = scrubReportText(JSON.stringify({ error: nested }))
		expect(out).toContain("-32603")
		expect(out).toContain("wss://n.example")
		expect(out).not.toContain("/key/zzz")
		leaksNothing(out)
	})

	test("keeps a selector, an 8-hex trace id, a 16-hex journal id and a short value beside a word", () => {
		const line = "selector 0x1a2b3c4d trace 9f8e7d6c journal 0123456789abcdef value 0xabcdef12 added"
		expect(scrubReportText(line)).toBe(line)
	})

	test("shows line breaks and drops controls, bidi overrides and ANSI escapes", () => {
		expect(scrubReportText("a\r\nb c‮def\u001b[31mred")).toBe("a\\nb\\ncdef[31mred")
	})
})

describe("scrubReportData", () => {
	test("scrubs raw strings and keys before rendering, so a tab-split address cannot survive JSON escaping", () => {
		const split = `0x${chunks(DIGITS, 8).join("\t")}`
		const out = scrubReportData({ error: { message: `assert failed for ${split}` }, [split]: 1 })
		const rendered = JSON.stringify(out)
		expect(rendered).not.toContain("\\t")
		leaksNothing(rendered)
	})

	test("blanks a field-sized bigint and renders a small one as text", () => {
		expect(scrubReportData([2n ** 200n, 42n])).toEqual(["[32 bytes]", "42"])
	})
})
