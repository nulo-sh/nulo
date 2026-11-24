import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

/** The commit a shrink-only baseline is compared with. */
export type RatchetBase = { label: string; sha?: string; branch?: string }

/** What to ratchet against, or null when there is nothing: under Actions the pull_request event's
 *  exact `base.sha` (reproducible even if the base branch advances mid-run), falling back to the
 *  base branch tip; push/schedule/dispatch runs have no base (the content already passed on its
 *  PR); locally, `origin/dev`. */
export function ratchetBase(): RatchetBase | null {
	if (process.env.GITHUB_ACTIONS !== "true") return { label: "origin/dev", branch: "dev" }
	const branch = process.env.GITHUB_BASE_REF
	if (!branch) return null
	const sha = pullRequestBaseSha(process.env.GITHUB_EVENT_PATH)
	return sha ? { label: `${branch}@${sha.slice(0, 8)}`, sha } : { label: `origin/${branch}`, branch }
}

function pullRequestEvent(eventPath: string | undefined): { base?: { sha?: unknown } } | undefined {
	if (!eventPath) return undefined
	try {
		return JSON.parse(readFileSync(eventPath, "utf8"))?.pull_request ?? undefined
	} catch {
		return undefined
	}
}

function pullRequestBaseSha(eventPath: string | undefined): string | undefined {
	const sha = pullRequestEvent(eventPath)?.base?.sha
	return typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined
}

function git(...args: string[]): { ok: boolean; stdout: string; stderr: string } {
	const res = spawnSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000 })
	return { ok: res.status === 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
}

/** Reads `path` at the base, fetching the commit shallowly when the checkout lacks it (CI
 *  checkouts are depth-1; GitHub serves any reachable commit by SHA). `predates` means the base
 *  commit was read and has no such file; `skipped` means the base could not be read. */
export function readAtBase(base: RatchetBase, path: string): { text: string } | { predates: string } | { skipped: string } {
	const ref = base.sha ?? `refs/remotes/origin/${base.branch}`
	if (!git("rev-parse", "--verify", "-q", `${ref}^{commit}`).ok) {
		const fetched = git("fetch", "--no-tags", "--depth=1", "origin", base.sha ?? `${base.branch}:${ref}`)
		if (!fetched.ok) return { skipped: `${ref} unavailable: ${fetched.stderr.trim() || "fetch failed"}` }
	}
	const listed = git("ls-tree", "--name-only", ref, "--", path)
	if (!listed.ok) return { skipped: `${ref} unreadable: ${listed.stderr.trim()}` }
	if (listed.stdout.trim() === "") return { predates: `${ref} predates ${path}` }
	const shown = git("show", `${ref}:${path}`)
	if (!shown.ok) return { skipped: `${ref} has no readable ${path}: ${shown.stderr.trim()}` }
	return { text: shown.stdout }
}
