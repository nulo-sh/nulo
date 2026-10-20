import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import { RELEASE_DIGESTS, releaseProblem } from "../../tests/e2e/fixtures/update/release"

const zip = Buffer.from("a release zip")
const digest = createHash("sha256").update(zip).digest("hex")
const pins = { "v9.9.9": { chrome: digest, firefox: "0".repeat(64) } }
const shasums = (...lines: string[]) => `${lines.join("\n")}\n`

describe("releaseProblem", () => {
	test("accepts the zip whose digest is pinned and named once, with that digest, in SHASUMS256.txt", () => {
		const listed = shasums(`${digest}  nulo-chrome-9.9.9.zip`, `${"1".repeat(64)}  nulo-firefox-9.9.9.zip`)
		expect(releaseProblem("v9.9.9", "chrome", zip, listed, pins)).toBeUndefined()
	})

	test("refuses a tampered zip even when SHASUMS256.txt was tampered to match it", () => {
		const tampered = Buffer.from("a tampered zip")
		const forged = createHash("sha256").update(tampered).digest("hex")
		expect(releaseProblem("v9.9.9", "chrome", tampered, shasums(`${forged}  nulo-chrome-9.9.9.zip`), pins)).toContain("not the pinned")
	})

	test("refuses a SHASUMS256.txt that disagrees with the pin, names the zip twice or not at all", () => {
		const other = "2".repeat(64)
		expect(releaseProblem("v9.9.9", "chrome", zip, shasums(`${other}  nulo-chrome-9.9.9.zip`), pins)).toContain("SHASUMS256.txt gives")
		const twice = shasums(`${digest}  nulo-chrome-9.9.9.zip`, `${digest}  nulo-chrome-9.9.9.zip`)
		expect(releaseProblem("v9.9.9", "chrome", zip, twice, pins)).toContain("on 2 lines")
		expect(releaseProblem("v9.9.9", "chrome", zip, shasums(), pins)).toContain("on 0 lines")
	})

	test("refuses a tag with no reviewed digest", () => {
		expect(releaseProblem("v0.0.1", "chrome", zip, shasums(`${digest}  nulo-chrome-0.0.1.zip`), pins)).toContain("no reviewed digest")
	})

	test("every pinned digest is a SHA-256 for both browsers", () => {
		for (const [tag, byBrowser] of Object.entries(RELEASE_DIGESTS)) {
			expect(Object.keys(byBrowser).sort(), tag).toEqual(["chrome", "firefox"])
			for (const value of Object.values(byBrowser)) expect(value, tag).toMatch(/^[0-9a-f]{64}$/)
		}
	})
})
