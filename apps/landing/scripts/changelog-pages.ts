/**
 * Renders the changelog: one page per stable release and an index. Each page's top part comes from
 * `content/changelog/X.Y.Z.toml`, its bottom part from `release-notes/X.Y.Z.md`, rendered as the GitHub
 * Release shows it. Pure: file access lives in build-changelog.ts.
 */

import { type Glyph, type GlyphName, glyphs } from "@nulo/design/core/glyphs.ts"
import { type AllowedTags, SITE, assertOnlyAllowedHtml, escapeHtml as esc, renderMarkdown } from "./markdown"

declare const Bun: { TOML?: { parse(text: string): unknown } } | undefined

export interface Change {
	readonly icon: GlyphName
	readonly area: string
	readonly title: string
	readonly line: string
}

export interface Editorial {
	readonly version: string
	readonly date: string
	/** `date` as the page prints it, e.g. `5 November 2026`. */
	readonly dateLabel: string
	readonly title: string
	readonly lede: string
	readonly changes: readonly Change[]
}

export interface Notes {
	/** The first paragraph's inner HTML: the index card's lead line. */
	readonly lead: string
	readonly html: string
}

export interface Release {
	readonly version: string
	readonly editorial: Editorial
	readonly notes: Notes
}

export interface ChangelogSource {
	readonly version: string
	readonly toml: string
	readonly markdown: string
}

export interface ChangelogPage {
	/** Path relative to the landing root, e.g. `changelog/v1.2.0/index.html`. */
	readonly path: string
	readonly html: string
}

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/
const SITE_VERSION = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const EDITORIAL_KEYS = ["version", "date", "title", "lede", "change"]
const CHANGE_KEYS = ["icon", "area", "title", "line"]
const NOTE_TAGS: AllowedTags = new Map(["p", "ul", "ol", "li", "strong", "em", "code"].map((tag) => [tag, []]))

function parts(version: string, pattern = STABLE): [number, number, number, string | undefined] {
	const match = pattern.exec(version)
	if (!match) throw new Error(`changelog: "${version}" is not a version this build reads`)
	return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]]
}

/** Newest first, by numeric version. */
export function byVersionDesc(a: { version: string }, b: { version: string }): number {
	const pa = parts(a.version)
	const pb = parts(b.version)
	return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2]
}

/** A release above the root version is not out yet; a prerelease root (`1.3.0-rc.1`) sits below its own stable. */
export function isDraft(version: string, siteVersion: string): boolean {
	const [major, minor, patch, pre] = parts(siteVersion, SITE_VERSION)
	const order = byVersionDesc({ version }, { version: `${major}.${minor}.${patch}` })
	return order < 0 || (order === 0 && pre !== undefined)
}

function dateLabel(iso: string, label: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
	const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined
	if (!match || !date || date.toISOString().slice(0, 10) !== iso) throw new Error(`${label}: date "${iso}" is not a YYYY-MM-DD day`)
	return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

function table(raw: unknown, keys: readonly string[], label: string): Record<string, unknown> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${label}: expected a table`)
	const unknown = Object.keys(raw).filter((key) => !keys.includes(key))
	if (unknown.length > 0) throw new Error(`${label}: unknown key "${unknown[0]}"`)
	return raw as Record<string, unknown>
}

function text(raw: Record<string, unknown>, key: string, label: string): string {
	const value = raw[key]
	if (typeof value !== "string" || value.trim() === "") throw new Error(`${label}: "${key}" must be a non-empty string`)
	if (value.includes("—")) throw new Error(`${label}: "${key}" holds an em dash`)
	return value
}

function parseChange(raw: unknown, label: string): Change {
	const entry = table(raw, CHANGE_KEYS, label)
	const icon = text(entry, "icon", label)
	if (!Object.hasOwn(glyphs, icon)) throw new Error(`${label}: unknown glyph "${icon}"`)
	return {
		icon: icon as GlyphName,
		area: text(entry, "area", label),
		title: text(entry, "title", label),
		line: text(entry, "line", label),
	}
}

/** The page's top part. Refuses an unknown key, an unknown glyph, an em dash and fewer than three or more than five changes. */
export function parseEditorial(toml: string, version: string): Editorial {
	const label = `content/changelog/${version}.toml`
	const parse = typeof Bun === "undefined" ? undefined : Bun.TOML?.parse
	if (typeof parse !== "function") throw new Error("the landing build needs Bun >= 1.4 (Bun.TOML.parse is missing)")
	let parsed: unknown
	try {
		parsed = parse(toml)
	} catch (error) {
		throw new Error(`${label}: ${(error as Error).message}`)
	}
	const raw = table(parsed, EDITORIAL_KEYS, label)
	if (raw.version !== version) throw new Error(`${label}: the file says version ${String(raw.version)}`)
	const changes = Array.isArray(raw.change) ? raw.change.map((entry, i) => parseChange(entry, `${label} change ${i + 1}`)) : []
	if (changes.length < 3 || changes.length > 5)
		throw new Error(`${label}: the top part holds three to five changes, not ${changes.length}`)
	const date = text(raw, "date", label)
	return { version, date, dateLabel: dateLabel(date, label), title: text(raw, "title", label), lede: text(raw, "lede", label), changes }
}

/** The notes as the GitHub Release shows them: paragraphs, lists and inline emphasis only, opening on a paragraph. */
export function renderNotes(markdown: string, version: string): Notes {
	const label = `release-notes/${version}.md`
	const html = renderMarkdown(markdown)
	assertOnlyAllowedHtml(html, NOTE_TAGS, label)
	// Checked rendered, where `&mdash;` has become the dash too.
	if (html.includes("—")) throw new Error(`${label}: the notes hold an em dash`)
	const leadEnd = html.indexOf("</p>")
	if (!html.startsWith("<p>") || leadEnd === -1) throw new Error(`${label}: the notes open with a lead line`)
	return { lead: html.slice("<p>".length, leadEnd), html }
}

/** Every release needs both files; either alone is refused, so a page is never missing or half-made. */
export function pairSources(
	notes: readonly { version: string; markdown: string }[],
	editorials: readonly { version: string; toml: string }[],
): ChangelogSource[] {
	for (const { version } of editorials) {
		if (!notes.some((n) => n.version === version))
			throw new Error(`content/changelog/${version}.toml has no release-notes/${version}.md`)
	}
	return notes.map(({ version, markdown }) => {
		const editorial = editorials.find((e) => e.version === version)
		if (!editorial) throw new Error(`release-notes/${version}.md has no content/changelog/${version}.toml`)
		return { version, toml: editorial.toml, markdown }
	})
}

const releaseHref = (version: string): string => `/changelog/v${version}/`
const plainText = (html: string): string => html.replace(/<[^>]*>/g, "")

/** A wallet glyph as inline SVG; stroked paths carry `pathLength="1"` so CSS can draw them in. */
function icon(name: GlyphName): string {
	const glyph: Glyph = glyphs[name]
	const strokes = (glyph.s ?? []).map((d) => `<path class="gl-s" pathLength="1" d="${d}"/>`)
	const fills = (glyph.f ?? []).map((d) => `<path class="gl-f" d="${d}"/>`)
	return `<svg class="gl" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${strokes.join("")}${fills.join("")}</svg>`
}

interface ShellOptions {
	readonly title: string
	/** HTML text: entities kept, no tags. A raw HTML block in the notes keeps its literal `"`. */
	readonly description: string
	readonly path: string
	readonly current: "page" | "true"
	readonly indexable: boolean
	readonly body: string
}

function shell(o: ShellOptions): string {
	const description = o.description.replaceAll('"', "&quot;")
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${esc(o.title)}</title>
		<meta name="description" content="${description}" />
		<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0A0908" />
		<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F5F5F7" />
		${o.indexable ? "" : `<meta name="robots" content="noindex" />`}
		<meta property="og:title" content="${esc(o.title)}" />
		<meta property="og:description" content="${description}" />
		<meta property="og:image" content="${SITE}/og.png" />
		<link rel="canonical" href="${SITE}${o.path}" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	</head>
	<body class="cl">
		<a class="skip-link" href="#main">Skip to content</a>
		<pre class="grain" data-feed="grain" data-gain="0.75" data-drift="0.6" aria-hidden="true"></pre>
		<header class="bar">
			<div class="wrap">
				<a class="brand" href="/" aria-label="NULO home"><i aria-hidden="true"></i>NULO</a>
				<nav aria-label="Main navigation">
					<a href="/changelog/" aria-current="${o.current}">Changelog</a>
					<a class="btn" href="/#get">Get Nulo</a>
				</nav>
			</div>
		</header>
		<main id="main">
			${o.body}
		</main>
		<footer>
			<div class="wrap">
				<span>nulo.sh · changelog</span>
				<span><a href="https://github.com/nulo-sh/nulo/releases">releases</a> · <a href="/privacy">privacy</a> · <a href="/website-privacy">website&nbsp;privacy</a> · <a href="/terms">terms</a></span>
			</div>
		</footer>
		<script type="module" src="/src/changelog.ts"></script>
	</body>
</html>
`
}

const two = (n: number): string => String(n).padStart(2, "0")

function hero(r: Release): string {
	const e = r.editorial
	const total = e.changes.length
	const cards = e.changes.map(
		(c, i) => `<li class="k-card plate" style="--i:${i}" data-reveal>
					<div class="k-card__top"><span class="k-icon">${icon(c.icon)}</span><span class="eb">${two(i + 1)} / ${two(total)} · ${esc(c.area)}</span></div>
					<h2>${esc(c.title)}</h2>
					<p>${esc(c.line)}</p>
				</li>`,
	)
	return `<section class="k-hero" aria-labelledby="release-title">
			<div class="wrap">
				<p class="eb"><b>v${esc(r.version)}</b> ${r.editorial.dateLabel}</p>
				<h1 class="k-title" id="release-title"><span class="k-chip">Nulo ${esc(r.version)}</span> ${esc(e.title)}</h1>
				<p class="k-lede">${esc(e.lede)}</p>
			</div>
		</section>
		<section class="k-grid-wrap" aria-label="The changes that matter">
			<div class="wrap"><ul class="k-grid">${cards.join("")}</ul></div>
		</section>`
}

function notesSection(r: Release, newer: Release | undefined, older: Release | undefined): string {
	const v = esc(r.version)
	const pager = [
		older ? `<a href="${releaseHref(older.version)}">Earlier: ${esc(older.version)}</a>` : "",
		newer ? `<a href="${releaseHref(newer.version)}">Later: ${esc(newer.version)}</a>` : "",
		`<a href="/changelog/">All releases</a>`,
	]
	return `<section class="cl-notes" aria-labelledby="notes-title">
			<div class="wrap">
				<p class="eb"><b>Release notes</b> v${v}</p>
				<h2 class="cl-notes__title" id="notes-title">What's new in ${v}</h2>
				<div class="cl-notes__body">${r.notes.html}</div>
				<p class="cl-notes__more"><a href="https://github.com/nulo-sh/nulo/releases/tag/v${v}">Every change on GitHub</a></p>
				<nav class="cl-pager" aria-label="Releases">${pager.filter(Boolean).join("")}</nav>
			</div>
		</section>`
}

function indexBody(releases: readonly Release[]): string {
	const cards = releases.map(
		(r, i) => `<li class="k-card k-card--release plate" style="--i:${i}" data-reveal>
					<a href="${releaseHref(r.version)}">
						<span class="eb"><b>v${esc(r.version)}</b> ${r.editorial.dateLabel}</span>
						<span class="k-release-title">${esc(r.editorial.title)}</span>
						<span class="k-icons">${r.editorial.changes.map((c) => `<span class="k-icon">${icon(c.icon)}</span>`).join("")}</span>
						<span class="k-release-lead">${r.notes.lead}</span>
					</a>
				</li>`,
	)
	return `<section class="k-hero" aria-labelledby="index-title">
			<div class="wrap">
				<p class="eb"><b>Changelog</b> every stable release</p>
				<h1 class="k-title" id="index-title">What changed, release by release.</h1>
			</div>
		</section>
		<section class="k-grid-wrap" aria-label="Releases">
			<div class="wrap"><ul class="k-grid k-grid--index">${cards.join("")}</ul></div>
		</section>`
}

export interface PlanOptions {
	readonly sources: readonly ChangelogSource[]
	/** The root `package.json` version: a release above it is a draft. */
	readonly siteVersion: string
	/** A production build ships no draft, and only its pages are indexable. */
	readonly production: boolean
}

/** The index and one page per release, newest first. */
export function planChangelogPages({ sources, siteVersion, production }: PlanOptions): ChangelogPage[] {
	// Every source is checked, a draft's too, before production leaves the drafts out.
	const releases: Release[] = sources
		.map((s) => ({ version: s.version, editorial: parseEditorial(s.toml, s.version), notes: renderNotes(s.markdown, s.version) }))
		.filter((r) => !(production && isDraft(r.version, siteVersion)))
		.sort(byVersionDesc)
	const index: ChangelogPage = {
		path: "changelog/index.html",
		html: shell({
			title: "Changelog | NULO",
			description: "What changed in each stable release of Nulo.",
			path: "/changelog/",
			current: "page",
			indexable: production,
			body: indexBody(releases),
		}),
	}
	return [
		index,
		...releases.map((r, i) => ({
			path: `changelog/v${r.version}/index.html`,
			html: shell({
				title: `Nulo ${r.version}: ${r.editorial.title.replace(/\.$/, "")} | NULO`,
				description: plainText(r.notes.lead),
				path: releaseHref(r.version),
				current: "true",
				indexable: production,
				body: `${hero(r)}\n\t\t${notesSection(r, releases[i - 1], releases[i + 1])}`,
			}),
		})),
	]
}
