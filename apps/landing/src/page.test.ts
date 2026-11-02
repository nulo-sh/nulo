import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { STORES } from "./install"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const source = (page: string) => readFileSync(resolve(ROOT, page), "utf8")

type Attrs = Record<string, string>

function attrs(raw: string): Attrs {
	const out: Attrs = {}
	for (const m of raw.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) out[m[1] as string] = m[2] ?? ""
	return out
}

const startTags = (html: string, tag: string): Attrs[] =>
	[...html.matchAll(new RegExp(`<${tag}\\b([^>]*?)/?>`, "gi"))].map((m) => attrs(m[1] as string))

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\s([.,;])/g, "$1")
		.trim()

/** The markup between the start tag carrying `marker` and its matching end tag, for elements that do not nest. */
function element(html: string, tag: string, marker: string): string {
	const at = html.indexOf(marker)
	const start = html.lastIndexOf(`<${tag}`, at)
	const end = html.indexOf(`</${tag}>`, at)
	if (at === -1 || start === -1 || end === -1) throw new Error(`no <${tag}> with ${marker}`)
	return html.slice(start, end + tag.length + 3)
}

const forms = (html: string) => [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0])

const LABEL = "Get updates by email"
const SUBMIT = "Subscribe"
const PRINT = "Occasional updates. Unsubscribe in one click. Resend sends them for us; see the website privacy notice."

describe("the signup forms on the home page", () => {
	const html = source("index.html")
	const hero = element(html, "form", 'for="email-hero"')
	const get = element(html, "form", 'for="email-get"')

	it("are the page's only two forms, each a plain post to /api/subscribe so they work without script", () => {
		expect(forms(html)).toEqual([hero, get])
		for (const form of [hero, get]) {
			const [tag] = startTags(form, "form")
			expect(tag).toMatchObject({ method: "post", action: "/api/subscribe" })
			expect(tag).toHaveProperty("data-signup")
		}
	})

	it("sit in the hero and in #get, the hero's first", () => {
		expect(element(html, "section", 'class="hero"')).toContain(hero)
		expect(element(html, "section", 'id="get"')).toContain(get)
	})

	it.each([
		["hero", "email-hero"],
		["get", "email-get"],
	])("%s: labels an email field with the copy, and submits with one Subscribe button", (_where, id) => {
		const form = id === "email-hero" ? hero : get
		const email = startTags(form, "input").filter((a) => a.name === "email")
		expect(email).toEqual([
			expect.objectContaining({
				id,
				type: "email",
				autocomplete: "email",
				maxlength: "254",
				required: "",
				placeholder: "you@example.com",
			}),
		])
		expect(text(element(form, "label", `for="${id}"`))).toBe(LABEL)
		const buttons = startTags(form, "button")
		expect(buttons).toEqual([expect.objectContaining({ type: "submit" })])
		expect(text(element(form, "button", 'type="submit"'))).toBe(SUBMIT)
		const [status] = startTags(form, "p").filter((a) => "data-signup-status" in a)
		expect(status).toMatchObject({ role: "status" })
		expect(text(element(form, "p", "data-signup-status"))).toBe("")
	})

	it("each carry a honeypot named website, out of the Tab order and hidden from assistive tech", () => {
		for (const form of [hero, get]) {
			const traps = startTags(form, "input").filter((a) => a.name === "website")
			expect(traps).toEqual([expect.objectContaining({ type: "text", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" })])
			expect(element(form, "div", 'class="signup__trap"')).toMatch(/^<div class="signup__trap" aria-hidden="true">/)
			// Nothing else in the form is taken out of the Tab order or given a place in it.
			expect(startTags(form, "input").filter((a) => a.name !== "website" && "tabindex" in a)).toEqual([])
		}
	})

	it("hero: no availability line and no small print, with nothing about Resend or the privacy notice", () => {
		expect(hero).not.toMatch(/signup__avail|signup__print|Available/)
		expect(hero).not.toMatch(/Resend|privacy/i)
		expect(startTags(hero, "input").find((a) => a.name === "email")).not.toHaveProperty("aria-describedby")
	})

	it("#get: no availability line, and the small print linking the website privacy notice", () => {
		expect(get).not.toMatch(/signup__avail|Available/)
		const print = element(get, "p", 'id="print-get"')
		expect(text(print)).toBe(PRINT)
		expect(startTags(print, "a")).toEqual([{ href: "/website-privacy" }])
		expect(startTags(get, "input").find((a) => a.name === "email")?.["aria-describedby"]).toBe("print-get")
	})

	it("every aria-describedby names an element of its own form", () => {
		for (const form of [hero, get]) {
			const ids = new Set(startTags(form, "[a-z]+").map((a) => a.id))
			for (const tokens of startTags(form, "[a-z]+").flatMap((a) => a["aria-describedby"] ?? [])) {
				for (const id of tokens.split(/\s+/)) expect(ids).toContain(id)
			}
		}
	})

	it("no em dash joins two clauses in the new copy", () => {
		for (const form of [hero, get]) expect(text(form)).not.toContain("—")
	})
})

describe("the install links on the home page", () => {
	const html = source("index.html")
	const blocks = { hero: element(html, "section", 'class="hero"'), get: element(html, "section", 'id="get"') }

	// `mountInstall` narrows exactly these: the primary becomes the detected store, the secondary and
	// the fallback hide, and the detected span with its other-store link shows.
	it.each(Object.entries(blocks))("%s: both stores, the hidden other-store line and the fallback line", (_where, block) => {
		const links = startTags(block, "a").filter((a) => Object.keys(a).some((k) => k.startsWith("data-install")))
		expect(links).toEqual([
			{ class: "btn", "data-install": "primary", href: STORES.chrome.url },
			{ class: "btn", "data-install": "secondary", href: STORES.firefox.url },
			{ "data-install-other": "", href: STORES.firefox.url },
		])
		expect(text(element(block, "a", 'data-install="primary"'))).toBe("Chrome Web Store")
		expect(text(element(block, "a", 'data-install="secondary"'))).toBe("Firefox Add-ons")
		const detected = element(block, "span", "data-install-detected")
		expect(startTags(detected, "span")).toEqual([{ "data-install-detected": "", hidden: "" }])
		expect(text(detected)).toBe("· about 30 seconds · also on Firefox")
		const fallback = element(block, "span", "data-install-fallback")
		expect(startTags(fallback, "span")).toEqual([{ "data-install-fallback": "" }])
		expect(text(fallback)).toBe("· Nulo runs on desktop Chrome or Firefox")
	})

	it("hero: the signup form comes after the store links", () => {
		const secondary = blocks.hero.indexOf('data-install="secondary"')
		expect(secondary).toBeGreaterThan(-1)
		expect(blocks.hero.indexOf("<form")).toBeGreaterThan(secondary)
	})

	it("nothing else on the page carries an install attribute", () => {
		expect(html.match(/data-install/g)).toHaveLength(11)
		expect(source("how-aztec-works.html").match(/data-install/g)).toHaveLength(1)
	})
})

describe.each([
	["index.html", "#get"],
	["how-aztec-works.html", "/#get"],
])("%s", (page, navTarget) => {
	const html = source(page)

	it(`the nav's button is the install link, served as Get Nulo to ${navTarget}`, () => {
		const nav = element(html, "nav", 'aria-label="Main navigation"')
		const button = startTags(nav, "a").filter((a) => a.class === "btn")
		expect(button).toEqual([{ class: "btn", "data-install": "nav", href: navTarget }])
		expect(text(element(nav, "a", 'class="btn"'))).toBe("Get Nulo")
		expect(html).not.toMatch(/Notify me|Coming soon/)
	})
})

describe.each(["index.html", "how-aztec-works.html", "subscribed.html"])("%s footer", (page) => {
	it("links the website privacy notice beside the wallet's privacy policy and terms", () => {
		const footer = element(source(page), "footer", "<footer")
		const links = startTags(footer, "a").map((a) => a.href)
		expect(links).toEqual(expect.arrayContaining(["/privacy", "/website-privacy", "/terms"]))
		expect(text(element(footer, "a", 'href="/website-privacy"'))).toBe("website privacy")
	})
})

describe("the built site", () => {
	const OUT = resolve(ROOT, `node_modules/.cache/page-test-${process.pid}`)
	const files = (ext: string) =>
		readdirSync(OUT, { recursive: true, encoding: "utf8" })
			.filter((f) => f.endsWith(ext))
			.map((f) => join(OUT, f))

	// The production build's two steps, the legal pages first so the scan covers them too; a sync
	// spawn blocks vitest's own timeout, so each child gets one.
	beforeAll(() => {
		for (const args of [
			["scripts/build-legal.ts"],
			["--bun", "./node_modules/.bin/vite", "build", "--outDir", OUT, "--emptyOutDir", "--logLevel", "error"],
		]) {
			const run = spawnSync("bun", args, { cwd: ROOT, encoding: "utf8", timeout: 120_000 })
			if (run.status !== 0) throw new Error(`bun ${args[0]} exited ${run.status}: ${run.error ?? run.stderr}`)
		}
	}, 250_000)

	afterAll(() => rmSync(OUT, { recursive: true, force: true }))

	it("serves /subscribed: the no-script landing of a form post, unindexed, with a way back", () => {
		const html = readFileSync(join(OUT, "subscribed.html"), "utf8")
		const main = element(html, "main", "<main")
		expect(text(main)).toBe("You're on the list. We'll send occasional updates. Back to nulo.sh")
		expect(startTags(main, "a")).toEqual([expect.objectContaining({ href: "/" })])
		expect(startTags(html, "meta")).toContainEqual({ name: "robots", content: "noindex" })
		expect(text(main)).not.toContain("—")
	})

	it("loads nothing from another origin: every resource reference in the HTML is this site's", () => {
		const pages = files(".html")
		for (const page of ["index.html", "how-aztec-works.html", "subscribed.html", "terms.html", "privacy.html"]) {
			expect(pages).toContain(join(OUT, page))
		}
		for (const file of pages) {
			const html = readFileSync(file, "utf8")
			const refs = [
				...["script", "img", "audio", "video", "source", "track", "iframe", "embed", "object"].flatMap((tag) =>
					startTags(html, tag).flatMap((a) => [a.src, a.srcset, a.poster, a.data]),
				),
				...startTags(html, "link").map((a) => a.href),
				...startTags(html, "form").map((a) => a.action),
				...startTags(html, "button").map((a) => a.formaction),
			].filter((v): v is string => v !== undefined)
			const metas = startTags(html, "meta")
				.map((a) => a.content ?? "")
				.filter((content) => /^[a-z][\w+.-]*:\/\//i.test(content))
			for (const ref of [...refs, ...metas]) expect(ref, file).toMatch(/^(\/(?!\/)|https:\/\/nulo\.sh\/)/)
		}
	})

	it("loads nothing from another origin: the CSS refers only to its own files", () => {
		for (const file of files(".css")) {
			const css = readFileSync(file, "utf8")
			expect(css).not.toMatch(/@import/)
			for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/g)) expect(m[1], file).toMatch(/^(\/(?!\/)|data:)/)
		}
	})

	it("loads nothing from another origin: the only absolute URLs in the JS are store links and the SVG namespace", () => {
		const allowed = new Set(["http://www.w3.org/2000/svg", STORES.chrome.url, STORES.firefox.url])
		for (const file of files(".js")) {
			for (const m of readFileSync(file, "utf8").matchAll(/(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)\\]*/gi)) {
				expect(allowed, `${file}: ${m[0]}`).toContain(m[0])
			}
		}
	})
})
