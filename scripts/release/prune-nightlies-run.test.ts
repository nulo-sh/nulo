import { describe, expect, test } from "bun:test"
import { main, nextPage, type PruneIO } from "./prune-nightlies-run"

const nights = (count: number, start = 26200): string[] => Array.from({ length: count }, (_, i) => `v0.30.2-nightly.${start + i}`)

interface World {
	releases: Map<number, string>
	tags: Set<string>
	calls: string[]
	logs: string[]
	/** Overrides one call, keyed `<method> <target>`. */
	fail?: Record<string, () => unknown>
}

function world(tags: readonly string[]): World {
	return { releases: new Map(tags.map((tag, i) => [i + 1, tag])), tags: new Set(tags), calls: [], logs: [] }
}

function io(w: World): PruneIO {
	const record = <T>(key: string, act: () => T): T => {
		w.calls.push(key)
		const override = w.fail?.[key]
		return (override ? override() : act()) as T
	}
	return {
		releases: async () => [...w.releases].map(([id, tag]) => ({ id, tag })),
		tags: async () => [...w.tags],
		releaseTag: async (id) => record(`read release ${id}`, () => w.releases.get(id) ?? null),
		tagExists: async (tag) => record(`read tag ${tag}`, () => w.tags.has(tag)),
		deleteRelease: async (id) => record(`delete release ${id}`, () => void w.releases.delete(id)),
		deleteTag: async (tag) => record(`delete tag ${tag}`, () => void w.tags.delete(tag)),
		log: (message) => void w.logs.push(message),
	}
}

describe("prune-nightlies-run", () => {
	test("a dry run by default: it names what it would delete and deletes nothing", async () => {
		const w = world(nights(16))
		expect(await main([], io(w))).toBe(0)
		expect(w.calls).toEqual([])
		expect(w.logs.join("\n")).toContain("2 nightly name(s) past the newest 14: v0.30.2-nightly.26200, v0.30.2-nightly.26201")
		expect(w.releases.size).toBe(16)
	})

	test("--apply re-reads each release, deletes it, reads it back, then does the same for its tag", async () => {
		const tags = nights(15)
		const w = world(tags)
		expect(await main(["--apply"], io(w))).toBe(0)
		expect(w.calls).toEqual([
			"read release 1",
			"delete release 1",
			"read release 1",
			"read tag v0.30.2-nightly.26200",
			"delete tag v0.30.2-nightly.26200",
			"read tag v0.30.2-nightly.26200",
		])
		expect([...w.tags]).toEqual(tags.slice(1))
		expect([...w.releases.values()]).toEqual(tags.slice(1))
	})

	test("finishes a tag an interrupted run left without its release", async () => {
		const tags = nights(15)
		const w = world(tags)
		w.releases.delete(1)
		expect(await main(["--apply"], io(w))).toBe(0)
		expect(w.calls).toEqual(["read tag v0.30.2-nightly.26200", "delete tag v0.30.2-nightly.26200", "read tag v0.30.2-nightly.26200"])
	})

	test("stops at the first refusal and touches nothing after it", async () => {
		const w = world(nights(16))
		w.fail = {
			"delete tag v0.30.2-nightly.26200": () => {
				throw new Error("DELETE git/refs/tags/v0.30.2-nightly.26200: HTTP 422: Repository rule violations found")
			},
		}
		expect(await main(["--apply"], io(w))).toBe(1)
		expect(w.calls.at(-1)).toBe("delete tag v0.30.2-nightly.26200")
		expect(w.calls.some((call) => call.includes("26201"))).toBe(false)
		expect(w.logs.at(-1)).toStartWith("::error::prune stopped at v0.30.2-nightly.26200: DELETE git/refs/tags/")
	})

	test("refuses a release retagged after the listing, deleting nothing of it", async () => {
		const w = world(nights(15))
		w.fail = { "read release 1": () => "v0.30.2" }
		expect(await main(["--apply"], io(w))).toBe(1)
		expect(w.calls).toEqual(["read release 1"])
		expect(w.logs.at(-1)).toBe("::error::prune stopped at v0.30.2-nightly.26200: release 1 now holds v0.30.2")
	})

	test("fails when a deleted release or tag reads back", async () => {
		for (const key of ["delete release 1", "delete tag v0.30.2-nightly.26200"]) {
			const w = world(nights(15))
			w.fail = { [key]: () => undefined }
			expect(await main(["--apply"], io(w)), key).toBe(1)
			expect(w.logs.at(-1), key).toMatch(/still exists after its deletion$/)
		}
	})

	test("refuses an unknown argument before reading anything", async () => {
		const w = world(nights(15))
		expect(await main(["--aply"], io(w))).toBe(1)
		expect(w.calls).toEqual([])
		expect(w.releases.size).toBe(15)
	})
})

describe("nextPage", () => {
	test("follows rel=next on the API host only", () => {
		const next = "https://api.github.com/repositories/1/releases?per_page=100&page=2"
		expect(nextPage(`<${next}>; rel="next", <https://api.github.com/repositories/1/releases?page=9>; rel="last"`)).toBe(next)
		expect(nextPage('<https://api.github.com/repositories/1/releases?page=1>; rel="prev"')).toBeNull()
		expect(nextPage(null)).toBeNull()
		expect(() => nextPage('<https://example.com/steal?page=2>; rel="next"')).toThrow("outside https://api.github.com/")
	})
})
