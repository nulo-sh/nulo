import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { BrowserKind } from "../browser"
import { E2E_STATE_DIR } from "../../lockfile"

/**
 * The SHA-256 of every release zip a scenario may update from, each reviewed once against its
 * GitHub Release. A tag with no entry is refused: the release's own `SHASUMS256.txt` comes from the
 * same place as the zip, so it alone proves nothing.
 */
export const RELEASE_DIGESTS: Readonly<Record<string, Readonly<Record<BrowserKind, string>>>> = {
	"v0.31.0": {
		chrome: "6352fc82598a21711ffbb5b6e32b548ad03e1f4bd4a1cbd32e41b4a5ca1fac9e",
		firefox: "32cb5b18339e81775ee194a8c4b0d59f7dda281d29dc2fdc20e14b478eeee84e",
	},
	"v1.0.0": {
		chrome: "b226ac904484577a30a0dee7c5ef80b6a48e107148d81c959c488bc2659d00a9",
		firefox: "66d380bfe2ba002558343324f5dce4c3521b2e75fa2ce58f84c0f38d972dd8d1",
	},
	"v1.1.0": {
		chrome: "bcc66cb0960359a8a70fe7693086faff82af4718cf2429d7fb0ac79ffc261117",
		firefox: "388fadfb24c86fae309605a64077924a5a384574429fa2a2fa7aa35e37e1a762",
	},
}

/**
 * What a scenario must know of a release it updates from, reviewed once against its tag beside its
 * digests, so no scenario infers a release's path from the rows in front of it. `storage`: whether
 * the release keeps its profile's rows, its account selection and its preference maps as plaintext
 * a test can parse, or `sealed` behind the worker, readable only through its services once
 * unlocked. `connect`: whether its emoji check replaces the connect window's page or opens a window
 * of its own.
 */
export type ReleaseTraits = { storage: "plaintext" | "sealed"; connect: "replaces-page" | "own-window" }

export const RELEASE_TRAITS: Readonly<Record<string, ReleaseTraits>> = {
	"v0.31.0": { storage: "plaintext", connect: "replaces-page" },
	"v1.0.0": { storage: "sealed", connect: "own-window" },
	"v1.1.0": { storage: "sealed", connect: "own-window" },
}

/** `tag`'s traits; throws for a tag with none, as {@link releaseProblem} refuses one with no digest. */
export function releaseTraits(tag: string): ReleaseTraits {
	const traits = RELEASE_TRAITS[tag]
	if (!traits) throw new Error(`no reviewed traits for ${tag}: add them to RELEASE_TRAITS beside its digests`)
	return traits
}

const RELEASE_REPO = "nulo-sh/nulo"

export const releaseZipName = (tag: string, browser: BrowserKind): string => `nulo-${browser}-${tag.replace(/^v/, "")}.zip`

/**
 * Why `zip` may not be used as `tag`'s `browser` build, or undefined when it may: its digest must
 * equal the pinned one, and the release's `SHASUMS256.txt` must name it on exactly one line, with
 * that digest.
 */
export function releaseProblem(
	tag: string,
	browser: BrowserKind,
	zip: Buffer,
	shasums: string,
	digests: typeof RELEASE_DIGESTS = RELEASE_DIGESTS,
): string | undefined {
	const pinned = digests[tag]?.[browser]
	if (!pinned) return `no reviewed digest for ${tag} ${browser}: add it to RELEASE_DIGESTS from the release`
	const name = releaseZipName(tag, browser)
	const digest = createHash("sha256").update(zip).digest("hex")
	if (digest !== pinned) return `${name} has digest ${digest}, not the pinned ${pinned}`
	const lines = shasums
		.split("\n")
		.map((line) => line.trim().split(/\s+\*?/))
		.filter(([, file]) => file === name)
	if (lines.length !== 1) return `SHASUMS256.txt names ${name} on ${lines.length} lines, not one`
	if (lines[0]?.[0] !== pinned) return `SHASUMS256.txt gives ${name} the digest ${lines[0]?.[0]}, not the pinned ${pinned}`
	return undefined
}

/** Where downloaded releases are kept: run-owned state inside the checkout unless the caller names another. */
const releaseCache = () => process.env.NULO_E2E_RELEASE_CACHE ?? path.join(E2E_STATE_DIR, "releases")

function run(command: string, args: string[]): void {
	const result = spawnSync(command, args, { stdio: ["ignore", "inherit", "inherit"] })
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status ?? result.signal}`)
}

/**
 * The `browser` build of release `tag`, unpacked into `into`: downloaded once with `gh release
 * download`, checked by {@link releaseProblem}, and unpacked from the bytes checked, so neither an
 * earlier unpacking nor a later change to the cached zip is trusted.
 */
export function releaseBuild(tag: string, browser: BrowserKind, into: string): string {
	const dir = path.join(releaseCache(), tag)
	const name = releaseZipName(tag, browser)
	const zipPath = path.join(dir, name)
	const shasumsPath = path.join(dir, "SHASUMS256.txt")
	if (!existsSync(zipPath) || !existsSync(shasumsPath)) {
		mkdirSync(dir, { recursive: true })
		run("gh", [
			"release",
			"download",
			tag,
			"--repo",
			RELEASE_REPO,
			"--dir",
			dir,
			"--clobber",
			"--pattern",
			name,
			"--pattern",
			"SHASUMS256.txt",
		])
	}
	const zip = readFileSync(zipPath)
	const problem = releaseProblem(tag, browser, zip, readFileSync(shasumsPath, "utf8"))
	if (problem) throw new Error(`refusing ${tag}'s ${browser} build: ${problem}`)
	rmSync(into, { recursive: true, force: true })
	mkdirSync(into, { recursive: true })
	const checked = path.join(into, name)
	writeFileSync(checked, zip)
	const unpacked = path.join(into, browser)
	run("unzip", ["-q", checked, "-d", unpacked])
	return unpacked
}
