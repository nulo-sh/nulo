/**
 * Markdown rendering for the landing's generated pages, and the check every rendered page passes before
 * it ships. Pure: no file access.
 */

/** Built into the pinned Bun line; Cloudflare's Bun is pinned by a dashboard variable, not the repo. */
declare const Bun: { markdown?: { html(source: string, options?: { headings?: { ids?: boolean } }): string } } | undefined

export const SITE = "https://nulo.sh"

/** Each tag a page may hold, mapped to the attributes it may carry. */
export type AllowedTags = ReadonlyMap<string, readonly string[]>

export function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

export function renderMarkdown(markdown: string, options?: { headings?: { ids?: boolean } }): string {
	const render = typeof Bun === "undefined" ? undefined : Bun.markdown?.html
	if (typeof render !== "function") throw new Error("the landing build needs Bun >= 1.4 (Bun.markdown.html is missing)")
	return render(markdown, options)
}

const TAG_PATTERN = /^<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/?>$/
const MAX_TAG_LENGTH = 4096
/** RFC 3986's characters and nothing else: no backslash, whitespace, control character or stray `&`. */
const URL_CHARACTERS = /^[A-Za-z0-9\-._~:/?#[\]@!$'()*+,;=%&]+$/

/** The renderer's own escapes, reversed. A named entity it would never emit (`&Tab;`, `&sol;`) is left
 *  as a literal `&…;` and then fails the character check above — refused, not interpreted. */
function decodeAttribute(value: string): string {
	return value
		.replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_all, dec: string) => String.fromCodePoint(Number(dec)))
		.replaceAll("&quot;", '"')
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&")
}

/** Same-document, same-site, https or mailto — judged on the URL a browser would actually resolve. */
function isSafeHref(raw: string): boolean {
	const href = decodeAttribute(raw)
	if (!URL_CHARACTERS.test(href) || /&[A-Za-z0-9#]+;?/.test(href.replaceAll(/&(?=[A-Za-z0-9_.~-]+=)/g, ""))) return false
	if (href.startsWith("#")) return true
	let url: URL
	try {
		url = new URL(href, SITE)
	} catch {
		return false
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return url.protocol === "https:" || url.protocol === "mailto:"
	return href.startsWith("/") && url.origin === SITE
}

function assertAllowedTag(tagText: string, allowedTags: AllowedTags, label: string): void {
	const match = TAG_PATTERN.exec(tagText)
	const tag = match?.[2] ?? ""
	const allowed = allowedTags.get(tag)
	if (!match || !allowed) throw new Error(`${label}: raw HTML is not allowed (near "${tagText.slice(0, 40)}")`)
	for (const [, name, value] of (match[3] ?? "").matchAll(/([a-z-]+)="([^"]*)"/g)) {
		if (!allowed.includes(name ?? "")) throw new Error(`${label}: attribute "${name}" is not allowed on <${tag}>`)
		if (name === "href" && !isSafeHref(value ?? "")) throw new Error(`${label}: unsupported link target "${value}"`)
	}
}

/**
 * Markdown passes raw HTML through, and Vite bundles a smuggled inline script into an asset the CSP
 * allows, so the check runs on the RENDERED page: the renderer escapes every literal `<` in text, so
 * each remaining `<` starts a tag, which must be allowed, with allowed attributes.
 */
export function assertOnlyAllowedHtml(html: string, allowedTags: AllowedTags, label: string): void {
	for (let at = html.indexOf("<"); at !== -1; at = html.indexOf("<", at + 1)) {
		// Attribute values may not contain `>`, so the first one closes the tag or the tag is refused.
		const end = html.indexOf(">", at)
		const tagText = end === -1 || end - at > MAX_TAG_LENGTH ? html.slice(at, at + 40) : html.slice(at, end + 1)
		assertAllowedTag(tagText, allowedTags, label)
	}
}
