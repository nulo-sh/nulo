import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { ratchetBase, readAtBase } from "./ratchet-base"

// `inline-guard-ban.test.ts` holds the tree to its reviewed baseline; this holds the baseline to its
// base, so a pull request cannot add an inline guard and its entry together. Every shape the ban
// finds has a helper form, so new code never needs an entry.

const BASELINE = "apps/extension/src/utils/inline-guard-ban.reviewed.json"

type Reviewed = Record<string, { text: string; why: string }[]>

/** Entries `head` holds more times than `base` does, by file and text; a reworded reason is no entry. */
function grown(base: Reviewed, head: Reviewed): string[] {
	const left = new Map<string, number>()
	for (const [file, entries] of Object.entries(base)) {
		for (const { text } of entries) left.set(`${file}  ${text}`, (left.get(`${file}  ${text}`) ?? 0) + 1)
	}
	return Object.entries(head).flatMap(([file, entries]) =>
		entries.flatMap(({ text }) => {
			const key = `${file}  ${text}`
			const count = left.get(key) ?? 0
			left.set(key, count - 1)
			return count > 0 ? [] : [key]
		}),
	)
}

describe("inline guard baseline ratchet", () => {
	const entry = { text: 'typeof x === "object" && x !== null', why: "pending" }

	test.each<[string, Reviewed, Reviewed, number]>([
		["a removed entry", { "a.ts": [entry, entry] }, { "a.ts": [entry] }, 0],
		["a reworded reason", { "a.ts": [entry] }, { "a.ts": [{ ...entry, why: "kept" }] }, 0],
		["an added entry", { "a.ts": [entry] }, { "a.ts": [entry], "b.ts": [entry] }, 1],
		["a duplicated entry", { "a.ts": [entry] }, { "a.ts": [entry, entry] }, 1],
		["an edited expression", { "a.ts": [entry] }, { "a.ts": [{ ...entry, text: `${entry.text} && y` }] }, 1],
	])("%s", (_case, base, head, count) => {
		expect(grown(base, head)).toHaveLength(count)
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
				grown(JSON.parse(read.text), head),
				`The inline guard baseline grew relative to ${base.label}: call the wallet-core helper instead of adding an entry`,
			).toEqual([])
		},
		{ timeout: 180_000 },
	)
})
