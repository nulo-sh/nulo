import type { TokenListEntry } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { BRANCH_PREFIX, ENVELOPE_PATH, envelopeMeta, type PublishIO, runPublish } from "../scripts/open-publish-pr"
import { publishedTokens, renderDiff, tokenDiff } from "../scripts/summary"

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

	test("reads the served envelope's tokens, and none before the first publish", () => {
		expect(publishedTokens(undefined)).toEqual([])
		expect(publishedTokens(envelopeFor(5, [token(4)]))).toEqual([token(4)])
	})
})
