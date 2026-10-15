/**
 * The decision core of publishing a release's assets. The GitHub Release is created as a draft,
 * filled, read back and only then published: once immutable releases is on, a published release
 * can never gain or replace an asset, so it must be complete and checked before it is public. A
 * published release is never uploaded to; a run that finds one ships its bytes instead.
 */

/** GitHub reports an asset digest as "sha256:<hex>", or null for assets uploaded before digests existed. */
export interface RemoteAsset {
	id: number
	name: string
	digest: string | null
}

export interface LocalAsset {
	name: string
	sha256: string
}

export type ReleaseState =
	| { kind: "absent" }
	| { kind: "ambiguous"; count: number }
	| { kind: "draft"; id: number; assets: RemoteAsset[] }
	| { kind: "published"; id: number; immutable: boolean; assets: RemoteAsset[] }

export interface PlanInput {
	tag: string
	state: ReleaseState
	local: LocalAsset[]
	/** The commit the workflow runs on (`GITHUB_SHA`), which the attestation records as its source. */
	workflowSha: string
	/** The commit the tag names (an annotated tag dereferenced), or the commit a nightly will tag. */
	tagSha: string
}

export type AttachPlan = { action: "publish"; createDraft: boolean } | { action: "use-published" } | { action: "refuse"; reason: string }

/** The three assets every release carries. */
export const assetNames = (version: string): string[] => [`nulo-chrome-${version}.zip`, `nulo-firefox-${version}.zip`, "SHASUMS256.txt"]

export function planAttach(input: PlanInput): AttachPlan {
	const { tag, state } = input
	switch (state.kind) {
		case "ambiguous":
			return { action: "refuse", reason: `${state.count} releases name ${tag}; delete the extra drafts, then run again` }
		case "published":
			return planPublished(tag, state, input.local)
		default:
			if (input.workflowSha !== input.tagSha) {
				return {
					action: "refuse",
					reason: `this run builds ${input.workflowSha}, but ${tag} names ${input.tagSha}: dispatch with --ref ${tag} so the attestation names the tagged commit`,
				}
			}
			return { action: "publish", createDraft: state.kind === "absent" }
	}
}

function planPublished(tag: string, state: Extract<ReleaseState, { kind: "published" }>, local: LocalAsset[]): AttachPlan {
	const present = new Set(state.assets.map((a) => a.name))
	const missing = local.map((a) => a.name).filter((name) => !present.has(name))
	if (missing.length === 0) return { action: "use-published" }
	const list = missing.join(", ")
	if (state.immutable) {
		return { action: "refuse", reason: `${tag} is published and immutable without ${list}: the version is burned, cut a new release` }
	}
	return {
		action: "refuse",
		reason: `${tag} is published without ${list}: delete the release (keep the tag), then dispatch with --ref ${tag} to publish it again`,
	}
}

/** Exact set equality on names and digests; an extra, missing, digest-less or different asset refuses. */
export function compareAssets(remote: RemoteAsset[], local: LocalAsset[]): { ok: true } | { ok: false; reason: string } {
	const expected = new Map(local.map((a) => [a.name, `sha256:${a.sha256}`]))
	const problems: string[] = []
	for (const asset of remote) {
		const want = expected.get(asset.name)
		if (want === undefined) problems.push(`unexpected ${asset.name}`)
		else if (asset.digest === null) problems.push(`${asset.name} has no digest`)
		else if (asset.digest !== want) problems.push(`${asset.name} is ${asset.digest}, built ${want}`)
	}
	const names = new Set(remote.map((a) => a.name))
	for (const name of expected.keys()) if (!names.has(name)) problems.push(`missing ${name}`)
	return problems.length ? { ok: false, reason: problems.join("; ") } : { ok: true }
}

/** `SHASUMS256.txt` as name → hex. Anything but `<64 hex>  <name>` lines, or a repeated name, refuses. */
export function parseShasums(text: string): Map<string, string> | null {
	const sums = new Map<string, string>()
	for (const line of text.split("\n")) {
		if (line === "") continue
		const match = /^([0-9a-f]{64}) [ *]([^/\s]+)$/.exec(line)
		if (!match || sums.has(match[2])) return null
		sums.set(match[2], match[1])
	}
	return sums
}
