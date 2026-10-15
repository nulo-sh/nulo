/**
 * Behavioral pin for pr-retarget.yml's one step, a script that holds `actions: write`. It runs the
 * step's script under a `gh` that serves each lane's run list, each run as successive reads see it
 * and each call's failures, and records every call in order.
 *
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml`.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { runStep, type WorkflowStep } from "./gh-step-harness"

const ROOT = join(import.meta.dir, "..", "..")
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const WORKFLOW: any = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-retarget.yml"), "utf8"))
const STEP: WorkflowStep = WORKFLOW.jobs["rerun-e2e"].steps[0]

const PR = 7
const [HEAD, OTHER] = ["a", "b"].map((digit) => digit.repeat(40))
const SMOKE = "pr-extension-smoke-e2e.yml"
const SMOKE_FIREFOX = "pr-extension-smoke-e2e-firefox.yml"
const NETWORK = "pr-extension-network-e2e.yml"
const NETWORK_FIREFOX = "pr-extension-network-e2e-firefox.yml"
const LANES = [SMOKE, SMOKE_FIREFOX, NETWORK, NETWORK_FIREFOX]

interface Run {
	id: number
	file: string
	/** `<attempt> <status>` as the listing shows it ("1 completed" unless set). */
	listed?: string
	/** What each read of the run returns, in order; the last one repeats (the listed state unless set). */
	reads?: string[]
	head?: string
	pr?: number
	event?: string
	/** The listing page it comes on (1 unless set). */
	page?: number
}

interface Scenario {
	runs: Run[]
	/** Per call key (`list-<file>`, `run-<id>`, `cancel-<id>`, `rerun-<id>`), the failure messages that
	 *  answer its first calls, in order (an empty one lets its call succeed); later calls succeed. */
	fails?: Record<string, string[]>
	/** A lane's listing body as sent, in place of the one built from `runs`. */
	rawLists?: Record<string, string>
}

/** The `gh` shim: answers from files in its own directory and appends each call to `calls`. */
const SHIM = String.raw`#!/usr/bin/env bash
dir=$(dirname "$0")
call="$*"
key=$(sed -n -e 's#.*/workflows/\([^/ ]*\)/runs .*#list-\1#p' -e 's#.*/runs/\([0-9]*\)/\(cancel\|rerun\)$#\2-\1#p' \
	-e 's#.*/runs/\([0-9]*\)$#run-\1#p' <<<"$call")
if [ -s "$dir/fail-$key" ]; then
	message=$(head -n1 "$dir/fail-$key")
	sed -i 1d "$dir/fail-$key"
	if [ -n "$message" ]; then
		echo "$call (failed)" >>"$dir/calls"
		echo "gh: $message" >&2
		exit 1
	fi
fi
echo "$call" >>"$dir/calls"
case "$key" in
list-*) cat "$dir/$key.json" ;;
run-*)
	read -r attempt status <"$dir/$key"
	if [ "$(wc -l <"$dir/$key")" -gt 1 ]; then sed -i 1d "$dir/$key"; fi
	printf '{"id":%s,"run_attempt":%s,"status":"%s"}' "$(cut -d- -f2 <<<"$key")" "$attempt" "$status"
	;;
cancel-* | rerun-*) ;;
*) echo "gh: unexpected call" >&2; exit 1 ;;
esac
`

function retarget(scenario: Scenario): { code: number; stdout: string; calls: string[]; posts: string[] } {
	const { code, stdout, calls } = runStep(STEP, {
		shim: SHIM,
		bound: {
			"${{ github.token }}": "t",
			"${{ github.repository }}": "nulo-sh/nulo",
			"${{ github.event.pull_request.number }}": String(PR),
			"${{ github.event.pull_request.head.sha }}": HEAD,
		},
		overrides: { RETRY_PAUSE: "0", POLL_PAUSE: "0" },
		setup: (dir) => {
			for (const file of LANES) {
				const lane = scenario.runs.filter((run) => run.file === file)
				const pages = [1, ...lane.map((run) => run.page ?? 1)].reduce((a, b) => Math.max(a, b))
				const body = Array.from({ length: pages }, (_, i) => {
					const workflow_runs = lane
						.filter((run) => (run.page ?? 1) === i + 1)
						.map((run) => {
							const [attempt, status] = (run.listed ?? "1 completed").split(" ")
							return {
								id: run.id,
								path: `.github/workflows/${file}`,
								head_sha: run.head ?? HEAD,
								event: run.event ?? "pull_request",
								run_attempt: Number(attempt),
								status,
								pull_requests: [{ number: run.pr ?? PR }],
							}
						})
					return JSON.stringify({ total_count: lane.length, workflow_runs })
				})
				writeFileSync(join(dir, `list-${file}.json`), scenario.rawLists?.[file] ?? body.join("\n"))
			}
			for (const run of scenario.runs) {
				writeFileSync(join(dir, `run-${run.id}`), `${(run.reads ?? [run.listed ?? "1 completed"]).join("\n")}\n`)
			}
			for (const [key, messages] of Object.entries(scenario.fails ?? {})) {
				writeFileSync(join(dir, `fail-${key}`), `${messages.join("\n")}\n`)
			}
		},
	})
	const posts = calls.flatMap((call) => {
		const post = /runs\/(\d+)\/(cancel|rerun)$/.exec(call)
		return post ? [`${post[2]} ${post[1]}`] : []
	})
	return { code, stdout, calls, posts }
}

const callsTo = (calls: string[], path: string): string[] => calls.filter((call) => call.includes(path))

describe("pr-retarget.yml", () => {
	test("re-runs each lane's latest run of this pull request on this head, across pages, and cancels nothing", () => {
		const result = retarget({
			runs: [
				{ id: 10, file: SMOKE },
				{ id: 12, file: SMOKE, listed: "2 completed" },
				{ id: 13, file: SMOKE, pr: PR + 1 },
				{ id: 15, file: SMOKE, head: OTHER },
				{ id: 16, file: SMOKE, event: "workflow_dispatch" },
				{ id: 20, file: SMOKE_FIREFOX },
				{ id: 21, file: SMOKE_FIREFOX, page: 2 },
				{ id: 30, file: NETWORK },
				{ id: 40, file: NETWORK_FIREFOX },
			],
		})
		expect(result.code).toBe(0)
		expect(result.posts).toEqual(["rerun 12", "rerun 21", "rerun 30", "rerun 40"])
		for (const file of LANES) {
			expect(callsTo(result.calls, `/workflows/${file}/`)).toEqual([
				`api repos/nulo-sh/nulo/actions/workflows/${file}/runs -X GET --paginate -f event=pull_request -f head_sha=${HEAD} -f per_page=100`,
			])
		}
		expect(result.stdout).toContain(`re-ran 12 ${SMOKE}`)
	})

	test.each<[string, Pick<Run, "listed" | "reads">, Scenario["fails"], string[]]>([
		[
			"a run in flight is cancelled, waited for and re-run",
			{ listed: "1 in_progress", reads: ["1 in_progress", "1 in_progress", "1 completed"] },
			{},
			["cancel 30", "rerun 30"],
		],
		[
			"a cancel answered 409 still leads to the re-run",
			{ listed: "1 in_progress", reads: ["1 completed"] },
			{ "cancel-30": ["Cannot cancel a workflow run that is completed. (HTTP 409)"] },
			["rerun 30"],
		],
		[
			"an attempt another request started counts as done",
			{ listed: "1 in_progress", reads: ["1 in_progress", "2 queued"] },
			{},
			["cancel 30"],
		],
		[
			"a cancel that hit a newer attempt waits for that attempt and re-runs it",
			{ listed: "1 in_progress", reads: ["2 in_progress", "2 completed"] },
			{},
			["cancel 30", "rerun 30"],
		],
	])("%s", (_, run, fails, posts) => {
		const result = retarget({ runs: [{ id: 30, file: NETWORK, ...run }], fails })
		expect(result.code).toBe(0)
		expect(result.posts).toEqual(posts)
		expect(callsTo(result.calls, "/cancel"), "one cancel call, a 409 included").toHaveLength(1)
	})

	test("a lane with no run of this head is reported, and the others are still re-run", () => {
		const result = retarget({
			runs: [
				{ id: 20, file: SMOKE_FIREFOX },
				{ id: 30, file: NETWORK },
				{ id: 40, file: NETWORK_FIREFOX },
			],
		})
		expect(result.code).toBe(0)
		expect(result.posts).toEqual(["rerun 20", "rerun 30", "rerun 40"])
		expect(result.stdout).toContain(`${SMOKE} has no run of ${HEAD} for #${PR}`)
	})

	test("a server error is retried once; a refusal fails the job after the other lanes are re-run", () => {
		const retried = retarget({ runs: [{ id: 30, file: NETWORK }], fails: { "rerun-30": ["HTTP 502: Bad Gateway"] } })
		expect([retried.code, callsTo(retried.calls, "/rerun").length, retried.posts]).toEqual([0, 2, ["rerun 30"]])
		const refused = retarget({
			runs: LANES.map((file, i) => ({ id: 10 * (i + 1), file })),
			fails: { "rerun-10": ["Not Found (HTTP 404)"] },
		})
		expect(refused.code).not.toBe(0)
		expect(callsTo(refused.calls, "/runs/10/rerun")).toHaveLength(1)
		expect(refused.posts).toEqual(["rerun 20", "rerun 30", "rerun 40"])
		expect(refused.stdout).toContain(`::error::not re-run on the new base: 10 ${SMOKE}`)
	})

	const others: Run[] = [
		{ id: 20, file: SMOKE_FIREFOX },
		{ id: 30, file: NETWORK },
		{ id: 40, file: NETWORK_FIREFOX },
	]
	const inFlight: Run = { id: 10, file: SMOKE, listed: "1 in_progress", reads: ["1 in_progress"] }
	test.each<[string, Scenario, string]>([
		[
			"its runs cannot be listed",
			{
				runs: [{ id: 10, file: SMOKE }, ...others],
				fails: { [`list-${SMOKE}`]: ["HTTP 502: Bad Gateway", "HTTP 502: Bad Gateway"] },
			},
			SMOKE,
		],
		[
			"its listing cannot be read",
			{ runs: [{ id: 10, file: SMOKE }, ...others], rawLists: { [SMOKE]: '{"workflow_runs":null}' } },
			SMOKE,
		],
		["its cancelled run cannot be read", { runs: [inFlight, ...others], fails: { "run-10": ["Not Found (HTTP 404)"] } }, `10 ${SMOKE}`],
		[
			"its run cannot be read while it waits",
			{ runs: [inFlight, ...others], fails: { "run-10": ["", "Not Found (HTTP 404)"] } },
			`10 ${SMOKE}`,
		],
	])("a lane fails the job when %s, and the others are still re-run", (_, scenario, named) => {
		const result = retarget(scenario)
		expect(result.code).not.toBe(0)
		expect(result.posts.filter((post) => post.startsWith("rerun"))).toEqual(["rerun 20", "rerun 30", "rerun 40"])
		expect(result.stdout).toContain(`::error::not re-run on the new base: ${named}.`)
	})

	test("a refused re-run whose next read shows a newer attempt counts as done", () => {
		const already = "This workflow is already running (HTTP 403)"
		const result = retarget({
			runs: [{ id: 30, file: NETWORK, reads: ["2 in_progress"] }],
			fails: { "rerun-30": [already, already] },
		})
		expect(result.code).toBe(0)
		expect(result.posts).toEqual([])
		expect(result.stdout).toContain(`30 ${NETWORK} is already at attempt 2`)
	})

	test("one pass reads every cancelled lane, so a slow cancel holds back none of the others", () => {
		const result = retarget({
			runs: [
				{
					id: 10,
					file: SMOKE,
					listed: "1 in_progress",
					reads: ["1 in_progress", "1 in_progress", "1 in_progress", "1 in_progress", "1 completed"],
				},
				{ id: 30, file: NETWORK, listed: "1 in_progress", reads: ["1 in_progress", "1 completed"] },
			],
		})
		expect(result.code).toBe(0)
		expect(result.posts).toEqual(["cancel 10", "cancel 30", "rerun 30", "rerun 10"])
		expect(result.stdout.split("\n").filter((line) => /^(cancelled|re-ran) /.test(line))).toEqual([
			`cancelled 10 ${SMOKE}`,
			`cancelled 30 ${NETWORK}`,
			`re-ran 30 ${NETWORK}`,
			`re-ran 10 ${SMOKE}`,
		])
	})
})
