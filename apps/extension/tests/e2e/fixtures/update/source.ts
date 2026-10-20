import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** What no build reads: an edit here changes neither the candidate nor the registry the checks read. */
const NOT_BUILT = [":(exclude)apps/extension/tests", ":(exclude)implementations-plan"]

function git(args: string[], cwd = HERE): string {
	const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
	if (result.status !== 0) throw new Error(`git ${args.join(" ")} exited ${result.status ?? result.signal}: ${result.stderr}`)
	return result.stdout.trim()
}

/**
 * The commit a candidate is built from, and the scenarios read the registry at: HEAD, with nothing
 * changed or added that a build reads. Throws on such a change, since the candidate and the checks
 * would then read different sources.
 */
export function candidateSource(): { commit: string } {
	const repo = git(["rev-parse", "--show-toplevel"])
	const changed = git(["status", "--porcelain", "--untracked-files=all", "--", ".", ...NOT_BUILT], repo)
	if (changed) throw new Error(`the checkout has changes a build reads; commit them first:\n${changed}`)
	return { commit: git(["rev-parse", "HEAD"], repo) }
}

if (import.meta.main) process.stdout.write(`${JSON.stringify(candidateSource())}\n`)
