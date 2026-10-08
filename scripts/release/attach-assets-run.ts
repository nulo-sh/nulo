/**
 * The I/O around attach-assets.ts, as the three commands the release and nightly publish jobs run:
 *
 *   plan                                     writes the chosen `action`; exits 1 on a refusal
 *   apply --expect publish [--target <sha>]  pins the tag, fills a draft, checks it, publishes it,
 *                                            checks it again; `--target` creates a nightly's tag
 *   verify-published                         checks a published release's assets against their
 *                                            attestation and SHASUMS256.txt, and writes their `dir`
 *
 * Environment: TAG, VERSION, SHA (the tag's commit), GITHUB_SHA, GITHUB_REPOSITORY, GH_TOKEN, and
 * NOTES (the release body's file) for apply and verify-published. The built assets are read from
 * dist/release. Every GitHub read and write is REST; only the attestation check runs `gh`.
 */

import { appendFileSync, mkdirSync } from "node:fs"
import { assetNames, compareAssets, type LocalAsset, parseShasums, planAttach, type ReleaseState, type RemoteAsset } from "./attach-assets"

export interface ReleaseRecord {
	id: number
	tag: string
	draft: boolean
	immutable: boolean
	assets: RemoteAsset[]
}

export interface AttachIO {
	/** Every release whose tag_name is `tag`, drafts included. */
	releasesFor(tag: string): Promise<ReleaseRecord[]>
	release(id: number): Promise<ReleaseRecord>
	/** The commit `refs/tags/<tag>` names, an annotated tag dereferenced; null when the ref does not exist. */
	tagCommit(tag: string): Promise<string | null>
	/** Creates `refs/tags/<tag>` at `sha`; false when the ref already exists. */
	createTagRef(tag: string, sha: string): Promise<boolean>
	createDraft(tag: string, prerelease: boolean): Promise<number>
	deleteAsset(id: number): Promise<void>
	uploadAsset(releaseId: number, name: string, path: string): Promise<void>
	editRelease(id: number, patch: { body?: string; draft?: boolean }): Promise<void>
	/** Whether GitHub holds any attestation for this digest in the repository. */
	attested(sha256: string): Promise<boolean>
	/** `gh attestation verify` with the identity the release notes print. */
	verifyAttestation(path: string, sourceDigest: string): Promise<boolean>
	downloadAsset(id: number, path: string): Promise<void>
	sha256(path: string): Promise<string>
	readText(path: string): Promise<string>
	wait(ms: number): Promise<void>
	output(key: string, value: string): void
	log(message: string): void
}

export interface RunInput {
	tag: string
	version: string
	workflowSha: string
	tagSha: string
	/** The directory holding the built assets. */
	dir: string
}

/** Where the release notes print the tagged commit for `gh attestation verify --source-digest`. */
export const SOURCE_COMMIT = "@SOURCE_COMMIT@"

/** Reads of a release whose state may still trail the write that changed it. */
const READS = 3

function fail(io: AttachIO, reason: string): 1 {
	io.log(`::error::${reason}`)
	return 1
}

async function localAssets(io: AttachIO, input: RunInput): Promise<LocalAsset[]> {
	return Promise.all(assetNames(input.version).map(async (name) => ({ name, sha256: await io.sha256(`${input.dir}/${name}`) })))
}

export async function readState(io: AttachIO, tag: string): Promise<ReleaseState> {
	const found = await io.releasesFor(tag)
	if (found.length > 1) return { kind: "ambiguous", count: found.length }
	const [release] = found
	if (!release) return { kind: "absent" }
	if (release.draft) return { kind: "draft", id: release.id, assets: release.assets }
	return { kind: "published", id: release.id, immutable: release.immutable, assets: release.assets }
}

async function decide(io: AttachIO, input: RunInput) {
	const local = await localAssets(io, input)
	const state = await readState(io, input.tag)
	return { local, state, plan: planAttach({ tag: input.tag, state, local, workflowSha: input.workflowSha, tagSha: input.tagSha }) }
}

export async function runPlan(io: AttachIO, input: RunInput): Promise<0 | 1> {
	const { plan } = await decide(io, input)
	if (plan.action === "refuse") return fail(io, plan.reason)
	io.output("action", plan.action)
	io.log(`${input.tag}: ${plan.action}`)
	return 0
}

/** The tag must name `sha` before anything is uploaded; a nightly's is created here first. */
async function pinTag(io: AttachIO, tag: string, sha: string, create: boolean): Promise<string | null> {
	if (create && (await io.createTagRef(tag, sha))) return null
	const named = await io.tagCommit(tag)
	if (named === null) return `${tag} does not exist`
	return named === sha ? null : `${tag} names ${named}, not ${sha}`
}

/** The release read back until `pending` no longer holds, or the reads run out. */
async function settled(io: AttachIO, id: number, pending: (release: ReleaseRecord) => boolean): Promise<ReleaseRecord> {
	let release = await io.release(id)
	for (let read = 1; read < READS && pending(release); read++) {
		await io.wait(2_000)
		release = await io.release(id)
	}
	return release
}

export async function runApply(io: AttachIO, input: RunInput, notes: string, target: string | null): Promise<0 | 1> {
	const { local, state, plan } = await decide(io, input)
	if (plan.action !== "publish")
		return fail(io, `the release changed since plan: ${plan.action === "refuse" ? plan.reason : plan.action}`)
	if (target !== null && target !== input.tagSha) return fail(io, `--target ${target} is not ${input.tagSha}`)
	const pinned = await pinTag(io, input.tag, input.tagSha, target !== null)
	if (pinned) return fail(io, pinned)

	const id = state.kind === "draft" ? state.id : await io.createDraft(input.tag, input.version.includes("-"))
	const names = new Set(local.map((a) => a.name))
	for (const asset of (await io.release(id)).assets) if (names.has(asset.name)) await io.deleteAsset(asset.id)
	for (const asset of local) await io.uploadAsset(id, asset.name, `${input.dir}/${asset.name}`)
	const draft = await settled(io, id, (r) => r.assets.some((a) => a.digest === null))
	if (draft.tag !== input.tag) return fail(io, `draft ${id} now belongs to ${draft.tag}, not ${input.tag}`)
	const filled = compareAssets(draft.assets, local)
	if (!filled.ok) return fail(io, `draft ${id} does not hold the built assets: ${filled.reason}`)

	await io.editRelease(id, { body: notes })
	await io.editRelease(id, { draft: false })
	return confirmPublished(io, input, id, local)
}

/** Another holder of contents: write can act between the check and the publish; this reports it, it cannot prevent it. */
async function confirmPublished(io: AttachIO, input: RunInput, id: number, local: LocalAsset[]): Promise<0 | 1> {
	const release = await settled(io, id, (r) => r.draft)
	const held = compareAssets(release.assets, local)
	if (!held.ok || release.draft || release.tag !== input.tag) {
		const change = !held.ok ? held.reason : release.draft ? "still a draft" : `it belongs to ${release.tag}`
		return fail(io, `release ${id} changed while it was published: ${change}`)
	}
	const named = await io.tagCommit(input.tag)
	if (named !== input.tagSha) return fail(io, `${input.tag} names ${named}, not ${input.tagSha}, after the publish`)
	io.log(`${input.tag}: published release ${id} with ${local.map((a) => a.name).join(", ")}`)
	return 0
}

export async function runVerifyPublished(io: AttachIO, input: RunInput, notes: string): Promise<0 | 1> {
	const { local, state, plan } = await decide(io, input)
	if (plan.action !== "use-published" || state.kind !== "published") {
		return fail(io, `the release changed since plan: ${plan.action === "refuse" ? plan.reason : plan.action}`)
	}
	const dir = `${input.dir}/published`
	for (const name of assetNames(input.version)) {
		const problem = await fetchVerified(io, input, state.assets, name, `${dir}/${name}`)
		if (problem) return fail(io, problem)
	}
	const sums = await checkShasums(io, input.version, dir)
	if (sums) return fail(io, sums)
	for (const asset of local) {
		const published = await io.sha256(`${dir}/${asset.name}`)
		if (published !== asset.sha256) io.log(`::warning::${asset.name}: this run rebuilt ${asset.sha256}; the release ships ${published}`)
	}
	await io.editRelease(state.id, { body: notes })
	io.output("dir", dir)
	io.log(`${input.tag}: shipping the published, attested assets from ${dir}`)
	return 0
}

/** Downloads one published asset and checks it against GitHub's digest and its attestation. */
async function fetchVerified(io: AttachIO, input: RunInput, assets: RemoteAsset[], name: string, path: string): Promise<string | null> {
	const asset = assets.find((a) => a.name === name)
	if (!asset?.digest) return `${input.tag}: ${name} has no digest`
	if (!(await io.attested(asset.digest.replace(/^sha256:/, "")))) {
		return `${input.tag} is not attested by this workflow; cut a new release to submit it to a store`
	}
	await io.downloadAsset(asset.id, path)
	if (`sha256:${await io.sha256(path)}` !== asset.digest) return `${name}: the download does not match ${asset.digest}`
	if (!(await io.verifyAttestation(path, input.tagSha))) return `${name}: its attestation does not verify for ${input.tagSha}`
	return null
}

/** The published SHASUMS256.txt must name exactly the two zips, with the downloaded bytes' hashes. */
async function checkShasums(io: AttachIO, version: string, dir: string): Promise<string | null> {
	const sums = parseShasums(await io.readText(`${dir}/SHASUMS256.txt`))
	const zips = assetNames(version).filter((name) => name.endsWith(".zip"))
	if (!sums || sums.size !== zips.length) return "SHASUMS256.txt does not list exactly the two zips"
	for (const zip of zips) {
		if (sums.get(zip) !== (await io.sha256(`${dir}/${zip}`))) return `SHASUMS256.txt does not match ${zip}`
	}
	return null
}

const SHA = /^[0-9a-f]{40}$/
const TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/

/** The run's inputs from the environment, refused unless every one has its exact shape. */
export function inputFromEnv(env: Record<string, string | undefined>): RunInput | string {
	const input = {
		tag: env.TAG ?? "",
		version: env.VERSION ?? "",
		workflowSha: env.GITHUB_SHA ?? "",
		tagSha: env.SHA ?? "",
		dir: "dist/release",
	}
	if (!TAG.test(input.tag) || input.version !== input.tag.slice(1)) return `TAG ${input.tag} and VERSION ${input.version} do not agree`
	if (!SHA.test(input.workflowSha) || !SHA.test(input.tagSha)) return "GITHUB_SHA and SHA must be commit ids"
	return input
}

function parseAsset(json: unknown): RemoteAsset {
	const a = json as { id?: unknown; name?: unknown; digest?: unknown; state?: unknown }
	if (typeof a?.id !== "number" || typeof a.name !== "string") throw new Error("unexpected release asset JSON")
	return { id: a.id, name: a.name, digest: a.state === "uploaded" && typeof a.digest === "string" ? a.digest : null }
}

/** A release from the REST API; a missing field throws rather than reading as a default. */
export function parseRelease(json: unknown): ReleaseRecord {
	const r = json as { id?: unknown; tag_name?: unknown; draft?: unknown; immutable?: unknown; assets?: unknown }
	if (typeof r?.id !== "number" || typeof r.tag_name !== "string" || typeof r.draft !== "boolean" || !Array.isArray(r.assets))
		throw new Error("unexpected release JSON")
	return { id: r.id, tag: r.tag_name, draft: r.draft, immutable: r.immutable === true, assets: r.assets.map(parseAsset) }
}

export async function main(argv: string[], env: Record<string, string | undefined>, io: AttachIO): Promise<0 | 1> {
	const input = inputFromEnv(env)
	if (typeof input === "string") return fail(io, input)
	const [command, ...args] = argv
	if (command === "plan") return runPlan(io, input)
	const notes = env.NOTES ? (await io.readText(env.NOTES)).replaceAll(SOURCE_COMMIT, input.tagSha) : ""
	if (!notes) return fail(io, "NOTES names no release body")
	if (command === "verify-published") return runVerifyPublished(io, input, notes)
	if (command === "apply" && args[0] === "--expect" && args[1] === "publish") {
		if (args.length === 2) return runApply(io, input, notes, null)
		if (args.length === 4 && args[2] === "--target") return runApply(io, input, notes, args[3])
	}
	return fail(io, `usage: plan | apply --expect publish [--target <sha>] | verify-published (got ${argv.join(" ")})`)
}

export function realIO(repo: string, token: string): AttachIO {
	const call = async (url: string, init: RequestInit = {}, accept = "application/vnd.github+json"): Promise<Response> => {
		const res = await fetch(url.startsWith("https://") ? url : `https://api.github.com/repos/${repo}/${url}`, {
			...init,
			headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", ...init.headers },
			redirect: "manual",
			signal: AbortSignal.timeout(300_000),
		})
		if (res.ok || res.status === 302 || res.status === 404 || res.status === 422) return res
		const detail = ((await res.json().catch(() => null)) as { message?: unknown } | null)?.message
		throw new Error(
			`${init.method ?? "GET"} ${url.split("?")[0]}: HTTP ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}`,
		)
	}
	const ok = async (url: string, init: RequestInit = {}): Promise<unknown> => {
		const res = await call(url, init)
		if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]}: HTTP ${res.status}`)
		return res.status === 204 ? null : res.json()
	}
	const send = (method: string, body: unknown): RequestInit => ({
		method,
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
	})
	return {
		async releasesFor(tag) {
			const found: ReleaseRecord[] = []
			for (let page = 1; ; page++) {
				const batch = (await ok(`releases?per_page=100&page=${page}`)) as { tag_name?: unknown }[]
				found.push(...batch.filter((r) => r.tag_name === tag).map(parseRelease))
				if (batch.length < 100) return found
			}
		},
		release: async (id) => parseRelease(await ok(`releases/${id}`)),
		async tagCommit(tag) {
			const res = await call(`git/ref/tags/${tag}`)
			if (res.status === 404) return null
			let object = ((await res.json()) as { object: { type: string; sha: string } }).object
			for (let hops = 0; object.type === "tag" && hops < 3; hops++) {
				object = ((await ok(`git/tags/${object.sha}`)) as { object: { type: string; sha: string } }).object
			}
			if (object.type !== "commit") throw new Error(`${tag} does not name a commit`)
			return object.sha
		},
		async createTagRef(tag, sha) {
			const res = await call("git/refs", send("POST", { ref: `refs/tags/${tag}`, sha }))
			if (res.status === 422) return false
			if (!res.ok) throw new Error(`POST git/refs: HTTP ${res.status}`)
			return true
		},
		async createDraft(tag, prerelease) {
			return ((await ok("releases", send("POST", { tag_name: tag, name: tag, draft: true, prerelease }))) as { id: number }).id
		},
		deleteAsset: async (id) => void (await ok(`releases/assets/${id}`, { method: "DELETE" })),
		async uploadAsset(releaseId, name, path) {
			const url = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`
			await ok(url, { method: "POST", body: Bun.file(path), headers: { "Content-Type": "application/octet-stream" } })
		},
		editRelease: async (id, patch) => void (await ok(`releases/${id}`, send("PATCH", patch))),
		async attested(sha256) {
			const res = await call(`attestations/sha256:${sha256}`)
			if (res.status === 404) return false
			return (((await res.json()) as { attestations?: unknown[] }).attestations ?? []).length > 0
		},
		async verifyAttestation(path, sourceDigest) {
			const { $ } = await import("bun")
			const workflow = `${repo}/.github/workflows/release.yml`
			const res =
				await $`gh attestation verify ${path} --repo ${repo} --signer-workflow ${workflow} --source-digest ${sourceDigest} --deny-self-hosted-runners`.nothrow()
			return res.exitCode === 0
		},
		async downloadAsset(id, path) {
			// The API answers with a redirect to signed storage, which refuses a second credential.
			const res = await call(`releases/assets/${id}`, {}, "application/octet-stream")
			const location = res.headers.get("location")
			const file = location ? await fetch(location, { signal: AbortSignal.timeout(300_000) }) : res
			if (!file.ok) throw new Error(`download of asset ${id}: HTTP ${file.status}`)
			mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true })
			await Bun.write(path, await file.arrayBuffer())
		},
		sha256: async (path) => new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex"),
		readText: (path) => Bun.file(path).text(),
		wait: (ms) => Bun.sleep(ms),
		output(key, value) {
			if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
		},
		log: (message) => console.log(message),
	}
}

if (import.meta.main) {
	const io = realIO(process.env.GITHUB_REPOSITORY ?? "", process.env.GH_TOKEN ?? "")
	try {
		process.exit(await main(process.argv.slice(2), process.env, io))
	} catch (e) {
		console.log(`::error::${e instanceof Error ? e.message : "unexpected failure"}`)
		process.exit(1)
	}
}
