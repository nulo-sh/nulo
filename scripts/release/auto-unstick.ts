/**
 * The decision core for tagging a merged Release PR, which release-please never
 * tags (it runs with skip-github-release). On the post-merge `push:main` run we
 * create the tag ourselves, then continue the same publish DAG, whose
 * attach-assets job creates and publishes the GitHub Release.
 *
 * This module is the PURE decision only — the GitHub API side-effects (create
 * tag, relabel) live in the workflow glue, which calls this to
 * decide what to do. Keeping it pure makes every branch (incl. the race +
 * wrong-SHA cases) unit-testable with zero secrets.
 *
 * Safety, by construction:
 *  - guarded by `autoUnstickEnabled` (the staged-rollout kill switch);
 *  - only acts on a real `push` whose HEAD is the merge commit of a MERGED
 *    `autorelease: pending` Release PR with base `main` (an explicit PR-to-SHA
 *    check — never a title heuristic);
 *  - idempotent: an existing tag at the right SHA → no-op;
 *  - fail-closed: an existing tag at the WRONG SHA → abort (never re-point).
 */

export const AUTORELEASE_PENDING_LABEL = "autorelease: pending"
/** What the unstick relabels a Release PR to once its tag exists. */
export const AUTORELEASE_TAGGED_LABEL = "autorelease: tagged"

export interface AutoUnstickInput {
	/** `vars.AUTO_UNSTICK_ENABLED` — the staged-rollout kill switch. */
	autoUnstickEnabled: boolean
	/** release-please's `release_created` output — true means it worked, no unstick. */
	releaseCreated: boolean
	/** the triggering event; only `push` is eligible. */
	eventName: string
	/** the commit the workflow is running on (`github.sha`). */
	headSha: string
	/**
	 * The PR whose merge produced `headSha`, if any (resolved by the workflow via
	 * the commits→PR association API). `null` when HEAD is not a merged PR head.
	 */
	mergedPr: { number: number; merged: boolean; baseRef: string; labels: string[]; mergeSha: string } | null
	/** the SHA the tag currently points at, or `null` if the tag doesn't exist. */
	existingTagSha: string | null
}

export type AutoUnstickAction = "disabled" | "noop" | "create" | "skip" | "abort"

export interface AutoUnstickDecision {
	action: AutoUnstickAction
	reason: string
	/** for `create`: the SHA to tag (always the Release-PR merge commit). */
	tagSha?: string
	/** for `create` and `skip`: the PR to relabel `autorelease: tagged`, while it is still pending. */
	prNumber?: number
}

export function decideUnstick(input: AutoUnstickInput): AutoUnstickDecision {
	if (!input.autoUnstickEnabled) return { action: "disabled", reason: "AUTO_UNSTICK_ENABLED is off (staged rollout) — manual unstick applies" }
	if (input.releaseCreated) return { action: "noop", reason: "release-please created the release; no unstick needed" }
	if (input.eventName !== "push") return { action: "noop", reason: `event is '${input.eventName}', not a push to main` }

	const pr = input.mergedPr
	if (!pr?.merged) return { action: "noop", reason: "HEAD is not a merged PR" }
	// The tag names the commit this run builds and attests; another commit's PR is not this run's release.
	if (pr.mergeSha !== input.headSha)
		return { action: "noop", reason: `PR #${pr.number} merged as ${pr.mergeSha}, not HEAD ${input.headSha}` }
	if (pr.baseRef !== "main") return { action: "noop", reason: `merged PR targets '${pr.baseRef}', not main` }
	const pending = pr.labels.includes(AUTORELEASE_PENDING_LABEL)
	// An earlier attempt of this run may have relabeled and died before its outputs; its tag still names HEAD.
	if (!pending && !pr.labels.includes(AUTORELEASE_TAGGED_LABEL)) {
		return { action: "noop", reason: "merged PR is not a Release PR (no 'autorelease: pending' or 'autorelease: tagged' label)" }
	}
	if (input.existingTagSha === pr.mergeSha) {
		return {
			action: "skip",
			reason: "tag already exists at the merge SHA — idempotent no-op",
			prNumber: pending ? pr.number : undefined,
		}
	}
	if (input.existingTagSha === null) {
		if (!pending) return { action: "noop", reason: "Release PR is labeled tagged but has no tag; only a pending one is tagged here" }
		return { action: "create", reason: "stuck Release PR, tag missing — create it", tagSha: pr.mergeSha, prNumber: pr.number }
	}
	return {
		action: "abort",
		reason: `tag exists but points at ${input.existingTagSha}, not the Release-PR merge ${pr.mergeSha} — refusing to re-point (manual investigation required)`,
	}
}
