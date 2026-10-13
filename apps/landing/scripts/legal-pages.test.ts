import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { LegalDocument, LegalVersion } from "@nulo/legal"
import { describe, expect, test } from "vitest"
import type * as LegalPages from "./legal-pages"
import { legalPagePaths } from "./legal-pages"

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

const v = (version: string, effective: string | null = null): LegalVersion => ({ version, effective, material: true, changes: ["x"] })
const manifest: Record<LegalDocument, readonly LegalVersion[]> = { terms: [v("1.0", "1 January 2027"), v("1.1")], privacy: [v("1.0")] }
const md = (version: string, body = "Body.", effective = "1 January 2027") =>
	`# Terms of Use\n\n**Version ${version} — effective ${effective}**\n\n## 1. Who we are\n\n${body}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`
const render = (body?: string, effective?: string) =>
	renderLegalPage({ doc: "terms", version: "1.1", markdown: md("1.1", body, effective) }, { permalink: false, manifest })

describe("renderLegalPage", () => {
	test("headings get stable ids and tables survive", () => {
		const html = render()
		expect(html).toContain('<h2 id="1-who-we-are">')
		expect(html).toContain("<table>")
	})

	test("links between the documents point at site paths, anchors kept", () => {
		const html = render("See the [policy](privacy.md) and [§ 3](terms.md#3-eligibility).")
		expect(html).toContain('href="/privacy"')
		expect(html).toContain('href="/terms#3-eligibility"')
		expect(html).not.toMatch(/href="[^"]*\.md/)
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
		expect(() => renderLegalPage({ doc: "terms", version: "1.1", markdown: md("1.0") }, { permalink: false, manifest })).toThrow(
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
		const html = renderLegalPage({ doc: "terms", version: "1.0", markdown: md("1.0") }, { permalink: true, manifest })
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
	]

	test("one canonical page per document plus a permalink per version", () => {
		const paths = planLegalPages(sources, manifest).map((page) => page.path)
		expect([...paths].sort()).toEqual([...legalPagePaths(manifest)].sort())
		expect(paths).toContain("terms/v1.0/index.html")
		expect(paths).toContain("terms.html")
	})

	test("a manifest version without a source is an error", () => {
		expect(() => planLegalPages(sources.slice(1), manifest)).toThrow(/terms v1.0: no markdown source/)
	})
})

describe("the real documents", () => {
	const legalDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../legal")

	test.each(["terms", "privacy"] as const)("%s.md renders against the shipped manifest", (doc) => {
		const markdown = readFileSync(resolve(legalDir, `${doc}.md`), "utf8")
		const version = /\*\*Version (\S+) /.exec(markdown)?.[1] ?? ""
		const html = renderLegalPage({ doc, version, markdown }, { permalink: false })
		// External documents may themselves be Markdown files (a linked GitHub PRIVACY.md).
		expect(html).not.toMatch(/href="(?!https:)[^"]*\.md/)
		expect(html.match(/<script/g)).toHaveLength(1)
	})
})
