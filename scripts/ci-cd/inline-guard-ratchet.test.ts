import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { ratchetBase, readAtBase } from "./ratchet-base"

// `inline-guard-ban.test.ts` holds the tree to its reviewed baseline; this holds the baseline to its
// base, so a pull request cannot add an inline guard and its entry together. Every shape the ban
// finds has a helper form, so new code never needs an entry; a kept site, whose contract no helper
// has, may still move with its file.

const BASELINE = "apps/extension/src/utils/inline-guard-ban.reviewed.json"

type Entry = { text: string; why: string }
type Reviewed = Record<string, Entry[]>

const isKept = (why: string) => !why.startsWith("pending")
const keyOf = (file: string, { text, why }: Entry) => `${isKept(why) ? "kept" : "pending"}  ${file}  ${text}`

function add(counts: Map<string, number>, key: string): void {
	counts.set(key, (counts.get(key) ?? 0) + 1)
}

/** Takes one `key` from the multiset, if it holds one. */
function take(counts: Map<string, number>, key: string): boolean {
	const count = counts.get(key) ?? 0
	if (count > 0) counts.set(key, count - 1)
	return count > 0
}

/** Entries `head` holds more times than `base` does, by file, text and kind: a reworded reason is
 *  no entry, a pending entry promoted to kept is one. A kept entry may reappear, with the same text,
 *  in another file only when its base file is gone (a rename): a site converted where it stands
 *  frees no exception for other code. */
function grown(base: Reviewed, head: Reviewed, isGone: (file: string) => boolean): string[] {
	const left = new Map<string, number>()
	for (const [file, entries] of Object.entries(base)) for (const entry of entries) add(left, keyOf(file, entry))
	const added = Object.entries(head).flatMap(([file, entries]) =>
		entries.filter((entry) => !take(left, keyOf(file, entry))).map((entry) => ({ file, ...entry })),
	)
	const moved = new Map<string, number>()
	for (const [file, entries] of Object.entries(base)) {
		if (!isGone(file)) continue
		for (const entry of entries) if (isKept(entry.why) && take(left, keyOf(file, entry))) add(moved, entry.text)
	}
	return added.filter(({ text, why }) => !(isKept(why) && take(moved, text))).map(({ file, text }) => `${file}  ${text}`)
}

describe("inline guard baseline ratchet", () => {
	const entry = { text: 'typeof x === "object" && x !== null', why: "pending" }
	const kept = { ...entry, why: "kept" }

	test.each<[string, Reviewed, Reviewed, number, string[]?]>([
		["a removed entry", { "a.ts": [entry, entry] }, { "a.ts": [entry] }, 0],
		[
			"a reworded reason",
			{ "a.ts": [entry, kept] },
			{
				"a.ts": [
					{ ...entry, why: "pending: x" },
					{ ...kept, why: "y" },
				],
			},
			0,
		],
		["a pending entry promoted to kept", { "a.ts": [entry] }, { "a.ts": [kept] }, 1],
		["an added entry", { "a.ts": [entry] }, { "a.ts": [entry], "b.ts": [entry] }, 1],
		["a duplicated entry", { "a.ts": [entry] }, { "a.ts": [entry, entry] }, 1],
		["an edited expression", { "a.ts": [entry] }, { "a.ts": [{ ...entry, text: `${entry.text} && y` }] }, 1],
		["a kept entry moved with its file", { "a.ts": [kept] }, { "b.ts": [kept] }, 0, ["a.ts"]],
		["a kept entry moved out of a file that stays", { "a.ts": [kept] }, { "b.ts": [kept] }, 1],
		["a pending entry moved with its file", { "a.ts": [entry] }, { "b.ts": [entry] }, 1, ["a.ts"]],
		["a kept entry copied", { "a.ts": [kept] }, { "a.ts": [kept], "b.ts": [kept] }, 1],
		["a pending entry moved as kept", { "a.ts": [entry] }, { "b.ts": [kept] }, 1, ["a.ts"]],
	])("%s", (_case, base, head, count, gone = []) => {
		expect(grown(base, head, (file) => gone.includes(file))).toHaveLength(count)
	})

	test(
		"the baseline never gains an entry relative to the PR base",
		() => {
			const base = ratchetBase()
			if (base === null) return
			const read = readAtBase(base, BASELINE)
			if ("predates" in read) {
				console.warn(`ratchet skipped — ${read.predates}`)
				return
			}
			if ("skipped" in read) {
				// Fail closed on a PR run: CI must always have its base to ratchet against.
				expect(process.env.GITHUB_ACTIONS === "true", read.skipped).toBe(false)
				console.warn(`ratchet skipped — ${read.skipped}`)
				return
			}
			const head: Reviewed = JSON.parse(readFileSync(BASELINE, "utf8"))
			expect(
				grown(JSON.parse(read.text), head, (file) => !existsSync(file)),
				`The inline guard baseline grew relative to ${base.label}: call the wallet-core helper instead of adding an entry`,
			).toEqual([])
		},
		{ timeout: 180_000 },
	)
})
