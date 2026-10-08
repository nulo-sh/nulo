import { describe, expect, test } from "bun:test"
import { assetNames } from "./attach-assets"
import { type AttachIO, inputFromEnv, main, parseRelease, type ReleaseRecord, type RunInput, SOURCE_COMMIT } from "./attach-assets-run"

const SHA = "a".repeat(40)
const OTHER = "b".repeat(40)
const NAMES = assetNames("1.2.3")
const BUILT: Record<string, string> = Object.fromEntries(NAMES.map((name, i) => [name, String(i + 1).repeat(64)]))
const ENV = { TAG: "v1.2.3", VERSION: "1.2.3", GITHUB_SHA: SHA, SHA, NOTES: "notes.md" }
const SHASUMS = `${BUILT[NAMES[0]]}  ${NAMES[0]}\n${BUILT[NAMES[1]]}  ${NAMES[1]}\n`

interface World {
	releases: (ReleaseRecord & { tag: string })[]
	tags: Map<string, string>
	/** Digests GitHub reports for an upload, when it differs from the bytes sent. */
	uploaded?: Record<string, string>
	/** Hashes of what a download writes, when it differs from GitHub's digest. */
	downloaded?: Record<string, string>
	/** Hashes of a rebuild, when it differs from the published bytes. */
	rebuilt?: Record<string, string>
	attested?: boolean
	verifies?: boolean
	shasums?: string
	/** The release body as the notes job wrote it; each publish records the body it set. */
	notes?: string
	bodies?: string[]
}

/** A recording fake of GitHub and the runner's disk; `calls` lists every write in order. */
function fake(world: World) {
	const calls: string[] = []
	const outputs: Record<string, string> = {}
	const logs: string[] = []
	let nextId = 100
	const find = (id: number) => {
		const release = world.releases.find((r) => r.id === id)
		if (!release) throw new Error(`no release ${id}`)
		return release
	}
	const fileHash = (path: string): string => {
		const name = path.slice(path.lastIndexOf("/") + 1)
		if (path.includes("/published/"))
			return world.downloaded?.[name] ?? world.releases[0].assets.find((a) => a.name === name)?.digest?.slice(7) ?? ""
		return world.rebuilt?.[name] ?? BUILT[name]
	}
	const io: AttachIO = {
		releasesFor: async (tag) => world.releases.filter((r) => r.tag === tag).map((r) => structuredClone(r)),
		release: async (id) => structuredClone(find(id)),
		tagCommit: async (tag) => world.tags.get(tag) ?? null,
		async createTagRef(tag, sha) {
			if (world.tags.has(tag)) return false
			calls.push(`tag ${tag} ${sha}`)
			world.tags.set(tag, sha)
			return true
		},
		async createDraft(tag) {
			calls.push("create")
			world.releases.push({ id: nextId, tag, draft: true, immutable: false, assets: [] })
			return nextId++
		},
		async deleteAsset(id) {
			calls.push(`delete ${id}`)
			for (const r of world.releases) r.assets = r.assets.filter((a) => a.id !== id)
		},
		async uploadAsset(releaseId, name) {
			calls.push(`upload ${name}`)
			find(releaseId).assets.push({ id: nextId++, name, digest: `sha256:${world.uploaded?.[name] ?? BUILT[name]}` })
		},
		async editRelease(id, patch) {
			calls.push(patch.draft === false ? "publish" : "notes")
			if (patch.body !== undefined) world.bodies?.push(patch.body)
			Object.assign(find(id), patch.draft === undefined ? {} : { draft: patch.draft })
		},
		attested: async () => world.attested ?? true,
		verifyAttestation: async () => world.verifies ?? true,
		async downloadAsset(id) {
			calls.push(`download ${id}`)
		},
		sha256: async (path) => fileHash(path),
		readText: async (path) => (path.endsWith("SHASUMS256.txt") ? (world.shasums ?? SHASUMS) : (world.notes ?? "notes")),
		wait: async () => {},
		output: (key, value) => {
			outputs[key] = value
		},
		log: (message) => logs.push(message),
	}
	return { io, calls, outputs, logs }
}

const run = (world: World, ...argv: string[]) => {
	const f = fake(world)
	return { ...f, exit: main(argv, ENV, f.io) }
}
const complete = (over: Partial<ReleaseRecord> = {}) => ({
	tag: "v1.2.3",
	id: 7,
	draft: false,
	immutable: true,
	assets: NAMES.map((name, i) => ({ id: i + 1, name, digest: `sha256:${BUILT[name]}` })),
	...over,
})

describe("plan", () => {
	test("writes the action for apply to expect", async () => {
		const { exit, outputs } = run({ releases: [], tags: new Map([["v1.2.3", SHA]]) }, "plan")
		expect(await exit).toBe(0)
		expect(outputs).toEqual({ action: "publish" })
	})

	test("exits 1 on a refusal", async () => {
		const { exit, outputs } = run({ releases: [complete(), complete({ id: 8 })], tags: new Map() }, "plan")
		expect(await exit).toBe(1)
		expect(outputs).toEqual({})
	})
})

describe("apply", () => {
	test("pins the tag, then creates, uploads, checks, writes the notes, publishes and checks again", async () => {
		const world: World = { releases: [], tags: new Map([["v1.2.3", SHA]]) }
		const { exit, calls } = run(world, "apply", "--expect", "publish")
		expect(await exit).toBe(0)
		expect(calls).toEqual(["create", ...NAMES.map((n) => `upload ${n}`), "notes", "publish"])
		expect(world.releases[0].draft).toBe(false)
	})

	test("writes the tagged commit into the notes' attestation check", async () => {
		const world: World = {
			releases: [],
			tags: new Map([["v1.2.3", SHA]]),
			notes: `--source-digest ${SOURCE_COMMIT} --deny`,
			bodies: [],
		}
		expect(await run(world, "apply", "--expect", "publish").exit).toBe(0)
		expect(world.bodies).toEqual([`--source-digest ${SHA} --deny`])
	})

	test("replaces what a failed run left on its draft", async () => {
		const leftover = { tag: "v1.2.3", id: 7, draft: true, immutable: false, assets: [{ id: 1, name: NAMES[0], digest: null }] }
		const { exit, calls } = run({ releases: [leftover], tags: new Map([["v1.2.3", SHA]]) }, "apply", "--expect", "publish")
		expect(await exit).toBe(0)
		expect(calls.slice(0, 2)).toEqual(["delete 1", `upload ${NAMES[0]}`])
	})

	test("never publishes a draft whose read-back differs from the build", async () => {
		const world: World = { releases: [], tags: new Map([["v1.2.3", SHA]]), uploaded: { [NAMES[1]]: "f".repeat(64) } }
		const { exit, calls } = run(world, "apply", "--expect", "publish")
		expect(await exit).toBe(1)
		expect(calls).not.toContain("publish")
		expect(calls).not.toContain("notes")
	})

	test("refuses when the release changed since plan", async () => {
		const { exit, calls } = run({ releases: [complete()], tags: new Map([["v1.2.3", SHA]]) }, "apply", "--expect", "publish")
		expect(await exit).toBe(1)
		expect(calls).toEqual([])
	})

	test("refuses a stable tag that names another commit before uploading anything", async () => {
		const { exit, calls, logs } = run({ releases: [], tags: new Map([["v1.2.3", OTHER]]) }, "apply", "--expect", "publish")
		expect(await exit).toBe(1)
		expect(calls).toEqual([])
		expect(logs.join("\n")).toContain(`names ${OTHER}`)
	})

	test("creates a nightly's tag at the target, continues on one already there, refuses one elsewhere", async () => {
		const created = run({ releases: [], tags: new Map() }, "apply", "--expect", "publish", "--target", SHA)
		expect(await created.exit).toBe(0)
		expect(created.calls[0]).toBe(`tag v1.2.3 ${SHA}`)

		const rerun = run({ releases: [], tags: new Map([["v1.2.3", SHA]]) }, "apply", "--expect", "publish", "--target", SHA)
		expect(await rerun.exit).toBe(0)

		const planted = run({ releases: [], tags: new Map([["v1.2.3", OTHER]]) }, "apply", "--expect", "publish", "--target", SHA)
		expect(await planted.exit).toBe(1)
		expect(planted.calls).toEqual([])
	})
})

describe("verify-published", () => {
	const published = (over: Partial<World> = {}): World => ({ releases: [complete()], tags: new Map([["v1.2.3", SHA]]), ...over })

	test("ships the published bytes once their digests, attestations and SHASUMS check out", async () => {
		const { exit, outputs, calls } = run(published(), "verify-published")
		expect(await exit).toBe(0)
		expect(outputs).toEqual({ dir: "dist/release/published" })
		expect(calls).toEqual(["download 1", "download 2", "download 3", "notes"])
	})

	test("refuses a release this workflow never attested", async () => {
		const { exit, logs } = run(published({ attested: false }), "verify-published")
		expect(await exit).toBe(1)
		expect(logs.join("\n")).toContain("not attested by this workflow; cut a new release")
	})

	test.each([
		["an attestation that does not verify", { verifies: false }, "does not verify"],
		["a download that does not match its digest", { downloaded: { [NAMES[0]]: "e".repeat(64) } }, "does not match"],
		[
			"a SHASUMS256.txt that does not match",
			{ shasums: `${"e".repeat(64)}  ${NAMES[0]}\n${BUILT[NAMES[1]]}  ${NAMES[1]}\n` },
			"SHASUMS256.txt",
		],
	])("refuses %s", async (_, over, reason) => {
		const { exit, outputs, logs } = run(published(over), "verify-published")
		expect(await exit).toBe(1)
		expect(outputs).toEqual({})
		expect(logs.join("\n")).toContain(reason)
	})

	test("passes a rebuild that differs, with a warning, and ships the published bytes", async () => {
		const { exit, outputs, logs } = run(published({ rebuilt: { [NAMES[0]]: "d".repeat(64) } }), "verify-published")
		expect(await exit).toBe(0)
		expect(outputs).toEqual({ dir: "dist/release/published" })
		expect(logs.some((l) => l.startsWith(`::warning::${NAMES[0]}`))).toBe(true)
	})
})

describe("inputs", () => {
	test("refuses a tag and version that disagree, and a commit that is not an id", () => {
		expect(typeof inputFromEnv({ ...ENV })).toBe("object")
		expect(inputFromEnv({ ...ENV, VERSION: "1.2.4" })).toBeTypeOf("string")
		expect(inputFromEnv({ ...ENV, SHA: "main" })).toBeTypeOf("string")
	})

	test("reads a release with every field, and refuses one without", () => {
		const json = { id: 1, draft: false, immutable: true, assets: [{ id: 2, name: "a.zip", state: "uploaded", digest: "sha256:00" }] }
		expect(parseRelease(json)).toEqual({
			id: 1,
			draft: false,
			immutable: true,
			assets: [{ id: 2, name: "a.zip", digest: "sha256:00" }],
		})
		expect(parseRelease({ ...json, assets: [{ ...json.assets[0], state: "starter" }] }).assets[0].digest).toBeNull()
		expect(() => parseRelease({ id: 1, assets: [] })).toThrow()
	})

	test("refuses an unknown command", async () => {
		expect(await run({ releases: [], tags: new Map() }, "apply", "--expect", "use-published").exit).toBe(1)
	})
})

export type { RunInput }
