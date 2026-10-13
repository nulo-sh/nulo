import { describe, expect, test } from "bun:test"
import { isNightlyTag, KEEP, planPrune, type ReleaseEntry } from "./prune-nightlies"

const nights = (count: number, start = 26200, version = "0.30.2"): string[] =>
	Array.from({ length: count }, (_, i) => `v${version}-nightly.${start + i}`)
const released = (tags: readonly string[], from = 1): ReleaseEntry[] => tags.map((tag, i) => ({ id: from + i, tag }))

describe("planPrune", () => {
	test("keeps the newest fourteen and returns the rest oldest first, each with its release", () => {
		const tags = nights(20)
		const doomed = planPrune(released(tags), tags)
		expect(KEEP).toBe(14)
		expect(doomed).toEqual(tags.slice(0, 6).map((tag, i) => ({ tag, releaseIds: [i + 1] })))
	})

	test("selects nothing up to fourteen", () => {
		const tags = nights(KEEP)
		expect(planPrune(released(tags), tags)).toEqual([])
	})

	test("never selects or counts a stable, rc or near-nightly name, however old", () => {
		const others = [
			"v0.30.2",
			"v0.30.2-rc.1",
			"v1.0.0-nightly.2620",
			"v1.0.0-nightly.262001",
			"v1.0.0-nightly.26200.1",
			"v1.0.0-nightly.26200-x",
			"1.0.0-nightly.26200",
			"xv1.0.0-nightly.26200",
			"v1.0.0-Nightly.26200",
			"v1.0-nightly.26200",
			"untagged-0123456789abcdef",
		]
		const tags = [...others, ...nights(15, 26300)]
		const doomed = planPrune(released(tags), tags)
		expect(doomed.map((d) => d.tag)).toEqual(["v0.30.2-nightly.26300"])
		for (const name of others) expect(isNightlyTag(name), name).toBe(false)
	})

	test("orders across a year boundary by date code", () => {
		const tags = ["v0.30.2-nightly.25365", ...nights(KEEP, 26001)]
		expect(planPrune(released(tags), tags).map((d) => d.tag)).toEqual(["v0.30.2-nightly.25365"])
	})

	test("orders by date code before version, and by version within one code", () => {
		const across = [...nights(13, 26300), "v0.30.2-nightly.26295", "v0.31.0-nightly.26290"]
		expect(planPrune(released(across), across).map((d) => d.tag)).toEqual(["v0.31.0-nightly.26290"])
		const shared = [...nights(13, 26300, "0.31.0"), "v0.30.2-nightly.26290", "v0.31.0-nightly.26290"]
		expect(planPrune(released(shared), shared).map((d) => d.tag)).toEqual(["v0.30.2-nightly.26290"])
	})

	test("counts a draft by its name, and selects a tag whose release is gone and a release whose tag is gone", () => {
		const tags = nights(16)
		const [orphanTag, orphanRelease, ...rest] = tags
		// The newest nightly is a draft whose tag was never created: it is kept, and counts.
		const releases = released([orphanRelease, ...rest])
		const doomed = planPrune(
			releases,
			tags.filter((t) => t !== orphanRelease && t !== rest.at(-1)),
		)
		expect(doomed).toEqual([
			{ tag: orphanTag, releaseIds: [] },
			{ tag: orphanRelease, releaseIds: [1] },
		])
	})

	test("deletes every release that holds a doomed name", () => {
		const tags = nights(15)
		const doomed = planPrune([...released(tags), { id: 99, tag: tags[0] }], tags)
		expect(doomed).toEqual([{ tag: tags[0], releaseIds: [1, 99] }])
	})
})
