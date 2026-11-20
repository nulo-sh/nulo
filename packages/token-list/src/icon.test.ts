import { describe, expect, test } from "vitest"
import { bridgeIconBytes, ICON_PREFIX, iconBytes, isBridgeIcon, isTokenIcon, MAX_BRIDGE_ICON_CHARS, MAX_ICON_CHARS } from "./icon"

const dataUrl = (svg: string | Uint8Array) => ICON_PREFIX + Buffer.from(svg).toString("base64")
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`

/** Nulo's letter mark and the shapes the issuer files use: clip paths, a same-file `url(#…)`, fill rules. */
const LETTER_MARK = svg('<circle cx="48" cy="48" r="48" fill="#a8480c"/><path d="M24 30L36 68L48 40" fill="none" stroke="#fff"/>')
const CLIPPED = svg(
	'<g clip-path="url(#c)"><path d="M0 0H96V96Z" fill="#0B53BF" stroke-miterlimit="10"/></g><defs><clipPath id="c"><rect width="96" height="96"/></clipPath></defs>',
)
const EVEN_ODD = svg('<path fill-rule="evenodd" clip-rule="evenodd" d="M1 1H9V9Z" fill="#009393"/>')

/** A drawing whose data URL is exactly `length` characters long (26 + a multiple of 4). */
function sized(length: number): string {
	const bytes = ((length - ICON_PREFIX.length) / 4) * 3
	return dataUrl(svg(`<desc>${"a".repeat(bytes - svg("<desc></desc>").length)}</desc>`))
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** A valid picture whose base64 ends in one `=`. */
function padded(): string {
	let text = LETTER_MARK
	while (Buffer.byteLength(text) % 3 !== 2) text = text.replace("<svg ", "<svg  ")
	return dataUrl(text)
}

/** The same bytes with a set padding bit: `atob` reads it, the one-spelling check must not. */
function strayBits(): string {
	const url = padded()
	return `${url.slice(0, -2)}${ALPHABET[ALPHABET.indexOf(url.at(-2) as string) + 1]}=`
}

/** A valid picture whose base64 holds a `+` or `/`, respelled in the URL-safe alphabet. */
function urlSafe(): string {
	let text = svg("<desc>?</desc>")
	while (!/[+/]/.test(dataUrl(text))) text = text.replace("<desc>", "<desc>?")
	return dataUrl(text).replaceAll("+", "-").replaceAll("/", "_")
}

describe("isTokenIcon", () => {
	test("the padded control itself is accepted", () => {
		expect(isTokenIcon(padded())).toBe(true)
	})

	test.each([
		["a letter mark", LETTER_MARK],
		["clip paths and a same-file url", CLIPPED],
		["fill and clip rules", EVEN_ODD],
		["a same-file mask image and an id that spells image", svg('<rect id="image" style="mask-image:url(#m);image-rendering:auto"/>')],
	])("accepts %s, and iconBytes returns its exact bytes", (_, text) => {
		expect(isTokenIcon(dataUrl(text))).toBe(true)
		expect(new TextDecoder().decode(iconBytes(dataUrl(text)))).toBe(text)
	})

	test.each([
		["a token picture", MAX_ICON_CHARS, isTokenIcon, iconBytes],
		["a bridge picture", MAX_BRIDGE_ICON_CHARS, isBridgeIcon, bridgeIconBytes],
	])("the budget of %s bounds the whole data URL", (_, budget, accepts, bytesOf) => {
		const largest = sized(budget - ((budget - ICON_PREFIX.length) % 4))
		expect(largest.length).toBeLessThanOrEqual(budget)
		expect(accepts(largest)).toBe(true)
		expect(bytesOf(largest)).toBeDefined()
		expect(accepts(sized(largest.length + 4))).toBe(false)
		expect(bytesOf(sized(largest.length + 4))).toBeUndefined()
	})

	test("the bridge budget changes the size check only", () => {
		expect(isTokenIcon(sized(MAX_ICON_CHARS + 2))).toBe(false)
		expect(isBridgeIcon(sized(MAX_ICON_CHARS + 2))).toBe(true)
		expect(isBridgeIcon(dataUrl(svg(`<script>x</script><desc>${"a".repeat(4000)}</desc>`)))).toBe(false)
		expect([sized(MAX_ICON_CHARS + 2)].every(isBridgeIcon)).toBe(true)
	})

	test.each([
		["not a string", 42],
		["a remote URL", "https://example.com/usdc.svg"],
		["another media type", `data:image/png;base64,${Buffer.from(LETTER_MARK).toString("base64")}`],
		["an HTML document", `data:text/html;base64,${Buffer.from("<p>hi</p>").toString("base64")}`],
		["a URL-encoded SVG", `data:image/svg+xml,${encodeURIComponent(LETTER_MARK)}`],
		["an upper-case scheme", `DATA:image/svg+xml;base64,${Buffer.from(LETTER_MARK).toString("base64")}`],
		["base64 without its padding", padded().slice(0, -1)],
		["base64 with a line break", `${dataUrl(LETTER_MARK).slice(0, 40)}\n${dataUrl(LETTER_MARK).slice(40)}`],
		["the URL-safe alphabet", urlSafe()],
		["stray padding bits", strayBits()],
		["invalid UTF-8", dataUrl(Uint8Array.from([...Buffer.from("<svg>"), 0xff, ...Buffer.from("</svg>")]))],
		["a byte-order mark", dataUrl(`\uFEFF${LETTER_MARK}`)],
		["a prolog", dataUrl(`<?xml version="1.0"?>${LETTER_MARK}`)],
		["a document type", dataUrl(`<!DOCTYPE svg>${LETTER_MARK}`)],
		["a comment", dataUrl(svg("<!-- x --><g/>"))],
		["a character reference", dataUrl(svg('<rect fill="u&#114;l(https://example.com/a)"/>'))],
		["a CSS escape", dataUrl(svg('<rect style="fill:u\\72l(https://example.com/a)"/>'))],
		["a prefixed element", dataUrl(svg('<s:path xmlns:s="http://www.w3.org/2000/svg" d="M0 0H9"/>'))],
		["a script", dataUrl(svg("<script>x</script>"))],
		["an animation", dataUrl(svg('<rect><animate attributeName="opacity" dur="1ms"/></rect>'))],
		["a style element", dataUrl(svg("<style>rect{fill:red}</style>"))],
		["a filter element", dataUrl(svg('<filter id="f"/><rect filter="url(#f)"/>'))],
		["a filter attribute", dataUrl(svg('<rect width="32" height="32" fill="red" filter="blur(4px)"/>'))],
		["a filter in a style attribute", dataUrl(svg('<rect style="filter:blur(4px)"/>'))],
		["a foreign object", dataUrl(svg("<foreignObject/>"))],
		["an event attribute", dataUrl(svg('<rect ONLOAD = "x"/>'))],
		["an href", dataUrl(svg('<g href="#a"/>'))],
		["a url outside the file", dataUrl(svg('<rect fill="url(https://example.com/a)"/>'))],
		["an image set", dataUrl(svg("<rect style=\"mask-image:image-set('https://example.com/a' 1x)\"/>"))],
		["an image function", dataUrl(svg("<rect style=\"mask-image:image('https://example.com/a')\"/>"))],
		["a src function", dataUrl(svg("<rect style=\"mask:src('https://example.com/a')\"/>"))],
		["a base URL", dataUrl(svg('<rect xml:base="https://example.com/" fill="url(#a)"/>'))],
		["text that does not start with <svg", dataUrl(` ${LETTER_MARK}`)],
	])("refuses %s", (_, value) => {
		expect(isTokenIcon(value)).toBe(false)
		expect(iconBytes(value)).toBeUndefined()
	})
})
