import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { HOST_ROOT } from "../scripts/check"
import { EXPECTED_HEADERS } from "./policy"

/** `_headers` as Cloudflare reads it: a path line, then indented `Name: value` lines. */
function headerRules(text: string): Record<string, Record<string, string>> {
	const rules: Record<string, Record<string, string>> = {}
	let current: Record<string, string> | undefined
	for (const line of text.split("\n")) {
		if (line.trim() === "" || line.trimStart().startsWith("#")) continue
		if (!/^\s/.test(line)) {
			current = rules[line.trim()] = {}
			continue
		}
		const at = line.indexOf(":")
		if (current) current[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
	}
	return rules
}

describe("the host's headers", () => {
	test("one rule covers every path, with exactly the policy", () => {
		const rules = headerRules(readFileSync(join(HOST_ROOT, "public/_headers"), "utf8"))
		expect(rules).toEqual({ "/*": EXPECTED_HEADERS })
	})
})

describe("wrangler.jsonc", () => {
	const config = JSON.parse(readFileSync(join(HOST_ROOT, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""))

	test("deploys static assets only, from public/, with no fallback document", () => {
		expect(config.main).toBeUndefined()
		expect(config.assets).toEqual({ directory: "./public", not_found_handling: "none", html_handling: "none" })
	})

	test("serves one name, attached outside the file, and keeps no request logs", () => {
		expect(config.name).toBe("nulo-tokens")
		expect(config.routes).toBeUndefined()
		expect(config.workers_dev).toBe(false)
		expect(config.preview_urls).toBe(false)
		expect(config.observability).toEqual({ enabled: false })
	})

	test("deploys through the workspace's pinned wrangler", () => {
		const pkg = JSON.parse(readFileSync(join(HOST_ROOT, "package.json"), "utf8"))
		expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/)
		expect(pkg.scripts.deploy).toBe("wrangler deploy")
	})
})
