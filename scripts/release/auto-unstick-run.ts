/**
 * The I/O runner around the pure `decideUnstick` (auto-unstick.ts). Resolves the
 * live GitHub state the decision needs — the PR attached to `github.sha` and the
 * tag's current SHA — calls `decideUnstick`, and performs the tag + relabel
 * when (and only when) the decision is `create`. The GitHub Release is the
 * publish chain's: attach-assets creates it as a draft and publishes it whole.
 *
 * Safety, by construction:
 *  - The PR-by-commit and tag lookups run only when the kill switch is on and
 *    this is a push; otherwise the runner makes no API call.
 *  - `decideUnstick` is the single source of truth for whether to act; this
 *    runner only maps its verdict to side effects.
 *  - `abort` (tag exists at the WRONG sha) exits non-zero — fail-closed, never
 *    re-points a tag.
 *  - All I/O is injected, so every branch is unit-testable with zero secrets.
 */

import { AUTORELEASE_PENDING_LABEL, AUTORELEASE_TAGGED_LABEL, type AutoUnstickAction, decideUnstick } from "./auto-unstick"

export interface MergedPrRef {
	number: number
	merged: boolean
	baseRef: string
	labels: string[]
	mergeSha: string
}

/** The injectable GitHub/git side of the runner — real impls shell out to `gh` / `git` in the workflow. */
export interface UnstickIO {
	/** The PR whose merge produced `headSha` (commits→PR association API), or null when HEAD is not a merged PR head. */
	resolveMergedPr(headSha: string): Promise<MergedPrRef | null>
	/** The SHA the tag points at, or null if the tag doesn't exist. */
	resolveTagSha(tag: string): Promise<string | null>
	createTag(tag: string, sha: string, message: string): Promise<void>
	relabelPr(prNumber: number, add: string, remove: string): Promise<void>
	log(msg: string): void
}

export interface RunUnstickOpts {
	/** `vars.AUTO_UNSTICK_ENABLED` — default OFF (staged rollout); the real-release flip is the human's. */
	autoUnstickEnabled: boolean
	/** release-please's `release_created` output — true means it worked, no unstick. */
	releaseCreated: boolean
	/** `github.event_name` — only `push` is eligible. */
	eventName: string
	/** `github.sha` — the commit the workflow runs on. */
	headSha: string
	/** The release version (read from `package.json#version` at HEAD by the workflow), e.g. "1.2.3". */
	version: string
	io: UnstickIO
}

export interface RunUnstickResult {
	action: AutoUnstickAction
	reason: string
	/** true only when the tag was actually created. */
	performed: boolean
	/**
	 * The tag names this run's Release-PR merge commit, created now or by an earlier attempt of
	 * this run, so the publish chain continues: a re-run after a failed relabel must not strand the tag.
	 */
	continues: boolean
	exitCode: 0 | 1
}

export async function runUnstick(opts: RunUnstickOpts): Promise<RunUnstickResult> {
	const { io } = opts
	const tag = `v${opts.version}`

	// Cheap guards first: the PR and tag lookups cost API calls.
	const eligible = opts.autoUnstickEnabled && !opts.releaseCreated && opts.eventName === "push"
	const mergedPr = eligible ? await io.resolveMergedPr(opts.headSha) : null
	const existingTagSha = mergedPr ? await io.resolveTagSha(tag) : null

	const decision = decideUnstick({
		autoUnstickEnabled: opts.autoUnstickEnabled,
		releaseCreated: opts.releaseCreated,
		eventName: opts.eventName,
		headSha: opts.headSha,
		mergedPr,
		existingTagSha,
	})

	switch (decision.action) {
		case "disabled":
		case "noop":
			io.log(`auto-unstick: ${decision.action} — ${decision.reason}`)
			return { action: decision.action, reason: decision.reason, performed: false, continues: false, exitCode: 0 }
		case "abort":
			io.log(`auto-unstick: ABORT — ${decision.reason}`)
			return { action: "abort", reason: decision.reason, performed: false, continues: false, exitCode: 1 }
		case "skip": {
			// Tag already at the merge SHA: heal a prior run that tagged but never relabeled. Never a 2nd tag.
			if (decision.prNumber !== undefined) await io.relabelPr(decision.prNumber, AUTORELEASE_TAGGED_LABEL, AUTORELEASE_PENDING_LABEL)
			io.log(`auto-unstick: skip (${tag} exists at HEAD) — continuing the publish`)
			return { action: "skip", reason: decision.reason, performed: false, continues: true, exitCode: 0 }
		}
		case "create": {
			io.log(`auto-unstick: creating ${tag} at ${decision.tagSha} (Release PR #${decision.prNumber})`)
			await io.createTag(tag, decision.tagSha as string, `Release ${opts.version}`)
			await io.relabelPr(decision.prNumber as number, AUTORELEASE_TAGGED_LABEL, AUTORELEASE_PENDING_LABEL)
			io.log(`auto-unstick: created ${tag}, relabeled PR #${decision.prNumber} → tagged`)
			return { action: "create", reason: decision.reason, performed: true, continues: true, exitCode: 0 }
		}
	}
}

// CLI entry — the `auto-unstick` release job runs `bun scripts/release/auto-unstick-run.ts`.
// Skipped on import (import.meta.main is false in the unit tests, which inject a fake IO).
// The real IO shells out to `gh` + `git`; the decision + action-mapping above are what's
// unit-tested, so this boundary stays a thin, un-mocked wrapper.
if (import.meta.main) {
	const { $ } = await import("bun")
	const repo = process.env.GITHUB_REPOSITORY ?? ""

	const realIO: UnstickIO = {
		async resolveMergedPr(headSha) {
			const res = await $`gh api ${`repos/${repo}/commits/${headSha}/pulls`} --jq ${".[]"}`.nothrow().quiet()
			// Fail LOUD on a transport/auth/rate-limit error. Returning null here would be
			// indistinguishable from "no Release PR" → a silent noop → a stuck-but-green
			// release. A commit with no PRs is exit 0 + empty output (handled below).
			if (res.exitCode !== 0) throw new Error(`gh api commits/${headSha}/pulls failed (exit ${res.exitCode}): ${res.stderr.toString().trim()}`)
			// One JSON object per line. GitHub also associates a commit with PRs that merely contain
			// it, so only the PR this commit merged counts.
			for (const line of res.stdout.toString().split("\n")) {
				if (!line.trim()) continue
				const pr = JSON.parse(line) as {
					number?: number
					merged_at?: string | null
					base?: { ref?: string }
					labels?: Array<{ name: string }>
					merge_commit_sha?: string
				}
				if (!pr.number || pr.merge_commit_sha !== headSha) continue
				return {
					number: pr.number,
					merged: pr.merged_at != null,
					baseRef: pr.base?.ref ?? "",
					labels: (pr.labels ?? []).map((l) => l.name),
					mergeSha: headSha,
				}
			}
			return null
		},
		async resolveTagSha(tag) {
			const ref = `${tag}^{commit}`
			const res = await $`git rev-parse --verify --quiet ${ref}`.nothrow().quiet()
			if (res.exitCode !== 0) return null
			return res.stdout.toString().trim() || null
		},
		async createTag(tag, sha, message) {
			// Through the API, so the tag's creator is the token's App and no credential enters .git/config.
			// No tagger is sent: GitHub records the token's identity.
			const object = (
				await $`gh api -X POST ${`repos/${repo}/git/tags`} -f tag=${tag} -f message=${message} -f object=${sha} -f type=commit --jq .sha`.text()
			).trim()
			await $`gh api -X POST ${`repos/${repo}/git/refs`} -f ref=${`refs/tags/${tag}`} -f sha=${object}`.quiet()
		},
		async relabelPr(prNumber, add, remove) {
			// `gh pr edit --add-label` FAILS if the label isn't defined in the repo. The
			// `autorelease: tagged` label won't exist on a repo that has never completed a
			// release (the v4 abort means release-please never created it). Ensure it first
			// (idempotent via --force). Found by the throwaway-repo rehearsal.
			await $`gh label create ${add} --color ededed --force`.nothrow().quiet()
			await $`gh pr edit ${String(prNumber)} --add-label ${add} --remove-label ${remove}`
		},
		log: (m) => console.log(m),
	}

	const version = process.env.VERSION?.trim() || ((await Bun.file("package.json").json()) as { version: string }).version
	const flag = (process.env.AUTO_UNSTICK_ENABLED ?? "").trim().toLowerCase()

	const result = await runUnstick({
		autoUnstickEnabled: flag === "on" || flag === "true" || flag === "1",
		releaseCreated: (process.env.RELEASE_CREATED ?? "").trim() === "true",
		eventName: process.env.EVENT_NAME ?? "",
		headSha: process.env.HEAD_SHA ?? "",
		version,
		io: realIO,
	})

	const ghOut = process.env.GITHUB_OUTPUT
	if (ghOut) {
		const { appendFileSync } = await import("node:fs")
		appendFileSync(ghOut, `unstuck=${result.continues}\ntag_name=${result.continues ? `v${version}` : ""}\n`)
	}
	process.exit(result.exitCode)
}
