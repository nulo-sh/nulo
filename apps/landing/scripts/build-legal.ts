#!/usr/bin/env bun
/**
 * Writes the legal pages the versions imply into the landing root, where Vite picks them up as
 * HTML entries. The markdown under `legal/` stays the only source; these files are gitignored.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { LEGAL_MANIFEST, parseVersionHistory } from "@nulo/legal"
import { LEGAL_DOCUMENTS, type LegalSource, type PageDocument, pageVersions, planLegalPages } from "./legal-pages"

const here = dirname(fileURLToPath(import.meta.url))
const landingRoot = resolve(here, "..")
const legalDir = resolve(here, "../../../legal")

function versionsOf(doc: PageDocument): readonly string[] {
	if (doc === "website-privacy") return parseVersionHistory(readFileSync(resolve(legalDir, `${doc}.md`), "utf8"))
	return LEGAL_MANIFEST[doc].map((entry) => entry.version)
}

const sources: LegalSource[] = LEGAL_DOCUMENTS.flatMap((doc) => {
	const versions = versionsOf(doc)
	return versions.map((version, index) => {
		const isHead = index === versions.length - 1
		const file = isHead ? resolve(legalDir, `${doc}.md`) : resolve(legalDir, "archive", `${doc}-${version}.md`)
		return { doc, version, markdown: readFileSync(file, "utf8") }
	})
})

// A version removed from the manifest must not linger as a stale local page.
for (const doc of LEGAL_DOCUMENTS) rmSync(resolve(landingRoot, doc), { recursive: true, force: true })

const pages = planLegalPages(sources, pageVersions(sources))
for (const page of pages) {
	const target = resolve(landingRoot, page.path)
	mkdirSync(dirname(target), { recursive: true })
	writeFileSync(target, page.html)
}
writeFileSync(
	resolve(landingRoot, "src/generated/legal-pages.json"),
	`${JSON.stringify(
		pages.map((page) => page.path),
		null,
		2,
	)}\n`,
)
console.log(`[build-legal] wrote ${sources.length} document version(s)`)
