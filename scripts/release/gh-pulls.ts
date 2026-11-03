import { $ } from "bun"

/** A PR GitHub associates with a commit, which includes PRs that merely contain it. */
export interface CommitPull {
	number?: number
	merged_at?: string | null
	base?: { ref?: string }
	labels?: Array<{ name: string }>
	merge_commit_sha?: string
}

/**
 * `gh api`'s list of the PRs associated with `sha`, one JSON object per line. Throws when the call
 * fails, so a transport, auth or rate-limit error never reads as "no PR"; no PR is empty output.
 */
export async function commitPullsText(repo: string, sha: string): Promise<string> {
	const res = await $`gh api ${`repos/${repo}/commits/${sha}/pulls`} --jq ${".[]"}`.nothrow().quiet()
	if (res.exitCode !== 0) throw new Error(`gh api commits/${sha}/pulls failed (exit ${res.exitCode}): ${res.stderr.toString().trim()}`)
	return res.stdout.toString()
}

/** Each line parsed as it is reached, so a caller that stops at its match reads no further. */
export function* parsePulls(text: string): Generator<CommitPull> {
	for (const line of text.split("\n")) if (line.trim()) yield JSON.parse(line) as CommitPull
}
