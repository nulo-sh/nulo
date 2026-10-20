/** Node builtins, fetch and `./floor` only: the `publish-pr` job runs this with `bun --no-install` beside an App token. */
import { readFileSync } from "node:fs"
import { FLOOR_PATH, floorSequence, floorText, type ListPairs, raisesFloor } from "./floor"

export const ENVELOPE_PATH = "infra/token-list/public/v1/list.json"
export const BRANCH_PREFIX = "token-list-publish-"
const TRUNK = "dev"
const PAGE = 100

export type PublishPr = { number: number; branch: string; head: string; open: boolean }
export type PublishBranch = { branch: string; head: string }

export interface PublishIO {
	branchHead(branch: string): Promise<string | null>
	createBranch(branch: string, sha: string): Promise<void>
	/** A file's text at a commit, or null when absent. */
	read(path: string, commit: string): Promise<string | null>
	/** Commits every file in one commit, only while `branch` still points at `expectedHead`; GitHub signs it, as `dev` requires. */
	commit(branch: string, expectedHead: string, files: readonly PublishFile[], headline: string): Promise<void>
	/** Publish PRs into `dev`, open or closed unmerged, with their head commit. */
	unmergedPublishPrs(): Promise<PublishPr[]>
	/** Every publish branch, with its head commit. */
	publishBranches(): Promise<PublishBranch[]>
	openPr(branch: string, title: string, body: string): Promise<number>
	close(prNumber: number, comment: string): Promise<void>
	log(message: string): void
}

export type PublishFile = { path: string; text: string }

export type PublishInput = { envelopeText: string; baseSha: string; runUrl: string; payloadSha256: string; tokensSha256: string }

function pairsOf(value: unknown): ListPairs["tokens"] {
	if (!Array.isArray(value)) throw new Error("the envelope's tokens or flags are not a list")
	return value.map((pair: { chainId?: unknown; address?: unknown }) => ({ chainId: pair?.chainId, address: pair?.address }))
}

/** The envelope's key id, sequence and token and flag pairs, read without verifying: the PR's CI verifies it. */
export function envelopeMeta(text: string): { keyId: string; sequence: number; pairs: ListPairs } {
	const envelope = JSON.parse(text) as { keyId?: unknown; payload?: unknown }
	if (typeof envelope.keyId !== "string" || typeof envelope.payload !== "string") throw new Error("not a token list envelope")
	const json = atob(envelope.payload.replaceAll("-", "+").replaceAll("_", "/"))
	const { sequence, tokens, flagged = [] } = JSON.parse(json) as { sequence?: unknown; tokens?: unknown; flagged?: unknown }
	if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("the envelope has no sequence")
	return { keyId: envelope.keyId, sequence, pairs: { tokens: pairsOf(tokens), flagged: pairsOf(flagged) } }
}

/** The sequence a publish branch names, or null unless it is canonical decimal and a safe integer. */
function sequenceOf(branch: string): number | null {
	const digits = branch.slice(BRANCH_PREFIX.length)
	if (!branch.startsWith(BRANCH_PREFIX) || !/^[1-9][0-9]*$/.test(digits)) return null
	const sequence = Number(digits)
	return Number.isSafeInteger(sequence) ? sequence : null
}

export function prBody(input: PublishInput, keyId: string, sequence: number, raisedBy: readonly string[]): string {
	const floor = [
		`This list sets the compiled sequence floor (\`${FLOOR_PATH}\`) to ${sequence}, so every wallet built after this merges refuses any older list:`,
		...raisedBy.map((reason) => `- ${reason}`),
		"",
		"That file runs the extension e2e lanes on this PR.",
		"",
	]
	return [
		`Publishes token list sequence ${sequence}, signed with \`${keyId}\` by ${input.runUrl}.`,
		"",
		`- payload sha256: \`${input.payloadSha256}\``,
		`- tokens and flags sha256: \`${input.tokensSha256}\` (the set the approver was shown)`,
		"",
		...(raisedBy.length > 0 ? floor : []),
		"The tree tests in `quality-status` verify this envelope against the pinned keys and parse it strictly.",
		"Once merged, Workers Builds deploys `dev` and https://tokens.nulo.sh/v1/list.json serves it.",
	].join("\n")
}

type Pull = {
	number: number
	state: string
	merged_at: string | null
	head: { ref: string; sha: string; repo: { full_name: string } | null }
}

/** A fork can name its branch like ours, so only this repository's branches count as publish PRs; a merged one was served. */
export function publishPrs(pulls: readonly Pull[], repo: string): PublishPr[] {
	return pulls
		.filter((pr) => pr.head.repo?.full_name === repo && pr.head.ref.startsWith(BRANCH_PREFIX) && pr.merged_at === null)
		.map((pr) => ({ number: pr.number, branch: pr.head.ref, head: pr.head.sha, open: pr.state === "open" }))
}

/**
 * The run's base must still hold the envelope `dev` serves: a run approved on a stale diff could miss
 * a delisting, so it stops before any write.
 */
async function servedPairs(io: PublishIO, baseSha: string): Promise<ListPairs> {
	const served = await io.read(ENVELOPE_PATH, baseSha)
	if ((await io.read(ENVELOPE_PATH, TRUNK)) !== served) {
		throw new Error(`${TRUNK} serves another list than this run's base: close any stale publish PR and re-dispatch`)
	}
	return served === null ? { tokens: [], flagged: [] } : envelopeMeta(served).pairs
}

/**
 * Each list a publish PR or branch carries at its head, signed from `floor` up to but not including
 * `sequence`, by head commit. Below the floor every build already refuses it; at or above `sequence`,
 * this list's floor could not.
 */
function unservedHeads(prs: readonly PublishPr[], branches: readonly PublishBranch[], floor: number, sequence: number) {
	const heads = new Map<string, { name: string; sequence: number }>()
	const named = [
		...prs.map((pr) => ({ ...pr, name: `#${pr.number}` })),
		...branches.map((branch) => ({ ...branch, name: `branch \`${branch.branch}\`` })),
	]
	for (const { branch, head, name } of named) {
		const listed = sequenceOf(branch)
		if (listed !== null && listed >= floor && listed < sequence && !heads.has(head)) heads.set(head, { name, sequence: listed })
	}
	return heads
}

function metaOrNull(text: string | null): ReturnType<typeof envelopeMeta> | null {
	try {
		return text === null ? null : envelopeMeta(text)
	} catch {
		return null
	}
}

type FloorRun = { baseSha: string; served: ListPairs; prs: readonly PublishPr[]; sequence: number; next: ListPairs }

/**
 * Why this list raises the floor, or nothing. Every list at a publish PR's or branch's head was signed
 * even when `dev` never served it, so it counts as the served list does. A list there that cannot be
 * read, or names another sequence than its branch, counts as raising: nothing shows it would not.
 */
async function floorRaisedBy(io: PublishIO, run: FloorRun): Promise<string[]> {
	const { baseSha, served, prs, sequence, next } = run
	const drops = "it drops a token or flags a pair against"
	const raisedBy = raisesFloor(served, next) ? [`${drops} the list \`${TRUNK}\` serves`] : []
	const floor = floorSequence(await io.read(FLOOR_PATH, baseSha))
	const heads = unservedHeads(prs, await io.publishBranches(), floor, sequence)
	for (const [head, { name, sequence: listed }] of heads) {
		const meta = metaOrNull(await io.read(ENVELOPE_PATH, head))
		if (meta === null || meta.sequence !== listed) {
			io.log(`the list of ${name} cannot be read, so it raises the floor`)
			raisedBy.push(`the list of ${name} cannot be read`)
		} else if (raisesFloor(meta.pairs, next)) raisedBy.push(`${drops} the list of ${name}`)
	}
	return raisedBy
}

export async function runPublish(input: PublishInput, io: PublishIO): Promise<number> {
	const { keyId, sequence, pairs } = envelopeMeta(input.envelopeText)
	const served = await servedPairs(io, input.baseSha)
	const prs = await io.unmergedPublishPrs()
	const raisedBy = await floorRaisedBy(io, { baseSha: input.baseSha, served, prs, sequence, next: pairs })
	const files: PublishFile[] = [{ path: ENVELOPE_PATH, text: input.envelopeText }]
	if (raisedBy.length > 0) files.push({ path: FLOOR_PATH, text: floorText(sequence) })
	const branch = `${BRANCH_PREFIX}${sequence}`
	const title = `chore(token-list): publish sequence ${sequence}`
	let head = await io.branchHead(branch)
	if (head === null) {
		await io.createBranch(branch, input.baseSha)
		head = input.baseSha
	}
	const current = await Promise.all(files.map((file) => io.read(file.path, head)))
	if (files.some((file, i) => current[i] !== file.text)) await io.commit(branch, head, files, title)
	// A closed PR feeds the floor only: it is never found, commented on or closed again.
	const open = prs.filter((pr) => pr.open)
	const number =
		open.find((pr) => pr.branch === branch)?.number ?? (await io.openPr(branch, title, prBody(input, keyId, sequence, raisedBy)))
	for (const pr of open) {
		const older = sequenceOf(pr.branch)
		if (older !== null && older < sequence) await io.close(pr.number, `Superseded by #${number}.`)
	}
	io.log(`publish PR #${number} carries sequence ${sequence}`)
	return number
}

export function githubIO(repo: string, token: string): PublishIO {
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
		async commit(branch, expectedHead, files, headline) {
			const query = "mutation ($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }"
			const input = {
				branch: { repositoryNameWithOwner: repo, branchName: branch },
				expectedHeadOid: expectedHead,
				message: { headline },
				fileChanges: { additions: files.map(({ path, text }) => ({ path, contents: Buffer.from(text).toString("base64") })) },
			}
			const body = await json<{ data?: { createCommitOnBranch?: { commit?: { oid?: string } } }; errors?: { message?: string }[] }>(
				call("graphql", { method: "POST", body: JSON.stringify({ query, variables: { input } }) }),
			)
			if (!body.data?.createCommitOnBranch?.commit?.oid) {
				throw new Error(`createCommitOnBranch: ${body.errors?.map((e) => e.message).join("; ") || "no commit returned"}`)
			}
		},
		async unmergedPublishPrs() {
			const pulls: Pull[] = []
			for (let page = 1; ; page++) {
				const batch = await json<unknown>(call(`repos/${repo}/pulls?state=all&base=dev&per_page=${PAGE}&page=${page}`))
				// A 404 answers an object: without this a wrong repository would page until the job's timeout.
				if (!Array.isArray(batch)) throw new Error("GET pulls: not a list")
				pulls.push(...(batch as Pull[]))
				if (batch.length < PAGE) return publishPrs(pulls, repo)
			}
		},
		async publishBranches() {
			const refs = await json<unknown>(call(`repos/${repo}/git/matching-refs/heads/${BRANCH_PREFIX}`))
			if (!Array.isArray(refs)) throw new Error("GET matching-refs: not a list")
			return (refs as { ref: string; object: { sha: string } }[]).map((ref) => ({
				branch: ref.ref.replace(/^refs\/heads\//, ""),
				head: ref.object.sha,
			}))
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
