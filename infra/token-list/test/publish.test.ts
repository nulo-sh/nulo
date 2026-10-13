import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { TokenListEntry } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { BRANCH_PREFIX, ENVELOPE_PATH, envelopeMeta, type PublishIO, publishPrs, runPublish } from "../scripts/open-publish-pr"
import { publishedTokens, REPO_ROOT, renderDiff, SIGNING_PATHS, tokenDiff } from "../scripts/summary"

const b64url = (text: string) => btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
const envelopeFor = (sequence: number, tokens: unknown[] = []) =>
	`${JSON.stringify(
		{ format: "nulo-token-list-envelope/1", keyId: "nulo-ci-1", payload: b64url(JSON.stringify({ sequence, tokens })), signature: "x" },
		null,
		"\t",
	)}\n`
const INPUT = { baseSha: "b".repeat(40), runUrl: "https://github.com/nulo-sh/nulo/actions/runs/1", payloadSha256: "p", tokensSha256: "t" }

function fakeIO(state: { heads?: Record<string, string>; files?: Record<string, string>; open?: { number: number; branch: string }[] }) {
	const calls: string[] = []
	const io: PublishIO = {
		branchHead: async (branch) => state.heads?.[branch] ?? null,
		createBranch: async (branch, sha) => void calls.push(`branch ${branch}@${sha.slice(0, 4)}`),
		read: async (path, commit) => state.files?.[`${commit}:${path}`] ?? null,
		commit: async (branch, head, path, _text, headline) =>
			void calls.push(`commit ${branch}@${head.slice(0, 4)} ${path} "${headline}"`),
		openPublishPrs: async () => state.open ?? [],
		openPr: async (branch, title) => {
			calls.push(`open ${branch} "${title}"`)
			return 99
		},
		close: async (number, comment) => void calls.push(`close #${number}: ${comment}`),
		log: () => {},
	}
	return { io, calls }
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

	test("refuses a file that is not an envelope with a sequence", () => {
		expect(() => envelopeMeta("{}")).toThrow("not a token list envelope")
		expect(() => envelopeMeta(envelopeFor(0))).toThrow("no sequence")
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
			if (specifier.startsWith(".")) return `${join(dirname(file), specifier)}.ts`
			expect(specifier).toMatch(/^@nulo\/token-list(\/[a-z-]+)?$/)
			return `packages/token-list/src/${specifier.replace(/^@nulo\/token-list\/?/, "") || "index"}.ts`
		}
		const files = new Set([workflow, "infra/token-list/package.json"])
		const visit = (file: string) => {
			if (files.has(file)) return
			files.add(file)
			for (const [, specifier] of readFileSync(join(REPO_ROOT, file), "utf8").matchAll(/\bfrom\s+"([^"]+)"/g)) {
				if (!specifier.startsWith("node:")) visit(resolve(file, specifier))
			}
		}
		// `prepare` reaches `check.ts` through the host's `check` script.
		for (const entry of [...entries, "infra/token-list/scripts/check.ts"]) visit(entry)
		expect([...files].filter((file) => !SIGNING_PATHS.some((path) => file === path || file.startsWith(`${path}/`)))).toEqual([])
	})

	test("reads the served envelope's tokens, and none before the first publish", () => {
		expect(publishedTokens(undefined)).toEqual([])
		expect(publishedTokens(envelopeFor(5, [token(4)]))).toEqual([token(4)])
	})
})
