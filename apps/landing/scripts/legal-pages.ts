/**
 * Renders `legal/*.md` into the landing's static pages. Pure: file access lives in build-legal.ts,
 * so the same functions plan the Vite inputs and are unit-tested without touching disk.
 */

import { LEGAL_MANIFEST, type LegalDocument, hasPlaceholders, parseDocumentHeader } from "@nulo/legal"
import { type AllowedTags, SITE, assertOnlyAllowedHtml, escapeHtml, renderMarkdown } from "./markdown"

/**
 * The website's own notice is published like the wallet documents but is no part of `@nulo/legal`, so
 * the wallet never asks anyone to accept it: its versions are its own history table, oldest first.
 */
export type PageDocument = LegalDocument | "website-privacy"

export const LEGAL_DOCUMENTS: readonly PageDocument[] = ["terms", "privacy", "website-privacy"]

const TITLES: Record<PageDocument, string> = {
	terms: "Terms of Use",
	privacy: "Privacy Policy",
	"website-privacy": "Website Privacy Notice",
}

export interface LegalSource {
	readonly doc: PageDocument
	readonly version: string
	readonly markdown: string
}

export interface PageVersion {
	readonly version: string
	/** The effective date as published, or `null` while it is still a placeholder. */
	readonly effective: string | null
}

export type PageVersions = Readonly<Record<PageDocument, readonly PageVersion[]>>

export interface LegalPage {
	/** Path relative to the landing root, e.g. `terms.html` or `terms/v1.0/index.html`. */
	readonly path: string
	readonly html: string
}

/**
 * A wallet document's versions are its manifest entries. The notice's are its sources, one per row of its
 * history table, each dated by its own header.
 */
export function pageVersions(sources: readonly LegalSource[], manifest = LEGAL_MANIFEST): PageVersions {
	const notice = sources
		.filter((source) => source.doc === "website-privacy")
		.map(({ version, markdown }) => ({ version, effective: parseDocumentHeader(markdown).effective }))
	if (notice.length === 0) throw new Error("website-privacy: no version history")
	return { ...manifest, "website-privacy": notice }
}

/** Every page the versions imply: one canonical page per document, one permalink per version. */
export function legalPagePaths(versions: PageVersions): readonly string[] {
	return LEGAL_DOCUMENTS.flatMap((doc) => [`${doc}.html`, ...versions[doc].map((entry) => `${doc}/v${entry.version}/index.html`)])
}

const LEGAL_TAGS: AllowedTags = new Map<string, readonly string[]>([
	["a", ["href"]],
	...["h1", "h2", "h3", "h4"].map((tag): [string, string[]] => [tag, ["id"]]),
	...["th", "td"].map((tag): [string, string[]] => [tag, ["align"]]),
	...["p", "ul", "ol", "li", "strong", "em", "code", "pre", "blockquote", "table", "thead", "tbody", "tr", "hr", "br", "del"].map(
		(tag): [string, string[]] => [tag, []],
	),
])

const DOCUMENT_LINK = new RegExp(`\\]\\((${LEGAL_DOCUMENTS.join("|")})\\.md(#[^)]*)?\\)`, "g")

/** `](terms.md#x)` → `](/terms#x)`. Whatever else a link points at is judged after rendering. */
function rewriteLinks(markdown: string): string {
	return markdown.replace(DOCUMENT_LINK, (_all, doc: string, hash?: string) => `](/${doc}${hash ?? ""})`)
}

/** Placeholders are marked in text only; a tag's attributes are never rewritten. */
function markPlaceholders(html: string): string {
	return html
		.split(/(<[^>]*>)/)
		.map((part) => (part.startsWith("<") ? part : part.replace(/«FILL:[^»]*»/g, (fill) => `<mark class="legal-fill">${fill}</mark>`)))
		.join("")
}

function banner(kind: "draft" | "superseded", doc: PageDocument): string {
	if (kind === "draft") {
		return `<p class="legal-banner" data-legal-banner="draft"><b>Draft.</b> This document still contains unfilled placeholders and is not yet in effect.</p>`
	}
	return `<p class="legal-banner" data-legal-banner="superseded"><b>Superseded.</b> This is an earlier version, kept so you can read what you accepted. <a href="/${doc}">Read the current ${TITLES[doc]}</a>.</p>`
}

function versionList(doc: PageDocument, versions: PageVersions): string {
	const head = versions[doc].at(-1)
	// An undated version that is no longer the head was replaced before it ever took effect.
	const undated = (entry: PageVersion) => (entry === head ? "not yet effective" : "never in effect")
	const items = [...versions[doc]]
		.reverse()
		.map(
			(entry) =>
				`<li><a href="/${doc}/v${entry.version}/">Version ${escapeHtml(entry.version)}</a> <span>${escapeHtml(entry.effective ?? undated(entry))}</span></li>`,
		)
	return `<nav class="legal-versions" aria-label="All versions"><h2>All versions</h2><ul>${items.join("")}</ul></nav>`
}

interface RenderOptions {
	readonly permalink: boolean
	readonly versions: PageVersions
}

export function renderLegalPage(source: LegalSource, options: RenderOptions): string {
	const { versions } = options
	const { doc, version, markdown } = source
	const label = `${doc} v${version}`
	const header = parseDocumentHeader(markdown)
	if (header.version !== version) throw new Error(`${label}: the document says version ${header.version}`)

	const head = versions[doc][versions[doc].length - 1]
	const superseded = head?.version !== version
	const draft = hasPlaceholders(markdown)
	const rendered = renderMarkdown(rewriteLinks(markdown), { headings: { ids: true } })
	assertOnlyAllowedHtml(rendered, LEGAL_TAGS, label)
	const body = markPlaceholders(rendered)
	const banners = [draft ? banner("draft", doc) : "", superseded ? banner("superseded", doc) : ""].join("")
	// Only the canonical, final page is indexable: permalinks duplicate it and drafts are not in effect.
	const robots = draft || options.permalink ? `<meta name="robots" content="noindex" />` : ""
	const title = `${TITLES[doc]} | NULO`

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${title}</title>
		<meta name="description" content="Nulo ${TITLES[doc]}, version ${escapeHtml(version)}." />
		<meta name="theme-color" content="#0A0908" />
		${robots}
		<link rel="canonical" href="${SITE}/${doc}" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	</head>
	<body class="legal-page">
		<a class="skip-link" href="#main">Skip to content</a>
		<header class="bar">
			<div class="wrap">
				<a class="brand" href="/" aria-label="NULO home"><i aria-hidden="true"></i>NULO</a>
				<nav aria-label="Legal documents">
					<a href="/terms">Terms</a>
					<a href="/privacy">Privacy</a>
					<a href="/website-privacy">Website privacy</a>
				</nav>
			</div>
		</header>
		<main id="main" class="wrap legal" data-legal-doc="${doc}" data-legal-version="${escapeHtml(version)}">
			${banners}
			<article class="legal-body">${body}</article>
			${versionList(doc, versions)}
		</main>
		<footer>
			<div class="wrap">
				<span>nulo.sh</span>
				<span><a href="/terms">terms</a> · <a href="/privacy">privacy</a> · <a href="/website-privacy">website privacy</a> · <a href="https://github.com/nulo-sh/nulo">github</a></span>
			</div>
		</footer>
		<script type="module" src="/src/legal.ts"></script>
	</body>
</html>
`
}

/**
 * `sources` must hold exactly one markdown per version. The head version renders twice: at the
 * canonical path and at its permalink, which is what an installed wallet links to.
 */
export function planLegalPages(sources: readonly LegalSource[], versions: PageVersions): readonly LegalPage[] {
	return LEGAL_DOCUMENTS.flatMap((doc) => {
		const head = versions[doc][versions[doc].length - 1]
		return versions[doc].flatMap((entry) => {
			const source = sources.find((candidate) => candidate.doc === doc && candidate.version === entry.version)
			if (!source) throw new Error(`${doc} v${entry.version}: no markdown source`)
			const permalink = { path: `${doc}/v${entry.version}/index.html`, html: renderLegalPage(source, { permalink: true, versions }) }
			if (entry !== head) return [permalink]
			return [{ path: `${doc}.html`, html: renderLegalPage(source, { permalink: false, versions }) }, permalink]
		})
	})
}
