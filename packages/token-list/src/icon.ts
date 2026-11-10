/**
 * A list entry's picture: an SVG file as a `data:` URL, which a reader may hand to an `<img>` and
 * to nothing else. The browser's image mode, which runs no script and loads nothing, is the
 * boundary. These checks keep the file a static drawing whose literal text is what the browser
 * parses: no character reference, escape or declaration can rename what the allowlist read.
 * They do not prove the XML well formed; a malformed file fails to decode in the `<img>`.
 */

export const ICON_PREFIX = "data:image/svg+xml;base64,"
/** The whole data URL. Every issuer file the list carries fits with a third to spare. */
export const MAX_ICON_CHARS = 3072

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
/** Elements of a static drawing: no script, style, image, use, animation, filter or foreign content. */
const ELEMENTS: ReadonlySet<string> = new Set([
	"svg",
	"g",
	"defs",
	"path",
	"circle",
	"ellipse",
	"rect",
	"line",
	"polyline",
	"polygon",
	"clippath",
	"mask",
	"lineargradient",
	"radialgradient",
	"stop",
	"title",
	"desc",
])
/** Matched in the lower-cased text. `filter` covers the element, the attribute and the CSS property. */
const REFUSED = ["&", "\\", "<!", "<?", "href", "filter"] as const
const EVENT_ATTRIBUTE = /\son[a-z]+\s*=/
const OUTSIDE_URL = /url\((?!#)/
const TAG = /<\/?([^\s/>]*)/g

function decodeBase64(text: string): Uint8Array | undefined {
	if (text.length % 4 !== 0 || !BASE64.test(text)) return undefined
	let binary: string
	try {
		binary = atob(text)
	} catch {
		return undefined
	}
	// One spelling per value: stray trailing bits would decode to the same bytes.
	if (btoa(binary) !== text) return undefined
	return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function isDrawing(svg: string): boolean {
	const text = svg.toLowerCase()
	if (!text.startsWith("<svg") || REFUSED.some((s) => text.includes(s))) return false
	if (EVENT_ATTRIBUTE.test(text) || OUTSIDE_URL.test(text)) return false
	return Array.from(text.matchAll(TAG), (match) => match[1]).every((name) => ELEMENTS.has(name))
}

/** The SVG bytes of a picture `isTokenIcon` accepts, or `undefined`. */
export function iconBytes(value: unknown): Uint8Array | undefined {
	if (typeof value !== "string" || value.length > MAX_ICON_CHARS || !value.startsWith(ICON_PREFIX)) return undefined
	const bytes = decodeBase64(value.slice(ICON_PREFIX.length))
	if (!bytes) return undefined
	let svg: string
	try {
		// A byte-order mark stays in the text and fails the `<svg` start.
		svg = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
	} catch {
		return undefined
	}
	return isDrawing(svg) ? bytes : undefined
}

export function isTokenIcon(value: unknown): value is string {
	return iconBytes(value) !== undefined
}
