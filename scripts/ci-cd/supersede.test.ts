/**
 * Behavioral pin for pr-supersede.yml's one step, the only script that holds `actions: write`.
 *
 * It runs the step's own script under a `gh` that serves a scripted pull request: the head it
 * reports, the runs the branch lists per status, and how each cancel call answers, recording every
 * call in order. A push can land between any two calls, so the cases that matter are orderings: the
 * current head's runs must never be cancelled, whichever way the reads and the push interleave.
 *
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml`.
 */
import { describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const WORKFLOW: any = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-supersede.yml"), "utf8"))
const STEP: { run: string; env: Record<string, string> } = WORKFLOW.jobs["cancel-superseded"].steps[0]

const PR = 7
const [H1, H2, H3] = ["1", "2", "3"].map((digit) => digit.repeat(40))
const LISTED = ["queued", "in_progress", "pending", "waiting", "requested"]

interface Run {
	id: number
	head_sha: string
	path?: string
	status?: string
	pr?: number
}

interface Scenario {
	/** What each pull request read returns, in order; the last one repeats. */
	heads: string[]
	/** A push that lands with the first run listing: the head every later read returns. */
	pushOnList?: string
	runs: Run[]
	/** A cancel call's failure message (`gh: <message>`), per run id. */
	cancelFails?: Record<number, string>
}

/** The `gh` shim: answers from files in its own directory and appends each call to `calls`. */
const SHIM = `#!/usr/bin/env bash
dir=$(dirname "$0")
echo "$*" >>"$dir/calls"
case "$*" in
*/pulls/*)
	head=$(head -n1 "$dir/heads")
	if [ "$(wc -l <"$dir/heads")" -gt 1 ]; then sed -i 1d "$dir/heads"; fi
	printf '{"head":{"sha":"%s"}}' "$head"
	;;
*actions/runs\\ *)
	if [ -f "$dir/push" ]; then mv "$dir/push" "$dir/heads"; fi
	status=$(sed -n 's/.*status=\\([a-z_]*\\).*/\\1/p' <<<"$*")
	cat "$dir/runs-$status.json"
	;;
*/cancel)
	id=$(sed -n 's#.*/runs/\\([0-9]*\\)/cancel#\\1#p' <<<"$*")
	if [ -f "$dir/fail-$id" ]; then echo "gh: $(cat "$dir/fail-$id")" >&2; exit 1; fi
	;;
*) echo "gh: unexpected call" >&2; exit 1 ;;
esac
`

function sweep(scenario: Scenario): { code: number; stdout: string; calls: string[]; cancelled: number[] } {
	const dir = mkdtempSync(join(tmpdir(), "supersede-"))
	try {
		writeFileSync(join(dir, "gh"), SHIM)
		chmodSync(join(dir, "gh"), 0o755)
		writeFileSync(join(dir, "calls"), "")
		writeFileSync(join(dir, "heads"), `${scenario.heads.join("\n")}\n`)
		if (scenario.pushOnList) writeFileSync(join(dir, "push"), `${scenario.pushOnList}\n`)
		for (const status of LISTED) {
			const workflow_runs = scenario.runs
				.filter((run) => (run.status ?? "in_progress") === status)
				.map((run) => ({
					id: run.id,
					head_sha: run.head_sha,
					path: run.path ?? ".github/workflows/pr-quick.yml",
					pull_requests: [{ number: run.pr ?? PR }],
				}))
			writeFileSync(join(dir, `runs-${status}.json`), JSON.stringify({ total_count: workflow_runs.length, workflow_runs }))
		}
		for (const [id, message] of Object.entries(scenario.cancelFails ?? {})) writeFileSync(join(dir, `fail-${id}`), message)
		const env: Record<string, string> = { PATH: `${dir}:${process.env.PATH}` }
		const bound: Record<string, string> = {
			"${{ github.token }}": "t",
			"${{ github.repository }}": "nulo-sh/nulo",
			"${{ github.event.pull_request.number }}": String(PR),
			"${{ github.event.pull_request.head.ref }}": "feature",
		}
		for (const [key, value] of Object.entries(STEP.env)) env[key] = bound[value] ?? value
		env.RETRY_PAUSE = "0"
		const run = Bun.spawnSync(["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "-c", STEP.run], { env })
		const calls = readFileSync(join(dir, "calls"), "utf8").split("\n").filter(Boolean)
		const cancelled = calls
			.map((call) => /runs\/(\d+)\/cancel$/.exec(call)?.[1])
			.filter((id): id is string => id !== undefined && !scenario.cancelFails?.[Number(id)])
			.map(Number)
		return { code: run.exitCode, stdout: run.stdout.toString(), calls, cancelled }
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

const kind = (call: string): string => (call.includes("/pulls/") ? "head" : call.includes("/cancel") ? "cancel" : "list")

describe("pr-supersede.yml", () => {
	test("lists the branch's unfinished runs before it reads the head, and cancels only the old heads' runs", () => {
		const result = sweep({
			heads: [H2],
			runs: [
				{ id: 1, head_sha: H1 },
				{ id: 2, head_sha: H2, status: "queued" },
			],
		})
		expect(result.code).toBe(0)
		expect(result.calls.slice(0, 6).map(kind)).toEqual(["list", "list", "list", "list", "list", "head"])
		expect(result.calls.slice(0, 5).map((call) => /status=(\w+)/.exec(call)?.[1])).toEqual(LISTED)
		for (const call of result.calls.slice(0, 5)) {
			expect(call).toContain("repos/nulo-sh/nulo/actions/runs -X GET --paginate -f event=pull_request -f branch=feature")
		}
		expect(result.cancelled).toEqual([1])
		expect(result.stdout).toContain("API call(s)")
	})

	// The push that matters lands between the two reads: a sweep that read the head first would see the
	// event's head, then list the newer head's fresh runs and cancel them.
	test("a head pushed while it sweeps keeps its runs", () => {
		const result = sweep({
			heads: [H2],
			pushOnList: H3,
			runs: [
				{ id: 1, head_sha: H1 },
				{ id: 2, head_sha: H2 },
				{ id: 3, head_sha: H3, status: "queued" },
			],
		})
		expect(result.code).toBe(0)
		expect(result.cancelled.sort()).toEqual([1, 2])
	})

	test("never cancels another workflow's run, another pull request's run on the same branch name, or a current one", () => {
		const result = sweep({
			heads: [H2],
			runs: [
				{ id: 1, head_sha: H1, path: ".github/workflows/pr-extension-network-e2e-firefox.yml" },
				{ id: 2, head_sha: H1, path: ".github/workflows/nightly.yml" },
				{ id: 3, head_sha: H1, path: ".github/workflows/pr-supersede.yml" },
				{ id: 4, head_sha: H1, pr: PR + 1 },
				{ id: 5, head_sha: H2 },
				{ id: 6, head_sha: H1, status: "waiting" },
			],
		})
		expect(result.code).toBe(0)
		expect(result.cancelled.sort()).toEqual([1, 6])
		expect(result.stdout, "the current head's run is never selected").toContain("2 superseded run(s) found")
	})

	// A force-push can move the branch back to a listed head after the listing.
	test("re-reads the head before each cancel and keeps a run whose head became current again", () => {
		const result = sweep({ heads: [H2, H1], runs: [{ id: 1, head_sha: H1 }] })
		expect(result.code).toBe(0)
		expect(result.cancelled).toEqual([])
		expect(result.stdout).toContain(`kept run 1 (.github/workflows/pr-quick.yml): ${H1} is the live head again`)
	})

	test("a run that already finished counts as done", () => {
		const result = sweep({
			heads: [H2],
			runs: [{ id: 1, head_sha: H1 }],
			cancelFails: { 1: "Cannot cancel a workflow run that is completed. (HTTP 409)" },
		})
		expect(result.code).toBe(0)
		expect(result.calls.filter((call) => call.includes("/cancel"))).toHaveLength(1)
	})

	test("any other cancel error fails the job: once after a retry that re-reads the head, at once for a refusal", () => {
		const retried = sweep({
			heads: [H2],
			runs: [
				{ id: 1, head_sha: H1 },
				{ id: 2, head_sha: H1 },
			],
			cancelFails: { 1: "HTTP 502: Bad Gateway" },
		})
		expect(retried.code).not.toBe(0)
		expect(retried.calls.slice(6).map(kind)).toEqual(["head", "cancel", "head", "cancel", "head", "cancel"])
		expect(retried.cancelled, "the other run is still cancelled").toEqual([2])
		const refused = sweep({ heads: [H2], runs: [{ id: 1, head_sha: H1 }], cancelFails: { 1: "Not Found (HTTP 404)" } })
		expect(refused.code).not.toBe(0)
		expect(refused.calls.filter((call) => call.includes("/cancel"))).toHaveLength(1)
	})

	test("a sweep that cannot read the pull request cancels nothing and fails", () => {
		const result = sweep({ heads: [""], runs: [{ id: 1, head_sha: H1 }] })
		expect(result.code).not.toBe(0)
		expect(result.cancelled).toEqual([])
	})
})
