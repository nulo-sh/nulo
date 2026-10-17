/** jsdom applies no CSS modules, so the detail pages' shared look is pinned in their sources. */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const PAGES = ["tx/[id].vue", "received/[id].vue", "journal/[id].vue"]

/** The `<style module>` rule bodies of `path`, keyed by selector, whitespace collapsed. */
function rules(path: string): Map<string, string> {
	const source = readFileSync(resolve(__dirname, path), "utf8")
	const tag = "<style module>"
	const style = source.slice(source.indexOf(tag) + tag.length).replace(/\/\*[\s\S]*?\*\//g, "")
	const out = new Map<string, string>()
	for (const [, selector, body] of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		out.set(selector.trim(), body.replace(/\s+/g, " ").trim())
	}
	return out
}

describe("the detail pages share one look", () => {
	test.each(PAGES)("%s: its scroller and its content are the shared ones, with no spacing of their own", (page) => {
		const r = rules(page)
		expect(r.get(".wrapper")).toBe('composes: wrapper from "../detail-page.module.css";')
		expect(r.get(".content")).toBe('composes: content from "../detail-page.module.css";')
	})

	test.each([...PAGES, "../components/modules/tx/TxHashRow.vue"])(
		"%s: a link in Details takes the value's colour, never one of its own",
		(path) => {
			const links = [...rules(path)].filter(([, body]) => /composes: [^;]*\bdetail_link\b/.test(body))
			expect(links.length).toBeGreaterThan(0)
			for (const [selector, body] of links) expect(body, selector).not.toMatch(/(^|;\s*)color:/)
		},
	)

	test("a Details link underlines on hover only, so the dark accent is never its sole cue", () => {
		const shared = readFileSync(resolve(__dirname, "detail-page.module.css"), "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\s+/g, " ")
		expect(shared).toContain(
			".detail_link { text-decoration: none; cursor: pointer; transition: color 0.2s var(--bezier); &:hover { color: var(--nulo-accent); text-decoration: underline; } }",
		)
	})

	test.each(["tx/[id].vue", "journal/[id].vue"])(
		"%s: its App row's label and value are the shared ones, with no rule of their own",
		(page) => {
			const r = rules(page)
			expect(r.get(".app_key")).toBe('composes: app_key from "../detail-page.module.css";')
			expect(r.get(".app_value")).toBe('composes: app_value from "../detail-page.module.css";')
		},
	)

	test("journal: the To link draws as the shared mono value, as the Tx hash link does", () => {
		expect(rules("journal/[id].vue").get(".recipient_link")).toBe(
			'composes: detail_value_mono from "../detail-page.module.css"; composes: detail_link from "../detail-page.module.css";',
		)
	})
})
