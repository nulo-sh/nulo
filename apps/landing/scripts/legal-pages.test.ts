import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { LEGAL_MANIFEST, parseDocumentHeader, parseVersionHistory } from "@nulo/legal"
import { describe, expect, test } from "vitest"
import type * as LegalPages from "./legal-pages"
import { type LegalSource, type PageVersion, type PageVersions, legalPagePaths, pageVersions } from "./legal-pages"

// The renderer needs `Bun.markdown`, so it runs in Bun as the landing's build does, whichever engine
// runs this file; a throw comes back as an error with the same message.
const MODULE = fileURLToPath(new URL("./legal-pages.ts", import.meta.url))
const BRIDGE = `const pages = await import(process.argv[1])
const { fn, args } = JSON.parse(await Bun.stdin.text())
try { console.log(JSON.stringify({ value: pages[fn](...args) })) } catch (error) { console.log(JSON.stringify({ error: String(error?.message ?? error) })) }`
function inBun<F extends "renderLegalPage" | "planLegalPages">(
	fn: F,
	...args: Parameters<(typeof LegalPages)[F]>
): ReturnType<(typeof LegalPages)[F]> {
	// A sync spawn blocks vitest's own test timeout, so the child gets one.
	const run = spawnSync("bun", ["-e", BRIDGE, MODULE], { input: JSON.stringify({ fn, args }), encoding: "utf8", timeout: 30_000 })
	if (run.status !== 0) throw new Error(`bun exited ${run.status}: ${run.error ?? run.stderr}`)
	const reply = JSON.parse(run.stdout) as { value: ReturnType<(typeof LegalPages)[F]> } | { error: string }
	if ("error" in reply) throw new Error(reply.error)
	return reply.value
}
const renderLegalPage = (...args: Parameters<typeof LegalPages.renderLegalPage>) => inBun("renderLegalPage", ...args)
const planLegalPages = (...args: Parameters<typeof LegalPages.planLegalPages>) => inBun("planLegalPages", ...args)

const v = (version: string, effective: string | null = null): PageVersion => ({ version, effective })
const versions: PageVersions = {
	terms: [v("1.0", "1 January 2027"), v("1.1")],
	privacy: [v("1.0")],
	"website-privacy": [v("1.0", "1 January 2027")],
}
const md = (version: string, body = "Body.", effective = "1 January 2027") =>
	`# Terms of Use\n\n**Version ${version} — effective ${effective}**\n\n## 1. Who we are\n\n${body}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`
const render = (body?: string, effective?: string) =>
	renderLegalPage({ doc: "terms", version: "1.1", markdown: md("1.1", body, effective) }, { permalink: false, versions })

describe("renderLegalPage", () => {
	test("headings get stable ids and tables survive", () => {
		const html = render()
		expect(html).toContain('<h2 id="1-who-we-are">')
		expect(html).toContain("<table>")
	})

	test("links between the documents point at site paths, anchors kept", () => {
		const html = render("See the [policy](privacy.md), [§ 3](terms.md#3-eligibility) and [the notice](website-privacy.md#3).")
		expect(html).toContain('href="/privacy"')
		expect(html).toContain('href="/terms#3-eligibility"')
		expect(html).toContain('href="/website-privacy#3"')
		expect(html).not.toMatch(/href="[^"]*\.md/)
	})

	test("the nav and the footer link every document, the notice after the policy", () => {
		const html = render()
		const nav = html.slice(html.indexOf('<nav aria-label="Legal documents">'), html.indexOf("</nav>"))
		expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/terms", "/privacy", "/website-privacy"])
		expect(html).toContain('<a href="/privacy">privacy</a> · <a href="/website-privacy">website privacy</a> · ')
	})

	test("any other relative link fails the build instead of shipping a 404", () => {
		expect(() => render("[security](../SECURITY.md)")).toThrow(/unsupported link target/)
	})

	test.each([
		["a script tag", "<script>alert(1)</script>"],
		[
			"a tag split across lines, which Vite would bundle into a CSP-legal script",
			'<script\ntype="module">globalThis.pwned=true;</script\n>',
		],
		["an event-handler image", "<img src=x onerror=alert(1)>"],
		["a markdown image", "![logo](https://example.com/x.png)"],
		["an HTML comment", "<!-- hidden -->"],
	])("%s is rejected", (_name, body) => {
		expect(() => render(body)).toThrow(/raw HTML|not allowed/)
	})

	test.each([
		["an inline javascript: link", "[x](javascript:alert(1))"],
		["a reference-style javascript: link", "[click][x]\n\n[x]: javascript:alert(1)"],
		["an entity-encoded scheme", "[x](&#106;avascript:alert(1))"],
		["a protocol-relative link", "[x](//evil.example)"],
		["plain http", "[x](http://example.com)"],
		["a named-entity slash", "[x](/&sol;evil.example)"],
		["an unterminated numeric entity", "[x](/&#47evil.example)"],
	])("%s is rejected", (_name, body) => {
		expect(() => render(body)).toThrow(/unsupported link target/)
	})

	test("a backslash or tab in a link target stays a percent-encoded same-site path", () => {
		expect(render("[x](/\\evil.example)")).toContain('href="/%5Cevil.example"')
		expect(render("[x](/&Tab;/evil.example)")).toContain('href="/%09/evil.example"')
	})

	test("an inherited property name is not an allowed tag", () => {
		expect(() => render("<constructor>x</constructor>")).toThrow(/raw HTML/)
	})

	test("a long but ordinary link is accepted", () => {
		expect(render(`[x](https://example.com/${"a".repeat(900)})`)).toContain("https://example.com/aaa")
	})

	test("a link title is refused rather than rendered, so nothing can be injected through it", () => {
		expect(() => render('[x](https://example.com "«FILL: title»")')).toThrow(/attribute "title" is not allowed/)
	})

	test("autolinks, mailto and inline code are fine", () => {
		const html = render("Write to <mailto:hello@nulo.sh> or see <https://nulo.sh>. Uses `<Flex>` internally.")
		expect(html).toContain('href="mailto:hello@nulo.sh"')
		expect(html).toContain('href="https://nulo.sh"')
		expect(html).toContain("&lt;Flex&gt;")
	})

	test("a document whose version line disagrees with the manifest entry is rejected", () => {
		expect(() => renderLegalPage({ doc: "terms", version: "1.1", markdown: md("1.0") }, { permalink: false, versions })).toThrow(
			/says version 1.0/,
		)
	})

	test("placeholders make the page a draft: banner, noindex, marked fills", () => {
		const html = render("Contact «FILL: provider».", "«FILL: effective date»")
		expect(html).toContain('data-legal-banner="draft"')
		expect(html).toContain('content="noindex"')
		expect(html).toContain('<mark class="legal-fill">«FILL: provider»</mark>')
	})

	test("a final canonical page is indexable and carries no banner", () => {
		const html = render()
		expect(html).not.toContain("data-legal-banner")
		expect(html).not.toContain("noindex")
		expect(html).toContain('<link rel="canonical" href="https://nulo.sh/terms" />')
	})

	test("a superseded permalink says so, links forward, and stays out of the index", () => {
		const html = renderLegalPage({ doc: "terms", version: "1.0", markdown: md("1.0") }, { permalink: true, versions })
		expect(html).toContain('data-legal-banner="superseded"')
		expect(html).toContain("noindex")
		expect(html).toContain('<link rel="canonical" href="https://nulo.sh/terms" />')
	})

	test("lists every version, a missing effective date reading as not yet effective", () => {
		const html = render()
		expect(html).toContain('href="/terms/v1.0/"')
		expect(html).toContain('href="/terms/v1.1/"')
		expect(html).toContain("not yet effective")
	})

	test("an undated version that is no longer the head reads as never in effect", () => {
		const undated = { ...versions, terms: [v("1.0"), v("1.1")] }
		const html = renderLegalPage({ doc: "terms", version: "1.1", markdown: md("1.1") }, { permalink: false, versions: undated })
		expect(html).toContain('<a href="/terms/v1.0/">Version 1.0</a> <span>never in effect</span>')
		expect(html).toContain('<a href="/terms/v1.1/">Version 1.1</a> <span>not yet effective</span>')
	})

	test("ships exactly one script, external, as the CSP requires", () => {
		const scripts = render().match(/<script[^>]*>/g) ?? []
		expect(scripts).toEqual(['<script type="module" src="/src/legal.ts">'])
	})
})

describe("planLegalPages", () => {
	const sources = [
		{ doc: "terms" as const, version: "1.0", markdown: md("1.0") },
		{ doc: "terms" as const, version: "1.1", markdown: md("1.1") },
		{ doc: "privacy" as const, version: "1.0", markdown: md("1.0") },
		{ doc: "website-privacy" as const, version: "1.0", markdown: md("1.0") },
	]

	test("one canonical page per document plus a permalink per version", () => {
		const paths = planLegalPages(sources, versions).map((page) => page.path)
		expect([...paths].sort()).toEqual([...legalPagePaths(versions)].sort())
		expect(paths).toContain("terms/v1.0/index.html")
		expect(paths).toContain("terms.html")
	})

	test("a manifest version without a source is an error", () => {
		expect(() => planLegalPages(sources.slice(1), versions)).toThrow(/terms v1.0: no markdown source/)
	})

	test("the notice is titled, canonical and versioned on its own, beside the wallet documents", () => {
		const pages = planLegalPages(sources, versions)
		const notice = pages.find((page) => page.path === "website-privacy.html")?.html ?? ""
		expect(pages.map((page) => page.path)).toContain("website-privacy/v1.0/index.html")
		expect(notice).toContain("<title>Website Privacy Notice | NULO</title>")
		expect(notice).toContain('<link rel="canonical" href="https://nulo.sh/website-privacy" />')
		expect(notice).toContain('<a href="/website-privacy/v1.0/">Version 1.0</a> <span>1 January 2027</span>')
		expect(notice).not.toContain("noindex")
	})
})

describe("pageVersions", () => {
	const notice = (version: string, effective: string): LegalSource => ({
		doc: "website-privacy",
		version,
		markdown: md(version, "x", effective),
	})

	test("the wallet documents keep the manifest; the notice is dated by each version's own header", () => {
		const derived = pageVersions([notice("1.0", "1 January 2027"), notice("1.1", "«FILL: effective date»")])
		expect(derived.terms).toBe(LEGAL_MANIFEST.terms)
		expect(derived.privacy).toBe(LEGAL_MANIFEST.privacy)
		expect(derived["website-privacy"]).toEqual([v("1.0", "1 January 2027"), v("1.1")])
	})

	test("a notice with no version history is an error, never a site without it", () => {
		expect(() => pageVersions([])).toThrow(/website-privacy: no version history/)
	})
})

describe("the real documents", () => {
	const legalDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../legal")
	const noticeMarkdown = readFileSync(resolve(legalDir, "website-privacy.md"), "utf8")
	const noticeHeader = parseDocumentHeader(noticeMarkdown)
	const shipped = pageVersions([{ doc: "website-privacy", version: noticeHeader.version, markdown: noticeMarkdown }])

	test.each(["terms", "privacy", "website-privacy"] as const)("%s.md renders against the shipped versions", (doc) => {
		const markdown = readFileSync(resolve(legalDir, `${doc}.md`), "utf8")
		const version = /\*\*Version (\S+) /.exec(markdown)?.[1] ?? ""
		const html = renderLegalPage({ doc, version, markdown }, { permalink: false, versions: shipped })
		// External documents may themselves be Markdown files (a linked GitHub PRIVACY.md).
		expect(html).not.toMatch(/href="(?!https:)[^"]*\.md/)
		expect(html.match(/<script/g)).toHaveLength(1)
	})

	test("the notice is not a wallet document, and its history row carries its header's version and date", () => {
		expect(Object.keys(LEGAL_MANIFEST)).not.toContain("website-privacy")
		expect(parseVersionHistory(noticeMarkdown).at(-1)).toBe(noticeHeader.version)
		const row = noticeMarkdown.split("\n").find((line) => line.startsWith(`| ${noticeHeader.version} |`)) ?? ""
		expect(row.split("|")[2]?.trim()).toBe(noticeHeader.effective)
	})
})
