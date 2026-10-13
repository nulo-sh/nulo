/**
 * The `prepare` job's step summary: what the owner approves when the `sign` job asks. It shows the
 * token diff against the served envelope, the tokens digest `sign` will refuse to differ from, and
 * every signing-relevant change since the last publish, because the environment approves a run and
 * does not vet the code that run executes.
 *
 *   bun infra/token-list/scripts/summary.ts   (writes `tokens_sha256` to $GITHUB_OUTPUT when set)
 */
import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { TokenListEntry } from "@nulo/token-list"
import { decodeBase64Url } from "@nulo/token-list/envelope"
import { checkSource, checkTokens } from "@nulo/token-list/parse"
import { tokensSha256 } from "@nulo/token-list/sign"
import { ENVELOPE, HOST_ROOT, SOURCE } from "./check"

const REPO_ROOT = join(HOST_ROOT, "..", "..")
/** Everything that decides what gets signed, or runs beside the secret. */
export const SIGNING_PATHS = [
	".github/workflows/publish-token-list.yml",
	".github/actions/setup-bun",
	"bunfig.toml",
	"packages/token-list/src",
	"infra/token-list/list.source.json",
	"infra/token-list/scripts/open-publish-pr.ts",
]

export type TokenDiff = { added: TokenListEntry[]; removed: TokenListEntry[]; changed: { from: TokenListEntry; to: TokenListEntry }[] }

const keyOf = (t: TokenListEntry) => `${t.chainId}:${t.address}`

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

/** The served envelope's tokens, decoded without verification: this is a display of what changes. */
export function publishedTokens(envelopeText: string | undefined): TokenListEntry[] {
	if (envelopeText === undefined) return []
	const payload = decodeBase64Url((JSON.parse(envelopeText) as { payload: string }).payload)
	if (!payload) throw new Error(`${ENVELOPE}: undecodable payload`)
	return checkTokens((JSON.parse(new TextDecoder().decode(payload)) as { tokens: unknown }).tokens, "published.tokens", "wallet")
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("`", "'")
const row = (sign: string, t: TokenListEntry) =>
	`| ${sign} | ${t.chainId} | \`${t.address}\` | ${cell(t.symbol)} | ${cell(t.name)} | ${t.decimals} | ${t.priceId ?? "unpriced"} | \`${t.classId.slice(0, 10)}…\` |`

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
	const { tokens } = checkSource(JSON.parse(readFileSync(join(HOST_ROOT, SOURCE), "utf8")))
	const envelope = join(HOST_ROOT, ENVELOPE)
	const published = publishedTokens(existsSync(envelope) ? readFileSync(envelope, "utf8") : undefined)
	const digest = await tokensSha256(tokens)
	process.stdout.write(
		[
			"## Token list: review before approving `sign`",
			"",
			`Tokens sha256 (\`sign\` refuses any other set): \`${digest}\``,
			"",
			"### Token changes",
			"",
			renderDiff(tokenDiff(published, tokens)),
			"### Signing-relevant changes",
			"",
			signingChanges(),
		].join("\n"),
	)
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tokens_sha256=${digest}\n`)
}
