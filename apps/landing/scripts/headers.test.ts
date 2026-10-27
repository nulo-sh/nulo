import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { siteHeaders } from "./headers"

const sample = `/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; script-src 'self'
  Link: <https://example.test/fonts.css>; rel=preload

/*.html
  Cache-Control: public, max-age=60, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

describe("siteHeaders", () => {
	it("returns only the /* block, keeping values that contain colons", () => {
		expect(siteHeaders(sample)).toEqual({
			"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
			"Content-Security-Policy": "default-src 'self'; script-src 'self'",
			Link: "<https://example.test/fonts.css>; rel=preload",
		})
	})

	it("returns nothing when there is no site-wide block", () => {
		expect(siteHeaders("/assets/*\n  Cache-Control: immutable\n")).toEqual({})
	})
})

describe("the production policy in public/_headers", () => {
	const csp = siteHeaders(readFileSync(new URL("../public/_headers", import.meta.url), "utf8"))["Content-Security-Policy"] ?? ""
	const directives = new Map(
		csp
			.split(";")
			.map((d) => d.trim().split(/\s+/))
			.filter((parts) => parts[0])
			.map(([name, ...sources]) => [name as string, sources]),
	)

	it("lets a form post only to this origin, so the signup cannot be retargeted off-site", () => {
		expect(directives.get("form-action")).toEqual(["'self'"])
	})

	it("keeps fetches on this origin", () => {
		expect(directives.get("connect-src")).toEqual(["'self'"])
	})

	it("names no other origin in any directive", () => {
		for (const sources of directives.values()) {
			for (const source of sources) expect(["'self'", "'none'", "'unsafe-inline'", "data:"]).toContain(source)
		}
	})
})
