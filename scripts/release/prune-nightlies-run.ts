/**
 * Deletes the nightly prereleases `planPrune` selects, each release before its tag:
 *
 *   bun scripts/release/prune-nightlies-run.ts [--apply]
 *
 * Without `--apply` it prints the selection and deletes nothing. Each deletion re-reads its target
 * first and reads it back after, and the run stops at the first failure: a refusal (the tag ruleset,
 * an immutable release) is reported, never worked around, and the next run starts over from the
 * inventories. Environment: GITHUB_REPOSITORY, GH_TOKEN (contents: write).
 */

import { type Doomed, KEEP, planPrune, type ReleaseEntry } from "./prune-nightlies"
import { command } from "./workflow-command"

export interface PruneIO {
	/** Every release, drafts included. */
	releases(): Promise<ReleaseEntry[]>
	/** Every tag name under `refs/tags/v`. */
	tags(): Promise<string[]>
	/** The tag the release holds now; null once it is gone. */
	releaseTag(id: number): Promise<string | null>
	tagExists(tag: string): Promise<boolean>
	deleteRelease(id: number): Promise<void>
	deleteTag(tag: string): Promise<void>
	log(message: string): void
}

/** Why `doomed` could not be pruned; null once it is gone. */
async function prune(io: PruneIO, { tag, releaseIds }: Doomed): Promise<string | null> {
	for (const id of releaseIds) {
		const held = await io.releaseTag(id)
		if (held === null) continue
		// A release can be retagged after the listing; only the name read now decides.
		if (held !== tag) return `release ${id} now holds ${held}`
		await io.deleteRelease(id)
		if ((await io.releaseTag(id)) !== null) return `release ${id} still exists after its deletion`
	}
	if (!(await io.tagExists(tag))) return null
	await io.deleteTag(tag)
	return (await io.tagExists(tag)) ? `the tag still exists after its deletion` : null
}

export async function main(argv: readonly string[], io: PruneIO): Promise<0 | 1> {
	if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--apply")) {
		io.log(command("error", `usage: prune-nightlies-run.ts [--apply] (got ${argv.join(" ")})`))
		return 1
	}
	const [releases, tags] = await Promise.all([io.releases(), io.tags()])
	const doomed = planPrune(releases, tags)
	io.log(`${doomed.length} nightly name(s) past the newest ${KEEP}: ${doomed.map((d) => d.tag).join(", ") || "none"}`)
	if (argv[0] !== "--apply") {
		io.log("dry run: nothing deleted")
		return 0
	}
	for (const entry of doomed) {
		const failure = await prune(io, entry).catch((e: unknown) => (e instanceof Error ? e.message : "unexpected failure"))
		if (failure !== null) {
			io.log(command("error", `prune stopped at ${entry.tag}: ${failure}`))
			return 1
		}
		io.log(`deleted ${entry.tag}`)
	}
	return 0
}

const API = "https://api.github.com/"

/** The `rel="next"` page of a `Link` header; one on another host would carry the token there. */
export function nextPage(link: string | null): string | null {
	const next = link?.split(",").find((part) => /;\s*rel="next"/.test(part))
	const url = next?.match(/<([^>]+)>/)?.[1]
	if (url === undefined) return null
	if (!url.startsWith(API)) throw new Error(`a next page outside ${API}: ${url}`)
	return url
}

function parseEntry(json: unknown): ReleaseEntry {
	const r = json as { id?: unknown; tag_name?: unknown }
	if (typeof r?.id !== "number" || typeof r.tag_name !== "string") throw new Error("unexpected release JSON")
	return { id: r.id, tag: r.tag_name }
}

export function realPruneIO(repo: string, token: string): PruneIO {
	const call = (url: string, method = "GET"): Promise<Response> =>
		fetch(url.startsWith(API) ? url : `${API}repos/${repo}/${url}`, {
			method,
			headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
			redirect: "manual",
			signal: AbortSignal.timeout(60_000),
		})
	const refuse = async (res: Response, method: string, url: string): Promise<never> => {
		const detail = ((await res.json().catch(() => null)) as { message?: unknown } | null)?.message
		throw new Error(`${method} ${url.split("?")[0]}: HTTP ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}`)
	}
	const every = async <T>(first: string, parse: (item: unknown) => T): Promise<T[]> => {
		const found: T[] = []
		for (let url: string | null = first; url !== null; ) {
			const res = await call(url)
			if (!res.ok) await refuse(res, "GET", url)
			found.push(...((await res.json()) as unknown[]).map(parse))
			url = nextPage(res.headers.get("link"))
		}
		return found
	}
	/** 404 reads as gone; anything else but 200 throws. */
	const present = async (url: string): Promise<Response | null> => {
		const res = await call(url)
		if (res.status === 404) return null
		if (!res.ok) await refuse(res, "GET", url)
		return res
	}
	const remove = async (url: string): Promise<void> => {
		const res = await call(url, "DELETE")
		if (res.status !== 204) await refuse(res, "DELETE", url)
	}
	return {
		releases: () => every("releases?per_page=100", parseEntry),
		tags: () =>
			every("git/matching-refs/tags/v?per_page=100", (ref) => String((ref as { ref?: unknown }).ref).replace(/^refs\/tags\//, "")),
		async releaseTag(id) {
			const res = await present(`releases/${id}`)
			return res === null ? null : parseEntry(await res.json()).tag
		},
		tagExists: async (tag) => (await present(`git/ref/tags/${tag}`)) !== null,
		deleteRelease: (id) => remove(`releases/${id}`),
		deleteTag: (tag) => remove(`git/refs/tags/${tag}`),
		log: (message) => console.log(message),
	}
}

if (import.meta.main) {
	try {
		process.exit(await main(process.argv.slice(2), realPruneIO(process.env.GITHUB_REPOSITORY ?? "", process.env.GH_TOKEN ?? "")))
	} catch (e) {
		console.log(command("error", e instanceof Error ? e.message : "unexpected failure"))
		process.exit(1)
	}
}
