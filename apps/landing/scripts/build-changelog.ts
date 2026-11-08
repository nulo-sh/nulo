#!/usr/bin/env bun
/**
 * Writes the changelog pages into the landing root, where Vite picks them up as HTML entries. The
 * sources stay `release-notes/X.Y.Z.md` and `content/changelog/X.Y.Z.toml`; these files are gitignored.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pairSources, planChangelogPages } from "./changelog-pages"

const here = dirname(fileURLToPath(import.meta.url))
const landingRoot = resolve(here, "..")
const repoRoot = resolve(here, "../../..")

function versioned(dir: string, extension: string): { version: string; text: string }[] {
	return readdirSync(dir).flatMap((file) => {
		const version = new RegExp(`^(\\d+\\.\\d+\\.\\d+)\\${extension}$`).exec(file)?.[1]
		return version === undefined ? [] : [{ version, text: readFileSync(resolve(dir, file), "utf8") }]
	})
}

const sources = pairSources(
	versioned(resolve(repoRoot, "release-notes"), ".md").map(({ version, text }) => ({ version, markdown: text })),
	versioned(resolve(landingRoot, "content/changelog"), ".toml").map(({ version, text }) => ({ version, toml: text })),
)
const siteVersion: string = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version
// Workers Builds names the pushed branch; its production branch is `main`.
const production = process.env.WORKERS_CI_BRANCH === "main"
const pages = planChangelogPages({ sources, siteVersion, production })

// A release removed from the sources must not linger as a stale local page.
rmSync(resolve(landingRoot, "changelog"), { recursive: true, force: true })
for (const page of pages) {
	const target = resolve(landingRoot, page.path)
	mkdirSync(dirname(target), { recursive: true })
	writeFileSync(target, page.html)
}
writeFileSync(
	resolve(landingRoot, "src/generated/changelog-pages.json"),
	`${JSON.stringify(
		pages.map((page) => page.path),
		null,
		2,
	)}\n`,
)
console.log(`[build-changelog] wrote ${pages.length} page(s), ${production ? "production" : "preview: every page noindex"}`)
