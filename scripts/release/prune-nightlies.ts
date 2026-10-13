/**
 * Which nightly prereleases to delete: every `v<x.y.z>-nightly.<YYDDD>` name past the newest
 * {@link KEEP}, counted over releases and tags together. Pure; `prune-nightlies-run.ts` deletes.
 */

/** The only shape `nightly.yml`'s `resolve` cuts; a stable or rc tag can never match it. */
const NIGHTLY = /^v(\d+)\.(\d+)\.(\d+)-nightly\.(\d{5})$/

export const KEEP = 14

export interface ReleaseEntry {
	id: number
	/** A draft's too: it holds its name before the tag exists. */
	tag: string
}

export interface Doomed {
	tag: string
	/** Every release holding the name; none once an interrupted prune deleted them before the tag. */
	releaseIds: number[]
}

export const isNightlyTag = (tag: string): boolean => NIGHTLY.test(tag)

/** Date code first, as `resolve` cuts each one above every existing code; the version settles a tie. */
function age(tag: string): number[] {
	const [, major, minor, patch, code] = (NIGHTLY.exec(tag) as RegExpExecArray).map(Number)
	return [code, major, minor, patch]
}

function newestFirst(a: string, b: string): number {
	const [x, y] = [age(a), age(b)]
	const at = x.findIndex((part, i) => part !== y[i])
	return at === -1 ? 0 : y[at] - x[at]
}

/** The nightlies past the newest `keep`, oldest first. */
export function planPrune(releases: readonly ReleaseEntry[], tags: readonly string[], keep = KEEP): Doomed[] {
	const names = [...new Set([...releases.map((r) => r.tag), ...tags])].filter(isNightlyTag).sort(newestFirst)
	return names
		.slice(keep)
		.reverse()
		.map((tag) => ({ tag, releaseIds: releases.filter((r) => r.tag === tag).map((r) => r.id) }))
}
