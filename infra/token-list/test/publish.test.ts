import { readFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import type { TokenListEntry } from "@nulo/token-list"
import { describe, expect, test, vi } from "vitest"
import { FLOOR_PATH, floorSequence, floorText, raisesFloor } from "../scripts/floor"
import {
	BRANCH_PREFIX,
	ENVELOPE_PATH,
	envelopeMeta,
	githubIO,
	type PublishBranch,
	type PublishFile,
	type PublishIO,
	type PublishPr,
	prBody,
	publishPrs,
	runPublish,
} from "../scripts/open-publish-pr"
import { flagDiff, publishedList, REPO_ROOT, renderDiff, renderFlagDiff, SIGNING_PATHS, tokenDiff } from "../scripts/summary"

const b64url = (text: string) => btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
const envelopeFor = (sequence: number, tokens: unknown[] = [], flagged?: unknown[]) =>
	`${JSON.stringify(
		{
			format: "nulo-token-list-envelope/1",
			keyId: "nulo-ci-1",
			payload: b64url(JSON.stringify({ sequence, tokens, flagged })),
			signature: "x",
		},
		null,
		"\t",
	)}\n`
// The static forms and the run-time loads no static scan follows, read as `import-closure.test.ts` reads them.
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\s[^;"]*?from\s+"([^"]+)"|(?:^|\n)\s*import\s+"([^"]+)"/g
const RUNTIME_LOAD = /\bimport\s*\(|\brequire\s*\(/

function specifiers(file: string, text: string): string[] {
	expect(RUNTIME_LOAD.test(text), `${file} loads a module at run time`).toBe(false)
	return [...text.matchAll(SPECIFIER)].map((match) => match[1] ?? match[2]).filter((specifier) => !specifier.startsWith("node:"))
}

const INPUT = { baseSha: "b".repeat(40), runUrl: "https://github.com/nulo-sh/nulo/actions/runs/1", payloadSha256: "p", tokensSha256: "t" }
const pair = (n: number) => ({ chainId: 1, address: `0x${n.toString(16).padStart(64, "0")}` })
/** The envelope at the run's base, still the one `dev` serves. */
const servedFiles = (text: string) => ({ [`${INPUT.baseSha}:${ENVELOPE_PATH}`]: text, [`dev:${ENVELOPE_PATH}`]: text })
const prOn = (number: number, sequence: number, open = true): PublishPr => ({
	number,
	branch: `${BRANCH_PREFIX}${sequence}`,
	head: `${number}`.padStart(40, "h"),
	open,
})

type FakeState = {
	heads?: Record<string, string>
	files?: Record<string, string>
	prs?: PublishPr[]
	branches?: PublishBranch[]
	/** The number `openPr` answers. */
	number?: number
}

function fakeIO(state: FakeState) {
	const calls: string[] = []
	const commits: (readonly PublishFile[])[] = []
	const bodies: string[] = []
	const io: PublishIO = {
		branchHead: async (branch) => state.heads?.[branch] ?? null,
		createBranch: async (branch, sha) => void calls.push(`branch ${branch}@${sha.slice(0, 4)}`),
		read: async (path, commit) => state.files?.[`${commit}:${path}`] ?? null,
		commit: async (branch, head, files, headline) => {
			commits.push(files)
			calls.push(`commit ${branch}@${head.slice(0, 4)} ${files.map((file) => file.path).join(" + ")} "${headline}"`)
		},
		unmergedPublishPrs: async () => state.prs ?? [],
		publishBranches: async () => state.branches ?? [],
		openPr: async (branch, title, body) => {
			calls.push(`open ${branch} "${title}"`)
			bodies.push(body)
			return state.number ?? 99
		},
		close: async (number, comment) => void calls.push(`close #${number}: ${comment}`),
		log: () => {},
	}
	return { io, calls, commits, bodies }
}

describe("open-publish-pr", () => {
	test("branches from the signed commit, commits the envelope, opens the PR and closes older publish PRs", async () => {
		const { io, calls } = fakeIO({
			files: { [`${prOn(7, 1700000000).head}:${ENVELOPE_PATH}`]: envelopeFor(1700000000) },
			prs: [prOn(7, 1700000000), prOn(8, 1800000000), { number: 9, branch: "feat/other", head: "9".repeat(40), open: true }],
		})
		expect(await runPublish({ ...INPUT, envelopeText: envelopeFor(1760000000) }, io)).toBe(99)
		expect(calls).toEqual([
			`branch ${BRANCH_PREFIX}1760000000@bbbb`,
			`commit ${BRANCH_PREFIX}1760000000@bbbb ${ENVELOPE_PATH} "chore(token-list): publish sequence 1760000000"`,
			`open ${BRANCH_PREFIX}1760000000 "chore(token-list): publish sequence 1760000000"`,
			"close #7: Superseded by #99.",
		])
	})

	test("a re-run finds its branch, commit and PR and repeats none of them", async () => {
		const envelopeText = envelopeFor(1760000000)
		const branch = `${BRANCH_PREFIX}1760000000`
		const { io, calls } = fakeIO({
			heads: { [branch]: "c".repeat(40) },
			files: { [`${"c".repeat(40)}:${ENVELOPE_PATH}`]: envelopeText },
			prs: [{ ...prOn(12, 1760000000), head: "c".repeat(40) }],
		})
		expect(await runPublish({ ...INPUT, envelopeText }, io)).toBe(12)
		expect(calls).toEqual([])
	})

	test("counts only this repository's unmerged publish branches, never a fork's of the same name", () => {
		const branch = `${BRANCH_PREFIX}1760000000`
		const pull = (number: number, ref: string, repo: string | null, state = "open", merged_at: string | null = null) => ({
			number,
			state,
			merged_at,
			head: { ref, sha: `${number}`.padStart(40, "s"), repo: repo === null ? null : { full_name: repo } },
		})
		const pulls = [
			pull(1, branch, "fork/nulo"),
			pull(2, branch, null),
			pull(3, "feat/x", "nulo-sh/nulo"),
			pull(4, branch, "nulo-sh/nulo"),
			pull(5, branch, "nulo-sh/nulo", "closed"),
			pull(6, branch, "nulo-sh/nulo", "closed", "2026-10-15T21:29:49Z"),
		]
		expect(publishPrs(pulls, "nulo-sh/nulo")).toEqual([
			{ number: 4, branch, head: "4".padStart(40, "s"), open: true },
			{ number: 5, branch, head: "5".padStart(40, "s"), open: false },
		])
	})

	test("commits the floor beside the envelope only when the list delists or flags, and a re-run repeats nothing", async () => {
		const served = servedFiles(envelopeFor(1760000000, [pair(1), pair(2)]))
		const delist = envelopeFor(1770000000, [pair(1)])
		const both = [
			{ path: ENVELOPE_PATH, text: delist },
			{ path: FLOOR_PATH, text: floorText(1770000000) },
		]
		const raised = fakeIO({ files: served })
		await runPublish({ ...INPUT, envelopeText: delist }, raised.io)
		expect(raised.commits).toEqual([both])

		const added = envelopeFor(1770000000, [pair(1), pair(2), pair(3)])
		const kept = fakeIO({ files: served })
		await runPublish({ ...INPUT, envelopeText: added }, kept.io)
		expect(kept.commits).toEqual([[{ path: ENVELOPE_PATH, text: added }]])

		const branch = `${BRANCH_PREFIX}1770000000`
		const head = "c".repeat(40)
		const onBranch = { ...served, [`${head}:${ENVELOPE_PATH}`]: delist, [`${head}:${FLOOR_PATH}`]: floorText(1770000000) }
		const rerun = fakeIO({ heads: { [branch]: head }, files: onBranch, prs: [{ ...prOn(12, 1770000000), head }] })
		expect(await runPublish({ ...INPUT, envelopeText: delist }, rerun.io)).toBe(12)
		expect(rerun.calls).toEqual([])
		const partial = fakeIO({ heads: { [branch]: head }, files: { ...onBranch, [`${head}:${FLOOR_PATH}`]: floorText(1) } })
		await runPublish({ ...INPUT, envelopeText: delist }, partial.io)
		expect(partial.commits).toEqual([both])
	})

	test("reads the flags of both envelopes: a new flag commits the floor, a kept one does not", async () => {
		const servedAt = (flagged: unknown[]) => servedFiles(envelopeFor(1760000000, [pair(1)], flagged))
		const flagging = envelopeFor(1770000000, [pair(1)], [pair(2)])
		const newFlag = fakeIO({ files: servedAt([]) })
		await runPublish({ ...INPUT, envelopeText: flagging }, newFlag.io)
		expect(newFlag.commits).toEqual([
			[
				{ path: ENVELOPE_PATH, text: flagging },
				{ path: FLOOR_PATH, text: floorText(1770000000) },
			],
		])
		const keptFlag = fakeIO({ files: servedAt([pair(2)]) })
		await runPublish({ ...INPUT, envelopeText: flagging }, keptFlag.io)
		expect(keptFlag.commits).toEqual([[{ path: ENVELOPE_PATH, text: flagging }]])
	})

	test("refuses before any write when dev no longer serves the list the run was based on", async () => {
		const base = envelopeFor(1760000000, [pair(1), pair(2)])
		const next = envelopeFor(1770000000, [pair(1), pair(2)])
		const moved = fakeIO({
			files: { ...servedFiles(base), [`dev:${ENVELOPE_PATH}`]: envelopeFor(1765000000, [pair(1), pair(2), pair(3)]) },
		})
		await expect(runPublish({ ...INPUT, envelopeText: next }, moved.io)).rejects.toThrow("re-dispatch")
		expect(moved.calls).toEqual([])
		const current = fakeIO({ files: servedFiles(base) })
		await runPublish({ ...INPUT, envelopeText: next }, current.io)
		expect(current.commits).toEqual([[{ path: ENVELOPE_PATH, text: next }]])
	})

	test("the PR body names the floor and every reason only when the list raises it", () => {
		const input = { ...INPUT, envelopeText: envelopeFor(5) }
		const reasons = ["it drops a token or flags a pair against the list of #7", "the list of #8 cannot be read"]
		const raised = prBody(input, "nulo-ci-1", 5, reasons)
		expect(raised).toContain(`(\`${FLOOR_PATH}\`) to 5`)
		for (const reason of reasons) expect(raised).toContain(`- ${reason}\n`)
		expect(prBody(input, "nulo-ci-1", 5, [])).not.toContain(FLOOR_PATH)
	})

	test("refuses a file that is not an envelope with a sequence", () => {
		expect(() => envelopeMeta("{}")).toThrow("not a token list envelope")
		expect(() => envelopeMeta(envelopeFor(0))).toThrow("no sequence")
	})
})

describe("the floor reads every list at a publish PR or branch head", () => {
	const FLOOR = 1760000000
	const NEXT = 1780000000
	/** `dev` serves N, which lists token 1 and flags pair 3, over a floor at `FLOOR`. */
	const base = {
		...servedFiles(envelopeFor(1765000000, [pair(1)], [pair(3)])),
		[`${INPUT.baseSha}:${FLOOR_PATH}`]: floorText(FLOOR),
	}
	const at = (head: string, text: string) => ({ [`${head}:${ENVELOPE_PATH}`]: text })
	const next = envelopeFor(NEXT, [pair(1)], [pair(3)])
	const floorCommit = [
		{ path: ENVELOPE_PATH, text: next },
		{ path: FLOOR_PATH, text: floorText(NEXT) },
	]

	test("a list that drops what a superseded publish PR's list added raises the floor; one that keeps it does not", async () => {
		const r1 = envelopeFor(1770000000, [pair(1), pair(2)], [pair(3)])
		const run1 = fakeIO({ files: base, number: 7 })
		expect(await runPublish({ ...INPUT, envelopeText: r1 }, run1.io)).toBe(7)
		expect(run1.commits).toEqual([[{ path: ENVELOPE_PATH, text: r1 }]])

		// Run 2 starts from what run 1 wrote: R1 at the head of its branch and its open PR.
		const pr7 = prOn(7, 1770000000)
		const afterRun1 = {
			files: { ...base, ...at(pr7.head, r1) },
			prs: [pr7],
			branches: [{ branch: pr7.branch, head: pr7.head }],
			number: 8,
		}
		const run2 = fakeIO(afterRun1)
		await runPublish({ ...INPUT, envelopeText: next }, run2.io)
		expect(run2.commits).toEqual([floorCommit])
		expect(run2.calls.at(-1)).toBe("close #7: Superseded by #8.")
		expect(run2.bodies[0]).toContain("- it drops a token or flags a pair against the list of #7\n")

		const keeps = envelopeFor(NEXT, [pair(1), pair(2)], [pair(3)])
		const control = fakeIO(afterRun1)
		await runPublish({ ...INPUT, envelopeText: keeps }, control.io)
		expect(control.commits).toEqual([[{ path: ENVELOPE_PATH, text: keeps }]])

		// A re-run finds PR 7 closed unmerged and reaches the same decision, so it writes nothing.
		const branch = `${BRANCH_PREFIX}${NEXT}`
		const head = "c".repeat(40)
		const rerunState = {
			...afterRun1,
			heads: { [branch]: head },
			files: { ...afterRun1.files, ...at(head, next), [`${head}:${FLOOR_PATH}`]: floorText(NEXT) },
			prs: [
				{ ...pr7, open: false },
				{ ...prOn(8, NEXT), head },
			],
		}
		const rerun = fakeIO(rerunState)
		expect(await runPublish({ ...INPUT, envelopeText: next }, rerun.io)).toBe(8)
		expect(rerun.calls).toEqual([])
		// Its own PR closed: a closed PR is never found, so the run opens a new one.
		const reopened = fakeIO({
			...rerunState,
			prs: [
				{ ...pr7, open: false },
				{ ...prOn(8, NEXT, false), head },
			],
			number: 9,
		})
		expect(await runPublish({ ...INPUT, envelopeText: next }, reopened.io)).toBe(9)
		expect(reopened.calls).toEqual([`open ${branch} "chore(token-list): publish sequence ${NEXT}"`])
	})

	const added = (sequence: number) => envelopeFor(sequence, [pair(1), pair(2)], [pair(3)])
	test.each([
		[
			"a PR closed earlier, read at its head with its branch gone",
			{ prs: [prOn(7, 1770000000, false)] },
			at(prOn(7, 0).head, added(1770000000)),
			"the list of #7",
		],
		[
			"a publish branch with no PR",
			{ branches: [{ branch: `${BRANCH_PREFIX}1770000000`, head: "e".repeat(40) }] },
			at("e".repeat(40), added(1770000000)),
			`the list of branch \`${BRANCH_PREFIX}1770000000\``,
		],
		["a PR exactly at the floor", { prs: [prOn(7, FLOOR, false)] }, at(prOn(7, 0).head, added(FLOOR)), "the list of #7"],
		[
			"a list that unflagged a pair the next list flags again",
			{ prs: [prOn(7, 1770000000, false)] },
			at(prOn(7, 0).head, envelopeFor(1770000000, [pair(1)])),
			"the list of #7",
		],
	])("%s raises the floor", async (_name, state, files, reason) => {
		const { io, commits, bodies, calls } = fakeIO({ ...state, files: { ...base, ...files } })
		await runPublish({ ...INPUT, envelopeText: next }, io)
		expect(commits).toEqual([floorCommit])
		expect(bodies[0]).toContain(`- it drops a token or flags a pair against ${reason}\n`)
		expect(calls.filter((call) => call.startsWith("close"))).toEqual([])
	})

	test("lists below the floor, at or above this sequence, or on a non-canonical branch are not read", async () => {
		const prs = [
			prOn(7, FLOOR - 1, false),
			prOn(8, NEXT, false),
			prOn(9, NEXT + 1, false),
			{ ...prOn(10, 0, false), branch: `${BRANCH_PREFIX}0${FLOOR}` },
		]
		const { io, commits, calls } = fakeIO({ files: base, prs })
		await runPublish({ ...INPUT, envelopeText: next }, io)
		expect(commits).toEqual([[{ path: ENVELOPE_PATH, text: next }]])
		expect(calls.filter((call) => call.startsWith("close"))).toEqual([])
	})

	test.each([
		["no file at its head", {}],
		["a file that is not an envelope", at(prOn(7, 0).head, "{}")],
		["an envelope of another sequence than its branch names", at(prOn(7, 0).head, envelopeFor(1765000000, [pair(1)], [pair(3)]))],
	])("a list in range with %s raises the floor", async (_name, files) => {
		const { io, commits, bodies } = fakeIO({ files: { ...base, ...files }, prs: [prOn(7, 1770000000, false)] })
		await runPublish({ ...INPUT, envelopeText: next }, io)
		expect(commits).toEqual([floorCommit])
		expect(bodies[0]).toContain("- the list of #7 cannot be read\n")
	})

	test.each([
		["a canonical floor", floorText(5), 5],
		["no file", null, 0],
		["not JSON", "x", 0],
		["a null sequence", '{"sequence":null}', 0],
		["a string sequence", '{"sequence":"5"}', 0],
		["an unsafe sequence", `{"sequence":${2 ** 53}}`, 0],
	])("floorSequence reads %s as %s", (_name, text, sequence) => {
		expect(floorSequence(text)).toBe(sequence)
	})

	test("the GitHub IO pages through every PR and refuses a page that is not a list", async () => {
		const pull = (number: number, ref: string) => ({
			number,
			state: "closed",
			merged_at: null,
			head: { ref, sha: `${number}`.padStart(40, "s"), repo: { full_name: "nulo-sh/nulo" } },
		})
		const pages = [Array.from({ length: 100 }, (_, i) => pull(i + 1, `feat/${i}`)), [pull(200, `${BRANCH_PREFIX}1770000000`)]]
		const urls: string[] = []
		try {
			vi.stubGlobal("fetch", async (url: string) => {
				urls.push(url)
				return Response.json(pages[Number(new URL(url).searchParams.get("page")) - 1])
			})
			expect(await githubIO("nulo-sh/nulo", "t").unmergedPublishPrs()).toEqual([
				{ number: 200, branch: `${BRANCH_PREFIX}1770000000`, head: "200".padStart(40, "s"), open: false },
			])
			expect(urls).toHaveLength(2)
			vi.stubGlobal("fetch", async () => Response.json({ message: "Not Found" }, { status: 404 }))
			await expect(githubIO("nulo-sh/nulo", "t").unmergedPublishPrs()).rejects.toThrow("not a list")
		} finally {
			vi.unstubAllGlobals()
		}
	})

	test("a listing that fails stops the run before any write", async () => {
		const { io, calls } = fakeIO({ files: base })
		io.unmergedPublishPrs = async () => {
			throw new Error("GET pulls: HTTP 502")
		}
		await expect(runPublish({ ...INPUT, envelopeText: next }, io)).rejects.toThrow("HTTP 502")
		expect(calls).toEqual([])
	})
})

describe("the floor", () => {
	const pair = (n: number) => ({ chainId: 1, address: `0x${n}` })
	const list = (tokens: number[], flagged: number[] = []) => ({ tokens: tokens.map(pair), flagged: flagged.map(pair) })

	test.each([
		["a delisting", true, list([1, 2]), list([1])],
		["a new flag", true, list([1]), list([1], [2])],
		["a first publish with flags", true, list([]), list([1], [2])],
		["an addition", false, list([1]), list([1, 2])],
		["a re-listing", false, list([1], [2]), list([1, 2])],
		["an unflag", false, list([1], [2]), list([1])],
	])("%s raises it: %s", (_name, raises, served, next) => {
		expect(raisesFloor(served, next)).toBe(raises)
	})
})

describe("the prepare summary", () => {
	const token = (n: number, over: Partial<TokenListEntry> = {}): TokenListEntry => ({
		chainId: 1,
		address: `0x${n.toString(16).padStart(64, "0")}`,
		classId: `0x${"1".repeat(64)}`,
		symbol: `T${n}`,
		decimals: 6,
		name: `Token ${n}`,
		...over,
	})

	test("diffs by (chainId, address) and escapes table cells", () => {
		const diff = tokenDiff([token(1), token(2)], [token(2, { name: "Renamed | x" }), token(3)])
		expect(diff.added.map((t) => t.symbol)).toEqual(["T3"])
		expect(diff.removed.map((t) => t.symbol)).toEqual(["T1"])
		expect(diff.changed.map(({ from, to }) => [from.name, to.name])).toEqual([["Token 2", "Renamed | x"]])
		expect(renderDiff(diff)).toContain("Renamed \\| x")
		expect(renderDiff(tokenDiff([token(1)], [token(1)]))).toBe("No token changes against the served list.\n")
	})

	test("shows the signed text verbatim, with no markup the approver cannot see", () => {
		const rendered = renderDiff(tokenDiff([], [token(1, { name: "Test USDC<!--hidden-->", symbol: "`x`" })]))
		expect(rendered).toContain("Test USDC\\<\\!\\-\\-hidden\\-\\-\\>")
		expect(rendered).toContain("\\`x\\`")
		expect(rendered).not.toContain("<!--")
	})

	test("lists every file the publish workflow runs and every repository file those import", () => {
		const workflow = ".github/workflows/publish-token-list.yml"
		const entries = [...readFileSync(join(REPO_ROOT, workflow), "utf8").matchAll(/\b(?:infra|packages)\/[\w./-]+\.ts\b/g)].map(
			([entry]) => entry,
		)
		expect(entries).toEqual(expect.arrayContaining(["infra/token-list/scripts/summary.ts", "infra/token-list/scripts/live-check.ts"]))
		const resolve = (file: string, specifier: string) => {
			if (specifier.startsWith(".")) return `${join(dirname(file), specifier)}${extname(specifier) === "" ? ".ts" : ""}`
			expect(specifier).toMatch(/^@nulo\/token-list(\/[a-z-]+)?$/)
			return `packages/token-list/src/${specifier.replace(/^@nulo\/token-list\/?/, "") || "index"}.ts`
		}
		const imports = (file: string) => (file.endsWith(".json") ? [] : specifiers(file, readFileSync(join(REPO_ROOT, file), "utf8")))
		const closure = (roots: readonly string[]) => {
			const seen = new Set<string>()
			const visit = (file: string) => {
				if (seen.has(file)) return
				seen.add(file)
				for (const specifier of imports(file)) visit(resolve(file, specifier))
			}
			for (const root of roots) visit(root)
			return seen
		}
		// `prepare` reaches `check.ts` through the host's `check` script.
		const files = [workflow, "infra/token-list/package.json", ...closure([...entries, "infra/token-list/scripts/check.ts"])]
		expect(files).toContain("packages/token-list/src/floor.json")
		expect(files.filter((file) => !SIGNING_PATHS.some((path) => file === path || file.startsWith(`${path}/`)))).toEqual([])
		// `publish-pr` installs nothing, so its closure imports only `node:` builtins and relative files.
		const publishPr = closure(["infra/token-list/scripts/open-publish-pr.ts"])
		expect(publishPr).toContain("infra/token-list/scripts/floor.ts")
		for (const file of publishPr) {
			expect(
				imports(file).filter((specifier) => !specifier.startsWith(".")),
				file,
			).toEqual([])
		}
	})

	test("the import scan reads a side-effect import and refuses a run-time load", () => {
		expect(specifiers("x.ts", 'import "pkg"\nimport { a } from "./a"\nexport { b } from "node:fs"')).toEqual(["pkg", "./a"])
		for (const text of [`await import("pkg")`, `require("pkg")`])
			expect(() => specifiers("x.ts", text)).toThrow("loads a module at run time")
	})

	test("diffs flags by (chainId, address) and renders each change", () => {
		const pair = (n: number, chainId = 1) => ({ chainId, address: token(n).address })
		const diff = flagDiff([pair(1), pair(2)], [pair(2), pair(1, 2)])
		expect(diff).toEqual({ added: [pair(1, 2)], removed: [pair(1)] })
		expect(renderFlagDiff(diff).split("\n").slice(2, 4)).toEqual([
			`| + | 2 | \`${pair(1).address}\` |`,
			`| − | 1 | \`${pair(1).address}\` |`,
		])
		expect(renderFlagDiff(flagDiff([pair(1)], [pair(1)]))).toBe("No flag changes against the served list.\n")
	})

	test("reads the served envelope's tokens and flags, and none before the first publish", () => {
		const flagged = [{ chainId: 1, address: token(9).address }]
		expect(publishedList(undefined)).toEqual({ tokens: [], flagged: [] })
		expect(publishedList(envelopeFor(5, [token(4)]))).toEqual({ tokens: [token(4)], flagged: [] })
		expect(publishedList(envelopeFor(5, [token(4)], flagged))).toEqual({ tokens: [token(4)], flagged })
	})
})
