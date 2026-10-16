/**
 * The `prepare` job's step summary: what the owner approves when the `sign` job asks. It shows the
 * token and flag diffs against the served envelope, the digest of both `sign` will refuse to differ
 * from, and every signing-relevant change since the last publish, because the environment approves a run and
 * does not vet the code that run executes.
 *
 *   bun infra/token-list/scripts/summary.ts   (writes `tokens_sha256` to $GITHUB_OUTPUT when set)
 */
import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { TokenListEntry, TokenListPair } from "@nulo/token-list"
import { decodeBase64Url } from "@nulo/token-list/envelope"
import { checkFlagged, checkSource, checkTokens } from "@nulo/token-list/parse"
import { listSha256 } from "@nulo/token-list/sign"
import { ENVELOPE, HOST_ROOT, SOURCE } from "./check"
import { FLOOR_PATH, raisesFloor } from "./floor"

export const REPO_ROOT = join(HOST_ROOT, "..", "..")
/** Everything that decides what gets signed, what this summary shows, or what runs beside a secret. */
export const SIGNING_PATHS = [
	".github/workflows/publish-token-list.yml",
	".github/actions/setup-bun",
	"bunfig.toml",
	"packages/token-list/src",
	"infra/token-list/list.source.json",
	"infra/token-list/package.json",
	"infra/token-list/scripts",
]

export type TokenDiff = { added: TokenListEntry[]; removed: TokenListEntry[]; changed: { from: TokenListEntry; to: TokenListEntry }[] }

export type FlagDiff = { added: TokenListPair[]; removed: TokenListPair[] }

const keyOf = (t: TokenListPair) => `${t.chainId}:${t.address}`

export function tokenDiff(published: readonly TokenListEntry[], next: readonly TokenListEntry[]): TokenDiff {
	const before = new Map(published.map((t) => [keyOf(t), t]))
	const after = new Map(next.map((t) => [keyOf(t), t]))
	return {
		added: next.filter((t) => !before.has(keyOf(t))),
		removed: published.filter((t) => !after.has(keyOf(t))),
		changed: next.flatMap((to) => {
			const from = before.get(keyOf(to))
			return from && JSON.stringify(from) !== JSON.stringify(to) ? [{ from, to }] : []
		}),
	}
}

export function flagDiff(published: readonly TokenListPair[], next: readonly TokenListPair[]): FlagDiff {
	const before = new Set(published.map(keyOf))
	const after = new Set(next.map(keyOf))
	return { added: next.filter((p) => !before.has(keyOf(p))), removed: published.filter((p) => !after.has(keyOf(p))) }
}

/** The served envelope's tokens and flags, decoded without verification: this is a display of what changes. */
export function publishedList(envelopeText: string | undefined): { tokens: TokenListEntry[]; flagged: TokenListPair[] } {
	if (envelopeText === undefined) return { tokens: [], flagged: [] }
	const payload = decodeBase64Url((JSON.parse(envelopeText) as { payload: string }).payload)
	if (!payload) throw new Error(`${ENVELOPE}: undecodable payload`)
	const fields = JSON.parse(new TextDecoder().decode(payload)) as { tokens: unknown; flagged?: unknown }
	const tokens = checkTokens(fields.tokens, "published.tokens", "wallet")
	return { tokens, flagged: checkFlagged(fields.flagged, "published.flagged", "wallet", tokens) }
}

// Backslash-escaping every ASCII punctuation mark shows the signed text verbatim: no `<!-- -->` hides
// part of it, and no `|` or backtick reshapes the table.
export const cell = (text: string) => text.replace(/[!-/:-@[-`{-~]/g, "\\$&")
const row = (sign: string, t: TokenListEntry) =>
	`| ${sign} | ${t.chainId} | \`${t.address}\` | ${cell(t.symbol)} | ${cell(t.name)} | ${t.decimals} | ${t.priceId ?? "unpriced"} | \`${t.classId.slice(0, 10)}…\` |`

export function renderFlagDiff(diff: FlagDiff): string {
	const rows = [
		...diff.added.map((p) => `| + | ${p.chainId} | \`${p.address}\` |`),
		...diff.removed.map((p) => `| − | ${p.chainId} | \`${p.address}\` |`),
	]
	if (rows.length === 0) return "No flag changes against the served list.\n"
	return ["| | chainId | address |", "|---|---|---|", ...rows, ""].join("\n")
}

export function renderDiff(diff: TokenDiff): string {
	const rows = [
		...diff.added.map((t) => row("+", t)),
		...diff.removed.map((t) => row("−", t)),
		...diff.changed.flatMap(({ from, to }) => [row("was", from), row("now", to)]),
	]
	if (rows.length === 0) return "No token changes against the served list.\n"
	return ["| | chainId | address | symbol | name | decimals | price id | class |", "|---|---|---|---|---|---|---|---|", ...rows, ""].join(
		"\n",
	)
}

function git(args: string[]): string {
	const run = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" })
	if (run.status !== 0) throw new Error(`git ${args[0]}: ${run.stderr.trim()}`)
	return run.stdout.trim()
}

function signingChanges(): string {
	const last = git(["log", "-1", "--format=%H", "--", `infra/token-list/${ENVELOPE}`])
	if (last === "") {
		const log = git(["log", "--oneline", "-n", "50", "--", ...SIGNING_PATHS])
		return `First publish: the last 50 commits touching the signing paths.\n\n\`\`\`\n${log}\n\`\`\`\n`
	}
	const stat = git(["diff", "--stat", `${last}..HEAD`, "--", ...SIGNING_PATHS])
	const log = git(["log", "--oneline", `${last}..HEAD`, "--", ...SIGNING_PATHS])
	if (stat === "") return `No signing-relevant change since the last publish (${last.slice(0, 12)}).\n`
	return `Since the last publish (${last.slice(0, 12)}):\n\n\`\`\`\n${stat}\n\n${log}\n\`\`\`\n`
}

if (import.meta.main) {
	const { tokens, flagged = [] } = checkSource(JSON.parse(readFileSync(join(HOST_ROOT, SOURCE), "utf8")))
	const envelope = join(HOST_ROOT, ENVELOPE)
	const published = publishedList(existsSync(envelope) ? readFileSync(envelope, "utf8") : undefined)
	const digest = await listSha256({ tokens, flagged })
	process.stdout.write(
		[
			"## Token list: review before approving `sign`",
			"",
			`Tokens and flags sha256 (\`sign\` refuses any other set): \`${digest}\``,
			"",
			"### Token changes",
			"",
			renderDiff(tokenDiff(published.tokens, tokens)),
			"### Flag changes",
			"",
			renderFlagDiff(flagDiff(published.flagged, flagged)),
			`Raises the compiled floor: ${raisesFloor(published, { tokens, flagged }) ? `yes. The publish PR sets \`${FLOOR_PATH}\` to the signed sequence, and every wallet built after it refuses an older list.` : "no."}`,
			"",
			"### Signing-relevant changes",
			"",
			signingChanges(),
		].join("\n"),
	)
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tokens_sha256=${digest}\n`)
}
