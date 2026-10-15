import { readFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import type { TokenListEntry } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { FLOOR_PATH, floorText, raisesFloor } from "../scripts/floor"
import {
	BRANCH_PREFIX,
	ENVELOPE_PATH,
	envelopeMeta,
	type PublishFile,
	type PublishIO,
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

function fakeIO(state: { heads?: Record<string, string>; files?: Record<string, string>; open?: { number: number; branch: string }[] }) {
	const calls: string[] = []
	const commits: (readonly PublishFile[])[] = []
	const io: PublishIO = {
		branchHead: async (branch) => state.heads?.[branch] ?? null,
		createBranch: async (branch, sha) => void calls.push(`branch ${branch}@${sha.slice(0, 4)}`),
		read: async (path, commit) => state.files?.[`${commit}:${path}`] ?? null,
		commit: async (branch, head, files, headline) => {
			commits.push(files)
			calls.push(`commit ${branch}@${head.slice(0, 4)} ${files.map((file) => file.path).join(" + ")} "${headline}"`)
		},
		openPublishPrs: async () => state.open ?? [],
		openPr: async (branch, title) => {
			calls.push(`open ${branch} "${title}"`)
			return 99
		},
		close: async (number, comment) => void calls.push(`close #${number}: ${comment}`),
		log: () => {},
	}
	return { io, calls, commits }
}

describe("open-publish-pr", () => {
	test("branches from the signed commit, commits the envelope, opens the PR and closes older publish PRs", async () => {
		const { io, calls } = fakeIO({
			open: [
				{ number: 7, branch: `${BRANCH_PREFIX}1700000000` },
				{ number: 8, branch: `${BRANCH_PREFIX}1800000000` },
				{ number: 9, branch: "feat/other" },
			],
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
			open: [{ number: 12, branch }],
		})
		expect(await runPublish({ ...INPUT, envelopeText }, io)).toBe(12)
		expect(calls).toEqual([])
	})

	test("counts only this repository's publish branches, never a fork's of the same name", () => {
		const branch = `${BRANCH_PREFIX}1760000000`
		const pull = (number: number, ref: string, repo: string | null) => ({
			number,
			head: { ref, repo: repo === null ? null : { full_name: repo } },
		})
		const pulls = [
			pull(1, branch, "fork/nulo"),
			pull(2, branch, null),
			pull(3, "feat/x", "nulo-sh/nulo"),
			pull(4, branch, "nulo-sh/nulo"),
		]
		expect(publishPrs(pulls, "nulo-sh/nulo")).toEqual([{ number: 4, branch }])
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
		const rerun = fakeIO({ heads: { [branch]: head }, files: onBranch, open: [{ number: 12, branch }] })
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

	test("the PR body names the floor only when the list raises it", () => {
		const input = { ...INPUT, envelopeText: envelopeFor(5) }
		expect(prBody(input, "nulo-ci-1", 5, true)).toContain(`(\`${FLOOR_PATH}\`) to 5`)
		expect(prBody(input, "nulo-ci-1", 5, false)).not.toContain(FLOOR_PATH)
	})

	test("refuses a file that is not an envelope with a sequence", () => {
		expect(() => envelopeMeta("{}")).toThrow("not a token list envelope")
		expect(() => envelopeMeta(envelopeFor(0))).toThrow("no sequence")
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
		expect(entries).toContain("infra/token-list/scripts/summary.ts")
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
