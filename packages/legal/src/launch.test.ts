import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { LAUNCH_DOCUMENTS, launchBlanks } from "./launch"
import { LEGAL_MANIFEST } from "./manifest"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const blank = "# Terms\n\n**Version 1.0 — effective «FILL: effective date»**\n\nBody.\n"
const filled = "# Terms\n\n**Version 1.0 — effective 3 June 2027**\n\nBody.\n"
const docs = (terms: string, privacy: string) => [
	{ path: "legal/terms.md", markdown: terms },
	{ path: "legal/privacy.md", markdown: privacy },
]

describe("launchBlanks", () => {
	test("a 1.0.0 release with a blank in the Terms is refused, naming the file and line", () => {
		expect(launchBlanks("1.0.0", docs(blank, filled))).toEqual(["legal/terms.md:3: **Version 1.0 — effective «FILL: effective date»**"])
	})

	test("a later stable release with a blank in the Privacy Policy is refused", () => {
		expect(launchBlanks("2.1.0", docs(filled, `${filled}\n| 1.1 | «FILL» | x |\r\n`))).toEqual([
			"legal/privacy.md:7: | 1.1 | «FILL» | x |",
		])
	})

	test("a 0.x release, a prerelease and a filled 1.0.0 pass", () => {
		expect(launchBlanks("0.30.2", docs(blank, blank))).toEqual([])
		expect(launchBlanks("1.0.0-rc.1", docs(blank, blank))).toEqual([])
		expect(launchBlanks("1.0.0", docs(filled, filled))).toEqual([])
	})

	test("a version it cannot read is an error, never a pass", () => {
		for (const version of ["", "v1.0.0", "1.0", "1.0.0 "])
			expect(() => launchBlanks(version, docs(blank, blank)), version).toThrow(/semantic version/)
	})

	test("the documents it checks are exactly the ones the manifest versions", () => {
		expect([...LAUNCH_DOCUMENTS].sort()).toEqual(
			Object.keys(LEGAL_MANIFEST)
				.map((doc) => `legal/${doc}.md`)
				.sort(),
		)
	})
})

// The launch-legal job runs this on every pull request into main, so the Release PR for a stable
// release at or above 1.0.0 cannot merge while a blank remains.
test.skipIf(!process.env.NULO_LAUNCH_GATE)("the version this tree would release has no blank left in its legal documents", () => {
	const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string }
	const documents = Object.keys(LEGAL_MANIFEST).map((doc) => {
		const path = `legal/${doc}.md`
		return { path, markdown: readFileSync(resolve(root, path), "utf8") }
	})
	expect(launchBlanks(version, documents), `version ${version}`).toEqual([])
})
