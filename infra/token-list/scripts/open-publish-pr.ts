/** Node builtins and fetch only: the `publish-pr` job runs this with `bun --no-install` beside an App token. */
import { readFileSync } from "node:fs"

export const ENVELOPE_PATH = "infra/token-list/public/v1/list.json"
export const BRANCH_PREFIX = "token-list-publish-"

export interface PublishIO {
	branchHead(branch: string): Promise<string | null>
	createBranch(branch: string, sha: string): Promise<void>
	/** A file's text at a commit, or null when absent. */
	read(path: string, commit: string): Promise<string | null>
	/** Commits `text` to `path` only while `branch` still points at `expectedHead`; GitHub signs it, as `dev` requires. */
	commit(branch: string, expectedHead: string, path: string, text: string, headline: string): Promise<void>
	/** Open publish PRs into `dev`, by head branch. */
	openPublishPrs(): Promise<{ number: number; branch: string }[]>
	openPr(branch: string, title: string, body: string): Promise<number>
	close(prNumber: number, comment: string): Promise<void>
	log(message: string): void
}

export type PublishInput = { envelopeText: string; baseSha: string; runUrl: string; payloadSha256: string; tokensSha256: string }

/** The envelope's key id and sequence, read without verifying: the PR's CI verifies it. */
export function envelopeMeta(text: string): { keyId: string; sequence: number } {
	const envelope = JSON.parse(text) as { keyId?: unknown; payload?: unknown }
	if (typeof envelope.keyId !== "string" || typeof envelope.payload !== "string") throw new Error("not a token list envelope")
	const json = atob(envelope.payload.replaceAll("-", "+").replaceAll("_", "/"))
	const sequence = (JSON.parse(json) as { sequence?: unknown }).sequence
	if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("the envelope has no sequence")
	return { keyId: envelope.keyId, sequence }
}

export function prBody(input: PublishInput, keyId: string, sequence: number): string {
	return [
		`Publishes token list sequence ${sequence}, signed with \`${keyId}\` by ${input.runUrl}.`,
		"",
		`- payload sha256: \`${input.payloadSha256}\``,
		`- tokens and flags sha256: \`${input.tokensSha256}\` (the set the approver was shown)`,
		"",
		"The tree tests in `quality-status` verify this envelope against the pinned keys and parse it strictly.",
		"Once merged, Workers Builds deploys `dev` and https://tokens.nulo.sh/v1/list.json serves it.",
	].join("\n")
}

type Pull = { number: number; head: { ref: string; repo: { full_name: string } | null } }

/** A fork can name its branch like ours, so only this repository's branches count as publish PRs. */
export function publishPrs(pulls: readonly Pull[], repo: string): { number: number; branch: string }[] {
	return pulls
		.filter((pr) => pr.head.repo?.full_name === repo && pr.head.ref.startsWith(BRANCH_PREFIX))
		.map((pr) => ({ number: pr.number, branch: pr.head.ref }))
}

export async function runPublish(input: PublishInput, io: PublishIO): Promise<number> {
	const { keyId, sequence } = envelopeMeta(input.envelopeText)
	const branch = `${BRANCH_PREFIX}${sequence}`
	const title = `chore(token-list): publish sequence ${sequence}`
	let head = await io.branchHead(branch)
	if (head === null) {
		await io.createBranch(branch, input.baseSha)
		head = input.baseSha
	}
	if ((await io.read(ENVELOPE_PATH, head)) !== input.envelopeText) {
		await io.commit(branch, head, ENVELOPE_PATH, input.envelopeText, title)
	}
	const open = await io.openPublishPrs()
	const number = open.find((pr) => pr.branch === branch)?.number ?? (await io.openPr(branch, title, prBody(input, keyId, sequence)))
	for (const pr of open) {
		const older = Number(pr.branch.slice(BRANCH_PREFIX.length))
		if (pr.branch.startsWith(BRANCH_PREFIX) && older < sequence) await io.close(pr.number, `Superseded by #${number}.`)
	}
	io.log(`publish PR #${number} carries sequence ${sequence}`)
	return number
}

function githubIO(repo: string, token: string): PublishIO {
	const call = async (path: string, init: RequestInit = {}, accept = "application/vnd.github+json"): Promise<Response> => {
		const res = await fetch(`https://api.github.com/${path}`, {
			...init,
			headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" },
			signal: AbortSignal.timeout(60_000),
		})
		if (!res.ok && res.status !== 404) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]}: HTTP ${res.status}`)
		return res
	}
	const json = async <T>(res: Promise<Response>): Promise<T> => (await res).json() as Promise<T>
	return {
		async branchHead(branch) {
			const res = await call(`repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`)
			return res.status === 404 ? null : ((await res.json()) as { object: { sha: string } }).object.sha
		},
		async createBranch(branch, sha) {
			await call(`repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) })
		},
		async read(path, commit) {
			const res = await call(`repos/${repo}/contents/${path}?ref=${commit}`, {}, "application/vnd.github.raw+json")
			return res.status === 404 ? null : res.text()
		},
		async commit(branch, expectedHead, path, text, headline) {
			const query = "mutation ($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }"
			const input = {
				branch: { repositoryNameWithOwner: repo, branchName: branch },
				expectedHeadOid: expectedHead,
				message: { headline },
				fileChanges: { additions: [{ path, contents: Buffer.from(text).toString("base64") }] },
			}
			const body = await json<{ data?: { createCommitOnBranch?: { commit?: { oid?: string } } }; errors?: { message?: string }[] }>(
				call("graphql", { method: "POST", body: JSON.stringify({ query, variables: { input } }) }),
			)
			if (!body.data?.createCommitOnBranch?.commit?.oid) {
				throw new Error(`createCommitOnBranch: ${body.errors?.map((e) => e.message).join("; ") || "no commit returned"}`)
			}
		},
		async openPublishPrs() {
			return publishPrs(await json<Pull[]>(call(`repos/${repo}/pulls?state=open&base=dev&per_page=100`)), repo)
		},
		async openPr(branch, title, body) {
			const pr = await json<{ number: number }>(
				call(`repos/${repo}/pulls`, { method: "POST", body: JSON.stringify({ title, head: branch, base: "dev", body }) }),
			)
			return pr.number
		},
		async close(prNumber, comment) {
			await call(`repos/${repo}/issues/${prNumber}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) })
			await call(`repos/${repo}/pulls/${prNumber}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) })
		},
		log: (message) => console.log(message),
	}
}

if (import.meta.main) {
	const env = process.env
	try {
		await runPublish(
			{
				envelopeText: readFileSync(env.ENVELOPE_FILE ?? "", "utf8"),
				baseSha: env.BASE_SHA ?? "",
				runUrl: env.RUN_URL ?? "",
				payloadSha256: env.PAYLOAD_SHA256 ?? "",
				tokensSha256: env.TOKENS_SHA256 ?? "",
			},
			githubIO(env.GITHUB_REPOSITORY ?? "", env.GH_TOKEN ?? ""),
		)
	} catch (error) {
		console.log(`::error::${error instanceof Error ? error.message : "publish failed"}`)
		process.exit(1)
	}
}
