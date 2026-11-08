import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import type * as Changelog from "./changelog-pages"
import { byVersionDesc, isDraft, pairSources } from "./changelog-pages"
import { bunCaller } from "./in-bun"

// The parsers need `Bun.TOML` and `Bun.markdown`, so they run in Bun as the landing's build does.
const inBun = bunCaller<typeof Changelog>(new URL("./changelog-pages.ts", import.meta.url))
const parseEditorial = (...args: Parameters<typeof Changelog.parseEditorial>) => inBun("parseEditorial", ...args)
const renderNotes = (...args: Parameters<typeof Changelog.renderNotes>) => inBun("renderNotes", ...args)
const plan = (...args: Parameters<typeof Changelog.planChangelogPages>) => inBun("planChangelogPages", ...args)

const change = (n: number) => `[[change]]\nicon = "send"\narea = "Area ${n}"\ntitle = "Title ${n}"\nline = "Line ${n}."\n`
const toml = (version = "1.2.0", changes = 5) =>
	`version = "${version}"\ndate = "2026-11-05"\ntitle = "A title."\nlede = "A lede."\n\n${Array.from({ length: changes }, (_, i) => change(i + 1)).join("\n")}`
const NOTES = "The lead line.\n\n- One.\n- **Two** with `code`.\n"
const source = (version: string, editorial = toml(version)) => ({ version, toml: editorial, markdown: NOTES })
const NOINDEX = '<meta name="robots" content="noindex" />'

describe("parseEditorial", () => {
	test("reads the top part, the date as the page prints it", () => {
		const editorial = parseEditorial(toml(), "1.2.0")
		expect(editorial).toMatchObject({ version: "1.2.0", dateLabel: "5 November 2026", title: "A title.", lede: "A lede." })
		expect(editorial.changes).toHaveLength(5)
		expect(editorial.changes[0]).toEqual({ icon: "send", area: "Area 1", title: "Title 1", line: "Line 1." })
	})

	test.each([
		["an em dash", toml().replace("A title.", "A title — and more."), /"title" holds an em dash/],
		["an unknown glyph", toml().replace('icon = "send"', 'icon = "rocket"'), /unknown glyph "rocket"/],
		["an inherited property as a glyph", toml().replace('icon = "send"', 'icon = "constructor"'), /unknown glyph "constructor"/],
		["two changes in a minor release", toml("1.2.0", 2), /three to five changes, not 2/],
		["six changes", toml("1.2.0", 6), /three to five changes, not 6/],
		["an unknown table", `${toml()}\n[scene]\ncaption = "Five blocks."\n`, /unknown key "scene"/],
		[
			"an unknown key on a change",
			toml().replace('line = "Line 1."', 'line = "Line 1."\nfigure = "3"'),
			/change 1: unknown key "figure"/,
		],
		["another version", toml("1.1.0"), /says version 1.1.0/],
		["a day that does not exist", toml().replace("2026-11-05", "2026-02-30"), /date "2026-02-30" is not a YYYY-MM-DD day/],
		["an empty title", toml().replace('"A title."', '""'), /"title" must be a non-empty string/],
		["a TOML syntax error, naming the file", toml().replace('"A title."', '"A title.'), /content\/changelog\/1\.2\.0\.toml: .*TOML/],
	])("refuses %s", (_name, file, message) => {
		expect(() => parseEditorial(file, "1.2.0")).toThrow(message)
	})

	test.each([
		["one change", 1],
		["two changes", 2],
		["five changes", 5],
	])("reads a patch release with %s", (_name, count) => {
		expect(parseEditorial(toml("1.2.1", count), "1.2.1").changes).toHaveLength(count)
	})

	test.each([
		["a patch release with no change", "1.2.1", 0, /a patch release's top part holds one to five changes, not 0/],
		["a patch release with six changes", "1.2.1", 6, /a patch release's top part holds one to five changes, not 6/],
		["two changes in a major release", "2.0.0", 2, /three to five changes, not 2/],
	])("refuses %s", (_name, version, count, message) => {
		expect(() => parseEditorial(toml(version, count), version)).toThrow(message)
	})
})

describe("renderNotes", () => {
	test("renders paragraphs, lists and inline emphasis; the first paragraph is the lead line", () => {
		const notes = renderNotes(NOTES, "1.2.0")
		expect(notes.lead).toBe("The lead line.")
		expect(notes.html).toContain("<li><strong>Two</strong> with <code>code</code>.</li>")
	})

	test("markdown text keeps its ampersands, quotes and decoded references", () => {
		expect(renderNotes('R&D, "quoted" &amp; &copy; text.\n', "1.2.0").lead).toBe("R&amp;D, &quot;quoted&quot; &amp; © text.")
	})

	test.each([
		["a link", "Lead.\n\n- See [the site](https://nulo.sh).\n", /raw HTML is not allowed/],
		["an image", "Lead.\n\n![logo](/og.png)\n", /raw HTML is not allowed/],
		[
			"a module script split across lines, which Vite would bundle into a CSP-legal file",
			'Lead.\n\n<script\ntype="module">globalThis.pwned=true;</script\n>\n',
			/raw HTML is not allowed/,
		],
		["an attribute on an allowed tag", 'Lead.\n\n<p class="x">Hi.</p>\n', /attribute "class" is not allowed on <p>/],
		["a heading", "# What's new\n\nLead.\n", /raw HTML is not allowed/],
		["notes that open on a list", "- One.\n- Two.\n", /open with a lead line/],
		["an em dash", "Lead — and more.\n", /em dash/],
		["an em dash written as an entity", "Lead &mdash; and more.\n", /em dash/],
		["an em dash as an entity in a raw HTML block", "<p>Lead &#x2014; more.</p>\n", /character reference/],
		["a numeric reference with no semicolon in a raw HTML block", "<p>Lead &#8212 more.</p>\n", /character reference/],
		["a lead paragraph left open", "<p>Lead.\n\n- One.\n", /open with a lead line/],
	])("refuses %s", (_name, markdown, message) => {
		expect(() => renderNotes(markdown, "1.2.0")).toThrow(message)
	})
})

describe("pairSources", () => {
	const notes = [{ version: "1.2.0", markdown: NOTES }]

	test("pairs each release's two files", () => {
		expect(pairSources(notes, [{ version: "1.2.0", toml: "t" }])).toEqual([{ version: "1.2.0", toml: "t", markdown: NOTES }])
	})

	test("refuses notes without their editorial file, and an editorial file without its notes", () => {
		expect(() => pairSources(notes, [])).toThrow("release-notes/1.2.0.md has no content/changelog/1.2.0.toml")
		expect(() =>
			pairSources(notes, [
				{ version: "1.2.0", toml: "t" },
				{ version: "1.3.0", toml: "t" },
			]),
		).toThrow("content/changelog/1.3.0.toml has no release-notes/1.3.0.md")
	})
})

describe("the version gate", () => {
	const sources = [source("1.2.0"), source("1.3.0")]
	const page = (pages: Changelog.ChangelogPage[], path: string) => pages.find((p) => p.path === path)?.html ?? ""

	test("orders numerically, and a prerelease root sits below its own stable", () => {
		expect(["1.9.0", "1.10.0", "1.2.0"].map((version) => ({ version })).sort(byVersionDesc)).toEqual(
			["1.10.0", "1.9.0", "1.2.0"].map((version) => ({ version })),
		)
		expect([isDraft("1.10.0", "1.9.0"), isDraft("1.9.0", "1.10.0"), isDraft("1.3.0", "1.3.0")]).toEqual([true, false, false])
		expect([isDraft("1.3.0", "1.3.0-rc.1"), isDraft("1.2.0", "1.3.0-rc.1")]).toEqual([true, false])
	})

	test("production ships no draft: no page, no index card, no pager link; its pages are indexable", () => {
		const pages = plan({ sources, siteVersion: "1.2.0", production: true })
		expect(pages.map((p) => p.path)).toEqual(["changelog/index.html", "changelog/v1.2.0/index.html"])
		expect(pages.map((p) => p.html).join("")).not.toContain("1.3.0")
		for (const p of pages) expect(p.html).not.toContain(NOINDEX)
	})

	test.each([
		["a draft", "1.2.0"],
		["the Release PR, whose root already names the new version", "1.3.0"],
	])("any other build renders %s, and every page is noindex", (_name, siteVersion) => {
		const pages = plan({ sources, siteVersion, production: false })
		expect(pages.map((p) => p.path)).toEqual(["changelog/index.html", "changelog/v1.3.0/index.html", "changelog/v1.2.0/index.html"])
		for (const p of pages) expect(p.html).toContain(NOINDEX)
		expect(page(pages, "changelog/v1.2.0/index.html")).toContain('<a href="/changelog/v1.3.0/">Later: 1.3.0</a>')
	})
})

describe("the pages", () => {
	const pages = plan({ sources: [source("1.1.0"), source("1.2.0")], siteVersion: "1.2.0", production: true })
	const [index = "", latest = "", earlier = ""] = pages.map((p) => p.html)

	test("a release page: one external module script, its canonical URL, five numbered cards, the notes", () => {
		expect(latest.split("<script").length - 1).toBe(1)
		expect(latest).toContain('<script type="module" src="/src/changelog.ts"></script>')
		expect(latest).toContain('<link rel="canonical" href="https://nulo.sh/changelog/v1.2.0/" />')
		expect(latest).toContain("<title>Nulo 1.2.0: A title | NULO</title>")
		expect([...latest.matchAll(/<span class="eb">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(
			[1, 2, 3, 4, 5].map((n) => `0${n} / 05 · Area ${n}`),
		)
		expect(latest).toContain("What's new in 1.2.0</h2>")
		expect(latest).toContain('href="https://github.com/nulo-sh/nulo/releases/tag/v1.2.0"')
		expect(latest).toContain('<a href="/changelog/v1.1.0/">Earlier: 1.1.0</a>')
		expect(earlier).toContain('<a href="/changelog/v1.2.0/">Later: 1.2.0</a>')
	})

	test("the index: one card per release, newest first, each with its lead line", () => {
		expect([...index.matchAll(/<a href="(\/changelog\/v[^"]+)">/g)].map((m) => m[1])).toEqual([
			"/changelog/v1.2.0/",
			"/changelog/v1.1.0/",
		])
		expect(index.match(/<span class="k-release-lead">The lead line\.<\/span>/g)).toHaveLength(2)
	})

	test("the description is the lead line as plain text", () => {
		const markdown = "A **bold** `lead` & more.\n\n- One.\n"
		const [, html = ""] = plan({ sources: [{ ...source("1.2.0"), markdown }], siteVersion: "1.2.0", production: true }).map(
			(p) => p.html,
		)
		expect(html).toContain('<meta name="description" content="A bold lead &amp; more." />')
	})

	test("a quote in a raw HTML lead stays inside the description attribute", () => {
		const markdown = '<p>0;url=https://example.invalid/" http-equiv="refresh</p>\n\n- One.\n'
		const [, html = ""] = plan({ sources: [{ ...source("1.2.0"), markdown }], siteVersion: "1.2.0", production: true }).map(
			(p) => p.html,
		)
		expect(html).toContain('<meta name="description" content="0;url=https://example.invalid/&quot; http-equiv=&quot;refresh" />')
		expect(html).not.toMatch(/<meta[^>]*" http-equiv="refresh/)
	})

	test("editorial text is escaped, never markup", () => {
		const [, html = ""] = plan({
			sources: [source("1.2.0", toml().replace("A title.", "<b>Bold</b>"))],
			siteVersion: "1.2.0",
			production: true,
		}).map((p) => p.html)
		expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;")
		expect(html).not.toContain("<b>Bold")
	})
})

describe("the real files", () => {
	const repo = fileURLToPath(new URL("../../../", import.meta.url))
	const read = (dir: string, extension: string) =>
		readdirSync(resolve(repo, dir))
			.filter((file) => /^\d+\.\d+\.\d+\./.test(file) && file.endsWith(extension))
			.map((file) => ({ version: file.slice(0, -extension.length), text: readFileSync(resolve(repo, dir, file), "utf8") }))
	const notes = read("release-notes", ".md").map(({ version, text }) => ({ version, markdown: text }))
	const editorials = read("apps/landing/content/changelog", ".toml").map(({ version, text }) => ({ version, toml: text }))
	const siteVersion: string = JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8")).version

	test.each([true, false])("every release pairs and renders, with no em dash anywhere (production %s)", (production) => {
		const pages = plan({ sources: pairSources(notes, editorials), siteVersion, production })
		expect(pages.length).toBeGreaterThan(1)
		for (const page of pages) expect(page.html, page.path).not.toContain("—")
	})
})
